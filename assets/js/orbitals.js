/* ==========================================================================
   orbitals.js — evaluasi orbital molekul → file CUBE (untuk 3Dmol)
   Masukan : Molden (.molden/.molden.input dari orca_2mkl -molden), Gaussian .fchk
             (formchk dari .chk), atau .cube (hanya di-parse).
   Keluaran: teks CUBE satu MO.  Browser: window.QC.orbitals · Node: module.exports.

   API
     load(files:[{name,text}])  → model
        model = { kind:'molden'|'fchk'|'cube', atoms:[{el,x,y,z}] (Å),
                  mos:[{index,n,energyEh,occ,spin,sym,label}], homo, lumo, nbf, ... }
        • mos[].index = posisi global di model.mos;  n = indeks 0-based dalam spin-nya.
        • homo / lumo = indeks global (spin alpha; bila tak ada alpha, spin pertama).
        • cube: model.cube = hasil parseCube, model.cubeText = teks asli (mos kosong).
     cubeFor(model, moIndex, {spacing=0.25 Å, padding=4 Å, spin, maxPoints=1.2e6}, onProgress)
        → Promise<string>.  Bila opts.spin diberikan ('alpha'|'beta'), moIndex = indeks dalam
          spin tsb (mos[].n); bila tidak, moIndex = indeks global.
     parseCube(text) → {atoms(Å), origin(Bohr), nx,ny,nz, step[3][3](Bohr), data(Float64Array)}
     parseMolden(text), parseFchk(text)
     evalPoints(model, moIndex, pts[[x,y,z] Å], opts) → Float64Array
     gridValues(model, moIndex, opts, onProgress) → Promise<{data,nx,ny,nz,origin,step,atoms}>
     integrateSquare(grid) → ∫ψ² dV (bohr³) ; integrateProduct(g1,g2)

   Konvensi fungsi basis (penting)
     • Sferis: harmonik padat riil, urutan m = 0,+1,−1,+2,−2,… (Molden = Gaussian = ORCA);
       m>0 ∝ cos(mφ) (mis. d+1 ∝ xz, d−1 ∝ yz, d+2 ∝ x²−y², d−2 ∝ xy), tanpa fase Condon–Shortley.
     • Kartesius: d = xx,yy,zz,xy,xz,yz ; f = xxx,yyy,zzz,xyy,xxy,xxz,xzz,yzz,yyz,xyz ;
       g = xxxx,yyyy,zzzz,xxxy,xxxz,yyyx,yyyz,zzzx,zzzy,xxyy,xxzz,yyzz,xxyz,yyxz,zzxy.
       Semua komponen Kartesius memakai faktor normalisasi komponen (L,0,0) (konvensi
       Molden/Gaussian/ORCA: xy, xz, … TIDAK ternormalisasi satuan sendiri).
     • Koefisien kontraksi dianggap untuk primitif ternormalisasi; fungsi terkontraksi
       dinormalkan ulang (aman bila file sudah ternormalisasi).
   ========================================================================== */
