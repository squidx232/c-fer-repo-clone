PCP Designer - browser-based progressing cavity pump (PCP) system design & analysis
=====================================================================================
A web clone of the C-FER PC-PUMP style workflow (Jira WA-9). Pure HTML/CSS/JavaScript,
no build step and no external dependencies; works offline.

Run
  npm start            -> serves the app at http://localhost:8080 (python3 http.server)
  or simply open index.html in a browser.
Test
  npm test             -> engine unit tests (node --test)

Workflow (left-hand tabs)
  Project          case details, node spacing, rod-load & side-load design limits
  Wellbore         deviation survey (editable table, presets, paste import), tubing,
                   casing, pump depth; vertical-section, plan and dogleg plots
  Production/Fluid wellhead pressures, fluid level or pump intake pressure,
                   oil API, water cut, water SG, viscosity, target rate
  Pump             generic pump catalog or custom geometry, speed, solve speed for target rate
  Rod String       tapered string of sucker-rod sections (grade/size), coupling spacing
                   (0 = continuous rod), rod/tubing friction coefficient
  Surface Drive    drive catalog / ratings and utilisation bars
  Load Analysis    rod load %, torque, axial load, side load, pressure and stress vs depth
  Pump Curves      rate / torque / volumetric efficiency vs differential pressure
  Speed Sweep      rate, torque, power, rod load and efficiency vs speed
  Results Table    node-by-node results (CSV export from the toolbar)
Toolbar: New, Open/Save project (.json), Export CSV, printable Report, Metric/Imperial
units, dark mode. The current project is auto-saved in browser localStorage.

Engineering models (js/engine.js, SI internally)
  - Trajectory: minimum curvature method.
  - Fluid: dead oil + water mixture density; Newtonian viscosity; no free gas.
  - Tubing/rod annulus friction: concentric annulus, exact laminar solution or
    Blasius turbulent; coupled with the pump flow by bisection.
  - Pump: Q = q*N - slip; slip proportional to dP/dP_rated and (1 cP/mu)^0.5.
    Torque = q*dP/(2*pi) + elastomer friction torque. Rotor thrust = dP * stator cavity area.
  - Rod string: soft-string model integrated pump -> surface: buoyed weight, rod/tubing
    contact (side) loads, contact-friction torque, viscous (Couette) torque, von Mises
    stress from axial + bending + torsion, rod stretch and torsional wind-up.
  - Checks: pump lift rating, volumetric efficiency, rod load, side load, coupling fit,
    drive torque / power / speed / thrust-bearing ratings, pumped-off condition.

Limitations: screening-level results; pump catalog values are generic/illustrative and
not manufacturer data. Results must be verified by a qualified engineer.

Layout
  index.html, css/styles.css
  js/units.js    unit conversion (metric / imperial)
  js/catalog.js  pumps, rods, tubing, casing, drives, survey presets, default project
  js/engine.js   calculation engine (UMD: browser global + Node module)
  js/charts.js   dependency-free canvas charts with hover read-out
  js/app.js      UI controller
  tests/         node:test unit tests
