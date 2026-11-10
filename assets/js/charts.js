/* Minimal SVG charting for ChemLab. All colors via CSS variables so charts follow the theme. */
(function(){
const NS="http://www.w3.org/2000/svg";
const PAL=["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)"];
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function nice(lo,hi,n=6){if(hi===lo){hi=lo+1}const span=hi-lo,raw=span/n,mag=Math.pow(10,Math.floor(Math.log10(raw)));const f=raw/mag;const st=(f<1.5?1:f<3?2:f<7?5:10)*mag;const a=Math.floor(lo/st)*st,b=Math.ceil(hi/st)*st;const t=[];for(let v=a;v<=b+st/2;v+=st)t.push(+v.toPrecision(12));return{lo:a,hi:b,ticks:t,step:st}}
function fmt(v){const a=Math.abs(v);if(a!==0&&(a<1e-3||a>=1e5))return v.toExponential(1);return +v.toPrecision(6)+''}
/* opts: {title,xlabel,ylabel,series:[{name,x:[],y:[],color,dash,fill,points,width}],sticks:[{x,y,color}],xlim,ylim,w,h,legend,vlines:[{x,label}],hlines,annot:[{x,y,text}],invertX} */
function plot(el,o){
 const W=o.w||720,H=o.h||380,m={l:62,r:16,t:o.title?34:14,b:50};const iw=W-m.l-m.r,ih=H-m.t-m.b;
 let xs=[],ys=[];(o.series||[]).forEach(s=>{xs.push(...s.x);ys.push(...s.y)});(o.sticks||[]).forEach(s=>{xs.push(s.x);ys.push(s.y,0)});
 if(!xs.length){el.innerHTML='<div class="small muted" style="padding:20px">Tidak ada data</div>';return}
 let xl=o.xlim||[Math.min(...xs),Math.max(...xs)],yl=o.ylim||[Math.min(0,...ys),Math.max(...ys)];
 const nx=o.xlim?{lo:xl[0],hi:xl[1],ticks:nice(xl[0],xl[1]).ticks.filter(t=>t>=xl[0]&&t<=xl[1])}:nice(xl[0],xl[1]);const ny=o.ylim?{lo:yl[0],hi:yl[1],ticks:nice(yl[0],yl[1]).ticks.filter(t=>t>=yl[0]&&t<=yl[1])}:nice(yl[0],yl[1]+(yl[1]-yl[0])*.04);
 const X=v=>m.l+(o.invertX?(nx.hi-v):(v-nx.lo))/(nx.hi-nx.lo)*iw,Y=v=>m.t+ih-(v-ny.lo)/(ny.hi-ny.lo)*ih;
 let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title||'chart')}">`;
 if(o.title)s+=`<text class="ttl" x="${m.l}" y="20">${esc(o.title)}</text>`;
 nx.ticks.forEach(t=>{const x=X(t);s+=`<line class="grid" x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t+ih}"/><text x="${x}" y="${m.t+ih+16}" text-anchor="middle">${fmt(t)}</text>`});
 ny.ticks.forEach(t=>{const y=Y(t);s+=`<line class="grid" y1="${y}" y2="${y}" x1="${m.l}" x2="${m.l+iw}"/><text x="${m.l-6}" y="${y+4}" text-anchor="end">${fmt(t)}</text>`});
 s+=`<line class="axis" x1="${m.l}" x2="${m.l+iw}" y1="${m.t+ih}" y2="${m.t+ih}"/><line class="axis" x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t+ih}"/>`;
 if(o.xlabel)s+=`<text x="${m.l+iw/2}" y="${H-8}" text-anchor="middle">${esc(o.xlabel)}</text>`;
 if(o.ylabel)s+=`<text transform="translate(14 ${m.t+ih/2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`;
 (o.hlines||[]).forEach(h=>{s+=`<line x1="${m.l}" x2="${m.l+iw}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="${h.color||'var(--muted)'}" stroke-dasharray="5 4"/>${h.label?`<text x="${m.l+iw-4}" y="${Y(h.y)-4}" text-anchor="end">${esc(h.label)}</text>`:''}`});
 (o.vlines||[]).forEach(h=>{s+=`<line y1="${m.t}" y2="${m.t+ih}" x1="${X(h.x)}" x2="${X(h.x)}" stroke="${h.color||'var(--muted)'}" stroke-dasharray="5 4"/>${h.label?`<text x="${X(h.x)+4}" y="${m.t+12}">${esc(h.label)}</text>`:''}`});
 (o.sticks||[]).forEach(k=>{s+=`<line x1="${X(k.x)}" x2="${X(k.x)}" y1="${Y(0)}" y2="${Y(k.y)}" stroke="${k.color||'var(--c2)'}" stroke-width="${k.width||1.6}"/>`});
 (o.series||[]).forEach((se,i)=>{const col=se.color||PAL[i%PAL.length];const pts=se.x.map((x,j)=>X(x).toFixed(1)+','+Y(se.y[j]).toFixed(1));
   if(se.fill&&pts.length>1)s+=`<polygon points="${X(se.x[0])},${Y(0)} ${pts.join(' ')} ${X(se.x[se.x.length-1])},${Y(0)}" fill="${col}" opacity=".15"/>`;
   if(!se.noline)s+=`<polyline fill="none" stroke="${col}" stroke-width="${se.width||2}" ${se.dash?`stroke-dasharray="${se.dash}"`:''} stroke-linejoin="round" points="${pts.join(' ')}"/>`;
   if(se.points)se.x.forEach((x,j)=>{s+=`<circle cx="${X(x)}" cy="${Y(se.y[j])}" r="${se.r||3.5}" fill="${col}"><title>${fmt(x)}, ${fmt(se.y[j])}</title></circle>`})});
 (o.annot||[]).forEach(a=>{s+=`<text x="${X(a.x)}" y="${Y(a.y)-6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${esc(a.text)}</text>`});
 if(o.legend!==false&&(o.series||[]).filter(s=>s.name).length>1||o.legend){let lx=m.l+10,ly=m.t+8;(o.series||[]).forEach((se,i)=>{if(!se.name)return;s+=`<rect x="${lx}" y="${ly-8}" width="12" height="3" fill="${se.color||PAL[i%PAL.length]}"/><text x="${lx+17}" y="${ly-3}">${esc(se.name)}</text>`;ly+=15})}
 s+='</svg>';el.classList.add('chart');el.innerHTML=s;
}
/* energy level diagram: levels [{e,label,occ,color}] , gap annotation */
function levels(el,o){
 const W=o.w||520,H=o.h||420,m={l:70,r:20,t:30,b:20};const ih=H-m.t-m.b;
 const E=o.levels.map(l=>l.e);const lo=Math.min(...E)-.5,hi=Math.max(...E)+.5;const Y=v=>m.t+ih-(v-lo)/(hi-lo)*ih;
 let s=`<svg viewBox="0 0 ${W} ${H}"><text class="ttl" x="${m.l}" y="18">${o.title||'Diagram tingkat energi (eV)'}</text><line class="axis" x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t+ih}"/>`;
 const t=nice(lo,hi,6);t.ticks.forEach(v=>{if(v<lo||v>hi)return;s+=`<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l-6}" y="${Y(v)+4}" text-anchor="end">${fmt(v)}</text>`});
 const cx=m.l+(W-m.l-m.r)/2,lw=130;
 o.levels.forEach((l,i)=>{const col=l.color||(l.occ?'var(--c1)':'var(--c2)');const y=Y(l.e);s+=`<line x1="${cx-lw/2}" x2="${cx+lw/2}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="${l.bold?4:2}"/><text x="${cx+lw/2+8}" y="${y+4}" style="${l.bold?'fill:var(--ink);font-weight:700':''}">${esc(l.label)} ${l.e.toFixed(2)}</text>`});
 if(o.gap){const y1=Y(o.gap.top),y2=Y(o.gap.bottom);s+=`<line x1="${cx-lw/2-14}" x2="${cx-lw/2-14}" y1="${y1}" y2="${y2}" stroke="var(--ink)" marker-start="url(#a)"/><line x1="${cx-lw/2-18}" x2="${cx-lw/2-10}" y1="${y1}" y2="${y1}" stroke="var(--ink)"/><line x1="${cx-lw/2-18}" x2="${cx-lw/2-10}" y1="${y2}" y2="${y2}" stroke="var(--ink)"/><text x="${cx-lw/2-20}" y="${(y1+y2)/2+4}" text-anchor="end" style="fill:var(--accent);font-weight:700">${o.gap.label}</text>`}
 s+='</svg>';el.classList.add('chart');el.innerHTML=s}
/* gaussian broadening of stick spectrum */
function broaden(lines,xmin,xmax,n,fwhm,unit){const sig=fwhm/2.3548;const x=[],y=[];for(let i=0;i<n;i++){const xv=xmin+(xmax-xmin)*i/(n-1);let sum=0;lines.forEach(l=>{const d=xv-l.x;sum+=l.y*Math.exp(-d*d/(2*sig*sig))});x.push(xv);y.push(sum)}return{x,y}}
window.Charts={plot,levels,broaden,nice,PAL};
})();
