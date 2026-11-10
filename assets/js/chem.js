/* chem.js — chemistry data & geometry helpers shared by all pages. Global: QCHEM */
(function (global) {
  'use strict';
  const SYM = ['', 'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','Po','At','Rn'];
  // Cordero et al. 2008 covalent radii (Å)
  const RCOV = [0,.31,.28,1.28,.96,.84,.76,.71,.66,.57,.58,1.66,1.41,1.21,1.11,1.07,1.05,1.02,1.06,2.03,1.76,1.70,1.60,1.53,1.39,1.39,1.32,1.26,1.24,1.32,1.22,1.22,1.20,1.19,1.20,1.20,1.16,2.20,1.95,1.90,1.75,1.64,1.54,1.47,1.46,1.42,1.39,1.45,1.44,1.42,1.39,1.39,1.38,1.39,1.40,2.44,2.15,2.07,2.04,2.03,2.01,1.99,1.98,1.98,1.96,1.94,1.92,1.92,1.89,1.90,1.87,1.87,1.75,1.70,1.62,1.51,1.44,1.41,1.36,1.36,1.32,1.45,1.46,1.48,1.40,1.50,1.50];
  const MASS = [0,1.008,4.0026,6.94,9.0122,10.81,12.011,14.007,15.999,18.998,20.180,22.990,24.305,26.982,28.085,30.974,32.06,35.45,39.948,39.098,40.078,44.956,47.867,50.942,51.996,54.938,55.845,58.933,58.693,63.546,65.38,69.723,72.630,74.922,78.971,79.904,83.798,85.468,87.62,88.906,91.224,92.906,95.95,98,101.07,102.91,106.42,107.87,112.41,114.82,118.71,121.76,127.60,126.90,131.29,132.91,137.33,138.91,140.12,140.91,144.24,145,150.36,151.96,157.25,158.93,162.50,164.93,167.26,168.93,173.05,174.97,178.49,180.95,183.84,186.21,190.23,192.22,195.08,196.97,200.59,204.38,207.2,208.98,209,210,222];
  // CPK-like colours for plots / labels (hex)
  const COLOR = {H:'#ffffff',C:'#909090',N:'#3050f8',O:'#ff0d0d',F:'#90e050',Cl:'#1ff01f',Br:'#a62929',I:'#940094',S:'#ffff30',P:'#ff8000',B:'#ffb5b5',Si:'#f0c8a0',Na:'#ab5cf2',Pb:'#575961',Ti:'#bfc2c7',Zn:'#7d80b0',Fe:'#e06633',Cu:'#c88033',Sn:'#668080'};
  const Z = {}; SYM.forEach((s, i) => { if (s) Z[s] = i; });
  const norm = s => { s = String(s).trim(); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  const zOf = s => { const t = String(s).trim(); if (/^\d+$/.test(t)) return +t; return Z[norm(t.replace(/[^A-Za-z].*$/, ''))] || 0; };

  /** parse XYZ text (with or without the two header lines). returns {atoms:[{el,x,y,z}], comment} */
  function parseXYZ(text) {
    const lines = String(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter((l, i, a) => l.length || i < a.length);
    let start = 0, comment = '';
    if (/^\d+$/.test(lines[0] || '')) { start = 2; comment = lines[1] || ''; }
    const atoms = [];
    for (let i = start; i < lines.length; i++) {
      const p = lines[i].split(/\s+/);
      if (p.length < 4) continue;
      const x = +p[1], y = +p[2], zc = +p[3];
      if (!isFinite(x) || !isFinite(y) || !isFinite(zc)) continue;
      const z = zOf(p[0]); if (!z) continue;
      atoms.push({ el: SYM[z], x, y, z: zc });
    }
    if (start === 2) { const n = +lines[0]; if (n && atoms.length > n) atoms.length = n; }
    return { atoms, comment };
  }
  function toXYZ(atoms, comment) {
    const f = v => (v < 0 ? '' : ' ') + v.toFixed(6);
    return atoms.length + '\n' + (comment || '') + '\n' + atoms.map(a => a.el.padEnd(2) + '  ' + f(a.x) + '  ' + f(a.y) + '  ' + f(a.z)).join('\n') + '\n';
  }
  function xyzBlock(atoms) { return atoms.map(a => a.el.padEnd(2) + '  ' + a.x.toFixed(6).padStart(12) + a.y.toFixed(6).padStart(14) + a.z.toFixed(6).padStart(14)).join('\n'); }
  function electronCount(atoms, charge) { return atoms.reduce((s, a) => s + (Z[a.el] || 0), 0) - (charge || 0); }
  function formula(atoms) {
    const c = {}; atoms.forEach(a => c[a.el] = (c[a.el] || 0) + 1);
    const keys = Object.keys(c); let order;
    if (c.C) order = ['C', 'H'].filter(k => c[k]).concat(keys.filter(k => k !== 'C' && k !== 'H').sort());
    else order = keys.sort();
    return order.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
  }
  function mass(atoms) { return atoms.reduce((s, a) => s + (MASS[Z[a.el]] || 0), 0); }
  /** multiplicity must have same parity as (nElectrons+1) */
  function multParityOK(nElec, mult) { return ((nElec + 1 - mult) % 2 + 2) % 2 === 0; }
  const HEAVY_Z = 36; // flag Z>36 for ECP warnings
  function heavyElements(atoms) { return [...new Set(atoms.filter(a => Z[a.el] > HEAVY_Z).map(a => a.el))]; }

  /* ---- geometry ---- */
  const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = u => Math.sqrt(dot(u, u));
  const dist = (a, b) => len(sub(a, b));
  function angle(a, b, c) { const u = sub(a, b), v = sub(c, b); const x = dot(u, v) / (len(u) * len(v)); return Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI; }
  function dihedral(a, b, c, d) {
    const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
    const n1 = cross(b1, b2), n2 = cross(b2, b3), m1 = cross(n1, [b2[0] / len(b2), b2[1] / len(b2), b2[2] / len(b2)]);
    return Math.atan2(dot(m1, n2), dot(n1, n2)) * 180 / Math.PI;
  }
  /** connectivity from covalent radii. tol in Å added to sum of radii */
  function perceiveBonds(atoms, tol) {
    tol = tol == null ? 0.4 : tol; const bonds = [], n = atoms.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = dist(atoms[i], atoms[j]); if (d < 0.4) continue;
      const lim = (RCOV[Z[atoms[i].el]] || 1.5) + (RCOV[Z[atoms[j].el]] || 1.5) + tol;
      if (d <= lim) bonds.push([i, j, d]);
    }
    return bonds;
  }
  function neighbors(n, bonds) { const nb = Array.from({ length: n }, () => []); bonds.forEach(([i, j]) => { nb[i].push(j); nb[j].push(i); }); return nb; }
  /** smallest rings via BFS per bond; returns array of index arrays (size<=maxSize), deduped */
  function findRings(n, bonds, maxSize) {
    maxSize = maxSize || 9; const nb = neighbors(n, bonds), seen = new Set(), rings = [];
    for (const [a, b] of bonds) {
      // shortest path a->b not using edge a-b
      const prev = new Array(n).fill(-1), q = [a]; prev[a] = a; let found = false;
      for (let h = 0; h < q.length && !found; h++) {
        const u = q[h];
        for (const v of nb[u]) {
          if ((u === a && v === b)) continue;
          if (prev[v] !== -1) continue; prev[v] = u; if (v === b) { found = true; break; } q.push(v);
        }
      }
      if (!found) continue;
      const path = []; for (let x = b; x !== a; x = prev[x]) path.push(x); path.push(a);
      if (path.length > maxSize) continue;
      const key = path.slice().sort((x, y) => x - y).join(',');
      if (!seen.has(key)) { seen.add(key); rings.push(path.reverse()); }
    }
    return rings;
  }
  /** symmetric 3x3 Jacobi eigen decomposition -> {values, vectors(columns)} */
  function eig3(A) {
    const a = A.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]); if (off < 1e-14) break;
      for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const vals = [a[0][0], a[1][1], a[2][2]]; const idx = [0, 1, 2].sort((i, j) => vals[i] - vals[j]);
    return { values: idx.map(i => vals[i]), vectors: idx.map(i => [V[0][i], V[1][i], V[2][i]]) };
  }
  /** best-fit plane for atom index list. returns {rmsd, maxDev, normal, centroid} (Å) */
  function planarity(atoms, idx) {
    const P = idx.map(i => atoms[i]); const n = P.length; if (n < 3) return null;
    const c = [0, 1, 2].map(k => P.reduce((s, p) => s + [p.x, p.y, p.z][k], 0) / n);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    P.forEach(p => { const d = [p.x - c[0], p.y - c[1], p.z - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
    const e = eig3(C), nrm = e.vectors[0];
    const devs = P.map(p => dot([p.x - c[0], p.y - c[1], p.z - c[2]], nrm));
    return { rmsd: Math.sqrt(devs.reduce((s, d) => s + d * d, 0) / n), maxDev: Math.max(...devs.map(Math.abs)), normal: nrm, centroid: c, devs };
  }
  /** all bond lengths / angles / dihedrals from atoms. */
  function internalCoords(atoms, bonds, opts) {
    opts = opts || {}; const nb = neighbors(atoms.length, bonds), out = { bonds: [], angles: [], dihedrals: [] };
    bonds.forEach(([i, j, d]) => out.bonds.push({ i, j, value: d }));
    for (let b = 0; b < atoms.length; b++) for (let x = 0; x < nb[b].length; x++) for (let y = x + 1; y < nb[b].length; y++) {
      const a = nb[b][x], c = nb[b][y]; out.angles.push({ i: a, j: b, k: c, value: angle(atoms[a], atoms[b], atoms[c]) });
    }
    bonds.forEach(([b, c]) => nb[b].forEach(a => { if (a === c) return; nb[c].forEach(d => { if (d === b || d === a) return; out.dihedrals.push({ i: a, j: b, k: c, l: d, value: dihedral(atoms[a], atoms[b], atoms[c], atoms[d]) }); }); }));
    return out;
  }
  function label(atoms, i) { return atoms[i].el + (i + 1); }
  function centerAtoms(atoms) { const n = atoms.length || 1; const c = ['x', 'y', 'z'].map(k => atoms.reduce((s, a) => s + a[k], 0) / n); return atoms.map(a => ({ el: a.el, x: a.x - c[0], y: a.y - c[1], z: a.z - c[2] })); }

  global.QCHEM = { SYM, Z, RCOV, MASS, COLOR, zOf, norm, parseXYZ, toXYZ, xyzBlock, electronCount, formula, mass, multParityOK, heavyElements, dist, angle, dihedral, perceiveBonds, neighbors, findRings, eig3, planarity, internalCoords, label, centerAtoms };
})(window);
