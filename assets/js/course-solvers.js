/* course-solvers.js — numerical kernels for the course (browser + node). Global: CSolve */
(function (g) {
  'use strict';
  /** symmetric tridiagonal eigen (QL implicit). d diag (n), e offdiag (n-1). returns {w, z} z[k] = eigenvector k (length n), ascending */
  function tqli(d0, e0, wantVec) {
    const n = d0.length, d = Float64Array.from(d0), e = new Float64Array(n); for (let i = 0; i < n - 1; i++) e[i] = e0[i];
    const z = []; if (wantVec) for (let i = 0; i < n; i++) { z.push(new Float64Array(n)); z[i][i] = 1; }
    for (let l = 0; l < n; l++) {
      let iter = 0, m;
      do {
        for (m = l; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 1e-15 * dd) break; }
        if (m !== l) {
          if (iter++ > 60) break;
          let gg = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(gg, 1);
          gg = d[m] - d[l] + e[l] / (gg + (gg >= 0 ? Math.abs(r) : -Math.abs(r)));
          let s = 1, c = 1, p = 0, i;
          for (i = m - 1; i >= l; i--) {
            let f = s * e[i], b = c * e[i];
            e[i + 1] = (r = Math.hypot(f, gg));
            if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
            s = f / r; c = gg / r; gg = d[i + 1] - p; r = (d[i] - gg) * s + 2 * c * b; p = s * r; d[i + 1] = gg + p; gg = c * r - b;
            if (wantVec) for (let k = 0; k < n; k++) { f = z[i + 1][k]; z[i + 1][k] = s * z[i][k] + c * f; z[i][k] = c * z[i][k] - s * f; }
          }
          if (r === 0 && i >= l) continue;
          d[l] -= p; e[l] = gg; e[m] = 0;
        }
      } while (m !== l);
    }
    const idx = Array.from(d.keys()).sort((a, b) => d[a] - d[b]);
    return { w: idx.map(i => d[i]), z: wantVec ? idx.map(i => z[i]) : null };
  }

  /* ---------- 1D toy Kohn–Sham-like SCF ---------- */
  const A_SOFT = 1.0, CX = 0.6; // soft-Coulomb parameter, toy exchange constant
  function makeToy(opts) {
    const N = opts.N, wells = opts.wells, n = 121, L = 9, x = new Float64Array(n), h = 2 * L / (n - 1);
    for (let i = 0; i < n; i++) x[i] = -L + i * h;
    const pos = wells === 1 ? [0] : wells === 2 ? [-2.2, 2.2] : [-4, 0, 4];
    const Zw = N / wells; // neutral 'molecule'
    const vext = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = 0; for (const p of pos) v -= Zw / Math.sqrt((x[i] - p) ** 2 + A_SOFT); vext[i] = v; }
    const K = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i * n + j] = 1 / Math.sqrt((x[i] - x[j]) ** 2 + A_SOFT);
    return { N, n, h, x, vext, K, nocc: N / 2, pos, L };
  }
  function vH(t, rho) { const { n, K, h } = t, v = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += K[i * n + j] * rho[j]; v[i] = s * h; } return v; }
  function solveKS(t, rho) {
    const { n, h } = t, vh = vH(t, rho), veff = new Float64Array(n);
    for (let i = 0; i < n; i++) veff[i] = t.vext[i] + vh[i] - (4 / 3) * CX * Math.cbrt(Math.max(rho[i], 0));
    const d = new Float64Array(n), e = new Float64Array(n - 1), tt = 1 / (h * h);
    for (let i = 0; i < n; i++) d[i] = tt + veff[i]; for (let i = 0; i < n - 1; i++) e[i] = -0.5 * tt;
    const r = tqli(d, e, true), out = new Float64Array(n);
    for (let k = 0; k < t.nocc; k++) { const f = r.z[k]; let nm = 0; for (let i = 0; i < n; i++) nm += f[i] * f[i]; nm = Math.sqrt(nm * h); for (let i = 0; i < n; i++) out[i] += 2 * (f[i] / nm) ** 2; }
    // energy terms of the functional evaluated at rho_out
    const vhO = vH(t, out); let Ts = 0, Eext = 0, EH = 0, Ex = 0, rv = 0;
    for (let k = 0; k < t.nocc; k++) Ts += 2 * r.w[k];
    for (let i = 0; i < n; i++) { rv += rho[i] * 0; }
    let sumRhoVeff = 0; for (let i = 0; i < n; i++) sumRhoVeff += out[i] * veff[i] * h;
    Ts -= sumRhoVeff;
    for (let i = 0; i < n; i++) { Eext += out[i] * t.vext[i] * h; EH += 0.5 * out[i] * vhO[i] * h; Ex += -CX * Math.pow(Math.max(out[i], 0), 4 / 3) * h; }
    return { rhoOut: out, veff, eps: r.w.slice(0, t.nocc + 3), Ts, Eext, EH, Ex, E: Ts + Eext + EH + Ex };
  }
  function solveLin(B, m) { // gaussian elimination for DIIS (m+1 system)
    const n = m + 1, a = B.map(r => r.slice());
    const rhs = new Array(n).fill(0); rhs[m] = -1;
    for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k; [a[i], a[p]] = [a[p], a[i]]; [rhs[i], rhs[p]] = [rhs[p], rhs[i]]; if (Math.abs(a[i][i]) < 1e-300) return null; for (let k = i + 1; k < n; k++) { const f = a[k][i] / a[i][i]; for (let j = i; j < n; j++) a[k][j] -= f * a[i][j]; rhs[k] -= f * rhs[i]; } }
    const c = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = rhs[i]; for (let j = i + 1; j < n; j++) s -= a[i][j] * c[j]; c[i] = s / a[i][i]; }
    return c;
  }
  /** run full SCF; opts {N,wells,alpha,diis,guess:'core'|'uniform'|'atoms', maxit} -> {iters:[{rho,rhoIn,veff,eps,E,dE,res,Ts,Eext,EH,Ex}], toy} */
  function runSCF(opts) {
    const t = makeToy(opts), n = t.n, h = t.h, maxit = opts.maxit || 60, alpha = opts.alpha;
    let rho = new Float64Array(n);
    if (opts.guess === 'core') rho = solveKS(t, new Float64Array(n)).rhoOut; // eigenstates of bare Hamiltonian (+ exchange 0)
    else if (opts.guess === 'uniform') { const w = 2 * t.L; for (let i = 0; i < n; i++) rho[i] = opts.N / w; }
    else { for (let i = 0; i < n; i++) { let s = 0; for (const p of t.pos) s += Math.exp(-((t.x[i] - p) ** 2) / 2); rho[i] = s; } let q = 0; for (let i = 0; i < n; i++) q += rho[i] * h; for (let i = 0; i < n; i++) rho[i] *= opts.N / q; }
    const iters = [], hist = []; let Eprev = null;
    for (let it = 0; it < maxit; it++) {
      const r = solveKS(t, rho), res = new Float64Array(n); let rn = 0;
      for (let i = 0; i < n; i++) { res[i] = r.rhoOut[i] - rho[i]; rn += res[i] * res[i] * h; }
      rn = Math.sqrt(rn);
      iters.push({ rho: r.rhoOut, rhoIn: Float64Array.from(rho), veff: r.veff, eps: r.eps, E: r.E, dE: Eprev == null ? null : r.E - Eprev, res: rn, Ts: r.Ts, Eext: r.Eext, EH: r.EH, Ex: r.Ex });
      Eprev = r.E; if (rn < 1e-10 && it > 1) break;
      const nxt = new Float64Array(n);
      if (opts.diis && it >= 2) {
        hist.push({ rho: Float64Array.from(rho), res }); if (hist.length > 6) hist.shift();
        const m = hist.length, B = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < n; k++) s += hist[i].res[k] * hist[j].res[k]; B[i][j] = s * h; }
        let tr = 0; for (let i = 0; i < m; i++) tr += B[i][i]; for (let i = 0; i < m; i++) { B[i][i] += 1e-6 * tr / m; B[i][m] = -1; B[m][i] = -1; }
        const c = solveLin(B, m);
        if (c && c.every(isFinite) && c.slice(0, m).every(v => Math.abs(v) < 8)) for (let i = 0; i < m; i++) for (let k = 0; k < n; k++) nxt[k] += c[i] * (hist[i].rho[k] + alpha * hist[i].res[k]);
        else for (let k = 0; k < n; k++) nxt[k] = rho[k] + alpha * res[k];
      } else { if (opts.diis) hist.push({ rho: Float64Array.from(rho), res }); for (let k = 0; k < n; k++) nxt[k] = rho[k] + alpha * res[k]; }
      let q2 = 0; for (let k = 0; k < n; k++) { if (nxt[k] < 0) nxt[k] = 0; q2 += nxt[k] * h; } for (let k = 0; k < n; k++) nxt[k] *= opts.N / q2;
      rho = nxt;
    }
    return { iters, toy: t };
  }

  /* ---------- 2 electrons in a 1D box on a 2D grid (Lanczos) ---------- */
  function twoElectron(lambda, nx) {
    nx = nx || 40; const Lb = 8, h = Lb / (nx + 1), x = Array.from({ length: nx }, (_, i) => (i + 1) * h), N = nx * nx, t = 1 / (h * h);
    const W = new Float64Array(N); for (let i = 0; i < nx; i++) for (let j = 0; j < nx; j++) W[i * nx + j] = lambda / Math.sqrt((x[i] - x[j]) ** 2 + 1);
    const Hv = (v, out) => { for (let i = 0; i < nx; i++) for (let j = 0; j < nx; j++) { const k = i * nx + j; let s = 2 * t * v[k] + W[k] * v[k]; if (i > 0) s -= 0.5 * t * v[k - nx]; if (i < nx - 1) s -= 0.5 * t * v[k + nx]; if (j > 0) s -= 0.5 * t * v[k - 1]; if (j < nx - 1) s -= 0.5 * t * v[k + 1]; out[k] = s; } };
    const m = 90, V = [], al = [], be = []; let v = new Float64Array(N); for (let k = 0; k < N; k++) v[k] = Math.sin(Math.PI * (Math.floor(k / nx) + 1) / (nx + 1)) * Math.sin(Math.PI * (k % nx + 1) / (nx + 1));
    let nm = Math.sqrt(v.reduce((s, a) => s + a * a, 0)); v = v.map(a => a / nm); const w = new Float64Array(N);
    for (let j = 0; j < m; j++) {
      V.push(v); Hv(v, w); let a = 0; for (let k = 0; k < N; k++) a += w[k] * v[k]; al.push(a);
      for (let k = 0; k < N; k++) w[k] -= a * v[k] + (j ? be[j - 1] * V[j - 1][k] : 0);
      for (let q = 0; q <= j; q++) { let d = 0; for (let k = 0; k < N; k++) d += w[k] * V[q][k]; for (let k = 0; k < N; k++) w[k] -= d * V[q][k]; }
      const b = Math.sqrt(w.reduce((s, a2) => s + a2 * a2, 0)); if (b < 1e-10) break; be.push(b); v = w.map(a2 => a2 / b);
    }
    const r = tqli(al, be.slice(0, al.length - 1), true), c = r.z[0], psi = new Float64Array(N);
    for (let q = 0; q < al.length; q++) for (let k = 0; k < N; k++) psi[k] += c[q] * V[q][k];
    let s2 = 0; for (let k = 0; k < N; k++) s2 += psi[k] * psi[k]; s2 = Math.sqrt(s2 * h * h); for (let k = 0; k < N; k++) psi[k] /= s2;
    return { E: r.w[0], psi, nx, x, h, Lb };
  }
  /* ---------- Müller–Brown ---------- */
  const MB = { A: [-200, -100, -170, 15], a: [-1, -1, -6.5, 0.7], b: [0, 0, 11, 0.6], c: [-10, -10, -6.5, 0.7], x0: [1, 0, -0.5, -1], y0: [0, 0.5, 1.5, 1] };
  function mbV(x, y) { let v = 0; for (let k = 0; k < 4; k++) { const dx = x - MB.x0[k], dy = y - MB.y0[k]; v += MB.A[k] * Math.exp(MB.a[k] * dx * dx + MB.b[k] * dx * dy + MB.c[k] * dy * dy); } return v; }
  function mbG(x, y) { let gx = 0, gy = 0; for (let k = 0; k < 4; k++) { const dx = x - MB.x0[k], dy = y - MB.y0[k], e = MB.A[k] * Math.exp(MB.a[k] * dx * dx + MB.b[k] * dx * dy + MB.c[k] * dy * dy); gx += e * (2 * MB.a[k] * dx + MB.b[k] * dy); gy += e * (MB.b[k] * dx + 2 * MB.c[k] * dy); } return [gx, gy]; }
  function mbOpt(x, y, method, maxit) {
    const path = [[x, y]]; let p = [x, y], g = mbG(...p), H = [[1, 0], [0, 1]]; maxit = maxit || 400;
    for (let it = 0; it < maxit; it++) {
      const gn = Math.hypot(g[0], g[1]); if (gn < 1e-3) break;
      let d;
      if (method === 'sd') { d = [-g[0], -g[1]]; const f = Math.min(0.0004, 0.05 / gn); d = [d[0] * f, d[1] * f]; }
      else { d = [-(H[0][0] * g[0] + H[0][1] * g[1]), -(H[1][0] * g[0] + H[1][1] * g[1])]; if (d[0] * g[0] + d[1] * g[1] >= 0) { H = [[1, 0], [0, 1]]; d = [-g[0], -g[1]]; } const dn = Math.hypot(d[0], d[1]); if (dn > 0.3) d = [d[0] * 0.3 / dn, d[1] * 0.3 / dn]; let tt = 1; const v0 = mbV(...p); while (tt > 1e-6 && mbV(p[0] + tt * d[0], p[1] + tt * d[1]) > v0 + 1e-4 * tt * (g[0] * d[0] + g[1] * d[1])) tt /= 2; d = [d[0] * tt, d[1] * tt]; }
      const pn = [p[0] + d[0], p[1] + d[1]], gnw = mbG(...pn);
      if (method !== 'sd') { const s = d, y2 = [gnw[0] - g[0], gnw[1] - g[1]], sy = s[0] * y2[0] + s[1] * y2[1]; if (sy > 1e-10) { const rho = 1 / sy; const I = [[1, 0], [0, 1]]; const A1 = [[I[0][0] - rho * s[0] * y2[0], -rho * s[0] * y2[1]], [-rho * s[1] * y2[0], 1 - rho * s[1] * y2[1]]]; const tmp = [[0, 0], [0, 0]]; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) tmp[i][j] += A1[i][k] * H[k][j]; const Hn = [[0, 0], [0, 0]]; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { for (let k = 0; k < 2; k++) Hn[i][j] += tmp[i][k] * A1[j][k]; Hn[i][j] += rho * s[i] * s[j]; } H = Hn; } }
      p = pn; g = gnw; path.push(p.slice());
    }
    return path;
  }
  g.CSolve = { tqli, runSCF, makeToy, twoElectron, mbV, mbG, mbOpt };
  if (typeof module !== 'undefined') module.exports = g.CSolve;
})(typeof window !== 'undefined' ? window : globalThis);
