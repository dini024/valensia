import numpy as np, json
from pyscf import gto, dft, tddft, hessian
from pyscf.geomopt.geometric_solver import optimize
from pyscf.tools import molden, cubegen
from pyscf.hessian import thermo
A2B=1.8897261246
xyz="""C 0.0 0.0 0.0
C 1.34 0.0 0.0
C 2.05 1.17 0.0
O 3.25 1.25 0.0
H -0.55 0.93 0.0
H -0.55 -0.93 0.0
H 1.9 -0.93 0.0
H 1.5 2.15 0.0"""
mol=gto.M(atom=xyz,basis='def2-svp',verbose=0)
mf=dft.RKS(mol); mf.xc='b3lyp'
trace=[]
def cb(env):
    g=env['g_scanner'] if 'g_scanner' in env else None
    m=env['mol']; trace.append((m.atom_coords(unit='Angstrom').copy(), env.get('energy')))
mol_eq=optimize(mf,maxsteps=60,callback=cb)
mf=dft.RKS(mol_eq); mf.xc='b3lyp'; mf.conv_tol=1e-10; mf.kernel()
e0=mf.e_tot
print('E',e0,'steps',len(trace))
h=mf.Hessian().kernel()
fr=thermo.harmonic_analysis(mol_eq,h)
th=thermo.thermo(mf,fr['freq_au'],298.15,101325)
# IR intensities via dipole derivative: finite difference
def dip(m):
    mm=dft.RKS(m); mm.xc='b3lyp'; mm.conv_tol=1e-9; mm.kernel(); return mm.dip_moment(unit='AU',verbose=0)
coords=mol_eq.atom_coords(); dd=np.zeros((3*mol_eq.natm,3)); d=0.005
for i in range(mol_eq.natm):
  for k in range(3):
    cp=coords.copy(); cp[i,k]+=d; cm=coords.copy(); cm[i,k]-=d
    mp=mol_eq.set_geom_(cp,unit='Bohr',inplace=False); mm_=mol_eq.set_geom_(cm,unit='Bohr',inplace=False)
    dd[3*i+k]=(dip(mp)-dip(mm_))/(2*d)
modes=fr['norm_mode'] # nmode,natm,3
ints=[]
for m in modes:
  dmu=(m.reshape(-1)[:,None]*dd).sum(0); ints.append(float(dmu@dmu)*974.8801)  # au->km/mol approx (dmu in e/ sqrt(amu)... )
# norm_mode normalized in cartesian mass-weighted? convert: use amu-> ok approx
print('freq',fr['freq_wavenumber'])
td=tddft.TDDFT(mf); td.nstates=10; td.kernel()
f=td.oscillator_strength()
mo_occ=mf.mo_occ; nocc=int((mo_occ>0).sum())
states=[]
for i,(e,xy) in enumerate(zip(td.e,td.xy)):
    x=xy[0]; tr=[]
    idx=np.argsort(-np.abs(x.ravel()))[:5]
    for ix in idx:
        o,v=divmod(ix,x.shape[1]); w=2*x[o,v]**2
        if w>0.02: tr.append([int(o),int(v+nocc),float(w),float(x[o,v]*np.sqrt(2))])
    states.append(dict(n=i+1,eh=float(e),ev=float(e*27.211386),nm=float(1239.84198/(e*27.211386)),f=float(f[i]),tr=tr))
mull=mf.mulliken_pop(verbose=0)[1]
dipv=mf.dip_moment(unit='Debye',verbose=0)
molden.from_scf(mf,'demo.molden')
# cubes
mf_c=mf
cubegen.orbital(mol_eq,'demo_homo.cube',mf.mo_coeff[:,nocc-1],nx=50,ny=50,nz=50)
cubegen.orbital(mol_eq,'demo_lumo.cube',mf.mo_coeff[:,nocc],nx=50,ny=50,nz=50)
json.dump(dict(trace=[(c.tolist(),e) for c,e in trace],atoms=[mol_eq.atom_symbol(i) for i in range(mol_eq.natm)],coords=mol_eq.atom_coords(unit='Angstrom').tolist(),e0=e0,
 freq=fr['freq_wavenumber'].tolist(),ints=ints,thermo={k:[float(v[0])] if hasattr(v,'__len__') else v for k,v in th.items() if k in('ZPE','E_tot','H_tot','G_tot','S_tot')},
 moe=mf.mo_energy.tolist(),occ=mf.mo_occ.tolist(),states=states,mull=mull.tolist(),dip=dipv.tolist(),nocc=nocc,nelec=int(mol_eq.nelectron)),open('demo_data.json','w'))
