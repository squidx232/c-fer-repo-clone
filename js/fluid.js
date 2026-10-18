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
    linearMixtureViscosity: linearMixtureViscosity, effectiveViscosity: effectiveViscosity };
});
