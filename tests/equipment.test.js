'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/catalog.js');
const E = require('../js/engine.js');
function customSection() {
  const s = C.ROD_SIZES[2], g = C.ROD_GRADES[2];
  return {grade: 'custom', size: 'custom', length: 0, diameter: s.diameter,
    couplingOd: s.couplingOd, massPerLength: s.massPerLength,
    yieldStrength: g.yield, tensileStrength: g.tensile,
    gradeName: 'Measured steel', sizeName: 'Measured rod'};
}
test('custom material and geometry affect resolved rod loads and stress limits', () => {
  const project = C.defaultProject();
  project.rods.sections = [customSection()];
  const result = E.analyze(project);
  assert.ok(result.ok);
  assert.equal(result.sections[0].grade.name, 'Measured steel');
  assert.equal(result.sections[0].size.name, 'Measured rod');
  const ratio = result.rods.maxLoadRatio;
  project.rods.sections[0].yieldStrength *= 0.5;
  const weaker = E.analyze(project);
  assert.ok(Math.abs(weaker.rods.maxLoadRatio - ratio * 2) < 1e-10);
});
test('invalid custom rod properties are rejected before calculations', () => {
  for (const patch of [{diameter: 0}, {massPerLength: -1}, {couplingOd: 0.001},
    {yieldStrength: Infinity}, {tensileStrength: 1}]) {
    const project = C.defaultProject();
    project.rods.sections = [Object.assign(customSection(), patch)];
    assert.equal(E.analyze(project).ok, false, JSON.stringify(patch));
  }
});
test('custom continuous rod uses body geometry and theoretical steel mass', () => {
  const project = C.defaultProject();
  project.rods.sections = [customSection()]; project.rods.couplingSpacing = 0;
  const result = E.analyze(project);
  assert.ok(result.ok);
  assert.equal(result.sections[0].couplingOd, project.rods.sections[0].diameter);
  assert.ok(result.sections[0].massPerLength < project.rods.sections[0].massPerLength);
});
