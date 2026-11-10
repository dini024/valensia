/* Course sections 0–3 */
(function () {
  'use strict';
  const C = (window.Course = window.Course || {});
  C.redraws = C.redraws || [];
  C.cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const $ = id => document.getElementById(id);
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  C.on = on; C.$ = $;

  /* ---------- references (single source for cards + bibliography) ---------- */
  C.REFS = [
    { id: 'gnome', tag: 'AI & data', title: 'Scaling deep learning for materials discovery', au: 'Merchant, A.; Batzner, S.; Schoenholz, S. S.; Aykol, M.; Cheon, G.; Cubuk, E. D.', src: 'Nature 624, 80–85', yr: 2023, doi: '10.1038/s41586-023-06735-9', take: 'Model GNN yang dilatih pada data DFT memprediksi ~2,2 juta struktur kristal baru yang stabil — skrining komputasi pada skala yang mustahil secara eksperimen.' },
    { id: 'mp', tag: 'AI & data', title: 'Commentary: The Materials Project: A materials genome approach to accelerating materials innovation', au: 'Jain, A.; Ong, S. P.; Hautier, G.; Chen, W.; Richards, W. D.; Dacek, S.; et al.', src: 'APL Materials 1, 011002', yr: 2013, doi: '10.1063/1.4812323', take: 'Basis data terbuka sifat material hasil perhitungan DFT; titik awal banyak studi skrining dan machine-learning.' },
    { id: 'af', tag: 'AI & data', title: 'Highly accurate protein structure prediction with AlphaFold', au: 'Jumper, J.; Evans, R.; Pritzel, A.; Green, T.; Figurnov, M.; et al.', src: 'Nature 596, 583–589', yr: 2021, doi: '10.1038/s41586-021-03819-2', take: 'Prediksi struktur protein berakurasi mendekati eksperimen; dasar Nobel Kimia 2024.' },
    { id: 'n98', tag: 'Nobel', title: 'Nobel Prize in Chemistry 1998 — Walter Kohn (DFT) & John Pople (metode komputasi)', au: 'The Nobel Committee', src: 'nobelprize.org', yr: 1998, url: 'https://www.nobelprize.org/prizes/chemistry/1998/summary/', take: 'Pengakuan atas teori fungsional kerapatan dan pengembangan metode komputasi kimia kuantum.' },
    { id: 'n13', tag: 'Nobel', title: 'Nobel Prize in Chemistry 2013 — Karplus, Levitt, Warshel', au: 'The Nobel Committee', src: 'nobelprize.org', yr: 2013, url: 'https://www.nobelprize.org/prizes/chemistry/2013/summary/', take: 'Model multiskala untuk sistem kimia kompleks: simulasi komputer sejajar dengan eksperimen.' },
    { id: 'n24', tag: 'Nobel', title: 'Nobel Prize in Chemistry 2024 — Baker, Hassabis, Jumper', au: 'The Nobel Committee', src: 'nobelprize.org', yr: 2024, url: 'https://www.nobelprize.org/prizes/chemistry/2024/summary/', take: 'Desain protein komputasional dan prediksi struktur protein.' },
    { id: 'mh', tag: 'DFT', title: 'Thirty years of density functional theory in computational chemistry: an overview and extensive assessment of 200 density functionals', au: 'Mardirossian, N.; Head-Gordon, M.', src: 'Mol. Phys. 115, 2315–2372', yr: 2017, doi: '10.1080/00268976.2017.1333644', take: 'Tolok ukur 200 fungsional — rujukan memilih fungsional berdasarkan jenis masalah.' },
    { id: 'burke', tag: 'DFT', title: 'Perspective on density functional theory', au: 'Burke, K.', src: 'J. Chem. Phys. 136, 150901', yr: 2012, doi: '10.1063/1.4704546', take: 'Penjelasan jernih tentang apa yang DFT bisa dan tidak bisa lakukan.' },
    { id: 'lej', tag: 'DFT', title: 'Reproducibility in density functional theory calculations of solids', au: 'Lejaeghere, K.; Bihlmayer, G.; Björkman, T.; et al.', src: 'Science 351, aad3000', yr: 2016, doi: '10.1126/science.aad3000', take: 'Berbagai kode DFT periodik memberi hasil yang konsisten — dasar kepercayaan pada simulasi.' },
    { id: 'orca', tag: 'Praktik', title: 'The ORCA quantum chemistry program package', au: 'Neese, F.; Wennmohs, F.; Becker, U.; Riplinger, C.', src: 'J. Chem. Phys. 152, 224108', yr: 2020, doi: '10.1063/5.0004608', take: 'Makalah rujukan program ORCA yang dipakai di platform ini.' },
    { id: 'grimme', tag: 'Praktik', title: 'Best-Practice DFT Protocols for Basic Molecular Computational Chemistry', au: 'Bursch, M.; Mewes, J.-M.; Hansen, A.; Grimme, S.', src: 'Angew. Chem. Int. Ed. 61, e202205735', yr: 2022, doi: '10.1002/anie.202205735', take: 'Panduan langkah-demi-langkah memilih fungsional, basis set, dan dispersi — berguna sebagai checklist.' },
    { id: 'hk', tag: 'Teori', title: 'Inhomogeneous Electron Gas', au: 'Hohenberg, P.; Kohn, W.', src: 'Phys. Rev. 136, B864', yr: 1964, doi: '10.1103/PhysRev.136.B864', take: 'Dua teorema dasar DFT.' },
    { id: 'ks', tag: 'Teori', title: 'Self-Consistent Equations Including Exchange and Correlation Effects', au: 'Kohn, W.; Sham, L. J.', src: 'Phys. Rev. 140, A1133', yr: 1965, doi: '10.1103/PhysRev.140.A1133', take: 'Persamaan Kohn–Sham: dasar semua perhitungan DFT praktis.' },
    { id: 'pbe', tag: 'Teori', title: 'Generalized Gradient Approximation Made Simple', au: 'Perdew, J. P.; Burke, K.; Ernzerhof, M.', src: 'Phys. Rev. Lett. 77, 3865', yr: 1996, doi: '10.1103/PhysRevLett.77.3865', take: 'Fungsional PBE (sumber F_x di bagian 6).' },
    { id: 'cam', tag: 'Teori', title: 'A new hybrid exchange–correlation functional using the Coulomb-attenuating method (CAM-B3LYP)', au: 'Yanai, T.; Tew, D. P.; Handy, N. C.', src: 'Chem. Phys. Lett. 393, 51–57', yr: 2004, doi: '10.1016/j.cplett.2004.06.011', take: 'Range-separated hybrid untuk eksitasi charge-transfer.' },
    { id: 'd3', tag: 'Teori', title: 'A consistent and accurate ab initio parametrization of density functional dispersion correction (DFT-D) for the 94 elements H-Pu', au: 'Grimme, S.; Antony, J.; Ehrlich, S.; Krieg, H.', src: 'J. Chem. Phys. 132, 154104', yr: 2010, doi: '10.1063/1.3382344', take: 'Koreksi dispersi D3.' },
  ];
  const refHTML = r => `${QC.esc(r.au)} <i>${QC.esc(r.title)}</i>. ${QC.esc(r.src)} (${r.yr}). ` + (r.doi ? `<a href="https://doi.org/${r.doi}" target="_blank" rel="noopener">doi:${r.doi}</a>` : `<a href="${r.url}" target="_blank" rel="noopener">${r.url}</a>`);
  C.refHTML = refHTML;

  /* ---------- section 0 ---------- */
  function sec0() {
    const wrap = $('paper-cards'), fil = $('paper-filter');
    const feat = C.REFS.filter(r => ['AI & data', 'Nobel', 'DFT', 'Praktik'].includes(r.tag));
    const tags = ['Semua', ...new Set(feat.map(r => r.tag))];
    feat.forEach(r => wrap.append(QC.el('div', { class: 'paper', 'data-tag': r.tag }, [
      QC.el('div', { class: 'row' }, [QC.el('span', { class: 'pill', text: r.tag }), QC.el('span', { class: 'meta', text: r.yr })]),
      QC.el('h4', { text: r.title }),
      QC.el('div', { class: 'meta', text: r.au + ' · ' + r.src }),
      QC.el('div', { class: 'take', text: r.take }),
      QC.el('a', { class: 'doi', href: r.doi ? 'https://doi.org/' + r.doi : r.url, target: '_blank', rel: 'noopener', text: r.doi ? 'doi:' + r.doi : r.url.replace('https://', '') }),
    ])));
    tags.forEach((t, i) => fil.append(QC.el('button', {
      class: 'chip', text: t, onclick() { QC.$$('.paper', wrap).forEach(p => p.classList.toggle('hide', t !== 'Semua' && p.dataset.tag !== t)); } })));
    // comparison table
    const rows = [
      ['Akses ke struktur elektronik (orbital, ρ, muatan)', 'Tidak terukur langsung; disimpulkan dari spektroskopi/difraksi', 'Tersedia langsung dari Ψ atau ρ', 'Detail atomik'],
      ['Keadaan transisi & intermediat berumur sangat pendek', 'Sangat sulit ditangkap', 'Dicari sebagai titik pelana, jalur dengan IRC', 'Detail atomik'],
      ['Menyaring ratusan–ribuan kandidat', 'Perlu mensintesis setiap kandidat', 'Dapat diotomasi di cluster/HPC', 'Skrining'],
      ['Biaya per kandidat', 'Reagen, waktu sintesis, instrumen', 'Waktu CPU; naik cepat bersama ukuran sistem (bagian 2c)', 'Biaya'],
      ['Akurasi absolut', 'Acuan akhir', 'Bergantung metode/basis; harus divalidasi terhadap eksperimen', 'Keterbatasan'],
      ['Kondisi ekstrem (tekanan, suhu, radikal reaktif)', 'Perlu peralatan khusus', 'Hanya parameter masukan', 'Skrining'],
      ['Efek pelarut, defek, permukaan nyata', 'Nyata, tetapi sulit dipisahkan satu per satu', 'Dapat diisolasi, namun pelarut dimodelkan kasar (implicit solvent)', 'Keterbatasan'],
      ['Reprodusibilitas & berbagi', 'Bergantung sampel dan operator', 'Input + versi program dapat dibagikan; kode DFT padatan konsisten (Lejaeghere dkk.)', 'Biaya'],
    ];
    const tb = $('cmp-table'); tb.innerHTML = '<thead><tr><th>Aspek</th><th>Eksperimen</th><th>Simulasi</th><th>Kategori</th></tr></thead>';
    const body = QC.el('tbody'); tb.append(body);
    rows.forEach(r => body.append(QC.el('tr', { 'data-tag': r[3] }, r.map((c, i) => QC.el('td', { style: i < 3 ? 'white-space:normal;min-width:180px' : '', text: c })))));
    ['Semua', 'Detail atomik', 'Skrining', 'Biaya', 'Keterbatasan'].forEach(t => $('cmp-filter').append(QC.el('button', {
      class: 'chip', text: t, onclick() { QC.$$('tr', body).forEach(tr => tr.style.display = (t === 'Semua' || tr.dataset.tag === t) ? '' : 'none'); } })));
  }

  /* ---------- section 1 ---------- */
  function sec1() {
    // particle in a box
    const grid = Array.from({ length: 201 }, (_, i) => i / 200);
    const cPsi = QC.chart('box-psi', { title: 'ψ(x)', xlim: [0, 1], series: [{ x: [0], y: [0] }] });
    const cPr = QC.chart('box-prob', { title: '|ψ(x)|²', xlim: [0, 1], series: [{ x: [0], y: [0] }] });
    const cE = QC.chart('box-E', { title: 'Tingkat energi (E = n²h²/8mL²)', series: [{ x: [0], y: [0] }] });
    function box() {
      const n = +$('box-n').value; $('box-nv').textContent = n;
      const psi = grid.map(x => Math.SQRT2 * Math.sin(n * Math.PI * x));
      cPsi.set({ title: `ψ${n}(x) = √2 sin(${n}πx)`, xlim: [0, 1], ylim: [-1.8, 1.8], xlabel: 'x / L', hlines: [{ y: 0, color: 'var(--line)', dash: '' }], series: [{ x: grid, y: psi, color: 'var(--c1)' }] });
      cPr.set({ title: `|ψ${n}|² — kerapatan peluang`, xlim: [0, 1], ylim: [0, 2.2], xlabel: 'x / L', series: [{ x: grid, y: psi.map(v => v * v), color: 'var(--c2)', type: 'area' }] });
      const lv = []; for (let k = 1; k <= 8; k++) lv.push({ x: [0, 1], y: [k * k, k * k], color: k === n ? 'var(--c2)' : 'var(--muted)', width: k === n ? 4 : 1.5 });
      cE.set({ title: 'Tingkat energi (satuan h²/8mL²)', xlim: [0, 1], ylim: [0, 70], xticks: [], yticks: [1, 4, 9, 16, 25, 36, 49, 64], series: lv, legend: false, h: 300 });
      $('box-info').innerHTML = `n = ${n}: <b>${n - 1}</b> node, E = <b>${n * n}</b> E₁. Celah ke tingkat berikutnya: ${(2 * n + 1)} E₁.`;
    }
    on('box-n', 'input', box); box();

    // hydrogen
    const R = {
      '1s': r => 2 * Math.exp(-r), '2s': r => (1 / Math.SQRT2) * (1 - r / 2) * Math.exp(-r / 2),
      '2p': r => (1 / (2 * Math.sqrt(6))) * r * Math.exp(-r / 2), '3d': r => (4 / (81 * Math.sqrt(30))) * r * r * Math.exp(-r / 3)
    };
    const rg = Array.from({ length: 400 }, (_, i) => i * 0.08);
    const cH = QC.chart('h-chart', { series: [{ x: [0], y: [0] }] });
    const psi2 = {
      '1s': (x, y, z) => { const r = Math.hypot(x, y, z); return Math.exp(-2 * r); },
      '2s': (x, y, z) => { const r = Math.hypot(x, y, z); return (2 - r) ** 2 * Math.exp(-r); },
      '2p': (x, y, z) => { const r = Math.hypot(x, y, z); return z * z * Math.exp(-r); },
      '3d': (x, y, z) => { const r2 = x * x + y * y + z * z, r = Math.sqrt(r2); return (3 * z * z - r2) ** 2 * Math.exp(-2 * r / 3); }
    };
    const box3 = { '1s': 5, '2s': 16, '2p': 14, '3d': 24 };
    let cloud = null;
    function drawCloud() {
      const k = $('h-orb').value, B = box3[k], f = psi2[k];
      let mx = 0; for (let i = 0; i < 30000; i++) mx = Math.max(mx, f((Math.random() * 2 - 1) * B, (Math.random() * 2 - 1) * B, (Math.random() * 2 - 1) * B));
      mx *= 1.15; const pts = []; let tries = 0;
      while (pts.length < 6000 && tries < 4e6) { tries++; const x = (Math.random() * 2 - 1) * B, y = (Math.random() * 2 - 1) * B, z = (Math.random() * 2 - 1) * B; if (Math.random() * mx < f(x, y, z)) pts.push([x, z]); }
      const cv = $('h-cloud'), g = cv.getContext('2d'), W = cv.width; g.clearRect(0, 0, W, W);
      g.fillStyle = C.cv('--surface2'); g.fillRect(0, 0, W, W);
      g.strokeStyle = C.cv('--line'); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, W); g.moveTo(0, W / 2); g.lineTo(W, W / 2); g.stroke();
      g.fillStyle = C.cv('--c1'); g.globalAlpha = 0.45;
      pts.forEach(p => { g.beginPath(); g.arc(W / 2 + p[0] / B * W / 2, W / 2 - p[1] / B * W / 2, 1.6, 0, 6.3); g.fill(); });
      g.globalAlpha = 1; g.fillStyle = C.cv('--ink'); g.font = '12px sans-serif'; g.fillText(`± ${B} a₀`, W - 62, W - 8); g.fillText('z', W / 2 + 6, 14);
      const info = { '1s': 'Simetri bola, tanpa node.', '2s': 'Satu node radial (bola kosong di r = 2 a₀).', '2p': 'Dua cuping dengan bidang node (z = 0).', '3d': '3d(z²): dua cuping + cincin pada bidang xy.' };
      $('h-info').textContent = 'Titik = ' + pts.length + ' sampel Monte-Carlo dari |ψ|². ' + info[k];
    }
    function hChart() {
      const k = $('h-orb').value, cols = { '1s': 'var(--c1)', '2s': 'var(--c2)', '2p': 'var(--c3)', '3d': 'var(--c4)' };
      cH.set({ title: 'Peluang radial P(r) = r²R²(r)', xlabel: 'r (a₀)', ylabel: 'P(r)', xlim: [0, 25], legend: true,
        series: Object.keys(R).map(n => ({ name: n, x: rg, y: rg.map(r => r * r * R[n](r) ** 2), color: cols[n], width: n === k ? 3.4 : 1.4, dash: n === k ? '' : '4 3' })) });
    }
    on('h-orb', 'change', () => { hChart(); drawCloud(); }); on('h-resample', 'click', drawCloud);
    hChart(); drawCloud(); C.redraws.push(drawCloud);
  }

  /* ---------- section 2 ---------- */
  const lg10 = x => Math.log(x) / Math.LN10;
  function humanTime(s) {
    if (!isFinite(s)) return '∞'; if (s < 1) return (s * 1000).toFixed(s < 0.01 ? 2 : 0) + ' ms';
    if (s < 60) return s.toFixed(1) + ' detik'; if (s < 3600) return (s / 60).toFixed(1) + ' menit'; if (s < 86400) return (s / 3600).toFixed(1) + ' jam';
    if (s < 3.15e7) return (s / 86400).toFixed(1) + ' hari'; if (s < 3.15e9) return (s / 3.15e7).toFixed(1) + ' tahun';
    return '10^' + lg10(s / 3.15e7).toFixed(1) + ' tahun';
  }
  C.humanTime = humanTime;
  function sec2() {
    // 2a coupling graph
    function cg() {
      const N = +$('cg-n').value; $('cg-nv').textContent = N;
      const cv = $('cg-canvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 28; const P = [];
      for (let i = 0; i < N; i++) { const a = i / N * 2 * Math.PI - Math.PI / 2; P.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
      g.strokeStyle = C.cv('--c1'); g.globalAlpha = Math.max(0.08, Math.min(0.6, 14 / (N * N / 2 + 1)));
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { g.beginPath(); g.moveTo(...P[i]); g.lineTo(...P[j]); g.stroke(); }
      g.globalAlpha = 1; P.forEach((p, i) => { g.fillStyle = C.cv('--c2'); g.beginPath(); g.arc(p[0], p[1], 7, 0, 6.3); g.fill(); g.fillStyle = C.cv('--bg'); g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; if (N <= 16) g.fillText('e', p[0], p[1] + 3); });
      const E = N * (N - 1) / 2;
      $('cg-info').innerHTML = `<b>${N}</b> elektron → <b>${E}</b> pasang interaksi 1/r<sub>ij</sub>.<br>Variabel Ψ: 3N = <b>${3 * N}</b>.<br><br>Menambah satu elektron menambah <b>${N}</b> interaksi baru. Suku inilah yang membuat Ψ tidak dapat difaktorkan menjadi ψ(r₁)ψ(r₂)…ψ(r<sub>N</sub>) — dan tanpa pemisahan variabel, persamaannya tidak bisa diselesaikan eksak.`;
    }
    on('cg-n', 'input', cg); cg(); C.redraws.push(cg);

    // 2b wall
    const cw = QC.chart('wall-chart', { series: [{ x: [0], y: [0] }] });
    function wall() {
      const g = +$('wall-g').value, lg = lg10(g), Ns = Array.from({ length: 111 }, (_, i) => i);
      cw.set({ title: `log₁₀(jumlah bilangan untuk menyimpan Ψ), grid ${g}³ᴺ`, xlabel: 'Jumlah elektron N', ylabel: 'log₁₀(bilangan)', xlim: [0, 110],
        series: [{ x: Ns, y: Ns.map(n => 3 * n * lg), color: 'var(--c1)', width: 3 }],
        hlines: [{ y: 80, label: '≈ 10⁸⁰ atom di alam semesta teramati', color: 'var(--danger)' }],
        vlines: [{ x: 10, label: 'H₂O', color: 'var(--c3)' }, { x: 42, label: 'benzena', color: 'var(--c3)' }, { x: 102, label: 'kafein', color: 'var(--c3)' }] });
      const Nc = 80 / (3 * lg);
      const bytes = n => (3 * n * lg + lg10(8));
      $('wall-info').innerHTML = `<div class="callout bad">Dengan hanya <b>${g}</b> titik per sumbu, jumlah bilangan melampaui jumlah atom di alam semesta pada <b>N ≈ ${Nc.toFixed(1)} elektron</b> — jauh lebih kecil dari satu molekul obat.</div>
      <dl class="kv"><dt>H₂O (N=10)</dt><dd>10<sup>${(30 * lg).toFixed(0)}</sup> bilangan ≈ 10<sup>${bytes(10).toFixed(0)}</sup> byte</dd><dt>Benzena (N=42)</dt><dd>10<sup>${(126 * lg).toFixed(0)}</sup> bilangan</dd><dt>Kafein (N=102)</dt><dd>10<sup>${(306 * lg).toFixed(0)}</sup> bilangan</dd></dl>
      <p class="small muted">Dengan 8 byte per bilangan (double). Dengan ρ(r) saja: ${g}³ = ${g ** 3} bilangan — selalu kecil, berapa pun N.</p>`;
    }
    on('wall-g', 'change', wall); wall();

    // 2c scaling
    const M = [['HF', 4, 'var(--c1)'], ['DFT (hibrid)', 4, 'var(--c3)'], ['DFT (GGA + DF)', 3, 'var(--c6)'], ['MP2', 5, 'var(--c5)'], ['CCSD', 6, 'var(--c2)'], ['CCSD(T)', 7, 'var(--c4)']];
    const cs = QC.chart('sc-chart', { series: [{ x: [0], y: [0] }] });
    function sc() {
      const t0 = Math.max(1e-6, +$('sc-t0').value || 1), ns = Array.from({ length: 41 }, (_, i) => 1 + i * 0.05);
      cs.set({ title: 'Waktu perhitungan ∝ nᵖ (basis function)', xlabel: 'n basis function (skala log)', ylabel: 'waktu', xlim: [1, 3], xticks: [1, 1.4771, 2, 2.4771, 3], xfmt: v => Math.round(10 ** v), yfmt: v => humanTime(v).replace('10^', '10^'), logy: true, ylim: [1e-2, 1e14],
        series: M.map(m => ({ name: `${m[0]}  (n^${m[1]})`, x: ns, y: ns.map(l => t0 * Math.pow(10 ** (l - 2), m[1])), color: m[2] })) });
      const n = Math.max(10, +$('sc-n').value || 400), Ne = Math.max(2, +$('sc-ne').value || 100);
      let h = '<table class="t"><thead><tr><th>Metode</th><th>Skala</th><th class="num">Perkiraan waktu</th></tr></thead><tbody>';
      M.forEach(m => h += `<tr><td>${m[0]}</td><td>n<sup>${m[1]}</sup></td><td class="num">${humanTime(t0 * Math.pow(n / 100, m[1]))}</td></tr>`);
      const r = Ne / 2; let lc = NaN;
      if (r <= n) { lc = 0; for (let k = 1; k <= r; k++) lc += lg10((n - r + k) / k); }
      h += `<tr><td>FCI (eksak dalam basis)</td><td>determinan</td><td class="num">${isFinite(lc) ? '10<sup>' + (2 * lc).toFixed(1) + '</sup> determinan' : '—'}</td></tr></tbody></table>
      <p class="small muted">Waktu relatif terhadap t₀ yang Anda isi (mesin/program berbeda → konstanta berbeda; yang penting adalah <i>pangkatnya</i>). FCI: jumlah determinan = [C(n, N<sub>e</sub>/2)]².</p>`;
      $('sc-table').innerHTML = h;
    }
    ['sc-t0', 'sc-n', 'sc-ne'].forEach(i => on(i, 'input', sc)); sc();

    // 2d Pauli
    function pa() {
      const mode = $('pa-mode').value, cv = $('pa-canvas'), W = cv.width, g = cv.getContext('2d');
      const a = x => Math.SQRT2 * Math.sin(Math.PI * x), b = x => Math.SQRT2 * Math.sin(2 * Math.PI * x);
      const F = (x1, x2) => mode === 'anti' ? (a(x1) * b(x2) - b(x1) * a(x2)) / Math.SQRT2 : mode === 'sym' ? (a(x1) * b(x2) + b(x1) * a(x2)) / Math.SQRT2 : a(x1) * b(x2);
      const img = g.createImageData(W, W), pos = [59, 91, 219], neg = [232, 89, 12];
      const dark = C.cv('--bg').startsWith('#0') || C.cv('--bg').startsWith('#1');
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
        const v = F(i / (W - 1), 1 - j / (W - 1)), t = Math.min(1, Math.abs(v) / 1.6), c = v >= 0 ? pos : neg, bgc = dark ? 20 : 250;
        const k = (j * W + i) * 4; img.data[k] = bgc + (c[0] - bgc) * t; img.data[k + 1] = bgc + (c[1] - bgc) * t; img.data[k + 2] = bgc + (c[2] - bgc) * t; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0); g.setLineDash([6, 4]); g.strokeStyle = C.cv('--ink'); g.beginPath(); g.moveTo(0, W); g.lineTo(W, 0); g.stroke(); g.setLineDash([]);
      g.fillStyle = C.cv('--ink'); g.font = '12px sans-serif'; g.fillText('x₁ →', W - 40, W - 6); g.fillText('x₂ ↑', 6, 14);
      const v1 = F(0.3, 0.7), v2 = F(0.7, 0.3);
      const txt = { anti: 'Antisimetris: Ψ(x₂,x₁) = −Ψ(x₁,x₂). Pada garis putus-putus (x₁ = x₂) Ψ = 0 → dua elektron sepin tidak pernah di tempat yang sama: <b>lubang Fermi (exchange hole)</b>.', sym: 'Simetris: Ψ(x₂,x₁) = +Ψ(x₁,x₂). Elektron justru <i>cenderung</i> berkumpul di diagonal — tidak sesuai kenyataan untuk fermion.', prod: 'Hasil kali sederhana: tidak ada hubungan antara Ψ(x₁,x₂) dan Ψ(x₂,x₁) — melanggar prinsip ketakbedaan partikel.' }[mode];
      $('pa-info').innerHTML = `${txt}<br><br>Nilai: Ψ(0.3, 0.7) = <b>${v1.toFixed(3)}</b>, Ψ(0.7, 0.3) = <b>${v2.toFixed(3)}</b>.<br><span class="small muted">Biru = positif, oranye = negatif. Dua elektron dalam kotak 1D pada orbital n=1 dan n=2.</span><br><br>Menjaga antisimetri untuk N elektron berarti menjumlahkan N! suku (determinan Slater) — satu lagi alasan kerumitan.`;
    }
    on('pa-mode', 'change', pa); pa(); C.redraws.push(pa);
  }

  /* ---------- section 3 ---------- */
  function sec3() {
    const B = 1.8897;
    const SH = { H: [[1, 1.0]], C: [[2, 5.7], [4, 1.6]], O: [[2, 7.7], [6, 2.2]] }, Z = { H: 1, C: 6, O: 8 };
    const ring = (r, el, ph) => Array.from({ length: 6 }, (_, i) => [el, r * Math.cos(i * Math.PI / 3 + ph), r * Math.sin(i * Math.PI / 3 + ph)]);
    const PRE = { h2: { half: 4, atoms: [['H', -0.37, 0], ['H', 0.37, 0]] }, h2o: { half: 5, atoms: [['O', 0, 0.12], ['H', 0.757, -0.47], ['H', -0.757, -0.47]] }, benz: { half: 8, atoms: [...ring(1.39, 'C', 0), ...ring(2.47, 'H', 0)] } };
    let atoms = [], half = 5, drag = -1;
    const cv = $('den-canvas'), W = cv.width, H = cv.height, off = document.createElement('canvas'); off.width = 260; off.height = 220;
    const rho = (x, y) => { let s = 0; for (const a of atoms) { const r = Math.hypot(x - a.x, y - a.y); for (const [n, z] of SH[a.el]) s += n * z * z * z / Math.PI * Math.exp(-2 * z * r); } return s; };
    const pal = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
    function load() {
      const p = PRE[$('den-preset').value], s = +$('den-scale').value; half = p.half;
      atoms = p.atoms.map(a => ({ el: a[0], bx: a[1] * B, by: a[2] * B, x: a[1] * B * s, y: a[2] * B * s }));
      const sel = $('den-atom'); sel.innerHTML = ''; atoms.forEach((a, i) => sel.append(QC.el('option', { value: i, text: `${a.el}${i + 1}` }))); draw();
    }
    function rescale() { const s = +$('den-scale').value; $('den-sv').textContent = s.toFixed(2); atoms.forEach(a => { a.x = a.bx * s; a.y = a.by * s; }); draw(); }
    function draw() {
      const g0 = off.getContext('2d'), im = g0.createImageData(260, 220), sx = 2 * half * (W / H) / 260 * 1, sy = 2 * half / 220;
      const hx = half * W / H;
      for (let j = 0; j < 220; j++) for (let i = 0; i < 260; i++) {
        const x = -hx + (i + .5) / 260 * 2 * hx, y = half - (j + .5) / 220 * 2 * half, lv = lg10(rho(x, y) + 1e-12);
        const t = Math.max(0, Math.min(9, Math.floor((lv + 4) * 1.4))), c = pal[t], k = (j * 260 + i) * 4;
        im.data[k] = c[0]; im.data[k + 1] = c[1]; im.data[k + 2] = c[2]; im.data[k + 3] = 255;
      }
      g0.putImageData(im, 0, 0); const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(off, 0, 0, W, H);
      const X = x => W / 2 + x / hx * W / 2, Y = y => H / 2 - y / half * H / 2;
      atoms.forEach((a, i) => { g.beginPath(); g.arc(X(a.x), Y(a.y), a.el === 'H' ? 9 : 12, 0, 6.3); g.fillStyle = QC.ELEMENTS[a.el].color; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#000'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText(a.el, X(a.x), Y(a.y) + 3.5); });
      // bonds info
      let msg = ''; if (atoms.length === 2) msg = `Jarak H–H = ${(Math.hypot(atoms[0].x - atoms[1].x, atoms[0].y - atoms[1].y) / B).toFixed(3)} Å. `;
      if (atoms.length === 3) msg = `O–H = ${(Math.hypot(atoms[0].x - atoms[1].x, atoms[0].y - atoms[1].y) / B).toFixed(3)} Å. `;
      let mid = rho((atoms[0].x + (atoms[1] || atoms[0]).x) / 2, (atoms[0].y + (atoms[1] || atoms[0]).y) / 2);
      $('den-info').innerHTML = msg + `ρ di titik tengah ikatan pertama = ${mid.toFixed(4)} e/bohr³. Skala warna: log₁₀ρ dari −4 (ungu) hingga +1 (kuning). Seret atom untuk memindahkannya.`;
      cusp();
    }
    const cc = QC.chart('cusp-chart', { series: [{ x: [0], y: [0] }] });
    function cusp() {
      const a = atoms[+$('den-atom').value || 0]; if (!a) return;
      const rs = Array.from({ length: 61 }, (_, i) => i * 0.02), f = r => Math.log(rho(a.x + r, a.y)), f0 = f(0), Zn = Z[a.el];
      const slope = (f(0.03) - f0) / 0.03;
      cc.set({ title: `ln ρ sepanjang sumbu +x dari inti ${a.el}`, xlabel: 'r (bohr)', ylabel: 'ln ρ − ln ρ(0)', series: [{ name: 'ρ model', x: rs, y: rs.map(r => f(r) - f0), color: 'var(--c1)', width: 3 }, { name: `garis cusp eksak: kemiringan −2Z = ${-2 * Zn}`, x: rs, y: rs.map(r => -2 * Zn * r), color: 'var(--c2)', dash: '5 4' }], ylim: [Math.min(-2 * Zn * 1.2, f(1.2) - f0) - 1, 1] });
    }
    const mpos = e => { const r = cv.getBoundingClientRect(), hx = half * W / H, t = e.touches ? e.touches[0] : e; return [((t.clientX - r.left) / r.width * 2 - 1) * hx, (1 - (t.clientY - r.top) / r.height * 2) * half]; };
    cv.addEventListener('pointerdown', e => { const [x, y] = mpos(e); let best = 1e9; atoms.forEach((a, i) => { const d = Math.hypot(a.x - x, a.y - y); if (d < best) { best = d; drag = i; } }); if (best > 1.2) drag = -1; else cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (drag < 0) return; const [x, y] = mpos(e), s = +$('den-scale').value; atoms[drag].x = x; atoms[drag].y = y; atoms[drag].bx = x / s; atoms[drag].by = y / s; draw(); });
    cv.addEventListener('pointerup', () => drag = -1);
    on('den-preset', 'change', load); on('den-scale', 'input', rescale); on('den-atom', 'change', cusp); load();
  }

  C.sec0 = sec0; C.sec1 = sec1; C.sec2 = sec2; C.sec3 = sec3; C.lg10 = lg10;
})();
