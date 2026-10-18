/* Portable, explicit-SI equipment catalogs. Not a decoder for vendor equipment.db. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./catalog.js'));
  else root.PCPEquipment = factory(root.PCPCatalog);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var definitions = {
    pumps: ['displacement', 'ratedLift', 'rotorDiameter', 'maxSpeed'],
    drives: ['maxTorque', 'maxPower', 'maxSpeed', 'maxAxialLoad', 'efficiency'],
    rodGrades: ['yield', 'tensile'],
    rodSizes: ['diameter', 'couplingOd', 'massPerLength']
  };
  var defaults = {pumps: C.PUMPS, drives: C.DRIVES, rodGrades: C.ROD_GRADES, rodSizes: C.ROD_SIZES};
  function number(v) { return typeof v === 'number' && isFinite(v); }
  function validate(document) {
    if (!document || document.schemaVersion !== 1 || document.units !== 'SI') throw new Error('Catalog requires schemaVersion 1 and units SI.');
    if (!document.provenance || typeof document.provenance.source !== 'string' || !document.provenance.source.trim()) throw new Error('Catalog source provenance is required.');
    var result = {schemaVersion: 1, units: 'SI', provenance: {source: document.provenance.source}};
    var count = 0;
    Object.keys(definitions).forEach(function (kind) {
      var entries = document[kind] || [];
      if (!Array.isArray(entries) || entries.length > 5000) throw new Error('Invalid catalog list: ' + kind);
      var ids = Object.create(null);
      result[kind] = entries.map(function (entry) {
        if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(entry.id) || entry.id === 'custom' || ids[entry.id] || C.byId(defaults[kind], entry.id)) throw new Error('Duplicate, reserved or invalid ID in ' + kind);
        ids[entry.id] = true;
        if (typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('Equipment name is required.');
        definitions[kind].forEach(function (field) {
          if (!number(entry[field]) || entry[field] <= 0) throw new Error(kind + ': positive finite ' + field + ' required.');
        });
        var item = {id: entry.id, name: entry.name};
        definitions[kind].forEach(function (field) { item[field] = entry[field]; });
        if (kind === 'pumps') {
          ['eccentricity', 'frictionTorque', 'slipAtRated'].forEach(function (field) {
            if (!number(entry[field]) || entry[field] < 0) throw new Error('Pump requires nonnegative ' + field);
            item[field] = entry[field];
          });
          item.modelId = item.id;
        }
        if (kind === 'drives') {
          if (entry.efficiency > 1) throw new Error('Drive efficiency must be a fraction <= 1.');
          item.modelId = item.id;
        }
        if (kind === 'rodGrades' && entry.tensile < entry.yield) throw new Error('Tensile strength must be >= yield.');
        if (kind === 'rodSizes' && entry.couplingOd < entry.diameter) throw new Error('Coupling diameter must be >= body diameter.');
        count++;
        return item;
      });
    });
    if (!count) throw new Error('Catalog contains no supported equipment.');
    return result;
  }
  function list(project, kind) {
    return defaults[kind].concat((project.equipmentLibrary || {})[kind] || []);
  }
  function merge(project, document) {
    var incoming = validate(document), library = project.equipmentLibrary || {}, merged = {};
    Object.keys(definitions).forEach(function (kind) {
      var existing = library[kind] || [];
      incoming[kind].forEach(function (item) {
        if (C.byId(existing, item.id)) throw new Error('Catalog ID already exists in project: ' + item.id);
      });
      merged[kind] = existing.concat(incoming[kind]);
    });
    merged.imports = (library.imports || []).concat([{source: incoming.provenance.source, importedAt: new Date().toISOString()}]);
    return merged; // no partial mutations when any record fails
  }
  return {validate: validate, merge: merge, list: list};
});
