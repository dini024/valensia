
const R={H:.31,C:.76,N:.71,O:.66,F:.57,P:1.07,S:1.05,Cl:1.02,Br:1.2,I:1.39,B:.84,Si:1.11,Zn:1.22,Ti:1.6,Ru:1.46};
const EL=['','H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I'];
const H2EV=27.211386,CM2EV=1/8065.544;let D={};
const $=id=>document.getElementById(id);
function parse(t,name){const g=/Entering Gaussian|Gaussian, Inc/.test(t);const o={prog:g?'Gaussian':'ORCA'};
 let L=t.split(/\r?\n/);
 // geometry
 if(g){let k=-1;L.forEach((l,i)=>{if(/Standard orientation:|Input orientation:/.test(l))k=i});if(k>0){let a=[];for(let i=k+5;i<L.length&&!/----/.test(L[i]);i++){const p=L[i].trim().split(/\s+/);a.push([EL[+p[1]]||'X',+p[3],+p[4],+p[5]])}o.geom=a}}
 else{let k=L.map((l,i)=>/CARTESIAN COORDINATES \(ANGSTROEM\)/.test(l)?i:-1).filter(i=>i>=0).pop();if(k>=0){let a=[];for(let i=k+2;i<L.length&&L[i].trim();i++){const p=L[i].trim().split(/\s+/);a.push([p[0],+p[1],+p[2],+p[3]])}o.geom=a}}
 // freq
 let fr=[];if(g){L.forEach(l=>{if(/Frequencies --/.test(l))fr.push(...l.split('--')[1].trim().split(/\s+/).map(Number))})}
 else{let k=t.lastIndexOf('VIBRATIONAL FREQUENCIES');if(k>=0)t.slice(k).split('\n').forEach(l=>{const m=l.match(/^\s*\d+:\s+(-?[\d.]+)\s+cm/);if(m&&+m[1]!=0)fr.push(+m[1])})}
 if(fr.length)o.freq=fr;
 // orbitals
 let oc=[],vi=[];
 if(g){const k=t.lastIndexOf('The electronic state is');if(k>=0)t.slice(k).split('\n').forEach(l=>{const n=(l.match(/-?\d+\.\d{5}/g)||[]).map(Number).map(x=>x*H2EV);if(/Alpha  occ/.test(l))oc.push(...n);else if(/Alpha virt/.test(l))vi.push(...n)})}
 else{const k=t.lastIndexOf('ORBITAL ENERGIES');if(k>=0){let st=false;for(const l of t.slice(k).split('\n')){const m=l.match(/^\s*\d+\s+([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);if(m){st=true;(+m[1]>0?oc:vi).push(+m[3])}else if(st)break}}}
 if(oc.length&&vi.length){o.oc=oc;o.vi=vi}
 // TDDFT
 let ex=[];
 if(g){let cur=null;L.forEach(l=>{let m=l.match(/Excited State\s+(\d+):\s+(\S+)\s+(-?[\d.]+) eV\s+([\d.]+) nm\s+f=([\d.]+)/);if(m){cur={n:+m[1],sym:m[2],E:+m[3],nm:+m[4],f:+m[5],tr:[]};ex.push(cur)}else if(cur&&(m=l.match(/^\s+(\d+)\s+->\s*(\d+)\s+(-?[\d.]+)/))&&cur.tr.length<3)cur.tr.push(m[1]+'→'+m[2]+' ('+m[3]+')')})}
 else{const k=t.lastIndexOf('ABSORPTION SPECTRUM VIA TRANSITION ELECTRIC DIPOLE MOMENTS');if(k>=0){let n=0;t.slice(k).split('\n').forEach(l=>{const m=l.match(/->\s*\d+-\S+\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/);if(m)ex.push({n:++n,sym:'',E:+m[1]*CM2EV,nm:+m[2],f:+m[3],tr:[]})});
  const tdk=t.lastIndexOf('TD-DFT/TDA EXCITED STATES')>=0?t.lastIndexOf('TD-DFT/TDA EXCITED STATES'):t.lastIndexOf('TD-DFT EXCITED STATES');
  if(tdk>=0){let cs=0;t.slice(tdk).split('\n').forEach(l=>{let m=l.match(/^STATE\s+(\d+):/);if(m)cs=+m[1];else if(cs&&(m=l.match(/^\s+(\d+[ab]\s+->\s+\d+[ab])\s+:\s+(-?[\d.]+)/))){const e=ex[cs-1];if(e&&e.tr.length<3)e.tr.push(m[1].replace(/\s+/g,'')+' ('+m[2]+')')}})}}}
 if(ex.length)o.ex=ex;
 // docking
 const dk=L.filter(l=>/^\s*\d+\s+-?\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+\s*$/.test(l));if(/ORCA DOCKER|DOCKER/i.test(t)&&dk.length)o.dock=dk.map(l=>l.trim().split(/\s+/));
 return o}
function dist(a,b){return Math.hypot(a[1]-b[1],a[2]-b[2],a[3]-b[3])}
function sub(a,b){return [a[1]-b[1],a[2]-b[2],a[3]-b[3]]}
const dot=(u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2],cr=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],nr=u=>Math.sqrt(dot(u,u));
function geomTab(G){const n=G.length,bd=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(dist(G[i],G[j])<1.25*((R[G[i][0]]||1)+(R[G[j][0]]||1)))bd.push([i,j]);
 const nb=G.map(_=>[]);bd.forEach(([i,j])=>{nb[i].push(j);nb[j].push(i)});let h='<h3>Bond length (Å)</h3><table><tr><th>Ikatan</th><th>Å</th></tr>';
 bd.filter(([i,j])=>!(G[i][0]=='H'&&G[j][0]=='H')).slice(0,150).forEach(([i,j])=>h+=`<tr><td>${G[i][0]}${i+1}–${G[j][0]}${j+1}</td><td>${dist(G[i],G[j]).toFixed(4)}</td></tr>`);h+='</table><h3>Bond angle (°)</h3><table><tr><th>Sudut</th><th>°</th></tr>';let c=0;
 for(let j=0;j<n;j++)for(let a=0;a<nb[j].length;a++)for(let b=a+1;b<nb[j].length;b++){const i=nb[j][a],k=nb[j][b];if(G[i][0]=='H'&&G[k][0]=='H'||c++>150)continue;const u=sub(G[i],G[j]),v=sub(G[k],G[j]);h+=`<tr><td>${G[i][0]}${i+1}–${G[j][0]}${j+1}–${G[k][0]}${k+1}</td><td>${(Math.acos(dot(u,v)/nr(u)/nr(v))*180/Math.PI).toFixed(2)}</td></tr>`}
 h+='</table><h3>Dihedral (°), atom berat</h3><table><tr><th>Dihedral</th><th>°</th></tr>';c=0;
 bd.forEach(([j,k])=>{if(G[j][0]=='H'||G[k][0]=='H')return;nb[j].forEach(i=>nb[k].forEach(l=>{if(i==k||l==j||i==l||G[i][0]=='H'||G[l][0]=='H'||c++>150)return;const b1=sub(G[j],G[i]),b2=sub(G[k],G[j]),b3=sub(G[l],G[k]),n1=cr(b1,b2),n2=cr(b2,b3);const x=dot(n1,n2),y=dot(cr(n1,n2),b2)/nr(b2);h+=`<tr><td>${G[i][0]}${i+1}-${G[j][0]}${j+1}-${G[k][0]}${k+1}-${G[l][0]}${l+1}</td><td>${(Math.atan2(y,x)*180/Math.PI).toFixed(2)}</td></tr>`}))});
 const hv=G.filter(a=>a[0]!='H'),m=[0,1,2].map(d=>hv.reduce((s,a)=>s+a[d+1],0)/hv.length),C=[[0,0,0],[0,0,0],[0,0,0]];hv.forEach(a=>{const d=[a[1]-m[0],a[2]-m[1],a[3]-m[2]];for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]+=d[i]*d[j]});
 const q=(C[0][0]+C[1][1]+C[2][2])/3,B=C.map((r,i)=>r.map((v,j)=>v-(i==j?q:0))),p=Math.sqrt(B.flat().reduce((s,v)=>s+v*v,0)/6)||1e-9,Bn=B.map(r=>r.map(v=>v/p)),det=Bn[0][0]*(Bn[1][1]*Bn[2][2]-Bn[1][2]*Bn[2][1])-Bn[0][1]*(Bn[1][0]*Bn[2][2]-Bn[1][2]*Bn[2][0])+Bn[0][2]*(Bn[1][0]*Bn[2][1]-Bn[1][1]*Bn[2][0]),ph=Math.acos(Math.max(-1,Math.min(1,det/2)))/3,lmin=q+2*p*Math.cos(ph+2*Math.PI/3);
 h+=`</table><p><b>Planaritas</b> (RMSD atom berat ke bidang terbaik): <b>${Math.sqrt(Math.max(lmin,0)/hv.length).toFixed(4)} Å</b> (&lt;0.05 Å ≈ planar)</p>`;return h}
