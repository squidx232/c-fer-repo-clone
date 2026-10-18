'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function pump(model = 'linear') {
  return Object.assign({}, C.PUMPS[4], {
    performanceModel: model, referenceSpeed: 100, referenceViscosity: 0.001,
    viscosityExponent: 0.33, efficiencyAtZero: 0.9, efficiencyAtRated: 0.4
  });
}

test('documented static-trace fixtures match independent analytic values', () => {
  const evidence = require('./fixtures/performance-evidence.json');
  for (const vector of evidence.vectors) {
    const p = pump(vector.model);
    const result = E.pumpFlow(p, vector.speed, E.ratedPressure(p) * vector.pressureRatio, vector.viscosity);
    close(result.actual / result.theoretical, vector.expectedEfficiency);
  }
});

test('linear reference curve hits both efficiency endpoints', () => {
  const p = pump();
  for (const [pressureFraction, efficiency] of [[0, 0.9], [0.5, 0.65], [1, 0.4]]) {
    const r = E.pumpFlow(p, 100, E.ratedPressure(p) * pressureFraction, 0.001);
    close(r.actual / r.theoretical, efficiency);
  }
});

test('quadratic curve uses squared pressure ratio', () => {
  const p = pump('quadratic');
  const r = E.pumpFlow(p, 100, E.ratedPressure(p) / 2, 0.001);
  close(r.actual / r.theoretical, 0.775);
});

test('slip is independent of speed before production reaches zero', () => {
  const p = pump();
  const a = E.pumpFlow(p, 100, E.ratedPressure(p), 0.001);
  const b = E.pumpFlow(p, 200, E.ratedPressure(p), 0.001);
  close(a.slip, b.slip);
  close(b.actual / b.theoretical, 0.7);
});

test('viscosity correction supports configurable reference, exponent and zero exponent', () => {
  const p = pump();
  const a = E.pumpFlow(p, 100, E.ratedPressure(p), 0.001);
  const b = E.pumpFlow(p, 100, E.ratedPressure(p), 0.1);
  close(b.slip / a.slip, Math.pow(0.01, 0.33));
  p.referenceViscosity = 0.1;
  close(E.pumpFlow(p, 100, E.ratedPressure(p), 0.1).slip, a.slip);
  p.viscosityExponent = 0;
  close(E.pumpFlow(p, 100, E.ratedPressure(p), 0.3).slip, a.slip);
});

test('missing new fields preserve legacy sqrt correction exactly', () => {
  const p = C.PUMPS[4];
  const r = E.pumpFlow(p, 200, E.ratedPressure(p) * 0.7, 0.5);
  close(r.slip, p.slipAtRated * 0.7 * Math.sqrt(0.001 / 0.5));
});

test('constant efficiency mode stays constant across speed, pressure and viscosity', () => {
  const p = pump('constant');
  for (const speed of [1, 100, 400]) {
    for (const pressure of [0, E.ratedPressure(p) * 2]) {
      for (const viscosity of [0.001, 0.5]) {
        const r = E.pumpFlow(p, speed, pressure, viscosity);
        close(r.actual / r.theoretical, 0.4);
      }
    }
  }
});

test('slip never produces negative actual flow even beyond the pressure rating', () => {
  const p = pump('quadratic');
  const r = E.pumpFlow(p, 10, E.ratedPressure(p) * 3, 0.001);
  assert.equal(r.actual, 0);
  close(r.slip, r.theoretical);
});

test('invalid imported performance settings fail analysis instead of returning NaN', () => {
  for (const patch of [{referenceSpeed: 0}, {referenceViscosity: 0}, {viscosityExponent: NaN},
    {viscosityExponent: 2}, {efficiencyAtRated: 1.1}, {efficiencyAtZero: 0.1}, {performanceModel: 'unknown'}]) {
    const project = C.defaultProject();
    project.pump = Object.assign(pump(), patch);
    const result = E.analyze(project);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.ok(result.errors.length);
  }
});

test('coupled solver, pump curves and speed solver use the selected model', () => {
  const project = C.defaultProject();
  project.pump = pump('quadratic');
  const result = E.analyze(project);
  assert.ok(result.ok);
  close(result.pump.rate, E.pumpFlow(project.pump, project.speed,
    result.pump.differentialPressure, result.fluid.viscosity).actual);
  const curves = E.pumpCurves(project.pump, 0.001, [100], 5);
  const point = curves[0].points[2];
  close(point.rate, E.pumpFlow(project.pump, 100, point.dP, 0.001).actual);
  const speed = E.solveSpeedForRate(project, 50 / 86400, 600);
  assert.ok(speed > 0);
  close(E.analyze(project, {speed}).pump.rate * 86400, 50, 0.005);
});
