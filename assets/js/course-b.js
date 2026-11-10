/* Course sections 4–5: Kohn–Sham diagram, energy decomposition, live SCF */
(function () {
  'use strict';
  const C = window.Course, $ = C.$, on = C.on, KS = window.KSModel.KS1D;

  function sys(kind, nel, d) {
    if (kind === 'mol') return { nel, nuclei: [{ R: -d / 2, Z: nel / 2 }, { R: d / 2, Z: nel / 2 }] };
    return { nel, nuclei: [{ R: 0, Z: nel }] };
  }

  /* ---------- section 4 ---------- */
  function sec4() {
    const S = QC.svgEl, w = 720, h = 250, svg = S('svg', { viewBox: `0 0 ${w} ${h}`, style: 'width:100%;height:auto' });
    const add = (t, a, c) => { const e = S(t, a, c); svg.append(e); return e; };
    const box = (x, title, sub, col) => { add('rect', { x, y: 20, width: 290, height: 210, rx: 14, fill: 'var(--surface2)', stroke: col, 'stroke-width': 2 }); add('text', { x: x + 145, y: 44, 'text-anchor': 'middle', class: 'title' }, [title]); add('text', { x: x + 145, y: 218, 'text-anchor': 'middle', class: 'ax' }, [sub]); };
    box(15, 'Sistem nyata', 'elektron berinteraksi (1/rᵢⱼ), sulit', 'var(--c2)');
    box(415, 'Sistem Kohn–Sham', 'elektron TIDAK berinteraksi, di v_eff', 'var(--c1)');
    const pts = [[80, 100], [150, 150], [220, 100], [150, 80], [90, 170], [230, 170]];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) add('line', { x1: pts[i][0], y1: pts[i][1], x2: pts[j][0], y2: pts[j][1], stroke: 'var(--c2)', 'stroke-opacity': .35 });
    pts.forEach(p => add('circle', { cx: p[0], cy: p[1], r: 9, fill: 'var(--c2)' }));
    pts.forEach((p, i) => { add('circle', { cx: p[0] + 400, cy: p[1], r: 9, fill: 'var(--c1)' }); add('line', { x1: p[0] + 400, y1: p[1] + 10, x2: p[0] + 400, y2: p[1] + 28, stroke: 'var(--c1)', 'stroke-dasharray': '3 3' }); });
    add('rect', { x: 330, y: 105, width: 60, height: 40, rx: 8, fill: 'var(--accent)' }); add('text', { x: 360, y: 130, 'text-anchor': 'middle', fill: 'var(--accent-ink)', style: 'font-weight:700;font-size:14px' }, ['ρ(r)']);
    add('path', { d: 'M305 125 H330 M390 125 H415', stroke: 'var(--ink)', 'stroke-width': 2, 'marker-end': '' }); add('text', { x: 360, y: 168, 'text-anchor': 'middle', class: 'ax' }, ['ρ sama']);
    $('ks-diagram').append(svg);

    const bars = QC.chart('ks-bars', { series: [{ x: [0], y: [0] }] }), dens = QC.chart('ks-dens', { series: [{ x: [0], y: [0] }] });
    function run() {
      const k = $('ks-sys').value, d = +$('ks-d').value; $('ks-dv').textContent = d.toFixed(1);
      const o = k === 'm4' ? sys('mol', 4, d) : sys('atom', +k.slice(1)); o.diis = true; o.alpha = 0.4;
      const m = new KS(o), r = m.run(120);
      const vals = [r.Ts, r.Eext, r.EH, r.Exc, r.E - r.Enn], names = ['Ts', 'E_ne', 'E_H', 'E_xc', 'E_total'];
      bars.set({ title: 'Komponen energi (Hartree, model 1D)', xlim: [0.4, 5.6], xticks: [1, 2, 3, 4, 5], xfmt: v => names[v - 1] || '', ylabel: 'E (Eh)', legend: false,
        hlines: [{ y: 0, color: 'var(--muted)', dash: '' }],
        series: vals.map((v, i) => ({ type: 'stick', x: [i + 1], y: [v], width: 34, color: v >= 0 ? 'var(--c2)' : 'var(--c1)' })) });
      dens.set({ title: 'Kerapatan ρ(x) konvergen', xlabel: 'x', ylabel: 'ρ', legend: true, series: [{ name: 'ρ(x)', x: m.x, y: r.rho_out, color: 'var(--c3)', type: 'area', width: 2.5 }, { name: 'v_ext (skala)', x: m.x, y: m.vext.map(v => -v / 8 * Math.max(...r.rho_out) / 1), color: 'var(--muted)', dash: '4 3', width: 1.4 }] });
      $('ks-info').innerHTML = `Konvergen dalam <b>${r.iter}</b> iterasi (Δρ=${r.drho.toExponential(1)}). E<sub>total</sub> = <b>${r.E.toFixed(4)}</b> Eh. ε<sub>HOMO</sub> = ${r.eps[r.nocc - 1].toFixed(4)} Eh, ε<sub>LUMO</sub> = ${r.eps[r.nocc].toFixed(4)} Eh (gap KS ${(r.eps[r.nocc] - r.eps[r.nocc - 1]).toFixed(3)} Eh). ∫ρ = ${(r.rho_out.reduce((a, b) => a + b, 0) * m.h).toFixed(3)} elektron.`;
    }
    on('ks-sys', 'change', run); on('ks-d', 'input', run); run();
  }

  /* ---------- section 5 ---------- */
  function sec5() {
    // flowchart
    const S = QC.svgEl, svg = S('svg', { viewBox: '0 0 380 470', style: 'width:100%;height:auto;max-width:430px' }), nodes = {};
    const mk = (id, y, txt, kind) => {
      const g = S('g'); svg.append(g);
      if (kind === 'dia') g.append(S('polygon', { points: `190,${y} 300,${y + 32} 190,${y + 64} 80,${y + 32}`, fill: 'var(--surface2)', stroke: 'var(--muted)', 'stroke-width': 1.6 }));
      else g.append(S('rect', { x: 40, y, width: 300, height: 44, rx: 10, fill: 'var(--surface2)', stroke: 'var(--muted)', 'stroke-width': 1.6 }));
      const lines = txt.split('|'); lines.forEach((l, i) => g.append(S('text', { x: 190, y: y + (kind === 'dia' ? 36 : 20) + (i - (lines.length - 1) / 2 * (kind === 'dia' ? 0 : -1)) * 0 + i * 15 - (lines.length > 1 ? 0 : -6) + (kind === 'dia' ? 0 : 0), 'text-anchor': 'middle', class: 'axl' }, [l])));
      nodes[id] = g; return g;
    };
    const arrow = (x1, y1, x2, y2) => svg.append(S('path', { d: `M${x1} ${y1} L${x2} ${y2}`, stroke: 'var(--muted)', 'stroke-width': 1.6, fill: 'none' })) && svg.append(S('polygon', { points: `${x2},${y2} ${x2 - 5},${y2 - 9} ${x2 + 5},${y2 - 9}`, fill: 'var(--muted)' }));
    mk(1, 8, '1 · Tebakan awal ρ_in(r)'); mk(2, 76, '2 · Bangun v_eff = v_ext + v_H[ρ_in] + v_xc[ρ_in]'); mk(3, 144, '3 · Selesaikan Kohn–Sham: Hφ = εφ'); mk(4, 212, '4 · Bentuk ρ_out = Σ |φᵢ|²');
    mk(5, 280, '5 · ‖ρ_out − ρ_in‖ < toleransi ?', 'dia'); mk(6, 366, '6 · Mixing / DIIS → ρ_in baru'); mk(7, 424, 'Selesai: E, orbital, ε');
    arrow(190, 52, 190, 76); arrow(190, 120, 190, 144); arrow(190, 188, 190, 212); arrow(190, 256, 190, 280); arrow(190, 344, 190, 366); arrow(190, 410, 190, 424);
    svg.append(S('path', { d: 'M340 388 H362 V98 H340', stroke: 'var(--muted)', 'stroke-width': 1.6, fill: 'none' })); svg.append(S('polygon', { points: '340,98 350,93 350,103', fill: 'var(--muted)' }));
    svg.append(S('text', { x: 200, y: 352, class: 'ax' }, ['tidak'])); svg.append(S('text', { x: 200, y: 418, class: 'ax', style: 'display:none' }, ['']));
    svg.append(S('text', { x: 306, y: 330, class: 'ax' }, ['ya ↓']));
    $('scf-flow').append(svg);
    const hl = ids => Object.entries(nodes).forEach(([k, g]) => { const on_ = ids.includes(+k), el = g.firstChild; el.setAttribute('fill', on_ ? 'var(--accent)' : 'var(--surface2)'); el.setAttribute('stroke', on_ ? 'var(--accent)' : 'var(--muted)'); g.querySelectorAll('text').forEach(t => t.setAttribute('fill', on_ ? 'var(--accent-ink)' : 'var(--ink)')); });
    hl([1]);

    const cE = QC.chart('scf-E', { series: [{ x: [0], y: [0] }] }), cC = QC.chart('scf-conv', { series: [{ x: [0], y: [0] }] }), cR = QC.chart('scf-rho', { series: [{ x: [0], y: [0] }] }), cEps = QC.chart('scf-eps', { series: [{ x: [0], y: [0] }] });
    let model = null, timer = null;
    const cfg = () => { const nel = +$('scf-n').value, kind = $('scf-sys').value; return Object.assign(sys(kind, nel, 3), { alpha: +$('scf-alpha').value, diis: $('scf-diis').checked }); };
    function build() { stop(); $('scf-av').textContent = (+$('scf-alpha').value).toFixed(2); model = new KS(cfg()); render(); status('Siap. Tekan “Langkah” atau “Jalankan”.'); hl([1]); }
    const status = t => { $('scf-status').innerHTML = t; };
    function stats(r) {
      const items = [['Iterasi', r ? r.iter : 0], ['E total (Eh)', r ? r.E.toFixed(6) : '—'], ['ΔE', r && isFinite(r.dE) ? r.dE.toExponential(2) : '—'], ['‖Δρ‖', r ? r.drho.toExponential(2) : '—']];
      $('scf-stats').innerHTML = items.map(i => `<div class="stat"><div class="k">${i[0]}</div><div class="v" style="font-size:1.05rem">${i[1]}</div></div>`).join('');
    }
    function render() {
      const H = model.history, r = H[H.length - 1]; stats(r);
      const it = H.map(h => h.iter);
      cE.set({ title: 'Energi total tiap iterasi', xlabel: 'iterasi', ylabel: 'E (Eh)', legend: false, series: [{ x: it.length ? it : [0], y: it.length ? H.map(h => h.E) : [0], markers: true, color: 'var(--c1)' }] });
      const k = H.filter(h => isFinite(h.dE));
      cC.set({ title: 'Konvergensi (log₁₀)', xlabel: 'iterasi', ylabel: 'log₁₀', legend: true, ylim: [-9, 1.5], hlines: [{ y: -6, label: 'toleransi 10⁻⁶', color: 'var(--ok)' }],
        series: [{ name: 'log‖Δρ‖', x: H.map(h => h.iter), y: H.map(h => Math.log10(h.drho + 1e-12)), markers: true, color: 'var(--c2)' }, { name: 'log|ΔE|', x: k.map(h => h.iter), y: k.map(h => Math.log10(Math.abs(h.dE) + 1e-12)), markers: true, color: 'var(--c1)' }] });
      const last = H.slice(-10), ser = last.map((h, i) => ({ x: model.x, y: h.rho_out, color: i === last.length - 1 ? 'var(--c2)' : `color-mix(in srgb, var(--c1) ${15 + 70 * i / Math.max(1, last.length)}%, transparent)`, width: i === last.length - 1 ? 3 : 1.5, name: i === last.length - 1 ? 'iterasi terakhir' : '' }));
      if (!ser.length) ser.push({ x: model.x, y: model.rho_in, color: 'var(--c1)', name: 'tebakan awal' });
      cR.set({ title: 'Evolusi ρ_out(x) (memudar = lebih lama)', xlabel: 'x', ylabel: 'ρ', legend: true, series: ser });
      const no = r ? r.nocc + 2 : 3, epsS = []; for (let o = 0; o < no; o++) epsS.push({ name: o < (r ? r.nocc : 2) ? `ε${o + 1} (terisi)` : `ε${o + 1} (virtual)`, x: H.map(h => h.iter), y: H.map(h => h.eps[o]), markers: true, r: 2.6, color: QC.palette[o % 6], dash: r && o >= r.nocc ? '4 3' : '' });
      cEps.set({ title: 'Energi orbital tiap iterasi', xlabel: 'iterasi', ylabel: 'ε (Eh)', legend: true, series: epsS.length && H.length ? epsS : [{ x: [0], y: [0] }] });
    }
    function once(anim) {
      const mx = +$('scf-max').value;
      if (model.converged || model.iter >= mx) { stop(); return false; }
      const r = model.step(); render();
      if (anim) { [2, 3, 4, 5, 6].forEach((k, i) => setTimeout(() => hl([k]), i * 90)); }
      if (r.converged) { stop(); hl([7]); status(`<span class="pill ok">Konvergen</span> dalam <b>${r.iter}</b> iterasi: E = <b>${r.E.toFixed(8)}</b> Eh, HOMO ε = ${r.eps[r.nocc - 1].toFixed(5)} Eh, LUMO ε = ${r.eps[r.nocc].toFixed(5)} Eh.`); return false; }
      if (model.iter >= mx) { stop(); const bad = r.drho > 1e-3; status(`<span class="pill ${bad ? 'bad' : 'warn'}">${bad ? 'Tidak konvergen' : 'Belum konvergen'}</span> setelah ${mx} iterasi (‖Δρ‖ = ${r.drho.toExponential(2)}). Coba kecilkan α atau aktifkan DIIS.`); return false; }
      status(`Iterasi ${r.iter}: E = ${r.E.toFixed(6)} Eh, ‖Δρ‖ = ${r.drho.toExponential(2)}`); return true;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } const b = $('scf-play'); if (b) b.textContent = '▶ Jalankan'; }
    on('scf-step', 'click', () => { stop(); once(true); });
    on('scf-play', 'click', () => { if (timer) { stop(); return; } $('scf-play').textContent = '⏸ Jeda'; timer = setInterval(() => { if (!once(false)) stop(); }, 330); });
    on('scf-run', 'click', () => { stop(); while (once(false)); });
    on('scf-reset', 'click', build);
    ['scf-sys', 'scf-n', 'scf-diis', 'scf-max'].forEach(i => on(i, 'change', build)); on('scf-alpha', 'input', build);

    on('scf-cmp', 'click', async () => {
      stop(); const out = $('scf-cmp-out'), mx = +$('scf-max').value; out.innerHTML = '<p class="muted"><span class="spin"></span> Menjalankan 4 skenario…</p>';
      const base = cfg(), runs = [['α = 1.0 (tanpa DIIS)', 1, false], ['α = 0.5 (tanpa DIIS)', 0.5, false], ['α = 0.1 (tanpa DIIS)', 0.1, false], ['α = 0.5 + DIIS', 0.5, true]], res = [];
      for (const [name, a, d] of runs) { await new Promise(r => setTimeout(r, 15)); const m = new KS(Object.assign({}, base, { alpha: a, diis: d })); const r = m.run(mx); res.push({ name, m, r }); }
      const cc = document.createElement('div'); out.innerHTML = '<h3 style="margin-top:18px">Hasil eksperimen otomatis</h3>'; out.append(cc);
      const ch = QC.chart(cc, { title: 'log₁₀‖Δρ‖ vs iterasi — perbandingan strategi mixing', xlabel: 'iterasi', ylabel: 'log₁₀‖Δρ‖', ylim: [-9, 1.5], hlines: [{ y: -6, label: 'toleransi', color: 'var(--ok)' }], legend: true, h: 340,
        series: res.map((x, i) => ({ name: x.name, x: x.m.history.map(h => h.iter), y: x.m.history.map(h => Math.log10(h.drho + 1e-12)), color: QC.palette[i], width: 2.2 })) });
      QC.chartTools(cc, ch, 'scf-comparison');
      out.insertAdjacentHTML('beforeend', '<div class="tablewrap" style="margin-top:8px"><table class="t"><thead><tr><th>Skenario</th><th class="num">Iterasi</th><th>Status</th><th class="num">E akhir (Eh)</th></tr></thead><tbody>' + res.map(x => `<tr><td>${x.name}</td><td class="num">${x.r.iter}</td><td>${x.r.converged ? '<span class="pill ok">konvergen</span>' : '<span class="pill bad">tidak konvergen</span>'}</td><td class="num">${x.r.E.toFixed(6)}</td></tr>`).join('') + '</tbody></table></div>');
    });
    C.scfHook = { build, get model() { return model; } };
    build();
  }
  C.sec4 = sec4; C.sec5 = sec5;
})();
