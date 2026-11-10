/* ==========================================================================
   Quantum Chemistry Studio — common.js
   Namespace global `QC`. Dimuat oleh semua halaman SEBELUM skrip halaman.
   Isi: DOM helper, tema, navigasi, toast, storage, loader library (RDKit.js,
   3Dmol.js), konstanta & utilitas kimia (XYZ, ikatan, sudut, dihedral),
   klien API backend.
   ========================================================================== */
(function () {
  'use strict';
  const QC = (window.QC = window.QC || {});

  /* ---------------- DOM helpers ---------------- */
  QC.$ = (s, r = document) => r.querySelector(s);
  QC.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  QC.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset' && typeof v === 'object') Object.assign(e.dataset, v);
      else if ((k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') && !(k in {}) ) { e[k] = v; }
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  QC.svgEl = function (tag, attrs, ...kids) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (v != null && v !== false) e.setAttribute(k, v); }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  QC.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  QC.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  QC.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  /** Daftar warna seri grafik (mengikuti tema). */
  QC.palette = () => [1, 2, 3, 4, 5, 6].map(i => QC.cssVar('--c' + i));
  /** Panggil fn setiap kali tema berubah (untuk menggambar ulang canvas/SVG). */
  QC.onTheme = (fn) => window.addEventListener('qc-theme', fn);

  /* ---------------- Storage (aman bila diblokir) ---------------- */
  QC.store = {
    get(k, d = null) { try { const v = localStorage.getItem('qc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('qc.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('qc.' + k); } catch (e) { /* abaikan */ } },
  };
  /**
   * Handoff molekul antar-halaman (Molecular Builder -> Input Builder).
   * mol = { name, smiles, xyz (string XYZ lengkap dengan 2 baris header), sdf (molblock opsional),
   *         charge (int), mult (int), formula, mw, source ('builder'|'upload'), ts }
   */
  QC.setMolecule = (mol) => QC.store.set('molecule', Object.assign({ charge: 0, mult: 1, ts: Date.now() }, mol));
  QC.getMolecule = () => QC.store.get('molecule', null);

  /* ---------------- Tema ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    window.dispatchEvent(new Event('qc-theme'));
  }
  QC.initTheme = function () {
    let t = QC.store.get('theme');
    if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  };
  QC.toggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    QC.store.set('theme', nxt); applyTheme(nxt);
    const b = QC.$('#theme-btn'); if (b) b.textContent = nxt === 'dark' ? '☀' : '☾';
  };
  QC.initTheme(); // jalankan segera agar tidak berkedip

  /* ---------------- Navigasi & footer ---------------- */
  QC.PAGES = [
    { id: 'home', href: 'index.html', label: 'Beranda' },
    { id: 'course', href: 'course.html', label: 'Modul Kuliah' },
    { id: 'builder', href: 'molecular-builder.html', label: 'Molecular Builder' },
    { id: 'input', href: 'input-builder.html', label: 'Input Builder' },
    { id: 'analyzer', href: 'results-analyzer.html', label: 'Results Analyzer' },
    { id: 'docker', href: 'orca-docker.html', label: 'ORCA Docker' },
  ];
  /** QC.nav('course') — sisipkan header (di #site-header) dan footer (di #site-footer). */
  QC.nav = function (activeId) {
    const old = QC.$('.topnav'); if (old) old.remove();
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const nav = QC.el('header', { class: 'topnav' }, QC.el('div', { class: 'container' },
      QC.el('a', { class: 'brand', href: 'index.html' }, QC.el('span', { class: 'logo' }, 'ψ'), 'Quantum Chemistry Lab'),
      QC.el('nav', { class: 'navlinks', 'aria-label': 'Navigasi utama' },
        QC.PAGES.filter(p => p.id !== 'home').map(p => QC.el('a', { href: p.href, class: p.id === activeId ? 'active' : '', 'aria-current': p.id === activeId ? 'page' : null }, p.label))),
      QC.el('button', { class: 'iconbtn', id: 'theme-btn', title: 'Ganti tema', 'aria-label': 'Ganti tema terang/gelap', onclick: QC.toggleTheme }, dark ? '☀' : '☾')));
    document.body.prepend(nav);
    if (!QC.$('#toasts')) document.body.append(QC.el('div', { class: 'toast-wrap', id: 'toasts' }));
    let f = QC.$('#site-footer, #footer');
    if (!f) { f = QC.el('div', { id: 'site-footer' }); document.body.append(f); }
    f.replaceWith(QC.el('footer', { class: 'footer' }, QC.el('div', { class: 'container' },
      'Quantum Chemistry Lab — modul belajar & alat bantu DFT. Perhitungan kimia kuantum dijalankan di ORCA / Gaussian milik Anda sendiri; halaman ini menyiapkan input dan menganalisis output di browser. Selalu periksa input sebelum dijalankan.')));
  };

  /* ---------------- Toast ---------------- */
  QC.toast = function (msg, type = '', ms = 3500) {
    let c = QC.$('#toasts'); if (!c) { c = QC.el('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(c); }
    const t = QC.el('div', { class: 'toast ' + type }, msg); c.append(t);
    setTimeout(() => t.remove(), ms);
  };

  /* ---------------- File helpers ---------------- */
  QC.download = function (filename, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
    const a = QC.el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  QC.copy = async function (text, okMsg = 'Disalin ke clipboard') {
    try { await navigator.clipboard.writeText(text); QC.toast(okMsg, 'ok'); }
    catch (e) {
      const ta = QC.el('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); QC.toast(okMsg, 'ok'); } catch (e2) { QC.toast('Gagal menyalin', 'err'); } ta.remove();
    }
  };
  QC.readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
  /**
   * Hubungkan elemen .drop-zone ke handler. onFiles(FileList|File[]) dipanggil saat file dipilih / di-drop.
   * Struktur: <label class="drop-zone"><input type="file" multiple> teks <div class="dz-file"></div></label>
   */
  QC.dropZone = function (zone, onFiles) {
    let input = QC.$('input[type=file]', zone);
    if (!input) { input = QC.el('input', { type: 'file', multiple: true, class: 'hidden' }); zone.append(input); zone.addEventListener('click', e => { if (e.target !== input) input.click(); }); }
    const show = (files) => { const d = QC.$('.dz-file', zone); if (d) d.textContent = Array.from(files).map(f => f.name + ' (' + QC.fmtBytes(f.size) + ')').join(', '); };
    input.addEventListener('change', () => { show(input.files); onFiles(Array.from(input.files)); });
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => { const fs = Array.from(e.dataTransfer.files); show(fs); onFiles(fs); });
  };
  QC.fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB';

  /* ---------------- Tabs ---------------- */
  /** QC.tabs(containerEl, {onChange}) — tombol .tab[data-tab="id"] <-> panel .tab-panel#id */
  QC.tabs = function (root, opts = {}) {
    const tabs = QC.$$('.tab', root), panels = tabs.map(t => QC.$('#' + t.dataset.tab));
    function select(id, silent) {
      tabs.forEach((t, i) => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.classList.toggle('active', on); if (panels[i]) panels[i].classList.toggle('active', on); });
      window.dispatchEvent(new CustomEvent('qc-tab', { detail: id }));
      if (!silent && opts.onChange) opts.onChange(id);
    }
    tabs.forEach(t => t.addEventListener('click', () => select(t.dataset.tab)));
    select((tabs.find(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active')) || tabs[0]).dataset.tab, true);
    return { select };
  };

  /* ---------------- Loader library eksternal ---------------- */
  const _scripts = {};
  QC.loadScript = function (urls) {
    urls = [].concat(urls);
    const key = urls.join('|');
    if (_scripts[key]) return _scripts[key];
    _scripts[key] = (async () => {
      let lastErr;
      for (const u of urls) {
        try {
          await new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.async = true; s.onload = res; s.onerror = () => rej(new Error('gagal memuat ' + u)); document.head.append(s); });
          return u;
        } catch (e) { lastErr = e; }
      }
      delete _scripts[key]; throw lastErr;
    })();
    return _scripts[key];
  };
  QC.CDN = {
    RDKIT_VERSION: '2025.3.4-1.0.0',
    THREEDMOL: ['assets/vendor/3Dmol-min.js', 'https://cdn.jsdelivr.net/npm/3dmol@2.5.5/build/3Dmol-min.js'],
  };
  QC.load3Dmol = () => window.$3Dmol ? Promise.resolve(window.$3Dmol) : QC.loadScript(QC.CDN.THREEDMOL).then(() => window.$3Dmol);
  /** Memuat RDKit.js (WASM) satu kali; mengembalikan instance RDKit. Fallback ke assets/vendor/ bila CDN gagal. */
  let _rdkit;
  QC.loadRDKit = function () {
    if (_rdkit) return _rdkit;
    const v = QC.CDN.RDKIT_VERSION;
    const bases = ['assets/vendor/', 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2026.9.2/dist/'];
    _rdkit = (async () => {
      let lastErr;
      for (const base of bases) {
        try {
          await QC.loadScript(base + 'RDKit_minimal.js');
          const rd = await window.initRDKitModule({ locateFile: (f) => base + f });
          QC.rdkit = rd; return rd;
        } catch (e) { lastErr = e; }
      }
      _rdkit = null; throw lastErr || new Error('RDKit.js tidak dapat dimuat');
    })();
    return _rdkit;
  };

  /* ---------------- Konstanta fisika ---------------- */
  QC.const = {
    HARTREE_EV: 27.211386245988, HARTREE_KCAL: 627.5094740631, HARTREE_KJ: 2625.4996394799, HARTREE_CM: 219474.6313632,
    EV_NM: 1239.8419843320026, BOHR_ANG: 0.529177210903, EV_KCAL: 23.060548, CM_NM: 1e7,
  };
  QC.units = {
    eV2nm: e => QC.const.EV_NM / e, nm2eV: n => QC.const.EV_NM / n,
    ha2eV: h => h * QC.const.HARTREE_EV, ha2kcal: h => h * QC.const.HARTREE_KCAL,
    cm2nm: c => 1e7 / c, nm2cm: n => 1e7 / n,
  };

  /* ---------------- Tabel unsur ---------------- */
  // [simbol, Z, massa (u), radius kovalen (Å), warna CPK]
  const EL = [
    ['X', 0, 0, 0.8, '#ff00ff'], ['H', 1, 1.008, 0.31, '#ffffff'], ['He', 2, 4.0026, 0.28, '#d9ffff'], ['Li', 3, 6.94, 1.28, '#cc80ff'], ['Be', 4, 9.0122, 0.96, '#c2ff00'],
    ['B', 5, 10.81, 0.84, '#ffb5b5'], ['C', 6, 12.011, 0.76, '#909090'], ['N', 7, 14.007, 0.71, '#3050f8'], ['O', 8, 15.999, 0.66, '#ff0d0d'], ['F', 9, 18.998, 0.57, '#90e050'],
    ['Ne', 10, 20.18, 0.58, '#b3e3f5'], ['Na', 11, 22.99, 1.66, '#ab5cf2'], ['Mg', 12, 24.305, 1.41, '#8aff00'], ['Al', 13, 26.982, 1.21, '#bfa6a6'], ['Si', 14, 28.085, 1.11, '#f0c8a0'],
    ['P', 15, 30.974, 1.07, '#ff8000'], ['S', 16, 32.06, 1.05, '#ffff30'], ['Cl', 17, 35.45, 1.02, '#1ff01f'], ['Ar', 18, 39.948, 1.06, '#80d1e3'], ['K', 19, 39.098, 2.03, '#8f40d4'],
    ['Ca', 20, 40.078, 1.76, '#3dff00'], ['Sc', 21, 44.956, 1.70, '#e6e6e6'], ['Ti', 22, 47.867, 1.60, '#bfc2c7'], ['V', 23, 50.942, 1.53, '#a6a6ab'], ['Cr', 24, 51.996, 1.39, '#8a99c7'],
    ['Mn', 25, 54.938, 1.39, '#9c7ac7'], ['Fe', 26, 55.845, 1.32, '#e06633'], ['Co', 27, 58.933, 1.26, '#f090a0'], ['Ni', 28, 58.693, 1.24, '#50d050'], ['Cu', 29, 63.546, 1.32, '#c88033'],
    ['Zn', 30, 65.38, 1.22, '#7d80b0'], ['Ga', 31, 69.723, 1.22, '#c28f8f'], ['Ge', 32, 72.63, 1.20, '#668f8f'], ['As', 33, 74.922, 1.19, '#bd80e3'], ['Se', 34, 78.971, 1.20, '#ffa100'],
    ['Br', 35, 79.904, 1.20, '#a62929'], ['Kr', 36, 83.798, 1.16, '#5cb8d1'], ['Rb', 37, 85.468, 2.20, '#702eb0'], ['Sr', 38, 87.62, 1.95, '#00ff00'], ['Y', 39, 88.906, 1.90, '#94ffff'],
    ['Zr', 40, 91.224, 1.75, '#94e0e0'], ['Nb', 41, 92.906, 1.64, '#73c2c9'], ['Mo', 42, 95.95, 1.54, '#54b5b5'], ['Tc', 43, 98, 1.47, '#3b9e9e'], ['Ru', 44, 101.07, 1.46, '#248f8f'],
    ['Rh', 45, 102.91, 1.42, '#0a7d8c'], ['Pd', 46, 106.42, 1.39, '#006985'], ['Ag', 47, 107.87, 1.45, '#c0c0c0'], ['Cd', 48, 112.41, 1.44, '#ffd98f'], ['In', 49, 114.82, 1.42, '#a67573'],
    ['Sn', 50, 118.71, 1.39, '#668080'], ['Sb', 51, 121.76, 1.39, '#9e63b5'], ['Te', 52, 127.6, 1.38, '#d47a00'], ['I', 53, 126.9, 1.39, '#940094'], ['Xe', 54, 131.29, 1.40, '#429eb0'],
    ['Cs', 55, 132.91, 2.44, '#57178f'], ['Ba', 56, 137.33, 2.15, '#00c900'], ['La', 57, 138.91, 2.07, '#70d4ff'],
  ];
  // lanjutan unsur berat yang sering dipakai (Pt, Au, Hg, Pb, dll.)
  const EL2 = { 72: ['Hf', 178.49, 1.75, '#4dc2ff'], 73: ['Ta', 180.95, 1.70, '#4da6ff'], 74: ['W', 183.84, 1.62, '#2194d6'], 75: ['Re', 186.21, 1.51, '#267dab'], 76: ['Os', 190.23, 1.44, '#266696'],
    77: ['Ir', 192.22, 1.41, '#175487'], 78: ['Pt', 195.08, 1.36, '#d0d0e0'], 79: ['Au', 196.97, 1.36, '#ffd123'], 80: ['Hg', 200.59, 1.32, '#b8b8d0'], 81: ['Tl', 204.38, 1.45, '#a6544d'],
    82: ['Pb', 207.2, 1.46, '#575961'], 83: ['Bi', 208.98, 1.48, '#9e4fb5'] };
  QC.elements = EL.map(e => ({ sym: e[0], z: e[1], mass: e[2], rcov: e[3], color: e[4] }));
  Object.entries(EL2).forEach(([z, e]) => { QC.elements[+z] = { sym: e[0], z: +z, mass: e[1], rcov: e[2], color: e[3] }; });
  QC.elBySym = {}; QC.elements.forEach(e => { if (e) QC.elBySym[e.sym.toLowerCase()] = e; });
  QC.element = (x) => typeof x === 'number' ? QC.elements[x] : QC.elBySym[String(x).replace(/[^A-Za-z]/g, '').toLowerCase()];

  /* ---------------- Utilitas geometri/XYZ ---------------- */
  QC.chem = {
    /** Parse XYZ standar (baris 1 = N, baris 2 = komentar) atau daftar koordinat polos. -> [{el,x,y,z}] */
    parseXYZ(text) {
      const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter((l, i, a) => l.length || i < 2);
      let start = 0;
      if (/^\d+$/.test(lines[0] || '')) start = 2;
      const atoms = [];
      for (const l of lines.slice(start)) {
        const p = l.split(/\s+/);
        if (p.length < 4) continue;
        const x = parseFloat(p[1]), y = parseFloat(p[2]), z = parseFloat(p[3]);
        if ([x, y, z].some(isNaN)) continue;
        let sym = p[0]; if (/^\d+$/.test(sym)) { const e = QC.elements[+sym]; sym = e ? e.sym : 'X'; }
        const e = QC.element(sym); atoms.push({ el: e ? e.sym : sym, x, y, z });
      }
      return atoms;
    },
    toXYZ(atoms, comment = '') {
      return atoms.length + '\n' + comment + '\n' + atoms.map(a => a.el.padEnd(3) + [a.x, a.y, a.z].map(v => v.toFixed(6).padStart(14)).join('')).join('\n') + '\n';
    },
    formula(atoms) {
      const c = {}; atoms.forEach(a => c[a.el] = (c[a.el] || 0) + 1);
      const keys = Object.keys(c).sort((a, b) => a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? (b === 'C' ? 1 : -1) : b === 'H' ? 1 : a.localeCompare(b));
      return keys.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
    },
    mass(atoms) { return atoms.reduce((s, a) => s + ((QC.element(a.el) || {}).mass || 0), 0); },
    electrons(atoms, charge = 0) { return atoms.reduce((s, a) => s + ((QC.element(a.el) || {}).z || 0), 0) - charge; },
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    vec(a, b) { return [b.x - a.x, b.y - a.y, b.z - a.z]; },
    dot: (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2],
    cross: (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
    norm: (u) => Math.hypot(u[0], u[1], u[2]),
    /** sudut a-b-c (derajat), b = pusat */
    angle(a, b, c) { const u = this.vec(b, a), v = this.vec(b, c); const x = this.dot(u, v) / (this.norm(u) * this.norm(v)); return Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI; },
    /** dihedral a-b-c-d (derajat, -180..180) */
    dihedral(a, b, c, d) {
      const b1 = this.vec(a, b), b2 = this.vec(b, c), b3 = this.vec(c, d);
      const n1 = this.cross(b1, b2), n2 = this.cross(b2, b3);
      const m1 = this.cross(n1, b2.map(x => x / this.norm(b2)));
      const x = this.dot(n1, n2), y = this.dot(m1, n2);
      return -Math.atan2(y, x) * 180 / Math.PI;
    },
    /** Ikatan berdasarkan radius kovalen (toleransi 0.4 Å). -> [[i,j,dist]] */
    bonds(atoms, tol = 0.4) {
      const out = [];
      for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
        const ri = (QC.element(atoms[i].el) || { rcov: 0.8 }).rcov, rj = (QC.element(atoms[j].el) || { rcov: 0.8 }).rcov;
        const d = this.dist(atoms[i], atoms[j]);
        if (d > 0.4 && d < ri + rj + tol) out.push([i, j, d]);
      }
      return out;
    },
    neighbors(atoms, bonds) { const n = atoms.map(() => []); bonds.forEach(([i, j]) => { n[i].push(j); n[j].push(i); }); return n; },
    /** Gaussian-broadened spectrum: lines = [{x, y}] -> {xs, ys}. sigma dalam satuan x. */
    broaden(lines, xmin, xmax, sigma, n = 600) {
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const x = xmin + (xmax - xmin) * i / (n - 1); let y = 0;
        for (const l of lines) y += l.y * Math.exp(-0.5 * ((x - l.x) / sigma) ** 2);
        xs.push(x); ys.push(y);
      }
      return { xs, ys };
    },
  };

  /* ---------------- Format angka ---------------- */
  QC.fmt = (x, d = 4) => (x == null || isNaN(x)) ? '—' : Number(x).toFixed(d);
  QC.sci = (x, d = 2) => (x == null || isNaN(x)) ? '—' : Number(x).toExponential(d);

  /* ---------------- Backend API (FastAPI) ---------------- */
  QC.api = {
    base() { return (QC.store.get('backendUrl') || 'http://localhost:8000').replace(/\/+$/, ''); },
    setBase(u) { QC.store.set('backendUrl', u); },
    token() { return QC.store.get('apiToken') || ''; },
    setToken(t) { QC.store.set('apiToken', t); },
    headers(extra) { const h = Object.assign({}, extra); const t = this.token(); if (t) h['X-API-Token'] = t; return h; },
    async request(path, opts = {}) {
      const r = await fetch(this.base() + path, Object.assign({}, opts, { headers: this.headers(opts.headers) }));
      if (!r.ok) { let m = r.statusText; try { const j = await r.json(); m = j.detail || JSON.stringify(j); } catch (e) { /* teks biasa */ } throw new Error(r.status + ': ' + m); }
      return r;
    },
    async json(path, opts) { return (await this.request(path, opts)).json(); },
    async text(path, opts) { return (await this.request(path, opts)).text(); },
    async post(path, body) { return this.json(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); },
  };

  /* ---------------- Registrasi bagian modul kuliah ---------------- */
  // course.js memanggil QC.course.mountAll() setelah semua bagian terdaftar.
  QC.course = {
    parts: {},
    register(id, mountFn) { this.parts[id] = mountFn; },
    mount(id) { const el = document.getElementById(id); if (el && this.parts[id] && !el.dataset.mounted) { el.dataset.mounted = '1'; this.parts[id](el); } },
    mountAll() { Object.keys(this.parts).forEach(id => this.mount(id)); },
  };


  /* ---------------- Shim kompatibilitas (dipakai course.js, charts, results) ---------------- */
  QC.css = (name) => QC.cssVar(name);
  QC.HC_EV_NM = QC.const.EV_NM;
  /** QC.canvas(cv, W, H) — set ukuran logis W×H dgn skala devicePixelRatio; kembalikan {ctx, W, H}. */
  QC.canvas = function (cv, W, H) {
    const r = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * r); cv.height = Math.round(H * r);
    cv.style.aspectRatio = W + ' / ' + H; cv.style.width = '100%'; cv.style.height = 'auto';
    const ctx = cv.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0);
    return { ctx, W, H };
  };
  /** QC.table(headers, rows, numCols[]) → string HTML tabel. Sel berisi HTML (jangan memasukkan input pengguna mentah). */
  QC.table = function (heads, rows, numCols) {
    numCols = numCols || [];
    const cls = i => numCols.indexOf(i) >= 0 ? ' class="num"' : '';
    return '<div class="table-wrap"><table class="data"><thead><tr>' + heads.map((h, i) => '<th' + cls(i) + '>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + r.map((c, i) => '<td' + cls(i) + '>' + (c == null ? '—' : c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  };
  /** Unduh SVG/canvas sebagai file. */
  QC.downloadCanvas = (cv, name) => cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); });
  QC.downloadSVG = (svg, name) => QC.download(name, '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg), 'image/svg+xml');
  QC.dispatchTheme = () => window.dispatchEvent(new Event('qc-theme'));


  /* ---------------- Shim API (menyatukan modul dari beberapa sesi) ---------------- */
  QC.esc = QC.escapeHtml;
  QC.dropzone = QC.dropZone; QC.copyText = QC.copy;
  QC.escHtml = QC.escapeHtml;
  // QC.palette dipakai sebagai fungsi () maupun array [i]
  (function () {
    const f = () => [1, 2, 3, 4, 5, 6].map(i => QC.cssVar('--c' + i));
    for (let i = 0; i < 6; i++) f[i] = 'var(--c' + (i + 1) + ')';
    f.length_ = 6; QC.palette = f;
  })();
  QC.ELEMENTS = QC.ELEMENTS || QC.elements;
  QC.HARTREE_EV = QC.const.HARTREE_EV;
  QC.showTab = (id) => { const b = document.querySelector('.tab[data-tab="' + id + '"]'); if (b) b.click(); };
  /** QC.chart(idAtauElemen, opsi) → {set(opsi), update, destroy, opts, el} berbasis QPlot.chart. */
  QC.chart = function (target, opts) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) throw new Error('QC.chart: wadah tidak ditemukan: ' + target);
    if (!window.QPlot) throw new Error('QC.chart: plot.js belum dimuat');
    const ch = window.QPlot.chart(host, opts || {});
    return { el: host, get opts() { return ch.opts; }, set(o) { ch.update(o); }, update(o) { ch.update(o); }, redraw: ch.redraw, destroy: ch.destroy };
  };
  /** Tombol unduh SVG / PNG / CSV di bawah grafik. */
  QC.chartTools = function (container, ch, name) {
    name = name || 'grafik';
    const bar = QC.el('div', { class: 'charttools' });
    const svgOf = () => container.querySelector('svg');
    const svgText = () => { const s = svgOf().cloneNode(true); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); const cs = getComputedStyle(document.documentElement); s.style.background = cs.getPropertyValue('--surface') || '#fff'; return new XMLSerializer().serializeToString(s); };
    bar.append(
      QC.el('button', { class: 'btn btn-sm', type: 'button', onclick: () => QC.download(name + '.svg', svgText(), 'image/svg+xml') }, 'SVG'),
      QC.el('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
        const s = svgOf(), w = s.clientWidth || 600, h = s.clientHeight || 340, img = new Image();
        img.onload = () => { const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; const x = cv.getContext('2d'); x.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); QC.downloadCanvas(cv, name + '.png'); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText());
      } }, 'PNG'),
      QC.el('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
        const ser = (ch && ch.opts && ch.opts.series) || []; let t = '';
        ser.forEach((s, i) => { t += '# ' + (s.name || s.label || 'seri ' + (i + 1)) + '\nx,y\n' + s.x.map((x, j) => x + ',' + s.y[j]).join('\n') + '\n'; });
        QC.download(name + '.csv', t, 'text/csv');
      } }, 'CSV'));
    container.after(bar); return bar;
  };
  // tema: kirim juga event 'qcl-theme' (dipakai plot.js lama)
  window.addEventListener('qc-theme', () => window.dispatchEvent(new Event('qcl-theme')));


  /* --- API tambahan: elemen per simbol, viewer 3D, nav by-filename, tabs by-id --- */
  QC.ELEMENTS = {}; QC.elements.forEach(e => { if (e) QC.ELEMENTS[e.sym] = e; });
  const _nav = QC.nav;
  QC.nav = function (a) { const p = QC.PAGES.find(x => x.id === a || x.href === a); return _nav(p ? p.id : a); };
  const _tabs = QC.tabs;
  QC.tabs = function (root, opts) { if (typeof root === 'string') root = document.getElementById(root); return _tabs(root, opts); };
  QC.viewer = async function (host, opts) {
    const $3 = await QC.load3Dmol();
    const bg = (opts && opts.bg) || (host.classList.contains('light') ? '#ffffff' : '#0f1d2e');
    return $3.createViewer(host, { backgroundColor: bg, antialias: true });
  };
  QC.STYLES = {
    ballstick: { stick: { radius: 0.15 }, sphere: { scale: 0.27 } }, stick: { stick: { radius: 0.18 } },
    sphere: { sphere: { scale: 0.8 } }, line: { line: {} }, sticks: { stick: { radius: 0.18 } }, spheres: { sphere: { scale: 0.8 } }, lines: { line: {} }, ball: { sphere: { scale: 0.35 }, stick: { radius: 0.12 } },
  };
  QC.showXYZ = function (v, xyz, style) {
    v.removeAllModels(); v.addModel(xyz, 'xyz'); v.setStyle({}, QC.STYLES[style] || QC.STYLES.ballstick); v.zoomTo(); v.render();
  };

  /* ---------------- Auto init ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const a = document.body.dataset.page;
    if (a) QC.nav(a);
  });
})();
