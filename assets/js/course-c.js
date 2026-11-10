/* Course sections 6–11 + boot (navigasi, TOC, pemanggilan semua bagian, redraw tema) */
(function () {
  'use strict';
  const C = window.Course, $ = C.$, on = C.on;
  const el = QC.el;
  const HA_EV = 27.211386, EV_NM = 1239.84198, EV_CM = 8065.544;

  /* ---------- rujukan tambahan (DOI dari pengetahuan penulis; periksa kembali di doi.org) ---------- */
  const EXTRA = [
    { id: 'cohen', tag: 'DFT', title: 'Challenges for density functional theory', au: 'Cohen, A. J.; Mori-Sánchez, P.; Yang, W.', src: 'Chem. Rev. 112, 289', yr: 2012, doi: '10.1021/cr200107z', take: 'Ulasan kegagalan sistematis DFT (delokalisasi, kesalahan self-interaction) dan arah perbaikannya.' },
    { id: 'becke93', tag: 'Teori', title: 'Density-functional thermochemistry. III. The role of exact exchange', au: 'Becke, A. D.', src: 'J. Chem. Phys. 98, 5648', yr: 1993, doi: '10.1063/1.464913', take: 'Memperkenalkan hybrid (dasar B3LYP).' },
    { id: 'lyp', tag: 'Teori', title: 'Development of the Colle–Salvetti correlation-energy formula into a functional of the electron density', au: 'Lee, C.; Yang, W.; Parr, R. G.', src: 'Phys. Rev. B 37, 785', yr: 1988, doi: '10.1103/PhysRevB.37.785', take: 'Fungsional korelasi LYP.' },
    { id: 'rg84', tag: 'Teori', title: 'Density-functional theory for time-dependent systems', au: 'Runge, E.; Gross, E. K. U.', src: 'Phys. Rev. Lett. 52, 997', yr: 1984, doi: '10.1103/PhysRevLett.52.997', take: 'Dasar TDDFT.' },
    { id: 'pulay', tag: 'Teori', title: 'Convergence acceleration of iterative sequences. The case of SCF iteration', au: 'Pulay, P.', src: 'Chem. Phys. Lett. 73, 393', yr: 1980, doi: '10.1016/0009-2614(80)80396-4', take: 'Metode DIIS untuk mempercepat konvergensi SCF.' },
    { id: 'ogr', tag: 'Aplikasi', title: 'A low-cost, high-efficiency solar cell based on dye-sensitized colloidal TiO2 films', au: "O'Regan, B.; Grätzel, M.", src: 'Nature 353, 737', yr: 1991, doi: '10.1038/353737a0', take: 'Sel surya tersensitisasi zat warna (DSSC).' },
    { id: 'kojima', tag: 'Aplikasi', title: 'Organometal halide perovskites as visible-light sensitizers for photovoltaic cells', au: 'Kojima, A.; Teshima, K.; Shirai, Y.; Miyasaka, T.', src: 'J. Am. Chem. Soc. 131, 6050', yr: 2009, doi: '10.1021/ja809598r', take: 'Perovskit halida pertama sebagai sensitizer sel surya.' },
  ];
  EXTRA.forEach(r => { if (!C.REFS.some(x => x.id === r.id)) C.REFS.push(r); });

  /* ---------- fungsi numerik umum ---------- */
  function erf(x) { // Abramowitz–Stegun 7.1.26 (galat < 1.5e-7)
    const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  function solveSym(A, b) { // eliminasi Gauss dengan pivoting
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      [M[i], M[p]] = [M[p], M[i]];
      for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  function nelderMead(f, x0, step, maxit, tol) {
    const n = x0.length; let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; S.push(p); }
    let F = S.map(f);
    for (let it = 0; it < maxit; it++) {
      const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map(i => S[i]); F = idx.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) < tol && it > 50) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const mv = (a, t) => c.map((v, j) => v + t * (a[j] - v));
      const xr = mv(S[n], -1), fr = f(xr);
      if (fr < F[0]) { const xe = mv(S[n], -2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        const xc = fr < F[n] ? mv(S[n], -0.5) : mv(S[n], 0.5), fc = f(xc);
        if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = S[0].map((v, j) => v + 0.5 * (S[i][j] - v)); F[i] = f(S[i]); }
      }
    }
    const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] };
  }
  const svgTxt = (p, x, y, t, cls, extra) => p.append(QC.svgEl('text', Object.assign({ x, y, class: cls || '', 'text-anchor': 'middle' }, extra || {}), [t]));

  /* ======================================================================
     SEC 6 — Fungsional XC
     ====================================================================== */
  function sec6() {
    const rungs = [
      { n: 5, name: 'Double hybrid', inp: 'ρ, ∇ρ, τ, orbital terisi + orbital virtual (korelasi MP2)', ex: 'B2PLYP, DSD-PBEP86', cost: 'N⁵ (formal)', note: 'Paling akurat di antara DFT biasa untuk energi; mahal, cocok untuk single-point akhir.' },
      { n: 4, name: 'Hybrid / range-separated hybrid', inp: 'ρ, ∇ρ, (τ), + pertukaran Hartree–Fock eksak dari orbital terisi', ex: 'B3LYP, PBE0, M06-2X, CAM-B3LYP, ωB97X-D', cost: 'N⁴ formal (RIJCOSX/RI-K menurunkan)', note: 'Mengurangi self-interaction error; hybrid jarak-jauh perlu untuk TDDFT charge-transfer.' },
      { n: 3, name: 'meta-GGA', inp: 'ρ, ∇ρ, τ (kerapatan energi kinetik)', ex: 'TPSS, SCAN, r²SCAN', cost: '≈ N³ (dengan density fitting)', note: 'Informasi lokal tambahan; r²SCAN-3c populer untuk optimasi cepat.' },
      { n: 2, name: 'GGA', inp: 'ρ dan ∇ρ', ex: 'PBE, BLYP, BP86', cost: '≈ N³ (dengan density fitting)', note: 'Standar padatan (PBE) dan molekul besar; murah.' },
      { n: 1, name: 'LDA', inp: 'hanya ρ(r) lokal', ex: 'SVWN, Xα', cost: '≈ N³', note: 'Kerapatan gas elektron seragam; cenderung over-binding.' },
    ];
    const host = $('ladder');
    host.innerHTML = '';
    const wrap = el('div', { class: 'grid g2', style: 'align-items:start' });
    const stack = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    const detail = el('div', { class: 'callout' });
    const btns = [];
    function pick(r) {
      btns.forEach(b => b.style.outline = '');
      btns[rungs.indexOf(r)].style.outline = '2px solid var(--accent)';
      detail.innerHTML = `<b>Anak tangga ${r.n}: ${r.name}</b><br><span class="small">Masukan: ${r.inp}</span><br>Contoh: <code>${r.ex}</code><br>Biaya: ${r.cost}<br><span class="small muted">${r.note}</span>`;
    }
    rungs.forEach((r, i) => {
      const b = el('button', { class: 'btn', type: 'button', style: `text-align:left;margin-left:${(4 - i) * 14}px;justify-content:flex-start` }, `${r.n}. ${r.name} — ${r.ex.split(',')[0]}…`);
      b.addEventListener('click', () => pick(r)); btns.push(b); stack.append(b);
    });
    stack.prepend(el('div', { class: 'small muted' }, '▲ akurasi & biaya naik (klik anak tangga)'));
    wrap.append(stack, detail); host.append(wrap); pick(rungs[3]);

    // Fx(s)
    const kap = 0.804, muPBE = 0.21951, muSol = 0.12345679, bet = 0.0042, Cx = 1.5 * Math.cbrt(3 / (4 * Math.PI)), xs = Math.cbrt(48 * Math.PI * Math.PI);
    const fPBE = (s, mu) => 1 + kap - kap / (1 + mu * s * s / kap);
    const fB88 = s => { const x = xs * s; return 1 + bet * x * x / (Cx * (1 + 6 * bet * x * Math.asinh(x))); };
    const ss = linspace(0, 3, 241);
    const cF = QC.chart('fx-chart', { h: 320 });
    cF.set({
      title: 'Faktor peningkatan exchange Fₓ(s)', xlabel: 's = |∇ρ| / (2 k_F ρ)', ylabel: 'Fₓ', xlim: [0, 3], ylim: [0.95, 1.9], h: 320,
      hlines: [{ y: 1.804, label: 'batas Lieb–Oxford 1.804', color: 'var(--danger)' }],
      series: [
        { name: 'LDA (Fₓ = 1)', x: ss, y: ss.map(() => 1), color: 'var(--c1)' },
        { name: 'PBE (μ=0.2195)', x: ss, y: ss.map(s => fPBE(s, muPBE)), color: 'var(--c2)' },
        { name: 'PBEsol (μ=0.1235)', x: ss, y: ss.map(s => fPBE(s, muSol)), color: 'var(--c3)' },
        { name: 'B88 (β=0.0042)', x: ss, y: ss.map(fB88), color: 'var(--c4)', dash: '6 3' }]
    });
    // Range separation
    const rr = linspace(0.05, 10, 300);
    const cR = QC.chart('rs-chart', { h: 300 });
    function rs() {
      const mu = +$('rs-mu').value; $('rs-mv').textContent = mu.toFixed(2);
      cR.set({
        title: '1/r = erfc(μr)/r + erf(μr)/r', xlabel: 'r (bohr)', ylabel: 'a.u.', xlim: [0, 10], ylim: [0, 3], h: 300,
        series: [
          { name: '1/r (total)', x: rr, y: rr.map(r => 1 / r), color: 'var(--muted)', dash: '4 3' },
          { name: 'jarak-pendek erfc(μr)/r → DFT', x: rr, y: rr.map(r => (1 - erf(mu * r)) / r), color: 'var(--c1)' },
          { name: 'jarak-jauh erf(μr)/r → HF eksak', x: rr, y: rr.map(r => erf(mu * r) / r), color: 'var(--c2)' }]
      });
    }
    on('rs-mu', 'input', rs); rs();
    // tabel
    const rows = [
      ['PBE', 'GGA', '0', 'D3(BJ)/D4 ditambahkan', 'Padatan (Quantum ESPRESSO), geometri awal', 'Murah; band gap & energi reaksi kurang akurat'],
      ['BP86 / BLYP', 'GGA', '0', 'D3BJ', 'Optimasi molekul besar dengan RI', 'Cepat; HOMO–LUMO gap kecil'],
      ['r²SCAN-3c', 'meta-GGA komposit', '0', 'D4 + gCP built-in', 'Optimasi cepat molekul besar', 'Basis mTZVPP built-in; jangan tambah basis/dispersi'],
      ['B3LYP', 'hybrid global', '20', 'D3BJ (perlu eksplisit)', 'Geometri & HOMO/LUMO senyawa organik', 'Standar de-facto; lemah untuk CT jarak-jauh'],
      ['PBE0', 'hybrid global', '25', 'D3BJ', 'Padatan hybrid, pewarna, perovskit (molekul)', 'Tanpa parameter empiris'],
      ['M06-2X', 'hybrid meta', '54', 'implisit (tanpa D3 tambahan)', 'Termokimia & kinetika grup utama', 'Perlu grid halus; hati-hati logam transisi'],
      ['CAM-B3LYP', 'range-separated', '19 → 65', 'opsional D3', 'TDDFT, eksitasi charge-transfer (DSSC)', 'μ = 0.33 bohr⁻¹'],
      ['ωB97X-D / ωB97X-D3', 'range-separated', '≈22 → 100', 'built-in (D / D3)', 'TDDFT & interaksi non-kovalen', 'ω = 0.2 bohr⁻¹ (ωB97X-D)'],
      ['B2PLYP', 'double hybrid', '53 (+27% korelasi MP2)', 'D3BJ', 'Single-point energi akurat', 'Biaya N⁵; mulai dari geometri DFT'],
    ];
    const t = $('fx-table'); t.innerHTML = '<thead><tr><th>Fungsional</th><th>Jenis</th><th class="num">% HF eksak</th><th>Dispersi</th><th>Cocok untuk</th><th>Catatan</th></tr></thead>';
    const tb = el('tbody'); t.append(tb);
    rows.forEach(r => tb.append(el('tr', null, r.map((c, i) => el('td', { class: i === 2 ? 'num' : '', style: i >= 3 ? 'white-space:normal;min-width:150px' : '', text: c })))));
    $('fx-table').closest('.tablewrap').insertAdjacentHTML('afterend', '<p class="small muted">Persen HF dari literatur fungsional; nilai range-separated: jarak-pendek → jarak-jauh. Periksa manual ORCA/Gaussian untuk kata kunci tepat.</p>');
  }

  /* ======================================================================
     SEC 7 — Basis set
     ====================================================================== */
  const stoCache = {};
  function stoFit(n) {
    if (stoCache[n]) return stoCache[n];
    const rs = linspace(0, 22, 2201), dr = rs[1] - rs[0];
    const phi = rs.map(r => Math.exp(-r) / Math.sqrt(Math.PI));
    const gnorm = a => Math.pow(2 * a / Math.PI, 0.75);
    function simpson(vals) { let s = vals[0] + vals[vals.length - 1]; for (let i = 1; i < vals.length - 1; i++) s += (i % 2 ? 4 : 2) * vals[i]; return s * dr / 3; }
    const bvec = a => a.map(al => { const gn = gnorm(al); return simpson(rs.map((r, i) => 4 * Math.PI * r * r * gn * Math.exp(-al * r * r) * phi[i])); });
    const Smat = a => a.map(ai => a.map(aj => Math.pow(2 * Math.sqrt(ai * aj) / (ai + aj), 1.5)));
    function coefs(a) { const b = bvec(a), S = Smat(a); return { b, S, c: solveSym(S, b) }; }
    const obj = lx => { const a = lx.map(Math.exp); const { b, c } = coefs(a); let ov = 0; b.forEach((v, i) => ov += v * c[i]); return 1 - ov; };
    const lo = Math.log(0.1), hi = Math.log(0.6 + 0.9 * n * n);
    let best = null;
    [0, 1].forEach(k => {
      const x0 = n === 1 ? [Math.log(0.27)] : linspace(lo - 0.3 * k, hi + 0.4 * k, n);
      const r = nelderMead(obj, x0, 0.25, 2500 * n, 1e-14); if (!best || r.f < best.f) best = r;
    });
    const al = best.x.map(Math.exp).sort((a, b) => b - a);
    const { S, c } = coefs(al); let nn = 0; c.forEach((ci, i) => c.forEach((cj, j) => nn += ci * cj * S[i][j]));
    const cn = c.map(v => v / Math.sqrt(nn));
    const res = { alpha: al, c: cn, resid: best.f };
    stoCache[n] = res; return res;
  }
  function sec7() {
    const rs = linspace(0, 4, 201), rs2 = linspace(0, 6, 241);
    const c1 = QC.chart('sto-chart', { h: 300 }), c2 = QC.chart('sto-chart2', { h: 300 });
    function fitFn(fit) { const g = fit.alpha.map(a => Math.pow(2 * a / Math.PI, 0.75)); return r => fit.c.reduce((s, c, i) => s + c * g[i] * Math.exp(-fit.alpha[i] * r * r), 0); }
    function run() {
      const n = +$('sto-n').value; $('sto-nv').textContent = n;
      const fit = stoFit(n), f = fitFn(fit), exact = r => Math.exp(-r) / Math.sqrt(Math.PI);
      c1.set({ title: 'Orbital 1s (ζ = 1): Slater vs fit Gaussian', xlabel: 'r (bohr)', ylabel: 'φ(r)', xlim: [0, 4], h: 300, series: [
        { name: 'Slater e^(−r)', x: rs, y: rs.map(exact), color: 'var(--c1)', width: 3 },
        { name: `${n} Gaussian`, x: rs, y: rs.map(f), color: 'var(--c2)', dash: '6 3' }] });
      c2.set({ title: 'ln|φ| — cusp di inti dan ekor', xlabel: 'r (bohr)', ylabel: 'ln|φ|', xlim: [0, 6], ylim: [-10, 0], h: 300, series: [
        { name: 'Slater', x: rs2, y: rs2.map(r => Math.log(exact(r))), color: 'var(--c1)', width: 3 },
        { name: `${n} Gaussian`, x: rs2, y: rs2.map(r => Math.log(Math.max(Math.abs(f(r)), 1e-30))), color: 'var(--c2)', dash: '6 3' }] });
      $('sto-info').innerHTML = `Eksponen α: <code>${fit.alpha.map(a => a.toPrecision(5)).join(', ')}</code><br>Koefisien (primitif ternormalisasi, kontraksi ternormalisasi): <code>${fit.c.map(v => v.toFixed(5)).join(', ')}</code><br>Overlap dengan Slater eksak: <b>${(1 - fit.resid).toFixed(6)}</b>` +
        (n === 3 ? '<br><span class="muted">Bandingkan STO-3G (ζ=1): 2.22766, 0.40577, 0.10982 dan 0.15433, 0.53533, 0.44463.</span>' : '');
    }
    on('sto-n', 'input', () => { $('sto-nv').textContent = $('sto-n').value; clearTimeout(run.t); run.t = setTimeout(run, 30); });
    run();

    // tabel keluarga
    const BS = [ // nama, jenis, H, C/N/O, catatan
      ['STO-3G', 'minimal (Pople)', 1, 5, 'Hanya untuk pelajaran/geometri kasar'],
      ['3-21G', 'split-valence', 2, 9, 'Kasar; kurang polarisasi'],
      ['6-31G(d,p)', 'DZ + polarisasi (6d)', 5, 15, 'Gaussian: optimasi organik rutin'],
      ['6-311++G(d,p)', 'TZ + diffuse', 6, 19, 'Anion, TDDFT sederhana; H tanpa ++ = 6 fungsi, tabel ini tanpa diffuse'],
      ['def2-SVP', 'DZ + polarisasi (Ahlrichs)', 5, 14, 'Titik awal optimasi (ORCA); ECP otomatis Z>36'],
      ['def2-TZVP', 'TZ + polarisasi', 6, 31, 'Single-point & TDDFT yang baik'],
      ['cc-pVDZ', 'Dunning, korelasi-konsisten', 5, 14, 'Untuk metode korelasi; kurang ideal untuk DFT'],
      ['cc-pVTZ', 'Dunning TZ', 14, 30, ''],
      ['aug-cc-pVDZ', 'Dunning + diffuse', 9, 23, 'Anion, interaksi lemah'],
    ];
    const T = $('bs-table'); T.innerHTML = '<thead><tr><th>Basis set</th><th>Keluarga</th><th class="num">fungsi H</th><th class="num">fungsi C/N/O</th><th>Catatan</th></tr></thead>';
    const tb = el('tbody'); T.append(tb);
    BS.forEach(b => tb.append(el('tr', null, [el('td', { text: b[0] }), el('td', { text: b[1] }), el('td', { class: 'num', text: b[2] }), el('td', { class: 'num', text: b[3] }), el('td', { style: 'white-space:normal', text: b[4] })])));
    // kalkulator ukuran
    const calc = el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('h3', null, 'Kalkulator: jumlah fungsi basis & biaya relatif'),
      el('div', { class: 'form-grid' }, [
        ...['H', 'C', 'N', 'O'].map(s => el('div', { class: 'field' }, [el('label', null, 'Jumlah ' + s), el('input', { type: 'number', id: 'bc-' + s, min: 0, value: { H: 6, C: 6, N: 0, O: 0 }[s] })])),
        el('div', { class: 'field' }, [el('label', null, 'Basis set'), el('select', { id: 'bc-b' }, BS.map((b, i) => el('option', { value: i }, b[0])))]),
      ]),
      el('div', { id: 'bc-out', class: 'small', style: 'margin-top:8px' })]);
    T.closest('.tablewrap').insertAdjacentElement('afterend', calc);
    $('bc-b').value = 4;
    function bc() {
      const nH = +$('bc-H').value || 0, nC = +$('bc-C').value || 0, nN = +$('bc-N').value || 0, nO = +$('bc-O').value || 0, b = BS[+$('bc-b').value], ref = BS[4];
      const nb = nH * b[2] + (nC + nN + nO) * b[3], nr = nH * ref[2] + (nC + nN + nO) * ref[3], ne = nH + 6 * nC + 7 * nN + 8 * nO;
      const mem = Math.pow(nb, 4) / 8 * 8 / 1e9;
      $('bc-out').innerHTML = `Elektron: <b>${ne}</b> · fungsi basis N = <b>${nb}</b> · waktu relatif terhadap def2-SVP (≈ N⁴ formal): <b>${(Math.pow(nb / Math.max(nr, 1), 4)).toFixed(1)}×</b> · integral 2-elektron tanpa density-fitting ≈ ${mem < 1 ? (mem * 1000).toFixed(1) + ' MB' : mem.toFixed(1) + ' GB'} (N⁴/8 bilangan double). <span class="muted">Jumlah fungsi memakai d/f Cartesian pada Pople dan sferis pada lainnya; ORCA/Gaussian mencetak nilai pasti.</span>`;
    }
    ['bc-H', 'bc-C', 'bc-N', 'bc-O'].forEach(i => on(i, 'input', bc)); on('bc-b', 'change', bc); bc();
  }

  /* ======================================================================
     SEC 8 — PES, optimasi, frekuensi
     ====================================================================== */
  const MB = { A: [-200, -100, -170, 15], a: [-1, -1, -6.5, 0.7], b: [0, 0, 11, 0.6], c: [-10, -10, -6.5, 0.7], x0: [1, 0, -0.5, -1], y0: [0, 0.5, 1.5, 1] };
  function mbE(x, y) { let v = 0; for (let k = 0; k < 4; k++) { const dx = x - MB.x0[k], dy = y - MB.y0[k]; v += MB.A[k] * Math.exp(MB.a[k] * dx * dx + MB.b[k] * dx * dy + MB.c[k] * dy * dy); } return v; }
  function mbG(x, y) { let gx = 0, gy = 0; for (let k = 0; k < 4; k++) { const dx = x - MB.x0[k], dy = y - MB.y0[k], e = MB.A[k] * Math.exp(MB.a[k] * dx * dx + MB.b[k] * dx * dy + MB.c[k] * dy * dy); gx += e * (2 * MB.a[k] * dx + MB.b[k] * dy); gy += e * (MB.b[k] * dx + 2 * MB.c[k] * dy); } return [gx, gy]; }
  function mbH(x, y) { let xx = 0, yy = 0, xy = 0; for (let k = 0; k < 4; k++) { const dx = x - MB.x0[k], dy = y - MB.y0[k], e = MB.A[k] * Math.exp(MB.a[k] * dx * dx + MB.b[k] * dx * dy + MB.c[k] * dy * dy), p = 2 * MB.a[k] * dx + MB.b[k] * dy, q = MB.b[k] * dx + 2 * MB.c[k] * dy; xx += e * (p * p + 2 * MB.a[k]); yy += e * (q * q + 2 * MB.c[k]); xy += e * (p * q + MB.b[k]); } return [xx, xy, yy]; }
  function eig2(h) { const [a, b, c] = h, m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b); return [m - d, m + d]; }
  function mbNewtonPoint(x, y) { for (let i = 0; i < 80; i++) { const g = mbG(x, y), h = mbH(x, y), det = h[0] * h[2] - h[1] * h[1]; if (Math.abs(det) < 1e-12) break; const dx = -(h[2] * g[0] - h[1] * g[1]) / det, dy = -(-h[1] * g[0] + h[0] * g[1]) / det; x += dx; y += dy; if (Math.hypot(dx, dy) < 1e-10) break; } return [x, y]; }
  function optimize(method, x, y) {
    const path = [[x, y, mbE(x, y)]], gtol = 0.05;
    let Hinv = [[0.002, 0], [0, 0.002]], alpha = 1e-3, g = mbG(x, y);
    const maxIt = method === 'newton' ? 120 : 4000;
    for (let it = 0; it < maxIt; it++) {
      if (Math.hypot(g[0], g[1]) < gtol) break;
      let dx, dy;
      if (method === 'newton') {
        const h = mbH(x, y), det = h[0] * h[2] - h[1] * h[1];
        if (Math.abs(det) < 1e-9) { dx = -0.001 * g[0]; dy = -0.001 * g[1]; }
        else { dx = -(h[2] * g[0] - h[1] * g[1]) / det; dy = -(-h[1] * g[0] + h[0] * g[1]) / det; }
        const L = Math.hypot(dx, dy); if (L > 0.15) { dx *= 0.15 / L; dy *= 0.15 / L; }
        x += dx; y += dy;
      } else {
        if (method === 'sd') { dx = -g[0]; dy = -g[1]; } else { dx = -(Hinv[0][0] * g[0] + Hinv[0][1] * g[1]); dy = -(Hinv[1][0] * g[0] + Hinv[1][1] * g[1]); }
        let a = method === 'sd' ? alpha : 1; const E0 = mbE(x, y), gd = g[0] * dx + g[1] * dy;
        if (gd >= 0) { dx = -g[0] * 0.002; dy = -g[1] * 0.002; Hinv = [[0.002, 0], [0, 0.002]]; a = 1; }
        const L0 = Math.hypot(dx, dy); if (a * L0 > 0.1) a = 0.1 / L0;
        let k = 0; while (mbE(x + a * dx, y + a * dy) > E0 + 1e-4 * a * (g[0] * dx + g[1] * dy) && k++ < 40) a *= 0.5;
        const xn = x + a * dx, yn = y + a * dy, gn = mbG(xn, yn);
        if (method === 'sd') alpha = Math.min(a * 1.6, 0.05);
        else {
          const s = [xn - x, yn - y], yv = [gn[0] - g[0], gn[1] - g[1]], sy = s[0] * yv[0] + s[1] * yv[1];
          if (sy > 1e-10) { const r = 1 / sy, Hy = [Hinv[0][0] * yv[0] + Hinv[0][1] * yv[1], Hinv[1][0] * yv[0] + Hinv[1][1] * yv[1]], yHy = yv[0] * Hy[0] + yv[1] * Hy[1];
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) Hinv[i][j] += (1 + r * yHy) * r * s[i] * s[j] - r * (Hy[i] * s[j] + s[i] * Hy[j]); }
        }
        x = xn; y = yn;
      }
      g = mbG(x, y); path.push([x, y, mbE(x, y)]);
    }
    const gm = Math.hypot(...mbG(x, y)); return { path, x, y, converged: gm < gtol, gnorm: gm };
  }

  function sec8() {
    const cv = $('pes-canvas'), W = cv.width, H = cv.height, X0 = -1.5, X1 = 1.2, Y0 = -0.2, Y1 = 2.0;
    const px = x => (x - X0) / (X1 - X0) * W, py = y => (1 - (y - Y0) / (Y1 - Y0)) * H;
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
    const stops = [[0, [4, 10, 60]], [.25, [60, 30, 120]], [.5, [180, 50, 90]], [.75, [245, 140, 20]], [1, [252, 250, 170]]];
    const cm = t => { t = Math.max(0, Math.min(1, t)); for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const u = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]), a = stops[i - 1][1], b = stops[i][1]; return a.map((v, j) => Math.round(v + (b[j] - v) * u)); } return stops[4][1]; };
    { const ctx = bg.getContext('2d'), im = ctx.createImageData(W, H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = mbE(X0 + (i + .5) / W * (X1 - X0), Y1 - (j + .5) / H * (Y1 - Y0)), c = cm((Math.max(-150, Math.min(150, v)) + 150) / 300), k = 4 * (j * W + i); im.data[k] = c[0]; im.data[k + 1] = c[1]; im.data[k + 2] = c[2]; im.data[k + 3] = 255; }
      ctx.putImageData(im, 0, 0);
      // kontur sederhana (iso-energi) lewat tanda lompatan
      const lv = [-120, -90, -60, -30, 0, 40, 100]; const id = ctx.getImageData(0, 0, W, H);
      for (let j = 1; j < H; j++) for (let i = 1; i < W; i++) { const v = mbE(X0 + (i + .5) / W * (X1 - X0), Y1 - (j + .5) / H * (Y1 - Y0)), a = mbE(X0 + (i - .5) / W * (X1 - X0), Y1 - (j + .5) / H * (Y1 - Y0)), b = mbE(X0 + (i + .5) / W * (X1 - X0), Y1 - (j - .5) / H * (Y1 - Y0));
        if (lv.some(L => (v - L) * (a - L) < 0 || (v - L) * (b - L) < 0)) { const k = 4 * (j * W + i); id.data[k] = id.data[k] * 0.55 + 100; id.data[k + 1] = id.data[k + 1] * 0.55 + 100; id.data[k + 2] = id.data[k + 2] * 0.55 + 100; } }
      ctx.putImageData(id, 0, 0); }
    const mins = [[-0.558, 1.442], [0.623, 0.028], [-0.05, 0.467]].map(p => mbNewtonPoint(...p));
    const sads = [[-0.822, 0.624], [0.212, 0.293]].map(p => mbNewtonPoint(...p));
    let run = null, shown = 0, timer = null;
    const cE = QC.chart('pes-chart', { h: 260 });
    function draw() {
      const ctx = cv.getContext('2d'); ctx.drawImage(bg, 0, 0);
      const stroke = (cb) => { ctx.lineWidth = 3; ctx.strokeStyle = '#000'; cb(); ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; cb(); ctx.stroke(); };
      mins.forEach(p => stroke(() => { ctx.beginPath(); ctx.arc(px(p[0]), py(p[1]), 6, 0, 7); }));
      sads.forEach(p => stroke(() => { const x = px(p[0]), y = py(p[1]); ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x - 7, y + 5); ctx.closePath(); }));
      if (run) {
        const P = run.path.slice(0, shown + 1);
        ctx.lineWidth = 2; ctx.strokeStyle = '#4dd0e1'; ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1]))); ctx.stroke();
        ctx.fillStyle = '#4dd0e1'; P.forEach((p, i) => { if (i % Math.max(1, Math.round(run.path.length / 40)) === 0) { ctx.beginPath(); ctx.arc(px(p[0]), py(p[1]), 2.2, 0, 7); ctx.fill(); } });
        const s = P[0]; ctx.fillStyle = '#76ff03'; ctx.beginPath(); ctx.arc(px(s[0]), py(s[1]), 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    C.redraws.push(draw);
    function info() {
      if (!run) return;
      const last = run.path[run.path.length - 1], ev = eig2(mbH(last[0], last[1])), neg = ev.filter(v => v < 0).length;
      const kind = !run.converged ? 'belum konvergen (batas iterasi tercapai)' : neg === 0 ? '<b>minimum lokal</b> (kedua nilai eigen Hessian positif)' : neg === 1 ? '<b>titik pelana orde-1 = keadaan transisi</b> (tepat satu eigen negatif)' : '<b>maksimum</b> (dua eigen negatif)';
      $('pes-info').innerHTML = `Algoritma: <b>${$('pes-method').selectedOptions[0].text}</b><br>Langkah: <b>${run.path.length - 1}</b> · titik akhir (${last[0].toFixed(3)}, ${last[1].toFixed(3)}), E = ${last[2].toFixed(2)}<br>|∇E| = ${run.gnorm.toExponential(1)} · eigen Hessian: ${ev[0].toFixed(0)}, ${ev[1].toFixed(0)}<br>Hasil: ${kind}.`;
      cE.set({ title: 'Energi selama optimasi', xlabel: 'langkah', ylabel: 'E (satuan model)', h: 260, series: [{ x: run.path.map((_, i) => i), y: run.path.map(p => p[2]), color: 'var(--c1)' }] });
    }
    function go(x, y) {
      clearInterval(timer); run = optimize($('pes-method').value, x, y); shown = 0;
      const step = Math.max(1, Math.round(run.path.length / 80));
      timer = setInterval(() => { shown = Math.min(run.path.length - 1, shown + step); draw(); if (shown >= run.path.length - 1) { clearInterval(timer); info(); } }, 25);
      $('pes-info').textContent = 'Menghitung…';
    }
    cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); go(X0 + (e.clientX - r.left) / r.width * (X1 - X0), Y1 - (e.clientY - r.top) / r.height * (Y1 - Y0)); });
    on('pes-clear', 'click', () => { clearInterval(timer); run = null; draw(); $('pes-info').textContent = 'Klik titik awal pada peta…'; });
    on('pes-method', 'change', () => { if (run) go(run.path[0][0], run.path[0][1]); });
    draw();

    // Morse
    const cM = QC.chart('morse-chart', { h: 320 }), re = 1.4;
    function morse() {
      const D = +$('morse-D').value, a = +$('morse-a').value, mu = +$('morse-mu').value;
      $('mo-Dv').textContent = D.toFixed(3); $('mo-av').textContent = a.toFixed(2); $('mo-mv').textContent = mu.toFixed(2);
      const k = 2 * D * a * a, w = Math.sqrt(k / (mu * 1822.888486)), nu = w * 219474.6313;
      const rs = linspace(0.7, 5.2, 300), V = r => D * (1 - Math.exp(-a * (r - re))) ** 2, Vh = r => 0.5 * k * (r - re) ** 2;
      const series = [
        { name: 'Morse (anharmonik)', x: rs, y: rs.map(V), color: 'var(--c1)', width: 2.6 },
        { name: 'Parabola harmonik', x: rs, y: rs.map(Vh), color: 'var(--c2)', dash: '6 3' }];
      const nmax = Math.floor(w > 0 ? 2 * D / w - 0.5 : 0), nshow = Math.min(nmax, 8);
      for (let n = 0; n <= nshow; n++) { const E = w * (n + 0.5) - (w * (n + 0.5)) ** 2 / (4 * D); if (E >= D) break; const t1 = re - Math.log(1 + Math.sqrt(E / D)) / a, t2 = re - Math.log(1 - Math.sqrt(E / D)) / a; series.push({ x: [t1, t2], y: [E, E], color: 'var(--c3)', width: 1.4 }); }
      cM.set({ title: 'Kurva potensial & tingkat vibrasi', xlabel: 'r (bohr)', ylabel: 'E (Eh)', xlim: [0.7, 5.2], ylim: [0, D * 1.5], h: 320, series });
      const zpe = (w / 2 - w * w / (16 * D)) * 627.5095;
      $('morse-info').innerHTML = `k = 2Da² = <b>${k.toFixed(3)}</b> Eh/bohr² · ω = √(k/μ) → <b>${nu.toFixed(0)} cm⁻¹</b><br>ZPE (anharmonik) ≈ ${zpe.toFixed(2)} kcal/mol · jumlah tingkat terikat ≈ ${nmax + 1}<br><span class="muted">Kelengkungan besar (k tinggi) atau massa ringan → frekuensi tinggi (O–H/C–H ≈ 3000–3700 cm⁻¹; massa berat menurunkan frekuensi).</span>`;
    }
    ['morse-D', 'morse-a', 'morse-mu'].forEach(i => on(i, 'input', morse)); morse();

    // Keadaan transisi (kelengkungan negatif)
    const cT = QC.chart('ts-chart', { h: 320 }), q0 = 0.6, MU = 1.0;
    function ts() {
      const B = +$('ts-b').value; $('ts-bv').textContent = B;
      const V = q => B * (1 - (q / q0) ** 2) ** 2;
      const kTS = -4 * B / (q0 * q0), kMin = 8 * B / (q0 * q0); // kcal/mol/Å²
      const toNu = k => { const kk = k * 0.69477 /* N/m */, s = Math.sqrt(Math.abs(kk) / (MU * 1.66054e-27)) / (2 * Math.PI * 2.99792458e10); return k < 0 ? -s : s; };
      const qs = linspace(-1, 1, 300);
      cT.set({ title: 'Penghalang: minimum (kelengkungan +) dan puncak (kelengkungan −)', xlabel: 'koordinat reaksi q (Å)', ylabel: 'E (kcal/mol)', xlim: [-1, 1], ylim: [-B * 0.15, B * 1.6], h: 320, series: [
        { name: 'V(q)', x: qs, y: qs.map(V), color: 'var(--c1)', width: 2.6 },
        { name: 'parabola di TS', x: qs.filter(q => Math.abs(q) < 0.45), y: qs.filter(q => Math.abs(q) < 0.45).map(q => B + 0.5 * kTS * q * q), color: 'var(--danger)', dash: '5 3' },
        { name: 'parabola di minimum', x: qs.filter(q => Math.abs(q - q0) < 0.4), y: qs.filter(q => Math.abs(q - q0) < 0.4).map(q => 0.5 * kMin * (q - q0) ** 2), color: 'var(--c3)', dash: '5 3' }] });
      $('ts-info').innerHTML = `Di minimum: ν̃ = <b>${toNu(kMin).toFixed(0)} cm⁻¹</b> (nyata). Di puncak: ν̃ = <b>${Math.abs(toNu(kTS)).toFixed(0)}<i>i</i> cm⁻¹</b> → akar dari k &lt; 0 = frekuensi <b>imajiner</b> (dicetak negatif oleh ORCA/Gaussian).<br><span class="muted">Model: H (μ = 1 amu), q₀ = ${q0} Å. Barrier lebih tinggi → kelengkungan lebih curam → |ν̃| lebih besar.</span>`;
    }
    on('ts-b', 'input', ts); ts();
  }

  /* ======================================================================
     SEC 9 — TDDFT
     ====================================================================== */
  const EPS_K = 1 / 4.319e-9; // ≈ 2.315e8
  function readStates() {
    return $('td-data').value.split('\n').map(l => l.trim().split(/[\s,;]+/).map(Number)).filter(a => a.length >= 2 && a[0] > 0 && isFinite(a[1])).map(a => ({ E: a[0], f: a[1], nm: EV_NM / a[0] }));
  }
  function sec9() {
    const cT = QC.chart('td-chart', { h: 340 });
    function td() {
      const S = readStates(), fw = +$('td-fwhm').value, shape = $('td-shape').value; $('td-fv').textContent = fw.toFixed(2);
      if (!S.length) { $('td-table').innerHTML = '<div class="callout err">Isi minimal satu baris “E(eV) f”.</div>'; return; }
      const fwcm = fw * EV_CM, sig = fwcm / 2.35482, gam = fwcm / 2;
      const prof = (nu, nu0) => shape === 'g' ? Math.exp(-((nu - nu0) ** 2) / (2 * sig * sig)) / (sig * Math.sqrt(2 * Math.PI)) : (gam / Math.PI) / ((nu - nu0) ** 2 + gam * gam);
      const lmin = Math.max(150, Math.min(...S.map(s => s.nm)) - 120), lmax = Math.min(1500, Math.max(...S.map(s => s.nm)) + 150);
      const ls = linspace(lmin, lmax, 500), nus = ls.map(l => 1e7 / l);
      const eps = nus.map(nu => S.reduce((a, s) => a + EPS_K * s.f * prof(nu, s.E * EV_CM), 0));
      const peak = s => EPS_K * s.f * prof(s.E * EV_CM, s.E * EV_CM);
      const series = [{ name: 'Spektrum ε(λ)', x: ls, y: eps, color: 'var(--c1)', width: 2.6, type: 'area' }];
      S.forEach(s => series.push({ x: [s.nm, s.nm], y: [0, peak(s)], color: 'var(--c2)', width: 2 }));
      const imax = eps.indexOf(Math.max(...eps));
      cT.set({ title: 'Spektrum serapan hasil broadening', xlabel: 'λ (nm)', ylabel: 'ε (M⁻¹ cm⁻¹)', xlim: [lmin, lmax], ylim: [0, Math.max(...eps, ...S.map(peak)) * 1.12], h: 340, series, vlines: [{ x: ls[imax], label: `λmaks ≈ ${ls[imax].toFixed(0)} nm`, color: 'var(--c3)' }] });
      let h = '<table class="t"><thead><tr><th>#</th><th class="num">E (eV)</th><th class="num">λ (nm)</th><th class="num">f</th><th class="num">ε puncak<sub>i</sub></th><th class="num">LHE=1−10<sup>−f</sup></th></tr></thead><tbody>';
      S.forEach((s, i) => h += `<tr><td>${i + 1}</td><td class="num">${s.E.toFixed(3)}</td><td class="num">${s.nm.toFixed(1)}</td><td class="num">${s.f.toFixed(3)}</td><td class="num">${peak(s).toExponential(2)}</td><td class="num">${(1 - Math.pow(10, -s.f)).toFixed(3)}</td></tr>`);
      $('td-table').innerHTML = h + '</tbody></table><div class="small muted">Batang oranye = kontribusi puncak tiap eksitasi bila berdiri sendiri; kurva biru = jumlah semua.</div>';
      if (C.dsscUpdate) C.dsscUpdate();
    }
    ['td-data', 'td-fwhm', 'td-shape'].forEach(i => on(i, 'input', td)); on('td-shape', 'change', td); td();

    // konverter
    function cvt(from) {
      let ev = +$('cv-ev').value, nm = +$('cv-nm').value;
      if (from === 'nm' && nm > 0) { ev = EV_NM / nm; $('cv-ev').value = ev.toFixed(4); } else if (ev > 0) { nm = EV_NM / ev; $('cv-nm').value = nm.toFixed(1); }
      $('cv-out').innerHTML = ev > 0 ? `${(ev * EV_CM).toFixed(0)} cm⁻¹ · ${(ev * 23.0605).toFixed(2)} kcal/mol · ${(ev * 96.4853).toFixed(2)} kJ/mol` : '';
    }
    on('cv-ev', 'input', () => cvt('ev')); on('cv-nm', 'input', () => cvt('nm')); cvt('ev');

    // CT
    const cCT = QC.chart('ct-chart', { h: 300 });
    function ct() {
      const ip = +$('ct-ip').value, ea = +$('ct-ea').value, R = linspace(3, 40, 200), d = ip - ea;
      cCT.set({ title: 'Energi eksitasi CT vs jarak donor–akseptor (ilustrasi)', xlabel: 'R (bohr)', ylabel: 'ΔE_CT (eV)', xlim: [3, 40], h: 300, series: [
        { name: 'Eksak: IP − EA − 1/R', x: R, y: R.map(r => d - HA_EV / r), color: 'var(--c1)', width: 2.6 },
        { name: 'Range-separated (≈65% → 1/R)', x: R, y: R.map(r => d - 0.65 * HA_EV / r), color: 'var(--c3)' },
        { name: 'Hybrid global 20% (B3LYP)', x: R, y: R.map(r => d - 0.2 * HA_EV / r), color: 'var(--c2)' },
        { name: 'GGA murni (0%)', x: R, y: R.map(() => d), color: 'var(--danger)', dash: '5 3' }] });
    }
    ['ct-ip', 'ct-ea'].forEach(i => on(i, 'input', ct)); ct();

    // ---- Diagram DSSC ----
    const box = el('div', { class: 'card', style: 'margin-top:14px', id: 'dssc-box' }, [
      el('h3', null, 'Penyelarasan tingkat energi DSSC (HOMO/LUMO vs pita konduksi TiO₂)'),
      el('p', { class: 'small muted' }, 'Aturan praktis pewarna DSSC: (i) E₍LUMO*₎ cukup di atas CB TiO₂ untuk injeksi elektron (ΔG_inj ≲ −0.2 eV), (ii) HOMO cukup di bawah potensial redoks elektrolit untuk regenerasi (ΔG_reg ≲ −0.2 eV), (iii) puncak serapan kuat (LHE tinggi). Energi orbital DFT hanya perkiraan kasar — validasi dengan ΔSCF/elektrokimia.'),
      el('div', { class: 'grid g2' }, [
        el('div', null, [
          el('div', { class: 'form-grid' }, [
            ...[['ds-homo', 'E(HOMO) vs vakum (eV)', -5.4], ['ds-e00', 'E₀₋₀ (eV) — eksitasi terendah', 2.2], ['ds-cb', 'Pita konduksi TiO₂ (eV)', -4.0], ['ds-redox', 'Redoks I⁻/I₃⁻ (eV)', -4.85]].map(([id, lab, v]) => el('div', { class: 'field' }, [el('label', null, lab), el('input', { type: 'number', id, step: 0.01, value: v })]))]),
          el('div', { class: 'row', style: 'margin:6px 0' }, [el('button', { class: 'btn', id: 'ds-fromtd', type: 'button' }, 'Ambil E₀₋₀ dari tabel TDDFT (f terbesar)')]),
          el('div', { id: 'ds-out', class: 'small' })]),
        el('div', { id: 'ds-svg' })])]);
    $('ct-chart').closest('.grid.g3').insertAdjacentElement('afterend', box);
    function dssc() {
      const H = +$('ds-homo').value, e00 = +$('ds-e00').value, cb = +$('ds-cb').value, rd = +$('ds-redox').value, lumo = H + e00;
      const inj = cb - lumo, reg = H - rd, voc = Math.abs(cb - rd);
      const flag = (v, lim) => v <= lim ? '<span class="badge ok">layak</span>' : '<span class="badge err">kurang</span>';
      $('ds-out').innerHTML = `E(LUMO*) = HOMO + E₀₋₀ = <b>${lumo.toFixed(2)} eV</b><br>ΔG_inj = E_CB − E(LUMO*) = <b>${inj.toFixed(2)} eV</b> ${flag(inj, -0.2)}<br>ΔG_reg = E(HOMO) − E_redoks = <b>${reg.toFixed(2)} eV</b> ${flag(reg, -0.2)}<br>V<sub>oc</sub> maksimum ≈ |E_CB − E_redoks| = <b>${voc.toFixed(2)} V</b><br><span class="muted">Batas −0.2 eV adalah aturan praktis literatur, bukan hukum.</span>`;
      const W = 330, Hh = 300, ymin = -7, ymax = -2.5, Y = e => 20 + (e - ymax) / (ymin - ymax) * (Hh - 40), s = QC.svgEl('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'diagram energi DSSC', style: 'width:100%;max-width:360px' });
      const bar = (x, w, e, label, col) => { s.append(QC.svgEl('line', { x1: x, x2: x + w, y1: Y(e), y2: Y(e), stroke: col, 'stroke-width': 4 })); svgTxt(s, x + w / 2, Y(e) - 6, `${label} ${e.toFixed(2)}`, 'ax'); };
      s.append(QC.svgEl('rect', { x: 20, y: 20, width: 70, height: Y(cb) - 20, fill: 'var(--c1)', opacity: .12 }));
      bar(20, 70, cb, 'CB TiO₂', 'var(--c1)'); bar(130, 70, lumo, 'LUMO*', 'var(--c2)'); bar(130, 70, H, 'HOMO', 'var(--c2)'); bar(240, 70, rd, 'I⁻/I₃⁻', 'var(--c3)');
      const arrow = (x, y1, y2, col) => s.append(QC.svgEl('path', { d: `M${x} ${y1} L${x} ${y2}`, stroke: col, 'stroke-width': 1.6, fill: 'none', 'marker-end': 'url(#ah)' }));
      const defs = QC.svgEl('defs'); defs.append(QC.svgEl('marker', { id: 'ah', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto' }, [QC.svgEl('path', { d: 'M0 0 L6 3 L0 6 z', fill: 'var(--ink)' })])); s.prepend(defs);
      s.append(QC.svgEl('line', { x1: 165, x2: 165, y1: Y(H), y2: Y(lumo), stroke: 'var(--muted)', 'stroke-dasharray': '3 3' }));
      svgTxt(s, 182, (Y(H) + Y(lumo)) / 2, 'hν', 'ax');
      s.append(QC.svgEl('path', { d: `M200 ${Y(lumo)} L88 ${Y(cb)}`, stroke: 'var(--ink)', 'stroke-width': 1.4, fill: 'none', 'marker-end': 'url(#ah)' })); svgTxt(s, 140, (Y(lumo) + Y(cb)) / 2 - 8, 'injeksi', 'ax');
      s.append(QC.svgEl('path', { d: `M240 ${Y(rd)} L202 ${Y(H)}`, stroke: 'var(--ink)', 'stroke-width': 1.4, fill: 'none', 'marker-end': 'url(#ah)' })); svgTxt(s, 235, (Y(rd) + Y(H)) / 2, 'regenerasi', 'ax');
      $('ds-svg').innerHTML = ''; $('ds-svg').append(s);
    }
    ['ds-homo', 'ds-e00', 'ds-cb', 'ds-redox'].forEach(i => on(i, 'input', dssc));
    on('ds-fromtd', 'click', () => { const S = readStates(); if (!S.length) return; const b = S.reduce((a, s) => s.f > a.f ? s : a, S[0]); $('ds-e00').value = b.E.toFixed(3); dssc(); });
    C.dsscUpdate = null; dssc();
  }

  /* ======================================================================
     SEC 10 — alur kerja & rekomendasi
     ====================================================================== */
  function sec10() {
    const steps = [
      ['1', 'Bangun struktur', 'SMILES → 3D + pre-optimasi (Molecular Builder)'],
      ['2', 'Pilih metode', 'fungsional, basis, dispersi, pelarut (tabel di bawah)'],
      ['3', 'Buat input', 'ORCA / Gaussian (Input Builder)'],
      ['4', 'Optimasi + frekuensi', '0 frekuensi imajiner = minimum'],
      ['5', 'Single-point / TDDFT', 'basis lebih besar pada geometri teroptimasi'],
      ['6', 'Analisis', 'HOMO/LUMO, IP/EA, spektrum (Results Analyzer)'],
      ['7', 'Validasi', 'bandingkan ke eksperimen / benchmark, uji sensitivitas metode']];
    const wf = $('wf'); wf.innerHTML = ''; wf.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px';
    steps.forEach(s => wf.append(el('div', { class: 'callout', style: 'margin:0' }, [el('b', null, s[0] + '. ' + s[1]), el('div', { class: 'small muted' }, s[2])])));

    const SOLV = { Ethanol: ['Ethanol', 'ethanol'], Acetonitrile: ['Acetonitrile', 'acetonitrile'], Water: ['Water', 'water'], Toluene: ['Toluene', 'toluene'], Dichloromethane: ['CH2Cl2', 'dichloromethane'] };
    function recommend() {
      const task = $('rc-task').value, sys = $('rc-sys').value, solv = $('rc-solv').value, notes = [];
      let fun = 'B3LYP', disp = true, basis = 'def2-SVP', oF = 'B3LYP', gF = 'b3lyp', job = '', gjob = '', extra = '', gdisp = ' em=gd3bj', gb = 'def2svp';
      if (task === 'pbc') {
        const out = el('div', { class: 'callout' });
        out.innerHTML = '<b>Padatan periodik (Quantum ESPRESSO)</b><ul><li>Fungsional: <code>PBE</code> (+ D3 untuk lapisan/vdW); koreksi gap: HSE06/PBE0 atau GW/Hubbard-U sesuai kasus.</li><li>Konvergensikan <code>ecutwfc</code> (dan <code>ecutrho</code>) serta grid k-point terhadap energi total <i>sebelum</i> produksi.</li><li>Pseudopotensial: gunakan pustaka teruji (mis. SSSP/PseudoDojo) dan konsisten antar atom.</li><li>Relaksasi: <code>vc-relax</code> untuk sel, lalu <code>scf</code>/<code>nscf</code> untuk DOS/pita.</li><li>Band gap PBE biasanya diremehkan — jangan dibandingkan langsung dengan gap optik.</li></ul>';
        $('rc-out').innerHTML = ''; $('rc-out').append(out); return;
      }
      if (sys === 'org') notes.push('Organik/pewarna netral: hybrid + dispersi sudah memadai.');
      if (task === 'opt') { oF = 'B3LYP'; job = 'Opt Freq'; gjob = 'opt freq'; notes.push('Alternatif cepat: <code>r²SCAN-3c</code> (ORCA) untuk molekul besar. Jalankan frekuensi pada level yang sama dengan optimasi.'); }
      if (task === 'sp') { oF = 'PBE0'; gF = 'pbe1pbe'; basis = 'def2-TZVP'; gb = 'def2tzvp'; notes.push('IP/EA vertikal terbaik lewat ΔSCF (netral/kation/anion), bukan −E<sub>HOMO</sub> saja.'); }
      if (task === 'td') { oF = 'CAM-B3LYP'; gF = 'cam-b3lyp'; basis = 'def2-TZVP'; gb = 'def2tzvp'; job = ''; extra = '\n%tddft nroots 20 end'; gjob = 'td(nstates=20)'; disp = false; notes.push('Optimasi geometri keadaan dasar dulu (level DFT di atas), lalu TDDFT dengan range-separated hybrid pada geometri itu.', 'Gunakan ≥ 10–20 root; cek pita yang dipotong di tepi spektrum. Bandingkan 2 fungsional (CAM-B3LYP vs ωB97X-D) bila CT mungkin.'); }
      if (task === 'nci') { oF = 'wB97X-D3BJ'; gF = 'wb97xd'; basis = 'def2-TZVPD'; gb = 'def2tzvpd'; disp = false; notes.push('Koreksi basis-set superposition (counterpoise); benchmark dengan DLPNO-CCSD(T) bila perlu.'); }
      if (sys === 'anion' && task !== 'nci') { basis = basis.replace('def2-SVP', 'def2-SVPD').replace('def2-TZVP', 'def2-TZVPD'); gb = gb.replace('def2svp', 'def2svpd').replace('def2tzvp', 'def2tzvpd'); notes.push('Anion/H-bond: fungsi <b>diffuse</b> wajib (def2-…D atau ma-def2-…).'); }
      if (sys === 'metal') { if (task === 'opt' || task === 'sp') { oF = 'TPSSh'; gF = 'tpsstpss'; if (task === 'sp') { oF = 'PBE0'; } } notes.push('Logam transisi: periksa multiplisitas/keadaan spin, stabilitas fungsi gelombang (<code>Stable</code>/<code>stable=opt</code>), dan uji >1 fungsional.'); }
      if (sys === 'heavy') { notes.push('Unsur berat (Z&gt;36): def2 memakai ECP otomatis; untuk efek relativistik skalar/ spin–orbit gunakan ZORA/DKH + basis SARC (ORCA).'); }
      const dispO = disp && !/wB97|CAM/.test(oF) ? ' D3BJ' : '', dispG = disp && !/wb97|cam/.test(gF) ? gdisp : '';
      const rij = /PBE0|B3LYP|CAM|wB97|TPSSh/.test(oF) ? ' RIJCOSX def2/J' : ' RI def2/J';
      let o = `! ${oF}${dispO} ${basis}${rij}${job ? ' ' + job : ''}${solv ? ` CPCM(${SOLV[solv][0]})` : ''}${extra}`;
      let scrf = solv ? ` scrf=(cpcm,solvent=${SOLV[solv][1]})` : '';
      let g = `#p ${gjob ? gjob + ' ' : ''}${gF}/${gb}${dispG}${scrf}`;
      if (task === 'td') g = `#p td(nstates=20) ${gF}/${gb}${scrf}`;
      if (task === 'nci') g = `#p ${gF}/${gb}${scrf} counterpoise=2`;
      if (solv) notes.push('Pelarut implisit (CPCM) tidak menangkap ikatan-H spesifik; untuk spektrum, pakai pelarut yang sama pada optimasi & TDDFT.');
      const out = el('div'); $('rc-out').innerHTML = '';
      out.innerHTML = `<div class="callout"><b>Titik awal:</b> <code>${oF.replace('wB97X-D3BJ', 'ωB97X-D3BJ')}${dispO} / ${basis}</code></div>
        <div class="small muted" style="margin-top:6px">Baris kunci ORCA</div><pre>${QC.esc(o)}</pre>
        <div class="small muted" style="margin-top:6px">Route Gaussian</div><pre>${QC.esc(g)}</pre>
        <ul class="small">${notes.map(n => '<li>' + n + '</li>').join('')}</ul>
        <p class="small muted">Rekomendasi umum mengikuti prinsip best-practice (Bursch dkk., 2022) — bukan pengganti uji benchmark untuk sistem Anda.</p>`;
      $('rc-out').append(out);
    }
    ['rc-task', 'rc-sys', 'rc-solv'].forEach(i => on(i, 'change', recommend)); recommend();
  }

  /* ======================================================================
     SEC 11 — kuis, glosarium, pustaka
     ====================================================================== */
  function sec11() {
    const Q = [
      ['Berapa jumlah variabel spasial fungsi gelombang untuk sistem N elektron (tanpa spin)?', ['N', '3N', '3N − 6', '4N'], 1, 'Setiap elektron punya tiga koordinat (x, y, z); itulah “dinding eksponensial” penyimpanan fungsi gelombang.'],
      ['Teorema Hohenberg–Kohn pertama menyatakan bahwa…', ['energi tidak bergantung pada ρ', 'kerapatan keadaan dasar ρ(r) menentukan potensial eksternal (hingga konstanta) dan karenanya semua sifat', 'orbital Kohn–Sham identik dengan orbital Hartree–Fock', 'korelasi elektron dapat diabaikan'], 1, 'Dari ρ(r) kita dapat memulihkan v_ext, sehingga Hamiltonian dan semua sifat keadaan dasar.'],
      ['Satu-satunya bagian energi Kohn–Sham yang harus diaproksimasi adalah…', ['energi kinetik sistem tak berinteraksi', 'energi Hartree', 'E_xc (pertukaran-korelasi)', 'tolakan inti–inti'], 2, 'T_s, E_H, dan E_ext eksak; hanya E_xc yang diaproksimasi (LDA, GGA, hybrid, …).'],
      ['Mengapa SCF harus diiterasi?', ['Karena komputer tidak akurat', 'Hamiltonian Kohn–Sham bergantung pada ρ, sedangkan ρ dihitung dari orbital hasil Hamiltonian itu', 'Untuk menambah jumlah elektron', 'Agar basis set konvergen'], 1, 'Hubungan melingkar: ρ → H[ρ] → orbital → ρ baru. Selesai saat input = output (konsisten-diri).'],
      ['Setelah optimasi geometri, perhitungan frekuensi menghasilkan satu frekuensi imajiner. Berarti…', ['Struktur adalah minimum global', 'Struktur adalah titik pelana orde-1 (kandidat keadaan transisi)', 'Basis set terlalu kecil pasti', 'Perhitungan benar tanpa masalah untuk minimum'], 1, 'Satu eigen Hessian negatif = TS. Untuk minimum yang diinginkan, ikuti mode imajiner lalu optimasi ulang.'],
      ['Mengapa fungsional range-separated penting untuk eksitasi charge-transfer?', ['Lebih murah', 'Memulihkan perilaku −1/R jarak-jauh lewat pertukaran HF eksak', 'Menghilangkan kebutuhan basis set', 'Menambah dispersi'], 1, 'GGA/hybrid global tidak punya −1/R penuh sehingga energi CT terlalu rendah.'],
      ['Mengapa program kimia kuantum memakai fungsi Gaussian, bukan Slater?', ['Gaussian lebih mirip orbital sebenarnya', 'Integral dua-elektron dapat dihitung analitik (hasil kali Gaussian = Gaussian)', 'Gaussian selalu lebih akurat', 'Slater tidak dapat dinormalisasi'], 1, 'Gaussian tidak punya cusp, tetapi integralnya murah; karenanya beberapa primitif dikontraksi.'],
      ['Skala biaya formal Hartree–Fock terhadap jumlah fungsi basis N adalah…', ['N', 'N²', 'N⁴', 'e^N'], 2, 'Jumlah integral dua-elektron ~N⁴ (RI/COSX dan trik lain menurunkannya dalam praktik).'],
      ['Kekuatan osilator f ≈ 0 untuk suatu keadaan tereksitasi berarti…', ['Energi eksitasi nol', 'Transisi “gelap” (hampir terlarang) — hampir tidak menyerap', 'Molekul tidak berwarna secara pasti', 'Keadaan itu tripel'], 1, 'f sebanding dengan kuadrat momen dipol transisi; f kecil → pita serap lemah.'],
      ['Untuk DSSC, ΔG_inj = E_CB(TiO₂) − E(LUMO*) bernilai −0.8 eV. Interpretasi paling tepat?', ['Injeksi elektron tidak mungkin', 'Ada gaya dorong termodinamika untuk injeksi (LUMO* di atas CB)', 'Pewarna tidak menyerap cahaya', 'HOMO terlalu tinggi'], 1, 'Nilai negatif memadai (≲ −0.2 eV, aturan praktis) menandakan injeksi favorable secara termodinamika; kinetik tetap perlu dicek.'],
    ];
    const root = $('quiz'); root.innerHTML = ''; let answered = 0, right = 0;
    const score = el('div', { class: 'callout', id: 'quiz-score' }, 'Jawab semua pertanyaan; umpan balik muncul setelah memilih.');
    Q.forEach((q, qi) => {
      const box = el('div', { class: 'quiz-q' }, [el('b', null, `${qi + 1}. ${q[0]}`)]), fb = el('div', { class: 'fb' });
      q[1].forEach((o, oi) => {
        const inp = el('input', { type: 'radio', name: 'q' + qi, value: oi });
        inp.addEventListener('change', () => {
          if (box.dataset.done) return; box.dataset.done = '1'; answered++;
          const ok = oi === q[2]; if (ok) right++; box.classList.add(ok ? 'ok' : 'bad');
          fb.innerHTML = (ok ? '✔ Benar. ' : `✘ Jawaban benar: <b>${q[1][q[2]]}</b>. `) + q[3];
          box.querySelectorAll('input').forEach(i => i.disabled = true);
          score.innerHTML = `Skor: <b>${right}/${answered}</b> dari ${Q.length} soal` + (answered === Q.length ? (right >= 8 ? ' — sangat baik!' : right >= 6 ? ' — baik, ulangi bagian yang meleset.' : ' — baca ulang bagian 2–5 lalu coba lagi.') : '');
        });
        box.append(el('label', null, [inp, el('span', { text: o })]));
      });
      box.append(fb); root.append(box);
    });
    root.append(score, el('button', { class: 'btn', type: 'button', onclick() { sec11(); } }, 'Ulangi kuis'));

    const GL = [
      ['Born–Oppenheimer', 'Inti dianggap diam relatif terhadap elektron; energi menjadi fungsi posisi inti.'],
      ['Fungsi gelombang Ψ', 'Amplitudo peluang; |Ψ|² = kerapatan peluang konfigurasi elektron.'],
      ['Kerapatan elektron ρ(r)', 'Jumlah elektron per volume di titik r; hanya 3 variabel.'],
      ['Hartree–Fock (HF)', 'Satu determinan Slater; pertukaran eksak, tanpa korelasi.'],
      ['Energi korelasi', 'Selisih energi eksak dan HF akibat gerakan elektron yang saling menghindar.'],
      ['Kohn–Sham', 'Sistem tak-berinteraksi fiktif dengan ρ yang sama dengan sistem nyata.'],
      ['E_xc', 'Pertukaran-korelasi: bagian yang harus diaproksimasi dalam DFT.'],
      ['Self-interaction error', 'Elektron berinteraksi dengan kerapatannya sendiri; mengurangi akurasi gap & CT.'],
      ['SCF', 'Self-Consistent Field: iterasi hingga ρ masukan = ρ keluaran.'],
      ['DIIS', 'Ekstrapolasi dari riwayat residual untuk mempercepat SCF (Pulay).'],
      ['Basis set', 'Kumpulan fungsi tempat orbital dikembangkan.'],
      ['Polarisasi / diffuse', 'Fungsi momentum sudut tinggi / eksponen kecil untuk bentuk ikatan / ekor anion.'],
      ['ECP', 'Effective core potential: mengganti elektron inti unsur berat.'],
      ['Hessian', 'Matriks turunan kedua energi; eigennya menentukan sifat titik stasioner & frekuensi.'],
      ['Frekuensi imajiner', 'Kelengkungan negatif; ciri keadaan transisi (atau struktur belum minimum).'],
      ['TDDFT', 'DFT bergantung waktu (respons linear) untuk energi eksitasi dan f.'],
      ['Kekuatan osilator f', 'Ukuran tak berdimensi kekuatan serapan sebuah transisi.'],
      ['Koopmans / gap KS', 'IP ≈ −E_HOMO (hanya aproksimasi); gap KS ≠ gap optik.'],
    ];
    const gl = $('glossary'); gl.innerHTML = ''; GL.forEach(g => gl.append(el('div', { class: 'gl' }, [el('b', { text: g[0] }), el('span', { text: g[1] })])));

    const refs = $('refs'); refs.innerHTML = '';
    C.REFS.slice().sort((a, b) => a.au.localeCompare(b.au)).forEach(r => refs.append(el('li', { html: C.refHTML(r) })));
    refs.insertAdjacentHTML('afterend', '<p class="small muted">Catatan keandalan: rujukan Bursch dkk., GNoME (Merchant dkk.), Materials Project (Jain dkk.), Cohen–Mori-Sánchez–Yang, ORCA (Neese dkk.), serta Hohenberg–Kohn/Kohn–Sham telah diperiksa keberadaannya lewat pencarian web; rujukan lain ditulis dari pengetahuan penulis — <b>periksa kembali tahun, volume, dan DOI di doi.org sebelum dikutip</b>.</p>');
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  function toc() {
    const nav = $('toc'); nav.innerHTML = '<b style="display:block;padding:4px 10px 8px">Daftar isi</b>';
    QC.$$('section.card[id^="s"]').forEach(s => { const a = el('a', { href: '#' + s.id }, s.dataset.title.replace(/&amp;/g, '&')); nav.append(a); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) QC.$$('a', nav).forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-80px 0px -60% 0px' });
      QC.$$('section.card[id^="s"]').forEach(s => io.observe(s));
    }
  }
  function boot() {
    QC.nav('course.html'); toc();
    for (let k = 0; k <= 11; k++) { const fn = C['sec' + k] || (k === 6 ? sec6 : k === 7 ? sec7 : k === 8 ? sec8 : k === 9 ? sec9 : k === 10 ? sec10 : k === 11 ? sec11 : null);
      try { if (fn) fn(); } catch (e) { console.error('sec' + k, e); const s = $('s' + k); if (s) s.append(el('div', { class: 'callout err', text: 'Bagian gagal dimuat: ' + e.message })); } }
    const redraw = () => C.redraws.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', QC.debounce(redraw, 150));
  }
  C.sec6 = sec6; C.sec7 = sec7; C.sec8 = sec8; C.sec9 = sec9; C.sec10 = sec10; C.sec11 = sec11;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
