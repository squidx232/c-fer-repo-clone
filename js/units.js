/*
 * Unit system definitions.
 * All engineering values are stored internally in SI base units:
 *   length m, pressure Pa, force N, torque N·m, flow m³/s, viscosity Pa·s,
 *   density kg/m³, power W, stress Pa, mass-per-length kg/m, dogleg rad/m.
 * Each quantity defines a display unit for the "metric" and "imperial" systems
 * with a multiplicative factor: SI = display * factor.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCPUnits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEG = Math.PI / 180;

  var QUANTITIES = {
    length:      { metric: { u: 'm',        f: 1 },             imperial: { u: 'ft',        f: 0.3048 } },
    diameter:    { metric: { u: 'mm',       f: 0.001 },         imperial: { u: 'in',        f: 0.0254 } },
    pressure:    { metric: { u: 'kPa',      f: 1000 },          imperial: { u: 'psi',       f: 6894.757293 } },
    force:       { metric: { u: 'kN',       f: 1000 },          imperial: { u: 'lbf',       f: 4.448221615 } },
    sideLoad:    { metric: { u: 'N',        f: 1 },             imperial: { u: 'lbf',       f: 4.448221615 } },
    torque:      { metric: { u: 'N·m',      f: 1 },             imperial: { u: 'ft·lbf',    f: 1.355817948 } },
    flow:        { metric: { u: 'm³/d',     f: 1 / 86400 },     imperial: { u: 'bbl/d',     f: 0.158987295 / 86400 } },
    displacement:{ metric: { u: 'm³/d/100rpm', f: 1 / 86400 },  imperial: { u: 'bbl/d/100rpm', f: 0.158987295 / 86400 } },
    viscosity:   { metric: { u: 'cP',       f: 0.001 },         imperial: { u: 'cP',        f: 0.001 } },
    density:     { metric: { u: 'kg/m³',    f: 1 },             imperial: { u: 'lb/ft³',    f: 16.01846337 } },
    power:       { metric: { u: 'kW',       f: 1000 },          imperial: { u: 'hp',        f: 745.6998716 } },
    stress:      { metric: { u: 'MPa',      f: 1e6 },           imperial: { u: 'ksi',       f: 6.894757293e6 } },
    massLength:  { metric: { u: 'kg/m',     f: 1 },             imperial: { u: 'lb/ft',     f: 1.488163944 } },
    dogleg:      { metric: { u: '°/30m',    f: DEG / 30 },      imperial: { u: '°/100ft',   f: DEG / 30.48 } },
    head:        { metric: { u: 'm',        f: 1 },             imperial: { u: 'ft',        f: 0.3048 } },
    angle:       { metric: { u: '°',        f: 1 },             imperial: { u: '°',         f: 1 } },
    speed:       { metric: { u: 'rpm',      f: 1 },             imperial: { u: 'rpm',       f: 1 } },
    percent:     { metric: { u: '%',        f: 0.01 },          imperial: { u: '%',         f: 0.01 } },
    turns:       { metric: { u: 'rev',      f: 1 },             imperial: { u: 'rev',       f: 1 } },
    none:        { metric: { u: '',         f: 1 },             imperial: { u: '',          f: 1 } }
  };

  function def(quantity, system) {
    var q = QUANTITIES[quantity];
    if (!q) throw new Error('Unknown quantity: ' + quantity);
    return q[system] || q.metric;
  }

  /** Convert an SI value to the display unit of the given system. */
  function toDisplay(value, quantity, system) {
    if (value === null || value === undefined || !isFinite(value)) return value;
    return value / def(quantity, system).f;
  }

  /** Convert a display value to SI. */
  function fromDisplay(value, quantity, system) {
    if (value === null || value === undefined || !isFinite(value)) return value;
    return value * def(quantity, system).f;
  }

  function unit(quantity, system) {
    return def(quantity, system).u;
  }

  /** Format a number with a sensible number of significant digits. */
  function fmtNumber(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (digits !== undefined) return Number(v).toFixed(digits);
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 10000) return v.toFixed(0);
    if (a >= 100) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.01) return v.toFixed(3);
    return v.toPrecision(3);
  }

  function format(value, quantity, system, digits, withUnit) {
    var s = fmtNumber(toDisplay(value, quantity, system), digits);
    if (withUnit === false) return s;
    var u = unit(quantity, system);
    return u ? s + ' ' + u : s;
  }

  return {
    QUANTITIES: QUANTITIES,
    toDisplay: toDisplay,
    fromDisplay: fromDisplay,
    unit: unit,
    format: format,
    fmtNumber: fmtNumber
  };
});