function plot(id,w,h,draw){const c=$(id),g=c.getContext('2d');g.clearRect(0,0,w,h);draw(g)}
function show(){let h='';const o=Object.assign({},...Object.values(D));const all=Object.values(D);const pick=k=>all.find(x=>x[k])?.[k];
 const G=pick('geom'),F=pick('freq'),oc=pick('oc'),vi=pick('vi'),EX=pick('ex'),DK=pick('dock');
 if(G){h+='<div class="card"><h2>Geometri teroptimasi</h2><div class="v" id="v3"></div></div>'}
 if(F){const im=F.filter(x=>x<0);h+=`<div class="card"><h2>Frekuensi</h2><p>${F.length} mode; frekuensi imajiner: <span class="${im.length?'bad':'ok'}">${im.length?im.length+' ('+im.map(x=>x.toFixed(1)).join(', ')+' cm⁻¹) – bukan minimum!':'0 – minimum sejati'}</span></p><canvas id="cf" width="700" height="180"></canvas></div>`}
 if(G)h+='<div class="card"><h2>Properti molekul</h2>'+geomTab(G)+'</div>';
 if(oc){const hm=oc[oc.length-1],lm=vi[0],IP=-hm,EA=-lm,eta=(IP-EA)/2,mu=-(IP+EA)/2,om=mu*mu/(2*eta);
  h+=`<div class="card"><h2>HOMO–LUMO</h2><canvas id="ce" width="400" height="300"></canvas><p>Gap = <b>${(lm-hm).toFixed(3)} eV</b></p><p><i>Visualisasi orbital 3D (molden/cube) belum termasuk di versi ini.</i></p>
  <h3>Parameter elektrokimia/reaktivitas (Koopmans)</h3><table><tr><th>Parameter</th><th>Nilai</th></tr><tr><td>E_HOMO / E_LUMO (eV)</td><td>${hm.toFixed(3)} / ${lm.toFixed(3)}</td></tr><tr><td>IP ≈ –E_HOMO (eV)</td><td>${IP.toFixed(3)}</td></tr><tr><td>EA ≈ –E_LUMO (eV)</td><td>${EA.toFixed(3)}</td></tr><tr><td>Hardness η=(IP–EA)/2 (eV)</td><td>${eta.toFixed(3)}</td></tr><tr><td>Softness S=1/η (eV⁻¹)</td><td>${(1/eta).toFixed(3)}</td></tr><tr><td>Potensial kimia μ=–(IP+EA)/2 (eV)</td><td>${mu.toFixed(3)}</td></tr><tr><td>Elektronegativitas χ=–μ (eV)</td><td>${(-mu).toFixed(3)}</td></tr><tr><td>Elektrofilisitas ω=μ²/2η (eV)</td><td>${om.toFixed(3)}</td></tr></table></div>`}
 if(EX){h+=`<div class="card"><h2>Spektrum absorpsi TD-DFT</h2><canvas id="cs" width="700" height="280"></canvas><table><tr><th>State</th><th>λ (nm)</th><th>E (eV)</th><th>f</th><th>ε<sub>maks</sub> (M⁻¹cm⁻¹)</th><th>Transisi (koef.)</th></tr>`;
  const s=+$('sg').value*8065.544;EX.forEach(e=>{const eps=1.3062974e8*e.f/s;h+=`<tr><td>${e.n} ${e.sym}</td><td>${e.nm.toFixed(1)}</td><td>${e.E.toFixed(3)}</td><td>${e.f.toFixed(4)}</td><td>${eps.toExponential(2)}</td><td>${e.tr.join('; ')}</td></tr>`});
  const mx=EX.reduce((a,b)=>b.f>a.f?b:a);h+=`</table><p>λ<sub>maks</sub> (f terbesar) = <b>${mx.nm.toFixed(1)} nm</b></p></div>`}
 if(DK)h+='<div class="card"><h2>Hasil ORCA Docker</h2><table><tr>'+['No','Energi','RMSD','Lainnya'].map(x=>'<th>'+x+'</th>').join('')+'</tr>'+DK.slice(0,50).map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</table><p><i>Parser docker bersifat heuristik; cek format output Anda.</i></p></div>';
 $('res').innerHTML=h||'<p>Tidak ada data yang dikenali.</p>';
 if(G){const v=$3Dmol.createViewer($('v3'),{backgroundColor:'white'});v.addModel(G.length+'\n\n'+G.map(a=>a.join(' ')).join('\n'),'xyz');v.setStyle({},{stick:{radius:.15},sphere:{scale:.25}});v.zoomTo();v.render()}
 if(F)plot('cf',700,180,g=>{const mn=Math.min(...F,0),mxv=Math.max(...F),X=x=>30+(x-mn)/(mxv-mn)*650;g.strokeStyle='#888';g.beginPath();g.moveTo(30,150);g.lineTo(690,150);g.stroke();F.forEach(x=>{g.strokeStyle=x<0?'#d33':'#1a6fd4';g.beginPath();g.moveTo(X(x),150);g.lineTo(X(x),60);g.stroke()});g.fillStyle='#888';g.fillText(mn.toFixed(0)+' cm⁻¹',20,170);g.fillText(mxv.toFixed(0),650,170)});
 if(oc)plot('ce',400,300,g=>{const L=[...oc.slice(-4).map((e,i,a)=>[e,i==a.length-1?'HOMO':'HOMO-'+(a.length-1-i)]),...vi.slice(0,4).map((e,i)=>[e,i?'LUMO+'+i:'LUMO'])],lo=L[0][0]-1,hi=L[L.length-1][0]+1,Y=e=>270-(e-lo)/(hi-lo)*250;L.forEach(([e,n])=>{g.strokeStyle=n=='HOMO'?'#d33':n=='LUMO'?'#1a6fd4':'#888';g.lineWidth=n=='HOMO'||n=='LUMO'?3:1.5;g.beginPath();g.moveTo(100,Y(e));g.lineTo(250,Y(e));g.stroke();g.fillStyle='#888';g.fillText(n+'  '+e.toFixed(2),260,Y(e)+4)});g.strokeStyle='#1a9a4a';g.lineWidth=1;g.beginPath();g.moveTo(60,Y(oc[oc.length-1]));g.lineTo(60,Y(vi[0]));g.stroke();g.fillStyle='#1a9a4a';g.fillText('Gap',10,(Y(oc[oc.length-1])+Y(vi[0]))/2)});
 if(EX)plot('cs',700,280,g=>{const s=+$('sg').value*8065.544,lo=200,hi=800,pts=[];let mx=0;for(let l=lo;l<=hi;l+=2){const v=1e7/l;let e=0;EX.forEach(x=>e+=1.3062974e8*x.f/s*Math.exp(-(((v-1e7/x.nm)/s)**2)));pts.push([l,e]);mx=Math.max(mx,e)}
  const X=l=>40+(l-lo)/(hi-lo)*640,Y=e=>250-e/mx*220;g.strokeStyle='#888';g.beginPath();g.moveTo(40,10);g.lineTo(40,250);g.lineTo(690,250);g.stroke();g.fillStyle='#888';g.fillText('λ (nm)',350,275);for(let l=200;l<=800;l+=100)g.fillText(l,X(l)-8,265);
  EX.forEach(x=>{if(x.nm>=lo&&x.nm<=hi){g.strokeStyle='#d33';g.beginPath();g.moveTo(X(x.nm),250);g.lineTo(X(x.nm),250-x.f/Math.max(...EX.map(y=>y.f))*100);g.stroke()}});g.strokeStyle='#1a6fd4';g.lineWidth=2;g.beginPath();pts.forEach(([l,e],i)=>i?g.lineTo(X(l),Y(e)):g.moveTo(X(l),Y(e)));g.stroke();g.fillStyle='#888';g.fillText('ε (M⁻¹cm⁻¹), maks = '+mx.toExponential(2),60,20)})}
if($('f'))$('f').onchange=async e=>{D={};for(const f of e.target.files)D[f.name]=parse(await f.text(),f.name);show()};if($('sg'))$('sg').oninput=()=>show();