(function (root) {
  'use strict';

  const BOHR = 0.529177210903;
  const ZSYM = ['X', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'];
  const SYM2Z = {}; ZSYM.forEach((s, i) => { SYM2Z[s.toUpperCase()] = i; });
  const LCHAR = { s: 0, p: 1, d: 2, f: 3, g: 4 };

  const num = s => parseFloat(String(s).replace(/[dD]/, 'e'));
  const capSym = s => { s = s.replace(/[^A-Za-z]/g, ''); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : 'X'; };
  const nextTick = () => new Promise(r => setTimeout(r, 0));

  /* ---------------- fungsi khusus ---------------- */
  function gammaHalf(l) { // Γ(l+3/2)
    let g = Math.sqrt(Math.PI) / 2; for (let k = 1; k <= l; k++) g *= (k + 0.5); return g;
  }
  function dfact(n) { let r = 1; for (let k = n; k > 1; k -= 2) r *= k; return r; } // n!!
  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];

  // faktor normalisasi sudut harmonik riil ortonormal N_lm
  const NLM = [];
  for (let l = 0; l <= 4; l++) {
    NLM[l] = [];
    for (let m = 0; m <= l; m++) NLM[l][m] = Math.sqrt((2 * l + 1) / (4 * Math.PI) * FACT[l - m] / FACT[l + m]) * (m > 0 ? Math.SQRT2 : 1);
  }

  // urutan monomial Kartesius (lx,ly,lz)
  function monoList(l) {
    const S = { 0: ['s'], 1: ['x', 'y', 'z'], 2: ['xx', 'yy', 'zz', 'xy', 'xz', 'yz'], 3: ['xxx', 'yyy', 'zzz', 'xyy', 'xxy', 'xxz', 'xzz', 'yzz', 'yyz', 'xyz'], 4: ['xxxx', 'yyyy', 'zzzz', 'xxxy', 'xxxz', 'yyyx', 'yyyz', 'zzzx', 'zzzy', 'xxyy', 'xxzz', 'yyzz', 'xxyz', 'yyxz', 'zzxy'] }[l];
    return S.map(s => s === 's' ? [0, 0, 0] : [(s.match(/x/g) || []).length, (s.match(/y/g) || []).length, (s.match(/z/g) || []).length]);
  }
  const MONO = [0, 1, 2, 3, 4].map(monoList);
  const NF_PURE = l => 2 * l + 1, NF_CART = l => (l + 1) * (l + 2) / 2;

  const _A = new Float64Array(6), _B = new Float64Array(6), _P = new Float64Array(6);
  // harmonik padat riil ternormalisasi (r^l Y_lm), urutan m=0,+1,-1,+2,-2,...
  function solid(l, x, y, z, out, o) {
    if (l === 0) { out[o] = NLM[0][0]; return; }
    const r2 = x * x + y * y + z * z;
    _A[0] = 1; _B[0] = 0;
    for (let m = 1; m <= l; m++) { _A[m] = _A[m - 1] * x - _B[m - 1] * y; _B[m] = _A[m - 1] * y + _B[m - 1] * x; }
    out[o] = NLM[l][0] * plm(l, 0, z, r2);
    for (let m = 1; m <= l; m++) {
      const p = NLM[l][m] * plm(l, m, z, r2);
      out[o + 2 * m - 1] = p * _A[m];
      out[o + 2 * m] = p * _B[m];
    }
  }
  function plm(l, m, z, r2) { // Π_l^m(z,r²) tanpa fase CS
    let pmm = dfact(2 * m - 1);
    if (l === m) return pmm;
    let pm1 = (2 * m + 1) * z * pmm;
    if (l === m + 1) return pm1;
    let pl = 0;
    for (let ll = m + 2; ll <= l; ll++) { pl = ((2 * ll - 1) * z * pm1 - (ll + m - 1) * r2 * pmm) / (ll - m); pmm = pm1; pm1 = pl; }
    return pl;
  }

  /* ---------------- basis terpadu ----------------
     shell: {atom, l, pure, exps[], coefs[] (sudah mengandung N_primitif × normalisasi kontraksi),
             amin, offset, nf}                                                  */
  function finalizeShell(sh) {
    const l = sh.l, n = sh.exps.length;
    const Np = sh.exps.map(a => sh.pure
      ? Math.sqrt(2 * Math.pow(2 * a, l + 1.5) / gammaHalf(l))
      : Math.pow(2 * a / Math.PI, 0.75) * Math.pow(4 * a, l / 2) / Math.sqrt(dfact(2 * l - 1)));
    let S = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const s = sh.exps[i] + sh.exps[j];
      const ov = sh.pure ? gammaHalf(l) / (2 * Math.pow(s, l + 1.5)) : dfact(2 * l - 1) * Math.pow(Math.PI, 1.5) / (Math.pow(2, l) * Math.pow(s, l + 1.5));
      S += sh.coefs[i] * sh.coefs[j] * Np[i] * Np[j] * ov;
    }
    const sc = 1 / Math.sqrt(S);
    sh.cn = sh.coefs.map((c, i) => c * Np[i] * sc);
    sh.amin = Math.min.apply(null, sh.exps);
    sh.nf = sh.pure ? NF_PURE(l) : NF_CART(l);
    return sh;
  }
  function buildBasis(shells) {
    let off = 0;
    shells.forEach(sh => { finalizeShell(sh); sh.offset = off; off += sh.nf; });
    return { shells, nbf: off };
  }

  /* ---------------- parse Molden ---------------- */
  function parseMolden(text) {
    const L = text.replace(/\r/g, '').split('\n');
    let i = 0;
    const atoms = []; let unitAU = false;
    const flags = { d: false, f: false, g: false };
    const gto = {};       // atomIdx(1-based) → [{l,exps,coefs}]
    const mos = [];
    while (i < L.length) {
      const line = L[i].trim(); i++;
      const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!m) continue;
      const tag = m[1].toLowerCase().replace(/\s+/g, ''), rest = m[2] || '';
      if (tag === 'atoms') {
        unitAU = /au|bohr/i.test(rest) && !/ang/i.test(rest);
        while (i < L.length && !/^\s*\[/.test(L[i]) && L[i].trim() !== '') {
          const p = L[i].trim().split(/\s+/); i++;
          if (p.length < 6) continue;
          const z = parseInt(p[2], 10);
          const el = z > 0 && z < ZSYM.length ? ZSYM[z] : capSym(p[0]);
          let x = num(p[3]), y = num(p[4]), zz = num(p[5]);
          if (unitAU) { x *= BOHR; y *= BOHR; zz *= BOHR; }
          atoms.push({ el, x, y, z: zz, Z: z });
        }
      } else if (tag === 'gto') {
        while (i < L.length && !/^\s*\[/.test(L[i])) {
          const hd = L[i].trim().split(/\s+/);
          if (hd.length >= 1 && /^\d+$/.test(hd[0]) && (hd.length === 1 || /^\d+$/.test(hd[1]))) {
            const ai = parseInt(hd[0], 10); i++;
            const list = gto[ai] = gto[ai] || [];
            while (i < L.length && L[i].trim() !== '' && !/^\s*\[/.test(L[i])) {
              const s = L[i].trim().split(/\s+/); i++;
              const typ = s[0].toLowerCase(); const np = parseInt(s[1], 10);
              const ex = [], c1 = [], c2 = [];
              for (let k = 0; k < np; k++) {
                const q = L[i].trim().split(/\s+/); i++;
                ex.push(num(q[0])); c1.push(num(q[1])); if (q.length > 2) c2.push(num(q[2]));
              }
              if (typ === 'sp') { list.push({ l: 0, exps: ex, coefs: c1 }); list.push({ l: 1, exps: ex.slice(), coefs: c2 }); }
              else if (LCHAR[typ] != null) list.push({ l: LCHAR[typ], exps: ex, coefs: c1 });
              else throw new Error('Tipe shell Molden tidak dikenal: ' + typ);
            }
          } else i++;
        }
      } else if (tag === '5d' || tag === '5d7f') { flags.d = true; if (tag === '5d7f') flags.f = true; }
      else if (tag === '5d10f') { flags.d = true; }
      else if (tag === '7f') flags.f = true;
      else if (tag === '9g') flags.g = true;
      else if (tag === 'mo') {
        let cur = null;
        while (i < L.length && !/^\s*\[/.test(L[i])) {
          const s = L[i].trim(); i++;
          if (!s) continue;
          let mm;
          if ((mm = s.match(/^Sym\s*=\s*(\S+)/i))) { cur = { sym: mm[1], energyEh: 0, spin: 'alpha', occ: 0, c: [] }; mos.push(cur); }
          else if (!cur) continue;
          else if ((mm = s.match(/^Ene\s*=\s*(\S+)/i))) cur.energyEh = num(mm[1]);
          else if ((mm = s.match(/^Spin\s*=\s*(\S+)/i))) cur.spin = /^b/i.test(mm[1]) ? 'beta' : 'alpha';
          else if ((mm = s.match(/^Occup\s*=\s*(\S+)/i))) cur.occ = num(mm[1]);
          else { const q = s.split(/\s+/); if (q.length >= 2 && /^\d+$/.test(q[0])) cur.c.push([parseInt(q[0], 10) - 1, num(q[1])]); }
        }
        i--;
      }
    }
    if (!atoms.length) throw new Error('Molden: blok [Atoms] tidak ditemukan');
    if (!mos.length) throw new Error('Molden: blok [MO] tidak ditemukan');
    // shell → basis (Bohr)
    const shells = [];
    atoms.forEach((a, k) => {
      (gto[k + 1] || []).forEach(g => {
        const pure = g.l <= 1 ? false : (g.l === 2 ? flags.d : g.l === 3 ? flags.f : flags.g);
        shells.push({ atom: k, l: g.l, pure, exps: g.exps, coefs: g.coefs });
      });
    });
    const basis = buildBasis(shells);
    mos.forEach(m => { const v = new Float64Array(basis.nbf); m.c.forEach(([ix, val]) => { if (ix < basis.nbf) v[ix] = val; }); m.vec = v; delete m.c; });
    return { kind: 'molden', atoms, basis, mos: mos.map(m => ({ energyEh: m.energyEh, occ: m.occ, spin: m.spin, sym: m.sym, vec: m.vec })), flags };
  }

  /* ---------------- parse fchk ---------------- */
  function parseFchk(text) {
    const L = text.replace(/\r/g, '').split('\n');
    const S = {};
    let i = 2;
    while (i < L.length) {
      const line = L[i];
      const m = line.match(/^(.{1,43}?)\s+([IRC])\s+(N=\s*(\d+)|(\S+))\s*$/);
      if (!m) { i++; continue; }
      const name = m[1].trim(); const type = m[2];
      if (m[4] !== undefined) {
        const n = parseInt(m[4], 10); i++;
        const vals = [];
        if (type === 'C') { const t = []; while (t.length * 12 < n && i < L.length) { t.push(L[i]); i++; } S[name] = t.join(''); continue; }
        while (vals.length < n && i < L.length) {
          const toks = L[i].trim().split(/\s+/); i++;
          for (const t of toks) if (t !== '') vals.push(type === 'I' ? parseInt(t, 10) : num(t));
        }
        S[name] = vals;
      } else { S[name] = type === 'C' ? m[5] : (type === 'I' ? parseInt(m[5], 10) : num(m[5])); i++; }
    }
    const need = n => { if (!S[n]) throw new Error('fchk: bagian "' + n + '" tidak ada'); return S[n]; };
    const Zs = need('Atomic numbers'), xyz = need('Current cartesian coordinates');
    const atoms = Zs.map((z, k) => ({ el: ZSYM[z] || 'X', Z: z, x: xyz[3 * k] * BOHR, y: xyz[3 * k + 1] * BOHR, z: xyz[3 * k + 2] * BOHR }));
    const st = need('Shell types'), npr = need('Number of primitives per shell'), s2a = need('Shell to atom map');
    const ex = need('Primitive exponents'), cc = need('Contraction coefficients'), cp = S['P(S=P) Contraction coefficients'];
    const shells = []; let p = 0;
    st.forEach((t, k) => {
      const n = npr[k], e = ex.slice(p, p + n), c = cc.slice(p, p + n), c2 = cp ? cp.slice(p, p + n) : null;
      p += n; const atom = s2a[k] - 1;
      if (t === -1) { shells.push({ atom, l: 0, pure: false, exps: e, coefs: c }); shells.push({ atom, l: 1, pure: false, exps: e.slice(), coefs: c2 }); }
      else { const l = Math.abs(t); shells.push({ atom, l, pure: t < -1, exps: e, coefs: c }); }
    });
    const basis = buildBasis(shells);
    const nbf = S['Number of basis functions'];
    if (nbf != null && nbf !== basis.nbf) throw new Error('fchk: jumlah fungsi basis tak cocok (' + nbf + ' vs ' + basis.nbf + ')');
    const nalpha = S['Number of alpha electrons'], nbeta = S['Number of beta electrons'];
    const mos = [];
    ['Alpha', 'Beta'].forEach(sp => {
      const E = S[sp + ' Orbital Energies'], C = S[sp + ' MO coefficients'];
      if (!E || !C) return;
      const nmo = E.length;
      if (C.length !== nmo * basis.nbf) throw new Error('fchk: ukuran koefisien MO ' + sp + ' tak cocok');
      const ne = sp === 'Alpha' ? nalpha : nbeta;
      for (let k = 0; k < nmo; k++) mos.push({ energyEh: E[k], occ: k < ne ? 1 : 0, spin: sp.toLowerCase(), sym: '', vec: Float64Array.from(C.slice(k * basis.nbf, (k + 1) * basis.nbf)) });
    });
    if (!mos.length) throw new Error('fchk: koefisien MO tidak ditemukan');
    return { kind: 'fchk', atoms, basis, mos, restricted: !S['Beta Orbital Energies'], charge: S['Charge'], mult: S['Multiplicity'] };
  }

  /* ---------------- parse cube ---------------- */
  function parseCube(text) {
    const L = text.replace(/\r/g, '').split('\n');
    let p = 2;
    let t = L[p++].trim().split(/\s+/);
    let na = parseInt(t[0], 10); const origin = [num(t[1]), num(t[2]), num(t[3])];
    const hasOrb = na < 0; na = Math.abs(na);
    const dims = [], step = [];
    for (let k = 0; k < 3; k++) { t = L[p++].trim().split(/\s+/); dims.push(parseInt(t[0], 10)); step.push([num(t[1]), num(t[2]), num(t[3])]); }
    // satuan Angstrom bila jumlah titik negatif (jarang) → konversi ke Bohr
    const ang = dims.some(d => d < 0);
    const nx = Math.abs(dims[0]), ny = Math.abs(dims[1]), nz = Math.abs(dims[2]);
    if (ang) { for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) step[k][c] /= BOHR; for (let c = 0; c < 3; c++) origin[c] /= BOHR; }
    const atoms = [];
    for (let k = 0; k < na; k++) {
      t = L[p++].trim().split(/\s+/); const z = parseInt(t[0], 10);
      atoms.push({ el: ZSYM[z] || 'X', Z: z, x: num(t[2]) * BOHR, y: num(t[3]) * BOHR, z: num(t[4]) * BOHR });
    }
    if (hasOrb) p++;
    const n = nx * ny * nz, data = new Float64Array(n); let q = 0;
    while (q < n && p < L.length) { const tk = L[p++].trim(); if (!tk) continue; const v = tk.split(/\s+/); for (let k = 0; k < v.length && q < n; k++) data[q++] = num(v[k]); }
    if (q < n) throw new Error('Cube: data kurang (' + q + '/' + n + ')');
    return { atoms, origin, nx, ny, nz, step, data };
  }

  /* ---------------- load ---------------- */
  function labelMOs(model) {
    const mos = model.mos;
    const spins = [...new Set(mos.map(m => m.spin))];
    spins.forEach(sp => {
      const list = mos.filter(m => m.spin === sp);
      list.forEach((m, n) => { m.n = n; });
      let homoN = -1;
      list.forEach((m, n) => { if (m.occ > 1e-6) homoN = n; });
      list.forEach((m, n) => {
        const d = n - homoN; const tag = spins.length > 1 ? (sp === 'alpha' ? 'α ' : 'β ') : '';
        m.label = tag + (d <= 0 ? (d === 0 ? 'HOMO' : 'HOMO' + d) : (d === 1 ? 'LUMO' : 'LUMO+' + (d - 1)));
        if (homoN < 0) m.label = tag + 'MO' + n;
      });
    });
    mos.forEach((m, k) => { m.index = k; });
    const first = spins.includes('alpha') ? 'alpha' : spins[0];
    const list = mos.filter(m => m.spin === first);
    let h = -1; list.forEach((m, n) => { if (m.occ > 1e-6) h = n; });
    model.homo = h >= 0 ? list[h].index : -1;
    model.lumo = h + 1 < list.length ? list[h + 1].index : -1;
    model.nbf = model.basis.nbf;
    model.unrestricted = spins.length > 1;
    return model;
  }

  function load(files) {
    if (!Array.isArray(files)) files = [files];
    const errs = [];
    // prioritas: molden, fchk, cube
    const kindOf = f => {
      const n = (f.name || '').toLowerCase(), t = f.text || '';
      if (/\.(molden|molden\.input)$/.test(n) || /^\s*\[Molden Format\]/i.test(t) || /\[MO\]/i.test(t) && /\[GTO\]/i.test(t)) return 'molden';
      if (/\.fch(k)?$/.test(n) || /Number of basis functions\s+I/.test(t)) return 'fchk';
      if (/\.cub(e)?$/.test(n)) return 'cube';
      return null;
    };
    const order = { molden: 0, fchk: 1, cube: 2 };
    const cand = files.map(f => ({ f, k: kindOf(f) })).filter(x => x.k).sort((a, b) => order[a.k] - order[b.k]);
    if (!cand.length) throw new Error('Tidak ada berkas orbital yang dikenali (.molden / .fchk / .cube)');
    for (const { f, k } of cand) {
      try {
        if (k === 'molden') return labelMOs(parseMolden(f.text));
        if (k === 'fchk') return labelMOs(parseFchk(f.text));
        const cube = parseCube(f.text);
        return { kind: 'cube', atoms: cube.atoms, mos: [], homo: -1, lumo: -1, cube, cubeText: f.text, name: f.name, nbf: 0 };
      } catch (e) { errs.push((f.name || k) + ': ' + e.message); }
    }
    throw new Error(errs.join('; '));
  }

  /* ---------------- evaluasi ---------------- */
  function pickMO(model, moIndex, spin) {
    if (spin) { const m = model.mos.find(q => q.spin === spin && q.n === moIndex); if (!m) throw new Error('MO ' + spin + ' #' + moIndex + ' tidak ada'); return m; }
    const m = model.mos[moIndex]; if (!m) throw new Error('MO #' + moIndex + ' tidak ada'); return m;
  }
  const _buf = new Float64Array(16);

  // nilai MO di satu titik (Bohr). shellData: atom centre dalam Bohr
  function makeEvaluator(model, mo) {
    const sh = model.basis.shells;
    const cen = model.atoms.map(a => [a.x / BOHR, a.y / BOHR, a.z / BOHR]);
    // buang shell dengan koefisien MO ~ 0
    const act = [];
    sh.forEach(s => {
      let mx = 0; for (let k = 0; k < s.nf; k++) mx = Math.max(mx, Math.abs(mo.vec[s.offset + k]));
      if (mx > 1e-10) act.push(s);
    });
    const vec = mo.vec;
    return function (X, Y, Z) {
      let val = 0;
      for (let q = 0; q < act.length; q++) {
        const s = act[q], c = cen[s.atom];
        const dx = X - c[0], dy = Y - c[1], dz = Z - c[2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (s.amin * r2 > 27) continue;
        let R = 0; const ex = s.exps, cn = s.cn;
        for (let p = 0; p < ex.length; p++) R += cn[p] * Math.exp(-ex[p] * r2);
        const o = s.offset;
        if (s.l === 0) val += vec[o] * R * NLM[0][0] * (s.pure ? 1 : 1 / NLM[0][0]);
        else if (s.pure) { solid(s.l, dx, dy, dz, _buf, 0); for (let k = 0; k < s.nf; k++) val += vec[o + k] * R * _buf[k]; }
        else if (s.l === 1) { val += R * (vec[o] * dx + vec[o + 1] * dy + vec[o + 2] * dz); }
        else {
          const mono = MONO[s.l];
          for (let k = 0; k < s.nf; k++) {
            const m = mono[k]; const cf = vec[o + k]; if (cf === 0) continue;
            val += cf * R * pw(dx, m[0]) * pw(dy, m[1]) * pw(dz, m[2]);
          }
        }
      }
      return val;
    };
  }
  function pw(x, n) { return n === 0 ? 1 : n === 1 ? x : n === 2 ? x * x : n === 3 ? x * x * x : x * x * x * x; }

  function evalPoints(model, moIndex, pts, opts) {
    opts = opts || {};
    if (model.kind === 'cube') throw new Error('evalPoints tidak tersedia untuk model cube');
    const f = makeEvaluator(model, pickMO(model, moIndex, opts.spin));
    const out = new Float64Array(pts.length);
    for (let k = 0; k < pts.length; k++) out[k] = f(pts[k][0] / BOHR, pts[k][1] / BOHR, pts[k][2] / BOHR);
    return out;
  }

  async function gridValues(model, moIndex, opts, onProgress) {
    opts = opts || {};
    const mo = pickMO(model, moIndex, opts.spin);
    const pad = (opts.padding != null ? opts.padding : 4) / BOHR;
    let h = (opts.spacing != null ? opts.spacing : 0.25) / BOHR;
    const maxPoints = opts.maxPoints || 1.2e6;
    const A = model.atoms.map(a => [a.x / BOHR, a.y / BOHR, a.z / BOHR]);
    const lo = [0, 1, 2].map(c => Math.min.apply(null, A.map(a => a[c])) - pad);
    const hi = [0, 1, 2].map(c => Math.max.apply(null, A.map(a => a[c])) + pad);
    const dimsFor = hh => [0, 1, 2].map(c => Math.floor((hi[c] - lo[c]) / hh) + 1);
    let d = dimsFor(h);
    while (d[0] * d[1] * d[2] > maxPoints) { h *= 1.05; d = dimsFor(h); }
    const [nx, ny, nz] = d;
    const f = makeEvaluator(model, mo);
    const data = new Float64Array(nx * ny * nz);
    let idx = 0, t0 = Date.now();
    for (let i = 0; i < nx; i++) {
      const x = lo[0] + i * h;
      for (let j = 0; j < ny; j++) {
        const y = lo[1] + j * h;
        for (let k = 0; k < nz; k++) data[idx++] = f(x, y, lo[2] + k * h);
      }
      if (Date.now() - t0 > 40) { t0 = Date.now(); if (onProgress) onProgress((i + 1) / nx); await nextTick(); }
    }
    if (onProgress) onProgress(1);
    return { data, nx, ny, nz, origin: lo, step: [[h, 0, 0], [0, h, 0], [0, 0, h]], atoms: model.atoms };
  }

  function cubeText(g, title) {
    const out = [];
    out.push(title || 'Orbital (QC orbitals.js)'); out.push('Outer loop x, middle y, inner z; Bohr');
    out.push(pad(g.atoms.length, 5) + g.origin.map(v => fnum(v, 12, 6)).join(''));
    out.push(pad(g.nx, 5) + g.step[0].map(v => fnum(v, 12, 6)).join(''));
    out.push(pad(g.ny, 5) + g.step[1].map(v => fnum(v, 12, 6)).join(''));
    out.push(pad(g.nz, 5) + g.step[2].map(v => fnum(v, 12, 6)).join(''));
    g.atoms.forEach(a => { const z = a.Z || SYM2Z[(a.el || '').toUpperCase()] || 0; out.push(pad(z, 5) + fnum(z, 12, 6) + fnum(a.x / BOHR, 12, 6) + fnum(a.y / BOHR, 12, 6) + fnum(a.z / BOHR, 12, 6)); });
    const n = g.data.length; let line = [];
    for (let q = 0; q < n; q++) {
      line.push(expo(g.data[q]));
      if (line.length === 6 || (q + 1) % g.nz === 0) { out.push(line.join('')); line = []; }
    }
    if (line.length) out.push(line.join(''));
    return out.join('\n') + '\n';
  }
  function pad(v, w) { return String(v).padStart(w); }
  function fnum(v, w, d) { return v.toFixed(d).padStart(w); }
  function expo(v) { return (Math.abs(v) < 1e-99 ? 0 : v).toExponential(5).replace(/e([+-])(\d)$/, 'e$10$2').toUpperCase().padStart(13); }

  async function cubeFor(model, moIndex, opts, onProgress) {
    if (model.kind === 'cube') return model.cubeText;
    opts = opts || {};
    const mo = pickMO(model, moIndex, opts.spin);
    const g = await gridValues(model, moIndex, opts, onProgress);
    return cubeText(g, 'MO ' + mo.index + ' ' + (mo.label || '') + ' ' + mo.spin + ' E=' + mo.energyEh + ' Eh');
  }

  function integrateSquare(g) {
    const dv = Math.abs(g.step[0][0] * g.step[1][1] * g.step[2][2]); let s = 0;
    for (let i = 0; i < g.data.length; i++) s += g.data[i] * g.data[i];
    return s * dv;
  }
  function integrateProduct(a, b) {
    const dv = Math.abs(a.step[0][0] * a.step[1][1] * a.step[2][2]); let s = 0;
    for (let i = 0; i < a.data.length; i++) s += a.data[i] * b.data[i];
    return s * dv;
  }

  const api = { load, parseMolden, parseFchk, parseCube, cubeFor, gridValues, evalPoints, cubeText, integrateSquare, integrateProduct, BOHR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.QC = window.QC || {}; window.QC.orbitals = api; }
})(typeof self !== 'undefined' ? self : this);
