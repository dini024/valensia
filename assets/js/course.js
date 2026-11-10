/* course.js — kerangka modul kuliah: helper visual (CU), TOC, progres, tombol "selesai".
   Dimuat sebelum course-part*.js. Bagian modul mendaftar lewat QC.course.register(id, fn);
   CU.boot() (dipanggil di DOMContentLoaded oleh course.html) memasang semuanya. */
(function () {
  'use strict';
  const CU = (window.CU = window.CU || {});

  /* ---------- warna mengikuti tema ---------- */
  CU.col = function () {
    const v = QC.cssVar;
    return { ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), line: v('--line'), grid: v('--grid'), card: v('--card'), card2: v('--card-2'), bg2: v('--bg-2'),
      primary: v('--primary'), accent: v('--accent'), violet: v('--violet'), red: v('--red'), green: v('--green'), blue: v('--blue'), viewer: v('--viewer-bg'),
      c: QC.palette() };
  };
  CU.hex2rgb = function (h) {
    h = (h || '#000').trim();
    if (h[0] === '#') { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    const m = h.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  };
  CU.mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));

  /* ---------- canvas responsif ---------- */
  CU.plot = function (parent, height, draw) {
    const cv = QC.el('canvas', { class: 'plot' }); cv.style.height = height + 'px'; parent.append(cv);
    const obj = { cv, lastW: 0 };
    function redraw() {
      const w = cv.clientWidth || parent.clientWidth || 600, dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr);
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, height);
      obj.lastW = w; obj.w = w; obj.h = height;
      try { draw(ctx, w, height, CU.col(), obj); } catch (e) { console.error(e); }
    }
    obj.redraw = redraw;
    if (window.ResizeObserver) new ResizeObserver(() => { if (Math.abs((cv.clientWidth || 0) - obj.lastW) > 1) redraw(); }).observe(cv);
    QC.onTheme(redraw); redraw();
    return obj;
  };
  /** Kerangka sumbu: mengembalikan {X,Y}. o: {xt,yt (array tick), xf,yf (formatter), xlabel,ylabel, logx, logy} */
  CU.frame = function (ctx, c, L, T, R, B, xmin, xmax, ymin, ymax, o = {}) {
    const fx = o.logx ? Math.log10 : (v => v), fy = o.logy ? Math.log10 : (v => v);
    const X = x => L + (fx(x) - fx(xmin)) / (fx(xmax) - fx(xmin)) * (R - L);
    const Y = y => B - (fy(y) - fy(ymin)) / (fy(ymax) - fy(ymin)) * (B - T);
    ctx.save(); ctx.font = '11px ' + getComputedStyle(document.body).fontFamily; ctx.lineWidth = 1;
    const xt = o.xt || [], yt = o.yt || [];
    ctx.strokeStyle = c.grid; ctx.fillStyle = c.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach(v => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); ctx.fillText(o.xf ? o.xf(v) : String(v), x, B + 4); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach(v => { const y = Y(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.fillText(o.yf ? o.yf(v) : String(v), L - 6, y); });
    ctx.strokeStyle = c.ink3; ctx.strokeRect(L + .5, T + .5, R - L, B - T);
    ctx.fillStyle = c.ink2; ctx.textBaseline = 'alphabetic';
    if (o.xlabel) { ctx.textAlign = 'center'; ctx.fillText(o.xlabel, (L + R) / 2, B + 30); }
    if (o.ylabel) { ctx.save(); ctx.translate(12, (T + B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    ctx.restore();
    return { X, Y };
  };
  CU.line = function (ctx, pts, color, lw = 2, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash); ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore();
  };
  CU.text = function (ctx, s, x, y, color, align = 'left', font) { ctx.save(); if (font) ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.restore(); };

  /* ---------- kontrol ---------- */
  CU.range = function (label, min, max, step, val, fmt, onInput) {
    const out = QC.el('output'), inp = QC.el('input', { type: 'range', min, max, step, value: val, 'aria-label': label });
    const row = QC.el('div', { class: 'range-row' }, QC.el('label', null, label), out, inp);
    const upd = () => { out.textContent = fmt ? fmt(+inp.value) : inp.value; };
    inp.addEventListener('input', () => { upd(); onInput && onInput(+inp.value); }); upd();
    return { el: row, input: inp, get: () => +inp.value, set(v) { inp.value = v; upd(); } };
  };
  CU.select = function (label, options, val, onChange) {
    const s = QC.el('select', { 'aria-label': label }, options.map(o => QC.el('option', { value: o[0] }, o[1])));
    s.value = val; s.addEventListener('change', () => onChange(s.value));
    return { el: QC.el('div', { class: 'field' }, QC.el('label', null, label), s), select: s };
  };
  CU.buttons = function (opts, val, onChange) {
    const g = QC.el('div', { class: 'btn-group' });
    const bs = opts.map(o => { const b = QC.el('button', { class: 'btn btn-sm' + (o[0] === val ? ' active' : ''), type: 'button' }, o[1]); b.addEventListener('click', () => { bs.forEach(x => x.classList.remove('active')); b.classList.add('active'); onChange(o[0]); }); return b; });
    bs.forEach(b => g.append(b)); return g;
  };
  /** kartu visual: {card, controls, stage, readout} */
  CU.viz = function (parent, title, desc, wide) {
    const controls = QC.el('div', { class: 'viz-controls' }), stage = QC.el('div', { class: 'viz-stage' });
    const card = QC.el('div', { class: 'card viz' }, QC.el('h4', null, title), desc ? QC.el('div', { class: 'desc', html: desc }) : null,
      QC.el('div', { class: 'viz-grid' + (wide ? ' wide' : '') }, stage, wide ? null : controls));
    if (wide) card.append(controls);
    parent.append(card); return { card, controls, stage };
  };
  CU.objectives = (list) => QC.el('div', { class: 'objectives', html: '<h4>Tujuan belajar</h4><ul>' + list.map(x => '<li>' + x + '</li>').join('') + '</ul>' });
  CU.key = (list) => QC.el('div', { class: 'key', html: '<h4>Intinya</h4><ul>' + list.map(x => '<li>' + x + '</li>').join('') + '</ul>' });
  CU.html = (h) => { const d = QC.el('div'); d.innerHTML = h; return d; };
  CU.eq = (h) => QC.el('div', { class: 'eq', html: h });
  CU.cite = (...ids) => ids.map(i => window.COURSE_REFS.cite(i)).join(' ');
  CU.fmtSci = (log10v) => { const e = Math.floor(log10v), m = Math.pow(10, log10v - e); return m.toFixed(1) + '×10' + String(e).split('').map(ch => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }[ch])).join(''); };

  /* ---------- boot: mount, TOC, progres ---------- */
  CU.boot = function () {
    const secs = QC.$$('.sec');
    secs.forEach((el, i) => {
      el.dataset.no = String(i + 1).padStart(2, '0');
      if (QC.course.parts[el.id]) {
        try { QC.course.parts[el.id](el); el.dataset.mounted = '1'; }
        catch (e) { console.error('Gagal memuat ' + el.id, e); el.append(QC.el('div', { class: 'callout err', html: '<strong>Bagian gagal dimuat</strong>' + QC.escapeHtml(String(e)) })); }
      } else {
        el.append(QC.el('p', { class: 'muted' }, 'Bagian ini sedang disiapkan.'));
      }
      if (!el.querySelector('h2')) el.prepend(QC.el('div', { class: 'sec-head' }, QC.el('span', { class: 'sec-no' }, el.dataset.no), QC.el('h2', null, el.dataset.title)));
      const btn = QC.el('button', { class: 'btn btn-sm', type: 'button' });
      el.append(QC.el('div', { class: 'sec-foot' }, btn));
      btn.addEventListener('click', () => toggleDone(el.id));
      el._btn = btn;
    });

    const done = new Set(QC.store.get('course.done', []));
    const list = QC.$('#toc-list');
    secs.forEach(el => { list.append(QC.el('li', { 'data-for': el.id }, QC.el('a', { href: '#' + el.id }, el.dataset.title.replace(/&amp;/g, '&')))); });
    function refresh() {
      secs.forEach(el => { const d = done.has(el.id); el.classList.toggle('is-done', d); el._btn.textContent = d ? '✓ Selesai — klik untuk batalkan' : 'Tandai selesai'; QC.$('li[data-for="' + el.id + '"]', list).classList.toggle('done', d); });
      QC.$('#toc-bar').style.width = (done.size / secs.length * 100) + '%';
      QC.$('#toc-label').textContent = done.size + ' / ' + secs.length + ' selesai';
    }
    function toggleDone(id) { done.has(id) ? done.delete(id) : done.add(id); QC.store.set('course.done', Array.from(done)); refresh(); }
    CU.markDone = (id) => { if (!done.has(id)) toggleDone(id); };
    QC.$('#toc-reset').addEventListener('click', () => { if (confirm('Hapus semua progres belajar?')) { done.clear(); QC.store.set('course.done', []); refresh(); } });
    refresh();

    // sorot section aktif
    if ('IntersectionObserver' in window) {
      const vis = new Map();
      const io = new IntersectionObserver(es => {
        es.forEach(e => vis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        let best = null, bv = 0; vis.forEach((v, k) => { if (v > bv) { bv = v; best = k; } });
        if (best) QC.$$('li', list).forEach(li => li.classList.toggle('active', li.dataset.for === best));
      }, { rootMargin: '-80px 0px -40% 0px', threshold: [0, .1, .3, .6, 1] });
      secs.forEach(s => io.observe(s));
    }
  };
})();
