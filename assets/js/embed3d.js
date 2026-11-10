/* embed3d.js — in-browser 3D embedding + force-field pre-optimisation (no RDKit 3D needed).
 *
 * Works in three contexts: <script> (global QEmbed), Web Worker (self.onmessage), Node (module.exports).
 *
 * Pipeline
 *   1. parse a V2000 molblock (explicit H, 2D coords, wedge flags)  [+ optional "aromatic form" molblock: bond type 4]
 *   2. perceive hybridisation (sp / sp2 / conjugated lone-pair sp2 / sp3), rings, topological distances
 *   3. initial 3D = 2D coords + z from wedge/hash bonds + random z noise (several restarts, seeded PRNG)
 *   4. minimise a small UFF/MMFF-like force field with analytic gradients (L-BFGS):
 *        bond stretch, angle bend (cos-harmonic, ring/hybridisation aware), planarity (improper volume),
 *        torsions (2-fold for sp2–sp2, 3-fold for sp3–sp3), UFF Lennard-Jones for >=1-4 pairs
 *   5. keep the lowest-energy restart that preserves wedge stereochemistry and E/Z, and report diagnostics.
 *
 * The force field is deliberately simple: it produces sensible starting geometries for DFT, not final structures.
 */
(function (global) {
  'use strict';

  /* ---------------- element data ---------------- */
  // Cordero covalent radii (Å), UFF vdW (x = r_min Å, D = kcal/mol)
  const EL = {
    H: { z: 1, r: .31, x: 2.886, d: .044 }, B: { z: 5, r: .84, x: 4.083, d: .18 }, C: { z: 6, r: .76, x: 3.851, d: .105 },
    N: { z: 7, r: .71, x: 3.66, d: .069 }, O: { z: 8, r: .66, x: 3.5, d: .06 }, F: { z: 9, r: .57, x: 3.364, d: .05 },
    Si: { z: 14, r: 1.11, x: 4.295, d: .402 }, P: { z: 15, r: 1.07, x: 4.147, d: .305 }, S: { z: 16, r: 1.05, x: 4.035, d: .274 },
    Cl: { z: 17, r: 1.02, x: 3.947, d: .227 }, Se: { z: 34, r: 1.2, x: 4.205, d: .291 }, Br: { z: 35, r: 1.2, x: 4.189, d: .251 },
    I: { z: 53, r: 1.39, x: 4.5, d: .339 }, Ge: { z: 32, r: 1.2, x: 4.379, d: .379 }, Sn: { z: 50, r: 1.39, x: 4.392, d: .567 }
  };
  const elp = s => EL[s] || { z: 0, r: 1.4, x: 4.0, d: .1 };
  const LONEPAIR = { N: 1, O: 1, S: 1, P: 1, Se: 1 };

  /* ---------------- molblock parsing ---------------- */
  /** parse V2000 molblock → {atoms:[{el,x,y,z,chg}], bonds:[{a,b,order,wedge}]}; aromBlock sets order 1.5 for bond type 4 */
  function parseMolblock(mb, aromBlock) {
    const L = mb.replace(/\r/g, '').split('\n');
    const cnt = L[3]; const na = parseInt(cnt.slice(0, 3)), nb = parseInt(cnt.slice(3, 6));
    const atoms = [], bonds = [];
    for (let i = 0; i < na; i++) {
      const l = L[4 + i]; atoms.push({ x: +l.slice(0, 10), y: +l.slice(10, 20), z: +l.slice(20, 30), el: l.slice(31, 34).trim(), chg: 0 });
    }
    for (let i = 0; i < nb; i++) {
      const l = L[4 + na + i]; bonds.push({ a: parseInt(l.slice(0, 3)) - 1, b: parseInt(l.slice(3, 6)) - 1, order: parseInt(l.slice(6, 9)), wedge: parseInt(l.slice(9, 12)) || 0 });
    }
    for (let i = 4 + na + nb; i < L.length; i++) {
      if (L[i].startsWith('M  CHG')) { const p = L[i].trim().split(/\s+/); const n = +p[2]; for (let k = 0; k < n; k++) atoms[+p[3 + 2 * k] - 1].chg = +p[4 + 2 * k]; }
      if (L[i].startsWith('M  END')) break;
    }
    if (aromBlock) {
      const A = aromBlock.replace(/\r/g, '').split('\n');
      for (let i = 0; i < nb; i++) { const l = A[4 + na + i]; if (l && parseInt(l.slice(6, 9)) === 4) bonds[i].order = 1.5; }
    }
    return { atoms, bonds };
  }

  /* ---------------- topology / typing ---------------- */
  function buildTopology(mol) {
    const n = mol.atoms.length, nb = Array.from({ length: n }, () => []);
    mol.bonds.forEach((b, k) => { nb[b.a].push({ j: b.b, o: b.order, k }); nb[b.b].push({ j: b.a, o: b.order, k }); });
    // topological distance (<=4 needed)
    const td = Array.from({ length: n }, () => new Int8Array(n).fill(99));
    for (let s = 0; s < n; s++) { td[s][s] = 0; const q = [s]; for (let h = 0; h < q.length; h++) { const u = q[h]; if (td[s][u] >= 4) continue; for (const e of nb[u]) if (td[s][e.j] === 99) { td[s][e.j] = td[s][u] + 1; q.push(e.j); } } }
    // smallest ring per bond (BFS ignoring that bond) → ring size & membership
    const ringOfBond = new Array(mol.bonds.length).fill(0), rings = [], seen = new Set();
    mol.bonds.forEach((bd, k) => {
      const prev = new Int32Array(n).fill(-1), q = [bd.a]; prev[bd.a] = bd.a; let ok = false;
      for (let h = 0; h < q.length && !ok; h++) { const u = q[h]; for (const e of nb[u]) { if (e.k === k || prev[e.j] !== -1) continue; prev[e.j] = u; if (e.j === bd.b) { ok = true; break; } q.push(e.j); } }
      if (!ok) return; const path = []; for (let x = bd.b; x !== bd.a; x = prev[x]) path.push(x); path.push(bd.a);
      ringOfBond[k] = path.length; const key = path.slice().sort((a, b) => a - b).join(',');
      if (!seen.has(key)) { seen.add(key); rings.push(path.reverse()); }
    });
    const ringSizeAtom = new Array(n).fill(0); // smallest ring containing the atom
    rings.forEach(r => r.forEach(i => { if (!ringSizeAtom[i] || r.length < ringSizeAtom[i]) ringSizeAtom[i] = r.length; }));
    // hybridisation
    const hyb = new Array(n).fill('sp3');
    for (let i = 0; i < n; i++) {
      const bs = nb[i], el = mol.atoms[i].el; let dbl = 0, trp = 0, aro = 0;
      bs.forEach(e => { if (e.o === 2) dbl++; else if (e.o === 3) trp++; else if (e.o === 1.5) aro++; });
      if (bs.length === 0) { hyb[i] = 'none'; continue; }
      if (bs.length === 1 && el === 'H') { hyb[i] = 'term'; continue; }
      if (trp || (dbl >= 2 && bs.length <= 2)) hyb[i] = 'sp';
      else if ((dbl || aro) && bs.length <= 3) hyb[i] = 'sp2';
      else hyb[i] = 'sp3';
      if (bs.length === 1 && hyb[i] === 'sp3') hyb[i] = 'term';
    }
    const conj = new Array(n).fill(false);
    for (let i = 0; i < n; i++) { // lone-pair atoms conjugated to unsaturated neighbour -> planar
      const el = mol.atoms[i].el; if (hyb[i] !== 'sp3' || !(el === 'N' || el === 'O')) continue;
      if (nb[i].length > 3 || mol.atoms[i].chg > 0 && nb[i].length === 4) continue;
      if (nb[i].some(e => hyb[e.j] === 'sp2' || hyb[e.j] === 'sp')) { hyb[i] = 'sp2'; conj[i] = true; }
    }
    return { n, nb, td, rings, ringOfBond, ringSizeAtom, hyb, conj };
  }

  /* ---------------- force-field construction ---------------- */
  function bondR0(ea, eb, order) {
    const A = elp(ea), B = elp(eb); let r = A.r + B.r;
    if (order === 2) r -= .18; else if (order === 3) r -= .32; else if (order === 1.5) r -= .12;
    if (ea === 'H' || eb === 'H') r += .02;
    return r;
  }
  function angleTarget(mol, T, i, j, k) {
    const el = mol.atoms[j].el, h = T.hyb[j], nn = T.nb[j].length, rs = T.ringSizeAtom[j];
    // are i,j,k in a common small ring?  (bond i-j and j-k ring sizes equal & small)
    const bij = T.nb[j].find(e => e.j === i), bjk = T.nb[j].find(e => e.j === k);
    const rij = T.ringOfBond[bij.k], rjk = T.ringOfBond[bjk.k];
    const inRing = rij && rij === rjk && rij <= 8 ? rij : 0;
    if (h === 'sp') return 180;
    if (h === 'sp2') {
      if (inRing && inRing <= 5) { let t = 180 * (inRing - 2) / inRing; if ((el === 'S' || el === 'Se') && inRing === 5) t = 92; return t; }
      if (nn === 3 && rs && rs <= 5) { // exocyclic angle of small-ring sp2 centre: (360 - ring angle)/2
        const rin = T.nb[j].filter(e => T.ringOfBond[e.k] === rs); if (rin.length === 2) { const tr = (el === 'S') ? 92 : 180 * (rs - 2) / rs; return (360 - tr) / 2; }
      }
      if (nn === 2 && el === 'O') return 115; if (nn === 2 && el === 'N') return 117; return 120;
    }
    // sp3 and others
    if (inRing === 3) return 60; if (inRing === 4) return 90;
    if (inRing === 5) return (el === 'S' || el === 'Se') ? 93 : 104;
    if (inRing === 7) return 114;
    if (el === 'O') { const hs = T.nb[j].filter(e => mol.atoms[e.j].el === 'H').length; return hs === 2 ? 104.5 : 110; }
    if (el === 'N') return nn === 3 ? 107 : 109.47;
    if (el === 'S' || el === 'Se') return nn === 2 ? 99 : 109.47;
    if (el === 'P') return nn === 3 ? 100 : 109.47;
    if (inRing === 6) return 111;
    return 109.47;
  }
  function buildFF(mol, T) {
    const n = T.n, ff = { bonds: [], angles: [], imps: [], tors: [], nbp: [] };
    mol.bonds.forEach(b => ff.bonds.push({ a: b.a, b: b.b, r0: bondR0(mol.atoms[b.a].el, mol.atoms[b.b].el, b.order), k: 700 }));
    for (let j = 0; j < n; j++) {
      const nbj = T.nb[j]; if (T.hyb[j] === 'term' || T.hyb[j] === 'none') continue;
      for (let x = 0; x < nbj.length; x++) for (let y = x + 1; y < nbj.length; y++) {
        const t = angleTarget(mol, T, nbj[x].j, j, nbj[y].j); ff.angles.push({ i: nbj[x].j, j, k: nbj[y].j, t0: t, c0: Math.cos(t * Math.PI / 180), k: t >= 179.9 ? 90 : 90 });
      }
      if (T.hyb[j] === 'sp2' && nbj.length === 3) ff.imps.push({ j, a: nbj[0].j, b: nbj[1].j, c: nbj[2].j, k: 22 });
    }
    // torsions around each rotatable/planar bond
    mol.bonds.forEach((bd, kb) => {
      const B = bd.a, C = bd.b, hb = T.hyb[B], hc = T.hyb[C];
      if (T.nb[B].length < 2 || T.nb[C].length < 2 || hb === 'sp' || hc === 'sp') return;
      let kind = null, V = 0;
      const sp2 = h => h === 'sp2';
      if (sp2(hb) && sp2(hc)) {
        if (bd.order >= 1.5) { kind = 2; V = 24; }
        else {
          const isCO = (i) => T.nb[i].some(e => (e.o === 2) && (mol.atoms[e.j].el === 'O' || mol.atoms[e.j].el === 'S' || mol.atoms[e.j].el === 'N') && !T.ringOfBond[e.k]);
          const lp = i => T.conj[i];
          if ((lp(B) && isCO(C)) || (lp(C) && isCO(B))) V = 9; else V = 2.5; kind = 2;
        }
      } else if (hb === 'sp3' && hc === 'sp3') { kind = 3; V = 1.2; }
      else return;
      for (const ea of T.nb[B]) { if (ea.j === C) continue; for (const ed of T.nb[C]) { if (ed.j === B || ed.j === ea.j) continue; ff.tors.push({ a: ea.j, b: B, c: C, d: ed.j, n: kind, V: V / (kind === 3 ? 1 : 1) }); } }
    });
    // non-bonded (>=1-4)
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = T.td[i][j]; if (d <= 2) continue;
      const A = elp(mol.atoms[i].el), B = elp(mol.atoms[j].el), x = (A.x + B.x) / 2, D = Math.sqrt(A.d * B.d) * (d === 3 ? .5 : 1);
      ff.nbp.push({ i, j, x, D });
    }
    return ff;
  }

  /* ---------------- energy + gradient ---------------- */
  function sub3(x, a, b, o) { o[0] = x[3 * a] - x[3 * b]; o[1] = x[3 * a + 1] - x[3 * b + 1]; o[2] = x[3 * a + 2] - x[3 * b + 2]; }
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  function addg(g, i, v, s) { g[3 * i] += s * v[0]; g[3 * i + 1] += s * v[1]; g[3 * i + 2] += s * v[2]; }
  /** dihedral φ (rad) of a-b-c-d and gradient wrt the four atoms (Bekker/Blondel-Karplus). returns null if degenerate */
  function dihedralGrad(x, a, b, c, d) {
    const F = [0, 0, 0], G = [0, 0, 0], H = [0, 0, 0]; sub3(x, a, b, F); sub3(x, b, c, G); sub3(x, d, c, H);
    const A = cr(F, G), Bv = cr(H, G), A2 = dt(A, A), B2 = dt(Bv, Bv); if (A2 < 1e-10 || B2 < 1e-10) return null;
    const Gl = Math.sqrt(dt(G, G)), cosp = dt(A, Bv) / Math.sqrt(A2 * B2), sgn = dt(cr(A, Bv), G) >= 0 ? 1 : -1;
    const phi = sgn * Math.acos(Math.max(-1, Math.min(1, cosp)));
    const FG = dt(F, G), HG = dt(H, G);
    const ga = A.map(v => -Gl / A2 * v), gd = Bv.map(v => Gl / B2 * v);
    const gb = [0, 0, 0], gc = [0, 0, 0];
    for (let q = 0; q < 3; q++) {
      gb[q] = Gl / A2 * A[q] + FG / (A2 * Gl) * A[q] - HG / (B2 * Gl) * Bv[q];
      gc[q] = -Gl / B2 * Bv[q] - FG / (A2 * Gl) * A[q] + HG / (B2 * Gl) * Bv[q];
    }
    return { phi, ga, gb, gc, gd };
  }
  /** E(x) and gradient into g. returns energy (kcal/mol); term energies in parts if given */
  function energy(ff, x, g, parts) {
    g.fill(0); let Eb = 0, Ea = 0, Ei = 0, Et = 0, Enb = 0; const u = [0, 0, 0], v = [0, 0, 0], w = [0, 0, 0];
    for (const b of ff.bonds) {
      sub3(x, b.a, b.b, u); const r = Math.sqrt(dt(u, u)) + 1e-12, dr = r - b.r0; Eb += .5 * b.k * dr * dr; const f = b.k * dr / r;
      addg(g, b.a, u, f); addg(g, b.b, u, -f);
    }
    for (const a of ff.angles) {
      sub3(x, a.i, a.j, u); sub3(x, a.k, a.j, v); const lu = Math.sqrt(dt(u, u)), lv = Math.sqrt(dt(v, v)); if (lu < 1e-8 || lv < 1e-8) continue;
      const c = dt(u, v) / (lu * lv); let dE; // dE/dcos
      if (a.t0 >= 179.9) { Ea += a.k * (1 + c); dE = a.k; }
      else { const s2 = 1 - a.c0 * a.c0, d = c - a.c0; Ea += .5 * a.k * d * d / s2; dE = a.k * d / s2; }
      for (let q = 0; q < 3; q++) { w[q] = 0; }
      for (let q = 0; q < 3; q++) {
        const dcu = (v[q] / (lu * lv) - c * u[q] / (lu * lu)), dcv = (u[q] / (lu * lv) - c * v[q] / (lv * lv));
        g[3 * a.i + q] += dE * dcu; g[3 * a.k + q] += dE * dcv; g[3 * a.j + q] -= dE * (dcu + dcv);
      }
    }
    for (const m of ff.imps) { // V = (a-j)·((b-j)×(c-j))
      const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0]; sub3(x, m.a, m.j, A); sub3(x, m.b, m.j, B); sub3(x, m.c, m.j, C);
      const BC = cr(B, C), CA = cr(C, A), AB = cr(A, B), V = dt(A, BC); Ei += .5 * m.k * V * V;
      addg(g, m.a, BC, m.k * V); addg(g, m.b, CA, m.k * V); addg(g, m.c, AB, m.k * V);
      g[3 * m.j] -= m.k * V * (BC[0] + CA[0] + AB[0]); g[3 * m.j + 1] -= m.k * V * (BC[1] + CA[1] + AB[1]); g[3 * m.j + 2] -= m.k * V * (BC[2] + CA[2] + AB[2]);
    }
    for (const t of ff.tors) {
      const D = dihedralGrad(x, t.a, t.b, t.c, t.d); if (!D) continue; let dE;
      if (t.n === 2) { Et += .5 * t.V * (1 - Math.cos(2 * D.phi)); dE = t.V * Math.sin(2 * D.phi); }
      else { Et += .5 * t.V * (1 + Math.cos(3 * D.phi)); dE = -1.5 * t.V * Math.sin(3 * D.phi); }
      addg(g, t.a, D.ga, dE); addg(g, t.b, D.gb, dE); addg(g, t.c, D.gc, dE); addg(g, t.d, D.gd, dE);
    }
    for (const p of ff.nbp) {
      sub3(x, p.i, p.j, u); let r = Math.sqrt(dt(u, u)) + 1e-12; const rc = .6 * p.x; let e, de;
      const lj = rr => { const s = p.x / rr, s6 = s * s * s * s * s * s; return [p.D * (s6 * s6 - 2 * s6), p.D * 12 * (s6 - s6 * s6) / rr]; };
      if (r < rc) { const [e0, d0] = lj(rc); e = e0 + d0 * (r - rc); de = d0; } else { [e, de] = lj(r); }
      Enb += e; const f = de / r; addg(g, p.i, u, f); addg(g, p.j, u, -f);
    }
    if (parts) { parts.bond = Eb; parts.angle = Ea; parts.improper = Ei; parts.torsion = Et; parts.vdw = Enb; }
    return Eb + Ea + Ei + Et + Enb;
  }

  /* ---------------- L-BFGS ---------------- */
  function lbfgs(ff, x, o) {
    o = o || {}; const N = x.length, M = 8, maxIter = o.maxIter || 800, gtol = o.gtol || 2e-3, maxStep = o.maxStep || 0.25;
    let g = new Float64Array(N), gn = new Float64Array(N), xn = new Float64Array(N), E = energy(ff, x, g), it = 0;
    const S = [], Y = [], R = []; let conv = false;
    for (; it < maxIter; it++) {
      let gmax = 0; for (let i = 0; i < N; i++) gmax = Math.max(gmax, Math.abs(g[i])); if (gmax < gtol) { conv = true; break; }
      const q = Float64Array.from(g), al = new Array(S.length);
      for (let k = S.length - 1; k >= 0; k--) { let a = 0; for (let i = 0; i < N; i++) a += S[k][i] * q[i]; a *= R[k]; al[k] = a; for (let i = 0; i < N; i++) q[i] -= a * Y[k][i]; }
      let gam = 1 / (N ? 400 : 1); if (S.length) { let sy = 0, yy = 0; const s = S[S.length - 1], y = Y[Y.length - 1]; for (let i = 0; i < N; i++) { sy += s[i] * y[i]; yy += y[i] * y[i]; } gam = sy / yy; }
      for (let i = 0; i < N; i++) q[i] *= gam;
      for (let k = 0; k < S.length; k++) { let b = 0; for (let i = 0; i < N; i++) b += Y[k][i] * q[i]; b *= R[k]; for (let i = 0; i < N; i++) q[i] += S[k][i] * (al[k] - b); }
      let gd = 0; for (let i = 0; i < N; i++) gd -= g[i] * q[i]; // direction = -q
      if (gd >= 0) { S.length = 0; Y.length = 0; R.length = 0; for (let i = 0; i < N; i++) q[i] = g[i] * 0.002; gd = 0; for (let i = 0; i < N; i++) gd -= g[i] * q[i]; }
      let mx = 0; for (let i = 0; i < N; i += 3) mx = Math.max(mx, Math.hypot(q[i], q[i + 1], q[i + 2]));
      let step = mx > maxStep ? maxStep / mx : 1, En, ok = false;
      for (let ls = 0; ls < 25; ls++) {
        for (let i = 0; i < N; i++) xn[i] = x[i] - step * q[i];
        En = energy(ff, xn, gn); if (En <= E + 1e-4 * step * gd) { ok = true; break; } step *= .5;
      }
      if (!ok) { if (S.length) { S.length = 0; Y.length = 0; R.length = 0; continue; } break; }
      const s = new Float64Array(N), y = new Float64Array(N); let sy = 0;
      for (let i = 0; i < N; i++) { s[i] = xn[i] - x[i]; y[i] = gn[i] - g[i]; sy += s[i] * y[i]; }
      if (sy > 1e-12) { S.push(s); Y.push(y); R.push(1 / sy); if (S.length > M) { S.shift(); Y.shift(); R.shift(); } }
      x.set(xn); g.set(gn); E = En;
    }
    return { E, iterations: it, converged: conv };
  }

  /* ---------------- stereo bookkeeping ---------------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function chiralSign(x, c, nbrs) { const a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0]; sub3(x, nbrs[0], c, a); sub3(x, nbrs[1], c, b); sub3(x, nbrs[2], c, d); return Math.sign(dt(a, cr(b, d))); }
  function initialCoords(mol, T, rnd, noise) {
    const n = T.n, x = new Float64Array(3 * n);
    const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / n, cy = mol.atoms.reduce((s, a) => s + a.y, 0) / n;
    // bond lengths of RDKit 2D depictions are 1.5 Å – rescale to ~1.45 so 2D start is near-physical
    for (let i = 0; i < n; i++) { x[3 * i] = (mol.atoms[i].x - cx) * 0.95; x[3 * i + 1] = (mol.atoms[i].y - cy) * 0.95; x[3 * i + 2] = (rnd() - .5) * 2 * noise; }
    mol.bonds.forEach(b => { if (b.wedge === 1 || b.wedge === 6) { const s = b.wedge === 1 ? 1 : -1; x[3 * b.b + 2] = x[3 * b.a + 2] + s * 1.0; } });
    return x;
  }
  /** stereo centres = begin atoms of wedge bonds; E/Z = double bonds (acyclic or large ring) with substituents */
  function stereoSpec(mol, T, x0) {
    const cen = []; const seen = new Set();
    mol.bonds.forEach(b => { if ((b.wedge === 1 || b.wedge === 6) && !seen.has(b.a) && T.nb[b.a].length >= 3) { seen.add(b.a); const nbs = T.nb[b.a].map(e => e.j).slice(0, 3); cen.push({ c: b.a, nbs, sign: chiralSign(x0, b.a, nbs) }); } });
    const ez = [];
    mol.bonds.forEach((b, k) => {
      if (b.order !== 2 || (T.ringOfBond[k] && T.ringOfBond[k] < 8)) return;
      const sa = T.nb[b.a].filter(e => e.j !== b.b), sb = T.nb[b.b].filter(e => e.j !== b.a); if (!sa.length || !sb.length) return;
      // heaviest substituents on each end
      const a = sa.map(e => e.j).sort((p, q) => elp(mol.atoms[q].el).z - elp(mol.atoms[p].el).z)[0], d = sb.map(e => e.j).sort((p, q) => elp(mol.atoms[q].el).z - elp(mol.atoms[p].el).z)[0];
      const D = dihedralGrad(x0, a, b.a, b.b, d); if (D) ez.push({ a, b: b.a, c: b.b, d, cis: Math.cos(D.phi) > 0 });
    });
    return { cen, ez };
  }
  function checkStereo(x, spec) {
    let bad = 0; spec.cen.forEach(c => { if (chiralSign(x, c.c, c.nbs) !== c.sign) bad++; });
    let badEZ = 0; spec.ez.forEach(e => { const D = dihedralGrad(x, e.a, e.b, e.c, e.d); if (!D || (Math.cos(D.phi) > 0) !== e.cis) badEZ++; });
    return { centers: spec.cen.length, centersInverted: bad, ez: spec.ez.length, ezFlipped: badEZ, ok: !bad && !badEZ };
  }
  function diagnostics(mol, T, ff, x) {
    const u = [0, 0, 0], v = [0, 0, 0]; let bs = 0, bm = 0, as = 0, am = 0, clash = 0;
    ff.bonds.forEach(b => { sub3(x, b.a, b.b, u); const d = Math.abs(Math.sqrt(dt(u, u)) - b.r0); bs += d; bm = Math.max(bm, d); });
    ff.angles.forEach(a => { sub3(x, a.i, a.j, u); sub3(x, a.k, a.j, v); const c = dt(u, v) / Math.sqrt(dt(u, u) * dt(v, v)); const t = Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; const d = Math.abs(t - a.t0); as += d; am = Math.max(am, d); });
    ff.nbp.forEach(p => { sub3(x, p.i, p.j, u); if (Math.sqrt(dt(u, u)) < 0.62 * p.x) clash++; });
    return { bondMAE: bs / (ff.bonds.length || 1), bondMax: bm, angleMAE: as / (ff.angles.length || 1), angleMax: am, clashes: clash };
  }

  /* ---------------- public: embed ---------------- */
  /** embed(molblock2D, aromBlock?, {restarts, seed, maxIter}) → {atoms, energy, parts, iterations, ms, stereo, diag, restarts:[...]} (synchronous) */
  function embed(molblock, aromBlock, opts) {
    opts = opts || {}; const t0 = Date.now(); const mol = parseMolblock(molblock, aromBlock), T = buildTopology(mol), ff = buildFF(mol, T);
    const nheavy = mol.atoms.filter(a => a.el !== 'H').length, restarts = opts.restarts || (nheavy > 40 ? 4 : 8), rnd = mulberry32(opts.seed || 12345);
    const spec0 = stereoSpec(mol, T, initialCoords(mol, T, rnd, 0.001)), res = [];
    for (let r = 0; r < restarts; r++) {
      const x = initialCoords(mol, T, rnd, 0.35 + 0.3 * rnd());
      // pre-relax with small steps, then converge
      const o1 = lbfgs(ff, x, { maxIter: 150, maxStep: .12 }), o2 = lbfgs(ff, x, { maxIter: opts.maxIter || 900, maxStep: .25, gtol: 1e-3 });
      const st = checkStereo(x, spec0); res.push({ x: Float64Array.from(x), E: o2.E, it: o1.iterations + o2.iterations, converged: o2.converged, st });
    }
    const good = res.filter(r => r.st.ok), pool = good.length ? good : res; pool.sort((a, b) => a.E - b.E); const best = pool[0];
    const parts = {}; const g = new Float64Array(best.x.length); energy(ff, best.x, g, parts);
    const atoms = mol.atoms.map((a, i) => ({ el: a.el, x: best.x[3 * i], y: best.x[3 * i + 1], z: best.x[3 * i + 2] }));
    // centre on centroid
    const c = [0, 1, 2].map(k => atoms.reduce((s, a) => s + [a.x, a.y, a.z][k], 0) / atoms.length); atoms.forEach(a => { a.x -= c[0]; a.y -= c[1]; a.z -= c[2]; });
    return { atoms, energy: best.E, parts, iterations: best.it, converged: best.converged, ms: Date.now() - t0, stereo: best.st, diag: diagnostics(mol, T, ff, best.x), restarts: res.map(r => ({ E: r.E, stereoOK: r.st.ok })), nAtoms: atoms.length, charge: mol.atoms.reduce((s, a) => s + a.chg, 0) };
  }

  /* ---------------- worker plumbing ---------------- */
  let scriptURL = null; try { if (typeof document !== 'undefined' && document.currentScript) scriptURL = document.currentScript.src; } catch (e) { }
  /** async embed: uses a Worker when possible (UI never blocks), falls back to main thread */
  function run(molblock, aromBlock, opts) {
    return new Promise((resolve, reject) => {
      if (typeof Worker !== 'undefined' && scriptURL) {
        try {
          const w = new Worker(scriptURL); let done = false;
          w.onmessage = e => { done = true; w.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data); };
          w.onerror = () => { if (!done) { w.terminate(); try { resolve(embed(molblock, aromBlock, opts)); } catch (err) { reject(err); } } };
          w.postMessage({ molblock, aromBlock, opts }); return;
        } catch (e) { /* fall through */ }
      }
      setTimeout(() => { try { resolve(embed(molblock, aromBlock, opts)); } catch (err) { reject(err); } }, 20);
    });
  }
  /** quality check of an arbitrary XYZ geometry is done elsewhere; here: helper to compute FF energy gradient test */
  function _gradCheck(molblock, aromBlock) {
    const mol = parseMolblock(molblock, aromBlock), T = buildTopology(mol), ff = buildFF(mol, T), rnd = mulberry32(7), x = initialCoords(mol, T, rnd, .5), g = new Float64Array(x.length), gn = new Float64Array(x.length);
    energy(ff, x, g); let maxErr = 0; const h = 1e-5;
    for (let i = 0; i < x.length; i++) { const o = x[i]; x[i] = o + h; const e1 = energy(ff, x, gn); x[i] = o - h; const e2 = energy(ff, x, gn); x[i] = o; const num = (e1 - e2) / (2 * h); maxErr = Math.max(maxErr, Math.abs(num - g[i]) / (1 + Math.abs(num))); }
    return maxErr;
  }

  const API = { embed, run, parseMolblock, _gradCheck };
  if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof importScripts === 'function') {
    self.onmessage = e => { try { self.postMessage(embed(e.data.molblock, e.data.aromBlock, e.data.opts)); } catch (err) { self.postMessage({ error: String(err && err.message || err) }); } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.QEmbed = API;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
