/* ==========================================================================
   parsers.js — parser keluaran ORCA (5.x/6.x) dan Gaussian (09/16)
   Tanpa DOM. Browser: window.QC.parse ; Node: module.exports.
   Satuan: koordinat Å, energi Eh (hartree) kecuali dinamai lain, frekuensi cm^-1.
   Konvensi indeks: SEMUA indeks orbital pada output (orbitals.alpha[i].i, homo, lumo,
   transitions.from/to) berbasis-0 menurut urutan energi — ORCA (native 0-based) dan
   Gaussian (native 1-based, dikonversi). Teks asli tersedia di fromRaw/toRaw.
   ========================================================================== */
(function (root) {
  'use strict';

  const SYM = ['X', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'];
  const EV = 27.211386245988, AU_DEBYE = 2.541746473, NM_EV = 1239.84198, KCAL = 627.5094740631;

  const lines_ = t => t.replace(/\r/g, '').split('\n');
  const fnum = s => parseFloat(String(s).replace(/[dD]/, 'E'));
  const NUM = '-?\\d+\\.\\d+(?:[EeDd][-+]?\\d+)?';
  function allIdx(L, re) { const o = []; for (let i = 0; i < L.length; i++) if (re.test(L[i])) o.push(i); return o; }
  function lastIdx(L, re, from, to) { for (let i = (to == null ? L.length : to) - 1; i >= (from || 0); i--) if (re.test(L[i])) return i; return -1; }
  function firstIdx(L, re, from) { for (let i = from || 0; i < L.length; i++) if (re.test(L[i])) return i; return -1; }

  function formulaOf(atoms) {
    const c = {}; atoms.forEach(a => c[a.el] = (c[a.el] || 0) + 1);
    const keys = Object.keys(c).sort((a, b) => a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b));
    return keys.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
  }
  function orbLabel(idx, homo, lumo) {
    if (homo == null || idx == null) return null;
    if (idx <= homo) { const d = homo - idx; return d === 0 ? 'HOMO' : 'HOMO-' + d; }
    const d = idx - lumo; return d === 0 ? 'LUMO' : 'LUMO+' + d;
  }
  function skeleton(program, filename) {
    return {
      program, version: null, filename: filename || null, terminatedNormally: false, jobTypes: [], method: null, functional: null,
      basis: null, dispersion: null, solvent: null, charge: null, mult: null, nAtoms: 0, formula: null,
      geometry: { atoms: [], source: 'input', converged: null }, trajectory: [],
      scf: { finalEh: null, iterations: [], converged: null },
      opt: { converged: null, cycles: [] }, freq: null, orbitals: null, tddft: null, dipole: null, charges: null,
      timing: { totalSec: null }, warnings: [], energyEh: null,
    };
  }
  function finalize(r) {
    r.nAtoms = r.geometry.atoms.length;
    if (r.nAtoms) r.formula = formulaOf(r.geometry.atoms);
    r.energyEh = r.scf.finalEh;
    if (r.freq) {
      r.freq.nImag = r.freq.freqs.filter(f => f < 0).length;
      if (r.freq.nImag) r.warnings.push(r.freq.nImag + ' frekuensi imajiner terdeteksi (' + r.freq.freqs.filter(f => f < 0).map(f => f.toFixed(1)).join(', ') + ' cm⁻¹) — geometri bukan minimum.');
      if (r.jobTypes.indexOf('freq') < 0) r.jobTypes.push('freq');
    }
    if (r.tddft && r.jobTypes.indexOf('tddft') < 0) r.jobTypes.push('tddft');
    if (r.opt.converged === false) r.warnings.push('Optimisasi geometri belum konvergen.');
    if (!r.terminatedNormally) r.warnings.push('Tidak ada penanda terminasi normal — job mungkin belum selesai atau gagal.');
    if (r.scf.converged === false) r.warnings.push('SCF tidak konvergen.');
    r.warnings = Array.from(new Set(r.warnings)).slice(0, 40);
    return r;
  }
  function setHomoLumo(orb, R) { // orb: {alpha, beta}
    const hl = arr => { let h = -1; arr.forEach((o, k) => { if (o.occ > 1e-6) h = k; }); return h; };
    const hA = hl(orb.alpha), hB = orb.beta ? hl(orb.beta) : -1;
    const eh = (arr, i) => (i >= 0 && i < arr.length) ? arr[i].ev : null;
    orb.spinRestricted = !orb.beta;
    orb.homoAlpha = hA; orb.lumoAlpha = hA + 1; orb.homoBeta = orb.beta ? hB : null; orb.lumoBeta = orb.beta ? hB + 1 : null;
    orb.homo = hA; orb.lumo = hA + 1;
    let hEv = eh(orb.alpha, hA), lEv = eh(orb.alpha, hA + 1);
    if (orb.beta) {
      const hb = eh(orb.beta, hB), lb = eh(orb.beta, hB + 1);
      if (hb != null && (hEv == null || hb > hEv)) hEv = hb;
      if (lb != null && (lEv == null || lb < lEv)) lEv = lb;
    }
    orb.homoEv = hEv; orb.lumoEv = lEv; orb.gapEv = (hEv != null && lEv != null) ? lEv - hEv : null;
    return orb;
  }
  const spinHomo = (orb, spin) => !orb ? null : (spin === 'b' && orb.beta) ? [orb.homoBeta, orb.lumoBeta] : [orb.homoAlpha, orb.lumoAlpha];

  /* ====================================================================== */
  /*                                 ORCA                                    */
  /* ====================================================================== */
  const O_BASIS = /^(def2-|ma-def2|def2$|cc-p|aug-cc|jun-cc|may-cc|6-31|6-311|sto-|pc-|aug-pc|dkh|x2c|zora|sarc|svp$|tzvp$|qzvp$|lanl|gen$|genecp$)/i;
  const O_SKIP = /^(opt|tightopt|verytightopt|loosopt|looseopt|normalopt|copt|zopt|gdiis-?opt|freq|numfreq|anfreq|sp|tightscf|verytightscf|normalscf|loosescf|strongscf|extremescf|rijcosx|rijk|rik|ri|nori|autoaux|autoauxsize.*|defgrid\d|grid\d|finalgrid\d|nofinalgrid|nopop|miniprint|normalprint|largeprint|printbasis|printmos|pal\d+|nprocs.*|moread|noiter|slowconv|veryslowconv|keepdens|uno|uks|rks|uhf|rhf|roks|d3bj|d3zero|d3|d4|d2|nod3|nod4|cpcm.*|cosmo.*|smd.*|alpb.*|xtb.*|engrad|enegrad|tddft|bohrs|angs|xyzfile|opt-?ts|optts|scants|irc|md|nbo|keepfock|fastopt|nopop|uso|nomoprint|lowdin|mulliken|hirshfeld|chelpg|printgap|trah|soscf|kdiis|diis|nofrozencore|frozencore|fc|nofc|autostart|conv|noautostart|usesym|nousesym|hess.*|calcfc|numgrad|numhess)$/i;

  function parseOrcaInput(L, r) {
    const inp = []; let inInput = false;
    for (const l of L.slice(0, 600)) {
      const m = /^\|\s*\d+>\s?(.*)$/.exec(l);
      if (m) { inp.push(m[1]); inInput = true; } else if (inInput && /END OF INPUT/.test(l)) break;
    }
    const kw = [], rest = [];
    inp.forEach(l => { if (/^\s*!/.test(l)) kw.push(...l.replace(/^\s*!/, '').split(/\s+/).filter(Boolean)); else rest.push(l); });
    const joined = rest.join('\n');
    const toks = kw;
    const jt = [];
    if (toks.some(t => /^(opt|tightopt|verytightopt|looseopt|loosopt|normalopt|copt|zopt|gdiis-?opt|opt-?ts|optts)$/i.test(t))) jt.push('opt');
    if (toks.some(t => /^(freq|numfreq|anfreq)$/i.test(t))) jt.push('freq');
    if (/%\s*tddft/i.test(joined) || /^\s*tddft/i.test(toks.join(' '))) jt.push('tddft');
    if (toks.some(t => /^(optts|opt-?ts)$/i.test(t))) jt.push('ts');
    r.jobTypes = jt;
    let basis = null, method = null, disp = null, solv = null;
    toks.forEach(t => {
      if (/^(d3bj|d3zero|d3|d4|d2)$/i.test(t)) disp = t.toUpperCase();
      else if (/^(cpcm|cosmo|smd|alpb)/i.test(t)) { const m = /^(\w+)\((.*)\)/.exec(t); solv = m ? m[1].toUpperCase() + ' (' + m[2] + ')' : t; }
      else if (t.indexOf('/') < 0 && O_BASIS.test(t) && !basis) basis = t;
      else if (!method && !O_SKIP.test(t) && t.indexOf('/') < 0 && !/^\d/.test(t)) method = t;
    });
    const sm = /SMDsolvent\s+"?([\w\- ]+?)"?\s*$/im.exec(joined); if (sm) solv = 'SMD (' + sm[1] + ')';
    const cp = /%\s*cpcm[\s\S]*?\bend\b/i.exec(joined);
    if (cp && !solv) { const e = /epsilon\s+([\d.]+)/i.exec(cp[0]); solv = 'CPCM' + (e ? ' (ε=' + e[1] + ')' : ''); }
    const b2 = /%\s*basis[\s\S]*?\bend\b/i.exec(joined); if (b2 && !basis) basis = 'custom (%basis)';
    r.method = method; r.functional = method; r.basis = basis; r.dispersion = disp; r.solvent = solv;
    const cm = /^\s*\*\s*(?:xyz|xyzfile|int|gzmt)\s+(-?\d+)\s+(\d+)/im.exec(joined);
    if (cm) { r.charge = +cm[1]; r.mult = +cm[2]; }
    r.inputText = inp.join('\n');
  }

  function orcaCoordBlock(L, i) { // i = index of heading line
    let k = i + 1; const atoms = [];
    while (k < L.length && /^-{3,}\s*$/.test(L[k].trim())) k++;
    for (; k < L.length; k++) {
      const m = /^\s*([A-Za-z]{1,2})[A-Za-z0-9:]*\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/.exec(L[k]);
      if (!m) break;
      const el = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      atoms.push({ el: SYM.indexOf(el) > 0 ? el : m[1].charAt(0).toUpperCase(), x: +m[2], y: +m[3], z: +m[4] });
    }
    return atoms;
  }

  function parseOrcaOrbs(L) {
    const s = lastIdx(L, /^\s*ORBITAL ENERGIES\s*$/);
    if (s < 0) return null;
    const out = { alpha: [], beta: null };
    let spin = 'a', seenRows = false;
    for (let k = s + 1; k < L.length; k++) {
      const l = L[k];
      if (/SPIN DOWN/i.test(l)) { spin = 'b'; out.beta = []; continue; }
      const m = /^\s*(\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/.exec(l);
      if (m) {
        const o = { i: +m[1], occ: +m[2], eh: +m[3], ev: +m[4] };
        (spin === 'a' ? out.alpha : out.beta).push(o); seenRows = true; continue;
      }
      if (!seenRows) { if (k - s > 12) break; continue; }
      if (/^\s*$/.test(l)) {
        let n = k + 1; while (n < L.length && /^\s*$/.test(L[n])) n++;
        if (n < L.length && /SPIN DOWN|^\s*NO\s+OCC/i.test(L[n])) continue;
        break;
      }
      if (/Only the first|^\s*\*/.test(l)) continue;
      if (/^-{3,}|FINAL|MULLIKEN|Total|[A-Z]{4,}/.test(l.trim())) break;
    }
    if (!out.alpha.length) return null;
    return setHomoLumo(out);
  }

  function parseOrcaFreq(L) {
    const s = lastIdx(L, /^\s*VIBRATIONAL FREQUENCIES\s*$/);
    if (s < 0) return null;
    const all = []; // {idx,f}
    for (let k = s + 1; k < L.length; k++) {
      const m = /^\s*(\d+):\s+(-?\d+\.\d+)\s*cm\*\*-1/.exec(L[k]);
      if (m) { all.push({ idx: +m[1], f: +m[2], imag: /imaginary/i.test(L[k]) }); continue; }
      if (all.length && /^\s*$/.test(L[k])) { if (k + 1 < L.length && /^\s*$/.test(L[k + 1])) break; continue; }
      if (all.length && /^-{3,}|[A-Za-z]{4,}/.test(L[k].trim())) break;
    }
    const vib = all.filter(a => !(Math.abs(a.f) < 1e-6));
    const res = { freqs: vib.map(a => a.imag && a.f > 0 ? -a.f : a.f), irInt: vib.map(() => 0), nImag: 0, modes: [], thermo: null, modeIdx: vib.map(a => a.idx) };
    // IR spectrum
    const ir = lastIdx(L, /^\s*IR SPECTRUM\s*$/);
    if (ir >= 0) {
      const map = {};
      for (let k = ir + 1; k < Math.min(L.length, ir + 4 + all.length * 2 + 20); k++) {
        const m = /^\s*(\d+):\s+(-?\d+\.\d+)\s+(-?[\d.]+(?:[Ee][-+]?\d+)?)\s+(-?[\d.]+(?:[Ee][-+]?\d+)?)\s+(-?[\d.]+(?:[Ee][-+]?\d+)?)/.exec(L[k]);
        if (m) map[+m[1]] = +m[4];
      }
      res.irInt = vib.map(a => map[a.idx] != null ? map[a.idx] : 0);
    }
    // normal modes
    const nm = lastIdx(L, /^\s*NORMAL MODES\s*$/);
    if (nm >= 0) {
      const cols = {}; let k = nm + 1, curCols = null;
      for (; k < L.length; k++) {
        const l = L[k];
        if (/^\s*(\d+\s+)+\d+\s*$/.test(l) && !/\./.test(l)) { curCols = l.trim().split(/\s+/).map(Number); curCols.forEach(c => { if (!cols[c]) cols[c] = []; }); continue; }
        const m = /^\s*(\d+)\s+((?:-?\d+\.\d+\s*)+)$/.exec(l);
        if (m && curCols) { const vals = m[2].trim().split(/\s+/).map(Number); vals.forEach((v, j) => { if (curCols[j] != null) cols[curCols[j]][+m[1]] = v; }); continue; }
        if (/^-{3,}|^\s*[A-Z]{4,}/.test(l.trim()) && Object.keys(cols).length && !/^\s*These|^\s*Thus|^\s*M\(i,i\)/.test(l)) break;
      }
      res.modes = vib.map(a => {
        const v = cols[a.idx]; if (!v) return null;
        const d = []; for (let i = 0; i + 2 < v.length; i += 3) d.push([v[i], v[i + 1], v[i + 2]]);
        return { freq: a.f, disp: d };
      }).filter(Boolean);
      if (res.modes.length !== vib.length) res.modes = [];
    }
    // thermo
    const th = lastIdx(L, /THERMOCHEMISTRY AT/);
    if (th >= 0) {
      const t = {}; const seg = L.slice(th, th + 80);
      const getv = (re) => { for (const l of seg) { const m = re.exec(l); if (m) return fnum(m[1]); } return null; };
      t.T_K = getv(/^Temperature\s+\.\.\.\s+(\d+\.\d+)/); t.P_atm = getv(/^Pressure\s+\.\.\.\s+(\d+\.\d+)/);
      t.electronicEh = getv(/^Electronic energy\s+\.\.\.\s+(-?\d+\.\d+)/);
      t.zpeEh = getv(/^Zero point energy\s+\.\.\.\s+(-?\d+\.\d+)/);
      t.EthEh = getv(/^Total thermal energy\s+(-?\d+\.\d+)/);
      t.HEh = getv(/^Total Enthalpy\s+\.\.\.\s+(-?\d+\.\d+)/);
      t.TSEh = getv(/^Final entropy term\s+\.\.\.\s+(-?\d+\.\d+)/);
      t.GEh = getv(/^Final Gibbs free energy\s+\.\.\.\s+(-?\d+\.\d+)/);
      Object.assign(t, { zpe: t.zpeEh, Etot: t.EthEh, H: t.HEh, G: t.GEh, S: t.TSEh, T: t.T_K, P: t.P_atm });
      res.thermo = t;
    }
    return res;
  }

  function parseOrcaTD(L, orb) {
    // 1) state blocks
    const heads = allIdx(L, /^\s*TD-DFT(?:\/TDA)? EXCITED STATES|^\s*(?:CIS|TDA)? ?EXCITED STATES/);
    let states = [], method = 'TD-DFT';
    const seen = new Set();
    const stRe = /^\s*STATE\s+(\d+):\s+E=\s*(-?[\d.]+)\s*au\s+(-?[\d.]+)\s*eV\s+(-?[\d.]+)\s*cm\*\*-1(?:\s+<S\*\*2>\s*=\s*(-?[\d.]+))?(?:\s+Mult\s+(\d+))?/;
    const trRe = /^\s*(\d+)([ab])\s*->\s*(\d+)([ab])\s*:\s*(-?[\d.]+)\s*\(c=\s*(-?[\d.]+)\)/;
    heads.forEach((h, hi) => {
      const end = hi + 1 < heads.length ? heads[hi + 1] : L.length;
      const hm = /\((SINGLETS|TRIPLETS)\)/i.exec(L[h]);
      let defMult = hm ? (/TRIP/i.test(hm[1]) ? 3 : 1) : 1;
      if (/TDA/.test(L[h])) method = 'TDA';
      let cur = null; const block = [];
      for (let k = h + 1; k < end; k++) {
        const m = stRe.exec(L[k]);
        if (m) {
          cur = { n: +m[1], mult: m[6] ? +m[6] : defMult, eEv: +m[3], eCm: +m[4], wlNm: NM_EV / +m[3], f: null, t2: null, s2: m[5] != null ? +m[5] : null, transitions: [] };
          block.push(cur); continue;
        }
        const t = trRe.exec(L[k]);
        if (t && cur) {
          const sp = t[2]; const hl = spinHomo(orb, sp);
          cur.transitions.push({ from: +t[1], to: +t[3], fromLabel: hl ? orbLabel(+t[1], hl[0], hl[1]) : null, toLabel: hl ? orbLabel(+t[3], hl[0], hl[1]) : null, fromRaw: t[1] + t[2], toRaw: t[3] + t[4], spin: sp, coef: +t[6], weight: +t[5] });
        }
      }
      if (block.length) {
        const key = block[0].mult + ':' + block[0].n;
        if (seen.has(key)) { states = []; seen.clear(); }
        seen.add(key); block.forEach(s => states.push(s));
      }
    });
    // 2) absorption table (electric dipole)
    const ab = lastIdx(L, /ABSORPTION SPECTRUM VIA TRANSITION ELECTRIC DIPOLE MOMENTS/);
    const rows = [];
    if (ab >= 0) {
      for (let k = ab + 1; k < Math.min(L.length, ab + 600); k++) {
        let m = /^\s*(\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+(?:[Ee][-+]?\d+)?)\s+(\d+\.\d+(?:[Ee][-+]?\d+)?)/.exec(L[k]);
        if (m) { rows.push({ n: +m[1], cm: +m[2], nm: +m[3], f: +m[4], t2: +m[5] }); continue; }
        // format lama: 0-1A -> 1-1A  eV cm-1 nm fosc T2
        m = /^\s*\S+\s+->\s+(\d+)-\S+\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+(?:[Ee][-+]?\d+)?)\s+(\d+\.\d+(?:[Ee][-+]?\d+)?)/.exec(L[k]);
        if (m) { rows.push({ n: +m[1], cm: +m[3], nm: +m[4], f: +m[5], t2: +m[6] }); continue; }
        if (rows.length && (/^\s*$/.test(L[k]) || /^-{5,}/.test(L[k].trim()) && L[k - 1] && /^\s*$/.test(L[k - 1]))) break;
        if (rows.length && /[A-Za-z]{4,}/.test(L[k])) break;
      }
    }
    if (!states.length && !rows.length) return null;
    if (!states.length) {
      states = rows.map(x => ({ n: x.n, mult: 1, eEv: x.cm / 8065.54429, eCm: x.cm, wlNm: x.nm, f: x.f, t2: x.t2, s2: null, transitions: [] }));
    } else if (rows.length) {
      const bySeq = rows.length === states.length;
      states.forEach((s, i) => {
        const x = bySeq ? rows[i] : rows.find(q => q.n === s.n && s.mult === 1);
        if (x) { s.f = x.f; s.t2 = x.t2; s.wlNm = x.nm; }
      });
    }
    states.forEach(s => { if (s.f == null && s.mult !== 1) s.f = 0; });
    return { method, states };
  }

  function parseOrca(text, filename) {
    const L = lines_(text); const r = skeleton('orca', filename);
    const v = /Program Version\s+([\d.]+)/.exec(text); r.version = v ? v[1] : null;
    r.terminatedNormally = /ORCA TERMINATED NORMALLY/.test(text);
    parseOrcaInput(L, r);
    const cq = /Total Charge\s+Charge\s+\.\.\.\s+(-?\d+)/.exec(text), mm = /Multiplicity\s+Mult\s+\.\.\.\s+(\d+)/.exec(text);
    if (cq) r.charge = +cq[1]; if (mm) r.mult = +mm[1];
    if (!r.functional) { const f = /Exchange Functional\s+Exchange\s+\.\.\.\s+(\S+)/.exec(text); if (f) r.functional = r.method = f[1]; }
    if (!r.basis) { const b = /Orbital basis set information|Basis Dimension/.test(text) ? /^\s*(?:Group|Basis) .*?:\s*(.*)$/m.exec(text) : null; }

    // geometri + trajektori + siklus optimisasi
    const cyc = allIdx(L, /GEOMETRY OPTIMIZATION CYCLE\s+\d+/);
    const cb = allIdx(L, /^\s*CARTESIAN COORDINATES \(ANGSTROEM\)\s*$/);
    const optConv = /THE OPTIMIZATION HAS CONVERGED/.test(text);
    if (cyc.length || r.jobTypes.indexOf('opt') >= 0) {
      if (r.jobTypes.indexOf('opt') < 0) r.jobTypes.push('opt');
      cyc.forEach((c, ci) => {
        const end = ci + 1 < cyc.length ? cyc[ci + 1] : L.length;
        const n = +/CYCLE\s+(\d+)/.exec(L[c])[1];
        const ib = firstIdx(L, /^\s*CARTESIAN COORDINATES \(ANGSTROEM\)\s*$/, c);
        const atoms = ib >= 0 && ib < end ? orcaCoordBlock(L, ib) : [];
        const ie = firstIdx(L, /^\s*FINAL SINGLE POINT ENERGY/, c);
        const E = ie >= 0 && ie < end ? fnum(L[ie].split(/\s+/).filter(Boolean).pop()) : null;
        const grab = (re) => { for (let k = c; k < end; k++) { const m = re.exec(L[k]); if (m) return +m[1]; } return null; };
        const cy = {
          n, E, maxGrad: grab(/^\s*MAX gradient\s+(-?[\d.]+)/), rmsGrad: grab(/^\s*RMS gradient\s+(-?[\d.]+)/),
          maxStep: grab(/^\s*MAX step\s+(-?[\d.]+)/), rmsStep: grab(/^\s*RMS step\s+(-?[\d.]+)/), dE: grab(/^\s*Energy change\s+(-?[\d.]+)/)
        };
        r.opt.cycles.push(cy);
        if (atoms.length && E != null) r.trajectory.push({ atoms, E });
      });
      r.opt.converged = optConv ? true : (/optimization did not converge|NOT CONVERGED AFTER/i.test(text) ? false : (r.terminatedNormally ? false : false));
    }
    if (cb.length) r.geometry.atoms = orcaCoordBlock(L, cb[cb.length - 1]);
    r.geometry.converged = r.opt.cycles.length ? r.opt.converged : null;
    r.geometry.source = r.opt.cycles.length ? (optConv ? 'optimized' : 'last') : 'input';

    // energi + SCF
    const fe = allIdx(L, /^\s*FINAL SINGLE POINT ENERGY/);
    if (fe.length) r.scf.finalEh = fnum(L[fe[fe.length - 1]].trim().split(/\s+/).pop());
    const si = allIdx(L, /^\s*SCF ITERATIONS\s*$/);
    if (si.length) {
      const s = si[si.length - 1]; let after = 0;
      for (let k = s + 1; k < L.length; k++) {
        const m = /^\s*(\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/.exec(L[k]);
        if (m) { r.scf.iterations.push({ iter: +m[1], E: +m[2], dE: +m[3], maxDP: +m[4], rms: +m[5] }); after = 0; continue; }
        if (/SUCCESS|SCF CONVERGED|SCF NOT CONVERGED|FINAL SINGLE POINT/.test(L[k])) break;
        if (r.scf.iterations.length && ++after > 8) break;
      }
      // ORCA 6 (tabel baru "ITER Energy Delta-E Max-DP RMS-DP ..." dengan kolom bergeser) tetap tertangani oleh regex di atas
    }
    r.scf.converged = /SCF CONVERGED AFTER|SUCCESS/.test(text) ? (/SCF NOT CONVERGED/.test(text) ? false : true) : (/SCF NOT CONVERGED/.test(text) ? false : null);

    r.orbitals = parseOrcaOrbs(L);
    r.freq = parseOrcaFreq(L);
    r.tddft = parseOrcaTD(L, r.orbitals);
    if (r.tddft) r.tddft.method = r.tddft.method;

    // dipol
    const di = lastIdx(L, /^Total Dipole Moment\s*:/);
    if (di >= 0) {
      const m = /:\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/.exec(L[di]);
      let mag = null; for (let k = di; k < di + 5; k++) { const q = /Magnitude \(Debye\)\s*:\s*(-?\d+\.\d+)/.exec(L[k] || ''); if (q) { mag = +q[1]; break; } }
      if (m) r.dipole = { x: m[1] * AU_DEBYE, y: m[2] * AU_DEBYE, z: m[3] * AU_DEBYE, xAu: +m[1], yAu: +m[2], zAu: +m[3], totalDebye: mag != null ? mag : Math.hypot(m[1], m[2], m[3]) * AU_DEBYE };
    }
    // muatan
    const chg = (re) => {
      const s = lastIdx(L, re); if (s < 0) return null; const out = [];
      for (let k = s + 1; k < Math.min(L.length, s + 4 + r.geometry.atoms.length * 3 + 200); k++) {
        const m = /^\s*(\d+)\s+([A-Za-z]{1,2})\s*:\s*(-?\d+\.\d+)/.exec(L[k]);
        if (m) out.push(+m[3]); else if (out.length && !/^\s*$/.test(L[k])) break;
        else if (out.length && /^\s*$/.test(L[k])) break;
      }
      return out.length ? out : null;
    };
    const mu = chg(/^MULLIKEN ATOMIC CHARGES/), lo = chg(/^LOEWDIN ATOMIC CHARGES/);
    if (mu || lo) r.charges = { mulliken: mu || [], lowdin: lo || undefined };
    // waktu
    const tm = /TOTAL RUN TIME:\s*(\d+) days (\d+) hours (\d+) minutes (\d+) seconds\s*(\d+)? ?msec/.exec(text);
    if (tm) r.timing.totalSec = +tm[1] * 86400 + +tm[2] * 3600 + +tm[3] * 60 + +tm[4] + (tm[5] ? +tm[5] / 1000 : 0);
    // peringatan
    L.forEach(l => { if (/^\s*(WARNING|\*\*\*\s*WARNING|Warning)\b/.test(l) && r.warnings.length < 15) r.warnings.push(l.trim().replace(/\*/g, '').trim()); });
    if (/ORCA finished by error termination/i.test(text)) r.warnings.push('ORCA berhenti dengan error termination.');
    if (/SCF NOT CONVERGED/.test(text)) r.warnings.push('SCF tidak konvergen.');
    return finalize(r);
  }

  /* ====================================================================== */
  /*                               GAUSSIAN                                  */
  /* ====================================================================== */
  function gOrient(L, i) {
    const atoms = []; let k = i + 1; let dashes = 0;
    for (; k < L.length && dashes < 2; k++) if (/^\s*-{20,}\s*$/.test(L[k])) dashes++;
    for (; k < L.length; k++) {
      const m = /^\s*(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/.exec(L[k]);
      if (!m) break;
      const z = +m[2]; if (z <= 0) continue;
      atoms.push({ el: SYM[z] || 'X', x: +m[4], y: +m[5], z: +m[6] });
    }
    return atoms;
  }
  function gNums(s) { const m = s.match(new RegExp(NUM, 'g')); return m ? m.map(fnum) : []; }

  function parseGaussian(text, filename) {
    const L = lines_(text); const r = skeleton('gaussian', filename);
    const v = /Gaussian\s+(\d+):\s+(\S+)/.exec(text); r.version = v ? (v[1] + ' ' + v[2]) : null;
    const nEnter = (text.match(/Entering Link 1|Entering Gaussian System/g) || []).length;
    const nNorm = (text.match(/Normal termination of Gaussian/g) || []).length;
    r.terminatedNormally = nNorm > 0 && nNorm >= Math.max(1, (text.match(/Entering Link 1/g) || []).length || 1);
    // route
    let route = '';
    for (let i = 0; i < L.length; i++) {
      if (/^\s#/.test(L[i])) { route = L[i].trim(); let k = i + 1; while (k < L.length && !/^\s*-{10,}\s*$/.test(L[k])) { route += ' ' + L[k].trim(); k++; } break; }
    }
    const rl = route.toLowerCase();
    const jt = [];
    if (/\bopt\b|\bopt[=(]/.test(rl)) jt.push('opt');
    if (/\bfreq\b|\bfreq[=(]/.test(rl)) jt.push('freq');
    if (/\btd\b|\btd[=(]|\bcis\b|\bcis[=(]/.test(rl)) jt.push('tddft');
    if (/\bscan\b|\birc\b/.test(rl)) jt.push(/irc/.test(rl) ? 'irc' : 'scan');
    if (!jt.length && route) jt.push('sp');
    r.jobTypes = jt; r.route = route;
    const bm = /(?:^|\s)((?:r|u|ro)?[a-z0-9\-]+(?:\([^)\s]*\))?)\/([^\s=]+)/i.exec(route.replace(/\b(scrf|td|opt|freq|geom|scf|int|pop|nosymm|guess)=\([^)]*\)/gi, ''));
    if (bm) { r.method = bm[1]; r.basis = bm[2]; }
    const sd = allIdx(L, /^\s*SCF Done:/);
    if (sd.length) {
      const m = /SCF Done:\s+E\(([^)]+)\)/.exec(L[sd[sd.length - 1]]);
      if (m) { r.functional = m[1].replace(/^(R|U|RO)(?=[A-Z])/, ''); if (!r.method) r.method = r.functional; }
    }
    if (!r.functional && r.method) r.functional = r.method.replace(/^(r|u|ro)(?=[a-z])/i, '').toUpperCase();
    if (/gen(?:ecp)?\b/.test(rl) && !r.basis) r.basis = 'gen';
    const dm = /empiricaldispersion\s*=\s*\(?\s*([a-z0-9]+)/i.exec(route); if (dm) r.dispersion = dm[1].toUpperCase();
    if (/\bb3lyp-d3|\bwb97xd\b/i.test(route) && !r.dispersion) r.dispersion = /wb97xd/i.test(route) ? 'wB97X-D (built-in)' : 'D3';
    const sv = /scrf\s*=\s*\(?([^\s)]*(?:\([^)]*\))?[^\s)]*)/i.exec(route);
    if (sv) { const sm = /solvent\s*=\s*([\w\-]+)/i.exec(route); const model = /\b(smd|pcm|cpcm|iefpcm)\b/i.exec(sv[1] + ' ' + route); r.solvent = (model ? model[1].toUpperCase() : 'PCM') + (sm ? ' (' + sm[1] + ')' : ''); }
    const cm = /Charge\s*=\s*(-?\d+)\s+Multiplicity\s*=\s*(\d+)/.exec(text); if (cm) { r.charge = +cm[1]; r.mult = +cm[2]; }

    // geometri, trajektori
    const stdIdx = allIdx(L, /^\s*Standard orientation:/), inIdx = allIdx(L, /^\s*Input orientation:/);
    const orIdx = (stdIdx.length ? stdIdx : inIdx);
    const allOr = stdIdx.concat(inIdx).sort((a, b) => a - b);
    if (allOr.length) r.geometry.atoms = gOrient(L, allOr[allOr.length - 1]);
    // energi & tabel konvergensi, urut
    const scfRe = /^\s*SCF Done:\s+E\([^)]+\)\s*=\s*(-?\d+\.\d+)\s+A\.U\. after\s+(\d+)\s+cycles/;
    let runE = null, cycN = 0;
    const eAt = new Array(L.length).fill(null);
    for (let i = 0; i < L.length; i++) {
      const m = scfRe.exec(L[i]); if (m) { runE = +m[1]; r.scf.finalEh = runE; r.scf.nCycles = +m[2]; }
      eAt[i] = runE;
      if (/^\s*Maximum Force\s/.test(L[i])) {
        const g = (re, k) => { const m2 = re.exec(L[i + k] || ''); return m2 ? +m2[1] : null; };
        const th = /^\s*Maximum Force\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(L[i]);
        cycN++;
        r.opt.cycles.push({ n: cycN, E: runE, maxGrad: th ? +th[1] : null, rmsGrad: g(/RMS\s+Force\s+(-?[\d.]+)/, 1), maxStep: g(/Maximum Displacement\s+(-?[\d.]+)/, 2), rmsStep: g(/RMS\s+Displacement\s+(-?[\d.]+)/, 3), thresholds: th ? { maxGrad: +th[2] } : undefined });
      }
    }
    if (!sd.length) { const hm = allIdx(L, /^\s*E\(.*\)\s*=\s*-?\d+\.\d+/); }
    // trajektori: orientasi (standard bila ada) + SCF Done berikutnya
    const trIdx = stdIdx.length ? stdIdx : inIdx;
    trIdx.forEach((o, ti) => {
      const end = ti + 1 < trIdx.length ? trIdx[ti + 1] : L.length;
      let E = null; for (let k = o; k < end; k++) { const m = scfRe.exec(L[k]); if (m) { E = +m[1]; break; } }
      if (E != null) { const atoms = gOrient(L, o); if (atoms.length) r.trajectory.push({ atoms, E }); }
    });
    const stat = /Stationary point found/.test(text);
    const optRequested = jt.indexOf('opt') >= 0 || r.opt.cycles.length > 1;
    if (optRequested) r.opt.converged = stat ? true : (/Optimization completed/.test(text) ? true : false);
    r.geometry.converged = optRequested ? r.opt.converged : null;
    r.geometry.source = optRequested ? (stat ? 'optimized' : 'last') : 'input';
    if (optRequested && jt.indexOf('opt') < 0) jt.unshift('opt');

    // iterasi SCF (butuh #p): blok "Cycle n" sebelum SCF Done terakhir
    if (sd.length) {
      const endI = sd[sd.length - 1];
      let st = lastIdx(L, /^\s*Cycle\s+1\s+Pass/, 0, endI);
      if (st >= 0) {
        let cur = null;
        for (let k = st; k < endI; k++) {
          const m = /^\s*Cycle\s+(\d+)\s+Pass/.exec(L[k]);
          if (m) { cur = { iter: +m[1], E: null, dE: null, rms: null }; r.scf.iterations.push(cur); continue; }
          if (!cur) continue;
          let q;
          if ((q = /^\s*E=\s*(-?\d+\.\d+)(?:\s+Delta-E=\s*(-?[\d.]+(?:[DdEe][-+]?\d+)?))?/.exec(L[k]))) { cur.E = +q[1]; if (q[2]) cur.dE = fnum(q[2]); }
          if ((q = /RMSDP=\s*([\d.]+[DdEe][-+]?\d+)/.exec(L[k]))) cur.rms = fnum(q[1]);
          if ((q = /\bDE=\s*(-?[\d.]+[DdEe][-+]?\d+)/.exec(L[k]))) cur.dE = fnum(q[1]);
        }
        r.scf.iterations = r.scf.iterations.filter(x => x.E != null);
        r.scf.iterations.forEach((x, i, a) => { if (x.dE == null) x.dE = i ? x.E - a[i - 1].E : 0; });
      }
    }
    r.scf.converged = sd.length ? !/Convergence failure|SCF Done.*not converged/i.test(text) : null;

    // orbital
    const orb = (() => {
      const a = { occ: [], virt: [] }, b = { occ: [], virt: [] }; let hasB = false; let sawVirt = false;
      for (const l of L) {
        let m = /^\s*(Alpha|Beta)\s+(occ|virt)\.\s+eigenvalues\s+--(.*)$/.exec(l);
        if (!m) continue;
        const spin = m[1], kind = m[2];
        if (spin === 'Alpha' && kind === 'occ' && sawVirt) { a.occ = []; a.virt = []; b.occ = []; b.virt = []; hasB = false; sawVirt = false; }
        if (kind === 'virt') sawVirt = true;
        const vals = gNums(m[3]);
        if (spin === 'Alpha') a[kind].push(...vals); else { b[kind].push(...vals); hasB = true; }
      }
      if (!a.occ.length && !a.virt.length) return null;
      const mk = (o, restricted) => o.occ.concat(o.virt).map((e, i) => ({ i, occ: i < o.occ.length ? (restricted ? 2 : 1) : 0, eh: e, ev: e * EV }));
      const res = { alpha: mk(a, !hasB), beta: hasB ? mk(b, false) : null };
      return setHomoLumo(res);
    })();
    r.orbitals = orb;

    // frekuensi
    r.freq = (() => {
      const freqs = [], ir = [], modes = []; let any = false;
      let hdr = -1;
      for (let i = 0; i < L.length; i++) {
        if (/Harmonic frequencies \(cm\*\*-1\), IR intensities/.test(L[i])) { freqs.length = 0; ir.length = 0; modes.length = 0; hdr = i; continue; }
        const m = /^\s*Frequencies -{2,3}\s+(.*)$/.exec(L[i]);
        if (!m) continue;
        any = true;
        const hp = /-{3}/.test(L[i].slice(0, L[i].indexOf('--') + 3));
        const fs = gNums(m[1]); const nm = fs.length;
        let irv = [], k = i + 1;
        for (; k < Math.min(L.length, i + 12); k++) {
          const q = /^\s*IR Inten\s+-{2,3}\s+(.*)$/.exec(L[k]); if (q) irv = gNums(q[1]);
          if (/^\s*(Atom\s+AN|Coord\s+Atom)/.test(L[k])) break;
        }
        const disp = Array.from({ length: nm }, () => []);
        if (/^\s*Atom\s+AN/.test(L[k] || '')) {
          for (k = k + 1; k < L.length; k++) {
            const q = /^\s+(\d+)\s+(\d+)\s+((?:-?\d+\.\d+\s*)+)$/.exec(L[k]);
            if (!q) break;
            const vals = q[3].trim().split(/\s+/).map(Number);
            for (let j = 0; j < nm; j++) disp[j].push([vals[3 * j], vals[3 * j + 1], vals[3 * j + 2]]);
          }
        } else if (/^\s*Coord\s+Atom/.test(L[k] || '')) { // freq=hpmodes
          const byMode = Array.from({ length: nm }, () => []);
          for (k = k + 1; k < L.length; k++) {
            const q = /^\s+(\d+)\s+(\d+)\s+(\d+)\s+((?:-?\d+\.\d+\s*)+)$/.exec(L[k]);
            if (!q) break;
            const vals = q[4].trim().split(/\s+/).map(Number);
            for (let j = 0; j < nm; j++) byMode[j].push(vals[j]);
          }
          byMode.forEach((v, j) => { for (let a = 0; a + 2 < v.length; a += 3) disp[j].push([v[a], v[a + 1], v[a + 2]]); });
        }
        for (let j = 0; j < nm; j++) { freqs.push(fs[j]); ir.push(irv[j] != null ? irv[j] : 0); modes.push({ freq: fs[j], disp: disp[j] }); }
        i = k - 1;
      }
      if (!any) return null;
      const res = { freqs: freqs.slice(), irInt: ir.slice(), nImag: 0, modes: modes.every(m => m.disp.length) ? modes : [], thermo: null };
      const lf = lastIdx(L, /^\s*Low frequencies ---/);
      if (lf >= 0) res.lowFreqs = gNums(L[lf].replace(/^.*---/, '')).concat(gNums((L[lf + 1] || '').replace(/^.*---/, '')));
      // termokimia
      const zp = lastIdx(L, /^\s*Zero-point correction=/);
      if (zp >= 0) {
        const t = {}; const gv = (re, from, n) => { for (let k = from; k < Math.min(L.length, from + (n || 14)); k++) { const m = re.exec(L[k]); if (m) return fnum(m[1]); } return null; };
        t.zpeEh = gv(/Zero-point correction=\s+(-?[\d.]+)/, zp, 1);
        t.EthCorrEh = gv(/Thermal correction to Energy=\s+(-?[\d.]+)/, zp);
        t.HCorrEh = gv(/Thermal correction to Enthalpy=\s+(-?[\d.]+)/, zp);
        t.GCorrEh = gv(/Thermal correction to Gibbs Free Energy=\s+(-?[\d.]+)/, zp);
        const ezpe = gv(/Sum of electronic and zero-point Energies=\s+(-?[\d.]+)/, zp);
        t.EthEh = gv(/Sum of electronic and thermal Energies=\s+(-?[\d.]+)/, zp);
        t.HEh = gv(/Sum of electronic and thermal Enthalpies=\s+(-?[\d.]+)/, zp);
        t.GEh = gv(/Sum of electronic and thermal Free Energies=\s+(-?[\d.]+)/, zp);
        t.electronicEh = ezpe != null && t.zpeEh != null ? ezpe - t.zpeEh : null;
        const tp = lastIdx(L, /Temperature\s+[\d.]+\s+Kelvin\.\s+Pressure\s+[\d.]+\s+Atm/, 0, zp);
        if (tp >= 0) { const m = /Temperature\s+([\d.]+)\s+Kelvin\.\s+Pressure\s+([\d.]+)\s+Atm/.exec(L[tp]); t.T_K = +m[1]; t.P_atm = +m[2]; }
        const tot = firstIdx(L, /^\s*Total\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*$/, Math.max(0, zp - 40));
        if (tot >= 0 && tot < zp + 40) { const m = /Total\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(L[tot]); t.S_calMolK = +m[3]; if (t.T_K) t.TSEh = t.T_K * t.S_calMolK / 1000 / KCAL; }
        Object.assign(t, { zpe: t.zpeEh, Etot: t.EthEh, H: t.HEh, G: t.GEh, S: t.TSEh != null ? t.TSEh : null, T: t.T_K, P: t.P_atm });
        res.thermo = t;
      }
      return res;
    })();

    // TDDFT
    r.tddft = (() => {
      const heads = allIdx(L, /Excitation energies and oscillator strengths:/);
      if (!heads.length) return null;
      const h = heads[heads.length - 1]; const states = [];
      let cur = null;
      const stRe = /^\s*Excited State\s+(\d+):\s+(\S+)\s+(-?[\d.]+)\s*eV\s+(-?[\d.]+)\s*nm\s+f=\s*(-?[\d.]+)\s+<S\*\*2>=\s*(-?[\d.]+)/;
      const trRe = /^\s+(\d+)([AB]?)\s*->\s*(\d+)([AB]?)\s+(-?\d+\.\d+)\s*$/;
      for (let k = h + 1; k < L.length; k++) {
        const m = stRe.exec(L[k]);
        if (m) {
          const mult = /Singlet/i.test(m[2]) ? 1 : /Triplet/i.test(m[2]) ? 3 : /Doublet/i.test(m[2]) ? 2 : /Quartet/i.test(m[2]) ? 4 : /Quintet/i.test(m[2]) ? 5 : (/^Singlet/i.test(m[2]) ? 1 : null);
          cur = { n: +m[1], mult, sym: m[2], eEv: +m[3], wlNm: +m[4], f: +m[5], s2: +m[6], t2: null, transitions: [] };
          states.push(cur); continue;
        }
        const t = trRe.exec(L[k]);
        if (t && cur) {
          const sp = (t[2] || 'A').toLowerCase(); const c = +t[5];
          const restricted = !orb || orb.spinRestricted;
          const hl = orb ? spinHomo(orb, sp) : null;
          const f0 = +t[1] - 1, t0 = +t[3] - 1;
          cur.transitions.push({ from: f0, to: t0, fromLabel: hl ? orbLabel(f0, hl[0], hl[1]) : null, toLabel: hl ? orbLabel(t0, hl[0], hl[1]) : null, fromRaw: t[1] + t[2], toRaw: t[3] + t[4], spin: restricted ? null : sp, coef: c, weight: (restricted && cur.mult === 1) ? 2 * c * c : c * c });
          continue;
        }
        if (/^\s*$/.test(L[k]) && states.length && !/^\s*$/.test(L[k + 1] || 'x')) { /* lanjut */ }
        if (/Total Energy, E\(|SavETr|Leave Link|^\s*Population analysis|Job cpu time|Excited State Properties|^\s*<0\|r\|0>/.test(L[k]) && states.length) break;
        if (states.length && /^\s*[A-Z][a-z]+ [A-Za-z ]+:/.test(L[k]) && !/^\s*This state/.test(L[k]) && !/Excited State/.test(L[k])) break;
      }
      if (!states.length) return null;
      return { method: /\btda\b/i.test(route) ? 'TDA' : (/\bcis\b/i.test(route) ? 'CIS' : 'TD-DFT'), states };
    })();

    // dipol
    const dp = lastIdx(L, /Dipole moment \(field-independent basis, Debye\):/);
    if (dp >= 0) {
      const m = /X=\s*(-?[\d.]+)\s*Y=\s*(-?[\d.]+)\s*Z=\s*(-?[\d.]+)\s*Tot=\s*(-?[\d.]+)/.exec(L[dp + 1] || '');
      if (m) r.dipole = { x: +m[1], y: +m[2], z: +m[3], totalDebye: +m[4] };
    }
    // Mulliken
    const mu = lastIdx(L, /^\s*Mulliken charges(?: and spin densities)?:\s*$/);
    if (mu >= 0) {
      const out = [];
      for (let k = mu + 1; k < L.length; k++) {
        const m = /^\s+(\d+)\s+([A-Za-z]{1,2})\s+(-?\d+\.\d+)/.exec(L[k]);
        if (m) out.push(+m[3]); else if (/Sum of Mulliken/.test(L[k])) break; else if (out.length) break;
      }
      if (out.length) r.charges = { mulliken: out };
    }
    // waktu
    let tot = 0, got = false;
    for (const l of L) { const m = /Elapsed time:\s+(\d+) days\s+(\d+) hours\s+(\d+) minutes\s+([\d.]+) seconds/.exec(l); if (m) { tot += +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4]; got = true; } }
    if (!got) for (const l of L) { const m = /Job cpu time:\s+(\d+) days\s+(\d+) hours\s+(\d+) minutes\s+([\d.]+) seconds/.exec(l); if (m) { tot += +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4]; got = true; } }
    if (got) r.timing.totalSec = tot;
    r.nJobs = Math.max(1, (text.match(/Entering Link 1/g) || []).length);
    // peringatan
    if (/Convergence failure/.test(text)) r.warnings.push('Convergence failure (SCF).');
    if (/Error termination/.test(text)) r.warnings.push('Error termination via Lnk1e.');
    if (/Optimization stopped|Number of steps exceeded/.test(text)) r.warnings.push('Optimisasi berhenti sebelum konvergen.');
    if (/Link1:\s+Proceeding to internal job step/.test(text)) r.warnings.push('File berisi beberapa job (Link1); hasil diambil dari job terakhir/yang memilikinya.');
    return finalize(r);
  }

  /* ====================================================================== */
  function detect(text) {
    const head = text.slice(0, 200000);
    const o = /\* O   R   C   A \*|O\s{3}R\s{3}C\s{3}A|ORCA TERMINATED|Program Version \d+\.\d+.*|FINAL SINGLE POINT ENERGY|CARTESIAN COORDINATES \(ANGSTROEM\)/.test(head) && /ORCA|FINAL SINGLE POINT ENERGY|\|\s*\d+>/.test(head);
    const g = /Entering Gaussian System|Gaussian, Inc\.|Normal termination of Gaussian|Entering Link 1|SCF Done:|Standard orientation:/.test(text.length > 200000 ? text.slice(0, 100000) + text.slice(-100000) : text);
    if (o && !g) return 'orca';
    if (g && !o) return 'gaussian';
    if (o && g) { const io = head.search(/O   R   C   A|ORCA/), ig = head.search(/Entering (?:Link|Gaussian)|SCF Done/); return (io >= 0 && (ig < 0 || io < ig)) ? 'orca' : 'gaussian'; }
    return 'unknown';
  }
  function parse(text, filename) {
    const kind = detect(text);
    if (kind === 'orca') return parseOrca(text, filename);
    if (kind === 'gaussian') return parseGaussian(text, filename);
    const r = skeleton('unknown', filename); r.warnings.push('Format keluaran tidak dikenali (bukan ORCA/Gaussian).'); return r;
  }

  const api = { detect, parse, parseOrca, parseGaussian, orbLabel, formulaOf, SYM, constants: { EV, AU_DEBYE, NM_EV, KCAL } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.QC = window.QC || {}; window.QC.parse = api; }
  else if (root) { root.QC = root.QC || {}; root.QC.parse = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
