// Helper uji browser: melayani folder proyek lewat http lokal dan mengalihkan CDN ke node_modules lokal.
// Pakai:  const {open} = require('./pw-helper'); const {page, close, errors, url} = await open('course.html'); ...
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const NM = process.env.QC_NM || '/tmp/claude-0/-home-claude/44c5e09f-bad3-5725-bdbb-b2e4f65120d0/scratchpad/jstest/node_modules';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.xyz': 'text/plain', '.out': 'text/plain', '.log': 'text/plain', '.molden': 'text/plain' };
const CDN = [
  [/3dmol@[\d.]+\/build\/3Dmol-min\.js/, NM + '/3dmol/build/3Dmol-min.js', 'text/javascript'],
  [/@rdkit\/rdkit@[^/]+\/dist\/RDKit_minimal\.js/, NM + '/@rdkit/rdkit/dist/RDKit_minimal.js', 'text/javascript'],
  [/@rdkit\/rdkit@[^/]+\/dist\/RDKit_minimal\.wasm/, NM + '/@rdkit/rdkit/dist/RDKit_minimal.wasm', 'application/wasm'],
];
async function open(page_, opts = {}) {
  const { chromium } = require('playwright');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const u = route.request().url();
    for (const [re, f, ct] of CDN) if (re.test(u)) return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
    return route.abort();   // jaringan luar lain diblokir (tes harus mandiri)
  });
  const url = `http://127.0.0.1:${port}/${page_}`;
  if (page_) await page.goto(url, { waitUntil: 'load' });
  return { page, ctx, browser, errors, url, base: `http://127.0.0.1:${port}/`, close: async () => { await browser.close(); server.close(); } };
}
module.exports = { open, ROOT, NM };
