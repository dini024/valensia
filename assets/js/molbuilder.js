/* Molecular Builder — UI. Bergantung: common.js, RDKit.js (CDN), 3Dmol.js (CDN), molbuilder-engine.js */
(function () {
  'use strict';
  const QC = window.QC;
  QC.nav('molecular-builder.html');
  QC.tabs('wb');
  const $ = id => document.getElementById(id);
  const esc = QC.esc;

  /* ---------------- library lokal ---------------- */
  const LIB = [
    ['Benzena', 'c1ccccc1'], ['Azobenzena (trans)', 'c1ccc(cc1)/N=N/c1ccccc1'], ['Anisol', 'COc1ccccc1'],
    ['Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'], ['Glisin', 'NCC(=O)O'], ['Kafein', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C'],
    ['Air', 'O'], ['Metanol', 'CO'], ['Etanol', 'CCO'], ['Asam asetat', 'CC(=O)O'], ['Asetonitril', 'CC#N'], ['Etena', 'C=C'],
    ['Piridina', 'c1ccncc1'], ['Tiofena', 'c1ccsc1'], ['Fenol', 'Oc1ccccc1'], ['Anilina', 'Nc1ccccc1'],
    ['Nitrobenzena', '[O-][N+](=O)c1ccccc1'], ['Toluena', 'Cc1ccccc1'], ['Naftalena', 'c1ccc2ccccc2c1'], ['Kumarin', 'O=c1ccc2ccccc2o1'],
    ['2,2′-Bipiridina (ligan)', 'c1ccc(nc1)-c1ccccn1'], ['dcbpy: 4,4′-dikarboksi-2,2′-bipiridina (ligan N3/N719)', 'OC(=O)c1ccnc(c1)-c1cc(ccn1)C(O)=O'],
    ['Trifenilamina (donor dye)', 'c1ccc(cc1)N(c1ccccc1)c1ccccc1'], ['4-(Dimetilamino)benzoat (D–A mini-dye)', 'CN(C)c1ccc(cc1)C(=O)O'],
    ['Asam 2-siano-3-(tiofen-2-il)akrilat (akseptor/jangkar DSSC)', 'N#C/C(=C\\c1cccs1)C(O)=O'], ['Rhodanine-3-asetat (jangkar)', 'OC(=O)CN1C(=S)SC(=C1)C=O'.replace('SC(=C1)C=O', 'SCC1=O')],
  ];
  const EXAMPLES = [['Benzena', 'c1ccccc1'], ['Azobenzena', 'c1ccc(cc1)/N=N/c1ccccc1'], ['Anisol', 'COc1ccccc1'], ['Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'], ['Glisin', 'NCC(=O)O'], ['Kafein', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C']];

  /* ---------------- state ---------------- */
  const S = { rd: null, smiles: '', canon: '', info: null, arom: [], mb2d: '', confs: [], sel: 0, charge: 0, mult: 1, multTouched: false, enumRows: [], v: null, vstyle: 'ballstick' };
  const dockerCfg = () => QC.store.get('dockerCfg', null) || {};

  async function rdkit() {
    if (S.rd) return S.rd;
    S.rd = await QC.loadRDKit();
    return S.rd;
  }
  function msg(el, text, kind) { el.innerHTML = text ? `<div class="callout ${kind || ''}" style="margin:8px 0"><p>${text}</p></div>` : ''; }

  /* ---------------- analisis molekul (RDKit.js) ---------------- */
  function parseFormula(counts) {
    const order = Object.keys(counts).sort((a, b) => a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? (b === 'C' ? 1 : -1) : b === 'H' ? 1 : a.localeCompare(b));
    return order.map(e => e + (counts[e] > 1 ? counts[e] : '')).join('');
  }
  async function analyze(smiles) {
    const R = await rdkit();
    const m = R.get_mol(smiles);
    if (!m || !m.is_valid()) { if (m) m.delete(); throw new Error('SMILES tidak valid — periksa tanda kurung, cincin, atau aromatisitas.'); }
    try {
      const hasStar = /\[\*\]|\*/.test(smiles);
      const canon = m.get_smiles();
      const svg = m.get_svg(380, 280);
      let d = {}; try { d = JSON.parse(m.get_descriptors()); } catch (e) { /* abaikan */ }
      const mh = R.get_mol(smiles); mh.add_hs_in_place();
      let json = {}; try { json = JSON.parse(mh.get_json()); } catch (e) { }
      const ext = ((json.molecules || [{}])[0].extensions || []).find(x => x.name === 'rdkitRepresentation') || {};
      const arom = ext.aromaticBonds || [];
      mh.set_new_coords();
      const mb = mh.get_molblock(); mh.delete();
      const L = mb.split('\n'); const na = parseInt(L[3].substr(0, 3));
      const counts = {}; let charge = 0;
      for (let i = 0; i < na; i++) { const el = L[4 + i].substr(31, 3).trim(); counts[el] = (counts[el] || 0) + 1; }
      for (const l of L) if (l.startsWith('M  CHG')) { const p = l.trim().split(/\s+/); for (let k = 3; k + 1 < p.length; k += 2) charge += parseInt(p[k + 1]); }
      return { canon, svg, d, formula: parseFormula(counts), counts, charge, arom, mb, hasStar, nAtoms: na };
    } finally { m.delete(); }
  }
  const nElec = (counts, charge) => Object.entries(counts).reduce((s, [el, n]) => s + n * ((QC.ELEMENTS[el] || { z: 0 }).z), 0) - charge;

  function fmtD(x, n) { return x == null || isNaN(x) ? '—' : (+x).toFixed(n); }
  function renderInfo() {
    const I = S.info; if (!I) return;
    $('depict').innerHTML = I.svg;
    const d = I.d;
    $('desc').innerHTML = [
      ['SMILES kanonik', `<span style="word-break:break-all">${esc(I.canon)}</span>`], ['Rumus', I.formula.replace(/(\d+)/g, '<sub>$1</sub>')],
      ['Massa molekul (g/mol)', fmtD(d.amw, 2)], ['Massa eksak', fmtD(d.exactmw, 4)], ['Muatan formal', I.charge],
      ['Jumlah atom (dgn H)', I.nAtoms], ['Atom berat', d.NumHeavyAtoms], ['Cincin / aromatik', `${d.NumRings} / ${d.NumAromaticRings}`],
      ['logP (Crippen)', fmtD(d.CrippenClogP, 2)], ['TPSA (Å²)', fmtD(d.tpsa, 1)], ['HBD / HBA', `${d.NumHBD} / ${d.NumHBA}`], ['Ikatan rotatable', d.NumRotatableBonds],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  /* ---------------- build 2D ---------------- */
  async function build() {
    const smi = $('smi').value.trim().replace(/\s+/g, '');
    if (!smi) { msg($('build-msg'), 'Masukkan SMILES.', 'warn'); return false; }
    $('build-msg').innerHTML = '<span class="spin"></span> menghitung…';
    try {
      const I = await analyze(smi);
      S.smiles = smi; S.canon = I.canon; S.info = I; S.confs = []; S.sel = 0;
      S.charge = I.charge; S.multTouched = false; S.mult = nElec(I.counts, I.charge) % 2 === 0 ? 1 : 2;
      renderInfo(); resetViewer(); syncCM(); updateButtons();
      let note = '';
      if (I.hasStar) note += 'Struktur memuat atom <code>[*]</code>: bisa digambar, tetapi tidak bisa dibuat 3D. ';
      if (I.d.NumUnspecifiedAtomStereoCenters > 0) note += `Ada ${I.d.NumUnspecifiedAtomStereoCenters} pusat kiral tanpa stereokimia; 3D memakai konfigurasi acak. `;
      msg($('build-msg'), note || '', note ? 'warn' : '');
      if (!note) $('build-msg').innerHTML = '';
      QC.store.set('builder.last', { smiles: smi, name: $('mname').value });
      return true;
    } catch (e) { msg($('build-msg'), esc(e.message), 'bad'); return false; }
  }

  /* ---------------- charge / multiplicity ---------------- */
  function syncCM() {
    $('mcharge').value = S.charge; $('mmult').value = S.mult;
    if (!S.info) { $('elec').textContent = ''; return; }
    const ne = nElec(S.info.counts, S.charge);
    const ok = (ne % 2 === 0) === (S.mult % 2 === 1);
    $('elec').innerHTML = `Jumlah elektron = <b>${ne}</b> → ${ne % 2 === 0 ? 'cangkang tertutup (singlet) lazim' : 'ganjil (radikal; minimal doublet)'}.` + (ok ? '' : ' <span class="pill bad">paritas multiplisitas tidak cocok dengan jumlah elektron</span>');
    renderSummaries();
  }
  $('mcharge').addEventListener('input', () => {
    S.charge = parseInt($('mcharge').value, 10) || 0;
    if (S.info && !S.multTouched) S.mult = nElec(S.info.counts, S.charge) % 2 === 0 ? 1 : 2;
    syncCM();
  });
  $('mmult').addEventListener('input', () => { S.mult = Math.max(1, parseInt($('mmult').value, 10) || 1); S.multTouched = true; syncCM(); });

  /* ---------------- 3D ---------------- */
  async function loadEngine() { if (!window.QCEmbed) await QC.loadScript('assets/js/molbuilder-engine.js'); return window.QCEmbed; }
  function withCoords(mb, atoms, title) {
    const L = mb.split('\n'); L[0] = title || ''; L[1] = '     DFTStudio       3D';
    for (let i = 0; i < atoms.length; i++) { const f = v => v.toFixed(4).padStart(10); L[4 + i] = f(atoms[i].x) + f(atoms[i].y) + f(atoms[i].z) + L[4 + i].substr(30); }
    const na = parseInt(L[3].substr(0, 3)), nb = parseInt(L[3].substr(3, 3));
    for (let j = 0; j < nb; j++) { const l = L[4 + na + j]; L[4 + na + j] = l.substr(0, 9) + '  0' + l.substr(12); }
    return L.join('\n');
  }
  function xyzOf(atoms, comment) { return atoms.length + '\n' + (comment || '') + '\n' + atoms.map(a => `${a.el.padEnd(2)} ${a.x.toFixed(6).padStart(12)} ${a.y.toFixed(6).padStart(12)} ${a.z.toFixed(6).padStart(12)}`).join('\n') + '\n'; }
  function parseXYZtext(t) { const L = t.trim().split(/\r?\n/); const n = parseInt(L[0]); return L.slice(2, 2 + n).map(l => { const p = l.trim().split(/\s+/); return { el: p[0], x: +p[1], y: +p[2], z: +p[3] }; }); }

  async function embedLocal(info, n, onProg) {
    const E = await loadEngine();
    const out = [];
    for (let k = 0; k < n; k++) {
      onProg && onProg(k, n); await new Promise(r => setTimeout(r, 15));
      const r = E.embedMolblock(info.mb, { bonds: info.arom }, { seed: 20240611 + k * 977, nconf: 1 });
      out.push({ atoms: r.atoms, E: r.energy, molblock: r.molblock, ok: r.stereoOK, dev: r.maxBondDev, min: r.minNonbonded });
    }
    out.sort((a, b) => a.E - b.E);
    const uniq = []; out.forEach(c => { if (!uniq.some(u => Math.abs(u.E - c.E) < 0.02)) uniq.push(c); });
    return uniq;
  }
  async function embedBackend(info, smiles) {
    const cfg = dockerCfg(); const headers = { 'Content-Type': 'application/json' }; if (cfg.key) headers['X-API-Key'] = cfg.key;
    let r;
    try { r = await fetch((cfg.url || '').replace(/\/+$/, '') + '/api/molecule/embed', { method: 'POST', headers, body: JSON.stringify({ smiles, ff: 'MMFF94', seed: 42 }) }); }
    catch (e) { throw new Error('Backend tidak terjangkau (' + e.message + '). Periksa URL/CORS/HTTPS di halaman ORCA Docker, atau matikan opsi backend.'); }
    if (!r.ok) { let t = ''; try { t = (await r.json()).detail; } catch (e) { } throw new Error(`Backend menolak (HTTP ${r.status}) ${t || ''}`); }
    const j = await r.json(); const atoms = parseXYZtext(j.xyz);
    if (atoms.length !== info.nAtoms) throw new Error('Jumlah atom dari backend tidak cocok dengan topologi lokal.');
    return [{ atoms, E: j.energy, molblock: withCoords(info.mb, atoms, $('mname').value), ok: true, backend: true }];
  }
  async function generate3D() {
    if (!S.info && !(await build())) return;
    if (S.info.hasStar) { msg($('msg3d'), 'Atom <code>[*]</code> tidak bisa di-3D-kan: ganti dengan substituen terlebih dahulu.', 'bad'); return; }
    const btn = $('btn-3d'); btn.disabled = true;
    const t0 = performance.now();
    try {
      let confs;
      if ($('use-backend').checked) { $('msg3d').innerHTML = '<span class="spin"></span> memanggil backend…'; confs = await embedBackend(S.info, S.smiles); }
      else {
        const n = Math.min(12, Math.max(1, parseInt($('nconf').value, 10) || 1));
        confs = await embedLocal(S.info, n, (k, n) => { $('msg3d').innerHTML = `<span class="spin"></span> embedding + minimisasi ${k + 1}/${n}…`; });
      }
      S.confs = confs; S.sel = 0;
      fillConfs(); await showConf();
      const c = confs[0];
      const flags = c.backend ? 'RDKit ETKDGv3 + MMFF94 (backend)' : `force field ringan (UFF-lite) di browser; penyimpangan ikatan maks ${QC.fmt(c.dev, 2)} Å`;
      msg($('msg3d'), `Selesai dalam ${((performance.now() - t0) / 1000).toFixed(1)} s — ${flags}. ` + (c.ok === false ? '<b>Peringatan:</b> stereokimia tidak sepenuhnya terjaga.' : '') + '<br><span class="muted">Energi FF relatif (kcal/mol), bukan energi DFT. Optimasi ulang dengan DFT tetap wajib.</span>', c.ok === false ? 'warn' : 'ok');
    } catch (e) { msg($('msg3d'), esc(e.message) + (/didukung/.test(e.message) ? ' Gunakan opsi backend untuk unsur ini.' : ''), 'bad'); }
    btn.disabled = false; updateButtons();
  }
  function fillConfs() {
    const sel = $('confsel'); const e0 = S.confs[0].E;
    sel.innerHTML = S.confs.map((c, i) => `<option value="${i}">${i + 1}${i === 0 ? ' (terendah)' : ''} · ΔE = ${QC.fmt(c.E - e0, 2)} kcal/mol</option>`).join('');
    sel.disabled = S.confs.length < 2;
  }
  $('confsel').addEventListener('change', () => { S.sel = +$('confsel').value; showConf(); });
  $('vstyle').addEventListener('change', () => { S.vstyle = $('vstyle').value; showConf(); });
  function cur() { return S.confs[S.sel]; }
  async function showConf() {
    const c = cur(); if (!c) return;
    const host = $('v3d');
    try {
      if (!S.v) { host.innerHTML = ''; S.v = await QC.viewer(host); }
      QC.showXYZ(S.v, xyzOf(c.atoms, $('mname').value), S.vstyle);
    } catch (e) { host.innerHTML = '<div class="vlabel">3Dmol.js gagal dimuat. Anda tetap dapat mengunduh XYZ/SDF.</div>'; }
  }
  function resetViewer() { if (S.v) { try { S.v.removeAllModels(); S.v.render(); } catch (e) { } } $('confsel').innerHTML = ''; $('confsel').disabled = true; msg($('msg3d'), ''); }
  function updateButtons() {
    const has = !!cur();
    ['btn-xyz', 'btn-sdf'].forEach(id => $(id).disabled = !has);
    document.querySelectorAll('.go-input').forEach(b => b.disabled = !has);
    renderSummaries();
  }
  function safeName() { return ($('mname').value || 'molekul').trim().replace(/[^A-Za-z0-9_.-]+/g, '_') || 'molekul'; }
  $('btn-xyz').onclick = () => { const c = cur(); if (c) QC.download(safeName() + '.xyz', xyzOf(c.atoms, $('mname').value + ' | ' + S.canon)); };
  $('btn-sdf').onclick = () => { const c = cur(); if (c) QC.download(safeName() + '.sdf', withCoords(c.molblock, c.atoms, $('mname').value) + '\n$$$$\n'); };

  /* ---------------- hand-off ke Input Builder ---------------- */
  function renderSummaries() {
    document.querySelectorAll('.handoff-sum').forEach(el => {
      const c = cur();
      el.innerHTML = c ? `<dl class="kv"><dt>Molekul</dt><dd>${esc($('mname').value)} (${S.info.formula})</dd><dt>Atom</dt><dd>${c.atoms.length}</dd><dt>Muatan / mult.</dt><dd>${S.charge} / ${S.mult}</dd><dt>SMILES</dt><dd style="word-break:break-all">${esc(S.canon)}</dd></dl>`
        : '<div class="callout warn"><p>Belum ada struktur 3D. Kembali ke tab 1, bangun SMILES, lalu tekan “Generate 3D + pre-optimize”.</p></div>';
    });
  }
  function goInput(eng) {
    const c = cur(); if (!c) { QC.toast('Buat struktur 3D dulu.'); return; }
    const name = safeName();
    const mol = { name, smiles: S.canon, formula: S.info.formula, charge: S.charge, mult: S.mult, xyz: xyzOf(c.atoms, name), sdf: withCoords(c.molblock, c.atoms, name) + '\n$$$$\n', atoms: c.atoms, source: 'builder', ts: Date.now() };
    QC.store.set('molecule', mol);
    QC.store.set('input.mol', { name, atoms: c.atoms, charge: S.charge, mult: S.mult, smiles: S.canon, source: 'builder' });
    location.href = 'input-builder.html#' + (eng === 'gaussian' ? 'gaussian' : 'orca');
  }
  document.querySelectorAll('.go-input').forEach(b => b.addEventListener('click', () => goInput(b.dataset.eng)));

  /* ---------------- pustaka ---------------- */
  function libList(items, status) {
    $('lib-status').textContent = status || '';
    const host = $('lib-res'); host.innerHTML = '';
    items.forEach(([name, smi, extra]) => {
      const b = QC.el('button', { class: 'lib-item', type: 'button', title: smi, onclick: () => { $('smi').value = smi; $('mname').value = name.replace(/\s*\(.*$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40); build(); } }, [QC.el('b', { text: name }), QC.el('span', { text: (extra ? extra + ' · ' : '') + smi })]);
      host.append(b);
    });
  }
  async function jfetch(url) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try { return await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  async function searchLib() {
    const src = $('lib-src').value, q = $('lib-q').value.trim();
    if (src === 'local') {
      const f = LIB.filter(([n, s]) => !q || (n + ' ' + s).toLowerCase().includes(q.toLowerCase()));
      return libList(f, `${f.length} molekul lokal`);
    }
    if (!q) { $('lib-status').textContent = 'Isi kata kunci.'; return; }
    $('lib-status').innerHTML = '<span class="spin"></span> mencari…'; $('lib-res').innerHTML = '';
    try {
      if (src === 'pubchem') {
        const r = await jfetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/IsomericSMILES,SMILES,MolecularFormula,MolecularWeight,Title/JSON`);
        if (r.status === 404) return libList([], `PubChem: “${q}” tidak ditemukan.`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const items = (j.PropertyTable.Properties || []).slice(0, 15).map(p => [p.Title || ('CID ' + p.CID), p.IsomericSMILES || p.SMILES || p.CanonicalSMILES || p.ConnectivitySMILES, `${p.MolecularFormula} · ${p.MolecularWeight} g/mol · CID ${p.CID}`]).filter(x => x[1]);
        libList(items, `PubChem: ${items.length} hasil`);
      } else {
        const r = await jfetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${encodeURIComponent(q)}&limit=12`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const items = (j.molecules || []).filter(m => m.molecule_structures && m.molecule_structures.canonical_smiles).map(m => [m.pref_name || m.molecule_chembl_id, m.molecule_structures.canonical_smiles, m.molecule_chembl_id]);
        libList(items, `ChEMBL: ${items.length} hasil`);
      }
    } catch (e) {
      $('lib-status').innerHTML = `<span style="color:var(--danger)">Tidak dapat menghubungi ${src === 'pubchem' ? 'PubChem' : 'ChEMBL'} (${esc(e.name === 'AbortError' ? 'waktu habis' : e.message)}). Periksa koneksi internet / pemblokir iklan; gunakan library lokal atau tempel SMILES secara manual.</span>`;
    }
  }
  $('lib-go').onclick = searchLib; $('lib-local').onclick = () => { $('lib-src').value = 'local'; $('lib-q').value = ''; searchLib(); };
  $('lib-q').addEventListener('keydown', e => { if (e.key === 'Enter') searchLib(); });

  /* ---------------- deskriptor: ekspor ---------------- */
  const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
  $('btn-copy-smi').onclick = () => { if (S.canon) QC.copy(S.canon, 'SMILES kanonik disalin'); else QC.toast('Bangun molekul dulu.'); };
  $('btn-csv-desc').onclick = () => {
    if (!S.info) return QC.toast('Bangun molekul dulu.');
    const I = S.info, row = { name: $('mname').value, smiles: I.canon, formula: I.formula, charge: I.charge, ...I.d };
    QC.download(safeName() + '_descriptors.csv', Object.keys(row).map(csvq).join(',') + '\n' + Object.values(row).map(csvq).join(',') + '\n', 'text/csv');
  };
  $('btn-json').onclick = () => { if (!S.info) return QC.toast('Bangun molekul dulu.'); QC.download(safeName() + '_descriptors.json', JSON.stringify({ name: $('mname').value, smiles: S.info.canon, formula: S.info.formula, charge: S.info.charge, descriptors: S.info.d }, null, 2), 'application/json'); };
  $('btn-build').onclick = build;
  $('smi').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); build(); } });
  EXAMPLES.forEach(([n, s]) => $('examples').append(QC.el('button', { class: 'chip', type: 'button', onclick: () => { $('smi').value = s; $('mname').value = n.toLowerCase(); build(); } }, n)));

  /* ---------------- seri substituen ---------------- */
  async function enumerate() {
    const core = $('core').value.trim();
    const n = (core.match(/\[\*\]/g) || []).length;
    if (n !== 1 || /\*/.test(core.replace('[*]', ''))) { msg($('enum-msg'), 'Core harus memuat <b>tepat satu</b> titik sambung <code>[*]</code> (ditemukan ' + n + ').', 'bad'); return; }
    const subs = $('subs').value.split(/[\s,;]+/).filter(Boolean);
    if (!subs.length) { msg($('enum-msg'), 'Isi daftar substituen.', 'bad'); return; }
    const R = await rdkit(); const rows = [];
    for (const s of subs) {
      const sub = s === 'H' ? '[H]' : s;
      const smi = core.replace('[*]', sub);
      const m = R.get_mol(smi); let row = { sub: s, smiles: smi, valid: false };
      if (m && m.is_valid()) {
        const d = JSON.parse(m.get_descriptors());
        const mh = R.get_mol(smi); mh.add_hs_in_place(); const mb = mh.get_molblock(); mh.delete();
        const counts = {}; const L = mb.split('\n'); const na = parseInt(L[3].substr(0, 3)); for (let i = 0; i < na; i++) { const el = L[4 + i].substr(31, 3).trim(); counts[el] = (counts[el] || 0) + 1; }
        row = { sub: s, smiles: smi, canon: m.get_smiles(), valid: true, mw: d.amw, logp: d.CrippenClogP, tpsa: d.tpsa, formula: parseFormula(counts), svg: m.get_svg(120, 80) };
      }
      if (m) m.delete(); rows.push(row);
    }
    S.enumRows = rows;
    const ok = rows.filter(r => r.valid).length;
    msg($('enum-msg'), `${ok} dari ${rows.length} kandidat valid.`, ok === rows.length ? 'ok' : 'warn');
    const t = $('enum-tbl'); $('enum-wrap').style.display = '';
    t.innerHTML = '<thead><tr><th>Substituen</th><th>Struktur</th><th>SMILES kanonik</th><th>Rumus</th><th class="num">MW</th><th class="num">logP</th><th>Aksi</th></tr></thead>';
    const tb = QC.el('tbody');
    rows.forEach((r, i) => tb.append(QC.el('tr', null, r.valid ? [
      QC.el('td', { text: r.sub }), QC.el('td', { class: 'mini-svg', html: r.svg }), QC.el('td', { class: 'mono', text: r.canon }), QC.el('td', { text: r.formula }),
      QC.el('td', { class: 'num', text: QC.fmt(r.mw, 2) }), QC.el('td', { class: 'num', text: QC.fmt(r.logp, 2) }),
      QC.el('td', null, [QC.el('button', { class: 'btn sm', onclick: () => { $('smi').value = r.smiles; $('mname').value = 'seri_' + r.sub.replace(/[^A-Za-z0-9]/g, '') ; build(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Muat')]),
    ] : [QC.el('td', { text: r.sub }), QC.el('td', { colspan: 6, html: `<span class="pill bad">tidak valid</span> <span class="mono small">${esc(r.smiles)}</span>` })])));
    t.append(tb);
  }
  $('btn-enum').onclick = enumerate;
  $('btn-enum-csv').onclick = () => {
    if (!S.enumRows.length) return QC.toast('Enumerasi dulu.');
    const h = ['substituen', 'smiles_input', 'smiles_kanonik', 'rumus', 'MW', 'logP', 'TPSA', 'valid'];
    QC.download('seri_substituen.csv', h.join(',') + '\n' + S.enumRows.map(r => [r.sub, r.smiles, r.canon || '', r.formula || '', r.mw != null ? r.mw.toFixed(3) : '', r.logp != null ? r.logp.toFixed(3) : '', r.tpsa != null ? r.tpsa.toFixed(2) : '', r.valid].map(csvq).join(',')).join('\n') + '\n', 'text/csv');
  };
  $('btn-enum-3d').onclick = async () => {
    if (!S.enumRows.length) await enumerate();
    const rows = S.enumRows.filter(r => r.valid); if (!rows.length) return;
    const btn = $('btn-enum-3d'); btn.disabled = true; const series = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        msg($('enum-msg'), `<span class="spin"></span> 3D ${i + 1}/${rows.length}: ${esc(rows[i].sub)}…`);
        await new Promise(r => setTimeout(r, 10));
        const I = await analyze(rows[i].smiles); const c = (await embedLocal(I, 1))[0];
        series.push({ name: 'seri_' + rows[i].sub.replace(/[^A-Za-z0-9]/g, '') , smiles: I.canon, charge: I.charge, mult: nElec(I.counts, I.charge) % 2 === 0 ? 1 : 2, xyz: xyzOf(c.atoms, I.canon) });
      }
      QC.store.set('series', series);
      msg($('enum-msg'), `${series.length} struktur 3D disimpan sebagai seri batch. <a href="input-builder.html#batch">Buka Input Builder → Batch</a>`, 'ok');
    } catch (e) { msg($('enum-msg'), esc(e.message), 'bad'); }
    btn.disabled = false;
  };

  /* ---------------- init ---------------- */
  (function init() {
    const cfg = dockerCfg();
    const hasBackend = !!(cfg.url && cfg.demo === false);
    $('use-backend').checked = false; $('use-backend').disabled = !hasBackend;
    $('backend-hint').textContent = hasBackend ? 'terkonfigurasi: ' + cfg.url : 'atur URL di halaman ORCA Docker (mode non-demo)';
    libList(LIB, `${LIB.length} molekul lokal`);
    const q = new URLSearchParams(location.search);
    if (q.get('smiles')) $('smi').value = q.get('smiles');
    if (q.get('name')) $('mname').value = q.get('name');
    renderSummaries();
    build();
    window.QCBuilder = { S, build, generate3D, enumerate, searchLib };
    $('btn-3d').onclick = generate3D;
  })();
  window.addEventListener('qc-theme', () => { S.v = null; if (cur()) { $('v3d').innerHTML = ''; showConf(); } });
})();
