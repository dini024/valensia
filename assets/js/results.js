/* results.js — UI Results Analyzer (ORCA / Gaussian). Memakai QC.parse, QC.analysis, QC.orbitals, QPlot. */
(function () {
  'use strict';
  const A = QC.analysis, P = QC.parse, O = QC.orbitals;
  const $ = id => document.getElementById(id);
  const esc = QC.escapeHtml;
  const f = (x, d = 4) => (x == null || !isFinite(x)) ? '—' : Number(x).toFixed(d);
  const EH = A.HARTREE_EV;

  const S = { files: [], outs: [], orbFiles: [], R: null, orbModel: null, viewers: {}, tables: {} };

  /* ------------------------------ memuat berkas ------------------------------ */
  function classify(name, text) {
    const n = name.toLowerCase();
    if (/\.(fchk|fch|fck)$/.test(n) || /Number of basis functions\s+I/.test(text.slice(0, 4000))) return 'fchk';
    if (/\.molden(\.input)?$/.test(n) || /^\s*\[Molden Format\]/im.test(text.slice(0, 2000))) return 'molden';
    if (/\.cube?$/.test(n)) return 'cube';
    return 'out';
  }
  async function addFiles(list) {
    for (const file of list) {
      if (/\.(chk|gbw)$/i.test(file.name)) { QC.toast(file.name + ': berkas biner. Konversi dulu (formchk untuk .chk, orca_2mkl -molden untuk .gbw).', 6000); continue; }
      const text = await QC.readFile(file);
      addText(file.name, text);
    }
    refresh();
  }
  function addText(name, text) {
    const kind = classify(name, text);
    S.files = S.files.filter(x => x.name !== name);
    S.files.push({ name, text, kind, size: text.length });
  }
  async function refresh() {
    S.outs = []; S.orbFiles = [];
    for (const fl of S.files) {
      if (fl.kind === 'out') { const r = P.parse(fl.text, fl.name); fl.parsed = r; fl.program = r.program; S.outs.push(r); } else S.orbFiles.push(fl);
    }
    renderFileList();
    S.R = S.outs.length ? merge(S.outs) : null; S.orbModel = null;
    if (S.orbFiles.length) {
      try { S.orbModel = O.load(S.orbFiles.map(x => ({ name: x.name, text: x.text }))); }
      catch (e) { QC.toast('Gagal membaca berkas orbital: ' + e.message, 6000); }
    }
    if (!S.R && S.orbModel && S.orbModel.atoms && S.orbModel.atoms.length) S.R = fromOrbitalsOnly(S.orbModel);
    if (!S.R) { $('results').classList.add('hidden'); if (S.files.length) QC.toast('Tidak ada keluaran ORCA/Gaussian yang dikenali.', 5000); return; }
    $('results').classList.remove('hidden');
    renderAll();
  }
  function fromOrbitalsOnly(m) {
    return { program: m.kind, filename: m.name, terminatedNormally: true, jobTypes: [], geometry: { atoms: m.atoms, source: 'orbital file', converged: null }, trajectory: [], scf: {}, opt: { cycles: [] }, freq: null, orbitals: null, tddft: null, dipole: null, charges: null, timing: {}, warnings: ['Hanya berkas orbital yang dimuat; unggah keluaran .out/.log untuk analisis lengkap.'], nAtoms: m.atoms.length, formula: P.formulaOf(m.atoms), files: [m.name] };
  }
  /** Gabungkan beberapa keluaran (mis. opt+freq dan TDDFT terpisah). */
  function merge(outs) {
    const M = JSON.parse(JSON.stringify(outs[0])); M.files = outs.map(o => o.filename); M.sources = {};
    const best = outs.find(o => o.geometry.source === 'optimized') || outs.find(o => o.geometry.atoms.length) || outs[0];
    M.geometry = best.geometry; M.trajectory = best.trajectory; M.opt = best.opt; M.sources.geometry = best.filename;
    const fq = outs.find(o => o.freq && o.freq.freqs.length); if (fq) { M.freq = fq.freq; M.sources.freq = fq.filename; }
    const td = outs.filter(o => o.tddft && o.tddft.states.length).sort((a, b) => b.tddft.states.length - a.tddft.states.length)[0]; if (td) { M.tddft = td.tddft; M.sources.tddft = td.filename; }
    const ob = outs.find(o => o.orbitals && o.orbitals.alpha && o.orbitals.alpha.length); if (ob) { M.orbitals = ob.orbitals; M.sources.orbitals = ob.filename; }
    const dp = outs.find(o => o.dipole); if (dp) M.dipole = dp.dipole; const ch = outs.find(o => o.charges); if (ch) M.charges = ch.charges;
    M.terminatedNormally = outs.every(o => o.terminatedNormally);
    M.jobTypes = [...new Set(outs.flatMap(o => o.jobTypes))];
    M.warnings = [...new Set(outs.flatMap(o => o.warnings))];
    M.timing = { totalSec: outs.reduce((s, o) => s + (o.timing && o.timing.totalSec || 0), 0) || null };
    const es = outs.filter(o => o.energyEh != null); if (es.length) { M.energyEh = es[es.length - 1].energyEh; M.scf = es[es.length - 1].scf; }
    ['method', 'functional', 'basis', 'dispersion', 'solvent', 'charge', 'mult'].forEach(k => { if (M[k] == null) { const o = outs.find(x => x[k] != null); if (o) M[k] = o[k]; } });
    M.nAtoms = M.geometry.atoms.length; M.formula = P.formulaOf(M.geometry.atoms);
    return M;
  }
  function renderFileList() {
    const ul = $('file-list'); ul.innerHTML = '';
    if (!S.files.length) { ul.innerHTML = '<li class="muted">Belum ada berkas.</li>'; return; }
    S.files.forEach(fl => ul.append(QC.el('li', {}, QC.el('span', { class: 'badge' }, fl.kind === 'out' ? (fl.parsed && fl.parsed.program || 'keluaran') : fl.kind), QC.el('span', { class: 'grow' }, fl.name), QC.el('span', { class: 'muted small' }, (fl.size / 1024).toFixed(0) + ' kB'),
      QC.el('button', { class: 'btn sm btn-ghost', type: 'button', title: 'Hapus', onclick: () => { S.files = S.files.filter(x => x !== fl); refresh(); } }, '✕'))));
  }

  /* ------------------------------ util tampilan ------------------------------ */
  function table(cols, rows, opts) {
    opts = opts || {};
    const t = QC.el('table', { class: 'data' });
    t.innerHTML = '<thead><tr>' + cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('') + '</tr></thead>';
    const tb = QC.el('tbody'); rows.forEach((r, ri) => {
      const tr = QC.el('tr'); if (opts.rowClass) { const c = opts.rowClass(r, ri); if (c) tr.className = c; }
      tr.innerHTML = cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.fmt ? c.fmt(r, ri) : esc(String(r[c.k]))}</td>`).join('');
      if (opts.onRow) { tr.classList.add('clk'); tr.onclick = () => opts.onRow(r, ri, tr); }
      tb.append(tr);
    });
    t.append(tb); return t;
  }
  function stat(k, v, cls) { return `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }
  function xyzOf(atoms, title) { return atoms.length + '\n' + (title || '') + '\n' + atoms.map(a => `${a.el} ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`).join('\n') + '\n'; }
  const lblOrb = (i, R) => R.orbitals ? (A.orbLabel(i, R.orbitals.homo) || '#' + i) : '#' + i;
  const chart = (id, opts) => { const host = $(id); host.innerHTML = ''; return QPlot.chart(host, opts); };

  /* ------------------------------ render semua ------------------------------ */
  function renderAll() {
    const R = S.R;
    S.bonds = A.bonds(R.geometry.atoms, +$('p-tol').value || 1.15);
    renderSummary(); renderGeom(); renderFreq(); renderProps(); renderOrb(); renderEchem(); renderTD(); renderDSSC(); renderExport();
  }

  /* ---- Ringkasan ---- */
  function renderSummary() {
    const R = S.R, o = R.orbitals, nImag = R.freq ? R.freq.nImag : null, td = R.tddft;
    const bright = td && td.states.filter(s => s.f > 0.01).sort((a, b) => b.f - a.f)[0];
    let h = '<div class="statgrid">' +
      stat('Program', esc((R.program || '?') + (R.version ? ' ' + R.version : ''))) +
      stat('Rumus', esc(R.formula || '—')) + stat('Atom', R.nAtoms) +
      stat('Muatan / mult.', (R.charge ?? '—') + ' / ' + (R.mult ?? '—')) +
      stat('Metode', esc([R.functional || R.method, R.dispersion].filter(Boolean).join('-') || '—')) +
      stat('Basis', esc(R.basis || '—')) + stat('Pelarut', esc(R.solvent || 'fase gas / tidak terdeteksi')) +
      stat('Pekerjaan', esc(R.jobTypes.join(' + ') || '—')) +
      stat('Energi akhir', R.energyEh != null ? f(R.energyEh, 6) + ' Eh<div class="small muted">' + f(R.energyEh * EH, 3) + ' eV</div>' : '—') +
      stat('Terminasi', R.terminatedNormally ? 'Normal' : 'TIDAK normal', R.terminatedNormally ? 'ok' : 'bad') +
      (R.opt && R.opt.converged != null ? stat('Optimasi', R.opt.converged ? 'Konvergen (' + R.opt.cycles.length + ' siklus)' : 'Belum konvergen', R.opt.converged ? 'ok' : 'bad') : '') +
      (nImag != null ? stat('Frekuensi imajiner', nImag === 0 ? '0 — minimum' : nImag + ' — BUKAN minimum', nImag === 0 ? 'ok' : 'bad') : '') +
      (o && o.gapEv != null ? stat('HOMO / LUMO / gap', `${f(o.homoEv, 2)} / ${f(o.lumoEv, 2)} / <b>${f(o.gapEv, 2)} eV</b>`) : '') +
      (bright ? stat('λ<sub>maks</sub> (f>0.01 terkuat)', `${f(bright.wlNm, 1)} nm<div class="small muted">f = ${f(bright.f, 3)}, ${f(bright.eEv, 3)} eV</div>`) : '') +
      (R.dipole ? stat('Momen dipol', f(R.dipole.totalDebye, 2) + ' D') : '') +
      (R.timing && R.timing.totalSec ? stat('Waktu komputasi', fmtTime(R.timing.totalSec)) : '') + '</div>';
    if (R.warnings.length) h += '<div class="callout warn"><b>Peringatan:</b><ul style="margin:.3em 0 0;padding-left:1.2em">' + R.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>';
    else h += '<div class="callout ok-par">Tidak ada peringatan dari parser.</div>';
    h += '<p class="muted small">Berkas dianalisis: ' + esc(R.files ? R.files.join(', ') : R.filename) + (R.sources && Object.keys(R.sources).length > 1 ? ' — data digabung dari beberapa berkas (' + Object.entries(R.sources).map(([k, v]) => k + ': ' + esc(v)).join('; ') + ').' : '') + '</p>';
    $('sum-body').innerHTML = h;
  }
  function fmtTime(s) { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ' j ' : '') + (m || h ? m + ' m ' : '') + Math.round(s % 60) + ' d'; }

  /* ---- Geometri ---- */
  let gFrame = -1, pick = [];
  async function ensureViewer(key, host) { if (!S.viewers[key]) S.viewers[key] = await QC.viewer(host); return S.viewers[key]; }
  async function renderGeom() {
    const R = S.R, atoms = R.geometry.atoms;
    const traj = R.trajectory && R.trajectory.length > 1 ? R.trajectory : null;
    $('g-traj').classList.toggle('hidden', !traj);
    if (traj) { const s = $('g-step'); s.max = traj.length - 1; s.value = traj.length - 1; gFrame = traj.length - 1; }
    else gFrame = -1;
    await drawGeom();
    // grafik energi optimasi + tabel konvergensi
    const cyc = R.opt && R.opt.cycles || [];
    if (cyc.length > 1) {
      const e0 = Math.min(...cyc.map(c => c.E));
      chart('g-opt-chart', { title: 'Energi relatif selama optimasi (kcal/mol)', xlabel: 'siklus', ylabel: 'ΔE (kcal/mol)', height: 260, series: [{ x: cyc.map(c => c.n), y: cyc.map(c => (c.E - e0) * 627.5095), type: 'line', label: 'ΔE' }, { x: cyc.map(c => c.n), y: cyc.map(c => (c.E - e0) * 627.5095), type: 'points' }], legend: false });
      $('g-conv').innerHTML = ''; $('g-conv').append(table([{ h: 'Siklus', k: 'n' }, { h: 'E (Eh)', num: 1, fmt: c => f(c.E, 8) }, { h: 'Max grad', num: 1, fmt: c => f(c.maxGrad, 6) }, { h: 'RMS grad', num: 1, fmt: c => f(c.rmsGrad, 6) }, { h: 'Max step', num: 1, fmt: c => f(c.maxStep, 6) }], cyc));
    } else { $('g-opt-chart').innerHTML = '<div class="loading">Tidak ada data siklus optimasi (job single point).</div>'; $('g-conv').innerHTML = ''; }
  }
  async function drawGeom() {
    const R = S.R, v = await ensureViewer('geom', $('g-viewer'));
    const atoms = gFrame >= 0 ? R.trajectory[gFrame].atoms : R.geometry.atoms;
    v.removeAllModels(); v.removeAllLabels(); v.addModel(xyzOf(atoms), 'xyz');
    const sty = QC.STYLES[$('g-style').value] || QC.STYLES.ballstick, showH = $('g-h').checked;
    v.setStyle({}, sty); if (!showH) v.setStyle({ elem: 'H' }, {});
    if ($('g-labels').checked) atoms.forEach((a, i) => { if (a.el === 'H' && !showH) return; v.addLabel(a.el + (i + 1), { position: a, fontSize: 11, backgroundOpacity: 0.35, fontColor: 'white', backgroundColor: '#0f1d2e', showBackground: true }); });
    v.setClickable({}, true, atom => onPick(atom.index));
    if (gFrame < 0 || !S._zoomed) { v.zoomTo(); S._zoomed = true; }
    if (gFrame >= 0) $('g-step-lbl').textContent = (gFrame + 1) + ' / ' + R.trajectory.length + '  (E = ' + f(R.trajectory[gFrame].E, 6) + ' Eh)';
    v.render();
  }
  function onPick(i) {
    const at = (gFrame >= 0 ? S.R.trajectory[gFrame].atoms : S.R.geometry.atoms);
    if (pick.length >= 4) pick = []; pick.push(i);
    const L = pick.map(k => at[k].el + (k + 1)), P_ = pick.map(k => at[k]);
    let t = 'Dipilih: ' + L.join(' – ');
    if (pick.length >= 2) t += ' · jarak ' + f(A.dist(P_[0], P_[1]), 4) + ' Å';
    if (pick.length >= 3) t += ' · sudut ' + f(A.angle(P_[0], P_[1], P_[2]), 2) + '°';
    if (pick.length === 4) t += ' · dihedral ' + f(A.dihedral(P_[0], P_[1], P_[2], P_[3]), 2) + '°';
    $('g-pick').textContent = t + (pick.length === 4 ? '  (klik lagi untuk memulai ulang)' : '');
  }
  ['g-style', 'g-labels', 'g-h'].forEach(id => $(id).addEventListener('change', () => S.R && drawGeom()));
  $('g-step').addEventListener('input', e => { gFrame = +e.target.value; drawGeom(); });
  $('g-png').onclick = () => { const v = S.viewers.geom; if (v) { const a = document.createElement('a'); a.href = v.pngURI(); a.download = 'geometri.png'; a.click(); } };
  $('g-xyz').onclick = () => S.R && QC.download((S.R.filename || 'geometri').replace(/\.[^.]*$/, '') + '_final.xyz', xyzOf(S.R.geometry.atoms, S.R.formula + ' ' + S.R.geometry.source));

  /* ---- Frekuensi ---- */
  let animTimer = null;
  function renderFreq() {
    const R = S.R, F = R.freq;
    if (!F || !F.freqs.length) {
      $('f-banner').innerHTML = '<div class="callout warn">Tidak ada data frekuensi. Jalankan job <code>Freq</code> (ORCA) / <code>freq</code> (Gaussian) pada geometri teroptimasi untuk memeriksa imaginary frequency.</div>';
      ['f-chart', 'f-thermo', 'f-table'].forEach(i => $(i).innerHTML = ''); return;
    }
    const im = F.freqs.filter(x => x < 0);
    $('f-banner').innerHTML = im.length === 0
      ? `<div class="bigflag ok">✔ Tidak ada frekuensi imajiner — geometri adalah minimum (${F.freqs.filter(x => x > 20).length} mode vibrasi, terendah ${f(Math.min(...F.freqs.filter(x => x > 20)), 1)} cm⁻¹).</div>`
      : `<div class="bigflag bad">✘ ${im.length} frekuensi imajiner: ${im.map(x => f(x, 1)).join(', ')} cm⁻¹ — struktur adalah titik pelana (TS) atau belum minimum. Kecil (< ~50 cm⁻¹) dapat berupa noise grid; periksa dengan animasi mode.</div>`;
    drawIR();
    const rows = F.freqs.map((fr, i) => ({ i, fr, ir: F.irInt && F.irInt[i] })).filter(r => Math.abs(r.fr) > 1e-6);
    const t = table([{ h: '#', k: 'i', fmt: r => r.i + 1 }, { h: 'ν (cm⁻¹)', num: 1, fmt: r => f(r.fr, 2) }, { h: 'IR (km/mol)', num: 1, fmt: r => f(r.ir, 2) }, { h: '', fmt: r => r.fr < 0 ? 'imajiner' : '' }], rows, { rowClass: r => r.fr < 0 ? 'imag' : '', onRow: (r, ri, tr) => { document.querySelectorAll('#f-table tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); animate(r.i); } });
    $('f-table').innerHTML = ''; $('f-table').append(t);
    const th = F.thermo; let h = '';
    if (th) {
      const rowsT = [['E elektronik', th.electronicEh], ['ZPE', th.zpeEh], ['E total (termal)', th.EthEh], ['Entalpi H', th.HEh], ['Energi bebas Gibbs G', th.GEh]].filter(r => r[1] != null);
      h = '<h4 style="margin-bottom:4px">Termokimia' + (th.T_K || th.T ? ' (' + f(th.T_K || th.T, 2) + ' K)' : '') + '</h4><table class="data"><thead><tr><th></th><th class="num">Eh</th><th class="num">kcal/mol</th></tr></thead><tbody>' + rowsT.map(r => `<tr><td>${r[0]}</td><td class="num">${f(r[1], 6)}</td><td class="num">${f(r[1] * 627.5095, 2)}</td></tr>`).join('') + '</tbody></table>';
    }
    $('f-thermo').innerHTML = h;
  }
  function drawIR() {
    const F = S.R.freq; if (!F) return;
    const sc = +$('f-scale').value || 1, fw = +$('f-fwhm').value || 20;
    const sp = A.irSpectrum(F.freqs, F.irInt || [], { fwhm: fw, scale: sc, min: 0, max: Math.max(...F.freqs.map(x => x * sc), 1000) + 200 });
    const real = F.freqs.map((x, i) => ({ x: x * sc, y: (F.irInt || [])[i] || 0 })).filter(p => p.x > 20);
    chart('f-chart', { title: 'Spektrum IR (Lorentz)', xlabel: 'bilangan gelombang (cm⁻¹)', ylabel: 'intensitas (km/mol)', height: 270, reverseX: true, legend: false, series: [{ x: sp.x, y: sp.y, type: 'area', label: 'IR' }, { x: real.map(p => p.x), y: real.map(p => p.y), type: 'stick', color: 'var(--c3)' }] });
  }
  $('f-scale').oninput = $('f-fwhm').oninput = () => S.R && drawIR();
  async function animate(i) {
    const R = S.R, m = R.freq.modes && R.freq.modes[i], v = await ensureViewer('freq', $('f-viewer'));
    stopAnim(); const at = R.geometry.atoms;
    if (!m || !m.disp || !m.disp.length) { $('f-mode-lbl').textContent = 'Vektor perpindahan mode tidak tersedia di berkas ini.'; v.removeAllModels(); v.addModel(xyzOf(at), 'xyz'); v.setStyle({}, QC.STYLES.ballstick); v.zoomTo(); v.render(); return; }
    const amp = 1.2, nF = 24; let xyz = '';
    for (let k = 0; k < nF; k++) { const s = Math.sin(2 * Math.PI * k / nF) * amp; xyz += at.length + '\nframe\n' + at.map((a, j) => { const d = m.disp[j] || [0, 0, 0]; return `${a.el} ${(a.x + d[0] * s).toFixed(5)} ${(a.y + d[1] * s).toFixed(5)} ${(a.z + d[2] * s).toFixed(5)}`; }).join('\n') + '\n'; }
    v.removeAllModels(); v.addModelsAsFrames(xyz, 'xyz'); v.setStyle({}, QC.STYLES.ballstick); v.zoomTo(); v.animate({ loop: 'forward', reps: 0, interval: 50 }); v.render();
    $('f-mode-lbl').textContent = 'Mode ' + (i + 1) + ': ' + f(R.freq.freqs[i], 1) + ' cm⁻¹' + (R.freq.freqs[i] < 0 ? ' (imajiner)' : '');
  }
  function stopAnim() { const v = S.viewers.freq; if (v) { try { v.pauseAnimate(); } catch (e) { } } }
  $('f-stop').onclick = stopAnim;

  /* ---- Properti molekul ---- */
  function renderProps() {
    const R = S.R, at = R.geometry.atoms, tol = +$('p-tol').value || 1.15; S.bonds = A.bonds(at, tol);
    const heavy = $('p-heavy').checked, q = $('p-filter').value.trim().toLowerCase();
    const isH = i => at[i].el === 'H';
    const bt = A.bondTable(at, S.bonds), flt = r => !q || (r.a + ' ' + r.b + ' ' + (r.pair || '') + ' ' + (r.label || '')).toLowerCase().includes(q) || (r.label || '').replace(/–/g, '-').toLowerCase().includes(q);
    const bonds = bt.filter(flt);
    const at_ = A.angleTable(at, S.bonds).filter(r => !heavy || (!isH(r.i) && !isH(r.j) && !isH(r.k))).filter(flt);
    const dh_ = A.dihedralTable(at, S.bonds).filter(r => !heavy || [r.i, r.j, r.k, r.l].every(x => x == null || !isH(x))).filter(flt);
    S.tables = { bonds, angles: at_, dihs: dh_ };
    const cap = 600, lim = (arr) => arr.slice(0, cap);
    const mount = (id, cols, rows) => { const h = $(id); h.innerHTML = ''; h.append(table(cols, lim(rows))); if (rows.length > cap) h.append(QC.el('div', { class: 'small muted', style: 'padding:6px' }, `Menampilkan ${cap} dari ${rows.length} baris — gunakan filter atau unduh CSV.`)); };
    mount('p-bonds', [{ h: 'Ikatan', fmt: r => r.a + '–' + r.b }, { h: 'r (Å)', num: 1, fmt: r => f(r.r, 4) }], bonds);
    mount('p-angles', [{ h: 'Sudut', k: 'label' }, { h: 'θ (°)', num: 1, fmt: r => f(r.theta, 2) }], at_);
    mount('p-dihs', [{ h: 'Dihedral', k: 'label' }, { h: 'φ (°)', num: 1, fmt: r => f(r.phi != null ? r.phi : r.angle, 2) }], dh_);
    // statistik per jenis ikatan
    const by = {}; bt.forEach(b => (by[b.pair] = by[b.pair] || []).push(b.r));
    $('p-bond-stat').innerHTML = Object.entries(by).map(([k, v]) => { const s = A.stats(v); return `<b>${k}</b>: n=${s.n}, rata-rata ${f(s.mean, 3)} (${f(s.min, 3)}–${f(s.max, 3)}) Å`; }).join('<br>');
    // planaritas
    const pl = A.planarity(at, S.bonds, { manual: S.manualPlane });
    let h = '<div class="card" style="margin-bottom:12px;padding:12px"><h4 style="margin:0 0 6px">Planaritas</h4>';
    if (pl.whole) h += `<p style="margin:.2em 0">Seluruh molekul (${pl.whole.scope}, n=${pl.whole.n}): RMSD dari bidang terbaik = <b>${f(pl.whole.rmsd, 4)} Å</b>, deviasi maks = <b>${f(pl.whole.maxDev, 4)} Å</b> → ${pl.whole.rmsd < 0.05 ? '<span class="good">praktis planar</span>' : pl.whole.rmsd < 0.2 ? 'sedikit terpuntir' : 'non-planar'}.</p>`;
    if (pl.rings.length) h += '<table class="data" style="margin-top:6px"><thead><tr><th>Cincin</th><th class="num">Ukuran</th><th class="num">RMSD (Å)</th><th class="num">Maks (Å)</th></tr></thead><tbody>' + pl.rings.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${r.size}</td><td class="num">${f(r.rmsd, 4)}</td><td class="num">${f(r.maxDev, 4)}</td></tr>`).join('') + '</tbody></table>';
    h += `<div class="row" style="margin-top:8px"><label>Bidang kustom (nomor atom, mis. 1,2,3,4,5,6): <input id="p-manual" type="text" style="min-width:220px" value="${esc((S.manualPlane || []).map(x => x + 1).join(','))}"></label><button class="btn sm" id="p-manual-go" type="button">Hitung</button></div>`;
    if (pl.manual) h += `<p style="margin:.4em 0 0">Bidang kustom (${pl.manual.idx.length} atom): RMSD <b>${f(pl.manual.rmsd, 4)} Å</b>, maks <b>${f(pl.manual.maxDev, 4)} Å</b>.</p>`;
    $('p-plan').innerHTML = h + '</div>';
    const go = $('p-manual-go'); if (go) go.onclick = () => { S.manualPlane = $('p-manual').value.split(/[ ,;]+/).map(x => parseInt(x, 10) - 1).filter(x => x >= 0 && x < at.length); renderProps(); };
  }
  ['p-heavy', 'p-tol'].forEach(id => $(id).addEventListener('change', () => S.R && renderProps()));
  $('p-filter').addEventListener('input', () => S.R && renderProps());
  const csvBtn = (id, key, head, rowf, name) => $(id).onclick = () => { const t = S.tables[key] || []; QC.download(name + '.csv', A.csv(head, t.map(rowf)), 'text/csv'); };
  csvBtn('csv-bonds', 'bonds', ['atom_a', 'atom_b', 'r_A'], r => [r.a, r.b, r.r.toFixed(5)], 'ikatan');
  csvBtn('csv-angles', 'angles', ['sudut', 'derajat'], r => [r.label, r.theta.toFixed(3)], 'sudut');
  csvBtn('csv-dihs', 'dihs', ['dihedral', 'derajat'], r => [r.label, (r.phi != null ? r.phi : r.angle).toFixed(3)], 'dihedral');

  /* ---- Orbital & level energi ---- */
  function renderOrb() {
    const R = S.R, o = R.orbitals;
    if (!o) { $('o-levels').innerHTML = '<div class="loading">Energi orbital tidak ditemukan di keluaran. Gunakan <code>Print[P_MOs]</code> / <code>pop=full</code>.</div>'; $('o-gap').innerHTML = ''; $('o-table').innerHTML = ''; }
    else {
      const al = o.alpha, h = o.homo, lo = o.lumo, rng = [Math.max(0, h - 5), Math.min(al.length - 1, lo + 5)];
      const lv = []; for (let i = rng[0]; i <= rng[1]; i++) lv.push(al[i]);
      drawLevels(lv, o);
      $('o-gap').innerHTML = `<b>Gap HOMO–LUMO = ${f(o.gapEv, 3)} eV</b> (${f(o.gapEv * 23.0605, 1)} kcal/mol; ${f(1239.84 / o.gapEv, 0)} nm setara). <span class="muted">Gap KS bukan gap optik; bandingkan dengan energi eksitasi TDDFT.</span>`;
      const t = table([{ h: 'Orbital', fmt: r => lblOrb(r.i, R) }, { h: 'Indeks', num: 1, k: 'i' }, { h: 'Okupansi', num: 1, fmt: r => f(r.occ, 2) }, { h: 'E (Eh)', num: 1, fmt: r => f(r.eh, 5) }, { h: 'E (eV)', num: 1, fmt: r => f(r.ev, 3) }], lv.slice().reverse());
      $('o-table').innerHTML = ''; $('o-table').append(t);
    }
    const m = S.orbModel; $('o-need').classList.toggle('hidden', !!(m && m.mos && m.mos.length) || !!(m && m.kind === 'cube'));
    $('o-ctrl').classList.toggle('hidden', !(m && ((m.mos && m.mos.length) || m.kind === 'cube')));
    if (m && m.mos && m.mos.length) {
      const names = i => { const mo = m.mos[i]; const rel = (mo.spin !== 'beta') ? (A.orbLabel(mo.n != null ? mo.n : i, m.mos[m.homo] ? (m.mos[m.homo].n != null ? m.mos[m.homo].n : m.homo) : m.homo) || '') : 'β'; return `${rel} · #${mo.n != null ? mo.n : i} · ${f(mo.energyEh * EH, 2)} eV` + (mo.spin ? ' · ' + mo.spin : ''); };
      const idxs = []; const lo = Math.max(0, m.homo - 6), hi = Math.min(m.mos.length - 1, m.lumo + 6); for (let i = lo; i <= hi; i++) idxs.push(i);
      $('o-a').innerHTML = idxs.map(i => `<option value="${i}" ${i === m.homo ? 'selected' : ''}>${esc(names(i))}</option>`).join('');
      $('o-b').innerHTML = idxs.map(i => `<option value="${i}" ${i === m.lumo ? 'selected' : ''}>${esc(names(i))}</option>`).join('');
      renderOrbitals();
    }
  }
  function drawLevels(lv, o) {
    const W = 460, H = 360, m = { t: 14, b: 14, l: 62, r: 14 }, ev = lv.map(x => x.ev), lo = Math.min(...ev) - 0.5, hi = Math.max(...ev) + 0.5;
    const Y = e => m.t + (hi - e) / (hi - lo) * (H - m.t - m.b);
    const homo = lv.find(x => x.i === o.homo), lumo = lv.find(x => x.i === o.lumo);
    let s = `<svg class="lv" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Diagram level energi orbital"><text x="6" y="${m.t + 4}" style="font-weight:650">E (eV)</text>`;
    lv.forEach(x => { const y = Y(x.ev), occ = x.i <= o.homo, key = x.i === o.homo || x.i === o.lumo; s += `<line x1="${m.l + 60}" x2="${m.l + 230}" y1="${y}" y2="${y}" class="${occ ? 'occ' : 'vir'}" stroke-width="${key ? 4 : 2}"/>` + `<text x="${m.l + 236}" y="${y + 4}">${A.orbLabel(x.i, o.homo)} (${f(x.ev, 2)})</text>` + (occ ? `<text x="${m.l + 100}" y="${y - 3}" style="font-size:9px">${'↑↓'.slice(0, Math.min(2, Math.round(x.occ)))}</text>` : ''); });
    if (homo && lumo) { const x = m.l + 20; s += `<line x1="${x}" x2="${x}" y1="${Y(homo.ev)}" y2="${Y(lumo.ev)}" stroke="var(--c3)" stroke-width="1.5"/><polygon points="${x - 4},${Y(lumo.ev) + 7} ${x + 4},${Y(lumo.ev) + 7} ${x},${Y(lumo.ev)}" fill="var(--c3)"/><polygon points="${x - 4},${Y(homo.ev) - 7} ${x + 4},${Y(homo.ev) - 7} ${x},${Y(homo.ev)}" fill="var(--c3)"/><text x="${x - 14}" y="${(Y(homo.ev) + Y(lumo.ev)) / 2}" transform="rotate(-90 ${x - 14} ${(Y(homo.ev) + Y(lumo.ev)) / 2})" text-anchor="middle" style="font-weight:700">gap ${f(o.gapEv, 2)} eV</text>`; }
    $('o-levels').innerHTML = s + '</svg>';
  }
  async function renderOrbitals() {
    const m = S.orbModel; if (!m) return;
    const iso = +$('o-iso').value, res = +$('o-res').value, ia = +$('o-a').value, ib = +$('o-b').value;
    $('o-iso-lbl').textContent = iso.toFixed(3);
    const draw = async (key, host, idx, tl) => {
      const v = await ensureViewer(key, host); v.removeAllModels(); v.removeAllShapes(); v.addModel(xyzOf(m.atoms), 'xyz'); v.setStyle({}, QC.STYLES.ballstick);
      let cube;
      if (m.kind === 'cube') cube = m.cubeText; else { const mo = m.mos[idx]; cube = await O.cubeFor(m, mo.spin ? mo.n : idx, { spacing: res, padding: 4, spin: mo.spin || undefined }, p => { $('o-prog').textContent = 'Menghitung ' + tl + '… ' + Math.round(p * 100) + '%'; }); }
      v.addVolumetricData(cube, 'cube', { isoval: iso, color: '#2f6fdc', opacity: 0.85 }); v.addVolumetricData(cube, 'cube', { isoval: -iso, color: '#e8590c', opacity: 0.85 });
      v.zoomTo(); v.render();
    };
    try {
      $('o-prog').textContent = 'Menghitung…';
      const nm = i => $('o-a').querySelector(`option[value="${i}"]`).textContent;
      $('o-ta').textContent = nm(ia); $('o-tb').textContent = nm(ib);
      await draw('orbA', $('o-va'), ia, 'orbital A');
      await draw('orbB', $('o-vb'), ib, 'orbital B');
      $('o-prog').textContent = 'Selesai.';
    } catch (e) { $('o-prog').textContent = 'Gagal: ' + e.message; console.error(e); }
  }
  $('o-render').onclick = renderOrbitals; $('o-iso').oninput = () => $('o-iso-lbl').textContent = (+$('o-iso').value).toFixed(3);

  /* ---- Parameter elektrokimia ---- */
  function renderEchem() {
    const R = S.R, o = R.orbitals, el = $('e-body');
    if (!o) { el.innerHTML = '<div class="callout warn">Butuh energi orbital HOMO/LUMO dari keluaran.</div>'; return; }
    const ex = S.ecExtra || {};
    const rr = A.reactivity(o.homoEv, o.lumoEv, { eN: R.energyEh, eC: ex.eC, eA: ex.eA });
    const row = (n, sym, v, unit, how) => `<tr><td>${n}</td><td>${sym}</td><td class="num"><b>${v}</b></td><td>${unit}</td><td class="muted small">${how}</td></tr>`;
    const D = rr; let h = '<h4 style="margin-top:0">Deskriptor global (aproksimasi Koopmans)</h4><div class="tablewrap"><table class="data"><thead><tr><th>Parameter</th><th>Simbol</th><th class="num">Nilai</th><th>Satuan</th><th>Rumus</th></tr></thead><tbody>' +
      row('Energi HOMO', 'E<sub>HOMO</sub>', f(rr.homoEv, 4), 'eV', 'dari keluaran') + row('Energi LUMO', 'E<sub>LUMO</sub>', f(rr.lumoEv, 4), 'eV', 'dari keluaran') + row('Gap HOMO–LUMO', 'E<sub>g</sub>', f(rr.gapEv, 4), 'eV', 'E<sub>LUMO</sub> − E<sub>HOMO</sub>') +
      row('Potensial ionisasi', 'IP', f(D.IP, 4), 'eV', '−E<sub>HOMO</sub>') + row('Afinitas elektron', 'EA', f(D.EA, 4), 'eV', '−E<sub>LUMO</sub>') + row('Elektronegativitas', 'χ', f(D.chi, 4), 'eV', '(IP+EA)/2') + row('Potensial kimia', 'μ', f(D.mu, 4), 'eV', '−χ') +
      row('Kekerasan (hardness)', 'η', f(D.eta, 4), 'eV', '(IP−EA)/2') + row('Kelunakan (softness)', 'S', f(D.S, 4), 'eV⁻¹', '1/(2η)') + row('Indeks elektrofilisitas', 'ω', f(D.omega, 4), 'eV', 'μ²/(2η)') + row('Transfer muatan maks.', 'ΔN<sub>maks</sub>', f(D.dNmax, 4), 'e', '−μ/η') +
      row('Elektrofilisitas donor', 'ω<sup>−</sup>', f(D.omegaMinus, 4), 'eV', '(3IP+EA)²/(16(IP−EA))') + row('Elektrofilisitas akseptor', 'ω<sup>+</sup>', f(D.omegaPlus, 4), 'eV', '(IP+3EA)²/(16(IP−EA))') + row('Nukleofilisitas (relatif)', 'N', f(D.nucleophilicity, 4), 'eV⁻¹', '1/ω') + '</tbody></table></div>';
    h += `<p class="muted small">Catatan: HOMO/LUMO Kohn–Sham tidak identik dengan IP/EA fisik; nilainya bergantung pada fungsional (hybrid dengan HF-exchange lebih besar umumnya lebih mendekati). Untuk nilai kuantitatif gunakan ΔSCF di bawah.</p>
      <h4>Vertikal ΔSCF (opsional)</h4><div class="row"><label>E kation N−1 (Eh) <input id="e-c" type="number" step="any" value="${ex.eC ?? ''}" style="width:170px"></label><label>E anion N+1 (Eh) <input id="e-a" type="number" step="any" value="${ex.eA ?? ''}" style="width:170px"></label><button class="btn sm" id="e-go" type="button">Hitung</button></div>
      <p class="muted small">Gunakan single point pada geometri molekul netral (vertikal). E netral = ${f(R.energyEh, 6)} Eh (energi akhir keluaran).</p>`;
    if (rr.dscf && rr.dscf.desc) { const d = rr.dscf.desc; h += `<div class="tablewrap"><table class="data"><thead><tr><th>Parameter ΔSCF</th><th class="num">Nilai (eV)</th></tr></thead><tbody><tr><td>IP vertikal</td><td class="num"><b>${f(rr.dscf.IP, 3)}</b></td></tr><tr><td>EA vertikal</td><td class="num"><b>${f(rr.dscf.EA, 3)}</b></td></tr><tr><td>χ</td><td class="num">${f(d.chi, 3)}</td></tr><tr><td>η</td><td class="num">${f(d.eta, 3)}</td></tr><tr><td>S</td><td class="num">${f(d.S, 3)}</td></tr><tr><td>ω</td><td class="num">${f(d.omega, 3)}</td></tr></tbody></table></div>`; }
    el.innerHTML = h; S.reactivity = rr;
    $('e-go').onclick = () => { S.ecExtra = { eC: parseFloat($('e-c').value), eA: parseFloat($('e-a').value) }; renderEchem(); };
  }

  /* ---- TDDFT ---- */
  function renderTD() {
    const td = S.R.tddft; $('t-none').classList.toggle('hidden', !!td); $('t-body').classList.toggle('hidden', !td); if (!td) return;
    drawTD();
  }
  function drawTD() {
    const R = S.R, td = R.tddft, fw = +$('t-fwhm').value || 0.3, shape = $('t-shape').value, fmin = +$('t-fmin').value || 0;
    const states = td.states.filter(s => s.wlNm > 0);
    const o = { fwhmEv: fw, shape, n: 700 }; if ($('t-min').value) o.nmMin = +$('t-min').value; if ($('t-max').value) o.nmMax = +$('t-max').value;
    const sp = A.uvSpectrum(states.map(s => ({ wlNm: s.wlNm, f: s.f })), o); S.spec = sp;
    const peak = Math.max(...states.map(s => A.epsPeak(s.f, fw, shape)), 1);
    chart('t-chart', { title: 'Spektrum serapan UV-Vis (TDDFT)', xlabel: 'panjang gelombang (nm)', ylabel: 'ε (M⁻¹ cm⁻¹)', height: 340, legend: true,
      series: [{ x: sp.nm, y: sp.eps, type: 'area', label: 'ε(λ) broadening' }, { x: states.filter(s => s.f >= Math.max(fmin, 1e-4)).map(s => s.wlNm), y: states.filter(s => s.f >= Math.max(fmin, 1e-4)).map(s => A.epsPeak(s.f, fw, shape)), type: 'stick', color: 'var(--c3)', label: 'transisi (tinggi ∝ f)' }] });
    $('t-lambda').innerHTML = `<span class="pill ok">λ<sub>maks</sub> = ${f(sp.lambdaMax, 1)} nm</span><span class="pill">ε<sub>maks</sub> = ${sp.epsMax ? sp.epsMax.toExponential(2) : '—'} M⁻¹cm⁻¹</span><span class="pill">${f(1239.84198 / sp.lambdaMax, 3)} eV</span>`;
    const rows = states.filter(s => s.f >= fmin).map(s => Object.assign({}, s, { eps: A.epsPeak(s.f, fw, shape), lhe: 1 - Math.pow(10, -s.f), top: (s.transitions || []).filter(t => t.weight >= 0.05).sort((a, b) => b.weight - a.weight).slice(0, 4) }));
    S.tdRows = rows; const maxf = Math.max(...rows.map(r => r.f), 0);
    const t = table([{ h: 'Status', fmt: r => r.n + (r.mult === 3 ? ' (T)' : '') }, { h: 'E (eV)', num: 1, fmt: r => f(r.eEv, 3) }, { h: 'λ (nm)', num: 1, fmt: r => f(r.wlNm, 1) }, { h: 'f', num: 1, fmt: r => f(r.f, 4) }, { h: 'ε<sub>puncak</sub>', num: 1, fmt: r => r.eps.toExponential(2) }, { h: 'LHE', num: 1, fmt: r => f(r.lhe, 3) },
      { h: 'Transisi dominan (kontribusi)', fmt: r => r.top.map(t => `${t.fromLabel || t.fromRaw} → ${t.toLabel || t.toRaw} (${(t.weight * 100).toFixed(1)}%)`).join('<br>') || '—' }], rows, { rowClass: r => (r.f === maxf && maxf > 0) ? 'sel' : '' });
    $('t-table').innerHTML = ''; $('t-table').append(t);
  }
  ['t-fwhm', 't-shape', 't-min', 't-max', 't-fmin'].forEach(id => $(id).addEventListener('input', () => S.R && S.R.tddft && drawTD()));
  $('csv-spec').onclick = () => S.spec && QC.download('spektrum.csv', A.csv(['nm', 'eps'], S.spec.nm.map((x, i) => [x.toFixed(2), S.spec.eps[i].toFixed(2)])), 'text/csv');
  $('csv-td').onclick = () => S.tdRows && QC.download('tddft_states.csv', A.csv(['state', 'E_eV', 'lambda_nm', 'f', 'eps_peak', 'LHE', 'transitions'], S.tdRows.map(r => [r.n, r.eEv, r.wlNm, r.f, r.eps.toFixed(1), r.lhe.toFixed(4), r.top.map(t => `${t.fromLabel}->${t.toLabel} ${(t.weight * 100).toFixed(1)}%`).join('; ')])), 'text/csv');

  /* ---- Panel DSSC ---- */
  function renderDSSC() {
    const R = S.R, o = R.orbitals, el = $('d-body');
    if (!o) { el.innerHTML = '<div class="callout warn">Butuh energi HOMO/LUMO.</div>'; return; }
    const d = S.dssc || { eCB: -4.0, eRedox: -4.8 };
    const td = R.tddft, br = td && td.states.filter(s => s.f > 0.01).sort((a, b) => a.eEv - b.eEv)[0];
    const e00 = d.e00 != null ? d.e00 : (br ? br.eEv : o.gapEv);
    const fmax = td ? Math.max(...td.states.map(s => s.f)) : null;
    const r = A.dssc({ homoEv: o.homoEv, lumoEv: o.lumoEv, eCB: d.eCB, eRedox: d.eRedox, e00, f: fmax });
    el.innerHTML = `<div class="callout info">Estimasi kasar berbasis level energi molekul tunggal dalam fase gas/pelarut kontinum (tanpa adsorpsi pada TiO₂, tanpa efek elektrolit). Cocok untuk membandingkan zat warna dalam satu seri, <b>bukan</b> prediksi efisiensi. Skala vakum: E(CB TiO₂) ≈ −4.0 eV dan I⁻/I₃⁻ ≈ −4.8 eV adalah nilai umum literatur yang dapat Anda ubah.</div>
      <div class="row" style="margin:10px 0"><label>E<sub>CB</sub> (eV) <input id="d-cb" type="number" step="0.05" value="${r.eCB}" style="width:90px"></label><label>E<sub>redoks</sub> (eV) <input id="d-rx" type="number" step="0.05" value="${r.eRedox}" style="width:90px"></label><label>E<sub>0-0</sub> (eV) <input id="d-e00" type="number" step="0.01" value="${f(r.e00, 3)}" style="width:90px"></label><button class="btn sm" id="d-go" type="button">Hitung</button></div>
      <div class="grid g2r"><div><div class="tablewrap"><table class="data"><tbody>
      <tr><td>E<sub>HOMO</sub> ≈ E<sub>ox</sub></td><td class="num">${f(r.eHomo, 3)} eV</td><td></td></tr>
      <tr><td>E<sub>0-0</sub> (default: eksitasi terang terendah)</td><td class="num">${f(r.e00, 3)} eV</td><td></td></tr>
      <tr><td>E<sub>ox</sub>* = E<sub>HOMO</sub> + E<sub>0-0</sub></td><td class="num">${f(r.eOxStar, 3)} eV</td><td></td></tr>
      <tr><td>ΔG<sub>inj</sub> = E<sub>CB</sub> − E<sub>ox</sub>*</td><td class="num"><b>${f(r.dGinj, 3)} eV</b></td><td>${r.injectionOk ? '<span class="pill ok">injeksi mungkin</span>' : '<span class="pill bad">injeksi lemah</span>'}</td></tr>
      <tr><td>ΔG<sub>reg</sub> = E<sub>HOMO</sub> − E<sub>redoks</sub></td><td class="num"><b>${f(r.dGreg, 3)} eV</b></td><td>${r.regenOk ? '<span class="pill ok">regenerasi mungkin</span>' : '<span class="pill bad">regenerasi lemah</span>'}</td></tr>
      <tr><td>LUMO − E<sub>CB</sub></td><td class="num">${f(r.lumoAboveCB, 3)} eV</td><td>${r.lumoAboveCB > 0 ? '<span class="pill ok">LUMO di atas CB</span>' : '<span class="pill bad">LUMO di bawah CB</span>'}</td></tr>
      <tr><td>V<sub>oc</sub> maks teoretis = E<sub>CB</sub> − E<sub>redoks</sub></td><td class="num">${f(r.VocMax, 3)} V</td><td></td></tr>
      <tr><td>LHE = 1 − 10<sup>−f</sup> (f maks ${f(fmax, 3)})</td><td class="num">${f(r.LHE, 3)}</td><td></td></tr></tbody></table></div></div>
      <div id="d-diag"></div></div>`;
    drawDSSC(r);
    $('d-go').onclick = () => { S.dssc = { eCB: +$('d-cb').value, eRedox: +$('d-rx').value, e00: +$('d-e00').value }; renderDSSC(); };
    S.dsscRes = r;
  }
  function drawDSSC(r) {
    const vals = [r.eHomo, r.eLumo, r.eCB, r.eRedox, r.eOxStar], hi = Math.max(...vals) + 0.4, lo = Math.min(...vals) - 0.4, W = 380, H = 340, Y = e => 16 + (hi - e) / (hi - lo) * (H - 32);
    const L = (e, x1, x2, c, t) => `<line x1="${x1}" x2="${x2}" y1="${Y(e)}" y2="${Y(e)}" stroke="${c}" stroke-width="3"/><text x="${x2 + 6}" y="${Y(e) + 4}">${t} (${f(e, 2)})</text>`;
    $('d-diag').innerHTML = `<svg class="lv" viewBox="0 0 ${W + 120} ${H}" width="100%" role="img" aria-label="Diagram penjajaran level DSSC">` + L(r.eCB, 20, 110, 'var(--c4)', 'CB TiO₂') + L(r.eRedox, 20, 110, 'var(--c5)', 'redoks') + L(r.eLumo, 190, 280, 'var(--c2)', 'LUMO') + L(r.eHomo, 190, 280, 'var(--c1)', 'HOMO') + `<line x1="235" x2="235" y1="${Y(r.eOxStar)}" y2="${Y(r.eHomo)}" stroke="var(--muted)" stroke-dasharray="4 3"/><text x="238" y="${(Y(r.eOxStar) + Y(r.eHomo)) / 2}" style="font-size:10px">E0-0</text><line x1="150" x2="150" y1="${Y(r.eOxStar)}" y2="${Y(r.eCB)}" stroke="var(--c3)" stroke-width="1.5"/><text x="120" y="${(Y(r.eOxStar) + Y(r.eCB)) / 2}" style="font-size:10px">ΔGinj</text><line x1="${190}" x2="${280}" y1="${Y(r.eOxStar)}" y2="${Y(r.eOxStar)}" stroke="var(--c3)" stroke-dasharray="5 3"/><text x="${286}" y="${Y(r.eOxStar) + 4}" style="font-size:10px">Eox* (${f(r.eOxStar, 2)})</text></svg>`;
  }

  /* ---- Ekspor ---- */
  function renderExport() {
    const R = S.R;
    $('x-body').innerHTML = `<p>Ringkasan seluruh hasil dalam format yang dapat dipakai ulang di laporan atau skrip.</p><div class="row"><button class="btn primary" id="x-json" type="button">JSON lengkap</button><button class="btn" id="x-md" type="button">Ringkasan Markdown</button><button class="btn" id="x-xyz" type="button">Geometri akhir (.xyz)</button><button class="btn" id="x-traj" type="button">Lintasan optimasi (.xyz)</button><button class="btn" id="x-print" type="button">Cetak / simpan PDF</button></div>`;
    const base = (R.filename || 'hasil').replace(/\.[^.]*$/, '');
    $('x-json').onclick = () => QC.download(base + '_analisis.json', JSON.stringify({ ringkasan: R, reaktivitas: S.reactivity || null, dssc: S.dsscRes || null }, (k, v) => k === 'inputText' ? undefined : v, 1), 'application/json');
    $('x-xyz').onclick = () => QC.download(base + '_final.xyz', xyzOf(R.geometry.atoms, R.formula));
    $('x-traj').onclick = () => R.trajectory.length ? QC.download(base + '_traj.xyz', R.trajectory.map((t, i) => xyzOf(t.atoms, 'step ' + (i + 1) + ' E=' + t.E)).join('')) : QC.toast('Tidak ada lintasan.');
    $('x-print').onclick = () => window.print();
    $('x-md').onclick = () => {
      const o = R.orbitals, rr = S.reactivity; let m = `# Hasil ${R.formula} (${R.program})\n\n- Metode: ${R.functional || R.method || '?'} / ${R.basis || '?'}${R.solvent ? ' / ' + R.solvent : ''}\n- Energi: ${f(R.energyEh, 6)} Eh\n- Terminasi normal: ${R.terminatedNormally}\n`;
      if (R.freq) m += `- Frekuensi imajiner: ${R.freq.nImag}\n`; if (o) m += `- HOMO ${f(o.homoEv, 3)} eV, LUMO ${f(o.lumoEv, 3)} eV, gap ${f(o.gapEv, 3)} eV\n`;
      if (rr) m += `- IP ${f(rr.IP, 3)} eV, EA ${f(rr.EA, 3)} eV, η ${f(rr.eta, 3)} eV, ω ${f(rr.omega, 3)} eV (Koopmans)\n`;
      if (S.tdRows && S.tdRows.length) { m += `\n| State | E (eV) | λ (nm) | f | Transisi |\n|---|---|---|---|---|\n` + S.tdRows.slice(0, 15).map(r => `| ${r.n} | ${f(r.eEv, 3)} | ${f(r.wlNm, 1)} | ${f(r.f, 4)} | ${r.top.map(t => t.fromLabel + '→' + t.toLabel + ' ' + (t.weight * 100).toFixed(0) + '%').join(', ')} |`).join('\n') + '\n'; }
      QC.download(base + '_ringkasan.md', m, 'text/markdown');
    };
  }

  /* ------------------------------ tab, drop, contoh ------------------------------ */
  QC.tabs('res-tabs', { onChange: id => { if (id === 'r-geom' && S.viewers.geom) { S.viewers.geom.resize(); S.viewers.geom.render(); } if (id === 'r-orb') ['orbA', 'orbB'].forEach(k => S.viewers[k] && (S.viewers[k].resize(), S.viewers[k].render())); if (id === 'r-freq' && S.viewers.freq) { S.viewers.freq.resize(); S.viewers.freq.render(); } } });
  QC.dropZone($('drop'), files => addFiles(files));
  $('btn-clear').onclick = () => { S.files = []; S.viewers = {}; ['g-viewer', 'f-viewer', 'o-va', 'o-vb'].forEach(i => $(i).innerHTML = ''); refresh(); };
  async function fetchText(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' → ' + r.status); return r.text(); }
  async function demo(names) { try { for (const n of names) addText(n, await fetchText('samples/' + n)); await refresh(); } catch (e) { QC.toast('Gagal memuat contoh: ' + e.message, 5000); } }
  $('btn-demo-orca').onclick = () => demo(['orca_opt_freq.out', 'orca_tddft.out']);
  $('btn-demo-gauss').onclick = () => demo(['gaussian_opt_freq.log', 'gaussian_td.log']);
  $('btn-demo-orb').onclick = () => demo(['orca_opt_freq.out', 'orca_tddft.out', 'demo.molden']);

  /* serah-terima dari ORCA Docker */
  (async function handoff() {
    const q = new URLSearchParams(location.search); if (q.get('from') !== 'docker') return;
    let p = QC.store.get('analyzerHandoff', null);
    if (!p) { try { p = JSON.parse(sessionStorage.getItem('qc.analyzerHandoff')); } catch (e) { } }
    if (!p && q.get('store') === 'idb') {
      p = await new Promise(res => { const rq = indexedDB.open('qc', 1); rq.onsuccess = () => { try { const g = rq.result.transaction('handoff').objectStore('handoff').get('analyzerHandoff'); g.onsuccess = () => res(g.result); g.onerror = () => res(null); } catch (e) { res(null); } }; rq.onerror = () => res(null); });
    }
    if (p && p.text) { addText(p.name || 'orca-docker.out', p.text); await refresh(); QC.toast('Hasil dimuat dari ORCA Docker: ' + (p.name || ''), 3500); }
  })();
  window.__results = S;
})();
