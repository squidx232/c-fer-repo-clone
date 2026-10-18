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
  for (const script of ['units', 'catalog', 'fluid', 'engine']) {
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
