'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/fluid.js');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');
const U = require('../js/units.js');
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('six captured original-engine helper outputs match the SI implementation', () => {
  const reference = require('./fixtures/original-engine-viscosity.json');
  for (const v of reference.deadOil) close(F.deadOilViscosity(v.temperatureC + 273.15, v.api).viscosity, v.originalCp / 1000);
  for (const v of reference.liveOil) close(F.liveOilViscosity(v.deadOilCp / 1000, v.solutionGor).viscosity, v.originalCp / 1000);
});

test('absolute temperatures convert with offsets and round-trip', () => {
  close(U.toDisplay(273.15, 'temperature', 'metric'), 0);
  close(U.toDisplay(273.15, 'temperature', 'imperial'), 32);
  close(U.fromDisplay(212, 'temperature', 'imperial'), 373.15);
  for (const system of ['metric', 'imperial']) {
    for (const t of [260, 300, 373.15, 450]) close(U.fromDisplay(U.toDisplay(t, 'temperature', system), 'temperature', system), t);
  }
});

test('dead oil viscosity matches independent Beggs–Robinson numeric vectors', () => {
  const evidence = require('./fixtures/fluid-evidence.json');
  for (const vector of evidence.dead_oil_vectors) {
    const result = F.deadOilViscosity(vector.temperatureC + 273.15, vector.api);
    close(result.viscosity, vector.viscosityPaS);
    assert.deepEqual(result.warnings, []);
  }
});

test('live oil viscosity uses dead oil viscosity, not temperature, as its first input', () => {
  close(F.liveOilViscosity(0.1, 100).viscosity, 0.0057463330033170655);
  close(F.liveOilViscosity(0.1, 300).viscosity, 0.001635455177745318);
  // The published fitted coefficients do not yield an exact identity at Rs=0.
  close(F.liveOilViscosity(0.1, 0).viscosity, 0.10008312844686983);
  assert.equal(F.liveOilViscosity(0.1, 400).warnings.length, 1);
});

test('correlation ranges generate warnings rather than silent extrapolation', () => {
  assert.equal(F.deadOilViscosity(333.15, 10).warnings.length, 1);
  assert.equal(F.deadOilViscosity(450, 30).warnings.length, 1);
  assert.equal(F.deadOilViscosity(450, 10).warnings.length, 2);
});

test('linear mixture has correct endpoints and convex weighting', () => {
  close(F.linearMixtureViscosity(0.1, 0.001, 0), 0.1);
  close(F.linearMixtureViscosity(0.1, 0.001, 1), 0.001);
  close(F.linearMixtureViscosity(0.1, 0.001, 0.3), 0.0703);
});

test('invalid inputs are rejected without infinite outputs', () => {
  for (const t of [NaN, Infinity, -1, 200]) assert.throws(() => F.deadOilViscosity(t, 30));
  for (const api of [NaN, Infinity, -132]) assert.throws(() => F.deadOilViscosity(333, api));
  for (const rs of [-1, NaN, Infinity]) assert.throws(() => F.liveOilViscosity(0.1, rs));
  for (const wc of [-1, 2, NaN]) assert.throws(() => F.linearMixtureViscosity(0.1, 0.001, wc));
});

test('legacy projects preserve viscosity and calculations; new model propagates', () => {
  const project = C.defaultProject();
  const original = E.analyze(project);
  delete project.production.viscosityModel;
  close(E.analyze(project).pump.rate, original.pump.rate);
  assert.equal(E.fluidProps(project.production).viscosity, 0.5);
  Object.assign(project.production, {viscosityModel: 'beggsRobinson', fluidTemperature: 333.15, oilApi: 30, waterCut: 0.3});
  const result = E.analyze(project);
  assert.ok(result.ok);
  close(result.fluid.viscosity, 0.006083740371956796 * 0.7 + 0.001 * 0.3);
  assert.notEqual(result.pump.rate, original.pump.rate);
  assert.ok(result.warnings.some(w => /uniform-temperature/.test(w)));
  project.production.fluidTemperature = -1;
  assert.equal(E.analyze(project).ok, false);
});
