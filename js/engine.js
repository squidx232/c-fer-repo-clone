/*
 * PCP design / analysis engine (SI units throughout).
 *
 * Models:
 *  - Wellbore trajectory: minimum curvature method.
 *  - Fluid: dead-oil / water mixture (no free gas), Newtonian viscosity.
 *  - Tubing/rod annulus hydraulics: concentric annulus, laminar (exact) or turbulent (Blasius).
 *  - Pump: Q = q·N − slip. Legacy rated-slip, reference-speed linear/quadratic
 *    efficiency curves, or constant efficiency; configurable viscosity power law.
 *  - Pump torque: hydraulic (q·ΔP/2π) + elastomer friction.
 *  - Rod string: soft-string model integrated from pump to surface giving axial load,
 *    rod/tubing contact (side) load, mechanical friction torque, viscous (Couette) torque,
 *    combined von Mises stress (axial + bending + torsion), stretch and torsional wind-up.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./catalog.js'), require('./fluid.js'));
  else root.PCPEngine = factory(root.PCPCatalog, root.PCPFluid);
})(typeof self !== 'undefined' ? self : this, function (Catalog, Fluid) {
  'use strict';

  var G = 9.80665;
  var RHO_WATER = 999.0;
  var RHO_STEEL = 7850;
  var E_STEEL = 206.8e9;
  var G_STEEL = 79.3e9;
  var DEG = Math.PI / 180;
  var MU_REF = 0.001; // Pa·s, reference viscosity for slip (water)

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function wrapDeg(d) { return ((d % 360) + 540) % 360 - 180; }

  // ---------------------------------------------------------------- trajectory

  function normalizeSurvey(survey) {
    var s = (survey || [])
      .filter(function (p) { return p && isFinite(p.md) && isFinite(p.inc) && isFinite(p.azi); })
      .map(function (p) { return { md: +p.md, inc: clamp(+p.inc, 0, 180), azi: ((+p.azi % 360) + 360) % 360 }; })
      .sort(function (a, b) { return a.md - b.md; });
    // remove duplicate MDs
    s = s.filter(function (p, i) { return i === 0 || p.md > s[i - 1].md + 1e-9; });
    if (!s.length || s[0].md > 0) s.unshift({ md: 0, inc: 0, azi: s.length ? s[0].azi : 0 });
    return s;
  }

  /** Minimum-curvature step between two stations (angles in degrees). */
  function mcStep(a, b) {
    var i1 = a.inc * DEG, i2 = b.inc * DEG, a1 = a.azi * DEG, a2 = b.azi * DEG;
    var dmd = b.md - a.md;
    var cosDl = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
    var dl = Math.acos(clamp(cosDl, -1, 1));
    var rf = dl > 1e-9 ? (2 / dl) * Math.tan(dl / 2) : 1;
    return {
      dN: dmd / 2 * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * rf,
      dE: dmd / 2 * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * rf,
      dV: dmd / 2 * (Math.cos(i1) + Math.cos(i2)) * rf,
      dogleg: dl,
      dls: dmd > 0 ? dl / dmd : 0
    };
  }

  /** Inclination/azimuth at an arbitrary MD (linear interpolation, azimuth wrap-aware). */
  function attitudeAt(survey, md) {
    if (md <= survey[0].md) return { inc: survey[0].inc, azi: survey[0].azi };
    for (var i = 1; i < survey.length; i++) {
      var a = survey[i - 1], b = survey[i];
      if (md <= b.md) {
        var t = (md - a.md) / (b.md - a.md);
        return { inc: a.inc + t * (b.inc - a.inc), azi: ((a.azi + t * wrapDeg(b.azi - a.azi)) + 360) % 360 };
      }
    }
    var last = survey[survey.length - 1];
    return { inc: last.inc, azi: last.azi };
  }

  /** Compute full trajectory at the survey stations. */
  function trajectory(survey) {
    var s = normalizeSurvey(survey);
    var out = [];
    var n = 0, e = 0, v = 0;
    for (var i = 0; i < s.length; i++) {
      var st = { md: s[i].md, inc: s[i].inc, azi: s[i].azi, tvd: 0, north: 0, east: 0, dls: 0 };
      if (i > 0) {
        var d = mcStep(s[i - 1], s[i]);
        n += d.dN; e += d.dE; v += d.dV; st.dls = d.dls;
      }
      st.tvd = v; st.north = n; st.east = e;
      st.vs = Math.sqrt(n * n + e * e);
      out.push(st);
    }
    return out;
  }

  /** Build calculation nodes from surface to `maxMd` with a given step, including survey stations. */
  function buildNodes(survey, maxMd, step) {
    var s = normalizeSurvey(survey);
    step = step > 0 ? step : 5;
    var mds = [];
    var count = Math.max(1, Math.ceil(maxMd / step));
    for (var k = 0; k <= count; k++) mds.push(Math.min(maxMd, k * maxMd / count));
    s.forEach(function (p) { if (p.md > 0 && p.md < maxMd) mds.push(p.md); });
    mds.sort(function (a, b) { return a - b; });
    mds = mds.filter(function (m, i) { return i === 0 || m > mds[i - 1] + 1e-6; });

    var nodes = [];
    var prev = null, n = 0, e = 0, v = 0;
    for (var i = 0; i < mds.length; i++) {
      var att = attitudeAt(s, mds[i]);
      var node = { md: mds[i], inc: att.inc, azi: att.azi, tvd: 0, north: 0, east: 0, dls: 0 };
      if (prev) {
        var d = mcStep(prev, node);
        n += d.dN; e += d.dE; v += d.dV; node.dls = d.dls;
      }
      node.tvd = v; node.north = n; node.east = e;
      nodes.push(node);
      prev = node;
    }
    // node DLS: use max of adjacent intervals so curvature is attributed to both ends
    for (var j = 0; j < nodes.length - 1; j++) nodes[j].dlsBelow = nodes[j + 1].dls;
    nodes.forEach(function (nd) { nd.dlsNode = Math.max(nd.dls, nd.dlsBelow || 0); });
    return nodes;
  }

  function tvdAt(survey, md) {
    if (md <= 0) return 0;
    var nodes = buildNodes(survey, md, Math.max(1, md / 200));
    return nodes[nodes.length - 1].tvd;
  }

  // ---------------------------------------------------------------- fluid

  function oilSg(api) { return 141.5 / (131.5 + api); }

  function fluidProps(prod) {
    var wc = clamp(prod.waterCut, 0, 1);
    var sgO = oilSg(prod.oilApi);
    var sgMix = wc * prod.waterSg + (1 - wc) * sgO;
    var viscosity = Fluid.effectiveViscosity(prod);
    return { oilSg: sgO, sg: sgMix, density: sgMix * RHO_WATER, viscosity: Math.max(viscosity.viscosity, 1e-4), waterCut: wc,
      oilViscosity: viscosity.oilViscosity, warnings: viscosity.warnings };
  }

  // ---------------------------------------------------------------- hydraulics

  /** Frictional pressure gradient (Pa/m) for axial flow in a concentric annulus. */
  function annulusGradient(Q, rho, mu, tubingId, rodOd) {
    var ro = tubingId / 2, ri = Math.min(rodOd / 2, ro * 0.999);
    var area = Math.PI * (ro * ro - ri * ri);
    if (Q <= 0 || area <= 0) return { dpdl: 0, re: 0, velocity: 0, regime: 'none' };
    var v = Q / area;
    var dh = 2 * (ro - ri);
    var re = rho * v * dh / mu;
    var dpdl;
    var regime;
    if (re < 2100) {
      var lnr = ri > 0 ? Math.log(ro / ri) : Infinity;
      var denom = Math.pow(ro, 4) - Math.pow(ri, 4) - (ri > 0 ? Math.pow(ro * ro - ri * ri, 2) / lnr : 0);
      dpdl = 8 * mu * Q / (Math.PI * denom);
      regime = 'laminar';
    } else {
      var f = 0.0791 * Math.pow(re, -0.25); // Fanning, Blasius
      dpdl = 2 * f * rho * v * v / dh;
      regime = 'turbulent';
    }
    return { dpdl: dpdl, re: re, velocity: v, regime: regime };
  }

  /** Viscous (Couette) torque per unit length (N·m/m) of a rod rotating in a fluid-filled tube. */
  function viscousTorquePerLength(mu, omega, rodOd, tubingId) {
    var r1 = rodOd / 2, r2 = tubingId / 2;
    if (r2 <= r1) return 0;
    return 4 * Math.PI * mu * omega * r1 * r1 * r2 * r2 / (r2 * r2 - r1 * r1);
  }

  // ---------------------------------------------------------------- pump

  function displacementPerRev(pump) { return pump.displacement * 60 / 100; } // m³/rev

  function ratedPressure(pump) { return pump.ratedLift * RHO_WATER * G; }

  /** Validate optional performance inputs; absent inputs retain legacy behavior. */
  function validatePerformance(pump) {
    var errors = [], model = pump.performanceModel || 'legacy';
    if (['legacy', 'linear', 'quadratic', 'constant'].indexOf(model) < 0) errors.push('Unknown pump performance model.');
    ['referenceViscosity', 'viscosityExponent'].forEach(function (key) {
      var v = pump[key];
      if (v !== undefined && (typeof v !== 'number' || !isFinite(v) || (key === 'referenceViscosity' ? v <= 0 : v < 0 || v > 1))) {
        errors.push('Invalid pump ' + key + '.');
      }
    });
    if (model === 'constant') {
      if (typeof pump.efficiencyAtRated !== 'number' || !isFinite(pump.efficiencyAtRated) || pump.efficiencyAtRated < 0 || pump.efficiencyAtRated > 1) {
        errors.push('Pump constant efficiency must be between 0 and 100%.');
      }
    }
    if (model === 'linear' || model === 'quadratic') {
      ['efficiencyAtZero', 'efficiencyAtRated'].forEach(function (key) {
        var v = pump[key];
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1) errors.push('Pump ' + key + ' must be between 0 and 100%.');
      });
      if (pump.efficiencyAtRated > pump.efficiencyAtZero) errors.push('Rated-pressure efficiency must not exceed zero-pressure efficiency.');
      if (!(pump.referenceSpeed > 0) || !isFinite(pump.referenceSpeed)) errors.push('Pump reference speed must be positive.');
    }
    return errors;
  }

  /**
   * Reference-speed efficiency curve mapped to speed-independent slippage.
   * Linear: eta = eta0 + (etaRated - eta0) * (dP / ratedPressure).
   * Quadratic: replace the pressure ratio by its square.
   * Slip at another viscosity = reference slip * (muRef / mu)^exponent.
   * Constant-efficiency mode is intentionally independent of viscosity and speed.
   */
  function slipRate(pump, dP, mu) {
    var pr = ratedPressure(pump), model = pump.performanceModel || 'legacy';
    if (pr <= 0) return 0;
    var pressureRatio = Math.max(0, dP) / pr;
    var slip;
    if (model === 'linear' || model === 'quadratic') {
      var ratio = model === 'quadratic' ? pressureRatio * pressureRatio : pressureRatio;
      var eta = pump.efficiencyAtZero + (pump.efficiencyAtRated - pump.efficiencyAtZero) * ratio;
      slip = displacementPerRev(pump) * pump.referenceSpeed / 60 * Math.max(0, 1 - eta);
    } else {
      slip = pump.slipAtRated * pressureRatio;
    }
    var ref = pump.referenceViscosity === undefined ? MU_REF : pump.referenceViscosity;
    var exponent = pump.viscosityExponent === undefined ? (model === 'legacy' ? 0.5 : 0.33) : pump.viscosityExponent;
    return slip * Math.pow(ref / Math.max(mu, MU_REF * 0.1), exponent);
  }

  function pumpFlow(pump, speed, dP, mu) {
    var qth = displacementPerRev(pump) * speed / 60;
    var slip = pump.performanceModel === 'constant'
      ? qth * (1 - pump.efficiencyAtRated)
      : Math.min(qth, slipRate(pump, dP, mu));
    return { theoretical: qth, slip: slip, actual: Math.max(0, qth - slip) };
  }

  /** Effective area for the pump axial (rotor thrust) load: stator cavity cross-section. */
  function rotorThrustArea(pump) {
    var d = pump.rotorDiameter, e = pump.eccentricity;
    return Math.PI * d * d / 4 + 4 * e * d;
  }

  function pumpTorque(pump, dP) {
    var hyd = displacementPerRev(pump) * Math.max(0, dP) / (2 * Math.PI);
    return { hydraulic: hyd, friction: pump.frictionTorque || 0, total: hyd + (pump.frictionTorque || 0) };
  }

  // ---------------------------------------------------------------- rod string

  function resolveRodSections(project) {
    var rods = project.rods;
    var depth = project.wellbore.pumpDepth;
    var secs = rods.sections || [];
    var out = [];
    var top = 0;
    var errors = [];
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      var size = Catalog.byId(Catalog.ROD_SIZES, s.size);
      var grade = Catalog.byId(Catalog.ROD_GRADES, s.grade);
      if (!size || !grade) { errors.push('Rod section ' + (i + 1) + ': unknown size or grade.'); continue; }
      var len = i === secs.length - 1 ? depth - top : Math.max(0, +s.length || 0);
      if (top + len > depth) len = depth - top;
      if (len <= 0) {
        if (i === secs.length - 1) errors.push('Rod sections above the last one exceed the pump depth; the bottom section has no length.');
        continue;
      }
      var continuous = !(rods.couplingSpacing > 0);
      var d = s.diameter || size.diameter;
      out.push({
        index: i,
        grade: grade, size: size,
        diameter: d,
        couplingOd: continuous ? d : (s.couplingOd || size.couplingOd),
        massPerLength: continuous ? RHO_STEEL * Math.PI * d * d / 4 : (s.massPerLength || size.massPerLength),
        yieldStrength: grade.yield,
        top: top, bottom: top + len, length: len
      });
      top += len;
    }
    if (!out.length) errors.push('No valid rod string defined.');
    return { sections: out, errors: errors };
  }

  function sectionAt(sections, md) {
    for (var i = 0; i < sections.length; i++) if (md <= sections[i].bottom + 1e-9) return sections[i];
    return sections[sections.length - 1];
  }

  // ---------------------------------------------------------------- main analysis

  function computePressures(project, fluid, sections, pumpTvd, Q) {
    var prod = project.production;
    var tid = project.wellbore.tubingId;
    var fr = 0, maxRe = 0, regime = 'laminar';
    sections.forEach(function (s) {
      var g = annulusGradient(Q, fluid.density, fluid.viscosity, tid, s.diameter);
      fr += g.dpdl * s.length;
      if (g.re > maxRe) { maxRe = g.re; regime = g.regime; }
    });
    var discharge = prod.tubingHeadPressure + fluid.density * G * pumpTvd + fr;
    return { discharge: discharge, friction: fr, reynolds: maxRe, regime: regime };
  }

  function intakeConditions(project, fluid, pumpTvd) {
    var prod = project.production;
    var survey = project.wellbore.survey;
    if (prod.intakeMode === 'intakePressure') {
      var pip = prod.intakePressure;
      var sub = Math.max(0, (pip - prod.casingHeadPressure) / (fluid.density * G));
      return { intake: pip, submergence: sub, fluidLevelTvd: pumpTvd - sub, fluidLevelMd: null, pumpedOff: sub <= 0 };
    }
    var flMd = clamp(prod.fluidLevel, 0, Infinity);
    var flTvd = tvdAt(survey, flMd);
    var subm = Math.max(0, pumpTvd - flTvd);
    return {
      intake: prod.casingHeadPressure + fluid.density * G * subm,
      submergence: subm, fluidLevelTvd: flTvd, fluidLevelMd: flMd, pumpedOff: subm <= 0
    };
  }

  /** Solve the coupled pump-flow / tubing-friction problem by bisection. */
  function solveOperatingPoint(project, fluid, sections, pumpTvd, intake, speed) {
    var pump = project.pump;
    var qth = displacementPerRev(pump) * speed / 60;
    function evalQ(Q) {
      var pr = computePressures(project, fluid, sections, pumpTvd, Q);
      var dP = Math.max(0, pr.discharge - intake);
      return { pr: pr, dP: dP, flow: pumpFlow(pump, speed, dP, fluid.viscosity) };
    }
    var lo = 0, hi = qth, mid, r;
    for (var it = 0; it < 80; it++) {
      mid = 0.5 * (lo + hi);
      r = evalQ(mid);
      if (r.flow.actual > mid) lo = mid; else hi = mid;
      if (hi - lo < 1e-12) break;
    }
    return evalQ(0.5 * (lo + hi));
  }

  function analyze(project, opts) {
    opts = opts || {};
    var warnings = [], errors = [];
    var wb = project.wellbore, prod = project.production, pump = project.pump, drive = project.drive;
    var speed = opts.speed !== undefined ? opts.speed : project.speed;
    var step = (project.calc && project.calc.step) || 5;

    if (!(wb.pumpDepth > 0)) errors.push('Pump depth must be greater than zero.');
    if (!(wb.tubingId > 0)) errors.push('Tubing ID must be greater than zero.');
    if (!(pump && pump.displacement > 0)) errors.push('Pump displacement must be greater than zero.');
    if (pump) errors = errors.concat(validatePerformance(pump));
    if (!(speed > 0)) errors.push('Rotational speed must be greater than zero.');
    var rs = resolveRodSections(project);
    errors = errors.concat(rs.errors);
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    var sections = rs.sections;
    var survey = normalizeSurvey(wb.survey);
    var lastMd = survey[survey.length - 1].md;
    if (wb.pumpDepth > lastMd + 1e-6) warnings.push('Pump depth is below the last survey station; trajectory extrapolated at constant attitude.');

    var fluid;
    try { fluid = fluidProps(prod); }
    catch (error) { return { ok: false, errors: [error.message], warnings: warnings }; }
    warnings = warnings.concat(fluid.warnings || []);
    var nodes = buildNodes(survey, wb.pumpDepth, step);
    var pumpNode = nodes[nodes.length - 1];
    var pumpTvd = pumpNode.tvd;

    var ic = intakeConditions(project, fluid, pumpTvd);
    if (ic.pumpedOff) warnings.push('Fluid level is at or below the pump: pump is pumped-off (risk of dry running / elastomer burn).');

    var op = solveOperatingPoint(project, fluid, sections, pumpTvd, ic.intake, speed);
    var Q = op.flow.actual, dP = op.dP;
    var volEff = op.flow.theoretical > 0 ? Q / op.flow.theoretical : 0;
    var pt = pumpTorque(pump, dP);
    var thrust = dP * rotorThrustArea(pump);
    var omega = speed * 2 * Math.PI / 60;
    var rodRadiusContact;

    // --- pressure profile along tubing (top-down) ---
    var tid = wb.tubingId;
    var cumFric = 0;
    nodes[0].tubingPressure = prod.tubingHeadPressure;
    for (var i = 1; i < nodes.length; i++) {
      var ds = nodes[i].md - nodes[i - 1].md;
      var secMid = sectionAt(sections, 0.5 * (nodes[i].md + nodes[i - 1].md));
      cumFric += annulusGradient(Q, fluid.density, fluid.viscosity, tid, secMid.diameter).dpdl * ds;
      nodes[i].tubingPressure = prod.tubingHeadPressure + fluid.density * G * nodes[i].tvd + cumFric;
    }
    nodes.forEach(function (nd) {
      var above = ic.fluidLevelTvd;
      nd.casingPressure = prod.casingHeadPressure + (nd.tvd > above ? fluid.density * G * (nd.tvd - above) : 0);
    });

    // --- rod loads (bottom-up soft-string) ---
    var mu = clamp(project.rods.frictionCoefficient, 0, 2);
    var spacing = project.rods.couplingSpacing;
    var buoyFactor = 1 - fluid.density / RHO_STEEL;
    var F = thrust, T = pt.total;
    var last = nodes.length - 1;
    nodes[last].axial = F; nodes[last].torque = T; nodes[last].sideLoadPerLength = 0;
    var stretch = 0, windup = 0, totalViscous = 0, totalContact = 0;
    for (var j = last; j > 0; j--) {
      var bot = nodes[j], top = nodes[j - 1];
      var dsj = bot.md - top.md;
      var sec = sectionAt(sections, 0.5 * (bot.md + top.md));
      var wb_ = sec.massPerLength * G * buoyFactor;          // buoyed weight, N/m
      var incAvg = 0.5 * (bot.inc + top.inc) * DEG;
      var dInc = (bot.inc - top.inc) * DEG;
      var dAzi = wrapDeg(bot.azi - top.azi) * DEG;
      var Favg = F + 0.5 * wb_ * dsj * Math.cos(incAvg);
      var nVert = Favg * dInc - wb_ * dsj * Math.sin(incAvg);
      var nHorz = Favg * dAzi * Math.sin(incAvg);
      var Nseg = Math.sqrt(nVert * nVert + nHorz * nHorz);   // N over segment
      rodRadiusContact = sec.couplingOd / 2;
      var tContact = mu * Nseg * rodRadiusContact;
      var tVisc = viscousTorquePerLength(fluid.viscosity, omega, sec.diameter, tid) * dsj;
      totalViscous += tVisc; totalContact += tContact;
      var Fnew = F + wb_ * dsj * Math.cos(incAvg);
      var Tnew = T + tContact + tVisc;
      var A = Math.PI * sec.diameter * sec.diameter / 4;
      var J = Math.PI * Math.pow(sec.diameter, 4) / 32;
      stretch += 0.5 * (F + Fnew) * dsj / (E_STEEL * A);
      windup += 0.5 * (T + Tnew) * dsj / (G_STEEL * J);
      F = Fnew; T = Tnew;
      top.axial = F; top.torque = T;
      // distribute segment side load per unit length to the segment (assign to bottom node of segment)
      bot.sideLoadPerLength = dsj > 0 ? Nseg / dsj : 0;
    }
    nodes[0].sideLoadPerLength = nodes.length > 1 ? nodes[1].sideLoadPerLength : 0;

    // --- stresses ---
    var maxLoad = { ratio: -1 }, maxSide = { value: -1 };
    var sideWarnCount = 0;
    var effSpacing = spacing > 0 ? spacing : 1;
    nodes.forEach(function (nd) {
      var sec = sectionAt(sections, nd.md);
      var d = sec.diameter;
      var A = Math.PI * d * d / 4;
      nd.rodDiameter = d;
      nd.rodSection = sec.index;
      nd.axialStress = nd.axial / A;
      nd.bendingStress = E_STEEL * (d / 2) * (nd.dlsNode || 0);
      nd.shearStress = 16 * nd.torque / (Math.PI * d * d * d);
      var sn = Math.abs(nd.axialStress) + nd.bendingStress;
      nd.vonMises = Math.sqrt(sn * sn + 3 * nd.shearStress * nd.shearStress);
      nd.yieldStrength = sec.yieldStrength;
      nd.loadRatio = nd.vonMises / sec.yieldStrength;
      nd.sideLoadPerCoupling = nd.sideLoadPerLength * effSpacing;
      if (nd.loadRatio > maxLoad.ratio) maxLoad = { ratio: nd.loadRatio, md: nd.md, tvd: nd.tvd };
      if (nd.sideLoadPerCoupling > maxSide.value) maxSide = { value: nd.sideLoadPerCoupling, md: nd.md };
      if (project.limits && nd.sideLoadPerCoupling > project.limits.sideLoadWarn) sideWarnCount++;
    });

    var surf = nodes[0];
    var polishedRodPower = surf.torque * omega;
    var hydraulicPower = Q * dP;
    var driveEff = (drive && drive.efficiency) || 0.85;
    var motorPower = polishedRodPower / driveEff;

    // --- checks ---
    var lim = project.limits || { rodLoadWarn: 0.8, sideLoadWarn: 900 };
    var pr = ratedPressure(pump);
    if (dP > pr) warnings.push('Pump differential pressure (' + (dP / 1e3).toFixed(0) + ' kPa) exceeds rated lift pressure (' + (pr / 1e3).toFixed(0) + ' kPa).');
    else if (dP > 0.85 * pr) warnings.push('Pump differential pressure is above 85% of rated lift.');
    if (volEff < 0.5) warnings.push('Low volumetric efficiency (' + (volEff * 100).toFixed(0) + '%). Consider a higher-lift pump or lower differential pressure.');
    if (pump.maxSpeed && speed > pump.maxSpeed) warnings.push('Speed exceeds the pump maximum recommended speed (' + pump.maxSpeed + ' rpm).');
    if (maxLoad.ratio > 1) errors.push('Rod string is overloaded: maximum combined stress is ' + (maxLoad.ratio * 100).toFixed(0) + '% of yield.');
    else if (maxLoad.ratio > lim.rodLoadWarn) warnings.push('Rod load ' + (maxLoad.ratio * 100).toFixed(0) + '% of yield exceeds the design limit of ' + (lim.rodLoadWarn * 100).toFixed(0) + '%.');
    if (sideWarnCount > 0) warnings.push(sideWarnCount + ' calculation node(s) exceed the side-load limit of ' + lim.sideLoadWarn.toFixed(0) + ' N per coupling (rod/tubing wear risk).');
    sections.forEach(function (s) {
      if (s.couplingOd >= wb.tubingId) errors.push('Rod section ' + (s.index + 1) + ' coupling OD does not fit inside the tubing ID.');
    });
    if (wb.tubingOd && wb.casingId && wb.tubingOd >= wb.casingId) errors.push('Tubing OD does not fit inside the casing ID.');
    if (drive) {
      if (drive.maxTorque && surf.torque > drive.maxTorque) errors.push('Polished rod torque exceeds the drive torque rating.');
      if (drive.maxPower && motorPower > drive.maxPower) errors.push('Required motor power exceeds the drive power rating.');
      if (drive.maxSpeed && speed > drive.maxSpeed) errors.push('Speed exceeds the drive maximum speed.');
      if (drive.maxAxialLoad && surf.axial > drive.maxAxialLoad) errors.push('Polished rod axial load exceeds the drive thrust-bearing rating.');
    }

    return {
      ok: true,
      errors: errors,
      warnings: warnings,
      speed: speed,
      fluid: fluid,
      sections: sections,
      nodes: nodes,
      trajectory: trajectory(survey),
      pump: {
        theoreticalRate: op.flow.theoretical,
        slip: op.flow.slip,
        rate: Q,
        volumetricEfficiency: volEff,
        intakePressure: ic.intake,
        dischargePressure: op.pr.discharge,
        differentialPressure: dP,
        ratedPressure: pr,
        liftRatio: pr > 0 ? dP / pr : 0,
        tubingFriction: op.pr.friction,
        reynolds: op.pr.reynolds,
        flowRegime: op.pr.regime,
        hydraulicTorque: pt.hydraulic,
        frictionTorque: pt.friction,
        torque: pt.total,
        thrust: thrust,
        depthMd: wb.pumpDepth,
        depthTvd: pumpTvd,
        submergence: ic.submergence,
        fluidLevelTvd: ic.fluidLevelTvd
      },
      surface: {
        torque: surf.torque,
        axialLoad: surf.axial,
        polishedRodPower: polishedRodPower,
        motorPower: motorPower,
        hydraulicPower: hydraulicPower,
        systemEfficiency: motorPower > 0 ? hydraulicPower / motorPower : 0,
        viscousTorque: totalViscous,
        contactTorque: totalContact
      },
      rods: {
        maxLoadRatio: maxLoad.ratio,
        maxLoadMd: maxLoad.md,
        maxSideLoad: maxSide.value,
        maxSideLoadMd: maxSide.md,
        stretch: stretch,
        windupTurns: windup / (2 * Math.PI),
        weightInAir: sections.reduce(function (a, s) { return a + s.massPerLength * G * s.length; }, 0)
      }
    };
  }

  /** Pump performance curves: rate vs differential pressure at a set of speeds. */
  function pumpCurves(pump, viscosity, speeds, points) {
    points = points || 25;
    var pr = ratedPressure(pump);
    return speeds.map(function (N) {
      var pts = [];
      for (var k = 0; k <= points; k++) {
        var dP = 1.25 * pr * k / points;
        var f = pumpFlow(pump, N, dP, viscosity);
        pts.push({ dP: dP, rate: f.actual, torque: pumpTorque(pump, dP).total, efficiency: f.theoretical > 0 ? f.actual / f.theoretical : 0 });
      }
      return { speed: N, points: pts };
    });
  }

  /** Operating sweep: key results across a range of speeds. */
  function speedSweep(project, minRpm, maxRpm, n) {
    n = n || 20;
    var out = [];
    for (var k = 0; k <= n; k++) {
      var N = minRpm + (maxRpm - minRpm) * k / n;
      if (N <= 0) continue;
      var r = analyze(project, { speed: N });
      if (!r.ok) continue;
      out.push({ speed: N, rate: r.pump.rate, torque: r.surface.torque, power: r.surface.motorPower, loadRatio: r.rods.maxLoadRatio, efficiency: r.pump.volumetricEfficiency });
    }
    return out;
  }

  /** Find the speed that delivers a target rate (bisection). Returns null if not reachable. */
  function solveSpeedForRate(project, targetRate, maxRpm) {
    maxRpm = maxRpm || 1000;
    var rMax = analyze(project, { speed: maxRpm });
    if (!rMax.ok || rMax.pump.rate < targetRate) return null;
    var lo = 0.1, hi = maxRpm;
    for (var it = 0; it < 60; it++) {
      var mid = 0.5 * (lo + hi);
      var r = analyze(project, { speed: mid });
      if (r.pump.rate < targetRate) lo = mid; else hi = mid;
      if (hi - lo < 0.01) break;
    }
    return 0.5 * (lo + hi);
  }

  return {
    constants: { G: G, RHO_WATER: RHO_WATER, RHO_STEEL: RHO_STEEL, E_STEEL: E_STEEL, G_STEEL: G_STEEL },
    normalizeSurvey: normalizeSurvey,
    trajectory: trajectory,
    buildNodes: buildNodes,
    tvdAt: tvdAt,
    oilSg: oilSg,
    fluidProps: fluidProps,
    annulusGradient: annulusGradient,
    viscousTorquePerLength: viscousTorquePerLength,
    displacementPerRev: displacementPerRev,
    ratedPressure: ratedPressure,
    validatePerformance: validatePerformance,
    pumpFlow: pumpFlow,
    pumpTorque: pumpTorque,
    rotorThrustArea: rotorThrustArea,
    resolveRodSections: resolveRodSections,
    analyze: analyze,
    pumpCurves: pumpCurves,
    speedSweep: speedSweep,
    solveSpeedForRate: solveSpeedForRate
  };
});
