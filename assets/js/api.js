const API={base:()=>localStorage.cc_api||'http://127.0.0.1:8765',tok:()=>localStorage.cc_tok||'',
async f(p,o={}){o.headers=Object.assign({Authorization:'Bearer '+API.tok()},o.headers||{});const r=await fetch(API.base()+p,o);if(!r.ok)throw new Error(r.status+' '+await r.text());return r}};
