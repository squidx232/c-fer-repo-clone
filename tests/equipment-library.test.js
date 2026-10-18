'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/equipment-library.js');
const C = require('../js/catalog.js');
const E = require('../js/engine.js');
function sample() {
  return {schemaVersion: 1, units: 'SI', provenance: {source: 'synthetic unit-test catalog, not manufacturer data'},
    pumps: [Object.assign({}, C.PUMPS[0], {id: 'import-pump'})],
    drives: [Object.assign({}, C.DRIVES[0], {id: 'import-drive'})],
    rodGrades: [Object.assign({}, C.ROD_GRADES[2], {id: 'import-grade'})],
    rodSizes: [Object.assign({}, C.ROD_SIZES[2], {id: 'import-size'})]};
}
test('portable catalog imports all four kinds and is usable by the calculation engine', () => {
  const project = C.defaultProject();
  project.equipmentLibrary = L.merge(project, sample());
  assert.equal(L.list(project, 'pumps').length, C.PUMPS.length + 1);
  project.rods.sections = [{grade: 'import-grade', size: 'import-size', length: 0}];
  const result = E.analyze(project);
  assert.ok(result.ok);
  assert.equal(result.sections[0].grade.id, 'import-grade');
  assert.equal(project.equipmentLibrary.imports.length, 1);
});
test('invalid imports reject before mutating project or dropping existing records', () => {
  const project = C.defaultProject();
  project.equipmentLibrary = L.merge(project, sample());
  const before = JSON.stringify(project);
  for (const alter of [c => {c.units = 'imperial';}, c => {c.provenance = {};},
    c => {c.drives[0].efficiency = 2;}, c => {c.pumps[0].slipAtRated = -1;},
    c => {c.rodGrades[0].yield = Infinity;}, c => {c.rodSizes[0].couplingOd = 0.001;},
    c => {c.pumps[0].id = 'PC-4-2000';}]) {
    const catalog = sample(); alter(catalog);
    assert.throws(() => L.merge(project, catalog));
    assert.equal(JSON.stringify(project), before);
  }
  assert.throws(() => L.merge(project, sample()), /already exists/);
});
test('catalog rejects empty and duplicate entries and strips unrecognized fields', () => {
  assert.throws(() => L.validate({schemaVersion: 1, units: 'SI', provenance: {source: 'test'}}));
  const data = sample(); data.pumps.push(data.pumps[0]); assert.throws(() => L.validate(data));
  const good = sample(); good.pumps[0].untrustedAsset = '<script>';
  assert.equal(L.validate(good).pumps[0].untrustedAsset, undefined);
});
