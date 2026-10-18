'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');

function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://localhost', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, errors = [], charts = [];
  w.addEventListener('error', e => errors.push(e.message));
  for (const script of ['units', 'catalog', 'equipment-library', 'fluid', 'engine']) {
    w.eval(fs.readFileSync(path.join(root, 'js', script + '.js'), 'utf8'));
  }
  // Rendering is tested separately in a real browser; here assert chart data wiring.
  w.PCPChart = {draw: (canvas, config) => {
    assert.ok(canvas);
    charts.push(config);
    for (const series of config.series || []) {
      for (const point of series.points) assert.ok(point.every(Number.isFinite));
    }
  }};
  w.eval(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {dom, w, errors, charts};
}

function change(w, label, value) {
  const input = w.document.querySelector(`[aria-label="${label}"]`);
  assert.ok(input, label);
  input.value = String(value);
  input.dispatchEvent(new w.Event('change', {bubbles: true}));
}

test('all tabs, model changes, units and stored project preserve performance settings', () => {
  const {dom, w, errors, charts} = boot();
  try {
    for (const button of w.document.querySelectorAll('#tabs button[data-tab]')) button.click();
    w.PCPApp.activate('pump');
    change(w, 'Performance model', 'quadratic');
    assert.equal(w.PCPApp.state.project.pump.viscosityExponent, 0.33);
    change(w, 'Efficiency at zero differential pressure', 95);
    change(w, 'Efficiency at rated differential pressure', 50);
    assert.equal(w.PCPApp.state.project.pump.efficiencyAtRated, 0.5);
    assert.ok(w.PCPApp.state.result.ok);
    change(w, 'Slip viscosity exponent', 0);
    const unit = w.document.querySelector('#unitSystem');
    unit.value = 'imperial'; unit.dispatchEvent(new w.Event('change'));
    assert.equal(w.PCPApp.state.project.pump.viscosityExponent, 0);
    const saved = JSON.parse(w.localStorage.getItem('pcp-designer-project-v1'));
    w.PCPApp.loadProject(saved);
    assert.equal(w.PCPApp.state.project.pump.performanceModel, 'quadratic');
    assert.ok(Math.abs(w.PCPApp.state.project.pump.efficiencyAtZero - 0.95) < 1e-12);
    assert.equal(w.PCPApp.state.project.pump.viscosityExponent, 0);
    w.PCPApp.activate('curves'); w.PCPApp.activate('sweep');
    assert.ok(charts.length > 10);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('fluid correlation controls preserve Kelvin through unit changes and save/load', () => {
  const {dom, w, errors} = boot();
  try {
    w.PCPApp.activate('production');
    change(w, 'Viscosity model', 'beggsRobinson');
    change(w, 'Oil gravity', 30);
    change(w, 'Uniform fluid temperature', 80);
    assert.ok(Math.abs(w.PCPApp.state.project.production.fluidTemperature - 353.15) < 1e-10);
    const viscosity = w.PCPApp.state.result.fluid.viscosity;
    const unit = w.document.querySelector('#unitSystem');
    unit.value = 'imperial'; unit.dispatchEvent(new w.Event('change'));
    assert.ok(Math.abs(Number(w.document.querySelector('[aria-label="Uniform fluid temperature"]').value) - 176) < 1e-6);
    assert.equal(w.PCPApp.state.result.fluid.viscosity, viscosity);
    w.PCPApp.loadProject(JSON.parse(w.localStorage.getItem('pcp-designer-project-v1')));
    assert.equal(w.PCPApp.state.project.production.viscosityModel, 'beggsRobinson');
    assert.equal(w.PCPApp.state.result.fluid.viscosity, viscosity);
    w.PCPApp.activate('curves');
    w.PCPApp.activate('results');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('friction estimator preserves initial torque and survives units, save/load and reports', () => {
  const {dom, w, errors} = boot();
  try {
    w.PCPApp.activate('pump');
    const original = w.PCPApp.state.result.pump.frictionTorque;
    change(w, 'Pump friction model', 'ratedFraction');
    assert.ok(Math.abs(w.PCPApp.state.result.pump.frictionTorque - original) < 1e-8);
    change(w, 'Friction fraction of rated hydraulic torque', 30);
    const value = w.PCPApp.state.result.pump.frictionTorque;
    const units = w.document.querySelector('#unitSystem');
    units.value = 'imperial'; units.dispatchEvent(new w.Event('change'));
    assert.equal(w.PCPApp.state.result.pump.frictionTorque, value);
    w.PCPApp.loadProject(JSON.parse(w.localStorage.getItem('pcp-designer-project-v1')));
    assert.equal(w.PCPApp.state.project.pump.frictionFraction, 0.3);
    let report = '';
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    w.open = () => ({document: {write: html => {report = html;}, close: () => {}}});
    w.document.querySelector('#btnReport').click();
    assert.match(report, /ratedFraction/);
    assert.match(report, /30.0%/);
    change(w, 'Pump friction model', 'specified');
    assert.equal(w.PCPApp.state.result.pump.frictionTorque, original);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('custom equipment libraries and rod properties persist with unit conversion', () => {
  const {dom, w, errors} = boot();
  try {
    const save = label => [...w.document.querySelectorAll('button')].find(b => b.textContent === label).click();
    w.PCPApp.activate('pump');
    change(w, 'Pump model / manufacturer name', 'My measured pump');
    save('Save pump to project library');
    const pumpId = w.PCPApp.state.project.pump.modelId;
    change(w, 'Pump model', 'PC-20-1200');
    change(w, 'Pump model', pumpId);
    assert.equal(w.PCPApp.state.project.pump.name, 'My measured pump');
    w.PCPApp.activate('drive');
    change(w, 'Drive model / manufacturer name', 'My drive');
    save('Save drive to project library');
    assert.equal(w.PCPApp.state.project.equipmentLibrary.drives.length, 1);
    w.PCPApp.activate('rods');
    let selects = w.document.querySelectorAll('#tab-rods table select');
    selects[0].value = 'custom'; selects[0].dispatchEvent(new w.Event('change'));
    selects = w.document.querySelectorAll('#tab-rods table select');
    selects[1].value = 'custom'; selects[1].dispatchEvent(new w.Event('change'));
    change(w, 'Section 1 yield strength', 900);
    change(w, 'Section 1 tensile strength', 1000);
    change(w, 'Section 1 body diameter', 26);
    const unit = w.document.querySelector('#unitSystem');
    unit.value = 'imperial'; unit.dispatchEvent(new w.Event('change'));
    const saved = JSON.parse(w.localStorage.getItem('pcp-designer-project-v1'));
    w.PCPApp.loadProject(saved);
    assert.equal(w.PCPApp.state.project.rods.sections[0].yieldStrength, 900e6);
    assert.ok(Math.abs(w.PCPApp.state.project.rods.sections[0].diameter - 0.026) < 1e-12);
    assert.equal(w.PCPApp.state.project.equipmentLibrary.pumps[0].name, 'My measured pump');
    assert.ok(w.PCPApp.state.result.ok);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('catalog screen imports authorized SI specs, rejects duplicates and persists imported rod choices', () => {
  const {dom, w, errors} = boot();
  try {
    w.PCPApp.activate('equipment');
    const catalog = {schemaVersion: 1, units: 'SI', provenance: {source: 'synthetic UI test export'},
      rodGrades: [Object.assign({}, w.PCPCatalog.ROD_GRADES[2], {id: 'supplier-grade'})],
      rodSizes: [Object.assign({}, w.PCPCatalog.ROD_SIZES[2], {id: 'supplier-size'})]};
    const perform = () => {
      w.document.querySelector('[aria-label="Equipment catalog JSON"]').value = JSON.stringify(catalog);
      [...w.document.querySelectorAll('#tab-equipment button')].find(b => b.textContent === 'Import catalog').click();
    };
    perform();
    assert.equal(w.PCPApp.state.project.equipmentLibrary.rodGrades.length, 1);
    perform();
    assert.match(w.document.querySelector('#tab-equipment [role="status"]').textContent, /already exists/);
    w.PCPApp.activate('rods');
    const select = (index, value) => {
      const field = w.document.querySelectorAll('#tab-rods table select')[index];
      field.value = value; field.dispatchEvent(new w.Event('change'));
    };
    select(0, 'supplier-grade'); select(1, 'supplier-size');
    assert.ok(w.PCPApp.state.result.ok);
    assert.equal(w.PCPApp.state.result.sections[0].grade.id, 'supplier-grade');
    w.PCPApp.loadProject(JSON.parse(w.localStorage.getItem('pcp-designer-project-v1')));
    assert.equal(w.PCPApp.state.result.sections[0].size.id, 'supplier-size');
    w.PCPApp.activate('coverage');
    assert.match(w.document.querySelector('#tab-coverage').textContent, /Not executed/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('legacy projects retain results and new settings survive report generation', () => {
  const {dom, w, errors} = boot();
  try {
    const initial = w.PCPApp.state.result.pump.rate;
    w.PCPApp.loadProject(w.PCPCatalog.defaultProject());
    assert.equal(w.PCPApp.state.result.pump.rate, initial);
    w.PCPApp.activate('pump');
    change(w, 'Performance model', 'linear');
    let report = '';
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    w.open = () => ({document: {write: html => {report = html;}, close: () => {}}});
    w.document.querySelector('#btnReport').click();
    assert.match(report, /Performance model/);
    assert.match(report, /linear/);
    assert.match(report, /0.33/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
