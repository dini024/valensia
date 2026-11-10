/* plot.js — tiny dependency-free SVG plotting + canvas heatmap helpers. Global: QPlot
 *
 * QPlot.chart(container, opts) -> {update(opts), destroy()}
 *  opts: {
 *    series:[{x:[], y:[], label, color, type:'line'|'stick'|'area'|'points'|'step', width, dash, hidden}],
 *    xlabel, ylabel, title, xlim:[a,b], ylim:[a,b], logy:false, logx:false, height:300, aspect (w/h; default from container),
 *    vlines:[{x, label, color, dash}], hlines:[{y, label, color, dash}], legend:true,
 *    margin:{l,r,t,b}, xticks:n, yticks:n, reverseX:false, tipFmt:(s, i)=>string, onclick:(s,i,x,y)=>void
 *  }
 * QPlot.heat(canvas, nx, ny, fn(i,j)->v, {vmin,vmax,cmap:'viridis'|'diverge'|'hot'})
 * QPlot.levelDiagram(container, {levels:[{e, occ, label}], gap...})  (simple MO level diagram)
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PAL = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];

  function niceStep(range, n) {
    const raw = range / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(a, b, n) {
    const st = niceStep(b - a, n), t = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) t.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
    return t;
  }
  function logTicks(a, b) {
    const t = [], lo = Math.floor(Math.log10(a)), hi = Math.ceil(Math.log10(b));
    for (let e = lo; e <= hi; e++) t.push(Math.pow(10, e)); return t;
  }
  const fmtTick = v => { const a = Math.abs(v); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(0).replace('e+', 'e'); return +v.toPrecision(6) + ''; };

  function chart(container, opts0) {
    let opts = opts0, W = 0, H = 0, svg, tip, ro;
    container.classList.add('plot'); container.style.position = 'relative';
    function draw() {
      const o = Object.assign({}, opts); if (o.h && !o.height) o.height = o.h; o.series = (o.series || []).map(s => s.label || !s.name ? s : Object.assign({}, s, { label: s.name }));
      const xtFix = Array.isArray(o.xticks) ? o.xticks : null, ytFix = Array.isArray(o.yticks) ? o.yticks : null; if (xtFix) o.xticks = null; if (ytFix) o.yticks = null;
      container.querySelectorAll('svg,.plot-tip,.legend').forEach(n => n.remove());
      W = Math.max(280, container.clientWidth || 600); H = o.height || (o.aspect ? W / o.aspect : Math.round(Math.min(380, W * 0.55)));
      const m = Object.assign({ l: 56, r: 16, t: o.title ? 30 : 12, b: o.xlabel ? 42 : 28 }, o.margin || {});
      svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' }); container.appendChild(svg);
      const series = (o.series || []).filter(s => !s.hidden && s.x && s.x.length);
      // data extents
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      series.forEach(s => s.x.forEach((x, i) => { const y = s.y[i]; if (!isFinite(x) || !isFinite(y)) return; if (o.logy && y <= 0) return; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); if (s.type === 'stick') ymin = Math.min(ymin, 0); }));
      (o.vlines || []).forEach(v => { xmin = Math.min(xmin, v.x); xmax = Math.max(xmax, v.x); });
      (o.hlines || []).forEach(h => { if (!o.logy || h.y > 0) { ymin = Math.min(ymin, h.y); ymax = Math.max(ymax, h.y); } });
      if (!isFinite(xmin)) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
      if (xmin === xmax) { xmin -= 1; xmax += 1; } if (ymin === ymax) { ymin -= 1; ymax += 1; }
      let [x0, x1] = o.xlim || [xmin, xmax], [y0, y1] = o.ylim || (o.logy ? [Math.pow(10, Math.floor(Math.log10(ymin))), Math.pow(10, Math.ceil(Math.log10(ymax)))] : [ymin - (ymax - ymin) * 0.06, ymax + (ymax - ymin) * 0.08]);
      if (!o.ylim && series.some(s => s.type === 'area' || s.type === 'stick') && !o.logy) y0 = Math.min(0, y0);
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const fx = o.logx ? (v => (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) : (v => (v - x0) / (x1 - x0));
      const fy = o.logy ? (v => (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) : (v => (v - y0) / (y1 - y0));
      const X = v => m.l + (o.reverseX ? 1 - fx(v) : fx(v)) * pw, Y = v => m.t + (1 - fy(v)) * ph;
      // grid + axes
      const gx = S('g', { class: 'grid' }, svg), ax = S('g', { class: 'axis' }, svg);
      const xt = xtFix || (o.logx ? logTicks(x0, x1) : ticks(x0, x1, o.xticks || Math.max(3, Math.floor(pw / 80))));
      const yt = ytFix || (o.logy ? logTicks(y0, y1) : ticks(y0, y1, o.yticks || Math.max(3, Math.floor(ph / 45))));
      xt.forEach(v => { if (v < x0 - 1e-12 * Math.abs(x1) || v > x1 + 1e-12 * Math.abs(x1)) return; const px = X(v); S('line', { x1: px, x2: px, y1: m.t, y2: m.t + ph }, gx); S('line', { x1: px, x2: px, y1: m.t + ph, y2: m.t + ph + 4 }, ax); const t = S('text', { x: px, y: m.t + ph + 16, 'text-anchor': 'middle' }, ax); t.textContent = fmtTick(v); });
      yt.forEach(v => { if (v < y0 * (o.logy ? 0.999 : 1) - 1e-12 || v > y1 * (o.logy ? 1.001 : 1) + 1e-12) return; const py = Y(v); S('line', { x1: m.l, x2: m.l + pw, y1: py, y2: py }, gx); S('line', { x1: m.l - 4, x2: m.l, y1: py, y2: py }, ax); const t = S('text', { x: m.l - 7, y: py + 3.5, 'text-anchor': 'end' }, ax); t.textContent = fmtTick(v); });
      S('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: cssVar('--plot-axis'), 'stroke-width': 1 }, ax);
      if (o.xlabel) { const t = S('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle' }, ax); t.textContent = o.xlabel; }
      if (o.ylabel) { const t = S('text', { x: 13, y: m.t + ph / 2, 'text-anchor': 'middle', transform: `rotate(-90 13 ${m.t + ph / 2})` }, ax); t.textContent = o.ylabel; }
      if (o.title) { const t = S('text', { x: m.l, y: 16, 'font-weight': 650, style: 'font-size:12.5px' }, ax); t.textContent = o.title; }
      // clip
      const cid = 'clip' + Math.random().toString(36).slice(2, 8);
      const defs = S('defs', {}, svg), cp = S('clipPath', { id: cid }, defs); S('rect', { x: m.l, y: m.t, width: pw, height: ph }, cp);
      const plotG = S('g', { 'clip-path': `url(#${cid})` }, svg);
      (o.hlines || []).forEach(h => { const py = Y(h.y); S('line', { x1: m.l, x2: m.l + pw, y1: py, y2: py, stroke: h.color || cssVar('--c4'), 'stroke-dasharray': h.dash || '5 4', 'stroke-width': 1.2 }, plotG); if (h.label) { const t = S('text', { x: m.l + pw - 4, y: py - 4, 'text-anchor': 'end', fill: h.color || cssVar('--c4') }, plotG); t.textContent = h.label; } });
      (o.vlines || []).forEach(v => { const px = X(v.x); S('line', { x1: px, x2: px, y1: m.t, y2: m.t + ph, stroke: v.color || cssVar('--c3'), 'stroke-dasharray': v.dash || '5 4', 'stroke-width': 1.2 }, plotG); if (v.label) { const t = S('text', { x: px + 4, y: m.t + 12, fill: v.color || cssVar('--c3') }, plotG); t.textContent = v.label; } });
      series.forEach((s, si) => {
        const col = s.color || cssVar(PAL[si % PAL.length]), pts = [];
        s.x.forEach((x, i) => { const y = s.y[i]; if (isFinite(x) && isFinite(y) && !(o.logy && y <= 0)) pts.push([X(x), Y(y), i]); });
        if (!pts.length) return;
        if (s.type === 'stick') { pts.forEach(p => S('line', { x1: p[0], x2: p[0], y1: Y(o.logy ? y0 : Math.max(0, y0)), y2: p[1], stroke: col, 'stroke-width': s.width || 1.6 }, plotG)); }
        else if (s.type === 'points') { pts.forEach(p => S('circle', { cx: p[0], cy: p[1], r: s.r || 3.2, fill: col, stroke: cssVar('--surface'), 'stroke-width': 1 }, plotG)); }
        else {
          let d = ''; pts.forEach((p, k) => { if (s.type === 'step' && k) d += `L${p[0]},${pts[k - 1][1]}`; d += (k ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); });
          if (s.type === 'area') { const base = Y(o.logy ? y0 : Math.max(0, Math.min(y1, 0) === 0 ? 0 : y0)); S('path', { d: d + `L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`, fill: col, opacity: 0.18 }, plotG); }
          S('path', { d, fill: 'none', stroke: col, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round' }, plotG);
          if (s.markers) pts.forEach(p => S('circle', { cx: p[0], cy: p[1], r: 2.6, fill: col }, plotG));
        }
        s._px = pts;
      });
      // legend
      const labeled = series.filter(s => s.label);
      if (o.legend !== false && labeled.length > 1 || (labeled.length === 1 && o.legend === true)) {
        const lg = document.createElement('div'); lg.className = 'legend';
        labeled.forEach((s, si) => { const sp = document.createElement('span'); const i = document.createElement('i'); i.style.background = s.color || cssVar(PAL[series.indexOf(s) % PAL.length]); sp.append(i, s.label); lg.append(sp); });
        container.appendChild(lg);
      }
      // tooltip / hover
      tip = document.createElement('div'); tip.className = 'plot-tip'; tip.style.display = 'none'; container.appendChild(tip);
      const hair = S('line', { y1: m.t, y2: m.t + ph, stroke: cssVar('--plot-axis'), 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' }, svg);
      const dot = S('circle', { r: 4, fill: 'none', stroke: cssVar('--text'), 'stroke-width': 1.6, visibility: 'hidden' }, svg);
      const hit = S('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
      function nearest(evx, evy) {
        let best = null, bd = 1e12;
        series.forEach(s => (s._px || []).forEach(p => { const d = (p[0] - evx) * (p[0] - evx) + (s.type === 'stick' || s.type === 'points' ? (p[1] - evy) * (p[1] - evy) * 0.25 : 0); if (d < bd) { bd = d; best = { s, p }; } }));
        return best;
      }
      hit.addEventListener('mousemove', e => {
        const r = svg.getBoundingClientRect(), sc = W / r.width, ex = (e.clientX - r.left) * sc, ey = (e.clientY - r.top) * sc, b = nearest(ex, ey);
        if (!b) return; const i = b.p[2], xv = b.s.x[i], yv = b.s.y[i];
        hair.setAttribute('x1', b.p[0]); hair.setAttribute('x2', b.p[0]); hair.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', b.p[0]); dot.setAttribute('cy', b.p[1]); dot.setAttribute('visibility', 'visible');
        tip.style.display = 'block'; tip.style.left = (b.p[0] / sc) + 'px'; tip.style.top = (b.p[1] / sc) + 'px';
        tip.textContent = o.tipFmt ? o.tipFmt(b.s, i) : `${b.s.label ? b.s.label + ': ' : ''}x=${+(+xv).toPrecision(5)}, y=${+(+yv).toPrecision(5)}`;
      });
      hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; hair.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
      if (o.onclick) hit.addEventListener('click', e => { const r = svg.getBoundingClientRect(), sc = W / r.width, b = nearest((e.clientX - r.left) * sc, (e.clientY - r.top) * sc); if (b) o.onclick(b.s, b.p[2], b.s.x[b.p[2]], b.s.y[b.p[2]]); });
    }
    draw();
    let rt; ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(container.clientWidth - W) > 4) draw(); }, 60); }); ro.observe(container);
    const th = () => draw(); window.addEventListener('qcl-theme', th); window.addEventListener('qc-theme', th);
    return { get opts() { return opts; }, update(n) { opts = Object.assign({}, opts, n); draw(); }, redraw: draw, destroy() { ro.disconnect(); window.removeEventListener('qcl-theme', th); window.removeEventListener('qc-theme', th); container.innerHTML = ''; } };
  }

  /* ---- colormaps ---- */
  const CM = {
    viridis: [[68, 1, 84], [59, 82, 139], [33, 144, 141], [93, 201, 99], [253, 231, 37]],
    hot: [[10, 10, 30], [120, 20, 90], [230, 80, 40], [255, 200, 60], [255, 255, 230]],
    diverge: [[41, 80, 190], [140, 175, 235], [245, 245, 245], [240, 160, 130], [190, 45, 40]],
    mag: [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]]
  };
  function cmapColor(name, t) {
    const st = CM[name] || CM.viridis; t = Math.max(0, Math.min(1, t)) * (st.length - 1);
    const i = Math.min(st.length - 2, Math.floor(t)), f = t - i, a = st[i], b = st[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  /** draw an nx × ny scalar field scaled to canvas. fn(i,j) with j=0 at TOP. */
  function heat(canvas, nx, ny, fn, o) {
    o = o || {}; const ctx = canvas.getContext('2d'); const off = document.createElement('canvas'); off.width = nx; off.height = ny;
    const oc = off.getContext('2d'), img = oc.createImageData(nx, ny); let vmin = o.vmin, vmax = o.vmax;
    const vals = new Float32Array(nx * ny); let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = fn(i, j); vals[j * nx + i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (vmin == null) vmin = lo; if (vmax == null) vmax = hi; if (o.symmetric) { const m = Math.max(Math.abs(vmin), Math.abs(vmax)); vmin = -m; vmax = m; }
    for (let k = 0; k < vals.length; k++) { let t = (vals[k] - vmin) / ((vmax - vmin) || 1); if (o.gamma) t = Math.pow(Math.max(0, t), o.gamma); const c = cmapColor(o.cmap || 'viridis', t); img.data[4 * k] = c[0]; img.data[4 * k + 1] = c[1]; img.data[4 * k + 2] = c[2]; img.data[4 * k + 3] = 255; }
    oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    return { vmin, vmax };
  }
  /** make canvas crisp on HiDPI: sets width/height from CSS size * dpr and returns ctx scaled so you draw in CSS px */
  function fitCanvas(canvas, cssH) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 600, h = cssH || canvas.clientHeight || 300;
    canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
  }
  /** Simple molecular-orbital energy-level diagram (SVG). levels:[{e,occ,label,tag}] e in eV; highlights HOMO/LUMO.
   *  opts: {height, homoIndex, lumoIndex, emin, emax, title} */
  function levelDiagram(container, levels, o) {
    o = o || {}; container.classList.add('plot'); container.innerHTML = '';
    const W = Math.max(260, container.clientWidth || 420), H = o.height || 380, m = { l: 62, r: 20, t: 22, b: 14 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }); container.appendChild(svg);
    const es = levels.map(l => l.e); let lo = o.emin != null ? o.emin : Math.min(...es) - 0.5, hi = o.emax != null ? o.emax : Math.max(...es) + 0.5;
    const Y = e => m.t + (1 - (e - lo) / (hi - lo)) * (H - m.t - m.b);
    ticks(lo, hi, 6).forEach(v => { const y = Y(v); S('line', { x1: m.l - 4, x2: m.l, y1: y, y2: y, stroke: cssVar('--plot-axis') }, svg); S('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: cssVar('--plot-grid') }, svg); const t = S('text', { x: m.l - 7, y: y + 3.5, 'text-anchor': 'end', fill: cssVar('--plot-text'), style: 'font-size:11px' }, svg); t.textContent = fmtTick(v); });
    const yl = S('text', { x: 12, y: H / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${H / 2})`, fill: cssVar('--plot-text'), style: 'font-size:11px' }, svg); yl.textContent = 'Energi (eV)';
    S('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: cssVar('--plot-axis') }, svg);
    levels.forEach((l, i) => {
      const y = Y(l.e), hl = i === o.homoIndex || i === o.lumoIndex, col = i === o.homoIndex ? cssVar('--c3') : i === o.lumoIndex ? cssVar('--c2') : (l.occ > 0 ? cssVar('--c1') : cssVar('--plot-axis'));
      const x1 = m.l + 40, x2 = W - m.r - 90;
      S('line', { x1, x2, y1: y, y2: y, stroke: col, 'stroke-width': hl ? 3.2 : 1.8, 'stroke-linecap': 'round', opacity: hl ? 1 : .8 }, svg);
      if (l.label || hl) { const t = S('text', { x: x2 + 8, y: y + 3.5, fill: col, style: 'font-size:11px;font-weight:' + (hl ? 700 : 500) }, svg); t.textContent = (l.label || '') + (hl ? '' : ''); }
      const tt = S('title', {}, svg.lastChild); tt.textContent = `${l.label || ''} ${(+l.e).toFixed(3)} eV`;
    });
    return svg;
  }
  global.QPlot = { chart, heat, fitCanvas, levelDiagram, cmapColor, ticks, S };
})(window);
