'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('rated friction fraction uses rated pressure, not current pressure', () => {
  const pump = Object.assign({}, C.PUMPS[4], {frictionModel: 'ratedFraction', frictionFraction: 0.3});
  const expected = 0.3 * E.displacementPerRev(pump) * E.ratedPressure(pump) / (2 * Math.PI);
  for (const pressure of [0, E.ratedPressure(pump) / 2, E.ratedPressure(pump) * 2]) {
    const result = E.pumpTorque(pump, pressure);
    close(result.friction, expected);
    close(result.total, result.hydraulic + expected);
  }
});

test('manual capacity categories and boundary conventions are explicit', () => {
  for (const [capacity, category, minFraction, maxFraction] of [
    [0.399, 'small', 0.2, 0.5], [0.4, 'medium', 0.15, 0.25],
    [0.8, 'medium', 0.15, 0.25], [0.801, 'large', 0.05, 0.2]
  ]) {
    assert.deepEqual(E.frictionGuidance({displacement: capacity * 100 / 86400}), {category, minFraction, maxFraction});
  }
});

test('legacy specified torque and explicit zero remain unchanged', () => {
  const pump = Object.assign({}, C.PUMPS[4]);
  close(E.pumpTorque(pump, 1e6).friction, pump.frictionTorque);
  pump.frictionModel = 'ratedFraction'; pump.frictionFraction = 0;
  assert.equal(E.pumpTorque(pump, 1e6).friction, 0);
});

test('invalid torque settings are rejected before analysis', () => {
  for (const patch of [
    {frictionModel: 'unknown'}, {frictionTorque: -1}, {frictionTorque: Infinity},
    {frictionModel: 'ratedFraction'}, {frictionModel: 'ratedFraction', frictionFraction: -1},
    {frictionModel: 'ratedFraction', frictionFraction: NaN},
    {frictionModel: 'ratedFraction', frictionFraction: '0.3'}
  ]) {
    const project = C.defaultProject(); Object.assign(project.pump, patch);
    assert.equal(E.analyze(project).ok, false, JSON.stringify(patch));
  }
});

test('friction propagates through rod torque, drive power, curves and warnings', () => {
  const project = C.defaultProject();
  const original = E.analyze(project);
  const ratedTorque = E.displacementPerRev(project.pump) * E.ratedPressure(project.pump) / (2 * Math.PI);
  project.pump.frictionModel = 'ratedFraction';
  project.pump.frictionFraction = project.pump.frictionTorque / ratedTorque;
  const same = E.analyze(project);
  close(same.surface.torque, original.surface.torque);
  close(same.pump.rate, original.pump.rate);
  project.pump.frictionFraction = 0;
  const noFriction = E.analyze(project);
  close(same.surface.torque - noFriction.surface.torque, original.pump.frictionTorque);
  close(same.surface.motorPower - noFriction.surface.motorPower,
    original.pump.frictionTorque * project.speed * 2 * Math.PI / 60 / project.drive.efficiency);
  const curve = E.pumpCurves(project.pump, 0.1, [100], 5)[0];
  assert.equal(curve.points[0].torque, 0);
  assert.ok(noFriction.warnings.some(w => /outside the manual guidance/.test(w)));
  assert.ok(noFriction.warnings.some(w => /elastomer swell/.test(w)));
});
