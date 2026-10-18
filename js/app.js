/* PCP Designer — UI controller */
(function () {
  'use strict';

  var U = window.PCPUnits, C = window.PCPCatalog, E = window.PCPEngine, Chart = window.PCPChart;
  var STORAGE_KEY = 'pcp-designer-project-v1';
  var THEME_KEY = 'pcp-designer-theme';

  var state = {
    project: loadStored() || C.defaultProject(),
    result: null,
    tab: 'project',
    depthAxis: 'md',
    tableStride: 4
  };

  // ------------------------------------------------------------------ utils

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c !== null && c !== undefined) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) {
    var ks = p.split('.'), last = ks.pop();
    var t = ks.reduce(function (a, k) { if (a[k] == null) a[k] = {}; return a[k]; }, o);
    t[last] = v;
  }
  function sys() { return state.project.unitSystem; }
  function uu(q) { return U.unit(q, sys()); }
  function disp(v, q) { return U.toDisplay(v, q, sys()); }
  function f(v, q, digits) { return U.format(v, q, sys(), digits); }
  function clean(v) { return isFinite(v) ? String(+(+v).toPrecision(6)) : ''; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function loadStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function store() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project)); } catch (e) { /* ignore quota */ }
  }
  /** Fill any missing keys from the default project so older files keep working. */
  function migrate(p) {
    var d = C.defaultProject();
    (function merge(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (dst[k] === undefined) dst[k] = src[k];
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof dst[k] === 'object') merge(dst[k], src[k]);
      });
    })(p, d);
    return p;
  }

  // ------------------------------------------------------------------ form fields

  /**
   * Numeric field bound to a project path (value stored in SI).
   * opts: { min, max, hint, readonly, value (getter), onchange, step }
   */
  function numField(path, label, quantity, opts) {
    opts = opts || {};
    var unitTxt = uu(quantity);
    var value = opts.value ? opts.value() : getPath(state.project, path);
    var input = el('input', { type: 'number', step: opts.step || 'any', value: clean(disp(value, quantity)), readonly: !!opts.readonly, 'aria-label': label });
    input.addEventListener('change', function () {
      var v = parseFloat(input.value);
      var si = U.fromDisplay(v, quantity, sys());
      var bad = !isFinite(v) || (opts.min !== undefined && si < opts.min) || (opts.max !== undefined && si > opts.max);
      input.classList.toggle('invalid', bad);
      if (bad) return;
      setPath(state.project, path, si);
      if (opts.onchange) opts.onchange(si);
      recompute();
    });
    var ctrl = el('div', { class: 'ctrl' + (unitTxt ? ' has-unit' : '') }, [input, unitTxt ? el('span', { class: 'unit', text: unitTxt }) : null]);
    return el('div', { class: 'field' }, [el('label', { text: label }), ctrl, opts.hint ? el('span', { class: 'hint', text: opts.hint }) : null]);
  }

  function readField(label, text, hint) {
    return el('div', { class: 'field' }, [
      el('label', { text: label }),
      el('div', { class: 'ctrl' }, [el('input', { type: 'text', readonly: true, value: text })]),
      hint ? el('span', { class: 'hint', text: hint }) : null
    ]);
  }

  function selectField(label, options, value, onchange, hint) {
    var s = el('select', { 'aria-label': label });
    options.forEach(function (o) { s.appendChild(el('option', { value: o.value, text: o.label, selected: o.value === value })); });
    s.addEventListener('change', function () { onchange(s.value); });
    return el('div', { class: 'field' }, [el('label', { text: label }), el('div', { class: 'ctrl' }, [s]), hint ? el('span', { class: 'hint', text: hint }) : null]);
  }

  function textField(path, label, multiline) {
    var input = el(multiline ? 'textarea' : 'input', { type: 'text', rows: multiline ? 4 : undefined, 'aria-label': label });
    input.value = getPath(state.project, path) || '';
    input.addEventListener('change', function () { setPath(state.project, path, input.value); store(); if (path === 'meta.name') $('#projectName').value = input.value; });
    return el('div', { class: 'field' }, [el('label', { text: label }), el('div', { class: 'ctrl' }, [input])]);
  }

  function card(title, children, extra) {
    return el('div', { class: 'card' }, [title ? el('h3', { text: title }) : null].concat(children || []).concat(extra || []));
  }
  function grid(children) { return el('div', { class: 'form-grid' }, children); }
  function header(title, lead) { return [el('h2', { text: title }), lead ? el('p', { class: 'lead', text: lead }) : null]; }

  function chartBox(id, tall) {
    return el('div', { class: 'chart-box' + (tall ? ' tall' : '') }, [el('canvas', { id: id })]);
  }

  // ------------------------------------------------------------------ PANELS (part 2)
  function renderProject() {
    var p = $('#tab-project'); p.innerHTML = '';
    header('Project', 'General information about the well and this design case.').forEach(function (n) { if (n) p.appendChild(n); });
    p.appendChild(card('Case details', [grid([
      textField('meta.name', 'Design name'),
      textField('meta.well', 'Well / UWI'),
      textField('meta.analyst', 'Analyst')
    ]), el('div', { style: 'margin-top:10px' }, [textField('meta.notes', 'Notes', true)])]));
    p.appendChild(card('Calculation settings', [grid([
      numField('calc.step', 'Node spacing along rod string', 'length', { min: 0.5, max: 100, hint: 'Smaller spacing = finer resolution, slower calculation.' }),
      numField('limits.rodLoadWarn', 'Rod load design limit', 'percent', { min: 0.05, max: 1.5, hint: 'Combined (von Mises) stress as % of minimum yield.' }),
      numField('limits.sideLoadWarn', 'Side-load limit per coupling', 'sideLoad', { min: 0, hint: 'Rod/tubing contact load flagged as wear risk.' })
    ])]));
    p.appendChild(card('Workflow', [el('ol', { class: 'msgs', html:
      '<li>Define the <b>Wellbore</b>: deviation survey, tubing and casing, pump landing depth.</li>' +
      '<li>Enter <b>Production &amp; Fluid</b> conditions: wellhead pressures, fluid level, oil/water properties.</li>' +
      '<li>Select a <b>Pump</b> and operating speed (or solve speed for a target rate).</li>' +
      '<li>Configure the <b>Rod String</b> and the <b>Surface Drive</b>.</li>' +
      '<li>Review <b>Load Analysis</b>, <b>Pump Curves</b> and the <b>Speed Sweep</b>; print a <b>Report</b>.</li>' }) ]));
  }

  // ------------------------------------------------------------------ wellbore

  function renderWellbore() {
    var p = $('#tab-wellbore'); p.innerHTML = '';
    var wb = state.project.wellbore;
    header('Wellbore', 'Deviation survey (minimum curvature), completion and pump landing depth.').forEach(function (n) { if (n) p.appendChild(n); });

    var tubOpts = C.TUBING.map(function (t) { return { value: t.id, label: t.name }; }).concat([{ value: 'custom', label: 'Custom' }]);
    var casOpts = C.CASING.map(function (t) { return { value: t.id, label: t.name }; }).concat([{ value: 'custom', label: 'Custom' }]);
    var pumpTvd = E.tvdAt(wb.survey, wb.pumpDepth);
    p.appendChild(card('Completion', [grid([
      selectField('Tubing', tubOpts, wb.tubingPreset || 'custom', function (v) {
        wb.tubingPreset = v;
        var t = C.byId(C.TUBING, v);
        if (t) { wb.tubingId = t.innerDiameter; wb.tubingOd = t.od; }
        renderWellbore(); recompute();
      }),
      numField('wellbore.tubingId', 'Tubing ID', 'diameter', { min: 0.01, onchange: function () { wb.tubingPreset = 'custom'; } }),
      numField('wellbore.tubingOd', 'Tubing OD', 'diameter', { min: 0.01, onchange: function () { wb.tubingPreset = 'custom'; } }),
      selectField('Casing', casOpts, wb.casingPreset || 'custom', function (v) {
        wb.casingPreset = v;
        var c = C.byId(C.CASING, v);
        if (c) wb.casingId = c.innerDiameter;
        renderWellbore(); recompute();
      }),
      numField('wellbore.casingId', 'Casing ID', 'diameter', { min: 0.02, onchange: function () { wb.casingPreset = 'custom'; } }),
      numField('wellbore.pumpDepth', 'Pump intake depth (MD)', 'length', { min: 1, onchange: function () { renderWellbore(); } }),
      readField('Pump intake depth (TVD)', f(pumpTvd, 'length'))
    ])]));

    // survey table
    var tbl = el('table', { class: 'edit' });
    tbl.appendChild(el('thead', null, [el('tr', null, [
      el('th', { text: '#' }), el('th', { text: 'MD (' + uu('length') + ')' }), el('th', { text: 'Inclination (°)' }),
      el('th', { text: 'Azimuth (°)' }), el('th', { text: 'TVD (' + uu('length') + ')' }), el('th', { text: 'DLS (' + uu('dogleg') + ')' }), el('th', { text: '' })
    ])]));
    var traj = E.trajectory(wb.survey);
    var tb = el('tbody');
    wb.survey.forEach(function (row, i) {
      var t = traj.filter(function (s) { return Math.abs(s.md - row.md) < 1e-6; })[0];
      function cell(key, q) {
        var inp = el('input', { type: 'number', step: 'any', value: clean(q ? disp(row[key], q) : row[key]) });
        inp.addEventListener('change', function () {
          var v = parseFloat(inp.value);
          if (!isFinite(v) || (key !== 'md' && (v < 0 || (key === 'inc' && v > 180)))) { inp.classList.add('invalid'); return; }
          row[key] = q ? U.fromDisplay(v, q, sys()) : v;
          renderWellbore(); recompute();
        });
        return el('td', null, [inp]);
      }
      tb.appendChild(el('tr', null, [
        el('td', { text: String(i + 1) }), cell('md', 'length'), cell('inc'), cell('azi'),
        el('td', { text: t ? U.format(t.tvd, 'length', sys(), undefined, false) : '—' }),
        el('td', { text: t ? U.format(t.dls, 'dogleg', sys(), 2, false) : '—' }),
        el('td', null, [el('button', { class: 'btn danger', type: 'button', text: '✕', title: 'Delete station', onclick: function () {
          if (wb.survey.length <= 1) return;
          wb.survey.splice(i, 1); renderWellbore(); recompute();
        } })])
      ]));
    });
    tbl.appendChild(tb);

    var presetBtns = [['vertical', 'Vertical'], ['jtype', 'J-type (build & hold)'], ['stype', 'S-type'], ['horizontal', 'Horizontal']].map(function (pr) {
      return el('button', { class: 'btn', type: 'button', text: pr[1], onclick: function () {
        wb.survey = C.clone(C.SURVEY_PRESETS[pr[0]]);
        var last = wb.survey[wb.survey.length - 1].md;
        if (wb.pumpDepth > last) wb.pumpDepth = Math.round(last * 0.9);
        renderWellbore(); recompute();
      } });
    });
    var paste = el('textarea', { class: 'paste', placeholder: 'Paste survey: MD  Inclination  Azimuth (one station per line; tab, comma or space separated; MD in ' + uu('length') + ')' });
    var surveyCard = card('Deviation survey', [
      el('div', { class: 'btn-row' }, [el('span', { class: 'pill', text: 'Presets' })].concat(presetBtns)),
      el('div', { class: 'table-wrap', style: 'max-height:360px' }, [tbl]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', type: 'button', text: '+ Add station', onclick: function () {
          var last = wb.survey[wb.survey.length - 1] || { md: 0, inc: 0, azi: 0 };
          wb.survey.push({ md: last.md + 100, inc: last.inc, azi: last.azi }); renderWellbore(); recompute();
        } }),
        el('button', { class: 'btn', type: 'button', text: 'Sort by MD', onclick: function () {
          wb.survey.sort(function (a, b) { return a.md - b.md; }); renderWellbore();
        } })
      ]),
      el('details', null, [el('summary', { text: 'Import survey from text' }), paste,
        el('div', { class: 'btn-row' }, [el('button', { class: 'btn primary', type: 'button', text: 'Replace survey', onclick: function () {
          var rows = parseSurveyText(paste.value);
          if (rows.length < 2) { alert('Could not find at least two valid survey stations.'); return; }
          wb.survey = rows; renderWellbore(); recompute();
        } })])])
    ]);
    p.appendChild(surveyCard);

    p.appendChild(el('div', { class: 'chart-grid' }, [chartBox('chVs', true), chartBox('chPlan', true), chartBox('chDls', true)]));
    drawWellboreCharts();
  }

  function parseSurveyText(txt) {
    var rows = [];
    txt.split(/\r?\n/).forEach(function (line) {
      var parts = line.trim().split(/[\s,;]+/).map(parseFloat);
      if (parts.length >= 3 && parts.slice(0, 3).every(isFinite)) {
        rows.push({ md: U.fromDisplay(parts[0], 'length', sys()), inc: parts[1], azi: parts[2] });
      }
    });
    return E.normalizeSurvey(rows);
  }

  function drawWellboreCharts() {
    var wb = state.project.wellbore;
    var nodes = E.buildNodes(wb.survey, Math.max(wb.pumpDepth, E.normalizeSurvey(wb.survey).slice(-1)[0].md), 10);
    var pumpNode = E.buildNodes(wb.survey, wb.pumpDepth, 10).slice(-1)[0];
    var L = 'length';
    var vsPts = nodes.map(function (n) { return [disp(Math.hypot(n.north, n.east), L), disp(n.tvd, L)]; });
    var c1 = $('#chVs');
    if (c1) Chart.draw(c1, {
      title: 'Vertical section', xLabel: 'Horizontal departure (' + uu(L) + ')', yLabel: 'TVD (' + uu(L) + ')', invertY: true, xMin: 0,
      series: [{ name: 'Wellbore', points: vsPts, color: '#0b5cad', width: 3 }],
      markers: [{ x: disp(Math.hypot(pumpNode.north, pumpNode.east), L), y: disp(pumpNode.tvd, L), label: 'Pump', color: '#cf222e' }]
    });
    var c2 = $('#chPlan');
    if (c2) Chart.draw(c2, {
      title: 'Plan view', xLabel: 'East (' + uu(L) + ')', yLabel: 'North (' + uu(L) + ')', equalAspect: true,
      series: [{ name: 'Wellbore', points: nodes.map(function (n) { return [disp(n.east, L), disp(n.north, L)]; }), color: '#0b5cad', width: 3 }],
      markers: [{ x: 0, y: 0, label: 'Surface', color: '#2da44e' }, { x: disp(pumpNode.east, L), y: disp(pumpNode.north, L), label: 'Pump', color: '#cf222e' }]
    });
    var c3 = $('#chDls');
    if (c3) Chart.draw(c3, {
      title: 'Dogleg severity', xLabel: 'DLS (' + uu('dogleg') + ')', yLabel: 'MD (' + uu(L) + ')', invertY: true, xMin: 0,
      series: [{ name: 'DLS', points: nodes.map(function (n) { return [disp(n.dls, 'dogleg'), disp(n.md, L)]; }), color: '#8250df' }],
      refLines: [{ y: disp(wb.pumpDepth, L), label: 'Pump', color: '#cf222e' }]
    });
  }

  // ------------------------------------------------------------------ production

  function renderProduction() {
    var p = $('#tab-production'); p.innerHTML = '';
    var pr = state.project.production;
    header('Production & Fluid', 'Wellhead pressures, pump intake condition and produced fluid properties.').forEach(function (n) { if (n) p.appendChild(n); });
    var fl;
    try { fl = E.fluidProps(pr); }
    catch (error) { fl = { oilSg: E.oilSg(pr.oilApi), density: NaN, viscosity: NaN }; }
    p.appendChild(card('Pressures', [grid([
      numField('production.tubingHeadPressure', 'Tubing head pressure', 'pressure', { min: 0 }),
      numField('production.casingHeadPressure', 'Casing head pressure', 'pressure', { min: 0 }),
      selectField('Pump intake specified by', [{ value: 'fluidLevel', label: 'Annular fluid level' }, { value: 'intakePressure', label: 'Pump intake pressure' }],
        pr.intakeMode, function (v) { pr.intakeMode = v; renderProduction(); recompute(); }),
      pr.intakeMode === 'fluidLevel'
        ? numField('production.fluidLevel', 'Fluid level from surface (MD)', 'length', { min: 0 })
        : numField('production.intakePressure', 'Pump intake pressure', 'pressure', { min: 0 })
    ])]));
    p.appendChild(card('Fluid', [grid([
      numField('production.oilApi', 'Oil gravity', 'none', { min: 5, max: 60, hint: '°API', onchange: function () { renderProduction(); } }),
      numField('production.waterCut', 'Water cut', 'percent', { min: 0, max: 1, onchange: function () { renderProduction(); } }),
      numField('production.waterSg', 'Water specific gravity', 'none', { min: 0.95, max: 1.3, onchange: function () { renderProduction(); } }),
      selectField('Viscosity model', [{ value: 'specified', label: 'Specified mixture viscosity (existing model)' }, { value: 'beggsRobinson', label: 'Beggs–Robinson oil + linear water mixing' }], pr.viscosityModel || 'specified', function (v) { pr.viscosityModel = v; renderProduction(); recompute(); }),
      (pr.viscosityModel || 'specified') === 'specified'
        ? numField('production.viscosity', 'Effective fluid viscosity at pump', 'viscosity', { min: 1e-4, hint: 'Newtonian viscosity of the produced emulsion/mixture.' })
        : numField('production.fluidTemperature', 'Uniform fluid temperature', 'temperature', { min: 260, max: 600, onchange: function () { renderProduction(); } }),
      pr.viscosityModel === 'beggsRobinson' ? numField('production.waterViscosity', 'Water viscosity at fluid temperature', 'viscosity', { min: 1e-4, onchange: function () { renderProduction(); } }) : null,
      pr.viscosityModel === 'beggsRobinson' ? readField('Calculated effective mixture viscosity', f(fl.viscosity, 'viscosity'), 'Uniform temperature; no gas, emulsion inversion or thermal profile. Viscosity floor: 0.1 cP.') : null,
      readField('Oil specific gravity', U.fmtNumber(fl.oilSg, 4)),
      readField('Mixture density', f(fl.density, 'density')),
      readField('Mixture gradient', U.format(fl.density * E.constants.G * (sys() === 'metric' ? 1 / 1000 : 0.3048 / 6894.757293), 'none', sys(), 4, false) + (sys() === 'metric' ? ' kPa/m' : ' psi/ft'))
    ])]));
    p.appendChild(card('Production target', [grid([
      numField('production.targetRate', 'Target production rate', 'flow', { min: 0, hint: 'Use "Solve speed" on the Pump tab to find the speed for this rate.' })
    ])]));
  }

  // ------------------------------------------------------------------ pump

  function equipmentList(kind) {
    return window.PCPEquipment.list(state.project, kind);
  }

  function saveEquipment(kind) {
    var item = C.clone(kind === 'pumps' ? state.project.pump : state.project.drive);
    if (!state.project.equipmentLibrary) state.project.equipmentLibrary = {};
    var list = state.project.equipmentLibrary[kind] || [];
    var id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    item.id = id; item.modelId = id;
    list.push(item); state.project.equipmentLibrary[kind] = list;
    if (kind === 'pumps') state.project.pump = C.clone(item); else state.project.drive = C.clone(item);
    recompute(); activate(state.tab);
  }

  function renderPump() {
    var p = $('#tab-pump'); p.innerHTML = '';
    var pm = state.project.pump;
    header('Pump', 'Progressing cavity pump geometry, ratings and operating speed.').forEach(function (n) { if (n) p.appendChild(n); });
    var opts = equipmentList('pumps').map(function (x) { return { value: x.id, label: x.name + '  (' + U.format(x.displacement, 'displacement', sys(), 1) + ', ' + U.format(x.ratedLift, 'head', sys(), 0) + ' lift)' }; })
      .concat([{ value: 'custom', label: 'Custom / modified' }]);
    function markCustom() { pm.modelId = 'custom'; var s = $('#pumpModelSel select'); if (s) s.value = 'custom'; }
    var sel = selectField('Pump model', opts, pm.modelId, function (v) {
      var c = C.byId(equipmentList('pumps'), v);
      if (c) state.project.pump = Object.assign({ modelId: v }, C.clone(c));
      else pm.modelId = 'custom';
      renderPump(); recompute();
    }, 'Generic illustrative catalog: name = displacement (m³/d @100 rpm) – rated lift (m).');
    sel.id = 'pumpModelSel';
    p.appendChild(card('Pump selection', [grid([
      sel,
      textField('pump.name', 'Pump model / manufacturer name'),
      textField('pump.elastomer', 'Elastomer description (metadata only)'),
      numField('pump.displacement', 'Displacement', 'displacement', { min: 1e-9, onchange: markCustom }),
      numField('pump.ratedLift', 'Rated lift (water)', 'head', { min: 1, onchange: markCustom }),
      numField('pump.rotorDiameter', 'Rotor minor diameter', 'diameter', { min: 0.005, onchange: markCustom }),
      numField('pump.eccentricity', 'Eccentricity', 'diameter', { min: 0, onchange: markCustom }),
      (pm.frictionModel || 'specified') === 'specified' ? numField('pump.frictionTorque', 'Pump friction torque', 'torque', { min: 0, onchange: markCustom, hint: 'Rotor/stator interference torque.' }) : null,
      numField('pump.slipAtRated', 'Slip at rated lift (1 cP)', 'flow', { min: 0, onchange: markCustom, hint: 'Used by the legacy model only; corrected using the reference viscosity and exponent below.' }),
      numField('pump.maxSpeed', 'Max recommended speed', 'speed', { min: 1, onchange: markCustom }),
      readField('Displacement per revolution', (sys() === 'metric' ? U.fmtNumber(E.displacementPerRev(pm) * 1e6, 1) + ' cm³/rev' : U.fmtNumber(E.displacementPerRev(pm) / 1.6387064e-5, 2) + ' in³/rev')),
      readField('Rated differential pressure', f(E.ratedPressure(pm), 'pressure'))
    ])]));

    p.appendChild(el('div', { class: 'btn-row' }, [el('button', { class: 'btn', text: 'Save pump to project library', onclick: function () { saveEquipment('pumps'); } })]));
    var guidance = E.frictionGuidance(pm);
    var frictionFields = [selectField('Pump friction model', [
      { value: 'specified', label: 'Specified friction torque (existing model)' },
      { value: 'ratedFraction', label: 'Fraction of rated hydraulic torque (estimate)' }
    ], pm.frictionModel || 'specified', function (v) {
      pm.frictionModel = v;
      if (v === 'ratedFraction' && pm.frictionFraction === undefined) {
        var ratedTorque = E.displacementPerRev(pm) * E.ratedPressure(pm) / (2 * Math.PI);
        pm.frictionFraction = ratedTorque > 0 ? (pm.frictionTorque || 0) / ratedTorque : 0;
      }
      renderPump(); recompute();
    })];
    if (pm.frictionModel === 'ratedFraction') {
      frictionFields.push(numField('pump.frictionFraction', 'Friction fraction of rated hydraulic torque', 'percent', { min: 0, onchange: function () { renderPump(); } }),
        readField('Estimated pump friction torque', f(E.pumpTorque(pm, 0).friction, 'torque')));
    }
    p.appendChild(card('Pump friction estimate', [grid(frictionFields), el('p', { class: 'hint', text: 'Manual guidance for ' + guidance.category + ' pumps: ' + (guidance.minFraction * 100) + '–' + (guidance.maxFraction * 100) + '% of hydraulic torque at rated pressure. Guidance assumes standard fit/geometries and medium NBR; it is not a swell or temperature model. Switching to estimate mode initially preserves the specified torque.' })]));

    var model = pm.performanceModel || 'legacy';
    var performanceFields = [selectField('Performance model', [
      { value: 'legacy', label: 'Legacy rated-slip model (existing projects)' },
      { value: 'linear', label: 'Linear pressure-dependent efficiency' },
      { value: 'quadratic', label: 'Quadratic pressure-dependent efficiency' },
      { value: 'constant', label: 'Constant volumetric efficiency' }
    ], model, function (v) {
      pm.performanceModel = v;
      if (pm.referenceSpeed === undefined) pm.referenceSpeed = 100;
      if (pm.referenceViscosity === undefined) pm.referenceViscosity = 0.001;
      if (pm.viscosityExponent === undefined) pm.viscosityExponent = v === 'legacy' ? 0.5 : 0.33;
      if (pm.efficiencyAtZero === undefined) pm.efficiencyAtZero = 1;
      if (pm.efficiencyAtRated === undefined) pm.efficiencyAtRated = 0.4;
      renderPump(); recompute();
    })];
    if (model === 'linear' || model === 'quadratic') {
      performanceFields.push(
        numField('pump.referenceSpeed', 'Efficiency reference speed', 'speed', { min: 1 }),
        numField('pump.efficiencyAtZero', 'Efficiency at zero differential pressure', 'percent', { min: 0, max: 1 }),
        numField('pump.efficiencyAtRated', 'Efficiency at rated differential pressure', 'percent', { min: 0, max: 1 })
      );
    } else if (model === 'constant') {
      performanceFields.push(numField('pump.efficiencyAtRated', 'Constant volumetric efficiency', 'percent', { min: 0, max: 1 }));
    }
    if (model !== 'constant') {
      performanceFields.push(
        numField('pump.referenceViscosity', 'Slip reference viscosity', 'viscosity', { min: 0.0001, value: function () { return pm.referenceViscosity === undefined ? 0.001 : pm.referenceViscosity; } }),
        numField('pump.viscosityExponent', 'Slip viscosity exponent', 'none', { min: 0, max: 1, value: function () { return pm.viscosityExponent === undefined ? (model === 'legacy' ? 0.5 : 0.33) : pm.viscosityExponent; }, hint: '0 disables viscosity correction; documented PC-PUMP default is 0.33. Calibrate against measured data.' })
      );
    }
    p.appendChild(card('Volumetric performance', [grid(performanceFields), el('p', { class: 'hint', text: 'Linear/quadratic models convert reference-speed efficiency to speed-independent slip, then apply (reference viscosity / fluid viscosity)^exponent. Existing files retain the original 0.5 exponent. These equations have been traced; full PC-PUMP system parity has not been validated.' })]));

    var res = el('span', { class: 'hint' });
    p.appendChild(card('Operating speed', [grid([
      numField('speed', 'Rotational speed', 'speed', { min: 1, max: 1500 }),
      el('div', { class: 'field' }, [el('label', { text: 'Target rate ' + f(state.project.production.targetRate, 'flow') }),
        el('div', { class: 'ctrl' }, [el('button', { class: 'btn primary', type: 'button', text: 'Solve speed for target rate', onclick: function () {
          var maxN = Math.max(pm.maxSpeed || 500, 50) * 2;
          var n = E.solveSpeedForRate(state.project, state.project.production.targetRate, maxN);
          if (n === null) { res.textContent = 'Target rate cannot be reached below ' + maxN.toFixed(0) + ' rpm with this pump.'; return; }
          state.project.speed = Math.round(n * 10) / 10;
          renderPump(); recompute();
        } })]), res])
    ])]));
  }

  // ------------------------------------------------------------------ rods

  function renderRods() {
    var p = $('#tab-rods'); p.innerHTML = '';
    var rods = state.project.rods;
    header('Rod String', 'Rod sections from surface (top) to pump (bottom). The bottom section automatically extends to the pump depth.').forEach(function (n) { if (n) p.appendChild(n); });
    p.appendChild(card('String properties', [grid([
      numField('rods.couplingSpacing', 'Coupling spacing (rod length)', 'length', { min: 0, hint: 'Set 0 for continuous rod (no couplings).', onchange: function () { renderRods(); } }),
      numField('rods.frictionCoefficient', 'Rod/tubing friction coefficient', 'none', { min: 0, max: 1.5, hint: 'Typical 0.2 (lubricated) – 0.35 (dry/sandy).' })
    ])]));

    var resolved = E.resolveRodSections(state.project).sections;
    var gradeOpts = equipmentList('rodGrades').map(function (g) { return { value: g.id, label: g.name }; }).concat([{ value: 'custom', label: 'Custom material' }]);
    var sizeOpts = equipmentList('rodSizes').map(function (s) { return { value: s.id, label: s.name }; }).concat([{ value: 'custom', label: 'Custom dimensions' }]);
    var tbl = el('table', { class: 'edit' });
    tbl.appendChild(el('thead', null, [el('tr', null, ['#', 'Grade', 'Size', 'Length (' + uu('length') + ')', 'Top – Bottom MD', 'Body Ø (' + uu('diameter') + ')',
      'Coupling OD (' + uu('diameter') + ')', 'Weight (' + uu('massLength') + ')', 'Min. yield (' + uu('stress') + ')', ''].map(function (h) { return el('th', { text: h }); }))]));
    var tb = el('tbody');
    var continuous = !(rods.couplingSpacing > 0);
    rods.sections.forEach(function (s, i) {
      var r = resolved.filter(function (x) { return x.index === i; })[0];
      var isLast = i === rods.sections.length - 1;
      function sel(opts, key) {
        var e = el('select');
        opts.forEach(function (o) { e.appendChild(el('option', { value: o.value, text: o.label, selected: o.value === s[key] })); });
        e.addEventListener('change', function () {
          if (e.value === 'custom' && key === 'size') {
            var base = C.byId(equipmentList('rodSizes'), s.size) || C.ROD_SIZES[2];
            s.diameter = base.diameter; s.couplingOd = base.couplingOd; s.massPerLength = base.massPerLength;
          }
          if (e.value === 'custom' && key === 'grade') {
            var material = C.byId(equipmentList('rodGrades'), s.grade) || C.ROD_GRADES[2];
            s.yieldStrength = material.yield; s.tensileStrength = material.tensile;
          }
          if (e.value !== 'custom' && key === 'size') { delete s.diameter; delete s.couplingOd; delete s.massPerLength; }
          s[key] = e.value; renderRods(); recompute();
        });
        return e;
      }
      var len = el('input', { type: 'number', step: 'any', value: clean(disp(isLast ? (r ? r.length : 0) : s.length, 'length')), readonly: isLast, title: isLast ? 'Bottom section fills to pump depth' : '' });
      len.addEventListener('change', function () {
        var v = parseFloat(len.value);
        if (!isFinite(v) || v < 0) { len.classList.add('invalid'); return; }
        s.length = U.fromDisplay(v, 'length', sys()); renderRods(); recompute();
      });
      var size = C.byId(equipmentList('rodSizes'), s.size), grade = C.byId(equipmentList('rodGrades'), s.grade);
      tb.appendChild(el('tr', null, [
        el('td', { text: String(i + 1) }), el('td', null, [sel(gradeOpts, 'grade')]), el('td', null, [sel(sizeOpts, 'size')]), el('td', null, [len]),
        el('td', { text: r ? U.format(r.top, 'length', sys(), 0, false) + ' – ' + U.format(r.bottom, 'length', sys(), 0, false) : 'not used' }),
        el('td', { text: size ? U.format(size.diameter, 'diameter', sys(), 2, false) : '' }),
        el('td', { text: continuous ? '—' : (size ? U.format(size.couplingOd, 'diameter', sys(), 2, false) : '') }),
        el('td', { text: r ? U.format(r.massPerLength, 'massLength', sys(), 2, false) : '' }),
        el('td', { text: grade ? U.format(grade.yield, 'stress', sys(), 0, false) : '' }),
        el('td', null, [el('button', { class: 'btn danger', type: 'button', text: '✕', title: 'Remove section', onclick: function () {
          if (rods.sections.length <= 1) return;
          rods.sections.splice(i, 1); renderRods(); recompute();
        } })])
      ]));
    });
    tbl.appendChild(tb);
    var customSections = [];
    rods.sections.forEach(function (s, i) {
      var fields = [];
      var prefix = 'rods.sections.' + i + '.';
      if (s.size === 'custom') fields = fields.concat([
        textField(prefix + 'sizeName', 'Section ' + (i + 1) + ' size name'),
        numField(prefix + 'diameter', 'Section ' + (i + 1) + ' body diameter', 'diameter', { min: 0.001 }),
        numField(prefix + 'couplingOd', 'Section ' + (i + 1) + ' coupling diameter', 'diameter', { min: 0.001 }),
        numField(prefix + 'massPerLength', 'Section ' + (i + 1) + ' mass per length', 'massLength', { min: 0.001 })
      ]);
      if (s.grade === 'custom') fields = fields.concat([
        textField(prefix + 'gradeName', 'Section ' + (i + 1) + ' material name'),
        numField(prefix + 'yieldStrength', 'Section ' + (i + 1) + ' yield strength', 'stress', { min: 1 }),
        numField(prefix + 'tensileStrength', 'Section ' + (i + 1) + ' tensile strength', 'stress', { min: 1 })
      ]);
      if (fields.length) customSections.push(card('Custom properties — section ' + (i + 1), [grid(fields)]));
    });
    p.appendChild(card('Rod sections (top → bottom)', [
      el('div', { class: 'table-wrap' }, [tbl]),
      el('div', { class: 'btn-row' }, [el('button', { class: 'btn', type: 'button', text: '+ Add section above bottom', onclick: function () {
        var last = rods.sections[rods.sections.length - 1];
        rods.sections.splice(rods.sections.length - 1, 0, { grade: last.grade, size: last.size, length: 100 });
        renderRods(); recompute();
      } })])
    ]));
    customSections.forEach(function (section) { p.appendChild(section); });
  }

  // ------------------------------------------------------------------ drive

  function renderDrive() {
    var p = $('#tab-drive'); p.innerHTML = '';
    var dr = state.project.drive;
    header('Surface Drive', 'Drive head and motor ratings used to check the polished-rod loads.').forEach(function (n) { if (n) p.appendChild(n); });
    var opts = equipmentList('drives').map(function (d) { return { value: d.id, label: d.name }; }).concat([{ value: 'custom', label: 'Custom / modified' }]);
    function markCustom() { dr.modelId = 'custom'; }
    p.appendChild(card('Drive selection', [grid([
      selectField('Drive model', opts, dr.modelId, function (v) {
        var d = C.byId(equipmentList('drives'), v);
        if (d) state.project.drive = Object.assign({ modelId: v }, C.clone(d)); else dr.modelId = 'custom';
        renderDrive(); recompute();
      }),
      textField('drive.name', 'Drive model / manufacturer name'),
      numField('drive.maxTorque', 'Max torque', 'torque', { min: 1, onchange: markCustom }),
      numField('drive.maxPower', 'Motor power rating', 'power', { min: 1, onchange: markCustom }),
      numField('drive.maxSpeed', 'Max speed', 'speed', { min: 1, onchange: markCustom }),
      numField('drive.maxAxialLoad', 'Thrust bearing rating', 'force', { min: 1, onchange: markCustom }),
      numField('drive.efficiency', 'Drive + motor efficiency', 'percent', { min: 0.1, max: 1, onchange: markCustom })
    ])]));
    p.appendChild(el('div', { class: 'btn-row' }, [el('button', { class: 'btn', text: 'Save drive to project library', onclick: function () { saveEquipment('drives'); } })]));
    var util = el('div');
    p.appendChild(card('Drive utilisation', [util]));
    renderDriveUtil(util);
  }

  function renderDriveUtil(container) {
    container = container || $('#tab-drive .card:last-child > div');
    if (!container) return;
    container.innerHTML = '';
    var r = state.result, dr = state.project.drive;
    if (!r || !r.ok) { container.textContent = 'No valid result.'; return; }
    [['Torque', r.surface.torque, dr.maxTorque, 'torque'], ['Power', r.surface.motorPower, dr.maxPower, 'power'],
      ['Speed', r.speed, dr.maxSpeed, 'speed'], ['Axial load', r.surface.axialLoad, dr.maxAxialLoad, 'force']].forEach(function (x) {
      container.appendChild(utilBar(x[0], x[1], x[2], x[3]));
    });
  }

  function utilBar(label, value, limit, q, warnAt) {
    var ratio = limit > 0 ? value / limit : 0;
    var cls = ratio > 1 ? 'err' : ratio > (warnAt || 0.85) ? 'warn' : '';
    return el('div', null, [
      el('div', { class: 'kpi' + (cls === 'err' ? ' bad' : cls ? ' warn' : '') }, [el('span', { text: label }),
        el('span', { text: f(value, q) + ' / ' + f(limit, q) + ' (' + (ratio * 100).toFixed(0) + '%)' })]),
      el('div', { class: 'bar' }, [el('div', { class: cls, style: 'width:' + Math.min(100, ratio * 100).toFixed(1) + '%' })])
    ]);
  }

  // ------------------------------------------------------------------ results

  function depthOf(n) { return disp(state.depthAxis === 'tvd' ? n.tvd : n.md, 'length'); }
  function depthLabel() { return (state.depthAxis === 'tvd' ? 'TVD' : 'MD') + ' (' + uu('length') + ')'; }

  function renderResults() {
    var p = $('#tab-results'); p.innerHTML = '';
    header('Load Analysis', 'Rod string loads from pump to surface (soft-string model).').forEach(function (n) { if (n) p.appendChild(n); });
    var r = state.result;
    if (!r || !r.ok) { p.appendChild(card(null, [el('p', { text: 'Resolve the input errors to see results.' })])); return; }
    p.appendChild(el('div', { class: 'btn-row' }, [
      selectField('Depth axis', [{ value: 'md', label: 'Measured depth' }, { value: 'tvd', label: 'True vertical depth' }], state.depthAxis, function (v) { state.depthAxis = v; renderResults(); })
    ]));
    p.appendChild(el('div', { class: 'chart-grid' }, ['chLoad', 'chTorque', 'chAxial', 'chSide', 'chPress', 'chStress'].map(function (id) { return chartBox(id, true); })));

    var N = r.nodes, D = depthLabel();
    var lim = state.project.limits;
    var bounds = r.sections.slice(0, -1).map(function (s) { return { y: disp(state.depthAxis === 'tvd' ? E.tvdAt(state.project.wellbore.survey, s.bottom) : s.bottom, 'length'), color: '#8c959f', label: 'Rod taper' }; });
    Chart.draw($('#chLoad'), {
      title: 'Rod load (combined stress / yield)', xLabel: 'Rod load (%)', yLabel: D, invertY: true, xMin: 0,
      series: [{ name: 'Rod load', points: N.map(function (n) { return [n.loadRatio * 100, depthOf(n)]; }), color: '#1f6feb' }],
      refLines: [{ x: lim.rodLoadWarn * 100, label: 'Limit', color: '#bf8700' }, { x: 100, label: 'Yield', color: '#cf222e' }].concat(bounds)
    });
    Chart.draw($('#chTorque'), {
      title: 'Rod torque', xLabel: 'Torque (' + uu('torque') + ')', yLabel: D, invertY: true, xMin: 0,
      series: [{ name: 'Torque', points: N.map(function (n) { return [disp(n.torque, 'torque'), depthOf(n)]; }), color: '#e5534b' }],
      refLines: state.project.drive.maxTorque ? [{ x: disp(state.project.drive.maxTorque, 'torque'), label: 'Drive rating', color: '#cf222e' }] : []
    });
    Chart.draw($('#chAxial'), {
      title: 'Axial load', xLabel: 'Axial load (' + uu('force') + ')', yLabel: D, invertY: true, xMin: 0,
      series: [{ name: 'Axial load', points: N.map(function (n) { return [disp(n.axial, 'force'), depthOf(n)]; }), color: '#2da44e' }]
    });
    Chart.draw($('#chSide', p), {
      title: (state.project.rods.couplingSpacing > 0 ? 'Side load per coupling' : 'Side load per metre'), xLabel: 'Side load (' + uu('sideLoad') + ')', yLabel: D, invertY: true, xMin: 0,
      series: [{ name: 'Side load', points: N.map(function (n) { return [disp(n.sideLoadPerCoupling, 'sideLoad'), depthOf(n)]; }), color: '#8250df' }],
      refLines: [{ x: disp(lim.sideLoadWarn, 'sideLoad'), label: 'Limit', color: '#cf222e' }]
    });
    Chart.draw($('#chPress'), {
      title: 'Pressure profile', xLabel: 'Pressure (' + uu('pressure') + ')', yLabel: D, invertY: true, xMin: 0,
      series: [
        { name: 'Tubing', points: N.map(function (n) { return [disp(n.tubingPressure, 'pressure'), depthOf(n)]; }), color: '#0a7ea4' },
        { name: 'Casing annulus', points: N.map(function (n) { return [disp(n.casingPressure, 'pressure'), depthOf(n)]; }), color: '#bf8700', dashed: true }
      ]
    });
    Chart.draw($('#chStress'), {
      title: 'Stress components', xLabel: 'Stress (' + uu('stress') + ')', yLabel: D, invertY: true, xMin: 0,
      series: [
        { name: 'Axial', points: N.map(function (n) { return [disp(n.axialStress, 'stress'), depthOf(n)]; }), color: '#2da44e' },
        { name: 'Shear', points: N.map(function (n) { return [disp(n.shearStress, 'stress'), depthOf(n)]; }), color: '#e5534b' },
        { name: 'Bending', points: N.map(function (n) { return [disp(n.bendingStress, 'stress'), depthOf(n)]; }), color: '#8250df' },
        { name: 'von Mises', points: N.map(function (n) { return [disp(n.vonMises, 'stress'), depthOf(n)]; }), color: '#1f6feb', width: 2.5 }
      ]
    });
  }

  function renderCurves() {
    var p = $('#tab-curves'); p.innerHTML = '';
    header('Pump Curves', 'Pump performance at the current fluid viscosity. The marker shows the current operating point.').forEach(function (n) { if (n) p.appendChild(n); });
    var r = state.result, pm = state.project.pump;
    if (!(pm.displacement > 0)) return;
    var speeds = [100, 200, 300, 400].filter(function (s) { return Math.abs(s - state.project.speed) > 1; }).concat([state.project.speed]).sort(function (a, b) { return a - b; });
    var mu = r && r.ok ? r.fluid.viscosity : state.project.production.viscosity;
    var curves = E.pumpCurves(pm, mu, speeds, 30);
    p.appendChild(el('div', { class: 'chart-grid' }, [chartBox('chQ'), chartBox('chT'), chartBox('chEff')]));
    function ser(key, q, scale) {
      return curves.map(function (c) {
        var cur = Math.abs(c.speed - state.project.speed) < 1e-6;
        return { name: c.speed.toFixed(0) + ' rpm', width: cur ? 3 : 1.5, dashed: !cur,
          points: c.points.map(function (pt) { return [disp(pt.dP, 'pressure'), q ? disp(pt[key], q) : pt[key] * (scale || 1)]; }) };
      });
    }
    var op = r && r.ok ? r.pump : null;
    var ref = [{ x: disp(E.ratedPressure(pm), 'pressure'), label: 'Rated lift', color: '#cf222e' }];
    Chart.draw($('#chQ'), { title: 'Rate vs differential pressure', xLabel: 'ΔP (' + uu('pressure') + ')', yLabel: 'Rate (' + uu('flow') + ')', xMin: 0, yMin: 0,
      series: ser('rate', 'flow'), refLines: ref, markers: op ? [{ x: disp(op.differentialPressure, 'pressure'), y: disp(op.rate, 'flow'), label: 'Operating point' }] : [] });
    Chart.draw($('#chT'), { title: 'Pump torque vs differential pressure', xLabel: 'ΔP (' + uu('pressure') + ')', yLabel: 'Torque (' + uu('torque') + ')', xMin: 0, yMin: 0,
      series: [{ name: 'All speeds', points: curves[0].points.map(function (pt) { return [disp(pt.dP, 'pressure'), disp(pt.torque, 'torque')]; }), color: '#e5534b' }],
      refLines: ref, markers: op ? [{ x: disp(op.differentialPressure, 'pressure'), y: disp(op.torque, 'torque'), label: 'Operating point' }] : [] });
    Chart.draw($('#chEff'), { title: 'Volumetric efficiency', xLabel: 'ΔP (' + uu('pressure') + ')', yLabel: 'Efficiency (%)', xMin: 0, yMin: 0,
      series: ser('efficiency', null, 100), refLines: ref,
      markers: op ? [{ x: disp(op.differentialPressure, 'pressure'), y: op.volumetricEfficiency * 100, label: 'Operating point' }] : [] });
  }

  function renderSweep() {
    var p = $('#tab-sweep'); p.innerHTML = '';
    header('Speed Sweep', 'System response across a range of rotational speeds with all other inputs fixed.').forEach(function (n) { if (n) p.appendChild(n); });
    var pr = state.project;
    var maxN = Math.max(pr.speed * 1.5, Math.min(pr.drive.maxSpeed || 500, pr.pump.maxSpeed || 500));
    var data = E.speedSweep(pr, 25, maxN, 24);
    if (!data.length) { p.appendChild(card(null, [el('p', { text: 'No valid results.' })])); return; }
    p.appendChild(el('div', { class: 'chart-grid' }, [chartBox('swQ'), chartBox('swT'), chartBox('swP'), chartBox('swL')]));
    var cur = [{ x: pr.speed, label: 'Current', color: '#1f6feb' }];
    var target = [{ y: disp(pr.production.targetRate, 'flow'), label: 'Target', color: '#2da44e' }];
    Chart.draw($('#swQ'), { title: 'Production rate', xLabel: 'Speed (rpm)', yLabel: 'Rate (' + uu('flow') + ')', yMin: 0,
      series: [{ name: 'Rate', points: data.map(function (d) { return [d.speed, disp(d.rate, 'flow')]; }), marker: true }], refLines: cur.concat(target) });
    Chart.draw($('#swT'), { title: 'Polished rod torque', xLabel: 'Speed (rpm)', yLabel: 'Torque (' + uu('torque') + ')', yMin: 0,
      series: [{ name: 'Torque', color: '#e5534b', points: data.map(function (d) { return [d.speed, disp(d.torque, 'torque')]; }), marker: true }],
      refLines: cur.concat(pr.drive.maxTorque ? [{ y: disp(pr.drive.maxTorque, 'torque'), label: 'Drive rating', color: '#cf222e' }] : []) });
    Chart.draw($('#swP'), { title: 'Motor power', xLabel: 'Speed (rpm)', yLabel: 'Power (' + uu('power') + ')', yMin: 0,
      series: [{ name: 'Power', color: '#bf8700', points: data.map(function (d) { return [d.speed, disp(d.power, 'power')]; }), marker: true }],
      refLines: cur.concat(pr.drive.maxPower ? [{ y: disp(pr.drive.maxPower, 'power'), label: 'Motor rating', color: '#cf222e' }] : []) });
    Chart.draw($('#swL'), { title: 'Max rod load & volumetric efficiency', xLabel: 'Speed (rpm)', yLabel: '%', yMin: 0,
      series: [{ name: 'Max rod load', color: '#8250df', points: data.map(function (d) { return [d.speed, d.loadRatio * 100]; }), marker: true },
        { name: 'Vol. efficiency', color: '#2da44e', points: data.map(function (d) { return [d.speed, d.efficiency * 100]; }), marker: true }],
      refLines: cur.concat([{ y: pr.limits.rodLoadWarn * 100, label: 'Rod load limit', color: '#cf222e' }]) });
  }

  var TABLE_COLS = [
    ['MD', function (n) { return n.md; }, 'length'], ['TVD', function (n) { return n.tvd; }, 'length'],
    ['Inc (°)', function (n) { return n.inc; }, 'angle'], ['Azi (°)', function (n) { return n.azi; }, 'angle'],
    ['DLS', function (n) { return n.dls; }, 'dogleg'], ['Rod Ø', function (n) { return n.rodDiameter; }, 'diameter'],
    ['Axial load', function (n) { return n.axial; }, 'force'], ['Torque', function (n) { return n.torque; }, 'torque'],
    ['Side load', function (n) { return n.sideLoadPerCoupling; }, 'sideLoad'], ['von Mises', function (n) { return n.vonMises; }, 'stress'],
    ['Rod load', function (n) { return n.loadRatio; }, 'percent'], ['Tubing P', function (n) { return n.tubingPressure; }, 'pressure'],
    ['Casing P', function (n) { return n.casingPressure; }, 'pressure']
  ];

  function renderTable() {
    var p = $('#tab-table'); p.innerHTML = '';
    header('Results Table', 'Node-by-node results from surface to pump. Highlighted rows exceed a design limit.').forEach(function (n) { if (n) p.appendChild(n); });
    var r = state.result;
    if (!r || !r.ok) return;
    p.appendChild(el('div', { class: 'btn-row' }, [selectField('Show', [1, 2, 4, 10, 20].map(function (k) { return { value: String(k), label: k === 1 ? 'Every node' : 'Every ' + k + ' nodes' }; }),
      String(state.tableStride), function (v) { state.tableStride = +v; renderTable(); })]));
    var tbl = el('table', { class: 'data' });
    tbl.appendChild(el('thead', null, [el('tr', null, TABLE_COLS.map(function (c) { var u = uu(c[2]); return el('th', { class: 'num', text: c[0] + (u && c[2] !== 'angle' ? ' (' + u + ')' : '') }); }))]));
    var tb = el('tbody');
    var lim = state.project.limits;
    r.nodes.forEach(function (n, i) {
      if (i % state.tableStride !== 0 && i !== r.nodes.length - 1) return;
      var cls = n.loadRatio > 1 ? 'bad' : (n.loadRatio > lim.rodLoadWarn || n.sideLoadPerCoupling > lim.sideLoadWarn) ? 'hl' : null;
      tb.appendChild(el('tr', { class: cls }, TABLE_COLS.map(function (c) { return el('td', { class: 'num', text: U.format(c[1](n), c[2], sys(), undefined, false) }); })));
    });
    tbl.appendChild(tb);
    p.appendChild(el('div', { class: 'table-wrap' }, [tbl]));
  }

  // ------------------------------------------------------------------ summary

  function kpi(label, value, cls) {
    return el('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, [el('span', { text: label }), el('span', { text: value })]);
  }

  function renderSummary() {
    var s = $('#summary'); s.innerHTML = '';
    var r = state.result;
    if (!r) return;
    var errs = r.errors || [], warns = r.warnings || [];
    var cls = errs.length ? 'err' : warns.length ? 'warn' : 'ok';
    var txt = errs.length ? '✖ Design check failed' : warns.length ? '⚠ Design acceptable with warnings' : '✔ All design checks passed';
    s.appendChild(el('div', { class: 'status ' + cls, text: txt }));
    if (r.ok) {
      var pm = r.pump, sf = r.surface, rd = r.rods, lim = state.project.limits;
      s.appendChild(el('h4', { text: 'Production' }));
      s.appendChild(kpi('Production rate', f(pm.rate, 'flow')));
      s.appendChild(kpi('Theoretical rate', f(pm.theoreticalRate, 'flow')));
      s.appendChild(kpi('Volumetric efficiency', (pm.volumetricEfficiency * 100).toFixed(1) + ' %', pm.volumetricEfficiency < 0.5 ? 'warn' : ''));
      s.appendChild(kpi('Speed', r.speed.toFixed(1) + ' rpm'));
      s.appendChild(el('h4', { text: 'Pump' }));
      s.appendChild(kpi('Intake pressure', f(pm.intakePressure, 'pressure')));
      s.appendChild(kpi('Discharge pressure', f(pm.dischargePressure, 'pressure')));
      s.appendChild(kpi('Tubing friction loss', f(pm.tubingFriction, 'pressure')));
      s.appendChild(utilBar('ΔP / rated lift', pm.differentialPressure, pm.ratedPressure, 'pressure'));
      s.appendChild(kpi('Submergence (TVD)', f(pm.submergence, 'length'), pm.submergence <= 0 ? 'bad' : ''));
      s.appendChild(kpi('Pump torque', f(pm.torque, 'torque')));
      s.appendChild(kpi('Rotor thrust', f(pm.thrust, 'force')));
      s.appendChild(el('h4', { text: 'Surface' }));
      s.appendChild(kpi('Polished rod torque', f(sf.torque, 'torque'), state.project.drive.maxTorque && sf.torque > state.project.drive.maxTorque ? 'bad' : ''));
      s.appendChild(kpi('Polished rod load', f(sf.axialLoad, 'force')));
      s.appendChild(kpi('Polished rod power', f(sf.polishedRodPower, 'power')));
      s.appendChild(kpi('Motor input power', f(sf.motorPower, 'power'), state.project.drive.maxPower && sf.motorPower > state.project.drive.maxPower ? 'bad' : ''));
      s.appendChild(kpi('Hydraulic power', f(sf.hydraulicPower, 'power')));
      s.appendChild(kpi('System efficiency', (sf.systemEfficiency * 100).toFixed(1) + ' %'));
      s.appendChild(el('h4', { text: 'Rod string' }));
      var lr = rd.maxLoadRatio;
      s.appendChild(el('div', null, [
        kpi('Max rod load', (lr * 100).toFixed(1) + ' % @ ' + f(rd.maxLoadMd, 'length', 0), lr > 1 ? 'bad' : lr > lim.rodLoadWarn ? 'warn' : ''),
        el('div', { class: 'bar' }, [el('div', { class: lr > 1 ? 'err' : lr > lim.rodLoadWarn ? 'warn' : '', style: 'width:' + Math.min(100, lr * 100).toFixed(1) + '%' })])
      ]));
      s.appendChild(kpi('Max side load', f(rd.maxSideLoad, 'sideLoad') + ' @ ' + f(rd.maxSideLoadMd, 'length', 0), rd.maxSideLoad > lim.sideLoadWarn ? 'warn' : ''));
      s.appendChild(kpi('Rod stretch', f(rd.stretch, 'length', 2)));
      s.appendChild(kpi('Torsional wind-up', rd.windupTurns.toFixed(1) + ' turns'));
      s.appendChild(kpi('Flow regime (tubing)', pm.flowRegime + ' (Re ' + pm.reynolds.toFixed(0) + ')'));
    }
    if (errs.length || warns.length) {
      s.appendChild(el('h4', { text: 'Messages' }));
      var ul = el('ul', { class: 'msgs' });
      errs.forEach(function (m) { ul.appendChild(el('li', { class: 'err', text: m })); });
      warns.forEach(function (m) { ul.appendChild(el('li', { class: 'warn', text: m })); });
      s.appendChild(ul);
    }
  }

  // ------------------------------------------------------------------ report / export

  function captureCharts(ids) {
    var root = document.documentElement;
    var theme = root.getAttribute('data-theme');
    root.removeAttribute('data-theme');
    document.body.classList.add('report-render');
    renderWellbore(); renderResults(); renderCurves();
    var imgs = {};
    ids.forEach(function (id) { var c = document.getElementById(id); if (c) imgs[id] = c.toDataURL('image/png'); });
    document.body.classList.remove('report-render');
    if (theme) root.setAttribute('data-theme', theme);
    renderWellbore();
    activate(state.tab);
    return imgs;
  }

  function buildReport() {
    var pr = state.project, r = state.result;
    var imgs = captureCharts(['chVs', 'chPlan', 'chLoad', 'chTorque', 'chAxial', 'chSide', 'chPress', 'chQ']);
    function row(k, v) { return '<tr><th>' + escapeHtml(k) + '</th><td>' + escapeHtml(v) + '</td></tr>'; }
    function tbl(title, rows) { return '<h3>' + title + '</h3><table>' + rows.join('') + '</table>'; }
    var wb = pr.wellbore, pd = pr.production, pm = pr.pump, dr = pr.drive;
    var html = [];
    html.push('<h1>' + escapeHtml(pr.meta.name || 'PCP Design') + '</h1>');
    html.push('<p class="meta">Well: ' + escapeHtml(pr.meta.well || '—') + ' &nbsp;|&nbsp; Analyst: ' + escapeHtml(pr.meta.analyst || '—') +
      ' &nbsp;|&nbsp; Generated: ' + escapeHtml(new Date().toLocaleString()) + '</p>');
    if (pr.meta.notes) html.push('<p>' + escapeHtml(pr.meta.notes) + '</p>');
    if (r && r.ok) {
      var st = r.errors.length ? 'FAILED' : r.warnings.length ? 'ACCEPTABLE WITH WARNINGS' : 'PASSED';
      html.push('<p class="status">Design check: <b>' + st + '</b></p>');
    }
    html.push('<div class="cols"><div>');
    html.push(tbl('Wellbore', [
      row('Pump depth (MD / TVD)', f(wb.pumpDepth, 'length') + ' / ' + (r && r.ok ? f(r.pump.depthTvd, 'length') : '—')),
      row('Tubing ID / OD', f(wb.tubingId, 'diameter') + ' / ' + f(wb.tubingOd, 'diameter')),
      row('Casing ID', f(wb.casingId, 'diameter')),
      row('Survey stations', String(wb.survey.length))
    ]));
    html.push(tbl('Production & fluid', [
      row('Tubing / casing head pressure', f(pd.tubingHeadPressure, 'pressure') + ' / ' + f(pd.casingHeadPressure, 'pressure')),
      row(pd.intakeMode === 'fluidLevel' ? 'Fluid level (MD)' : 'Pump intake pressure', pd.intakeMode === 'fluidLevel' ? f(pd.fluidLevel, 'length') : f(pd.intakePressure, 'pressure')),
      row('Oil gravity / water cut', pd.oilApi + ' °API / ' + (pd.waterCut * 100).toFixed(1) + ' %'),
      row('Viscosity model', pd.viscosityModel || 'specified'),
      row('Effective viscosity', r && r.ok ? f(r.fluid.viscosity, 'viscosity') : 'invalid fluid inputs'),
      row('Fluid temperature', pd.viscosityModel === 'beggsRobinson' ? f(pd.fluidTemperature, 'temperature') : 'not used'),
      row('Target rate', f(pd.targetRate, 'flow'))
    ]));
    html.push(tbl('Pump & drive', [
      row('Pump', (pm.name || pm.modelId) + (pm.modelId === 'custom' ? ' (custom)' : '')),
      row('Displacement / rated lift', f(pm.displacement, 'displacement') + ' / ' + f(pm.ratedLift, 'head')),
      row('Performance model', pm.performanceModel || 'legacy'),
      row('Pump friction model', pm.frictionModel || 'specified'),
      row('Pump friction torque', f(E.pumpTorque(pm, 0).friction, 'torque')),
      row('Rated hydraulic friction fraction', pm.frictionModel === 'ratedFraction' ? (pm.frictionFraction * 100).toFixed(1) + '%' : 'not used'),
      row('Efficiency reference speed', pm.referenceSpeed === undefined ? 'not specified' : pm.referenceSpeed + ' rpm'),
      row('Efficiency at zero / rated pressure', pm.efficiencyAtRated === undefined ? 'not specified' : ((pm.efficiencyAtZero === undefined ? '—' : (pm.efficiencyAtZero * 100).toFixed(1) + '%') + ' / ' + (pm.efficiencyAtRated * 100).toFixed(1) + '%')),
      row('Slip reference viscosity / exponent', f(pm.referenceViscosity === undefined ? 0.001 : pm.referenceViscosity, 'viscosity') + ' / ' + (pm.viscosityExponent === undefined ? ((!pm.performanceModel || pm.performanceModel === 'legacy') ? 0.5 : 0.33) : pm.viscosityExponent)),
      row('Speed', pr.speed + ' rpm'),
      row('Drive', (dr.name || dr.modelId) + ' — ' + f(dr.maxTorque, 'torque') + ', ' + f(dr.maxPower, 'power'))
    ]));
    html.push(tbl('Rod string', (r && r.ok ? r.sections : []).map(function (s) {
      return row('Section ' + (s.index + 1), s.size.name + ' ' + s.grade.name + ', ' + f(s.length, 'length') + ' (' + f(s.top, 'length', 0) + ' – ' + f(s.bottom, 'length', 0) + ')');
    }).concat([row('Coupling spacing', pr.rods.couplingSpacing > 0 ? f(pr.rods.couplingSpacing, 'length') : 'continuous rod'), row('Friction coefficient', String(pr.rods.frictionCoefficient))])));
    html.push('</div><div>');
    if (r && r.ok) {
      html.push(tbl('Results', [
        row('Production rate', f(r.pump.rate, 'flow')),
        row('Volumetric efficiency', (r.pump.volumetricEfficiency * 100).toFixed(1) + ' %'),
        row('Intake / discharge pressure', f(r.pump.intakePressure, 'pressure') + ' / ' + f(r.pump.dischargePressure, 'pressure')),
        row('Differential pressure', f(r.pump.differentialPressure, 'pressure') + ' (' + (r.pump.liftRatio * 100).toFixed(0) + ' % of rated)'),
        row('Submergence (TVD)', f(r.pump.submergence, 'length')),
        row('Pump torque (hydraulic + friction)', f(r.pump.torque, 'torque')),
        row('Polished rod torque', f(r.surface.torque, 'torque')),
        row('Polished rod axial load', f(r.surface.axialLoad, 'force')),
        row('Polished rod / motor power', f(r.surface.polishedRodPower, 'power') + ' / ' + f(r.surface.motorPower, 'power')),
        row('System efficiency', (r.surface.systemEfficiency * 100).toFixed(1) + ' %'),
        row('Max rod load', (r.rods.maxLoadRatio * 100).toFixed(1) + ' % at ' + f(r.rods.maxLoadMd, 'length', 0) + ' MD'),
        row('Max side load', f(r.rods.maxSideLoad, 'sideLoad') + ' at ' + f(r.rods.maxSideLoadMd, 'length', 0) + ' MD'),
        row('Rod stretch / wind-up', f(r.rods.stretch, 'length', 2) + ' / ' + r.rods.windupTurns.toFixed(1) + ' turns')
      ]));
      if (r.errors.length || r.warnings.length) {
        html.push('<h3>Messages</h3><ul>' + r.errors.map(function (m) { return '<li class="err">' + escapeHtml(m) + '</li>'; }).join('') +
          r.warnings.map(function (m) { return '<li class="warn">' + escapeHtml(m) + '</li>'; }).join('') + '</ul>');
      }
    } else if (r) {
      html.push('<h3>Errors</h3><ul>' + r.errors.map(function (m) { return '<li class="err">' + escapeHtml(m) + '</li>'; }).join('') + '</ul>');
    }
    html.push('</div></div><div class="charts">');
    Object.keys(imgs).forEach(function (k) { html.push('<img src="' + imgs[k] + '" alt="' + k + '">'); });
    html.push('</div><p class="disclaimer">Screening-level analysis from simplified models. Verify with a qualified engineer before field implementation.</p>');

    var css = 'body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{margin:0 0 4px;font-size:22px}h3{margin:14px 0 4px;font-size:13px;border-bottom:2px solid #0b5cad;color:#0b5cad}' +
      'table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{width:46%;color:#444;font-weight:600}' +
      '.meta{color:#555}.status{padding:6px 10px;background:#eef4fb;border-left:4px solid #0b5cad}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}' +
      '.charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.charts img{width:100%;border:1px solid #ddd;break-inside:avoid}' +
      'li.err{color:#cf222e}li.warn{color:#9a6700}.disclaimer{color:#777;font-size:11px;margin-top:16px}@media print{.noprint{display:none}}';
    var w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to open the report.'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(pr.meta.name || 'PCP report') + '</title><style>' + css + '</style></head><body>' +
      '<div class="noprint" style="text-align:right"><button onclick="window.print()">Print / Save as PDF</button></div>' + html.join('') + '</body></html>');
    w.document.close();
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function safeName() { return (state.project.meta.name || 'pcp-design').replace(/[^\w\-]+/g, '_'); }

  function exportCsv() {
    var r = state.result;
    if (!r || !r.ok) { alert('No valid results to export.'); return; }
    var head = TABLE_COLS.map(function (c) { var u = uu(c[2]); return '"' + c[0] + (u && c[2] !== 'angle' ? ' (' + u + ')' : '') + '"'; }).join(',');
    var lines = r.nodes.map(function (n) { return TABLE_COLS.map(function (c) { var v = disp(c[1](n), c[2]); return isFinite(v) ? (+v.toPrecision(8)).toString() : ''; }).join(','); });
    download(safeName() + '_results.csv', [head].concat(lines).join('\n'), 'text/csv');
  }

  function renderEquipment() {
    var panel = $('#tab-equipment'); panel.innerHTML = '';
    header('Equipment Catalog', 'Load authorized equipment exports in the explicit-SI portable format. This does not decode the original equipment.db.').forEach(function (n) { if (n) panel.appendChild(n); });
    var input = el('textarea', { class: 'paste', 'aria-label': 'Equipment catalog JSON', placeholder: 'Paste schemaVersion 1 equipment catalog JSON' });
    var message = el('p', { role: 'status' });
    panel.appendChild(card('Import equipment', [input, el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn primary', text: 'Import catalog', onclick: function () {
        try {
          if (input.value.length > 5 * 1024 * 1024) throw new Error('Catalog exceeds 5 MiB limit.');
          state.project.equipmentLibrary = window.PCPEquipment.merge(state.project, JSON.parse(input.value));
          recompute(); renderEquipment();
        } catch (error) { message.textContent = error.message; }
      } }),
      el('button', { class: 'btn', text: 'Show catalog format', onclick: function () {
        input.value = JSON.stringify({schemaVersion: 1, units: 'SI', provenance: {source: 'replace with authorized supplier/source'},
          pumps: [Object.assign({}, C.PUMPS[0], {id: 'example-pump', name: 'Illustrative only — replace with verified data'})],
          drives: [], rodGrades: [], rodSizes: []}, null, 2);
      } })
    ]), message]));
    var table = el('table', { class: 'data' });
    table.appendChild(el('thead', null, [el('tr', null, ['Type', 'Built-in generic', 'Project/imported'].map(function (h) { return el('th', { text: h }); }))]));
    var counts = {pumps: C.PUMPS.length, drives: C.DRIVES.length, rodGrades: C.ROD_GRADES.length, rodSizes: C.ROD_SIZES.length};
    Object.keys(counts).forEach(function (kind) { table.appendChild(el('tr', null, [el('td', {text: kind}), el('td', {text: String(counts[kind])}), el('td', {text: String(equipmentList(kind).length - counts[kind])})])); });
    panel.appendChild(card('Available specifications', [table]));
    var imports = (state.project.equipmentLibrary || {}).imports || [];
    panel.appendChild(card('Import provenance', [el('ul', null, imports.map(function (record) { return el('li', {text: record.source + ' — ' + record.importedAt}); }))]));
  }

  function renderCoverage() {
    var panel = $('#tab-coverage'); panel.innerHTML = '';
    header('Parity & Runtime', 'Readiness information, not a claim of complete PC-PUMP replication.').forEach(function (n) { if (n) panel.appendChild(n); });
    var rows = [
      ['Web well analysis', 'Available: simplified single-phase soft-string model.'],
      ['Original engine numeric helpers', 'Six captured dead/live-oil viscosity outputs matched.'],
      ['Manufacturer equipment database', 'Not extracted. Under Wine 11 the original loader reaches q1.a but fails on an uninitialized application/security context. Portable SI imports are available.'],
      ['Original complete simulation', 'Not executed. All 11 bundled projects now parse with original profile initialization (29 analyses). Catalog/application contexts remain unresolved.'],
      ['Desktop/UI parity', '130 BAML resources inventoried, not 130 completed screens. PresentationFramework loads under Wine 11; desktop workflows and visuals are not validated.'],
      ['Remaining models', 'Bench-test normalization, full multiphase/thermal, rod fatigue/wear and native project formats remain unresolved.']
    ];
    var table = el('table', {class: 'data'});
    rows.forEach(function (row) { table.appendChild(el('tr', null, [el('th', {text: row[0]}), el('td', {text: row[1]})])); });
    panel.appendChild(card('Verified coverage', [table]));
    panel.appendChild(card('Original runtime prerequisites', [el('p', {text: 'Use the Windows readiness script with an authorized installed application, .NET 8 SDK and Desktop Runtime. It runs unchanged original loader probes, not the full simulation, and does not patch licensing or supply fake contexts.'}), el('code', {text: 'scripts/run-windows-readiness.ps1 -ApplicationDirectory <installed-app> -OutputDirectory <results>'})]));
  }

  // ------------------------------------------------------------------ app shell

  var RENDER = {
    project: renderProject, wellbore: renderWellbore, production: renderProduction, pump: renderPump, rods: renderRods,
    drive: renderDrive, equipment: renderEquipment, coverage: renderCoverage, results: renderResults, curves: renderCurves, sweep: renderSweep, table: renderTable
  };
  var OUTPUT_TABS = { results: 1, curves: 1, sweep: 1, table: 1 };

  function activate(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.classList.toggle('active', p.id === 'tab-' + tab); });
    RENDER[tab]();
  }

  function recompute() {
    try {
      state.result = E.analyze(state.project);
    } catch (e) {
      state.result = { ok: false, errors: ['Calculation error: ' + e.message], warnings: [] };
      if (window.console) console.error(e);
    }
    store();
    renderSummary();
    if (OUTPUT_TABS[state.tab]) RENDER[state.tab]();
    else if (state.tab === 'drive') renderDriveUtil();
    else if (state.tab === 'wellbore') drawWellboreCharts();
  }

  function renderAll() {
    $('#projectName').value = state.project.meta.name || '';
    $('#unitSystem').value = state.project.unitSystem;
    recompute();
    Object.keys(RENDER).forEach(function (k) { if (!OUTPUT_TABS[k]) RENDER[k](); });
    activate(state.tab);
  }

  function loadProject(p) {
    state.project = migrate(p);
    renderAll();
  }

  function init() {
    var theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    $('#tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-tab]');
      if (b) activate(b.getAttribute('data-tab'));
    });
    $('#projectName').addEventListener('change', function () { state.project.meta.name = this.value; store(); if (state.tab === 'project') renderProject(); });
    $('#unitSystem').addEventListener('change', function () { state.project.unitSystem = this.value; renderAll(); });
    $('#btnNew').addEventListener('click', function () {
      if (!confirm('Start a new project? Unsaved changes will be lost.')) return;
      var u = state.project.unitSystem;
      var p = C.defaultProject(); p.unitSystem = u;
      loadProject(p);
    });
    $('#btnSave').addEventListener('click', function () { download(safeName() + '.pcp.json', JSON.stringify(state.project, null, 2), 'application/json'); });
    $('#btnOpen').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { loadProject(JSON.parse(reader.result)); }
        catch (e) { alert('Could not read project file: ' + e.message); }
      };
      reader.readAsText(file);
      this.value = '';
    });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#btnReport').addEventListener('click', buildReport);
    $('#btnTheme').addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark');
      try { localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark'); } catch (e) { /* ignore */ }
      activate(state.tab);
    });
    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (OUTPUT_TABS[state.tab]) RENDER[state.tab](); else if (state.tab === 'wellbore') drawWellboreCharts(); }, 150);
    });
    renderAll();
  }

  // expose for debugging / automation
  window.PCPApp = { state: state, recompute: recompute, loadProject: loadProject, activate: activate };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
