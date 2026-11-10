/* ==========================================================================
   molbuilder-engine.js — embedding 3D + pre-optimisasi (force field ringan)
   RDKit.js MinimalLib TIDAK menyediakan ETKDG/MMFF/UFF, jadi modul ini
   mengerjakan sisanya di JavaScript murni:
     1) Topologi (ikatan, aromatik, muatan, radikal) dibaca dari molblock RDKit.
     2) Koordinat awal = depiksi 2D RDKit (bebas simpul) + noise z.
     3) Minimisasi L-BFGS dengan force field "UFF-lite":
        ikatan harmonik (r0 dari radius kovalen & orde ikatan), sudut harmonik
        (dalam cos θ; target menurut hibridisasi & ukuran cincin), torsi
        (planar untuk ikatan rangkap/aromatik dengan E/Z dari depiksi 2D,
        2-lipatan untuk konjugasi, 3-lipatan sp3), improper (planaritas sp2),
        volume kiral (stereosenter dari baji molblock), Lennard-Jones nonikatan.
     4) Konformer tambahan: rotasi acak ikatan tunggal rotatable + minimisasi ulang.
   Energi dalam kcal/mol (relatif, bukan energi absolut DFT).
   ========================================================================== */
(function (root) {
  'use strict';
  const RCOV = { H: .33, B: .84, C: .76, N: .71, O: .66, F: .57, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Se: 1.2, Br: 1.2, I: 1.39 };
  const VDW = { H: 1.1, B: 1.9, C: 1.7, N: 1.55, O: 1.52, F: 1.47, Si: 2.1, P: 1.8, S: 1.8, Cl: 1.75, Se: 1.9, Br: 1.85, I: 1.98 };
  const ZNUM = { H: 1, B: 5, C: 6, N: 7, O: 8, F: 9, Si: 14, P: 15, S: 16, Cl: 17, Se: 34, Br: 35, I: 53 };
  const SUPPORTED = Object.keys(ZNUM);

  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- parse molblock V2000 ---------- */
  function parseMolblock(mb) {
    const L = mb.replace(/\r/g, '').split('\n');
    if (/V3000/.test(L[3] || '')) throw new Error('Molblock V3000 belum didukung');
    const na = parseInt(L[3].substr(0, 3)), nb = parseInt(L[3].substr(3, 3));
    const atoms = [], bonds = [];
    for (let i = 0; i < na; i++) {
      const l = L[4 + i];
      atoms.push({ x: +l.substr(0, 10), y: +l.substr(10, 10), z: +l.substr(20, 10), el: l.substr(31, 3).trim(), chg: 0, rad: 0 });
    }
    for (let j = 0; j < nb; j++) {
      const l = L[4 + na + j];
      bonds.push({ a: +l.substr(0, 3) - 1, b: +l.substr(3, 3) - 1, order: +l.substr(6, 3), stereo: +l.substr(9, 3) || 0 });
    }
    for (let k = 4 + na + nb; k < L.length; k++) {
      const l = L[k];
      if (/^M  CHG/.test(l) || /^M  RAD/.test(l)) {
        const t = l.trim().split(/\s+/), n = +t[2];
        for (let q = 0; q < n; q++) { const ai = +t[3 + 2 * q] - 1, v = +t[4 + 2 * q]; if (t[1] === 'CHG') atoms[ai].chg = v; else atoms[ai].rad = v; }
      }
    }
    return { atoms, bonds, lines: L, na, nb };
  }

  /* ---------- model topologi ---------- */
  function buildModel(parsed, arom) {
    arom = arom || {};
    const aB = new Set(arom.bonds || []);
    const N = parsed.atoms.length;
    for (const a of parsed.atoms) if (!(a.el in ZNUM)) throw new Error('Unsur "' + a.el + '" belum didukung untuk embedding 3D (didukung: ' + SUPPORTED.join(', ') + ')');
    const nb = parsed.atoms.map(() => []);
    const bonds = parsed.bonds.map((b, i) => ({ a: b.a, b: b.b, order: b.order, bo: aB.has(i) ? 1.5 : b.order, arom: aB.has(i), stereo: b.stereo, idx: i }));
    bonds.forEach(b => { nb[b.a].push({ j: b.b, b }); nb[b.b].push({ j: b.a, b }); });
    const el = parsed.atoms.map(a => a.el), chg = parsed.atoms.map(a => a.chg);
    // resonansi muatan terpisah (nitro, karboksilat, sulfonat): X(-)-Y=Z(terminal) -> kedua ikatan 1.5
    bonds.forEach(b => {
      for (const [x, y] of [[b.a, b.b], [b.b, b.a]]) {
        if (chg[x] === -1 && nb[x].length === 1 && b.order === 1) {
          for (const q of nb[y]) if (q.b !== b && q.b.order === 2 && nb[q.j].length === 1) { b.bo = 1.5; q.b.bo = 1.5; }
        }
      }
    });
    const hasPi = nb.map((l, i) => l.some(q => q.b.order >= 2 || q.b.arom));
    const isHyper = i => (el[i] === 'S' || el[i] === 'P' || el[i] === 'Se') && nb[i].length >= 3;
    const hyb = new Array(N);
    for (let i = 0; i < N; i++) {
      const l = nb[i], deg = l.length, e = el[i];
      let h = 'sp3';
      const nd = l.filter(q => q.b.order === 2).length, nt = l.filter(q => q.b.order === 3).length, na_ = l.some(q => q.b.arom);
      if (deg <= 1) h = 'term';
      else if (isHyper(i)) h = 'sp3';
      else if (nt || nd >= 2) h = 'sp';
      else if (nd || na_) h = 'sp2';
      else {
        const conjN = l.some(q => hasPi[q.j] && q.j !== i);
        if ((e === 'N' || e === 'O') && conjN && chg[i] <= 0) h = 'sp2';
        else if (e === 'C' && deg === 3 && (chg[i] === 1 || parsed.atoms[i].rad)) h = 'sp2';
        else if (e === 'B' && deg === 3) h = 'sp2';
        else h = 'sp3';
      }
      hyb[i] = h;
    }
    // cincin terkecil per atom
    function pathLen(s, t, ex, maxd) {
      if (s === t) return 0;
      let fr = [s]; const seen = new Set([s, ex]); let d = 0;
      while (fr.length && d < (maxd || 9)) {
        d++; const nx = [];
        for (const u of fr) for (const q of nb[u]) { if (seen.has(q.j)) continue; if (q.j === t) return d; seen.add(q.j); nx.push(q.j); }
        fr = nx;
      }
      return Infinity;
    }
    const ringMin = new Array(N).fill(Infinity);
    bonds.forEach(b => {
      // cincin terkecil yang memuat ikatan: jalur a->b tanpa ikatan a-b
      let fr = [b.a]; const seen = new Set([b.a]); let d = 0, found = Infinity;
      outer: while (fr.length && d < 8) {
        d++; const nx = [];
        for (const u of fr) for (const q of nb[u]) {
          if (q.b === b) continue; if (seen.has(q.j)) continue;
          if (q.j === b.b) { found = d + 1; break outer; }
          seen.add(q.j); nx.push(q.j);
        }
        fr = nx;
      }
      if (found < Infinity) { ringMin[b.a] = Math.min(ringMin[b.a], found); ringMin[b.b] = Math.min(ringMin[b.b], found); }
    });
    // jarak topologi (BFS)
    const topo = [];
    for (let s = 0; s < N; s++) {
      const d = new Int16Array(N).fill(-1); d[s] = 0; const q = [s];
      for (let h = 0; h < q.length; h++) { const u = q[h]; for (const w of nb[u]) if (d[w.j] < 0) { d[w.j] = d[u] + 1; q.push(w.j); } }
      topo.push(d);
    }
    return { N, nb, bonds, el, chg, hyb, hasPi, ringMin, pathLen, topo, parsed, isHyper };
  }

  /* ---------- term force field ---------- */
  function buildTerms(M) {
    const { N, nb, bonds, el, hyb, hasPi, ringMin, pathLen, topo, parsed } = M;
    const T = { bonds: [], angles: [], tors: [], impr: [], chir: [], vdw: [], ez: [] };
    // ikatan
    for (const b of bonds) {
      let d = b.bo === 1 ? 0 : b.bo === 1.5 ? -0.12 : b.bo === 2 ? -0.19 : -0.31;
      const hp = x => (el[x] === 'S' || el[x] === 'P' || el[x] === 'Se') && nb[x].length >= 3;
      if (b.order === 2 && (hp(b.a) || hp(b.b))) d = -0.28;
      if (b.bo === 1.5 && (hp(b.a) || hp(b.b))) d = -0.22;
      if (b.bo === 1) {
        const pa = hyb[b.a] === 'sp2' || hyb[b.a] === 'sp', pb = hyb[b.b] === 'sp2' || hyb[b.b] === 'sp';
        if (pa && pb) d = -0.04;
        const lp = x => (el[x] === 'N' || el[x] === 'O') && hyb[x] === 'sp2' && !nb[x].some(q => q.b.order >= 2);
        if ((lp(b.a) && hasPi[b.b]) || (lp(b.b) && hasPi[b.a])) d = -0.09;
      }
      T.bonds.push([b.a, b.b, RCOV[el[b.a]] + RCOV[el[b.b]] + d]);
    }
    // sudut
    const cosd = d => Math.cos(d * Math.PI / 180);
    for (let j = 0; j < N; j++) {
      const l = nb[j], deg = l.length; if (deg < 2) continue;
      const e = el[j], h = hyb[j];
      for (let p = 0; p < deg; p++) for (let q = p + 1; q < deg; q++) {
        const i = l[p].j, k = l[q].j; let ideal;
        // ukuran cincin yang memuat i-j-k
        const L = pathLen(i, k, j, 8), rs = L < Infinity ? L + 2 : 0;
        const inSmall = rs && rs === ringMin[j];
        if (h === 'sp') ideal = 180;
        else if (h === 'sp2') {
          if (e === 'O') ideal = nb[j].some(x => el[x.j] === 'H') ? 108 : 117;
          else if (e === 'S' || e === 'Se') ideal = inSmall && rs === 5 ? 92 : 103;
          else {
            const rm = ringMin[j];
            if (rm < Infinity && rm <= 7) {
              const tin = 180 * (rm - 2) / rm;
              ideal = inSmall ? tin : (deg === 3 ? (360 - tin) / 2 : 120);
            } else ideal = 120;
          }
        } else {
          if (deg >= 4) ideal = 109.5;
          else if (deg === 3) ideal = e === 'N' ? 107 : e === 'P' ? 100 : e === 'B' ? 120 : 109.5;
          else ideal = e === 'O' ? 109 : e === 'S' || e === 'Se' ? 99 : 109.5;
          if (M.isHyper(j) && el[i] === 'O' && el[k] === 'O' && nb[i].length === 1 && nb[k].length === 1) ideal = 119;
          if (inSmall) { const rm = ringMin[j]; ideal = rm === 3 ? 60 : rm === 4 ? 90 : rm === 5 ? 104 : rm === 6 ? 110 : rm === 7 ? 113 : ideal; }
          else if (ringMin[j] === 3) ideal = 117;
        }
        T.angles.push([i, j, k, cosd(ideal), ideal === 180 ? 1 : 0]);
      }
    }
    // planaritas sp2 (3 tetangga)
    for (let d = 0; d < N; d++) if (hyb[d] === 'sp2' && nb[d].length === 3) T.impr.push([d, nb[d][0].j, nb[d][1].j, nb[d][2].j]);
    // sisi 2D untuk E/Z
    const P = parsed.atoms;
    const side = (j, k, i) => { const cx = (P[k].x - P[j].x) * (P[i].y - P[j].y) - (P[k].y - P[j].y) * (P[i].x - P[j].x); return Math.abs(cx) < 1e-3 ? 0 : (cx > 0 ? 1 : -1); };
    // torsi
    for (const b of bonds) {
      const j = b.a, k = b.b; if (nb[j].length < 2 || nb[k].length < 2) continue;
      if (hyb[j] === 'sp' || hyb[k] === 'sp') continue;
      const sp2j = hyb[j] === 'sp2', sp2k = hyb[k] === 'sp2';
      for (const qi of nb[j]) { if (qi.j === k) continue; for (const ql of nb[k]) { if (ql.j === j) continue;
        const i = qi.j, l = ql.j;
        if (b.bo >= 1.5 && sp2j && sp2k) {
          const si = side(j, k, i), sl = side(k, j, l); if (!si || !sl) continue;
          // sisi diukur dari arah yang berlawanan (j->k dan k->j) sehingga sama sisi bila si*sl === -1
          const cis = (si * sl) === -1; // koordinat 2D: sisi sama relatif sumbu => cis
          T.tors.push([i, j, k, l, 1, (cis ? 0 : 180) + 180, 10]);
          T.ez.push([i, j, k, l, cis ? 0 : 180, b.order === 2 ? 2 : 1]);
        } else if (b.bo === 1 && sp2j && sp2k) {
          const lp = x => (el[x] === 'N' || el[x] === 'O') && hyb[x] === 'sp2';
          const kk = (lp(j) || lp(k)) ? 2.5 : 0.5;
          T.tors.push([i, j, k, l, 2, 180, kk]);
        } else if (b.bo === 1 && hyb[j] === 'sp3' && hyb[k] === 'sp3') {
          T.tors.push([i, j, k, l, 3, 0, 0.2]);
        }
      } }
    }
    // kiralitas dari baji molblock
    const wz = new Map(); // atom pusat -> Map(tetangga -> z)
    parsed.bonds.forEach(b => { if (b.stereo === 1 || b.stereo === 6) { const m = wz.get(b.a) || new Map(); m.set(b.b, b.stereo === 1 ? 1 : -1); wz.set(b.a, m); } });
    wz.forEach((m, c) => {
      const neigh = nb[c].map(q => q.j); if (neigh.length < 3) return;
      const order = neigh.slice().sort((p, q) => (m.has(q) ? 1 : 0) - (m.has(p) ? 1 : 0) || p - q).slice(0, 3);
      const v = (u) => [P[u].x - P[c].x, P[u].y - P[c].y, (m.get(u) || 0) * 1.0];
      const [a, b, d] = order.map(v);
      const V = a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
      if (Math.abs(V) > 1e-6) T.chir.push([c, order[0], order[1], order[2], Math.sign(V)]);
    });
    // vdW
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const d = topo[i][j]; if (d >= 0 && d < 3) continue;
      const R = VDW[el[i]] + VDW[el[j]]; const eps = 0.08 * (d === 3 ? 0.5 : 1);
      T.vdw.push([i, j, R, eps]);
    }
    return T;
  }

  /* ---------- energi + gradien ---------- */
  const KB = 350, KA = 60, KL = 60, KP = 25, KC = 20, VT = 1.7;
  function makeEF(T) {
    return function (x, g, vs) {
      g.fill(0); let E = 0;
      for (const [i, j, r0] of T.bonds) {
        const dx = x[3 * i] - x[3 * j], dy = x[3 * i + 1] - x[3 * j + 1], dz = x[3 * i + 2] - x[3 * j + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-12, df = r - r0; E += KB * df * df;
        const f = 2 * KB * df / r; g[3 * i] += f * dx; g[3 * i + 1] += f * dy; g[3 * i + 2] += f * dz; g[3 * j] -= f * dx; g[3 * j + 1] -= f * dy; g[3 * j + 2] -= f * dz;
      }
      for (const [i, j, k, c0, lin] of T.angles) {
        const ux = x[3 * i] - x[3 * j], uy = x[3 * i + 1] - x[3 * j + 1], uz = x[3 * i + 2] - x[3 * j + 2];
        const vx = x[3 * k] - x[3 * j], vy = x[3 * k + 1] - x[3 * j + 1], vz = x[3 * k + 2] - x[3 * j + 2];
        const lu = Math.sqrt(ux * ux + uy * uy + uz * uz) + 1e-12, lv = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-12;
        const c = (ux * vx + uy * vy + uz * vz) / (lu * lv);
        let dE; if (lin) { E += KL * (1 + c); dE = KL; } else { E += KA * (c - c0) * (c - c0); dE = 2 * KA * (c - c0); }
        const a1 = 1 / (lu * lv), cu = c / (lu * lu), cv = c / (lv * lv);
        const dix = vx * a1 - cu * ux, diy = vy * a1 - cu * uy, diz = vz * a1 - cu * uz;
        const dkx = ux * a1 - cv * vx, dky = uy * a1 - cv * vy, dkz = uz * a1 - cv * vz;
        g[3 * i] += dE * dix; g[3 * i + 1] += dE * diy; g[3 * i + 2] += dE * diz;
        g[3 * k] += dE * dkx; g[3 * k + 1] += dE * dky; g[3 * k + 2] += dE * dkz;
        g[3 * j] -= dE * (dix + dkx); g[3 * j + 1] -= dE * (diy + dky); g[3 * j + 2] -= dE * (diz + dkz);
      }
      for (const [a, b, c, d, n, delta, k] of T.tors) {
        const Fx = x[3 * a] - x[3 * b], Fy = x[3 * a + 1] - x[3 * b + 1], Fz = x[3 * a + 2] - x[3 * b + 2];
        const Gx = x[3 * b] - x[3 * c], Gy = x[3 * b + 1] - x[3 * c + 1], Gz = x[3 * b + 2] - x[3 * c + 2];
        const Hx = x[3 * d] - x[3 * c], Hy = x[3 * d + 1] - x[3 * c + 1], Hz = x[3 * d + 2] - x[3 * c + 2];
        const Ax = Fy * Gz - Fz * Gy, Ay = Fz * Gx - Fx * Gz, Az = Fx * Gy - Fy * Gx;
        const Bx = Hy * Gz - Hz * Gy, By = Hz * Gx - Hx * Gz, Bz = Hx * Gy - Hy * Gx;
        const A2 = Ax * Ax + Ay * Ay + Az * Az, B2 = Bx * Bx + By * By + Bz * Bz, G2 = Gx * Gx + Gy * Gy + Gz * Gz;
        if (A2 < 1e-8 || B2 < 1e-8) continue;
        const Gl = Math.sqrt(G2);
        const cosp = (Ax * Bx + Ay * By + Az * Bz) / Math.sqrt(A2 * B2);
        const sinp = ((By * Az - Bz * Ay) * Gx + (Bz * Ax - Bx * Az) * Gy + (Bx * Ay - By * Ax) * Gz) / (Math.sqrt(A2 * B2) * Gl);
        const phi = Math.atan2(sinp, cosp);
        const dl = delta * Math.PI / 180;
        E += k * (1 + Math.cos(n * phi - dl));
        const dEdp = -n * k * Math.sin(n * phi - dl);
        const FG = Fx * Gx + Fy * Gy + Fz * Gz, HG = Hx * Gx + Hy * Gy + Hz * Gz;
        const s = SIGN_TORS;
        const gA = -s * Gl / A2, gB = s * Gl / B2, fA = s * FG / (A2 * Gl), hB = s * HG / (B2 * Gl);
        // dphi/da = gA*A ; dphi/dd = gB*B ; dphi/db = -gA*A + fA*A - hB*B ; dphi/dc = -gB*B - fA*A + hB*B
        const pa = [gA * Ax, gA * Ay, gA * Az], pd = [gB * Bx, gB * By, gB * Bz];
        const pb = [-gA * Ax + fA * Ax - hB * Bx, -gA * Ay + fA * Ay - hB * By, -gA * Az + fA * Az - hB * Bz];
        const pc = [-gB * Bx - fA * Ax + hB * Bx, -gB * By - fA * Ay + hB * By, -gB * Bz - fA * Az + hB * Bz];
        for (let q = 0; q < 3; q++) { g[3 * a + q] += dEdp * pa[q]; g[3 * b + q] += dEdp * pb[q]; g[3 * c + q] += dEdp * pc[q]; g[3 * d + q] += dEdp * pd[q]; }
      }
      const vol = (c, a, b, d, out) => {
        const ax = x[3 * a] - x[3 * c], ay = x[3 * a + 1] - x[3 * c + 1], az = x[3 * a + 2] - x[3 * c + 2];
        const bx = x[3 * b] - x[3 * c], by = x[3 * b + 1] - x[3 * c + 1], bz = x[3 * b + 2] - x[3 * c + 2];
        const dx = x[3 * d] - x[3 * c], dy = x[3 * d + 1] - x[3 * c + 1], dz = x[3 * d + 2] - x[3 * c + 2];
        const cax = by * dz - bz * dy, cay = bz * dx - bx * dz, caz = bx * dy - by * dx; // b x d
        const V = ax * cax + ay * cay + az * caz;
        out[0] = V;
        out[1] = cax; out[2] = cay; out[3] = caz; // dV/da
        out[4] = dy * az - dz * ay; out[5] = dz * ax - dx * az; out[6] = dx * ay - dy * ax; // dV/db = d x a
        out[7] = ay * bz - az * by; out[8] = az * bx - ax * bz; out[9] = ax * by - ay * bx; // dV/dd = a x b
      };
      const o = VBUF;
      const applyVol = (c, a, b, d, dEdV) => {
        for (let q = 0; q < 3; q++) {
          g[3 * a + q] += dEdV * o[1 + q]; g[3 * b + q] += dEdV * o[4 + q]; g[3 * d + q] += dEdV * o[7 + q];
          g[3 * c + q] -= dEdV * (o[1 + q] + o[4 + q] + o[7 + q]);
        }
      };
      for (const [c, a, b, d] of T.impr) { vol(c, a, b, d, o); E += KP * o[0] * o[0]; applyVol(c, a, b, d, 2 * KP * o[0]); }
      for (const [c, a, b, d, s] of T.chir) { vol(c, a, b, d, o); const df = o[0] - s * VT; E += KC * df * df; applyVol(c, a, b, d, 2 * KC * df); }
      for (const [i, j, R, eps0] of T.vdw) {
        const eps = eps0 * vs;
        const dx = x[3 * i] - x[3 * j], dy = x[3 * i + 1] - x[3 * j + 1], dz = x[3 * i + 2] - x[3 * j + 2];
        let r2 = dx * dx + dy * dy + dz * dz; if (r2 > 64) continue; if (r2 < 0.36) r2 = 0.36;
        const s2 = R * R / r2, s6 = s2 * s2 * s2, s12 = s6 * s6;
        E += eps * (s12 - 2 * s6);
        const f = eps * (-12 * s12 + 12 * s6) / r2; // dE/dr * (1/r)
        g[3 * i] += f * dx; g[3 * i + 1] += f * dy; g[3 * i + 2] += f * dz; g[3 * j] -= f * dx; g[3 * j + 1] -= f * dy; g[3 * j + 2] -= f * dz;
      }
      return E;
    };
  }
  const VBUF = new Float64Array(10);
  let SIGN_TORS = 1; // dikalibrasi lewat uji gradien numerik (calibrateTorsion)

  /* ---------- L-BFGS ---------- */
  function minimize(x, ef, vs, maxIter, gtol, maxStep) {
    const n = x.length, m = 8; let g = new Float64Array(n), gn = new Float64Array(n), xn = new Float64Array(n);
    let E = ef(x, g, vs); const S = [], Y = [], RHO = []; let fails = 0, it;
    const dot = (a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
    for (it = 0; it < maxIter; it++) {
      let gm = 0; for (let i = 0; i < n; i++) gm = Math.max(gm, Math.abs(g[i]));
      if (Math.sqrt(dot(g, g) / n) < gtol) break;
      const q = Float64Array.from(g), al = new Array(S.length);
      for (let i = S.length - 1; i >= 0; i--) { al[i] = RHO[i] * dot(S[i], q); for (let k = 0; k < n; k++) q[k] -= al[i] * Y[i][k]; }
      let gamma = S.length ? dot(S[S.length - 1], Y[S.length - 1]) / dot(Y[S.length - 1], Y[S.length - 1]) : Math.min(0.01, maxStep / (gm + 1e-12));
      for (let k = 0; k < n; k++) q[k] *= gamma;
      for (let i = 0; i < S.length; i++) { const b = RHO[i] * dot(Y[i], q); for (let k = 0; k < n; k++) q[k] += S[i][k] * (al[i] - b); }
      let d = q.map(v => -v);
      if (dot(d, g) >= 0) { S.length = Y.length = RHO.length = 0; const sc = Math.min(0.01, maxStep / (gm + 1e-12)); d = g.map(v => -v * sc); }
      let dm = 0; for (let k = 0; k < n; k++) dm = Math.max(dm, Math.abs(d[k]));
      if (dm > maxStep) { const sc = maxStep / dm; for (let k = 0; k < n; k++) d[k] *= sc; }
      const gd = dot(g, d); let t = 1, En, ls = 0;
      for (; ls < 25; ls++) {
        for (let k = 0; k < n; k++) xn[k] = x[k] + t * d[k];
        En = ef(xn, gn, vs);
        if (En <= E + 1e-4 * t * gd) break; t *= 0.5;
      }
      if (ls >= 25) { fails++; S.length = Y.length = RHO.length = 0; if (fails > 3) break; continue; }
      const s = new Float64Array(n), y = new Float64Array(n);
      for (let k = 0; k < n; k++) { s[k] = xn[k] - x[k]; y[k] = gn[k] - g[k]; x[k] = xn[k]; }
      const sy = dot(s, y); if (sy > 1e-12) { S.push(s); Y.push(y); RHO.push(1 / sy); if (S.length > m) { S.shift(); Y.shift(); RHO.shift(); } }
      const tmp = g; g = gn; gn = tmp; E = En; fails = 0;
    }
    return { E, iters: it };
  }

  /* ---------- kalibrasi tanda gradien torsi (uji numerik cepat) ---------- */
  function calibrateTorsion() {
    const T = { bonds: [], angles: [], tors: [[0, 1, 2, 3, 1, 30, 5]], impr: [], chir: [], vdw: [] };
    const ef = makeEF(T), x = Float64Array.from([0, 1, 0.2, 0.1, 0, 0, 1.4, 0.1, 0.3, 1.9, 1.1, -0.2]);
    const best = [];
    for (const s of [1, -1]) {
      SIGN_TORS = s; const g = new Float64Array(12), gp = new Float64Array(12); ef(x, g, 1);
      let err = 0; for (let q = 0; q < 12; q++) { const xp = x.slice(), xm = x.slice(); xp[q] += 1e-5; xm[q] -= 1e-5; const num = (ef(xp, gp, 1) - ef(xm, gp, 1)) / 2e-5; err += Math.abs(num - g[q]); }
      best.push([err, s]);
    }
    best.sort((a, b) => a[0] - b[0]); SIGN_TORS = best[0][1]; return best[0][0];
  }

  /* ---------- geometri util ---------- */
  function tors(x, a, b, c, d) {
    const p = (i) => [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
    const A = p(a), B = p(b), C = p(c), D = p(d);
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const b1 = sub(B, A), b2 = sub(C, B), b3 = sub(D, C), n1 = cr(b1, b2), n2 = cr(b2, b3), l2 = Math.sqrt(dt(b2, b2));
    const m1 = cr(n1, b2.map(v => v / l2));
    return -Math.atan2(dt(m1, n2), dt(n1, n2)) * 180 / Math.PI;
  }
  function volume(x, c, a, b, d) {
    const v = (u) => [x[3 * u] - x[3 * c], x[3 * u + 1] - x[3 * c + 1], x[3 * u + 2] - x[3 * c + 2]];
    const A = v(a), B = v(b), D = v(d);
    return A[0] * (B[1] * D[2] - B[2] * D[1]) - A[1] * (B[0] * D[2] - B[2] * D[0]) + A[2] * (B[0] * D[1] - B[1] * D[0]);
  }
  function checkStereo(M, T, x) {
    let chirOK = true, ezOK = true;
    for (const [c, a, b, d, s] of T.chir) if (Math.sign(volume(x, c, a, b, d)) !== s) chirOK = false;
    for (const [i, j, k, l, ph0] of T.ez) { const p = tors(x, i, j, k, l); let dd = Math.abs(p - ph0); if (dd > 180) dd = 360 - dd; if (dd > 45) ezOK = false; }
    return { chirOK, ezOK };
  }
  function sanity(M, x) {
    let maxDev = 0, minNB = 9;
    for (const [i, j, r0] of M._T.bonds) { const d = Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]); maxDev = Math.max(maxDev, Math.abs(d - r0)); }
    for (let i = 0; i < M.N; i++) for (let j = i + 1; j < M.N; j++) if (M.topo[i][j] < 0 || M.topo[i][j] >= 3) { const d = Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]); minNB = Math.min(minNB, d); }
    return { maxBondDev: maxDev, minNonbonded: minNB };
  }

  /* ---------- konformer: rotasi ikatan tunggal rotatable ---------- */
  function rotatableBonds(M) {
    const out = [];
    for (const b of M.bonds) {
      if (b.bo !== 1 || M.nb[b.a].length < 2 || M.nb[b.b].length < 2) continue;
      if (M.hyb[b.a] === 'sp' || M.hyb[b.b] === 'sp') continue;
      // bukan dalam cincin: jalur alternatif a->b tanpa ikatan ini
      if (M.pathLen(b.a, b.b, -1, 12) < Infinity && ringBond(M, b)) continue;
      // sisi
      const side = new Set([b.b]); const q = [b.b];
      for (let h = 0; h < q.length; h++) for (const w of M.nb[q[h]]) { if (q[h] === b.b && w.j === b.a) continue; if (w.j === b.a) continue; if (!side.has(w.j)) { side.add(w.j); q.push(w.j); } }
      out.push({ a: b.a, b: b.b, moving: Array.from(side) });
    }
    return out;
  }
  function ringBond(M, b) {
    let fr = [b.a]; const seen = new Set([b.a]);
    while (fr.length) { const nx = []; for (const u of fr) for (const q of M.nb[u]) { if (q.b === b) continue; if (q.j === b.b) return true; if (!seen.has(q.j)) { seen.add(q.j); nx.push(q.j); } } fr = nx; }
    return false;
  }
  function rotate(x, bd, ang) {
    const a = bd.a, b = bd.b; let ux = x[3 * b] - x[3 * a], uy = x[3 * b + 1] - x[3 * a + 1], uz = x[3 * b + 2] - x[3 * a + 2]; const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const m of bd.moving) {
      if (m === b) continue;
      const px = x[3 * m] - x[3 * b], py = x[3 * m + 1] - x[3 * b + 1], pz = x[3 * m + 2] - x[3 * b + 2];
      const dd = ux * px + uy * py + uz * pz;
      const cx = uy * pz - uz * py, cy = uz * px - ux * pz, cz = ux * py - uy * px;
      x[3 * m] = x[3 * b] + px * c + cx * s + ux * dd * (1 - c);
      x[3 * m + 1] = x[3 * b + 1] + py * c + cy * s + uy * dd * (1 - c);
      x[3 * m + 2] = x[3 * b + 2] + pz * c + cz * s + uz * dd * (1 - c);
    }
  }

  /* ---------- API utama ---------- */
  function initCoords(M, rand, noise) {
    const x = new Float64Array(3 * M.N), P = M.parsed.atoms;
    for (let i = 0; i < M.N; i++) {
      x[3 * i] = P[i].x + (rand() - .5) * noise * .3; x[3 * i + 1] = P[i].y + (rand() - .5) * noise * .3; x[3 * i + 2] = (rand() - .5) * 2 * noise;
    }
    return x;
  }
  function optimise(M, T, ef, x) {
    minimize(x, ef, 0.05, 250, 0.5, 0.15);
    minimize(x, ef, 0.3, 250, 0.3, 0.2);
    return minimize(x, ef, 1, 2500, 0.02, 0.25);
  }
  function embedMolblock(mb, arom, opts) {
    opts = opts || {};
    const parsed = parseMolblock(mb), M = buildModel(parsed, arom);
    const N = M.N;
    if (N === 0) throw new Error('Molekul kosong');
    if (!opts.skipCalibration) calibrateTorsion();
    const T = buildTerms(M); M._T = T; const ef = makeEF(T);
    const rand = rng(opts.seed || 20240611);
    let best = null; const confs = [];
    if (N === 1) { const x = new Float64Array(3); return pack(M, T, x, 0, [{ E: 0 }], { chirOK: true, ezOK: true }, { maxBondDev: 0, minNonbonded: 9 }, parsed); }
    // konformer 0 dari depiksi 2D; ulangi dengan noise lebih besar bila stereokimia gagal
    let x0 = null, E0 = 0, st0 = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = initCoords(M, rand, 0.3 + 0.35 * attempt);
      const r = optimise(M, T, ef, x); const st = checkStereo(M, T, x);
      if (!x0 || (st.chirOK && st.ezOK && !(st0.chirOK && st0.ezOK))) { x0 = x; E0 = r.E; st0 = st; }
      if (st.chirOK && st.ezOK) { x0 = x; E0 = r.E; st0 = st; break; }
    }
    confs.push({ E: E0, x: x0, st: st0 }); best = confs[0];
    const nconf = Math.max(1, opts.nconf || 1);
    if (nconf > 1) {
      const rb = rotatableBonds(M);
      for (let c = 1; c < nconf; c++) {
        const x = Float64Array.from(x0);
        if (rb.length) for (const bd of rb) rotate(x, bd, (rand() * 2 - 1) * Math.PI);
        else for (let i = 0; i < x.length; i++) x[i] += (rand() - .5) * .3;
        const r = optimise(M, T, ef, x); const st = checkStereo(M, T, x);
        if (st.chirOK && st.ezOK) { confs.push({ E: r.E, x, st }); if (r.E < best.E - 1e-6) best = confs[confs.length - 1]; }
      }
    }
    const sn = sanity(M, best.x);
    return pack(M, T, best.x, confs.indexOf(best), confs, best.st, sn, parsed);
  }
  function pack(M, T, x, bestIdx, confs, st, sn, parsed) {
    // pusatkan
    const cx = [0, 0, 0]; for (let i = 0; i < M.N; i++) for (let q = 0; q < 3; q++) cx[q] += x[3 * i + q] / M.N;
    const atoms = []; for (let i = 0; i < M.N; i++) atoms.push({ el: M.el[i], x: x[3 * i] - cx[0], y: x[3 * i + 1] - cx[1], z: x[3 * i + 2] - cx[2] });
    // molblock 3D: ganti koordinat, nolkan flag stereo ikatan, header 3D
    const L = parsed.lines.slice();
    L[1] = '     QCStudio        3D';
    for (let i = 0; i < M.N; i++) { const l = L[4 + i]; const f = v => v.toFixed(4).padStart(10); L[4 + i] = f(atoms[i].x) + f(atoms[i].y) + f(atoms[i].z) + l.substr(30); }
    for (let j = 0; j < parsed.nb; j++) { const l = L[4 + parsed.na + j]; L[4 + parsed.na + j] = l.substr(0, 9) + '  0' + l.substr(12); }
    return {
      atoms, energy: confs[bestIdx].E, conformerEnergies: confs.map(c => c.E), bestIndex: bestIdx,
      stereoOK: st.chirOK && st.ezOK, chiralityOK: st.chirOK, ezOK: st.ezOK, maxBondDev: sn.maxBondDev, minNonbonded: sn.minNonbonded,
      molblock: L.join('\n'), nStereo: T.chir.length, nEZ: T.ez.length,
    };
  }

  const API = { embedMolblock, parseMolblock, buildModel, buildTerms, makeEF, minimize, calibrateTorsion, SUPPORTED, ZNUM, RCOV, VDW, _tors: tors, _volume: volume };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.QCEmbed = API;
})(typeof window !== 'undefined' ? window : globalThis);
