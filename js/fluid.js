/* Original SI implementation of traced oil-viscosity correlations.
 * Evidence: PcPump.Engine 5.2.1.18703, sy.e(T, API, messages) and
 * sy.i(deadOilViscosity, solutionGOR, messages). No vendor code is executed.
 * This is a property calculator, NOT a multiphase-flow/PVT implementation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCPFluid = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function finitePositive(value, label) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) throw new Error(label + ' must be positive and finite.');
  }

  /** Beggs–Robinson dead oil viscosity; temperature K, output Pa·s. */
  function deadOilViscosity(temperature, api) {
    finitePositive(temperature, 'Oil temperature');
    if (typeof api !== 'number' || !isFinite(api) || api <= -131.5) throw new Error('Invalid oil API gravity.');
    var celsius = temperature - 273.15, fahrenheit = celsius * 1.8 + 32;
    if (fahrenheit <= 0) throw new Error('Beggs–Robinson requires temperature above 0 °F.');
    var power = Math.pow(10, 3.0324 - 0.02023 * api) / Math.pow(fahrenheit, 1.163);
    var viscosity = (Math.pow(10, power) - 1) * 0.001;
    finitePositive(viscosity, 'Calculated oil viscosity');
    var warnings = [];
    if (celsius < 21.1 || celsius > 146.1) warnings.push('Beggs–Robinson oil temperature is outside the traced 21.1–146.1 °C range.');
    if (api < 16 || api > 58) warnings.push('Beggs–Robinson oil gravity is outside the traced 16–58 °API range.');
    return { viscosity: viscosity, warnings: warnings };
  }

  /** Saturated live oil viscosity; dead viscosity Pa·s, solution GOR Sm³/Sm³.
   * Uses the traced conversion 5.6146 scf/STB per Sm³/Sm³. Requires Rs from a
   * separate PVT calculation or measurement; this helper does not calculate Rs.
   */
  function liveOilViscosity(deadViscosity, solutionGor) {
    finitePositive(deadViscosity, 'Dead oil viscosity');
    if (typeof solutionGor !== 'number' || !isFinite(solutionGor) || solutionGor < 0) throw new Error('Solution GOR must be finite and nonnegative.');
    var rs = solutionGor * 5.6146;
    var a = 10.715 * Math.pow(rs + 100, -0.515);
    var b = 5.44 * Math.pow(rs + 150, -0.338);
    var viscosity = a * Math.pow(deadViscosity * 1000, b) * 0.001;
    finitePositive(viscosity, 'Calculated live oil viscosity');
    return {
      viscosity: viscosity,
      warnings: rs > 2070 ? ['Solution GOR exceeds the traced Beggs–Robinson limit of 2070 scf/STB.'] : []
    };
  }

  /** Documented linear BS&W model; water cut fraction and viscosities Pa·s. */
  function linearMixtureViscosity(oil, water, waterCut) {
    finitePositive(oil, 'Oil viscosity'); finitePositive(water, 'Water viscosity');
    if (typeof waterCut !== 'number' || !isFinite(waterCut) || waterCut < 0 || waterCut > 1) throw new Error('Water cut must be between 0 and 100%.');
    return oil * (1 - waterCut) + water * waterCut;
  }

  /**
   * Screening-level free-gas fraction at a given pressure/temperature, from user-supplied
   * produced GOR and bubble-point pressure. Opt-in only (disabled when producedGOR or
   * bubblePointPressure is not a positive number) and liquid-phase hydraulics are NOT modified
   * by this function; it is a reporting indicator, not a multiphase flow model.
   *
   * Method (all standard, independently published, cited inline):
   *  1. Solution GOR ratio below bubble point follows Standing (1947), "A Pressure-Volume-
   *     Temperature Correlation for Mixtures of California Oils and Gases", Drill. & Prod.
   *     Prac., API: Rs = gasGravity * ((P/18.2 + 1.4) * 10^(0.0125 API - 0.00091 T_F))^1.2048.
   *     Taking the ratio of this expression at two pressures and the same T/API/gas gravity,
   *     the gravity/temperature/API terms cancel, leaving Rs(P)/Rs(Pb) = (P/Pb)^(1/1.2048);
   *     this avoids re-deriving gas gravity from a single bubble-point input.
   *  2. Gas pseudo-critical properties from Standing (1977), "Volumetric and Phase Behavior of
   *     Oil Field Hydrocarbon Systems": Ppc = 677 + 15*SGg - 37.5*SGg^2 (psia),
   *     Tpc = 168 + 325*SGg - 12.5*SGg^2 (°R).
   *  3. Gas compressibility (Z) factor from Papay (1968), as presented in Ahmed, "Reservoir
   *     Engineering Handbook": Z = 1 - 3.52*Ppr/10^(0.9813*Tpr) + 0.274*Ppr^2/10^(0.8157*Tpr).
   *     Explicit (no iteration); typically within a few percent of Standing-Katz for Ppr<15.
   *  4. Gas formation volume factor, standard real-gas-law form (e.g. Ahmed, Reservoir
   *     Engineering Handbook): Bg = (Psc * Z * T) / (Tsc * P)  [reservoir volume / standard volume].
   *  5. Free gas volume fraction at P,T assumes Bo = Bw = 1 (no oil/water shrinkage modeled;
   *     documented simplification) and reports GVF = Vgas / (Vgas + Vliquid).
   */
  function freeGasFraction(production, pressurePa, temperatureK) {
    var gor = production.producedGOR, pb = production.bubblePointPressure;
    if (!(gor > 0) || !(pb > 0)) return { active: false, fraction: 0, solutionGor: gor || 0, warnings: [] };
    finitePositive(pressurePa, 'Intake pressure'); finitePositive(temperatureK, 'Intake temperature');
    var sgGas = production.gasGravity > 0 ? production.gasGravity : 0.65;
    var warnings = [];
    if (production.gasGravity === undefined) warnings.push('Free-gas screening is using a default gas specific gravity of 0.65 (air = 1); specify production.gasGravity for a site-specific estimate.');
    var rs = pressurePa >= pb ? gor : gor * Math.pow(pressurePa / pb, 1 / 1.2048);
    var freeGor = Math.max(0, gor - rs); // Sm3 free gas per Sm3 oil at standard conditions
    if (freeGor <= 0) return { active: true, fraction: 0, solutionGor: rs, warnings: warnings };
    var ppc = (677 + 15 * sgGas - 37.5 * sgGas * sgGas) * 6894.757293; // Pa
    var tpc = (168 + 325 * sgGas - 12.5 * sgGas * sgGas) * 5 / 9;      // K
    var ppr = pressurePa / ppc, tpr = temperatureK / tpc;
    var z = 1 - 3.52 * ppr / Math.pow(10, 0.9813 * tpr) + 0.274 * ppr * ppr / Math.pow(10, 0.8157 * tpr);
    z = clampFinite(z, 0.3, 1.6);
    var pSc = 101325, tSc = 288.15; // 1 atm, 60 F standard conditions
    var bg = (pSc * z * temperatureK) / (tSc * pressurePa); // rm3 gas / Sm3 gas
    var waterCut = clampFinite(production.waterCut, 0, 1);
    var oilFractionSc = Math.max(0, 1 - waterCut);
    var gasVolume = freeGor * bg * oilFractionSc; // rm3 gas per Sm3 total liquid
    var fraction = gasVolume / (gasVolume + 1);
    if (fraction > 0.1) warnings.push('Estimated free gas at pump intake is ' + (fraction * 100).toFixed(1) + '% by volume; progressing cavity pumps tolerate moderate free gas, but volumetric efficiency and gas-lock/compression-heating risk increase as gas fraction rises above roughly 10%.');
    return { active: true, fraction: fraction, solutionGor: rs, z: z, warnings: warnings };
  }
  function clampFinite(v, lo, hi) { return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo)); }

  function effectiveViscosity(production) {
    var model = production.viscosityModel || 'specified';
    if (model === 'specified') {
      finitePositive(production.viscosity, 'Specified mixture viscosity');
      return { viscosity: production.viscosity, warnings: [] };
    }
    if (model !== 'beggsRobinson') throw new Error('Unknown fluid viscosity model.');
    var oil = deadOilViscosity(production.fluidTemperature, production.oilApi);
    return {
      viscosity: linearMixtureViscosity(oil.viscosity, production.waterViscosity, production.waterCut),
      oilViscosity: oil.viscosity,
      warnings: oil.warnings.concat(['Oil viscosity correlation with linear oil/water mixing is a uniform-temperature screening model; emulsion, gas and depth-temperature effects are not included.'])
    };
  }

  return { deadOilViscosity: deadOilViscosity, liveOilViscosity: liveOilViscosity,
    linearMixtureViscosity: linearMixtureViscosity, effectiveViscosity: effectiveViscosity,
    freeGasFraction: freeGasFraction };
});
