/* ==========================================================================
   Input Builder ORCA & Gaussian — inputbuilder.js
   Bagian 1: generator murni (window.InputGen) — dapat diuji tanpa DOM.
   Bagian 2: antarmuka (hanya bila document tersedia).
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     BAGIAN 1 — GENERATOR
     ====================================================================== */
  const InputGen = {};
  const ELZ = { H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10, Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20, Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30, Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40, Nb: 41, Mo: 42, Tc: 43, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50, Sb: 51, Te: 52, I: 53, Xe: 54, Cs: 55, Ba: 56, La: 57, Hf: 72, Ta: 73, W: 74, Re: 75, Os: 76, Ir: 77, Pt: 78, Au: 79, Hg: 80, Tl: 81, Pb: 82, Bi: 83 };
  const zOf = (el) => ELZ[el] || 0;
  const MASS = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.9, P: 30.974, Si: 28.085, B: 10.81, Li: 6.94, Na: 22.99 };

  /* ---------- Tabel metode ---------- */
  // kind: pure | hybrid | dh (double hybrid) | hf | mp2 | cc | 3c
  const ORCA_METHODS = [
    { id: 'B3LYP', kind: 'hybrid' }, { id: 'PBE0', kind: 'hybrid' }, { id: 'BP86', kind: 'pure' }, { id: 'PBE', kind: 'pure' }, { id: 'TPSS', kind: 'pure' },
    { id: 'M062X', label: 'M06-2X', kind: 'hybrid', nodisp: true, grid3: true }, { id: 'wB97X-D3', label: 'ωB97X-D3', kind: 'hybrid', nodisp: true },
    { id: 'wB97X-D3BJ', label: 'ωB97X-D3BJ', kind: 'hybrid', nodisp: true }, { id: 'wB97M-V', label: 'ωB97M-V', kind: 'hybrid', nodisp: true, v6note: false },
    { id: 'CAM-B3LYP', kind: 'hybrid' }, { id: 'LC-wPBE', label: 'LC-ωPBE', kind: 'hybrid' }, { id: 'B2PLYP', label: 'B2PLYP (double hybrid)', kind: 'dh' },
    { id: 'r2SCAN-3c', kind: '3c', min: '5' }, { id: 'B97-3c', kind: '3c' }, { id: 'PBEh-3c', kind: '3c' },
    { id: 'HF', kind: 'hf' }, { id: 'MP2', label: 'RI-MP2', kind: 'mp2' }, { id: 'DLPNO-CCSD(T)', kind: 'cc' },
  ];
  const ORCA_M = {}; ORCA_METHODS.forEach(m => ORCA_M[m.id] = m);
  const GAUSS_METHODS = [
    { id: 'B3LYP', disp: true }, { id: 'PBE1PBE', label: 'PBE0 (PBE1PBE)', disp: true }, { id: 'CAM-B3LYP', disp: true }, { id: 'wB97XD', label: 'ωB97XD', nodisp: true },
    { id: 'M062X', label: 'M06-2X', nodisp: true }, { id: 'BP86', disp: true }, { id: 'PBEPBE', label: 'PBE', disp: true }, { id: 'TPSSTPSS', label: 'TPSS', disp: true },
    { id: 'HF' }, { id: 'MP2' }, { id: 'B2PLYP', disp: true }, { id: 'LC-wPBE', label: 'LC-ωPBE' },
  ];
  const GAUSS_M = {}; GAUSS_METHODS.forEach(m => GAUSS_M[m.id] = m);

  const BASIS_LIST = ['STO-3G', '6-31G(d)', '6-31G(d,p)', '6-31+G(d,p)', '6-311G(d,p)', '6-311+G(d,p)', '6-311++G(d,p)', 'def2-SVP', 'def2-SVPD', 'def2-TZVP', 'def2-TZVPD', 'def2-TZVPP', 'def2-QZVP', 'ma-def2-SVP', 'ma-def2-TZVP', 'cc-pVDZ', 'cc-pVTZ', 'cc-pVQZ', 'aug-cc-pVDZ', 'aug-cc-pVTZ'];
  const orcaBasis = (b) => b.replace('(d,p)', '**').replace('(d)', '*');
  const gaussBasis = (b) => b.replace(/^def2-/, 'def2');
  const isPople = (b) => /^(STO|6-)/.test(b);
  const isCC = (b) => /cc-pV/.test(b);
  const gaussNoBasis = (b) => /^ma-def2/.test(b);

  // pelarut: [id, label, ORCA CPCM, ORCA SMD, Gaussian]
  const SOLVENTS = [
    ['water', 'Air', 'water', 'water', 'Water'], ['acetonitrile', 'Asetonitril', 'acetonitrile', 'acetonitrile', 'Acetonitrile'], ['methanol', 'Metanol', 'methanol', 'methanol', 'Methanol'],
    ['ethanol', 'Etanol', 'ethanol', 'ethanol', 'Ethanol'], ['dmso', 'DMSO', 'dmso', 'dimethylsulfoxide', 'DiMethylSulfoxide'], ['dmf', 'DMF', 'dmf', 'n,n-dimethylformamide', 'N,N-DiMethylFormamide'],
    ['thf', 'THF', 'thf', 'tetrahydrofuran', 'TetraHydroFuran'], ['dcm', 'Diklorometana', 'ch2cl2', 'dichloromethane', 'Dichloromethane'], ['chloroform', 'Kloroform', 'chcl3', 'chloroform', 'Chloroform'],
    ['toluene', 'Toluena', 'toluene', 'toluene', 'Toluene'], ['hexane', 'n-Heksana', 'hexane', 'n-hexane', 'n-Hexane'], ['acetone', 'Aseton', 'acetone', 'acetone', 'Acetone'],
  ];
  const SOLV = {}; SOLVENTS.forEach(s => SOLV[s[0]] = s);

  /* ---------- Parser geometri ---------- */
  function parseXYZ(text) {
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
    let start = 0;
    if (/^\d+$/.test(lines[0] || '')) start = 2;
    const atoms = [];
    for (const l of lines.slice(start)) {
      const p = l.split(/[\s,]+/);
      if (p.length < 4) continue;
      const x = parseFloat(p[1]), y = parseFloat(p[2]), z = parseFloat(p[3]);
      if ([x, y, z].some(isNaN)) continue;
      let sym = p[0].replace(/[^A-Za-z0-9]/g, '');
      if (/^\d+$/.test(sym)) { sym = Object.keys(ELZ).find(k => ELZ[k] === +sym) || 'X'; }
      else sym = sym.replace(/\d+$/, '');
      sym = sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();
      atoms.push({ el: sym, x, y, z });
    }
    return atoms;
  }
  function parseSDF(text) {
    const L = text.replace(/\r/g, '').split('\n');
    const c = L[3] || ''; const n = parseInt(c.substr(0, 3), 10);
    if (!(n > 0)) return { atoms: [], charge: 0 };
    const atoms = [];
    for (let i = 0; i < n; i++) {
      const l = L[4 + i] || '';
      const x = parseFloat(l.substr(0, 10)), y = parseFloat(l.substr(10, 10)), z = parseFloat(l.substr(20, 10)), el = l.substr(31, 3).trim();
      atoms.push({ el: el.charAt(0).toUpperCase() + el.slice(1).toLowerCase(), x, y, z });
    }
    let charge = 0;
    for (const l of L) { if (/^M {2}CHG/.test(l)) { const p = l.trim().split(/\s+/).slice(3); for (let i = 1; i < p.length; i += 2) charge += parseInt(p[i], 10) || 0; } }
    return { atoms: atoms.filter(a => !isNaN(a.x)), charge };
  }
  function parseZmatrix(text) {
    const rows = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const label = {}; const atoms = []; const P = [];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
    const ref = (t) => { if (/^\d+$/.test(t)) return parseInt(t, 10) - 1; if (t in label) return label[t]; throw new Error('Referensi atom tidak dikenal: ' + t); };
    rows.forEach((row, i) => {
      const p = row.split(/[\s,]+/); const lab = p[0]; let el = lab.replace(/[^A-Za-z]/g, ''); el = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
      const th = (d) => parseFloat(d) * Math.PI / 180; let pos;
      if (i === 0) pos = [0, 0, 0];
      else if (i === 1) { const a = ref(p[1]); pos = add(P[a], [0, 0, parseFloat(p[2])]); }
      else if (i === 2) {
        const a = ref(p[1]), b = ref(p[3]); const r = parseFloat(p[2]), ang = th(p[4]); const u = unit(sub(P[b], P[a]));
        let x = [1, 0, 0]; let perp = sub(x, mul(u, dot(x, u))); if (Math.hypot(...perp) < 1e-6) perp = sub([0, 1, 0], mul(u, u[1])); perp = unit(perp);
        pos = add(P[a], add(mul(u, r * Math.cos(ang)), mul(perp, r * Math.sin(ang))));
      } else {
        const C = P[ref(p[1])], B = P[ref(p[3])], A = P[ref(p[5])]; const r = parseFloat(p[2]), ang = th(p[4]), dih = th(p[6]);
        const bc = unit(sub(C, B)); const n = unit(cross(sub(B, A), bc)); const m = cross(n, bc);
        const d = [-r * Math.cos(ang), r * Math.sin(ang) * Math.cos(dih), r * Math.sin(ang) * Math.sin(dih)];
        pos = add(C, add(mul(bc, d[0]), add(mul(m, d[1]), mul(n, d[2]))));
      }
      if (pos.some(isNaN)) throw new Error('Z-matrix baris ' + (i + 1) + ' tidak valid');
      P.push(pos); label[lab] = i; atoms.push({ el, x: pos[0], y: pos[1], z: pos[2] });
    });
    return atoms;
  }
  /** Deteksi format otomatis: -> {atoms, charge?, format} */
  function parseGeometry(text) {
    const t = (text || '').trim();
    if (!t) return { atoms: [], format: 'kosong' };
    if (/V2000|V3000|M {2}END/.test(t)) { const r = parseSDF(text); return { atoms: r.atoms, charge: r.charge, format: 'SDF/MOL' }; }
    const rows = t.split('\n').map(l => l.trim()).filter(Boolean);
    const isXYZrow = (l) => { const p = l.split(/[\s,]+/); return p.length >= 4 && !isNaN(parseFloat(p[1])) && !isNaN(parseFloat(p[2])) && !isNaN(parseFloat(p[3])) && /^[A-Za-z]/.test(p[0]); };
    if (/^\d+$/.test(rows[0]) || rows.filter(isXYZrow).length >= rows.length - 1) return { atoms: parseXYZ(text), format: 'XYZ' };
    if (/^[A-Za-z]{1,2}\d*$/.test(rows[0].split(/\s+/)[0]) && (rows.length === 1 || /^[A-Za-z]{1,2}\d*\s+\S+\s+[-\d.]+/.test(rows[1] || ''))) return { atoms: parseZmatrix(text), format: 'Z-matrix' };
    return { atoms: parseXYZ(text), format: 'XYZ' };
  }
  const nElectrons = (atoms, charge) => atoms.reduce((s, a) => s + zOf(a.el), 0) - (charge || 0);
  const formula = (atoms) => { const c = {}; atoms.forEach(a => c[a.el] = (c[a.el] || 0) + 1); const k = Object.keys(c).sort((a, b) => a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)); return k.map(e => e + (c[e] > 1 ? c[e] : '')).join(''); };
  const fileSafe = (s) => (String(s || 'molecule').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'molecule').slice(0, 60);
  const coordLines = (atoms) => atoms.map(a => ' ' + a.el.padEnd(3) + [a.x, a.y, a.z].map(v => v.toFixed(6).padStart(14)).join(''));

  /* ---------- Estimasi ukuran basis ---------- */
  // jumlah fungsi basis per atom (perkiraan) untuk baris periode [1,2,3,4,5+]
  const NBF = {
    'STO-3G': [1, 5, 9, 18, 27], '6-31G(d)': [2, 15, 19, 32, 45], '6-31G(d,p)': [5, 15, 19, 32, 45], '6-31+G(d,p)': [5, 19, 23, 36, 49], '6-311G(d,p)': [6, 19, 23, 38, 50],
    '6-311+G(d,p)': [6, 23, 27, 42, 54], '6-311++G(d,p)': [10, 23, 27, 42, 54], 'def2-SVP': [5, 14, 18, 32, 32], 'def2-SVPD': [8, 19, 23, 37, 37], 'def2-TZVP': [6, 31, 37, 44, 45],
    'def2-TZVPD': [10, 36, 42, 50, 50], 'def2-TZVPP': [14, 37, 43, 52, 52], 'def2-QZVP': [30, 85, 86, 100, 100], 'ma-def2-SVP': [8, 19, 23, 37, 37], 'ma-def2-TZVP': [10, 36, 42, 50, 50],
    'cc-pVDZ': [5, 14, 18, 30, 35], 'cc-pVTZ': [14, 30, 34, 46, 50], 'cc-pVQZ': [30, 55, 59, 70, 80], 'aug-cc-pVDZ': [9, 23, 27, 39, 45], 'aug-cc-pVTZ': [23, 46, 50, 60, 70],
  };
  const period = (z) => z <= 2 ? 0 : z <= 10 ? 1 : z <= 18 ? 2 : z <= 36 ? 3 : 4;
  function basisEstimate(atoms, basis) {
    const t = NBF[basis]; if (!t) return null;
    return atoms.reduce((s, a) => s + t[period(zOf(a.el))], 0);
  }
  function recommendMaxcore(nbf, td) {
    let mc = nbf < 150 ? 1000 : nbf < 400 ? 2000 : nbf < 800 ? 3000 : 4000;
    if (td) mc += 1000; return mc;
  }

  /* ---------- Constraint & scan ---------- */
  /** baris: "B 1 2", "A 1 2 3", "D 1 2 3 4 [nilai]" (indeks atom basis-1). -> [{t, idx, val}] */
  function parseConstraints(text) {
    const out = [];
    (text || '').split('\n').forEach(l => {
      const p = l.trim().split(/\s+/); if (!p[0] || p[0].startsWith('#')) return;
      const t = p[0].toUpperCase(); const n = t === 'B' ? 2 : t === 'A' ? 3 : t === 'D' ? 4 : t === 'C' ? 1 : 0; if (!n) return;
      const idx = p.slice(1, 1 + n).map(Number); if (idx.length < n || idx.some(x => !(x >= 1))) return;
      const val = p[1 + n] !== undefined && !isNaN(parseFloat(p[1 + n])) ? parseFloat(p[1 + n]) : null;
      out.push({ t, idx, val });
    });
    return out;
  }

  /* ======================================================================
     ORCA
     ====================================================================== */
  function orcaDefaults() {
    return {
      version: '6', job: 'optfreq', method: 'B3LYP', basis: 'def2-SVP', disp: 'D3BJ', rijcosx: true, auxC: 'AutoAux', pno: 'NormalPNO',
      solvModel: 'none', solvent: 'water', scf: 'TightSCF', maxiter: 125, scfConv: 'default', guess: 'default', moinp: '', reference: 'auto', shift: false, shiftVal: 0.3, errOff: 0.1,
      grid: 'default', finalgrid: 'default', optLevel: 'TightOpt', optMaxIter: 100, hessGuess: 'default', calcHess: false, recalcHess: 0, numfreq: false, tempOn: false, temp: 298.15, press: 1.0,
      nroots: 10, iroot: 1, tda: false, triplets: false, donto: false, maxdim: 0, tdSolv: true,
      esdType: 'ABS', gsHess: 'gs.hess', esHess: 's1.hess', doht: true, sroot: 1, troot: 1, delE: 11000, esdTemp: 298.15,
      nprocs: 8, maxcore: 3000, printBasis: false, printMOs: false, hirshfeld: false, printLevel: 'default', molden: true, cube: false, dipole: false, polar: false,
      constraints: '', scanAtoms: '1 2', scanType: 'B', scanStart: 1.0, scanEnd: 2.0, scanSteps: 10, ircDir: 'both', ircMaxIter: 30, ircHess: 'ts.hess', basisAtoms: '', xyzfile: false, extraBang: '', extraBlocks: '', header: true,
    };
  }
  const ORCA_JOBS = [
    ['sp', 'Single point (SP)'], ['opt', 'Optimasi geometri'], ['optfreq', 'Optimasi + frekuensi'], ['freq', 'Frekuensi saja'], ['ts', 'Optimasi TS (OptTS + Freq)'],
    ['scan', 'Relaxed surface scan'], ['irc', 'IRC'], ['td', 'TDDFT (spektrum serapan)'], ['stda', 'sTDA / sTD-DFT (cepat)'], ['tdopt', 'Optimasi keadaan tereksitasi (TDDFT)'],
    ['nmr', 'NMR (GIAO)'], ['prop', 'Sifat / populasi (SP)'], ['esd', 'ESD — laju fotofisika (ABS/FLUOR/ISC)'],
  ];
  function orcaMethodKeyword(o) {
    const M = ORCA_M[o.method] || ORCA_M.B3LYP;
    if (M.id === 'MP2') return 'RI-MP2';
    return M.id;
  }
  function orcaInput(o, mol, name) {
    const M = ORCA_M[o.method] || ORCA_M.B3LYP; const atoms = mol.atoms || [];
    const L = []; const bang1 = [], bang2 = [], bang3 = [];
    const job = o.job; const nm = fileSafe(name);
    const heavy = atoms.some(a => zOf(a.el) > 36);
    if (o.header !== false) L.push(`# ${name} — ORCA ${o.version}.x — dibuat oleh Quantum Chemistry Studio`);
    /* baris 1: metode, dispersi, basis, aux */
    bang1.push(orcaMethodKeyword(o));
    if (M.kind !== '3c') {
      if (['pure', 'hybrid', 'dh', 'hf'].includes(M.kind) && !M.nodisp && o.disp && o.disp !== 'none') bang1.push(o.disp);
      bang1.push(orcaBasis(o.basis));
      if (M.kind === 'pure') bang1.push('RI', 'def2/J');
      else if (['hybrid', 'hf', 'dh'].includes(M.kind) && o.rijcosx) bang1.push('RIJCOSX', 'def2/J');
      if (['dh', 'mp2', 'cc'].includes(M.kind)) bang1.push(o.auxC || 'AutoAux');
      if (M.kind === 'cc') bang1.push(o.pno || 'NormalPNO', 'def2/J', 'RIJCOSX');
    }
    /* baris 2: SCF, grid, referensi */
    bang2.push(o.scf || 'TightSCF');
    if (o.scfConv === 'slow') bang2.push('SlowConv'); else if (o.scfConv === 'veryslow') bang2.push('VerySlowConv'); else if (o.scfConv === 'kdiis') bang2.push('KDIIS', 'SOSCF');
    if (o.guess && o.guess !== 'default') bang2.push(o.guess);
    if (o.reference && o.reference !== 'auto') bang2.push(o.reference);
    if (o.grid && o.grid !== 'default') bang2.push(o.grid);
    if (o.finalgrid && o.finalgrid !== 'default') bang2.push(o.finalgrid);
    /* baris 3: pekerjaan + pelarut */
    const optWord = o.optLevel === 'Opt' ? 'Opt' : (o.optLevel || 'TightOpt');
    const freqWord = o.numfreq ? 'NumFreq' : 'Freq';
    switch (job) {
      case 'opt': case 'scan': case 'tdopt': bang3.push(optWord); break;
      case 'optfreq': bang3.push(optWord, freqWord); break;
      case 'freq': bang3.push(freqWord); break;
      case 'ts': bang3.push('OptTS', freqWord); break;
      case 'irc': bang3.push('IRC'); break;
      case 'nmr': bang3.push('NMR'); break;
      case 'esd': bang3.push('ESD(' + (o.esdType === 'ISC' ? 'ISC' : o.esdType) + ')'); break;
      default: break;
    }
    if (o.hessGuess && o.hessGuess !== 'default' && ['opt', 'optfreq', 'ts', 'scan', 'tdopt'].includes(job)) { /* ditulis di %geom */ }
    const solvOn = o.solvModel && o.solvModel !== 'none';
    if (solvOn) bang3.push(`CPCM(${SOLV[o.solvent][2]})`);
    if (o.extraBang && o.extraBang.trim()) bang3.push(o.extraBang.trim());
    [bang1, bang2, bang3].forEach(b => { if (b.length) L.push('! ' + b.join(' ')); });
    L.push('');
    /* paralel & memori */
    if (+o.nprocs > 1) L.push(`%pal nprocs ${o.nprocs} end`);
    L.push(`%maxcore ${o.maxcore}`);
    L.push('');
    /* %scf */
    const scf = [];
    if (+o.maxiter && +o.maxiter !== 125) scf.push(`MaxIter ${o.maxiter}`);
    if (o.shift) scf.push(`Shift Shift ${o.shiftVal} ErrOff ${o.errOff} end`);
    if (scf.length) { L.push('%scf'); scf.forEach(s => L.push('  ' + s)); L.push('end'); L.push(''); }
    if (o.guess === 'MORead' && o.moinp) { L.push(`%moinp "${o.moinp}"`); L.push(''); }
    /* %basis atom-spesifik */
    const nb = (o.basisAtoms || '').split('\n').map(l => l.trim()).filter(l => /^[A-Za-z]{1,2}\s+\S+/.test(l));
    if (nb.length) { L.push('%basis'); nb.forEach(l => { const p = l.split(/\s+/); L.push(`  NewGTO ${p[0]} "${p.slice(1).join(' ')}" end`); }); L.push('end'); L.push(''); }
    /* %geom */
    const geomOpt = ['opt', 'optfreq', 'ts', 'scan', 'tdopt', 'irc'].includes(job);
    const g = [];
    if (geomOpt && +o.optMaxIter && +o.optMaxIter !== 100) g.push(`MaxIter ${o.optMaxIter}`);
    if (geomOpt && (o.calcHess || job === 'ts')) g.push('Calc_Hess true');
    if (geomOpt && +o.recalcHess > 0) g.push(`Recalc_Hess ${o.recalcHess}`);
    if (geomOpt && o.hessGuess && o.hessGuess !== 'default') g.push(`InHess ${o.hessGuess}`);
    const cons = parseConstraints(o.constraints);
    if (geomOpt && cons.length && job !== 'ts' || (job === 'ts' && cons.length)) {
      g.push('Constraints');
      cons.forEach(c => { const idx = c.idx.map(i => i - 1).join(' '); g.push(c.t === 'C' ? `  { C ${idx} C }` : `  { ${c.t} ${idx}${c.val != null ? ' ' + c.val : ''} C }`); });
      g.push('end');
    }
    if (job === 'scan') {
      const idx = String(o.scanAtoms || '').trim().split(/\s+/).map(Number).filter(x => x >= 1).map(x => x - 1);
      g.push('Scan'); g.push(`  ${o.scanType} ${idx.join(' ')} = ${(+o.scanStart).toFixed(3)}, ${(+o.scanEnd).toFixed(3)}, ${o.scanSteps}`); g.push('end');
    }
    if (g.length) { L.push('%geom'); g.forEach(s => L.push('  ' + s)); L.push('end'); L.push(''); }
    /* %cpcm (SMD) */
    if (solvOn && o.solvModel === 'SMD') { L.push('%cpcm'); L.push('  smd true'); L.push(`  SMDsolvent "${SOLV[o.solvent][3]}"`); L.push('end'); L.push(''); }
    /* %method FinalGrid etc. dilewatkan lewat keyword */
    /* %tddft */
    if (['td', 'stda', 'tdopt', 'esd'].includes(job)) {
      const t = ['%tddft'];
      if (job === 'stda') t.push('  Mode sTDDFT');
      t.push(`  NRoots ${o.nroots}`);
      if (job === 'tdopt' || job === 'esd' || +o.iroot > 1) t.push(`  IRoot ${o.iroot}`);
      if (job === 'esd' && o.esdType === 'ISC') { t.push(`  SRoot ${o.sroot}`); t.push(`  TRoot ${o.troot}`); t.push('  DoSOC true'); }
      if (o.tda) t.push('  TDA true'); else if (job !== 'stda') t.push('  TDA false');
      if (o.triplets) t.push('  Triplets true');
      if (o.donto) t.push('  DoNTO true');
      if (+o.maxdim > 0) t.push(`  MaxDim ${o.maxdim}`);
      t.push('end'); t.forEach(s => L.push(s)); L.push('');
    }
    /* %esd */
    if (job === 'esd') {
      L.push('%esd');
      if (o.esdType === 'ISC') { L.push(`  ISCISHESS "${o.gsHess}"`); L.push(`  ISCFSHESS "${o.esHess}"`); L.push(`  DELE ${o.delE}`); L.push('  USEJ true'); L.push(`  TEMP ${o.esdTemp}`); }
      else { L.push(`  GSHESSIAN "${o.gsHess}"`); L.push(`  ESHESSIAN "${o.esHess}"`); }
      if (o.doht) L.push('  DOHT true');
      L.push('end'); L.push('');
    }
    /* %freq */
    if (['optfreq', 'freq', 'ts'].includes(job) && o.tempOn) { L.push('%freq'); L.push(`  Temp ${o.temp}`); L.push(`  Pressure ${o.press}`); L.push('end'); L.push(''); }
    /* %irc */
    if (job === 'irc') {
      L.push('%irc'); L.push(`  MaxIter ${o.ircMaxIter}`); L.push(`  Direction ${o.ircDir}`); L.push('  InitHess read'); L.push(`  Hess_Filename "${o.ircHess}"`); L.push('end'); L.push('');
    }
    /* %eprnmr */
    if (job === 'nmr') { L.push('%eprnmr'); L.push('  Nuclei = all C { shift }'); L.push('  Nuclei = all H { shift }'); L.push('end'); L.push(''); }
    /* %output */
    const out = [];
    if (o.printLevel && o.printLevel !== 'default') out.push(`PrintLevel ${o.printLevel}`);
    if (o.printBasis || o.molden) out.push('Print[ P_Basis ] 2');
    if (o.printMOs || o.molden) out.push('Print[ P_MOs ] 1');
    if (o.hirshfeld) out.push('Print[ P_Hirshfeld ] 1');
    if (out.length) { L.push('%output'); out.forEach(s => L.push('  ' + s)); L.push('end'); L.push(''); }
    /* %elprop */
    if (o.dipole || o.polar) { L.push('%elprop'); if (o.dipole) L.push('  Dipole true'); if (o.polar) L.push('  Polar 1'); L.push('end'); L.push(''); }
    /* %plots (cube HOMO/LUMO) */
    if (o.cube) {
      const ne = nElectrons(atoms, mol.charge); const homo = Math.floor(ne / 2) - 1;
      L.push('%plots'); L.push('  dim1 80'); L.push('  dim2 80'); L.push('  dim3 80'); L.push('  Format Gaussian_Cube');
      L.push(`  MO("${nm}_HOMO.cube", ${homo}, 0);`); L.push(`  MO("${nm}_LUMO.cube", ${homo + 1}, 0);`); L.push('end'); L.push('');
    }
    if (o.extraBlocks && o.extraBlocks.trim()) { L.push(o.extraBlocks.trim()); L.push(''); }
    /* geometri */
    const q = mol.charge || 0, m = mol.mult || 1;
    if (o.xyzfile) L.push(`* xyzfile ${q} ${m} ${nm}.xyz`);
    else { L.push(`* xyz ${q} ${m}`); coordLines(atoms).forEach(l => L.push(l)); L.push('*'); }
    L.push('');
    return L.join('\n');
  }

  /* ======================================================================
     GAUSSIAN
     ====================================================================== */
  function gaussDefaults() {
    return {
      job: 'optfreq', method: 'B3LYP', basis: '6-31G(d)', disp: 'gd3bj', reference: 'auto', nproc: 8, mem: 8, memUnit: 'GB', chk: true, oldchk: '', rwf: false,
      solvModel: 'none', solvent: 'water', scfTight: false, scfXqc: false, scfMax: 0, intUltra: true, pop: 'none', nosymm: false, gfinput: false, geomCheck: false,
      optTight: false, optCalcfc: false, optMaxcycles: 0, optNoEig: false, freqRaman: false, freqHpmodes: false, nstates: 10, tdRoot: 1, tdType: 'singlets', tdTda: false,
      constraints: '', scanAtoms: '1 2', scanType: 'B', scanSteps: 10, scanStep: 0.1, ircMax: 30, ircStep: 10, iops: '', extraRoute: '',
      heavyEcp: 'LANL2DZ', useGen: false, chainFreq: true, chainTd: true, tdMethod: 'same', tdBasis: 'same', title: '', nmrGiao: true,
    };
  }
  const GAUSS_JOBS = [
    ['sp', 'Single point (SP)'], ['opt', 'Optimasi geometri'], ['optfreq', 'Optimasi + frekuensi'], ['freq', 'Frekuensi saja'], ['ts', 'Optimasi TS (opt=ts + freq)'],
    ['scan', 'Relaxed scan (ModRedundant)'], ['irc', 'IRC'], ['td', 'TD-DFT (serapan)'], ['nmr', 'NMR (GIAO)'], ['pop', 'Sifat / populasi (SP)'],
    ['chain', 'Berantai (--Link1--): opt → freq → TD'],
  ];
  function gaussMethodRoute(g, method, basis) {
    const M = GAUSS_M[method] || GAUSS_M.B3LYP;
    let kw = M.id;
    const unres = g.reference === 'U' ? 'U' : g.reference === 'RO' ? 'RO' : g.reference === 'R' ? 'R' : '';
    if (unres) kw = unres + (kw.startsWith('wB97') ? kw : kw);
    return kw;
  }
  function gaussSection(g, mol, name, spec) {
    // spec: {first, jobWords[], method, basis, geomCheck, scfExtra, tdWords, modred, title}
    const atoms = mol.atoms || []; const nm = fileSafe(name);
    const L = [];
    if (+g.nproc > 0) L.push(`%nprocshared=${g.nproc}`);
    L.push(`%mem=${g.mem}${g.memUnit}`);
    if (g.oldchk && spec.first) L.push(`%oldchk=${g.oldchk}`);
    if (g.chk) L.push(`%chk=${nm}.chk`);
    if (g.rwf) L.push(`%rwf=${nm}.rwf`);
    const M = GAUSS_M[spec.method] || GAUSS_M.B3LYP;
    const heavy = atoms.filter(a => zOf(a.el) > 36).map(a => a.el);
    const gen = g.useGen || (heavy.length > 0 && (isPople(spec.basis) || isCC(spec.basis)));
    const basisKw = gen ? (heavy.length ? 'GenECP' : 'Gen') : gaussBasis(spec.basis);
    const route = ['#p ' + gaussMethodRoute(g, spec.method) + '/' + basisKw];
    route.push(...spec.jobWords);
    if (g.disp && g.disp !== 'none' && M.disp && !M.nodisp) route.push('empiricaldispersion=' + g.disp);
    if (g.solvModel && g.solvModel !== 'none') route.push(`scrf=(${g.solvModel.toLowerCase()},solvent=${SOLV[g.solvent][4]})`);
    const scf = []; if (g.scfTight) scf.push('tight'); if (g.scfXqc) scf.push('xqc'); if (+g.scfMax > 0) scf.push('maxcycles=' + g.scfMax);
    if (scf.length) route.push(scf.length === 1 ? 'scf=' + scf[0] : `scf=(${scf.join(',')})`);
    if (g.intUltra) route.push('int=ultrafine');
    if (g.pop && g.pop !== 'none') route.push(g.pop.includes(',') ? `pop=(${g.pop})` : 'pop=' + g.pop);
    if (g.nosymm) route.push('nosymm');
    if (g.gfinput) route.push('gfinput');
    if (spec.geomCheck) route.push('geom=check', 'guess=read');
    (g.iops || '').split(/\s+/).filter(x => /^iop\(/i.test(x)).forEach(x => route.push(x));
    if (g.extraRoute && g.extraRoute.trim()) route.push(g.extraRoute.trim());
    L.push(route.join(' '));
    L.push('');
    L.push(spec.title || g.title || name);
    L.push('');
    L.push(`${mol.charge || 0} ${mol.mult || 1}`);
    if (!spec.geomCheck) coordLines(atoms).forEach(l => L.push(l));
    L.push('');
    if (spec.modred && spec.modred.length) { spec.modred.forEach(l => L.push(l)); L.push(''); }
    if (gen) {
      const light = [...new Set(atoms.filter(a => zOf(a.el) <= 36).map(a => a.el))];
      const hv = [...new Set(heavy)];
      const ecpName = g.heavyEcp || 'LANL2DZ';
      if (light.length) { L.push(light.join(' ') + ' 0'); L.push(gaussBasis(spec.basis)); L.push('****'); }
      if (hv.length) { L.push(hv.join(' ') + ' 0'); L.push(ecpName === 'def2' ? 'def2SVP' : ecpName); L.push('****'); }
      L.push('');
      if (hv.length) { L.push(hv.join(' ') + ' 0'); L.push(ecpName === 'def2' ? 'def2SVP' : ecpName); L.push(''); }
    }
    return L;
  }
  function gaussInput(g, mol, name) {
    const nm = fileSafe(name);
    const optItems = []; if (g.optTight) optItems.push('tight'); if (g.optCalcfc) optItems.push('calcfc'); if (+g.optMaxcycles > 0) optItems.push('maxcycles=' + g.optMaxcycles);
    const optW = (extra = []) => { const it = extra.concat(optItems); return it.length === 0 ? 'opt' : it.length === 1 ? 'opt=' + it[0] : `opt=(${it.join(',')})`; };
    const freqIt = []; if (g.freqRaman) freqIt.push('raman'); if (g.freqHpmodes) freqIt.push('hpmodes');
    const freqW = freqIt.length === 0 ? 'freq' : freqIt.length === 1 ? 'freq=' + freqIt[0] : `freq=(${freqIt.join(',')})`;
    const tdIt = []; if (g.tdTda) tdIt.push('tda'); tdIt.push(g.tdType === '50-50' ? '50-50' : g.tdType); tdIt.push('nstates=' + g.nstates); if (+g.tdRoot > 1) tdIt.push('root=' + g.tdRoot);
    const tdW = `td=(${tdIt.join(',')})`;
    const cons = parseConstraints(g.constraints);
    const modred = cons.map(c => `${c.t === 'C' ? 'X' : c.t} ${c.idx.join(' ')}${c.val != null ? ' ' + c.val : ''} F`);
    let secs = []; const base = { method: g.method, basis: g.basis };
    const job = g.job;
    const one = (words, extra = {}) => gaussSection(g, mol, name, Object.assign({ first: true, jobWords: words, geomCheck: g.geomCheck }, base, extra));
    switch (job) {
      case 'sp': case 'pop': secs.push(one([])); break;
      case 'opt': secs.push(cons.length ? one([optW(['modredundant'])], { modred }) : one([optW()])); break;
      case 'optfreq': secs.push(cons.length ? one([optW(['modredundant']), freqW], { modred }) : one([optW(), freqW])); break;
      case 'freq': secs.push(one([freqW])); break;
      case 'ts': secs.push(one([optW(['ts', 'calcfc', 'noeigentest'].filter(x => !(x === 'calcfc' && g.optCalcfc))), freqW])); break;
      case 'scan': {
        const idx = String(g.scanAtoms).trim().split(/\s+/).map(Number).filter(x => x >= 1);
        secs.push(one([optW(['modredundant'])], { modred: [`${g.scanType} ${idx.join(' ')} S ${g.scanSteps} ${g.scanStep}`].concat(modred) })); break;
      }
      case 'irc': secs.push(one([`irc=(calcfc,maxpoints=${g.ircMax},stepsize=${g.ircStep})`])); break;
      case 'td': secs.push(one([tdW])); break;
      case 'nmr': secs.push(one(['nmr' + (g.nmrGiao ? '=giao' : '')])); break;
      case 'chain': {
        secs.push(cons.length ? one([optW(['modredundant'])], { modred, title: (g.title || name) + ' — opt' }) : one([optW()], { title: (g.title || name) + ' — opt' }));
        if (g.chainFreq) secs.push(gaussSection(g, mol, name, Object.assign({ first: false, jobWords: [freqW], geomCheck: true, title: (g.title || name) + ' — freq' }, base)));
        if (g.chainTd) secs.push(gaussSection(g, mol, name, { first: false, jobWords: [tdW], geomCheck: true, title: (g.title || name) + ' — TD-DFT', method: g.tdMethod === 'same' ? g.method : g.tdMethod, basis: g.tdBasis === 'same' ? g.basis : g.tdBasis }));
        break;
      }
      default: secs.push(one([]));
    }
    const out = [];
    secs.forEach((s, i) => { if (i > 0) out.push('--Link1--'); s.forEach(l => out.push(l)); });
    return out.join('\n') + '\n';
  }

  /* ======================================================================
     VALIDATOR
     ====================================================================== */
  function validate(engine, o, mol) {
    const W = []; const add = (level, msg) => W.push({ level, msg });
    const atoms = mol.atoms || [];
    if (!atoms.length) { add('err', 'Belum ada geometri. Muat molekul dari Molecular Builder atau tempel XYZ.'); return W; }
    const ne = nElectrons(atoms, mol.charge), mult = mol.mult || 1;
    if (ne < 1) add('err', 'Jumlah elektron ≤ 0 — periksa muatan.');
    else if ((ne % 2 === 0) !== (mult % 2 === 1)) add('err', `Muatan/multiplisitas tidak konsisten: ${ne} elektron tidak dapat memiliki multiplisitas ${mult} (elektron ${ne % 2 ? 'ganjil → mult genap (2,4,…)' : 'genap → mult ganjil (1,3,…)'}).`);
    if (mult - 1 > ne) add('err', 'Multiplisitas melebihi jumlah elektron.');
    // jarak terlalu dekat
    let minD = 99; for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) { const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z); if (d < minD) minD = d; }
    if (atoms.length > 1 && minD < 0.55) add('err', `Dua atom berjarak hanya ${minD.toFixed(2)} Å — geometri hampir pasti keliru (atom tumpang tindih).`);
    const unknown = atoms.filter(a => !zOf(a.el)).map(a => a.el); if (unknown.length) add('err', 'Unsur tidak dikenal: ' + [...new Set(unknown)].join(', '));
    const heavy = atoms.some(a => zOf(a.el) > 36);
    const cons = parseConstraints(o.constraints); cons.forEach(c => { if (c.idx.some(i => i > atoms.length)) add('err', `Constraint "${c.t} ${c.idx.join(' ')}" memakai indeks atom di luar ${atoms.length} atom.`); });
    if (engine === 'orca') {
      const M = ORCA_M[o.method] || {}; const job = o.job;
      if (['hybrid', 'hf', 'dh'].includes(M.kind) && !o.rijcosx) add('warn', 'Fungsional hibrida tanpa RIJCOSX (+ def2/J) akan jauh lebih lambat untuk molekul besar. Aktifkan RIJCOSX kecuali memang ingin akurasi eksak.');
      if (M.kind === '3c') add('info', `${M.id} adalah metode komposit: basis set, dispersi, dan aux basis sudah termasuk — pilihan basis/dispersi diabaikan.`);
      if (M.nodisp && o.disp !== 'none') add('info', `${M.id} sudah memiliki koreksi dispersi sendiri — pilihan D3/D4 diabaikan.`);
      if (M.grid3 && o.grid !== 'DefGrid3') add('warn', 'M06-2X sensitif terhadap grid integrasi; disarankan DefGrid3.');
      if (['td', 'stda', 'tdopt', 'esd'].includes(job) && !(+o.nroots >= 1)) add('err', 'TDDFT memerlukan NRoots ≥ 1.');
      if (['td', 'tdopt'].includes(job) && ['CAM-B3LYP', 'LC-wPBE', 'wB97X-D3', 'wB97X-D3BJ', 'wB97M-V'].indexOf(o.method) < 0 && M.kind !== 'dh') add('info', 'Untuk eksitasi charge-transfer (mis. pewarna DSSC) fungsional range-separated seperti CAM-B3LYP atau ωB97X-D3 lebih andal daripada B3LYP.');
      if (job === 'tdopt' && +o.iroot < 1) add('err', 'IRoot harus ≥ 1.');
      if (o.solvModel === 'none' && ['td'].includes(job) && false) add('info', '');
      if (o.solvModel !== 'none' && !o.solvent) add('warn', 'Model pelarut dipilih tetapi pelarut belum ditentukan.');
      if (o.solvModel !== 'none' && ['freq', 'optfreq'].includes(job) && o.numfreq === false) add('info', 'Frekuensi dalam pelarut dihitung analitik bila tersedia; hasil dapat sedikit berbeda dari fase gas.');
      if (o.solvModel === 'none' && ['td', 'tdopt'].includes(job)) add('info', 'Perhitungan TDDFT dalam fase gas: spektrum eksperimen biasanya dalam pelarut — pertimbangkan CPCM/SMD.');
      if (o.guess === 'MORead' && !o.moinp) add('err', 'Guess MORead memerlukan nama file .gbw (%moinp).');
      if (o.scfConv === 'kdiis' && o.shift) add('warn', 'KDIIS+SOSCF bersamaan dengan level shift jarang diperlukan; coba salah satu dulu.');
      if (o.scfConv !== 'default' && o.scfConv !== 'kdiis' && o.guess === 'default') add('info', 'SlowConv membantu SCF yang berosilasi; jika tetap gagal coba guess PModel/MORead dari perhitungan lebih murah.');
      if (mult > 1 && o.reference === 'RKS') add('err', 'RKS tidak dapat dipakai untuk sistem open-shell (mult > 1). Pilih UKS/ROKS atau auto.');
      if (mult === 1 && o.reference === 'UKS') add('info', 'UKS untuk sistem closed-shell berjalan lebih lambat; berguna hanya untuk memeriksa stabilitas (broken symmetry).');
      if (job === 'ts' && !o.calcHess) add('info', 'OptTS: Calc_Hess true otomatis ditambahkan (Hessian awal sangat penting untuk TS).');
      if (job === 'irc') add('warn', 'IRC memerlukan geometri TS terkonvergensi dan file Hessian (.hess) dari perhitungan frekuensi TS.');
      if (job === 'scan' && cons.length === 0 && !o.scanAtoms) add('err', 'Scan memerlukan atom koordinat.');
      if (job === 'esd') add('warn', 'ESD memerlukan file Hessian (.hess) keadaan dasar dan tereksitasi yang telah dihitung sebelumnya (versi ORCA ≥ 5.0). Geometri input harus sesuai Hessian GS (ABS/FLUOR).');
      if (job === 'nmr' && M.kind === '3c') add('info', 'NMR dengan metode komposit 3c kurang lazim; pertimbangkan hibrida + basis def2-TZVP.');
      if (heavy && isPople(o.basis)) add('err', 'Basis Pople tidak didefinisikan untuk unsur di atas Kr. Gunakan def2-* (ECP otomatis).');
      if (heavy && isCC(o.basis)) add('warn', 'cc-pVXZ standar tidak mencakup unsur berat; gunakan cc-pVXZ-PP atau def2-*.');
      if (heavy && /def2/.test(o.basis)) add('info', 'Unsur berat (Z > 36): ORCA otomatis memakai def2-ECP; efek relativistik skalar tercakup.');
      if (o.version === '4.2' && (M.id === 'r2SCAN-3c' || o.disp === 'D4' || job === 'esd')) add('err', 'Fitur ini tidak tersedia di ORCA 4.2 (r2SCAN-3c, D4, ESD memerlukan ORCA ≥ 5.0).');
      if (o.version === '4.2' && (o.grid || '').startsWith('DefGrid')) add('warn', 'DefGrid tidak ada di ORCA 4.2; gunakan Grid4/Grid5.');
      if (o.method === 'wB97M-V' && o.version === '4.2') add('err', 'ωB97M-V memerlukan ORCA ≥ 5.0.');
      if (+o.nprocs > 1 && +o.nprocs * +o.maxcore > 1e6) add('warn', 'nprocs × maxcore sangat besar; pastikan sesuai RAM node.');
      if (['optfreq', 'freq', 'ts'].includes(job) && o.numfreq && atoms.length > 30) add('warn', 'NumFreq pada molekul besar sangat mahal (3N perpindahan); gunakan frekuensi analitik bila metode mendukung.');
      if (job === 'sp' && o.molden === false && o.cube === false) add('info', 'Untuk menampilkan HOMO/LUMO di Results Analyzer aktifkan "Cetak MO / molden".');
      if (o.basisAtoms && o.basisAtoms.trim()) { o.basisAtoms.split('\n').forEach(l => { const el = (l.trim().split(/\s+/)[0] || ''); if (el && !atoms.some(a => a.el.toLowerCase() === el.toLowerCase())) add('warn', `Basis atom-spesifik untuk ${el}, tetapi unsur itu tidak ada pada molekul.`); }); }
    } else {
      const job = o.job; const M = GAUSS_M[o.method] || {};
      if (M.nodisp && o.disp !== 'none') add('info', `${M.id} tidak memakai empiricaldispersion tambahan (ωB97XD sudah memiliki dispersi; M06-2X dikalibrasi tanpa D3) — pilihan dispersi diabaikan.`);
      if (!M.disp && !M.nodisp && o.disp !== 'none') add('info', `Koreksi dispersi tidak diterapkan untuk ${M.id} dalam preset ini.`);
      if (['td'].includes(job) && !(+o.nstates >= 1)) add('err', 'TD memerlukan nstates ≥ 1.');
      if (job === 'chain' && o.chainTd && !(+o.nstates >= 1)) add('err', 'Langkah TD memerlukan nstates ≥ 1.');
      if (!o.chk && (job === 'chain' || o.geomCheck)) add('err', 'Job berantai / geom=check memerlukan %chk.');
      if (!o.chk) add('info', 'Tanpa %chk tidak ada file .chk/.fchk — HOMO/LUMO di Results Analyzer tidak dapat dibuat.');
      if (o.geomCheck && !o.oldchk) add('warn', 'geom=check guess=read membaca %chk yang sama (jika ada). Isi %oldchk untuk memulai dari checkpoint lain.');
      if (+o.mem < 1) add('err', 'Memori %mem harus > 0.');
      if (o.solvModel !== 'none' && !o.solvent) add('warn', 'Pelarut belum dipilih.');
      if (heavy && (isPople(o.basis) || isCC(o.basis))) add('info', 'Unsur berat terdeteksi: GenECP otomatis dipakai (LANL2DZ untuk atom Z > 36).');
      if (gaussNoBasis(o.basis)) add('err', 'Basis ma-def2 tidak tersedia di Gaussian. Gunakan def2SVPD/def2TZVPD atau aug-cc-pVXZ.');
      if (o.job === 'ts' || (o.job === 'irc')) add('warn', 'TS/IRC: gunakan geometri tebakan TS yang baik; opt=ts memakai calcfc.');
      if (o.job === 'scan') add('info', 'Scan dimulai dari nilai koordinat pada geometri awal; pastikan geometri awal berada di ujung scan.');
      if (M.id === 'M062X' && !o.intUltra) add('warn', 'M06-2X disarankan dengan int=ultrafine.');
      if (+o.nproc > 0 && +o.mem / Math.max(1, +o.nproc) < 0.5 && o.memUnit === 'GB') add('warn', 'Memori per core < 0,5 GB; naikkan %mem atau kurangi %nprocshared.');
      if (['CAM-B3LYP', 'wB97XD', 'LC-wPBE'].indexOf(o.method) < 0 && (job === 'td' || (job === 'chain' && o.chainTd && o.tdMethod === 'same')))add('info', 'Untuk eksitasi charge-transfer pertimbangkan CAM-B3LYP / ωB97XD (langkah TD pada job berantai dapat memakai fungsional berbeda).');
    }
    return W;
  }

  /* ---------- Preset ---------- */
  const PRESETS = [
    { id: 'optfreq', label: 'Optimasi + frekuensi B3LYP-D3BJ/def2-SVP', desc: 'Geometri + cek frekuensi imajiner (default Results Analyzer).',
      orca: { job: 'optfreq', method: 'B3LYP', basis: 'def2-SVP', disp: 'D3BJ', rijcosx: true, optLevel: 'TightOpt', scf: 'TightSCF', solvModel: 'none', molden: true },
      gauss: { job: 'optfreq', method: 'B3LYP', basis: 'def2-SVP', disp: 'gd3bj', optTight: false, intUltra: true, solvModel: 'none', chk: true } },
    { id: 'tddft', label: 'TDDFT absorpsi CAM-B3LYP/def2-TZVP CPCM(acetonitrile)', desc: 'Spektrum serapan 20 keadaan tereksitasi.',
      orca: { job: 'td', method: 'CAM-B3LYP', basis: 'def2-TZVP', disp: 'none', rijcosx: true, nroots: 20, iroot: 1, tda: false, solvModel: 'CPCM', solvent: 'acetonitrile', scf: 'TightSCF', molden: false },
      gauss: { job: 'td', method: 'CAM-B3LYP', basis: 'def2-TZVP', disp: 'none', nstates: 20, tdType: 'singlets', solvModel: 'CPCM', solvent: 'acetonitrile', chk: true } },
    { id: 'r2scan', label: 'Geometri murah r2SCAN-3c', desc: 'Optimasi cepat & akurat (ORCA); Gaussian: B3LYP-D3BJ/def2SVP.',
      orca: { job: 'opt', method: 'r2SCAN-3c', optLevel: 'TightOpt', solvModel: 'none', molden: false },
      gauss: { job: 'opt', method: 'B3LYP', basis: 'def2-SVP', disp: 'gd3bj', solvModel: 'none' } },
    { id: 'homolumo', label: 'HOMO/LUMO + molden', desc: 'SP B3LYP-D3BJ/def2-TZVP; cetak MO untuk orca_2mkl / fchk.',
      orca: { job: 'sp', method: 'B3LYP', basis: 'def2-TZVP', disp: 'D3BJ', rijcosx: true, molden: true, printMOs: true, cube: false, solvModel: 'none' },
      gauss: { job: 'sp', method: 'B3LYP', basis: 'def2-TZVP', disp: 'gd3bj', pop: 'full', chk: true, solvModel: 'none' } },
    { id: 'chain', label: 'Rantai opt → freq → TD (Gaussian) / opt+freq lalu TD (ORCA)', desc: 'Alur lengkap untuk pewarna: geometri, frekuensi, spektrum.',
      orca: { job: 'optfreq', method: 'B3LYP', basis: 'def2-SVP', disp: 'D3BJ', rijcosx: true, solvModel: 'CPCM', solvent: 'acetonitrile', molden: true },
      gauss: { job: 'chain', method: 'B3LYP', basis: '6-31G(d)', disp: 'gd3bj', chainFreq: true, chainTd: true, tdMethod: 'CAM-B3LYP', tdBasis: 'same', nstates: 10, solvModel: 'CPCM', solvent: 'acetonitrile', chk: true } },
    { id: 'esd', label: 'ESD — laju serapan (azobenzena)', desc: 'ESD(ABS) dengan Hessian GS/ES; sesuaikan nama file .hess.',
      orca: { job: 'esd', esdType: 'ABS', method: 'B3LYP', basis: 'def2-SVP', disp: 'none', rijcosx: true, nroots: 5, iroot: 1, doht: true, gsHess: 'gs.hess', esHess: 's1.hess', solvModel: 'none' }, gauss: {} },
  ];

  Object.assign(InputGen, { ORCA_METHODS, GAUSS_METHODS, BASIS_LIST, SOLVENTS, ORCA_JOBS, GAUSS_JOBS, PRESETS, orcaDefaults, gaussDefaults, orca: orcaInput, gaussian: gaussInput, validate, parseGeometry, parseXYZ, parseSDF, parseZmatrix, parseConstraints, nElectrons, formula, fileSafe, basisEstimate, recommendMaxcore, orcaBasis, gaussBasis });
  window.InputGen = InputGen;

  if (typeof document === 'undefined') return;

  /* ======================================================================
     BAGIAN 2 — ANTARMUKA
     ====================================================================== */
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const QC = window.QC;
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const state = {
    engine: 'orca', o: orcaDefaults(), g: gaussDefaults(),
    mol: { name: 'molekul', atoms: [], charge: 0, mult: 1, smiles: '' },
    scripts: { partition: 'cpu', time: '24:00:00', orcaModule: 'orca/6.0.0', orcaPath: '/opt/orca', gaussModule: 'gaussian/g16', dockerImage: 'orca:latest', jobName: '' },
    batchEngine: 'orca',
  };

  /* ---------- skema form ---------- */
  const opt = (arr) => arr.map(x => Array.isArray(x) ? x : [x, x]);
  const solvOpts = () => SOLVENTS.map(s => [s[0], s[1]]);
  const dispOrca = [['none', 'Tanpa'], ['D3BJ', 'D3BJ (Becke–Johnson)'], ['D3ZERO', 'D3 zero-damping'], ['D4', 'D4 (ORCA ≥ 5)']];
  const isOpt = (o) => ['opt', 'optfreq', 'ts', 'scan', 'tdopt', 'irc'].includes(o.job);
  const isFreq = (o) => ['optfreq', 'freq', 'ts'].includes(o.job);
  const isTD = (o) => ['td', 'stda', 'tdopt', 'esd'].includes(o.job);
  const orcaSchema = [
    { title: '1 · Pekerjaan & versi', open: true, f: [
      { k: 'version', l: 'Versi ORCA', t: 'select', o: [['6', 'ORCA 6.x'], ['5', 'ORCA 5.0.x'], ['4.2', 'ORCA 4.2 (lama)']] },
      { k: 'job', l: 'Tipe pekerjaan', t: 'select', o: ORCA_JOBS },
      { k: 'nprocs', l: 'Jumlah core (%pal)', t: 'number', min: 1, max: 256 },
      { k: 'maxcore', l: '%maxcore (MB per core)', t: 'number', min: 200, step: 100, hint: () => memHint() },
    ] },
    { title: '2 · Metode & basis set', open: true, f: [
      { k: 'method', l: 'Metode / fungsional', t: 'select', o: ORCA_METHODS.map(m => [m.id, m.label || m.id]) },
      { k: 'basis', l: 'Basis set', t: 'select', o: BASIS_LIST, show: o => (ORCA_M[o.method] || {}).kind !== '3c' },
      { k: 'disp', l: 'Koreksi dispersi', t: 'select', o: dispOrca, show: o => ['pure', 'hybrid', 'dh', 'hf'].includes((ORCA_M[o.method] || {}).kind) && !(ORCA_M[o.method] || {}).nodisp },
      { k: 'rijcosx', l: 'RIJCOSX + def2/J (percepat hibrida)', t: 'check', show: o => ['hybrid', 'hf', 'dh'].includes((ORCA_M[o.method] || {}).kind) },
      { k: 'auxC', l: 'Aux basis korelasi (/C)', t: 'select', o: ['AutoAux', 'def2-SVP/C', 'def2-TZVP/C', 'def2-QZVP/C'], show: o => ['dh', 'mp2', 'cc'].includes((ORCA_M[o.method] || {}).kind) },
      { k: 'pno', l: 'Ambang DLPNO', t: 'select', o: ['LoosePNO', 'NormalPNO', 'TightPNO'], show: o => o.method === 'DLPNO-CCSD(T)' },
      { k: 'basisAtoms', l: 'Basis per-atom (NewGTO) — satu baris "Unsur basis"', t: 'textarea', rows: 3, ph: 'Pt def2-TZVP\nS def2-TZVPP' },
    ] },
    { title: '3 · Pelarut (solvasi implisit)', f: [
      { k: 'solvModel', l: 'Model', t: 'select', o: [['none', 'Fase gas'], ['CPCM', 'CPCM'], ['SMD', 'SMD (CPCM + parameter SMD)']] },
      { k: 'solvent', l: 'Pelarut', t: 'select', o: solvOpts(), show: o => o.solvModel !== 'none' },
    ] },
    { title: '4 · SCF & grid', f: [
      { k: 'scf', l: 'Kriteria konvergensi', t: 'select', o: ['NormalSCF', 'TightSCF', 'VeryTightSCF'] },
      { k: 'maxiter', l: 'MaxIter SCF', t: 'number', min: 20, step: 25 },
      { k: 'scfConv', l: 'Bantuan konvergensi', t: 'select', o: [['default', 'Standar (DIIS/TRAH)'], ['slow', 'SlowConv'], ['veryslow', 'VerySlowConv'], ['kdiis', 'KDIIS + SOSCF']] },
      { k: 'shift', l: 'Level shift', t: 'check' },
      { k: 'shiftVal', l: 'Shift (Eh)', t: 'number', step: 0.1, show: o => o.shift }, { k: 'errOff', l: 'ErrOff', t: 'number', step: 0.05, show: o => o.shift },
      { k: 'guess', l: 'Tebakan awal (guess)', t: 'select', o: [['default', 'Default (PModel)'], ['PModel', 'PModel'], ['Hueckel', 'Hückel'], ['PAtom', 'PAtom'], ['MORead', 'MORead (dari .gbw)']] },
      { k: 'moinp', l: 'File .gbw untuk MORead', t: 'text', ph: 'prev.gbw', show: o => o.guess === 'MORead' },
      { k: 'reference', l: 'Fungsi gelombang acuan', t: 'select', o: [['auto', 'Otomatis'], ['RKS', 'RKS'], ['UKS', 'UKS'], ['ROKS', 'ROKS']] },
      { k: 'grid', l: 'Grid DFT', t: 'select', o: [['default', 'Default (DefGrid2)'], ['DefGrid1', 'DefGrid1'], ['DefGrid2', 'DefGrid2'], ['DefGrid3', 'DefGrid3 (halus)'], ['Grid4', 'Grid4 (ORCA 4)'], ['Grid5', 'Grid5 (ORCA 4)']] },
      { k: 'finalgrid', l: 'FinalGrid', t: 'select', o: [['default', 'Default'], ['FinalGrid4', 'FinalGrid4'], ['FinalGrid5', 'FinalGrid5'], ['FinalGrid6', 'FinalGrid6'], ['NoFinalGrid', 'NoFinalGrid']] },
    ] },
    { title: '5 · Optimasi geometri', f: [
      { k: 'optLevel', l: 'Tingkat konvergensi', t: 'select', o: [['Opt', 'Opt (normal)'], ['TightOpt', 'TightOpt'], ['VeryTightOpt', 'VeryTightOpt']], show: isOpt },
      { k: 'optMaxIter', l: 'MaxIter optimasi', t: 'number', min: 10, step: 10, show: isOpt },
      { k: 'hessGuess', l: 'Hessian awal (InHess)', t: 'select', o: [['default', 'Default (Almoef)'], ['Almoef', 'Almoef'], ['Lindh', 'Lindh'], ['Swart', 'Swart'], ['Fischer', 'Fischer'], ['Unit', 'Unit']], show: isOpt },
      { k: 'calcHess', l: 'Calc_Hess (hitung Hessian awal)', t: 'check', show: isOpt },
      { k: 'recalcHess', l: 'Recalc_Hess (setiap N langkah, 0 = nonaktif)', t: 'number', min: 0, show: isOpt },
      { k: 'constraints', l: 'Constraint (indeks atom mulai 1): B i j [nilai] · A i j k · D i j k l · C i', t: 'textarea', rows: 3, ph: 'B 1 2\nD 3 4 5 6 180.0', show: isOpt },
      { k: 'scanType', l: 'Scan: tipe', t: 'select', o: [['B', 'Ikatan'], ['A', 'Sudut'], ['D', 'Dihedral']], show: o => o.job === 'scan' },
      { k: 'scanAtoms', l: 'Scan: indeks atom (mulai 1)', t: 'text', show: o => o.job === 'scan' },
      { k: 'scanStart', l: 'Scan: awal', t: 'number', step: 0.1, show: o => o.job === 'scan' }, { k: 'scanEnd', l: 'Scan: akhir', t: 'number', step: 0.1, show: o => o.job === 'scan' },
      { k: 'scanSteps', l: 'Scan: jumlah langkah', t: 'number', min: 2, show: o => o.job === 'scan' },
      { k: 'ircDir', l: 'IRC: arah', t: 'select', o: ['both', 'forward', 'backward'], show: o => o.job === 'irc' }, { k: 'ircMaxIter', l: 'IRC: MaxIter', t: 'number', show: o => o.job === 'irc' },
      { k: 'ircHess', l: 'IRC: file Hessian TS', t: 'text', show: o => o.job === 'irc' },
    ] },
    { title: '6 · Frekuensi', f: [
      { k: 'numfreq', l: 'NumFreq (numerik)', t: 'check', show: isFreq }, { k: 'tempOn', l: 'Atur temperatur/tekanan', t: 'check', show: isFreq },
      { k: 'temp', l: 'Temperatur (K)', t: 'number', step: 0.05, show: o => isFreq(o) && o.tempOn }, { k: 'press', l: 'Tekanan (atm)', t: 'number', step: 0.1, show: o => isFreq(o) && o.tempOn },
    ] },
    { title: '7 · TDDFT / ESD', f: [
      { k: 'nroots', l: 'NRoots', t: 'number', min: 1, show: isTD }, { k: 'iroot', l: 'IRoot (keadaan target)', t: 'number', min: 1, show: isTD },
      { k: 'tda', l: 'Tamm–Dancoff (TDA)', t: 'check', show: o => isTD(o) && o.job !== 'stda' }, { k: 'triplets', l: 'Triplet (Triplets true)', t: 'check', show: isTD },
      { k: 'donto', l: 'NTO (DoNTO)', t: 'check', show: isTD }, { k: 'maxdim', l: 'MaxDim (0 = default)', t: 'number', min: 0, show: isTD },
      { k: 'esdType', l: 'ESD: jenis', t: 'select', o: [['ABS', 'ESD(ABS) serapan'], ['FLUOR', 'ESD(FLUOR) fluoresen'], ['ISC', 'ESD(ISC) intersystem crossing']], show: o => o.job === 'esd' },
      { k: 'gsHess', l: 'ESD: Hessian keadaan awal (.hess)', t: 'text', show: o => o.job === 'esd' }, { k: 'esHess', l: 'ESD: Hessian keadaan akhir (.hess)', t: 'text', show: o => o.job === 'esd' },
      { k: 'doht', l: 'Herzberg–Teller (DOHT)', t: 'check', show: o => o.job === 'esd' },
      { k: 'sroot', l: 'ISC: SRoot', t: 'number', show: o => o.job === 'esd' && o.esdType === 'ISC' }, { k: 'troot', l: 'ISC: TRoot', t: 'number', show: o => o.job === 'esd' && o.esdType === 'ISC' },
      { k: 'delE', l: 'ISC: DELE (cm⁻¹)', t: 'number', show: o => o.job === 'esd' && o.esdType === 'ISC' }, { k: 'esdTemp', l: 'ISC: temperatur (K)', t: 'number', show: o => o.job === 'esd' && o.esdType === 'ISC' },
    ] },
    { title: '8 · Keluaran & sifat', f: [
      { k: 'molden', l: 'Siapkan orbital (cetak MO + basis) untuk orca_2mkl -molden', t: 'check' },
      { k: 'printMOs', l: 'Print[P_MOs]', t: 'check' }, { k: 'printBasis', l: 'Print[P_Basis]', t: 'check' }, { k: 'hirshfeld', l: 'Hirshfeld (Print[P_Hirshfeld])', t: 'check' },
      { k: 'cube', l: 'Cube HOMO/LUMO via %plots (closed-shell)', t: 'check' }, { k: 'dipole', l: '%elprop Dipole', t: 'check' }, { k: 'polar', l: '%elprop Polar (polarizabilitas)', t: 'check' },
      { k: 'printLevel', l: 'PrintLevel', t: 'select', o: [['default', 'Default'], ['Mini', 'Mini'], ['Small', 'Small'], ['Normal', 'Normal'], ['Large', 'Large']] },
      { k: 'xyzfile', l: 'Baca geometri dari file (* xyzfile)', t: 'check' }, { k: 'header', l: 'Sertakan komentar header', t: 'check' },
      { k: 'extraBang', l: 'Keyword tambahan pada baris "!"', t: 'text', ph: 'KeepDens LargePrint' }, { k: 'extraBlocks', l: 'Blok tambahan (mentah)', t: 'textarea', rows: 3, ph: '%method\n  ...\nend' },
    ] },
  ];
  const gaussSchema = [
    { title: '1 · Pekerjaan & sumber daya (Link 0)', open: true, f: [
      { k: 'job', l: 'Tipe pekerjaan', t: 'select', o: GAUSS_JOBS }, { k: 'nproc', l: '%nprocshared', t: 'number', min: 1 },
      { k: 'mem', l: '%mem', t: 'number', min: 1 }, { k: 'memUnit', l: 'Satuan memori', t: 'select', o: ['GB', 'MB', 'MW'] },
      { k: 'chk', l: '%chk (checkpoint; wajib untuk HOMO/LUMO)', t: 'check' }, { k: 'oldchk', l: '%oldchk', t: 'text', ph: 'prev.chk' }, { k: 'rwf', l: '%rwf', t: 'check' },
      { k: 'title', l: 'Judul', t: 'text', ph: '(otomatis dari nama)' },
    ] },
    { title: '2 · Metode & basis set', open: true, f: [
      { k: 'method', l: 'Metode / fungsional', t: 'select', o: GAUSS_METHODS.map(m => [m.id, m.label || m.id]) },
      { k: 'basis', l: 'Basis set', t: 'select', o: BASIS_LIST.filter(b => !gaussNoBasis(b)) },
      { k: 'disp', l: 'empiricaldispersion', t: 'select', o: [['none', 'Tanpa'], ['gd3bj', 'GD3BJ'], ['gd3', 'GD3']] },
      { k: 'reference', l: 'Referensi', t: 'select', o: [['auto', 'Otomatis (R/U)'], ['R', 'Restricted (R)'], ['U', 'Unrestricted (U)'], ['RO', 'Restricted open-shell (RO)']] },
      { k: 'useGen', l: 'Paksa Gen/GenECP (blok basis manual)', t: 'check' },
      { k: 'heavyEcp', l: 'Basis+ECP atom berat (Z > 36)', t: 'select', o: ['LANL2DZ', 'def2'], hint: 'GenECP otomatis aktif untuk Z > 36 dengan basis Pople/cc.' },
    ] },
    { title: '3 · Pelarut', f: [
      { k: 'solvModel', l: 'Model SCRF', t: 'select', o: [['none', 'Fase gas'], ['PCM', 'PCM (IEFPCM)'], ['CPCM', 'CPCM'], ['SMD', 'SMD']] },
      { k: 'solvent', l: 'Pelarut', t: 'select', o: solvOpts(), show: g => g.solvModel !== 'none' },
    ] },
    { title: '4 · Opt / Freq / IRC', f: [
      { k: 'optTight', l: 'opt=tight', t: 'check', show: g => ['opt', 'optfreq', 'scan', 'chain'].includes(g.job) }, { k: 'optCalcfc', l: 'opt=calcfc', t: 'check', show: g => ['opt', 'optfreq', 'scan', 'chain', 'ts'].includes(g.job) },
      { k: 'optMaxcycles', l: 'maxcycles (0 = default)', t: 'number', min: 0, show: g => ['opt', 'optfreq', 'scan', 'chain', 'ts'].includes(g.job) },
      { k: 'constraints', l: 'Constraint (ModRedundant; atom mulai 1): B i j [nilai] · A i j k · D i j k l', t: 'textarea', rows: 3, ph: 'B 1 2\nD 3 4 5 6', show: g => ['opt', 'optfreq', 'chain'].includes(g.job) },
      { k: 'freqRaman', l: 'freq=raman', t: 'check', show: g => ['freq', 'optfreq', 'ts'].includes(g.job) || (g.job === 'chain' && g.chainFreq) },
      { k: 'freqHpmodes', l: 'freq=hpmodes', t: 'check', show: g => ['freq', 'optfreq', 'ts'].includes(g.job) || (g.job === 'chain' && g.chainFreq) },
      { k: 'scanType', l: 'Scan: tipe', t: 'select', o: [['B', 'Ikatan'], ['A', 'Sudut'], ['D', 'Dihedral']], show: g => g.job === 'scan' }, { k: 'scanAtoms', l: 'Scan: atom', t: 'text', show: g => g.job === 'scan' },
      { k: 'scanSteps', l: 'Scan: langkah', t: 'number', show: g => g.job === 'scan' }, { k: 'scanStep', l: 'Scan: ukuran langkah', t: 'number', step: 0.05, show: g => g.job === 'scan' },
      { k: 'ircMax', l: 'IRC: maxpoints', t: 'number', show: g => g.job === 'irc' }, { k: 'ircStep', l: 'IRC: stepsize', t: 'number', show: g => g.job === 'irc' },
    ] },
    { title: '5 · TD-DFT', f: [
      { k: 'nstates', l: 'nstates', t: 'number', min: 1, show: g => g.job === 'td' || (g.job === 'chain' && g.chainTd) },
      { k: 'tdType', l: 'Jenis keadaan', t: 'select', o: [['singlets', 'Singlet'], ['triplets', 'Triplet'], ['50-50', '50-50']], show: g => g.job === 'td' || (g.job === 'chain' && g.chainTd) },
      { k: 'tdRoot', l: 'root', t: 'number', min: 1, show: g => g.job === 'td' || (g.job === 'chain' && g.chainTd) }, { k: 'tdTda', l: 'TDA', t: 'check', show: g => g.job === 'td' || (g.job === 'chain' && g.chainTd) },
      { k: 'chainFreq', l: 'Rantai: sertakan langkah freq', t: 'check', show: g => g.job === 'chain' }, { k: 'chainTd', l: 'Rantai: sertakan langkah TD', t: 'check', show: g => g.job === 'chain' },
      { k: 'tdMethod', l: 'Rantai: fungsional langkah TD', t: 'select', o: [['same', 'Sama dengan opt'], 'CAM-B3LYP', 'wB97XD', 'PBE1PBE', 'M062X'], show: g => g.job === 'chain' && g.chainTd },
      { k: 'tdBasis', l: 'Rantai: basis langkah TD', t: 'select', o: [['same', 'Sama dengan opt'], 'def2-TZVP', '6-311+G(d,p)', 'aug-cc-pVDZ'], show: g => g.job === 'chain' && g.chainTd },
      { k: 'nmrGiao', l: 'NMR: GIAO', t: 'check', show: g => g.job === 'nmr' },
    ] },
    { title: '6 · SCF, integral, populasi', f: [
      { k: 'scfTight', l: 'scf=tight', t: 'check' }, { k: 'scfXqc', l: 'scf=xqc (konvergensi kuadratik)', t: 'check' }, { k: 'scfMax', l: 'scf maxcycles (0 = default)', t: 'number', min: 0 },
      { k: 'intUltra', l: 'int=ultrafine', t: 'check' }, { k: 'nosymm', l: 'nosymm', t: 'check' }, { k: 'gfinput', l: 'gfinput', t: 'check' },
      { k: 'pop', l: 'Analisis populasi', t: 'select', o: [['none', 'Tidak ada'], ['full', 'pop=full (cetak semua MO)'], ['nbo', 'pop=nbo'], ['nbo,full', 'pop=(nbo,full)'], ['mk', 'pop=mk (muatan ESP)']] },
      { k: 'geomCheck', l: 'geom=check guess=read (baca dari chk)', t: 'check' },
      { k: 'iops', l: 'IOp (pisahkan spasi)', t: 'text', ph: 'iop(9/40=4)' }, { k: 'extraRoute', l: 'Keyword route tambahan', t: 'text', ph: 'symmetry=none' },
    ] },
  ];

  /* ---------- form renderer ---------- */
  function renderForm(root, schema, obj) {
    root.innerHTML = '';
    const showers = [];
    schema.forEach(sec => {
      const d = QC.el('details', sec.open ? { open: true } : {}); d.append(QC.el('summary', null, sec.title));
      const grid = QC.el('div', { class: 'grid grid-2 ib-grid' });
      sec.f.forEach(f => {
        const id = 'f-' + root.id + '-' + f.k; let inp;
        if (f.t === 'select') inp = QC.el('select', { id }, opt(f.o).map(([v, l]) => QC.el('option', { value: v }, l)));
        else if (f.t === 'textarea') inp = QC.el('textarea', { id, rows: f.rows || 3, placeholder: f.ph || '', spellcheck: 'false' });
        else if (f.t === 'check') inp = QC.el('input', { id, type: 'checkbox' });
        else inp = QC.el('input', Object.assign({ id, type: f.t === 'number' ? 'number' : 'text', placeholder: f.ph || '' }, f.min != null ? { min: f.min } : {}, f.max != null ? { max: f.max } : {}, f.step ? { step: f.step } : { step: 'any' }));
        const val = obj[f.k];
        if (f.t === 'check') inp.checked = !!val; else inp.value = val == null ? '' : val;
        const ev = f.t === 'select' || f.t === 'check' ? 'change' : 'input';
        inp.addEventListener(ev, () => { obj[f.k] = f.t === 'check' ? inp.checked : f.t === 'number' ? (inp.value === '' ? '' : parseFloat(inp.value)) : inp.value; refresh(); });
        const wrap = f.t === 'check' ? QC.el('label', { class: 'check', for: id }, inp, f.l) : QC.el('div', { class: 'field' }, QC.el('label', { for: id }, f.l), inp);
        if (f.t === 'textarea' || f.k === 'basisAtoms' || f.k === 'constraints') wrap.style.gridColumn = '1 / -1';
        let hint = null; if (f.hint) { hint = QC.el('div', { class: 'hint' }); wrap.append(hint); }
        grid.append(wrap); showers.push({ f, wrap, inp, hint, obj });
      });
      d.append(grid); root.append(d);
    });
    root._sync = () => { showers.forEach(s => { const o = s.obj; if (s.f.show) s.wrap.classList.toggle('hidden', !s.f.show(o)); if (s.f.t === 'check') s.inp.checked = !!o[s.f.k]; else if (document.activeElement !== s.inp) s.inp.value = o[s.f.k] == null ? '' : o[s.f.k]; if (s.hint) s.hint.textContent = typeof s.f.hint === 'function' ? s.f.hint() : s.f.hint; }); };
    root._sync();
  }
  function memHint() {
    const nbf = basisEstimate(state.mol.atoms, state.o.basis); if (!nbf) return '';
    return `Rekomendasi: ~${recommendMaxcore(nbf, ['td', 'stda', 'tdopt', 'esd'].includes(state.o.job))} MB/core (≈${nbf} fungsi basis). Total = nprocs × maxcore.`;
  }

  /* ---------- Highlight ---------- */
  function highlight(text, engine) {
    return text.split('\n').map(line => {
      const e = esc(line);
      if (engine === 'orca') {
        if (/^\s*#/.test(line)) return '<span class="c-com">' + e + '</span>';
        if (/^\s*!/.test(line)) return '<span class="c-key">' + e + '</span>';
        if (/^\s*%/.test(line)) return '<span class="c-blk">' + e + '</span>';
        if (/^\s*\*/.test(line)) return '<span class="c-geo">' + e + '</span>';
        if (/^\s*end\s*$/i.test(line)) return '<span class="c-blk">' + e + '</span>';
        return e.replace(/^(\s*)([A-Za-z_\[\]\s]+?)(\s+)([^\s].*)$/, (m, a, b, c, d) => /^[A-Z][a-z]?\s*$/.test(b) ? m : a + '<span class="c-opt">' + b + '</span>' + c + d);
      }
      if (/^\s*%/.test(line)) return '<span class="c-blk">' + e + '</span>';
      if (/^\s*#/.test(line)) return '<span class="c-key">' + e + '</span>';
      if (/^--Link1--/.test(line)) return '<span class="c-geo">' + e + '</span>';
      if (/^\s*-?\d+\s+\d+\s*$/.test(line)) return '<span class="c-geo">' + e + '</span>';
      return e;
    }).join('\n');
  }

  /* ---------- Molekul ---------- */
  let viewer = null, viewerReady = null;
  function setMolecule(m, opts = {}) {
    Object.assign(state.mol, m);
    state.mol.atoms = m.atoms || state.mol.atoms;
    if (opts.persist !== false) QC.store.set('input.mol', state.mol);
    $('#mol-name').value = state.mol.name || '';
    $('#mol-charge').value = state.mol.charge || 0; $('#mol-mult').value = state.mol.mult || 1;
    refreshViewer(); refresh();
  }
  function atomsFromMolecule(m) {
    const r = parseGeometry(m.xyz || m.sdf || '');
    return r.atoms;
  }
  function refreshViewer() {
    const host = $('#viewer3d'); if (!host) return;
    const atoms = state.mol.atoms;
    if (!atoms.length) { host.innerHTML = '<div class="loading">Belum ada molekul</div>'; viewer = null; return; }
    const xyz = atoms.length + '\n' + (state.mol.name || '') + '\n' + atoms.map(a => `${a.el} ${a.x.toFixed(5)} ${a.y.toFixed(5)} ${a.z.toFixed(5)}`).join('\n');
    QC.load3Dmol().then($3Dmol => {
      host.innerHTML = '';
      viewer = $3Dmol.createViewer(host, { backgroundColor: getComputedStyle(host).backgroundColor || '#0f1d2e' });
      viewer.addModel(xyz, 'xyz'); viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.26 } }); viewer.zoomTo(); viewer.render();
    }).catch(() => { host.innerHTML = '<div class="loading">Pratinjau 3D tidak tersedia (3Dmol.js gagal dimuat). Input tetap dapat dibuat.</div>'; });
  }
  function loadFromText(text, label) {
    try {
      const r = parseGeometry(text);
      if (!r.atoms.length) { QC.toast('Tidak ada atom yang dapat dibaca.', 'err'); return; }
      const up = {}; up.atoms = r.atoms; if (r.charge) up.charge = r.charge; if (!state.mol.name || state.mol.name === 'molekul') up.name = label || 'molekul';
      if (label && !state.mol.atoms.length) up.name = label;
      // multiplisitas default sesuai paritas
      const ne = nElectrons(r.atoms, up.charge != null ? up.charge : state.mol.charge); const mult = ne % 2 === 0 ? 1 : 2;
      up.mult = mult; up.smiles = ''; up.source = 'manual';
      setMolecule(up); QC.toast(`Dimuat ${r.atoms.length} atom (format ${r.format}).`, 'ok');
    } catch (e) { QC.toast('Gagal membaca geometri: ' + e.message, 'err'); }
  }
  function loadFromBuilder(silent) {
    const m = QC.getMolecule();
    if (!m) { if (!silent) QC.toast('Belum ada molekul dari Molecular Builder. Buat molekul di sana lalu klik "Kirim ke Input Builder".', 'err'); return false; }
    const atoms = atomsFromMolecule(m);
    if (!atoms.length) { if (!silent) QC.toast('Molekul dari builder tidak memiliki koordinat 3D.', 'err'); return false; }
    setMolecule({ name: m.name || m.formula || 'molekul', smiles: m.smiles || '', atoms, charge: m.charge || 0, mult: m.mult || 1, source: 'builder' });
    if (!silent) QC.toast('Molekul dimuat dari Molecular Builder.', 'ok'); return true;
  }

  /* ---------- Refresh utama ---------- */
  function currentName() { return fileSafe(state.mol.name); }
  function generate(engine, mol) {
    mol = mol || state.mol; const nm = mol.name || 'molekul';
    return engine === 'orca' ? orcaInput(state.o, mol, nm) : gaussInput(state.g, mol, nm);
  }
  function refresh() {
    ['orca-form', 'gauss-form'].forEach(id => { const r = $('#' + id); if (r && r._sync) r._sync(); });
    // ringkasan
    const a = state.mol.atoms, ne = nElectrons(a, state.mol.charge);
    $('#sum-formula').textContent = a.length ? formula(a) : '—'; $('#sum-atoms').textContent = a.length || '—'; $('#sum-elec').textContent = a.length ? ne : '—';
    const mass = a.reduce((s, x) => s + (MASS[x.el] || 0), 0); $('#sum-mass').textContent = a.length ? mass.toFixed(2) : '—';
    const nbf = basisEstimate(a, state.engine === 'orca' ? state.o.basis : state.g.basis);
    $('#sum-nbf').textContent = a.length && nbf ? '~' + nbf : '—';
    const par = $('#parity'); par.className = 'callout hidden';
    if (a.length) { const bad = (ne % 2 === 0) !== (state.mol.mult % 2 === 1); par.className = 'callout ' + (bad ? 'err' : ''); par.innerHTML = bad ? `<strong>Paritas tidak cocok</strong>${ne} elektron (${ne % 2 ? 'ganjil' : 'genap'}) dengan multiplisitas ${state.mol.mult}. ${ne % 2 ? 'Gunakan mult 2, 4, …' : 'Gunakan mult 1, 3, …'}` : `<strong>Paritas OK</strong>${ne} elektron — multiplisitas ${state.mol.mult} konsisten.`; if (!bad) par.classList.add('ok-par'); }
    // output
    ['orca', 'gaussian'].forEach(eng => {
      const key = eng === 'orca' ? 'orca' : 'gauss'; const pre = $('#pre-' + key); const txt = state.mol.atoms.length ? generate(eng) : '(muat molekul terlebih dahulu)';
      pre.innerHTML = '<code>' + highlight(txt, eng) + '</code>'; pre.dataset.raw = txt;
      const warns = validate(eng, eng === 'orca' ? state.o : state.g, state.mol);
      const box = $('#val-' + key); box.innerHTML = '';
      warns.forEach(w => box.append(QC.el('div', { class: 'callout ' + (w.level === 'err' ? 'err' : w.level === 'warn' ? 'warn' : 'info') }, QC.el('strong', null, w.level === 'err' ? 'Kesalahan' : w.level === 'warn' ? 'Peringatan' : 'Catatan'), w.msg)));
      if (!warns.length) box.append(QC.el('div', { class: 'badge ok' }, '✓ Tidak ada masalah terdeteksi'));
      $('#fname-' + key).textContent = currentName() + (eng === 'orca' ? '.inp' : '.com');
    });
    renderScripts(); renderReminder();
    QC.store.set('input.state', { engine: state.engine, o: state.o, g: state.g, scripts: state.scripts });
  }

  /* ---------- Skrip job ---------- */
  function renderScripts() {
    const S = state.scripts, nm = currentName(); const jn = S.jobName || nm;
    const o = state.o, g = state.g;
    const orcaN = +o.nprocs || 1; const mem = Math.ceil(orcaN * (+o.maxcore || 2000) * 1.25 / 1000);
    const slurmOrca = `#!/bin/bash
#SBATCH --job-name=${jn}
#SBATCH --partition=${S.partition}
#SBATCH --nodes=1
#SBATCH --ntasks=${orcaN}
#SBATCH --mem=${mem}G
#SBATCH --time=${S.time}
#SBATCH --output=slurm-%j.out
#SBATCH --error=slurm-%j.err

# --- sesuaikan nama modul dengan HPC Anda (cek: module avail orca) ---
module purge
module load ${S.orcaModule}
module load openmpi

cd "$SLURM_SUBMIT_DIR"
# ORCA paralel harus dipanggil dengan path lengkap
ORCA_BIN=$(which orca)
$ORCA_BIN ${nm}.inp > ${nm}.out

# konversi orbital untuk Results Analyzer (HOMO/LUMO)
[ -f ${nm}.gbw ] && orca_2mkl ${nm} -molden   # menghasilkan ${nm}.molden.input
`;
    const gMemGB = g.memUnit === 'GB' ? +g.mem : g.memUnit === 'MB' ? Math.ceil(+g.mem / 1000) : Math.ceil(+g.mem * 8 / 1000);
    const slurmGauss = `#!/bin/bash
#SBATCH --job-name=${jn}
#SBATCH --partition=${S.partition}
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=${g.nproc}
#SBATCH --mem=${Math.ceil(gMemGB * 1.2)}G
#SBATCH --time=${S.time}
#SBATCH --output=slurm-%j.out

module purge
module load ${S.gaussModule}
export GAUSS_SCRDIR=\${TMPDIR:-/tmp}/$SLURM_JOB_ID
mkdir -p $GAUSS_SCRDIR

cd "$SLURM_SUBMIT_DIR"
g16 < ${nm}.com > ${nm}.log

# checkpoint -> fchk (untuk orbital di Results Analyzer)
[ -f ${nm}.chk ] && formchk ${nm}.chk ${nm}.fchk
`;
    const docker = `# ORCA di Docker (image dibangun sendiri dari paket ORCA berlisensi Anda — lihat backend/orca-image/)
docker run --rm -v "$PWD":/work -w /work ${S.dockerImage} \\
    orca ${nm}.inp > ${nm}.out

# konversi orbital
docker run --rm -v "$PWD":/work -w /work ${S.dockerImage} orca_2mkl ${nm} -molden
`;
    const local = `# Gaussian lokal
g16 < ${nm}.com > ${nm}.log
formchk ${nm}.chk ${nm}.fchk

# ORCA lokal (path lengkap wajib bila paralel)
$(which orca) ${nm}.inp > ${nm}.out
orca_2mkl ${nm} -molden
`;
    $('#script-slurm-orca').textContent = slurmOrca; $('#script-slurm-gauss').textContent = slurmGauss;
    $('#script-docker').textContent = docker; $('#script-local').textContent = local;
  }
  function renderReminder() {
    const nm = currentName();
    $('#reminder-files').innerHTML = state.engine === 'orca'
      ? `<li><code>${nm}.out</code> — output utama (geometri, frekuensi, energi, TDDFT).</li><li><code>${nm}.molden.input</code> — jalankan <code>orca_2mkl ${nm} -molden</code> setelah selesai (butuh <code>${nm}.gbw</code>).</li>`
      : `<li><code>${nm}.log</code> — output utama.</li><li><code>${nm}.fchk</code> — jalankan <code>formchk ${nm}.chk ${nm}.fchk</code> (butuh <code>%chk</code>).</li>`;
  }

  /* ---------- Batch ---------- */
  async function runBatch() {
    const text = $('#batch-text').value; const eng = state.batchEngine; const list = $('#batch-list'); list.innerHTML = '';
    const items = [];
    // 1) blok XYZ berurutan
    const lines = text.replace(/\r/g, '').split('\n'); let i = 0; const smilesLines = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (/^\d+$/.test(l)) { const n = parseInt(l, 10); const block = lines.slice(i, i + 2 + n).join('\n'); const atoms = parseXYZ(block); const nm = (lines[i + 1] || '').trim().split(/\s+/)[0] || ('mol' + (items.length + 1)); if (atoms.length) items.push({ name: nm, atoms }); i += 2 + n; }
      else { if (l) smilesLines.push(l); i++; }
    }
    // 2) baris "nama SMILES"
    const conv = (window.MolBuilder && window.MolBuilder.smilesTo3D) || QC.smilesTo3D;
    const pending = [];
    for (const l of smilesLines) {
      const p = l.split(/\s+/); const nm = p.length > 1 ? p[0] : 'mol' + (items.length + pending.length + 1); const smi = p.length > 1 ? p[1] : p[0];
      if (conv) { try { const r = await conv(smi); const atoms = parseGeometry(r.xyz || r).atoms; if (atoms.length) { items.push({ name: nm, atoms, smiles: smi }); continue; } } catch (e) { /* jatuh ke pending */ } }
      pending.push(nm + ' ' + smi);
    }
    const series = QC.store.get('series'); if (!items.length && !pending.length && Array.isArray(series)) series.forEach(s => { const atoms = parseGeometry(s.xyz || '').atoms; if (atoms.length) items.push({ name: s.name || 'mol', atoms, charge: s.charge, mult: s.mult }); });
    const files = [];
    items.forEach(it => {
      const ne = nElectrons(it.atoms, it.charge != null ? it.charge : state.mol.charge); const mult = it.mult || (ne % 2 === 0 ? 1 : 2);
      const mol = { name: it.name, atoms: it.atoms, charge: it.charge != null ? it.charge : state.mol.charge, mult };
      const txt = generate(eng, mol); const fn = fileSafe(it.name) + (eng === 'orca' ? '.inp' : '.com');
      const w = validate(eng, eng === 'orca' ? state.o : state.g, mol).filter(x => x.level === 'err');
      files.push({ fn, txt, name: it.name, w });
      list.append(QC.el('tr', null, QC.el('td', null, it.name), QC.el('td', { class: 'num' }, formula(it.atoms)), QC.el('td', { class: 'num' }, it.atoms.length), QC.el('td', null, fn),
        QC.el('td', null, w.length ? QC.el('span', { class: 'badge err', title: w.map(x => x.msg).join('\n') }, 'perlu perhatian') : QC.el('span', { class: 'badge ok' }, 'OK')),
        QC.el('td', null, QC.el('button', { class: 'btn btn-sm', onclick: () => QC.download(fn, txt) }, 'Unduh'), ' ', QC.el('button', { class: 'btn btn-sm', onclick: () => { $('#batch-preview').textContent = txt; } }, 'Lihat'))));
    });
    pending.forEach(p => list.append(QC.el('tr', null, QC.el('td', null, p.split(' ')[0]), QC.el('td', { colspan: 4, class: 'muted' }, 'SMILES memerlukan koordinat 3D — hasilkan lewat Molecular Builder (Generate 3D) lalu tempel XYZ-nya di sini.'), QC.el('td'))));
    batchFiles = files; $('#batch-actions').classList.toggle('hidden', !files.length);
    $('#batch-count').textContent = files.length ? `${files.length} input dihasilkan` : 'Tidak ada input dihasilkan.';
  }
  let batchFiles = [];
  function batchScript() {
    return '#!/bin/bash\n# Membuat semua file input batch. Jalankan: bash make_inputs.sh\n' + batchFiles.map(f => `cat > ${f.fn} <<'QC_EOF'\n${f.txt}QC_EOF\n`).join('\n') + `\necho "Selesai: ${batchFiles.length} file"\n`;
  }

  /* ---------- Preset ---------- */
  function applyPreset(id) {
    const p = PRESETS.find(x => x.id === id); if (!p) return;
    Object.assign(state.o, p.orca || {}); Object.assign(state.g, p.gauss || {});
    renderForm($('#orca-form'), orcaSchema, state.o); renderForm($('#gauss-form'), gaussSchema, state.g); refresh();
    QC.toast('Preset diterapkan: ' + p.label, 'ok');
  }

  /* ---------- Init ---------- */
  function init() {
    const saved = QC.store.get('input.state');
    if (saved) { Object.assign(state.o, saved.o || {}); Object.assign(state.g, saved.g || {}); Object.assign(state.scripts, saved.scripts || {}); if (saved.engine) state.engine = saved.engine; }
    renderForm($('#orca-form'), orcaSchema, state.o); renderForm($('#gauss-form'), gaussSchema, state.g);
    // preset
    const ps = $('#presets'); PRESETS.forEach(p => ps.append(QC.el('button', { class: 'btn btn-sm preset', title: p.desc, onclick: () => applyPreset(p.id) }, p.label)));
    // tab
    const hashMap = { '#orca': 'tab-orca', '#gaussian': 'tab-gauss', '#gauss': 'tab-gauss', '#batch': 'tab-batch', '#scripts': 'tab-scripts', '#help': 'tab-help' };
    const tabsApi = QC.tabs($('#engine-tabs'), { onChange: id => { if (id === 'tab-orca') state.engine = 'orca'; if (id === 'tab-gauss') state.engine = 'gaussian'; refresh(); try { history.replaceState(null, '', '#' + ({ 'tab-orca': 'orca', 'tab-gauss': 'gaussian', 'tab-batch': 'batch', 'tab-scripts': 'scripts', 'tab-help': 'help' })[id]); } catch (e) { /* abaikan */ } } });
    const start = hashMap[location.hash] || (state.engine === 'gaussian' ? 'tab-gauss' : 'tab-orca');
    tabsApi.select(start, true); if (start === 'tab-gauss') state.engine = 'gaussian'; else if (start === 'tab-orca') state.engine = 'orca';
    window.addEventListener('hashchange', () => { const t = hashMap[location.hash]; if (t) { tabsApi.select(t); } });
    // molekul
    $('#mol-name').addEventListener('input', e => { state.mol.name = e.target.value; QC.store.set('input.mol', state.mol); refresh(); });
    $('#mol-charge').addEventListener('input', e => { state.mol.charge = parseInt(e.target.value, 10) || 0; const ne = nElectrons(state.mol.atoms, state.mol.charge); if ((ne % 2 === 0) !== (state.mol.mult % 2 === 1)) { state.mol.mult = ne % 2 === 0 ? 1 : 2; $('#mol-mult').value = state.mol.mult; } QC.store.set('input.mol', state.mol); refresh(); });
    $('#mol-mult').addEventListener('input', e => { state.mol.mult = Math.max(1, parseInt(e.target.value, 10) || 1); QC.store.set('input.mol', state.mol); refresh(); });
    $('#btn-from-builder').addEventListener('click', () => loadFromBuilder(false));
    $('#btn-parse').addEventListener('click', () => loadFromText($('#mol-paste').value, state.mol.name));
    $('#mol-paste').addEventListener('paste', () => setTimeout(() => { if ($('#mol-paste').value.trim().length > 10) loadFromText($('#mol-paste').value, state.mol.name); }, 50));
    QC.dropZone($('#mol-drop'), async files => { const f = files[0]; const t = await QC.readFile(f); $('#mol-paste').value = t; loadFromText(t, f.name.replace(/\.[^.]+$/, '')); });
    $$('.example-btn').forEach(b => b.addEventListener('click', () => { $('#mol-paste').value = EXAMPLES[b.dataset.ex].xyz; state.mol.name = EXAMPLES[b.dataset.ex].name; loadFromText(EXAMPLES[b.dataset.ex].xyz, EXAMPLES[b.dataset.ex].name); }));
    // aksi output
    [['orca', 'orca', '.inp'], ['gauss', 'gaussian', '.com']].forEach(([key, eng, ext]) => {
      $('#copy-' + key).addEventListener('click', () => QC.copy($('#pre-' + key).dataset.raw || ''));
      $('#dl-' + key).addEventListener('click', () => QC.download(currentName() + ext, $('#pre-' + key).dataset.raw || ''));
    });
    $('#send-docker').addEventListener('click', () => {
      if (!state.mol.atoms.length) { QC.toast('Muat molekul dulu.', 'err'); return; }
      const errs = validate('orca', state.o, state.mol).filter(w => w.level === 'err'); if (errs.length && !confirm('Input memiliki kesalahan:\n- ' + errs.map(e => e.msg).join('\n- ') + '\n\nTetap kirim ke ORCA Docker?')) return;
      QC.store.set('pendingJob', { name: currentName(), input_text: generate('orca'), engine: 'orca', ts: Date.now() }); QC.store.set('orcaInput', { name: currentName(), text: generate('orca'), engine: 'orca', ts: Date.now() }); location.href = 'orca-docker.html';
    });
    $('#dl-xyz').addEventListener('click', () => { const a = state.mol.atoms; QC.download(currentName() + '.xyz', a.length + '\n' + (state.mol.name || '') + '\n' + a.map(x => `${x.el.padEnd(3)}${x.x.toFixed(6).padStart(14)}${x.y.toFixed(6).padStart(14)}${x.z.toFixed(6).padStart(14)}`).join('\n') + '\n'); });
    // batch
    $$('input[name=batch-eng]').forEach(r => r.addEventListener('change', () => { state.batchEngine = r.value; }));
    $('#batch-run').addEventListener('click', runBatch);
    $('#batch-dl-sh').addEventListener('click', () => QC.download('make_inputs.sh', batchScript()));
    $('#batch-dl-all').addEventListener('click', () => batchFiles.forEach((f, i) => setTimeout(() => QC.download(f.fn, f.txt), i * 250)));
    $('#batch-load-series').addEventListener('click', () => { const s = QC.store.get('series'); if (!Array.isArray(s) || !s.length) { QC.toast('Belum ada seri dari Molecular Builder.', 'err'); return; } $('#batch-text').value = s.map(m => m.xyz).join('\n'); QC.toast(`${s.length} molekul dimuat.`, 'ok'); });
    // skrip
    [['s-partition', 'partition'], ['s-time', 'time'], ['s-orca-mod', 'orcaModule'], ['s-gauss-mod', 'gaussModule'], ['s-image', 'dockerImage'], ['s-job', 'jobName']].forEach(([id, k]) => { const e = $('#' + id); e.value = state.scripts[k] || ''; e.addEventListener('input', () => { state.scripts[k] = e.value; refresh(); }); });
    $$('[data-copy-target]').forEach(b => b.addEventListener('click', () => QC.copy($('#' + b.dataset.copyTarget).textContent)));
    $$('[data-dl-target]').forEach(b => b.addEventListener('click', () => QC.download(b.dataset.dlName.replace('{n}', currentName()), $('#' + b.dataset.dlTarget).textContent)));
    // molekul awal
    const savedMol = QC.store.get('input.mol');
    if (!loadFromBuilder(true) && savedMol && savedMol.atoms && savedMol.atoms.length) setMolecule(savedMol, { persist: false });
    else if (!state.mol.atoms.length) { refreshViewer(); refresh(); }
    QC.onTheme(() => { if (state.mol.atoms.length) refreshViewer(); });
  }
  const EXAMPLES = {
    h2o: { name: 'air', xyz: '3\nH2O\nO 0.000000 0.000000 0.117790\nH 0.000000 0.755453 -0.471161\nH 0.000000 -0.755453 -0.471161\n' },
    ch2o: { name: 'formaldehida', xyz: '4\nCH2O\nC 0.000000 0.000000 -0.529000\nO 0.000000 0.000000 0.676000\nH 0.000000 0.934000 -1.108000\nH 0.000000 -0.934000 -1.108000\n' },
    benzene: { name: 'benzena', xyz: '12\nC6H6\nC 0.000 1.396 0.000\nC 1.209 0.698 0.000\nC 1.209 -0.698 0.000\nC 0.000 -1.396 0.000\nC -1.209 -0.698 0.000\nC -1.209 0.698 0.000\nH 0.000 2.479 0.000\nH 2.147 1.240 0.000\nH 2.147 -1.240 0.000\nH 0.000 -2.479 0.000\nH -2.147 -1.240 0.000\nH -2.147 1.240 0.000\n' },
  };
  window.InputBuilderUI = { state, refresh, applyPreset, loadFromText };
  document.addEventListener('DOMContentLoaded', init);
})();
