/*
 * Minimal dependency-free canvas line chart with hover read-out.
 *
 * PCPChart.draw(canvas, {
 *   title, xLabel, yLabel, invertY, equalAspect,
 *   series: [{ name, color, points: [[x,y],...], dashed, width, marker }],
 *   markers: [{ x, y, color, label }],
 *   refLines: [{ x | y, color, label, dashed }]
 * })
 */
(function (root) {
  'use strict';

  var PALETTE = ['#1f6feb', '#e5534b', '#2da44e', '#bf8700', '#8250df', '#d4a72c', '#0a7ea4', '#cf222e'];

  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    var s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
    return s * mag;
  }

  function niceRange(min, max, ticks) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max - min < 1e-12) { var pad = Math.abs(max) * 0.1 || 1; min -= pad; max += pad; }
    var step = niceStep(max - min, ticks);
    return { min: Math.floor(min / step + 1e-9) * step, max: Math.ceil(max / step - 1e-9) * step, step: step };
  }

  function fmt(v, step) {
    var dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return Math.abs(v) < step / 1e6 ? '0' : v.toFixed(Math.min(dec, 6));
  }

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return v && v.trim() ? v.trim() : fallback;
    } catch (e) { return fallback; }
  }

  function draw(canvas, cfg) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var cssW = canvas.clientWidth || canvas.width, cssH = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._chartCfg = cfg;

    var fg = cssVar('--chart-fg', '#24292f'), grid = cssVar('--chart-grid', '#d0d7de'), bg = cssVar('--chart-bg', '#ffffff');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cssW, cssH);

    var series = (cfg.series || []).filter(function (s) { return s.points && s.points.length; });
    var xs = [], ys = [];
    series.forEach(function (s) { s.points.forEach(function (p) { if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }); });
    (cfg.markers || []).forEach(function (m) { if (isFinite(m.x) && isFinite(m.y)) { xs.push(m.x); ys.push(m.y); } });
    (cfg.refLines || []).forEach(function (r) { if (r.x !== undefined) xs.push(r.x); if (r.y !== undefined) ys.push(r.y); });
    if (cfg.xMin !== undefined) xs.push(cfg.xMin);
    if (cfg.yMin !== undefined) ys.push(cfg.yMin);

    var m = { l: 62, r: 14, t: cfg.title ? 30 : 12, b: 44 };
    var legendH = series.length > 1 ? 18 : 0;
    m.t += legendH;
    var pw = cssW - m.l - m.r, ph = cssH - m.t - m.b;

    if (!xs.length) {
      ctx.fillStyle = fg; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No data', cssW / 2, cssH / 2);
      return;
    }
    var xr = niceRange(Math.min.apply(null, xs), Math.max.apply(null, xs), Math.max(3, Math.floor(pw / 80)));
    var yr = niceRange(Math.min.apply(null, ys), Math.max.apply(null, ys), Math.max(3, Math.floor(ph / 45)));

    if (cfg.equalAspect) {
      var sx = pw / (xr.max - xr.min), sy = ph / (yr.max - yr.min), s = Math.min(sx, sy);
      var cx = (xr.max + xr.min) / 2, cy = (yr.max + yr.min) / 2;
      var hx = pw / s / 2, hy = ph / s / 2;
      xr = { min: cx - hx, max: cx + hx, step: niceStep(2 * hx, Math.floor(pw / 80)) };
      yr = { min: cy - hy, max: cy + hy, step: niceStep(2 * hy, Math.floor(ph / 45)) };
    }

    function X(v) { return m.l + (v - xr.min) / (xr.max - xr.min) * pw; }
    function Y(v) {
      var t = (v - yr.min) / (yr.max - yr.min);
      return cfg.invertY ? m.t + t * ph : m.t + (1 - t) * ph;
    }
    canvas._chartMap = { X: X, Y: Y, xr: xr, yr: yr, m: m, pw: pw, ph: ph, invertY: cfg.invertY };

    // grid + ticks
    ctx.font = '11px system-ui, sans-serif';
    ctx.strokeStyle = grid; ctx.fillStyle = fg; ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var v;
    for (v = Math.ceil(xr.min / xr.step) * xr.step; v <= xr.max + 1e-9; v += xr.step) {
      ctx.beginPath(); ctx.moveTo(X(v) + 0.5, m.t); ctx.lineTo(X(v) + 0.5, m.t + ph); ctx.stroke();
      ctx.fillText(fmt(v, xr.step), X(v), m.t + ph + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (v = Math.ceil(yr.min / yr.step) * yr.step; v <= yr.max + 1e-9; v += yr.step) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(v) + 0.5); ctx.lineTo(m.l + pw, Y(v) + 0.5); ctx.stroke();
      ctx.fillText(fmt(v, yr.step), m.l - 5, Y(v));
    }
    ctx.strokeStyle = fg; ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw, ph);

    // labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '12px system-ui, sans-serif';
    if (cfg.xLabel) ctx.fillText(cfg.xLabel, m.l + pw / 2, cssH - 4);
    if (cfg.yLabel) {
      ctx.save(); ctx.translate(13, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle';
      ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();
    }
    if (cfg.title) {
      ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(cfg.title, m.l, 8);
    }

    // clip plot area
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();

    (cfg.refLines || []).forEach(function (r) {
      ctx.strokeStyle = r.color || '#cf222e'; ctx.lineWidth = 1.5; ctx.setLineDash(r.dashed === false ? [] : [6, 4]);
      ctx.beginPath();
      if (r.x !== undefined) { ctx.moveTo(X(r.x), m.t); ctx.lineTo(X(r.x), m.t + ph); }
      else { ctx.moveTo(m.l, Y(r.y)); ctx.lineTo(m.l + pw, Y(r.y)); }
      ctx.stroke(); ctx.setLineDash([]);
      if (r.label) {
        ctx.fillStyle = r.color || '#cf222e'; ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        if (r.x !== undefined) ctx.fillText(r.label, X(r.x) + 3, m.t + 14);
        else ctx.fillText(r.label, m.l + 4, Y(r.y) - 2);
      }
    });

    series.forEach(function (s, i) {
      s._color = s.color || PALETTE[i % PALETTE.length];
      ctx.strokeStyle = s._color; ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.beginPath();
      var started = false;
      s.points.forEach(function (p) {
        if (!isFinite(p[0]) || !isFinite(p[1])) { started = false; return; }
        if (!started) { ctx.moveTo(X(p[0]), Y(p[1])); started = true; } else ctx.lineTo(X(p[0]), Y(p[1]));
      });
      ctx.stroke(); ctx.setLineDash([]);
      if (s.marker) {
        ctx.fillStyle = s._color;
        s.points.forEach(function (p) { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.5, 0, 2 * Math.PI); ctx.fill(); });
      }
    });

    (cfg.markers || []).forEach(function (mk) {
      ctx.fillStyle = mk.color || '#cf222e'; ctx.strokeStyle = bg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(mk.x), Y(mk.y), 5.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (mk.label) {
        ctx.fillStyle = fg; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(mk.label, X(mk.x) + 8, Y(mk.y) - 4);
      }
    });
    ctx.restore();

    // legend
    if (legendH) {
      ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      var lx = m.l, ly = m.t - legendH / 2 - 2;
      series.forEach(function (s) {
        ctx.strokeStyle = s._color; ctx.lineWidth = 2; ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = fg; ctx.fillText(s.name, lx + 20, ly);
        lx += 28 + ctx.measureText(s.name).width;
      });
    }

    attachHover(canvas);
  }

  function attachHover(canvas) {
    if (canvas._hoverAttached || !canvas.parentNode || typeof document === 'undefined') return;
    canvas._hoverAttached = true;
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    canvas.parentNode.style.position = 'relative';
    canvas.parentNode.appendChild(tip);
    canvas.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    canvas.addEventListener('mousemove', function (ev) {
      var cfg = canvas._chartCfg, map = canvas._chartMap;
      if (!cfg || !map) return;
      var rect = canvas.getBoundingClientRect();
      var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      var best = null;
      (cfg.series || []).forEach(function (s) {
        (s.points || []).forEach(function (p) {
          var d = Math.pow(map.X(p[0]) - mx, 2) + Math.pow(map.Y(p[1]) - my, 2);
          if (!best || d < best.d) best = { d: d, p: p, s: s };
        });
      });
      if (!best || best.d > 900) { tip.style.display = 'none'; return; }
      tip.style.display = 'block';
      tip.innerHTML = '<b>' + (best.s.name || '') + '</b><br>' + (cfg.xLabel || 'x') + ': ' + fmtTip(best.p[0]) +
        '<br>' + (cfg.yLabel || 'y') + ': ' + fmtTip(best.p[1]);
      tip.style.left = Math.min(map.X(best.p[0]) + 10, canvas.clientWidth - 150) + 'px';
      tip.style.top = Math.max(map.Y(best.p[1]) - 50, 0) + 'px';
    });
  }

  function fmtTip(v) {
    var a = Math.abs(v);
    return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(3);
  }

  root.PCPChart = { draw: draw, PALETTE: PALETTE };
})(typeof self !== 'undefined' ? self : this);
