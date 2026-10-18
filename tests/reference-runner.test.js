'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluate, readNumericPath} = require('../scripts/check-reference-cases.js');
const C = require('../js/catalog.js');
const E = require('../js/engine.js');
// These are harness unit tests with synthetic data, NOT independent vendor cases.
function synthetic(expected) {
  return {id: 'synthetic-harness-test-only', source: 'captured-reference',
    provenance: {applicationVersion: 'synthetic', captureDescription: 'unit test; not a vendor run'},
    project: C.defaultProject(), expectations: [{path: 'speed', expected, absoluteTolerance: 1}]};
}
test('reference comparator applies absolute and relative tolerances at the boundary', () => {
  assert.equal(evaluate(synthetic(201)).passed, true);
  assert.equal(evaluate(synthetic(201.1)).passed, false);
  const c = synthetic(210);
  c.expectations[0].relativeTolerance = 0.05;
  assert.equal(evaluate(c).passed, true);
});
test('reference comparator rejects absent evidence, invalid tolerances and unknown outputs', () => {
  for (const change of [c => {c.source = 'guessed';}, c => {c.expectations = [];},
    c => {delete c.provenance;}, c => {c.expectations[0].expected = null;},
    c => {c.expectations[0].relativeTolerance = -1;}, c => {c.expectations[0].path = 'unknown';}]) {
    const c = synthetic(200); change(c); assert.throws(() => evaluate(c));
  }
  assert.throws(() => readNumericPath({}, '__proto__.x'));
});
test('multiple output checks report each discrepancy without concealing design warnings', () => {
  const c = synthetic(200);
  const torque = E.analyze(c.project).surface.torque;
  c.expectations.push({path: 'surface.torque', expected: torque + 100, absoluteTolerance: 1});
  const report = evaluate(c);
  assert.equal(report.passed, false);
  assert.equal(report.checks[0].passed, true);
  assert.equal(report.checks[1].passed, false);
  assert.ok(Array.isArray(report.designWarnings));
});
