/* 1D Kohn–Sham-like model used in the course (SCF demo + energy decomposition).
   Atomic-like units; soft-Coulomb interactions 1/sqrt(x^2+a^2); LDA-like xc: v_xc = -c * rho^(1/3). */
(function (root) {
  'use strict';

  /* symmetric tridiagonal eigen-solver (QL implicit, Numerical-Recipes tqli) with eigenvectors */
  function tridiagEig(diag, off) {
    const n = diag.length, d = Float64Array.from(diag), e = new Float64Array(n);
    for (let i = 1; i < n; i++) e[i - 1] = off[i - 1];
    const z = []; for (let i = 0; i < n; i++) { z.push(new Float64Array(n)); z[i][i] = 1; }
    for (let l = 0; l < n; l++) {
      let iter = 0, m;
      do {
        for (m = l; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 1e-15 * dd) break; }
        if (m !== l) {
          if (iter++ > 60) break;
          let g = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(g, 1);
          g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
          let s = 1, c = 1, p = 0, i;
          for (i = m - 1; i >= l; i--) {
            let f = s * e[i], b = c * e[i];
            r = Math.hypot(f, g); e[i + 1] = r;
            if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
            s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b; p = s * r; d[i + 1] = g + p; g = c * r - b;
            for (let k = 0; k < n; k++) { f = z[k][i + 1]; z[k][i + 1] = s * z[k][i] + c * f; z[k][i] = c * z[k][i] - s * f; }
          }
          if (r === 0 && i >= l) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
    const idx = Array.from(d.keys()).sort((a, b) => d[a] - d[b]);
    return { values: idx.map(i => d[i]), vectors: idx.map(i => Float64Array.from(z.map(row => row[i]))) };
  }

  function solveLinear(A, b) { // gaussian elimination w/ pivoting
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-300) return null;
      for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }

  class KS1D {
    /* opts: {nel, nuclei:[{R,Z}], alpha, diis, n, L, a, cxc} */
    constructor(o) {
      this.o = Object.assign({ nel: 4, nuclei: [{ R: 0, Z: 4 }], alpha: 0.5, diis: false, n: 160, L: 12, a: 1.0, cxc: 0.6, diisN: 6 }, o);
      const O = this.o; this.n = O.n; this.h = 2 * O.L / (O.n - 1);
      this.x = Array.from({ length: O.n }, (_, i) => -O.L + i * this.h);
      this.vext = this.x.map(x => O.nuclei.reduce((s, k) => s - k.Z / Math.sqrt((x - k.R) ** 2 + O.a * O.a), 0));
      // Hartree kernel
      this.K = this.x.map(xi => this.x.map(xj => 1 / Math.sqrt((xi - xj) ** 2 + O.a * O.a)));
      let enn = 0; for (let i = 0; i < O.nuclei.length; i++) for (let j = i + 1; j < O.nuclei.length; j++) enn += O.nuclei[i].Z * O.nuclei[j].Z / Math.sqrt((O.nuclei[i].R - O.nuclei[j].R) ** 2 + O.a * O.a);
      this.enn = enn;
      this.reset();
    }
    reset() {
      const O = this.o; this.iter = 0; this.history = []; this.hist_in = []; this.hist_res = [];
      let rho = this.x.map(x => O.nuclei.reduce((s, k) => s + k.Z * Math.exp(-((x - k.R) ** 2) / 2), 0));
      const q = rho.reduce((s, v) => s + v, 0) * this.h; this.rho_in = rho.map(v => v * O.nel / q);
      this.E_prev = null; this.converged = false;
    }
    integrate(f) { return f.reduce((s, v) => s + v, 0) * this.h; }
    potentials(rho) {
      const O = this.o, n = this.n, vH = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; const Ki = this.K[i]; for (let j = 0; j < n; j++) s += Ki[j] * rho[j]; vH[i] = s * this.h; }
      const vxc = rho.map(r => -O.cxc * Math.cbrt(Math.max(r, 0)));
      return { vH, vxc };
    }
    /* one full SCF cycle. returns record */
    step() {
      const O = this.o, n = this.n, h = this.h, nocc = Math.round(O.nel / 2);
      const rin = this.rho_in, { vH, vxc } = this.potentials(rin);
      const diag = new Array(n), off = new Array(n - 1).fill(-0.5 / (h * h));
      for (let i = 0; i < n; i++) diag[i] = 1 / (h * h) + this.vext[i] + vH[i] + vxc[i];
      const eig = tridiagEig(diag, off);
      const rout = new Array(n).fill(0); let Ts = 0;
      for (let k = 0; k < nocc; k++) {
        const v = eig.vectors[k];
        for (let i = 0; i < n; i++) rout[i] += 2 * v[i] * v[i] / h;
        // kinetic <phi|T|phi>
        let t = 0; for (let i = 0; i < n; i++) { t += v[i] * v[i] / (h * h); if (i < n - 1) t += -v[i] * v[i + 1] / (h * h); }
        Ts += 2 * t;
      }
      // energy functional of rho_out
      const { vH: vHo } = this.potentials(rout);
      let Eext = 0, EH = 0, Exc = 0;
      for (let i = 0; i < n; i++) { Eext += rout[i] * this.vext[i]; EH += 0.5 * rout[i] * vHo[i]; Exc += -0.75 * O.cxc * Math.pow(Math.max(rout[i], 0), 4 / 3); }
      Eext *= h; EH *= h; Exc *= h;
      const E = Ts + Eext + EH + Exc + this.enn;
      let drho = 0; for (let i = 0; i < n; i++) drho += (rout[i] - rin[i]) ** 2; drho = Math.sqrt(drho * h);
      const rec = {
        iter: ++this.iter, E, dE: this.E_prev == null ? NaN : E - this.E_prev, drho,
        eps: eig.values.slice(0, nocc + 3), nocc, rho_in: rin.slice(), rho_out: rout, Ts, Eext, EH, Exc, Enn: this.enn,
        vH, vxc, vtot: diag.map((d, i) => d - 1 / (h * h)), orbitals: eig.vectors.slice(0, nocc + 2).map(v => Array.from(v, t => t / Math.sqrt(h)))
      };
      this.E_prev = E;
      // mixing
      const res = rout.map((r, i) => r - rin[i]);
      let next;
      if (O.diis) {
        this.hist_in.push(rin.slice()); this.hist_res.push(res.slice());
        if (this.hist_in.length > O.diisN) { this.hist_in.shift(); this.hist_res.shift(); }
        const m = this.hist_in.length;
        let c = null;
        if (m >= 2) {
          const A = []; for (let i = 0; i <= m; i++) A.push(new Array(m + 1).fill(0));
          for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < n; k++) s += this.hist_res[i][k] * this.hist_res[j][k]; A[i][j] = s * h; }
          for (let i = 0; i < m; i++) { A[i][m] = -1; A[m][i] = -1; }
          const b = new Array(m + 1).fill(0); b[m] = -1;
          const sol = solveLinear(A, b); if (sol) c = sol.slice(0, m);
        }
        if (c && c.every(isFinite)) { next = new Array(n).fill(0); for (let i = 0; i < m; i++) for (let k = 0; k < n; k++) next[k] += c[i] * (this.hist_in[i][k] + O.alpha * this.hist_res[i][k]); }
        else next = rin.map((r, i) => r + O.alpha * res[i]);
      } else next = rin.map((r, i) => r + O.alpha * res[i]);
      next = next.map(v => Math.max(v, 0));
      const q = this.integrate(next); if (q > 0) next = next.map(v => v * O.nel / q);
      this.rho_in = next;
      rec.converged = drho < 1e-6 && Math.abs(rec.dE) < 1e-8;
      this.converged = rec.converged;
      this.history.push(rec);
      return rec;
    }
    run(max = 60) { let r; for (let i = 0; i < max; i++) { r = this.step(); if (r.converged) break; } return r; }
  }

  const api = { KS1D, tridiagEig, solveLinear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KSModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
