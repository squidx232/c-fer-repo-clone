'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');
const F = require('../js/fluid.js');
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

// ------------------------------------------------------------------ annulus friction (Haaland)

test('turbulent annulus friction matches the Haaland (1983) explicit Colebrook-White approximation', () => {
  const Q = 0.02, rho = 900, mu = 0.001, tubingId = 0.1, rodOd = 0.03, roughness = 4.5e-5;
  const g = E.annulusGradient(Q, rho, mu, tubingId, rodOd, roughness);
  const ro = tubingId / 2, ri = rodOd / 2;
  const area = Math.PI * (ro * ro - ri * ri);
  const v = Q / area;
  const dh = 2 * (ro - ri);
  const re = rho * v * dh / mu;
  assert.ok(re > 2100, 'test setup should be turbulent');
  const relRough = roughness / dh;
  const inner = Math.pow(relRough / 3.7, 1.11) + 6.9 / re;
  const fD = Math.pow(-1.8 * Math.log10(inner), -2);
  const expected = fD * rho * v * v / (2 * dh);
  close(g.dpdl, expected, expected * 1e-9);
  assert.equal(g.regime, 'turbulent');
  close(g.re, re, re * 1e-9);
});

test('rougher tubing increases turbulent friction gradient; laminar flow is unaffected by roughness', () => {
  const Q = 0.02, rho = 900, mu = 0.001, tubingId = 0.1, rodOd = 0.03;
  const smooth = E.annulusGradient(Q, rho, mu, tubingId, rodOd, 1e-6);
  const rough = E.annulusGradient(Q, rho, mu, tubingId, rodOd, 5e-4);
  assert.ok(rough.dpdl > smooth.dpdl);
  const lamQ = 1e-5;
  const lamSmooth = E.annulusGradient(lamQ, rho, mu, tubingId, rodOd, 1e-6);
  const lamRough = E.annulusGradient(lamQ, rho, mu, tubingId, rodOd, 5e-4);
  assert.equal(lamSmooth.regime, 'laminar');
  close(lamSmooth.dpdl, lamRough.dpdl);
});

test('default roughness is used when project wellbore.tubingRoughness is absent', () => {
  const project = C.defaultProject();
  delete project.wellbore.tubingRoughness;
  const result = E.analyze(project);
  assert.ok(result.ok);
});

// ------------------------------------------------------------------ rod fatigue (modified Goodman)

test('fatigue ratio reduces to bending/endurance-limit for a pure-bending, zero-axial-and-torque node', () => {
  const project = C.defaultProject();
  project.wellbore.survey = [{ md: 0, inc: 0, azi: 0 }, { md: 100, inc: 30, azi: 0 }, { md: 2000, inc: 30, azi: 0 }];
  project.wellbore.pumpDepth = 1900;
  project.rods.couplingSpacing = 0; // continuous rod: side-load contact torque only from curvature, isolate bending
  const result = E.analyze(project);
  assert.ok(result.ok, JSON.stringify(result.errors));
  // Direct formula check against the documented Goodman combination for every node.
  result.nodes.forEach(n => {
    const sec = result.sections.find(s => s.index === n.rodSection);
    const tens = sec.tensileStrength;
    const end = tens <= 1400e6 ? 0.5 * tens : 700e6;
    const sigmaMeq = Math.sqrt(n.axialStress * n.axialStress + 3 * n.shearStress * n.shearStress);
    close(n.fatigueRatio, n.bendingStress / end + sigmaMeq / tens, 1e-9);
  });
});

test('higher dogleg severity increases maximum fatigue usage but not necessarily static yield ratio equally', () => {
  const low = C.defaultProject();
  const high = C.defaultProject();
  high.wellbore.survey = [{ md: 0, inc: 0, azi: 0 }, { md: 300, inc: 0, azi: 0 }, { md: 400, inc: 40, azi: 0 }, { md: 2000, inc: 40, azi: 0 }];
  const rLow = E.analyze(low), rHigh = E.analyze(high);
  assert.ok(rHigh.rods.maxFatigueRatio > rLow.rods.maxFatigueRatio);
});

test('weaker (lower tensile) rod grade raises fatigue usage for the same loads', () => {
  const project = C.defaultProject();
  const baseline = E.analyze(project);
  const customGradeProject = C.defaultProject();
  customGradeProject.rods.sections.forEach(s => { s.grade = 'custom'; s.yieldStrength = 400e6; s.tensileStrength = 600e6; });
  const weaker = E.analyze(customGradeProject);
  assert.ok(weaker.ok);
  assert.ok(weaker.rods.maxFatigueRatio > baseline.rods.maxFatigueRatio);
});

// ------------------------------------------------------------------ free-gas screening

test('free-gas screening is inactive unless both producedGOR and bubblePointPressure are positive', () => {
  assert.equal(F.freeGasFraction({ producedGOR: 0, bubblePointPressure: 5e6 }, 3e6, 320).active, false);
  assert.equal(F.freeGasFraction({ producedGOR: 50, bubblePointPressure: 0 }, 3e6, 320).active, false);
});

test('no free gas above the bubble point; solution GOR equals produced GOR', () => {
  const r = F.freeGasFraction({ producedGOR: 50, bubblePointPressure: 5e6, gasGravity: 0.7 }, 6e6, 320);
  assert.equal(r.active, true);
  close(r.fraction, 0);
  close(r.solutionGor, 50);
});

test('free gas fraction increases as intake pressure drops below bubble point', () => {
  const prod = { producedGOR: 80, bubblePointPressure: 8e6, gasGravity: 0.7, waterCut: 0.2 };
  const high = F.freeGasFraction(prod, 7e6, 330);
  const low = F.freeGasFraction(prod, 2e6, 330);
  assert.ok(low.fraction > high.fraction);
  assert.ok(low.solutionGor < prod.producedGOR);
  assert.ok(low.fraction > 0 && low.fraction < 1);
});

test('solution GOR ratio follows the Standing (1947) power law Rs/Rsb = (P/Pb)^(1/1.2048)', () => {
  const prod = { producedGOR: 100, bubblePointPressure: 10e6, gasGravity: 0.65 };
  const p = 4e6;
  const r = F.freeGasFraction(prod, p, 310);
  close(r.solutionGor, 100 * Math.pow(p / 10e6, 1 / 1.2048), 1e-9);
});

test('free-gas screening propagates into engine.analyze pump output and triggers a warning above 10%', () => {
  const project = C.defaultProject();
  project.production.producedGOR = 150;
  project.production.bubblePointPressure = 9e6;
  project.production.gasGravity = 0.7;
  project.production.intakeMode = 'intakePressure';
  project.production.intakePressure = 1.5e6;
  const result = E.analyze(project);
  assert.ok(result.ok);
  assert.equal(result.pump.freeGasActive, true);
  assert.ok(result.pump.freeGasFraction > 0);
  if (result.pump.freeGasFraction > 0.1) {
    assert.ok(result.warnings.some(w => /free gas/i.test(w)));
  }
});

test('free-gas screening stays inactive by default (backward compatible with existing projects)', () => {
  const project = C.defaultProject();
  const result = E.analyze(project);
  assert.ok(result.ok);
  assert.equal(result.pump.freeGasActive, false);
  assert.equal(result.pump.freeGasFraction, 0);
});
