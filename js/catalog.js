/*
 * Equipment catalog (pumps, rods, tubing, casing, surface drives) and default project.
 * All values are SI. Pump models are GENERIC / ILLUSTRATIVE and do not represent any
 * specific manufacturer's published ratings.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCPCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var IN = 0.0254, MM = 0.001, DAY = 86400, MPA = 1e6, KSI = 6.894757293e6, KW = 1000;
  var RHO_STEEL = 7850;

  // name: "PC <m³/d per 100 rpm>-<rated lift, m of water>"
  function pump(d100, lift, rotorMm, eccMm, frictionNm, elastomer) {
    return {
      id: 'PC-' + d100 + '-' + lift,
      name: 'PC ' + d100 + '-' + lift,
      displacement: d100 / DAY,                 // m³/s at 100 rpm
      ratedLift: lift,                          // m of fresh water
      rotorDiameter: rotorMm * MM,              // m (rotor minor diameter)
      eccentricity: eccMm * MM,                 // m
      frictionTorque: frictionNm,               // N·m, elastomer interference / rubbing torque
      slipAtRated: 0.6 * d100 / DAY,            // m³/s of slip at rated lift with 1 cP fluid
      maxSpeed: 500,                            // rpm
      elastomer: elastomer || 'NBR (medium nitrile)'
    };
  }

  var PUMPS = [
    pump(4, 2000, 35, 4.0, 60),
    pump(8, 1800, 40, 5.0, 80),
    pump(12, 1500, 45, 5.5, 100),
    pump(20, 1200, 50, 6.5, 120),
    pump(30, 1500, 55, 7.0, 160),
    pump(40, 1000, 60, 8.0, 170),
    pump(60, 900, 65, 9.0, 210),
    pump(80, 1200, 72, 10.0, 280),
    pump(100, 800, 78, 11.0, 300),
    pump(150, 600, 85, 12.0, 360)
  ];

  var ROD_GRADES = [
    { id: 'C',   name: 'API Grade C',          yield: 60 * KSI,  tensile: 90 * KSI },
    { id: 'K',   name: 'API Grade K',          yield: 60 * KSI,  tensile: 90 * KSI },
    { id: 'D',   name: 'API Grade D',          yield: 85 * KSI,  tensile: 115 * KSI },
    { id: 'HS',  name: 'High Strength (HS)',   yield: 115 * KSI, tensile: 140 * KSI },
    { id: 'PCP', name: 'PC Rod (4142 Q&T)',    yield: 130 * KSI, tensile: 150 * KSI }
  ];

  // Sucker rod sizes with full-size coupling OD
  function rodSize(label, dIn, couplingIn) {
    var d = dIn * IN;
    return {
      id: label,
      name: label + '"',
      diameter: d,
      couplingOd: couplingIn * IN,
      massPerLength: RHO_STEEL * Math.PI * d * d / 4 * 1.035  // includes upset/coupling allowance
    };
  }

  var ROD_SIZES = [
    rodSize('3/4', 0.75, 1.625),
    rodSize('7/8', 0.875, 1.8125),
    rodSize('1', 1.0, 2.1875),
    rodSize('1-1/8', 1.125, 2.375),
    rodSize('1-1/4', 1.25, 2.5),
    rodSize('1-1/2', 1.5, 3.0)
  ];

  var TUBING = [
    { id: '2-3/8', name: '2-3/8" 4.7 lb/ft', od: 60.3 * MM, id_: 50.7 * MM },
    { id: '2-7/8', name: '2-7/8" 6.5 lb/ft', od: 73.0 * MM, id_: 62.0 * MM },
    { id: '3-1/2', name: '3-1/2" 9.3 lb/ft', od: 88.9 * MM, id_: 76.0 * MM },
    { id: '4-1/2', name: '4-1/2" 12.75 lb/ft', od: 114.3 * MM, id_: 100.5 * MM }
  ].map(function (t) { return { id: t.id, name: t.name, od: t.od, innerDiameter: t.id_ }; });

  var CASING = [
    { id: '4-1/2', name: '4-1/2" 11.6 lb/ft', innerDiameter: 101.6 * MM },
    { id: '5-1/2', name: '5-1/2" 17 lb/ft', innerDiameter: 124.3 * MM },
    { id: '7',     name: '7" 26 lb/ft',     innerDiameter: 157.1 * MM },
    { id: '9-5/8', name: '9-5/8" 40 lb/ft', innerDiameter: 222.4 * MM }
  ];

  var DRIVES = [
    { id: 'DD-15',  name: 'Direct Drive 15 kW',  maxTorque: 800,  maxPower: 15 * KW,  maxSpeed: 500, maxAxialLoad: 90e3,  efficiency: 0.85 },
    { id: 'DD-30',  name: 'Direct Drive 30 kW',  maxTorque: 1500, maxPower: 30 * KW,  maxSpeed: 500, maxAxialLoad: 135e3, efficiency: 0.87 },
    { id: 'DD-45',  name: 'Direct Drive 45 kW',  maxTorque: 2700, maxPower: 45 * KW,  maxSpeed: 450, maxAxialLoad: 180e3, efficiency: 0.88 },
    { id: 'DD-75',  name: 'Direct Drive 75 kW',  maxTorque: 4000, maxPower: 75 * KW,  maxSpeed: 400, maxAxialLoad: 225e3, efficiency: 0.89 },
    { id: 'BD-110', name: 'Belt Drive 110 kW',   maxTorque: 6000, maxPower: 110 * KW, maxSpeed: 400, maxAxialLoad: 270e3, efficiency: 0.86 }
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var SURVEY_PRESETS = {
    vertical: [
      { md: 0, inc: 0, azi: 0 },
      { md: 1500, inc: 0, azi: 0 }
    ],
    jtype: [
      { md: 0, inc: 0, azi: 0 }, { md: 300, inc: 0, azi: 45 }, { md: 400, inc: 6, azi: 45 },
      { md: 500, inc: 12, azi: 45 }, { md: 600, inc: 18, azi: 45 }, { md: 700, inc: 24, azi: 45 },
      { md: 800, inc: 30, azi: 45 }, { md: 1600, inc: 30, azi: 45 }
    ],
    stype: [
      { md: 0, inc: 0, azi: 0 }, { md: 250, inc: 0, azi: 120 }, { md: 350, inc: 8, azi: 120 },
      { md: 450, inc: 16, azi: 120 }, { md: 550, inc: 24, azi: 120 }, { md: 900, inc: 24, azi: 120 },
      { md: 1000, inc: 16, azi: 120 }, { md: 1100, inc: 8, azi: 120 }, { md: 1200, inc: 0, azi: 120 },
      { md: 1500, inc: 0, azi: 120 }
    ],
    horizontal: [
      { md: 0, inc: 0, azi: 0 }, { md: 400, inc: 0, azi: 270 }, { md: 500, inc: 10, azi: 270 },
      { md: 600, inc: 20, azi: 270 }, { md: 700, inc: 30, azi: 270 }, { md: 800, inc: 40, azi: 270 },
      { md: 900, inc: 50, azi: 270 }, { md: 1000, inc: 60, azi: 270 }, { md: 1100, inc: 70, azi: 270 },
      { md: 1200, inc: 80, azi: 270 }, { md: 1300, inc: 88, azi: 270 }, { md: 1800, inc: 90, azi: 270 }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function defaultProject() {
    var tub = byId(TUBING, '2-7/8');
    var drive = byId(DRIVES, 'DD-30');
    return {
      meta: { name: 'New PCP Design', well: 'Well A-01', analyst: '', notes: '' },
      unitSystem: 'metric',
      wellbore: {
        survey: clone(SURVEY_PRESETS.jtype),
        casingId: byId(CASING, '7').innerDiameter,
        tubingId: tub.innerDiameter,
        tubingOd: tub.od,
        tubingPreset: tub.id,
        casingPreset: '7',
        pumpDepth: 1100,          // MD, m
        tubingRoughness: 4.5e-5   // m, commercial steel (Moody chart); used by the Haaland friction factor
      },
      production: {
        tubingHeadPressure: 700e3,   // Pa
        casingHeadPressure: 200e3,   // Pa
        intakeMode: 'fluidLevel',    // 'fluidLevel' | 'intakePressure'
        fluidLevel: 700,             // MD, m
        intakePressure: 3000e3,      // Pa
        oilApi: 16,
        waterCut: 0.30,
        waterSg: 1.05,
        viscosityModel: 'specified', // 'specified' | 'beggsRobinson'
        fluidTemperature: 333.15,     // K, uniform screening temperature
        waterViscosity: 0.001,        // Pa·s, for optional linear mixing
        viscosity: 0.5,              // Pa·s (500 cP)
        targetRate: 60 / DAY,        // m³/s
        producedGOR: 0,              // Sm3/Sm3; 0 disables free-gas screening (opt-in)
        bubblePointPressure: 0,      // Pa; 0 disables free-gas screening (opt-in)
        gasGravity: 0.65             // dimensionless, air = 1; used only when gas screening is active
      },
      pump: Object.assign({ modelId: 'PC-30-1500' }, clone(byId(PUMPS, 'PC-30-1500'))),
      speed: 200,                    // rpm
      rods: {
        couplingSpacing: 7.62,       // m (25 ft rods); 0 => continuous rod
        frictionCoefficient: 0.25,
        sections: [
          { grade: 'HS', size: '1', length: 600 },
          { grade: 'D', size: '1', length: 0 }  // last section fills to pump depth
        ]
      },
      drive: Object.assign({ modelId: drive.id }, clone(drive)),
      limits: { rodLoadWarn: 0.80, sideLoadWarn: 900 },  // fraction of yield, N per coupling
      calc: { step: 5 }
    };
  }

  return {
    PUMPS: PUMPS, ROD_GRADES: ROD_GRADES, ROD_SIZES: ROD_SIZES, TUBING: TUBING,
    CASING: CASING, DRIVES: DRIVES, SURVEY_PRESETS: SURVEY_PRESETS,
    byId: byId, defaultProject: defaultProject, clone: clone
  };
});
