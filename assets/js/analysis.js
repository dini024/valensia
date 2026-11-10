/* ==========================================================================
   analysis.js — fungsi murni untuk Results Analyzer (tanpa DOM; dapat diuji di Node)
   Mengisi window.QC.analysis (browser) atau module.exports (Node).
   Atom: {el:'C', x, y, z} dalam Å.
   ========================================================================== */
(function (root) {
  'use strict';
  const A = {};

  /* ---------- konstanta ---------- */
  A.EV_CM = 8065.543937;          // 1 eV = 8065.544 cm^-1
  A.EV_NM = 1239.84198;           // nm·eV
  A.EPS_AREA = 2.315e8;           // ∫ε dν̃ = 2.315e8 · f  (ε dalam M^-1 cm^-1, ν̃ dalam cm^-1)
  A.HARTREE_EV = 27.211386245988;
  const FWHM_SIG = 2.3548200450309493; // 2√(2 ln 2)

  const RCOV = { H: .31, He: .28, Li: 1.28, Be: .96, B: .84, C: .76, N: .71, O: .66, F: .57, Ne: .58, Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06, K: 2.03, Ca: 1.76, Sc: 1.7, Ti: 1.6, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.2, As: 1.19, Se: 1.2, Br: 1.2, Kr: 1.16, Rb: 2.2, Sr: 1.95, Y: 1.9, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.4, Cs: 2.44, Ba: 2.15, La: 2.07, Hf: 1.75, Ta: 1.7, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46, Bi: 1.48 };
  A.rcov = el => RCOV[el] != null ? RCOV[el] : 1.5;
  const elOf = a => a.el || a.sym || a.symbol || 'X';

  /* ---------- vektor ---------- */
  const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nrm = u => Math.hypot(u[0], u[1], u[2]);
  const RAD = 180 / Math.PI;

  A.dist = (a, b) => nrm(sub(a, b));
  A.angle = (a, b, c) => { const u = sub(a, b), v = sub(c, b); return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (nrm(u) * nrm(v))))) * RAD; };
  /** Sudut dihedral IUPAC (−180..180]; positif = searah jarum jam bila dilihat sepanjang b→c. */
  A.dihedral = (p0, p1, p2, p3) => {
    const b0 = sub(p1, p0), b1 = sub(p2, p1), b2 = sub(p3, p2);
    const n1 = cross(b0, b1), n2 = cross(b1, b2);
    const y = nrm(b1) * dot(b0, n2), x = dot(n1, n2);
    return Math.atan2(y, x) * RAD;
  };

  /* ---------- topologi ---------- */
  /** Persepsi ikatan: d < r_cov(i)+r_cov(j)+tol. Mengembalikan pasangan [i,j]. */
  A.bonds = function (atoms, tol) {
    tol = tol == null ? 0.4 : tol; const B = [];
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      const ei = elOf(atoms[i]), ej = elOf(atoms[j]); const d = A.dist(atoms[i], atoms[j]);
      if (d < 0.4) continue;
      if (ei === 'H' && ej === 'H' && d > 0.9) continue;
      if (d < A.rcov(ei) + A.rcov(ej) + tol) B.push([i, j]);
    }
    return B;
  };
  A.neighbors = (n, bonds) => { const nb = Array.from({ length: n }, () => []); bonds.forEach(([i, j]) => { nb[i].push(j); nb[j].push(i); }); return nb; };

  A.bondTable = (atoms, bonds) => bonds.map(([i, j]) => ({ i, j, a: elOf(atoms[i]) + (i + 1), b: elOf(atoms[j]) + (j + 1), pair: [elOf(atoms[i]), elOf(atoms[j])].sort().join('–'), r: A.dist(atoms[i], atoms[j]) }));
  A.angleTable = function (atoms, bonds) {
    const nb = A.neighbors(atoms.length, bonds), out = [];
    for (let j = 0; j < atoms.length; j++) for (let a = 0; a < nb[j].length; a++) for (let b = a + 1; b < nb[j].length; b++) {
      const i = nb[j][a], k = nb[j][b];
      out.push({ i, j, k, label: `${elOf(atoms[i])}${i + 1}–${elOf(atoms[j])}${j + 1}–${elOf(atoms[k])}${k + 1}`, theta: A.angle(atoms[i], atoms[j], atoms[k]) });
    }
    return out;
  };
  A.dihedralTable = function (atoms, bonds) {
    const nb = A.neighbors(atoms.length, bonds), out = [];
    bonds.forEach(([j, k]) => {
      nb[j].forEach(i => { if (i === k) return; nb[k].forEach(l => {
        if (l === j || l === i) return;
        out.push({ i, j, k, l, label: [i, j, k, l].map(x => elOf(atoms[x]) + (x + 1)).join('–'), phi: A.dihedral(atoms[i], atoms[j], atoms[k], atoms[l]) });
      }); });
    });
    return out;
  };

  /** Cincin terkecil (SSSR via independensi GF(2)). Mengembalikan daftar indeks atom berurutan. */
  A.rings = function (n, bonds, maxSize) {
    maxSize = maxSize || 9; const nb = A.neighbors(n, bonds);
    const eid = new Map(); bonds.forEach(([i, j], k) => { eid.set(i + ',' + j, k); eid.set(j + ',' + i, k); });
    const cands = new Map();
    bonds.forEach(([a, b]) => {
      // BFS terpendek a→b tanpa memakai ikatan (a,b)
      const prev = new Array(n).fill(-2); prev[a] = -1; const q = [a];
      for (let h = 0; h < q.length; h++) {
        const u = q[h]; if (u === b) break;
        for (const v of nb[u]) { if (u === a && v === b) continue; if (prev[v] !== -2) continue; prev[v] = u; q.push(v); }
      }
      if (prev[b] === -2) return;
      const path = []; for (let u = b; u !== -1; u = prev[u]) path.push(u);
      if (path.length > maxSize) return;
      const key = path.slice().sort((x, y) => x - y).join(',');
      if (!cands.has(key)) cands.set(key, path.reverse());
    });
    const list = Array.from(cands.values()).sort((x, y) => x.length - y.length);
    const nComp = (() => { const seen = new Array(n).fill(false); let c = 0; for (let s = 0; s < n; s++) if (!seen[s]) { c++; const st = [s]; seen[s] = true; while (st.length) { const u = st.pop(); nb[u].forEach(v => { if (!seen[v]) { seen[v] = true; st.push(v); } }); } } return c; })();
    const target = bonds.length - n + nComp; const basis = []; const rings = [];
    for (const ring of list) {
      if (rings.length >= target) break;
      const vec = new Set(); for (let k = 0; k < ring.length; k++) { const e = eid.get(ring[k] + ',' + ring[(k + 1) % ring.length]); if (e == null) { vec.clear(); break; } vec.add(e); }
      if (!vec.size) continue;
      let v = new Set(vec);
      for (const bs of basis) { const lead = Math.min(...bs); if (v.has(lead)) { bs.forEach(e => v.has(e) ? v.delete(e) : v.add(e)); } }
      if (v.size) { basis.push(v); basis.sort((p, q) => Math.min(...p) - Math.min(...q)); rings.push(ring); }
    }
    return rings;
  };

  /* ---------- bidang kuadrat-terkecil ---------- */
  function jacobi3(M) {
    const a = M.map(r => r.slice()); const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]); if (off < 1e-15) break;
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: [a[0][0], a[1][1], a[2][2]], vectors: V };
  }
  A.jacobi3 = jacobi3;
  /** Fit bidang: atoms (subset) → {centroid, normal, rmsd, maxDev, devs[]} */
  A.planeFit = function (pts) {
    const n = pts.length; if (n < 3) return null;
    const c = [0, 0, 0]; pts.forEach(p => { c[0] += p.x; c[1] += p.y; c[2] += p.z; }); c[0] /= n; c[1] /= n; c[2] /= n;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    pts.forEach(p => { const d = [p.x - c[0], p.y - c[1], p.z - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
    const { values, vectors } = jacobi3(C); let m = 0; for (let k = 1; k < 3; k++) if (values[k] < values[m]) m = k;
    const nv = [vectors[0][m], vectors[1][m], vectors[2][m]];
    const devs = pts.map(p => (p.x - c[0]) * nv[0] + (p.y - c[1]) * nv[1] + (p.z - c[2]) * nv[2]);
    const rmsd = Math.sqrt(devs.reduce((s, d) => s + d * d, 0) / n);
    return { centroid: c, normal: nv, rmsd, maxDev: Math.max(...devs.map(Math.abs)), devs };
  };
  /** Planaritas: seluruh molekul (atom berat atau semua), tiap cincin, dan subset manual. */
  A.planarity = function (atoms, bonds, opts) {
    opts = opts || {}; const out = { whole: null, rings: [], manual: null };
    const heavy = atoms.map((a, i) => i).filter(i => elOf(atoms[i]) !== 'H');
    const pick = heavy.length >= 3 ? heavy : atoms.map((a, i) => i);
    const wf = A.planeFit(pick.map(i => atoms[i]));
    if (wf) out.whole = Object.assign({ idx: pick, n: pick.length, scope: heavy.length >= 3 ? 'atom berat' : 'semua atom' }, wf);
    A.rings(atoms.length, bonds).forEach(r => { const f = A.planeFit(r.map(i => atoms[i])); if (f) out.rings.push(Object.assign({ idx: r, size: r.length, label: r.map(i => elOf(atoms[i]) + (i + 1)).join('–') }, f)); });
    if (opts.manual && opts.manual.length >= 3) { const f = A.planeFit(opts.manual.map(i => atoms[i])); if (f) out.manual = Object.assign({ idx: opts.manual }, f); }
    return out;
  };

  /* ---------- deskriptor reaktivitas global ---------- */
  /** Koopmans dari E_HOMO/E_LUMO (eV); opsional ΔSCF dari energi total (Eh) netral/kation/anion. */
  A.reactivity = function (homoEv, lumoEv, extra) {
    const IP = -homoEv, EA = -lumoEv; const R = A.descriptors(IP, EA);
    R.homoEv = homoEv; R.lumoEv = lumoEv; R.gapEv = lumoEv - homoEv; R.koopmans = { IP, EA };
    if (extra && isFinite(extra.eN)) {
      const dscf = {};
      if (isFinite(extra.eC)) dscf.IP = (extra.eC - extra.eN) * A.HARTREE_EV;
      if (isFinite(extra.eA)) dscf.EA = (extra.eN - extra.eA) * A.HARTREE_EV;
      if (dscf.IP != null && dscf.EA != null) dscf.desc = A.descriptors(dscf.IP, dscf.EA);
      R.dscf = dscf;
    }
    return R;
  };
  A.descriptors = function (IP, EA) {
    const chi = (IP + EA) / 2, mu = -chi, eta = (IP - EA) / 2, S = 1 / (2 * eta);
    const omega = mu * mu / (2 * eta), dN = -mu / eta, d = IP - EA;
    return { IP, EA, chi, mu, eta, S, omega, dNmax: dN, omegaMinus: Math.pow(3 * IP + EA, 2) / (16 * d), omegaPlus: Math.pow(IP + 3 * EA, 2) / (16 * d), nucleophilicity: 1 / omega };
  };
  /** Panel DSSC (semua dalam eV skala vakum; level negatif). Asumsi dapat diubah pengguna. */
  A.dssc = function (o) {
    const eHomo = o.homoEv, eLumo = o.lumoEv, eCB = o.eCB != null ? o.eCB : -4.0, eRedox = o.eRedox != null ? o.eRedox : -4.8;
    const e00 = o.e00 != null ? o.e00 : (eLumo - eHomo);
    const eOxStar = eHomo + e00;               // level keadaan tereksitasi: E_ox* = E_ox − E_0-0 (dalam level-energi)
    const dGinj = eCB - eOxStar;               // ΔG_inj = E_CB − E_ox*   (negatif = spontan)
    const dGreg = eHomo - eRedox;              // ΔG_reg = E_HOMO − E_redox (negatif = spontan; |ΔG|≳0.2–0.3 eV memadai)
    const LHE = o.f != null ? 1 - Math.pow(10, -o.f) : null;
    return { eHomo, eLumo, eCB, eRedox, e00, eOxStar, dGinj, dGreg, LHE, VocMax: eCB - eRedox, lumoAboveCB: eLumo - eCB, injectionOk: dGinj < -0.2, regenOk: dGreg < -0.2 };
  };

  /* ---------- spektrum ---------- */
  /** Puncak ε (M^-1 cm^-1) satu transisi dengan kekuatan osilator f. */
  A.epsPeak = function (f, fwhmEv, shape) {
    const fw = fwhmEv * A.EV_CM;
    if (shape === 'lorentz') return A.EPS_AREA * f * 2 / (Math.PI * fw);
    const sigma = fw / FWHM_SIG; return A.EPS_AREA * f / (sigma * Math.sqrt(2 * Math.PI));
  };
  /** Spektrum UV-Vis ε(λ). states: [{wlNm, f, eEv?}] */
  A.uvSpectrum = function (states, o) {
    o = Object.assign({ fwhmEv: 0.3, shape: 'gauss', nmMin: null, nmMax: null, n: 600 }, o || {});
    const st = states.filter(s => isFinite(s.wlNm) && isFinite(s.f));
    if (!st.length) return { nm: [], eps: [], states: [] };
    let lo = o.nmMin, hi = o.nmMax;
    if (lo == null) lo = Math.max(100, Math.min(...st.map(s => s.wlNm)) - 80);
    if (hi == null) hi = Math.max(...st.map(s => s.wlNm)) + 120;
    const fw = o.fwhmEv * A.EV_CM, sigma = fw / FWHM_SIG; const nm = [], eps = [];
    for (let k = 0; k < o.n; k++) {
      const l = lo + (hi - lo) * k / (o.n - 1), nu = 1e7 / l; let y = 0;
      for (const s of st) {
        const nu0 = 1e7 / s.wlNm, d = nu - nu0;
        y += o.shape === 'lorentz' ? A.EPS_AREA * s.f * (fw / 2 / Math.PI) / (d * d + (fw / 2) * (fw / 2)) : A.EPS_AREA * s.f / (sigma * Math.sqrt(2 * Math.PI)) * Math.exp(-d * d / (2 * sigma * sigma));
      }
      nm.push(l); eps.push(y);
    }
    let im = 0; eps.forEach((v, i) => { if (v > eps[im]) im = i; });
    return { nm, eps, lambdaMax: nm[im], epsMax: eps[im] };
  };
  /** Spektrum IR (Lorentz) dari frekuensi (cm^-1) & intensitas (km/mol). */
  A.irSpectrum = function (freqs, ints, o) {
    o = Object.assign({ fwhm: 20, scale: 1.0, min: 0, max: null, n: 1200 }, o || {});
    const f = freqs.map(v => v * o.scale); const max = o.max != null ? o.max : (Math.max(...f.filter(isFinite), 500) + 200);
    const x = [], y = [], g = o.fwhm / 2;
    for (let k = 0; k < o.n; k++) {
      const v = o.min + (max - o.min) * k / (o.n - 1); let s = 0;
      for (let i = 0; i < f.length; i++) { if (!(f[i] > 20)) continue; const d = v - f[i]; s += (ints[i] || 0) * g * g / (d * d + g * g); }
      x.push(v); y.push(s);
    }
    return { x, y };
  };

  /* ---------- label orbital ---------- */
  /** idx = indeks orbital (basis 0); homoIdx = indeks HOMO (basis 0) → 'HOMO', 'HOMO-2', 'LUMO+1' */
  A.orbLabel = function (idx, homoIdx) {
    if (idx == null || homoIdx == null || isNaN(idx) || isNaN(homoIdx)) return null;
    const d = idx - homoIdx; if (d === 0) return 'HOMO'; if (d === 1) return 'LUMO';
    return d < 0 ? 'HOMO' + d : 'LUMO+' + (d - 1);
  };

  /* ---------- util ---------- */
  A.csv = function (header, rows) {
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [header.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\n') + '\n';
  };
  A.rmsdTrajectory = (a, b) => Math.sqrt(a.reduce((s, p, i) => s + (p.x - b[i].x) ** 2 + (p.y - b[i].y) ** 2 + (p.z - b[i].z) ** 2, 0) / a.length);
  A.stats = arr => { const n = arr.length; if (!n) return null; const m = arr.reduce((s, v) => s + v, 0) / n; return { n, mean: m, min: Math.min(...arr), max: Math.max(...arr), sd: Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / n) }; };

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else { root.QC = root.QC || {}; root.QC.analysis = A; }
})(typeof window !== 'undefined' ? window : globalThis);
