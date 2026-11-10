/* input-data.js — option tables for ORCA / Gaussian input builder. Global: QIDATA (also module.exports) */
(function (root) {
  'use strict';
  const D = {};
  /* ---------------- ORCA ---------------- */
  // type: hf | dft | dh (double hybrid) | mp2 | cc ; hybrid: needs exchange (RIJCOSX); rs: range-separated
  D.orcaMethods = [
    { key: 'B3LYP', label: 'B3LYP (hibrida global)', kw: 'B3LYP', type: 'dft', hybrid: true, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'hibrida global 20% HF (varian VWN5 di ORCA)' },
    { key: 'PBE0', label: 'PBE0 (hibrida global)', kw: 'PBE0', type: 'dft', hybrid: true, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'hibrida global 25% HF' },
    { key: 'CAM-B3LYP', label: 'CAM-B3LYP (range-separated)', kw: 'CAM-B3LYP', type: 'dft', hybrid: true, rs: true, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'hibrida range-separated, baik untuk TD-DFT charge-transfer' },
    { key: 'wB97X-D3', label: 'ωB97X-D3 (range-separated + D3)', kw: 'wB97X-D3', type: 'dft', hybrid: true, rs: true, dispIntrinsic: 'D3', disp: [], desc: 'range-separated; koreksi dispersi D3 sudah termasuk' },
    { key: 'wB97X-V', label: 'ωB97X-V (range-separated + VV10)', kw: 'wB97X-V', type: 'dft', hybrid: true, rs: true, dispIntrinsic: 'VV10', disp: [], desc: 'range-separated + dispersi nonlokal VV10 (sudah termasuk)' },
    { key: 'wB97M-V', label: 'ωB97M-V (meta, range-separated + VV10)', kw: 'wB97M-V', type: 'dft', hybrid: true, rs: true, dispIntrinsic: 'VV10', disp: [], desc: 'meta-GGA range-separated + VV10 (sudah termasuk)' },
    { key: 'M062X', label: 'M06-2X (hibrida meta)', kw: 'M062X', type: 'dft', hybrid: true, disp: ['D3ZERO', 'D4'], defDisp: 'D3ZERO', desc: 'hibrida meta-GGA 54% HF' },
    { key: 'TPSSh', label: 'TPSSh (hibrida meta)', kw: 'TPSSh', type: 'dft', hybrid: true, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'hibrida meta-GGA 10% HF' },
    { key: 'BP86', label: 'BP86 (GGA murni)', kw: 'BP86', type: 'dft', hybrid: false, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'GGA murni (cepat dengan RI)' },
    { key: 'PBE', label: 'PBE (GGA murni)', kw: 'PBE', type: 'dft', hybrid: false, disp: ['D3BJ', 'D3ZERO', 'D4'], defDisp: 'D3BJ', desc: 'GGA murni' },
    { key: 'r2SCAN', label: 'r²SCAN (meta-GGA murni)', kw: 'r2SCAN', type: 'dft', hybrid: false, disp: ['D3BJ', 'D4'], defDisp: 'D3BJ', desc: 'meta-GGA murni' },
    { key: 'r2SCAN-3c', label: 'r²SCAN-3c (komposit; basis+disp built-in)', kw: 'r2SCAN-3c', type: 'dft', comp: true, desc: 'metode komposit: basis, gCP, dispersi sudah termasuk' },
    { key: 'B97-3c', label: 'B97-3c (komposit)', kw: 'B97-3c', type: 'dft', comp: true, desc: 'metode komposit murah' },
    { key: 'PBEh-3c', label: 'PBEh-3c (komposit)', kw: 'PBEh-3c', type: 'dft', comp: true, desc: 'hibrida komposit murah' },
    { key: 'B2PLYP', label: 'B2PLYP (double hybrid)', kw: 'B2PLYP', type: 'dh', hybrid: true, disp: ['D3BJ', 'D3ZERO'], defDisp: 'D3BJ', desc: 'double hybrid (butuh aux /C)' },
    { key: 'DSD-BLYP', label: 'DSD-BLYP (double hybrid + D3BJ)', kw: 'DSD-BLYP', type: 'dh', hybrid: true, dispIntrinsic: 'D3BJ', disp: [], desc: 'double hybrid spin-component-scaled (dispersi termasuk)' },
    { key: 'HF', label: 'Hartree–Fock', kw: 'HF', type: 'hf', hybrid: true, disp: ['D3BJ', 'D3ZERO'], defDisp: null, desc: 'Hartree–Fock' },
    { key: 'RI-MP2', label: 'RI-MP2', kw: 'RI-MP2', type: 'mp2', desc: 'MP2 dengan aproksimasi RI (butuh aux /C)' },
    { key: 'DLPNO-CCSD(T)', label: 'DLPNO-CCSD(T)', kw: 'DLPNO-CCSD(T)', type: 'cc', extra: 'NormalPNO', desc: 'coupled-cluster skala-lokal (emas-standar murah) — single point' }
  ];
  // fam: def2 | pople | dunning | sto ; maxZ: last element covered ; size: approx basis functions per [H, 2nd row, 3rd row, heavier]
  D.orcaBases = [
    { key: 'def2-SVP', kw: 'def2-SVP', fam: 'def2', diffuse: false, maxZ: 86, cAux: true, size: [5, 14, 18, 32] },
    { key: 'def2-TZVP', kw: 'def2-TZVP', fam: 'def2', diffuse: false, maxZ: 86, cAux: true, size: [6, 31, 37, 50] },
    { key: 'def2-TZVPP', kw: 'def2-TZVPP', fam: 'def2', diffuse: false, maxZ: 86, cAux: true, size: [14, 31, 37, 55] },
    { key: 'def2-QZVP', kw: 'def2-QZVP', fam: 'def2', diffuse: false, maxZ: 86, cAux: true, size: [30, 57, 63, 90] },
    { key: 'def2-SVPD', kw: 'def2-SVPD', fam: 'def2', diffuse: true, maxZ: 86, cAux: false, size: [8, 20, 24, 38] },
    { key: 'def2-TZVPD', kw: 'def2-TZVPD', fam: 'def2', diffuse: true, maxZ: 86, cAux: false, size: [9, 37, 43, 56] },
    { key: 'ma-def2-SVP', kw: 'ma-def2-SVP', fam: 'def2', diffuse: true, maxZ: 86, cAux: false, size: [5, 18, 22, 34] },
    { key: 'ma-def2-TZVP', kw: 'ma-def2-TZVP', fam: 'def2', diffuse: true, maxZ: 86, cAux: false, size: [6, 36, 42, 52] },
    { key: '6-31G(d)', kw: '6-31G(d)', fam: 'pople', diffuse: false, maxZ: 36, size: [2, 15, 19, 36] },
    { key: '6-31G(d,p)', kw: '6-31G(d,p)', fam: 'pople', diffuse: false, maxZ: 36, size: [5, 15, 19, 36] },
    { key: '6-31+G(d,p)', kw: '6-31+G(d,p)', fam: 'pople', diffuse: true, maxZ: 36, size: [5, 19, 23, 40] },
    { key: '6-311++G(d,p)', kw: '6-311++G(d,p)', fam: 'pople', diffuse: true, maxZ: 36, size: [7, 22, 26, 42] },
    { key: 'cc-pVDZ', kw: 'cc-pVDZ', fam: 'dunning', diffuse: false, maxZ: 36, size: [5, 14, 18, 32] },
    { key: 'cc-pVTZ', kw: 'cc-pVTZ', fam: 'dunning', diffuse: false, maxZ: 36, size: [14, 30, 34, 52] },
    { key: 'aug-cc-pVDZ', kw: 'aug-cc-pVDZ', fam: 'dunning', diffuse: true, maxZ: 36, size: [9, 23, 27, 40] },
    { key: 'aug-cc-pVTZ', kw: 'aug-cc-pVTZ', fam: 'dunning', diffuse: true, maxZ: 36, size: [23, 46, 50, 70] },
    { key: 'STO-3G', kw: 'STO-3G', fam: 'sto', diffuse: false, maxZ: 53, size: [1, 5, 9, 18] }
  ];
  D.orcaSolventsCPCM = ['water', 'acetonitrile', 'methanol', 'ethanol', 'DMSO', 'DMF', 'THF', 'CH2Cl2', 'chloroform', 'toluene', 'benzene', 'acetone', 'hexane', 'cyclohexane', 'pyridine', 'CCl4'];
  D.orcaSolventsSMD = ['water', 'acetonitrile', 'methanol', 'ethanol', 'dimethylsulfoxide', 'n,n-dimethylformamide', 'tetrahydrofuran', 'dichloromethane', 'chloroform', 'toluene', 'benzene', 'acetone', 'n-hexane', 'cyclohexane', 'pyridine', 'carbontetrachloride'];

  /* ---------------- Gaussian ---------------- */
  D.gauMethods = [
    { key: 'B3LYP', kw: 'B3LYP', label: 'B3LYP (hibrida global)', type: 'dft', hybrid: true, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'PBE1PBE', kw: 'PBE1PBE', label: 'PBE0 (PBE1PBE)', type: 'dft', hybrid: true, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'CAM-B3LYP', kw: 'CAM-B3LYP', label: 'CAM-B3LYP (range-separated)', type: 'dft', hybrid: true, rs: true, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'wB97XD', kw: 'wB97XD', label: 'ωB97X-D (range-separated + disp)', type: 'dft', hybrid: true, rs: true, dispIntrinsic: true, disp: [] },
    { key: 'LC-wPBE', kw: 'LC-wPBE', label: 'LC-ωPBE (range-separated)', type: 'dft', hybrid: true, rs: true, disp: [], defDisp: null },
    { key: 'HSEH1PBE', kw: 'HSEH1PBE', label: 'HSE06 (HSEH1PBE)', type: 'dft', hybrid: true, rs: true, disp: [], defDisp: null },
    { key: 'M062X', kw: 'M062X', label: 'M06-2X', type: 'dft', hybrid: true, disp: ['gd3'], defDisp: 'gd3' },
    { key: 'TPSSh', kw: 'TPSSh', label: 'TPSSh', type: 'dft', hybrid: true, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'BP86', kw: 'BP86', label: 'BP86 (GGA murni)', type: 'dft', hybrid: false, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'PBEPBE', kw: 'PBEPBE', label: 'PBE (GGA murni)', type: 'dft', hybrid: false, disp: ['gd3bj', 'gd3'], defDisp: 'gd3bj' },
    { key: 'B97D3', kw: 'B97D3', label: 'B97D3 (GGA + D3 built-in)', type: 'dft', hybrid: false, dispIntrinsic: true, disp: [] },
    { key: 'B2PLYPD3', kw: 'B2PLYPD3', label: 'B2PLYPD3 (double hybrid)', type: 'dh', hybrid: true, dispIntrinsic: true, disp: [] },
    { key: 'HF', kw: 'HF', label: 'Hartree–Fock', type: 'hf', hybrid: true, disp: [], defDisp: null },
    { key: 'MP2', kw: 'MP2', label: 'MP2', type: 'mp2' },
    { key: 'CCSD', kw: 'CCSD', label: 'CCSD', type: 'cc' },
    { key: 'CCSD(T)', kw: 'CCSD(T)', label: 'CCSD(T)', type: 'cc' }
  ];
  D.gauBases = [
    { key: 'STO-3G', kw: 'STO-3G', fam: 'sto', diffuse: false, maxZ: 54, size: [1, 5, 9, 18] },
    { key: '6-31G(d)', kw: '6-31G(d)', fam: 'pople', diffuse: false, maxZ: 36, size: [2, 15, 19, 36] },
    { key: '6-31G(d,p)', kw: '6-31G(d,p)', fam: 'pople', diffuse: false, maxZ: 36, size: [5, 15, 19, 36] },
    { key: '6-31+G(d,p)', kw: '6-31+G(d,p)', fam: 'pople', diffuse: true, maxZ: 36, size: [5, 19, 23, 40] },
    { key: '6-311G(d,p)', kw: '6-311G(d,p)', fam: 'pople', diffuse: false, maxZ: 36, size: [6, 18, 22, 38] },
    { key: '6-311+G(d,p)', kw: '6-311+G(d,p)', fam: 'pople', diffuse: true, maxZ: 36, size: [6, 22, 26, 42] },
    { key: '6-311++G(d,p)', kw: '6-311++G(d,p)', fam: 'pople', diffuse: true, maxZ: 36, size: [7, 22, 26, 42] },
    { key: 'cc-pVDZ', kw: 'cc-pVDZ', fam: 'dunning', diffuse: false, maxZ: 36, size: [5, 14, 18, 32] },
    { key: 'cc-pVTZ', kw: 'cc-pVTZ', fam: 'dunning', diffuse: false, maxZ: 36, size: [14, 30, 34, 52] },
    { key: 'aug-cc-pVDZ', kw: 'aug-cc-pVDZ', fam: 'dunning', diffuse: true, maxZ: 36, size: [9, 23, 27, 40] },
    { key: 'aug-cc-pVTZ', kw: 'aug-cc-pVTZ', fam: 'dunning', diffuse: true, maxZ: 36, size: [23, 46, 50, 70] },
    { key: 'def2SVP', kw: 'def2SVP', fam: 'def2', diffuse: false, maxZ: 86, size: [5, 14, 18, 32] },
    { key: 'def2TZVP', kw: 'def2TZVP', fam: 'def2', diffuse: false, maxZ: 86, size: [6, 31, 37, 50] },
    { key: 'def2TZVPP', kw: 'def2TZVPP', fam: 'def2', diffuse: false, maxZ: 86, size: [14, 31, 37, 55] },
    { key: 'def2QZVP', kw: 'def2QZVP', fam: 'def2', diffuse: false, maxZ: 86, size: [30, 57, 63, 90] },
    { key: 'LANL2DZ', kw: 'LANL2DZ', fam: 'ecp', diffuse: false, maxZ: 86, size: [2, 8, 8, 18] },
    { key: 'SDD', kw: 'SDD', fam: 'ecp', diffuse: false, maxZ: 86, size: [2, 8, 8, 18] },
    { key: 'GenECP', kw: 'GenECP', fam: 'gen', diffuse: false, maxZ: 86, size: [5, 15, 19, 18] },
    { key: 'Gen', kw: 'Gen', fam: 'gen', diffuse: false, maxZ: 86, size: [5, 15, 19, 36] }
  ];
  D.gauSolvents = ['water', 'acetonitrile', 'methanol', 'ethanol', 'dimethylsulfoxide', 'n,n-dimethylformamide', 'tetrahydrofuran', 'dichloromethane', 'chloroform', 'toluene', 'benzene', 'acetone', 'cyclohexane', 'n-hexane', 'pyridine', 'diethylether'];

  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.QIDATA = D;
})(typeof window !== 'undefined' ? window : this);
