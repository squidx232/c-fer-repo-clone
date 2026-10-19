'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');

function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://localhost:8080', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  const errors = [], captured = [];
  w.addEventListener('error', event => errors.push(event.message));
  for (const name of ['units', 'catalog', 'equipment-library', 'fluid', 'engine'])
    w.eval(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'));
  w.PCPChart = {draw: (canvas, config) => { canvas._chartCfg = config; }};
  w.HTMLCanvasElement.prototype.toDataURL = function () {
    assert.ok(this._chartCfg, this.id + ' rendered before capture');
    captured.push(this.id);
    return 'data:image/png;base64,AAAA';
  };
  w.eval(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {dom, w, errors, captured};
}

const ids = ['chVs', 'chPlan', 'chDls', 'chLoad', 'chTorque', 'chAxial', 'chSide', 'chPress', 'chStress',
  'chQ', 'chT', 'chEff', 'swQ', 'swT', 'swP', 'swL'];

test('Sno-P portrait report includes every curve, readable sections, escaped metadata and local logo', () => {
  const {dom, w, errors, captured} = boot();
  try {
    w.PCPApp.state.project.meta.name = '<img src=x onerror=alert(1)>';
    w.PCPApp.activate('sweep');
    w.document.documentElement.setAttribute('data-theme', 'dark');
    let report = '';
    w.open = () => ({document: {write: html => {report = html;}, close: () => {}}});
    w.document.querySelector('#btnReport').click();
    const parsed = new JSDOM(report);
    try {
      const doc = parsed.window.document;
      assert.match(doc.title, /Sno-P/);
      assert.match(report, /@page\{size:A4 portrait/);
      assert.equal(doc.querySelectorAll('figure[data-chart]').length, 16);
      assert.equal(doc.querySelectorAll('figure img').length, 16);
      assert.equal(doc.querySelectorAll('section.curve-section').length, 4);
      assert.deepEqual(captured, ids);
      assert.equal(doc.querySelector('h1').textContent, '<img src=x onerror=alert(1)>');
      assert.equal(doc.querySelectorAll('[onerror]').length, 0);
      assert.equal(doc.querySelector('.report-header img').src, 'http://localhost:8080/assets/sno-p-logo.png');
      assert.match(doc.body.textContent, /Complete vendor simulation parity has not been established/);
      assert.match(doc.body.textContent, /Motor power vs speed/);
      assert.match(doc.body.textContent, /Rod stress/);
    } finally { parsed.window.close(); }
    assert.equal(w.PCPApp.state.tab, 'sweep');
    assert.equal(w.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(w.document.body.classList.contains('report-render'), false);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('capture failure restores theme and tab and closes unusable report', () => {
  const {dom, w, errors} = boot();
  try {
    w.PCPApp.activate('curves');
    w.document.documentElement.setAttribute('data-theme', 'dark');
    let closed = false, message = '';
    w.open = () => ({close: () => {closed = true;}});
    w.alert = text => {message = text;};
    w.HTMLCanvasElement.prototype.toDataURL = () => {throw new Error('capture unavailable');};
    w.document.querySelector('#btnReport').click();
    assert.equal(closed, true);
    assert.match(message, /capture unavailable/);
    assert.equal(w.PCPApp.state.tab, 'curves');
    assert.equal(w.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(w.document.body.classList.contains('report-render'), false);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('blocked popup leaves current screen untouched', () => {
  const {dom, w, captured} = boot();
  try {
    let message = '';
    w.open = () => null;
    w.alert = text => {message = text;};
    w.document.querySelector('#btnReport').click();
    assert.match(message, /allow pop-ups/);
    assert.equal(captured.length, 0);
    assert.equal(w.document.body.classList.contains('report-render'), false);
    assert.equal(w.document.querySelector('.brand span').textContent, 'Sno-P');
  } finally { dom.window.close(); }
});
