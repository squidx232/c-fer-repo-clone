'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');
const U = require('../js/units.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('minimum curvature: vertical well TVD equals MD', () => {
  const t = E.trajectory([{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }]);
  close(t[1].tvd, 1000, 1e-9);
  close(t[1].vs, 0, 1e-9);
});

test('minimum curvature: constant 90° build radius', () => {
  // 0→90° over arc length L: radius R = L/(π/2); TVD = R, departure = R
  const L = 300;
  const t = E.trajectory([{ md: 0, inc: 0, azi: 0 }, { md: L, inc: 90, azi: 0 }]);
  const R = L / (Math.PI / 2);
  close(t[1].tvd, R, 1e-6);
  close(t[1].north, R, 1e-6);
  close(t[1].dls, (Math.PI / 2) / L, 1e-9);
});

test('slant hold section geometry', () => {
  const t = E.trajectory([{ md: 0, inc: 30, azi: 90 }, { md: 100, inc: 30, azi: 90 }]);
  close(t[1].tvd, 100 * Math.cos(Math.PI / 6), 1e-9);
  close(t[1].east, 50, 1e-9);
});

test('nodes interpolate and hit pump depth exactly', () => {
  const nodes = E.buildNodes(C.SURVEY_PRESETS.jtype, 1234.5, 5);
  assert.equal(nodes[0].md, 0);
  close(nodes[nodes.length - 1].md, 1234.5, 1e-9);
  // TVD must be consistent with station-based trajectory at a station depth
  const tv = E.tvdAt(C.SURVEY_PRESETS.jtype, 800);
  const t = E.trajectory(C.SURVEY_PRESETS.jtype).find((s) => s.md === 800);
  close(tv, t.tvd, 0.05);
});

test('fluid mixture density', () => {
  const f = E.fluidProps({ oilApi: 10, waterCut: 0.5, waterSg: 1.0, viscosity: 0.1 });
  close(f.oilSg, 1.0, 1e-9);
  close(f.density, 999, 1e-6);
});

test('laminar annulus gradient matches Hagen–Poiseuille limit for a pipe', () => {
  const mu = 0.1, Q = 1e-4, D = 0.062;
  const g = E.annulusGradient(Q, 900, mu, D, 0);
  const hp = 128 * mu * Q / (Math.PI * Math.pow(D, 4));
  close(g.dpdl, hp, hp * 1e-6);
  assert.equal(g.regime, 'laminar');
});

test('pump flow: no slip at zero ΔP, slip grows with ΔP and drops with viscosity', () => {
  const p = C.byId(C.PUMPS, 'PC-30-1500');
  const f0 = E.pumpFlow(p, 100, 0, 0.001);
  close(f0.actual * 86400, 30, 1e-9);
  const fr = E.pumpFlow(p, 100, E.ratedPressure(p), 0.001);
  close(fr.slip * 86400, 18, 1e-9);
  const fv = E.pumpFlow(p, 100, E.ratedPressure(p), 0.1);
  assert.ok(fv.slip < fr.slip);
});

test('pump hydraulic torque q·ΔP/2π', () => {
  const p = C.byId(C.PUMPS, 'PC-20-1200');
  const t = E.pumpTorque(p, 10e6);
  close(t.hydraulic, E.displacementPerRev(p) * 10e6 / (2 * Math.PI), 1e-9);
});

test('vertical well, static: axial load = thrust + buoyed rod weight, no side load', () => {
  const pr = C.defaultProject();
  pr.wellbore.survey = C.clone(C.SURVEY_PRESETS.vertical);
  pr.wellbore.pumpDepth = 1000;
  pr.rods.sections = [{ grade: 'D', size: '1', length: 0 }];
  const r = E.analyze(pr);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const size = C.byId(C.ROD_SIZES, '1');
  const w = size.massPerLength * 9.80665 * (1 - r.fluid.density / 7850) * 1000;
  close(r.surface.axialLoad, r.pump.thrust + w, 1e-6 * w);
  close(r.rods.maxSideLoad, 0, 1e-6);
  // Torque at surface = pump torque + viscous torque (no contact)
  close(r.surface.torque, r.pump.torque + r.surface.viscousTorque, 1e-6);
});

test('operating point is self-consistent', () => {
  const pr = C.defaultProject();
  const r = E.analyze(pr);
  assert.ok(r.ok);
  const f = E.pumpFlow(pr.pump, pr.speed, r.pump.differentialPressure, r.fluid.viscosity);
  close(f.actual, r.pump.rate, 1e-9);
  close(r.pump.dischargePressure - r.pump.intakePressure, r.pump.differentialPressure, 1);
  assert.ok(r.rods.maxSideLoad > 0, 'deviated well must show side loads');
  assert.ok(r.surface.contactTorque > 0);
});

test('higher speed gives more flow and solveSpeedForRate inverts it', () => {
  const pr = C.defaultProject();
  const a = E.analyze(pr, { speed: 150 }), b = E.analyze(pr, { speed: 300 });
  assert.ok(b.pump.rate > a.pump.rate);
  const target = 50 / 86400;
  const n = E.solveSpeedForRate(pr, target, 600);
  assert.ok(n > 0);
  close(E.analyze(pr, { speed: n }).pump.rate, target, target * 0.002);
});

test('overloaded rod string is reported as an error', () => {
  const pr = C.defaultProject();
  pr.rods.sections = [{ grade: 'C', size: '3/4', length: 0 }];
  pr.pump = Object.assign({}, C.byId(C.PUMPS, 'PC-150-600'));
  pr.production.fluidLevel = 1100;
  pr.speed = 400;
  const r = E.analyze(pr);
  assert.ok(r.errors.some((e) => /overloaded|torque|power/i.test(e)));
});

test('unit conversions round-trip', () => {
  close(U.fromDisplay(U.toDisplay(12345, 'pressure', 'imperial'), 'pressure', 'imperial'), 12345, 1e-9);
  close(U.toDisplay(0.3048, 'length', 'imperial'), 1, 1e-12);
  close(U.toDisplay(0.158987295 / 86400, 'flow', 'imperial'), 1, 1e-12);
});
