/* ORCA Docker Workbench — logic. Depends on QC (common.js). */
(function () {
  'use strict';
  QC.nav('orca-docker.html');
  QC.tabs('wb');
  const $ = id => document.getElementById(id);

  /* ---------------- config ---------------- */
  const CFG_KEY = 'dockerCfg';
  const saved = QC.store.get(CFG_KEY, null);
  const cfg = Object.assign({ url: 'http://127.0.0.1:8000', key: '', backend: 'local_docker', image: '', demo: true }, saved || {});
  function cfgToUi() { $('cUrl').value = cfg.url; $('cKey').value = cfg.key; $('cBackend').value = cfg.backend; $('cImage').value = cfg.image; $('cDemo').checked = cfg.demo; modeUi(); }
  function uiToCfg() { cfg.url = $('cUrl').value.trim().replace(/\/+$/, ''); cfg.key = $('cKey').value; cfg.backend = $('cBackend').value; cfg.image = $('cImage').value.trim(); cfg.demo = $('cDemo').checked; }
  function modeUi() {
    $('modePill').textContent = cfg.demo ? 'Mode DEMO (simulasi)' : 'Backend: ' + (cfg.url || '—');
    $('modePill').className = 'pill ' + (cfg.demo ? 'warn' : 'ok');
    $('demoNote').style.display = cfg.demo ? '' : 'none';
  }

  /* ---------------- demo backend (simulasi di browser) ---------------- */
  const DEMO_OUT = `
                                 *****************
                                 * O   R   C   A *
                                 *****************
   *** SIMULASI — keluaran contoh untuk uji UI, BUKAN hasil perhitungan nyata ***

INPUT FILE
================================================================================
NAME = job.inp
|  1> ! B3LYP def2-SVP Opt Freq
|  2> * xyz 0 1
|  3> O   0.000000   0.000000   0.117790
|  4> H   0.000000   0.755453  -0.471160
|  5> H   0.000000  -0.755453  -0.471160
|  6> *
================================================================================

------------------------------------------------------------------------------
                               SCF ITERATIONS
------------------------------------------------------------------------------
ITER       Energy         Delta-E        Max-DP      RMS-DP      [F,P]     Damp
  0    -75.8512345678   0.000000000000  0.12345678  0.01234567  0.2345678 0.7000
  1    -76.2587654321  -0.407530864300  0.03456789  0.00456789  0.0876543 0.7000
  2    -76.3012345678  -0.042469135700  0.00987654  0.00123456  0.0234567 0.7000
  3    -76.3145678901  -0.013333322300  0.00123456  0.00012345  0.0034567 0.0000
  4    -76.3149876543  -0.000419764200  0.00023456  0.00002345  0.0006789 0.0000
  5    -76.3150012345  -0.000013580200  0.00001234  0.00000123  0.0000345 0.0000
  6    -76.3150019876  -0.000000753100  0.00000098  0.00000009  0.0000023 0.0000

               *****************************************************
               *                     SUCCESS                       *
               *           SCF CONVERGED AFTER   7 CYCLES          *
               *****************************************************

----------------
ORBITAL ENERGIES
----------------

  NO   OCC          E(Eh)            E(eV) 
   0   2.0000     -19.137864    -520.7584 
   1   2.0000      -0.995402     -27.0861 
   2   2.0000      -0.517218     -14.0741 
   3   2.0000      -0.376551     -10.2466 
   4   2.0000      -0.298127      -8.1127 
   5   0.0000       0.047321       1.2877 
   6   0.0000       0.131045       3.5659 
   7   0.0000       0.612890      16.6778 

                    *****************************
                    *** OPTIMIZATION RUN DONE ***
                    *****************************
          ***********************HURRAY********************
          ***        THE OPTIMIZATION HAS CONVERGED     ***
          *************************************************

FINAL SINGLE POINT ENERGY       -76.315001987600

-----------------------
VIBRATIONAL FREQUENCIES
-----------------------

Scaling factor for frequencies =  1.000000000  (already applied!)

     0:         0.00 cm**-1
     1:         0.00 cm**-1
     2:         0.00 cm**-1
     3:         0.00 cm**-1
     4:         0.00 cm**-1
     5:         0.00 cm**-1
     6:      1612.43 cm**-1
     7:      3701.18 cm**-1
     8:      3810.92 cm**-1

------------
THERMOCHEMISTRY AT 298.15K
------------
Final Gibbs free energy         ...    -76.29631452 Eh

                             ****ORCA TERMINATED NORMALLY****
TOTAL RUN TIME: 0 days 0 hours 0 minutes 18 seconds 250 msec
`.replace(/^\n/, '');
  const Demo = {
    jobs: [], seq: 0, DUR: 16,
    create(b) {
      const id = '2026' + String(++this.seq).padStart(4, '0') + '-DEMO';
      this.jobs.unshift({ id, name: b.name, backend: b.backend, created: Date.now() / 1000, t0: Date.now(), nprocs: b.nprocs, input_name: b.input_name, input_text: b.input_text, cancelled: false, deleted: false });
      return { id, status: 'queued' };
    },
    st(j) {
      if (j.cancelled) return 'cancelled';
      const e = (Date.now() - j.t0) / 1000;
      return e < 1.5 ? 'queued' : e < 1.5 + this.DUR ? 'running' : 'done';
    },
    prog(j) { return Math.max(0, Math.min(1, ((Date.now() - j.t0) / 1000 - 1.5) / this.DUR)); },
    pub(j) {
      const st = this.st(j), files = [{ name: j.input_name, size: j.input_text.length }];
      if (st !== 'queued') files.push({ name: j.input_name.replace(/\.inp$/, '.out'), size: this.out(j).length });
      if (st === 'done') files.push({ name: 'DEMO-README.txt', size: 60 });
      return { id: j.id, name: j.name, backend: j.backend, status: st, created: j.created, started: j.created + 1.5, finished: st === 'done' ? j.created + 1.5 + this.DUR : null, nprocs: j.nprocs, files, message: 'DEMO (simulasi)', input_name: j.input_name };
    },
    out(j) { const L = DEMO_OUT.split('\n'); return L.slice(0, Math.floor(L.length * this.prog(j))).join('\n'); },
  };
  function demoHandle(method, path, body) {
    let m;
    if (path === '/api/health') return { json: { status: 'ok', version: 'demo', rdkit: false, adapters: { local_docker: { available: true, detail: 'DEMO — simulasi di browser' }, slurm_brin: { available: false, detail: 'tidak ada di mode demo' } } } };
    if (path === '/api/jobs' && method === 'POST') return { json: Demo.create(body) };
    if (path === '/api/jobs') return { json: Demo.jobs.filter(j => !j.deleted).map(j => Demo.pub(j)) };
    if ((m = path.match(/^\/api\/jobs\/([^/]+)(?:\/(log|cancel|files\/(.+)))?(\?.*)?$/))) {
      const j = Demo.jobs.find(x => x.id === m[1] && !x.deleted); if (!j) throw new Error('404 job tidak ditemukan');
      if (!m[2]) { if (method === 'DELETE') { j.deleted = true; return { json: { deleted: j.id } }; } return { json: Demo.pub(j) }; }
      if (m[2] === 'cancel') { if (Demo.st(j) !== 'done') j.cancelled = true; return { json: Demo.pub(j) }; }
      if (m[2] === 'log') { const n = +((m[4] || '').match(/tail=(\d+)/) || [0, 300])[1]; return { text: Demo.out(j).split('\n').slice(-n).join('\n'), status: Demo.st(j) }; }
      const fn = decodeURIComponent(m[3]);
      if (fn === j.input_name) return { text: j.input_text };
      if (fn.endsWith('.out')) return { text: Demo.out(j) };
      return { text: 'Berkas contoh pada mode DEMO.\n' };
    }
    throw new Error('404 endpoint demo tidak ada: ' + path);
  }

  /* ---------------- API wrapper ---------------- */
  async function api(method, path, body, expect) {
    expect = expect || 'json';
    if (cfg.demo) {
      const r = demoHandle(method, path, body);
      return expect === 'json' ? r.json : expect === 'blob' ? new Blob([r.text]) : { text: r.text, status: r.status };
    }
    const headers = {}; if (cfg.key) headers['X-API-Key'] = cfg.key; if (body) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(cfg.url + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) {
      let hint = 'Tidak dapat terhubung ke ' + cfg.url + '. Cek: backend berjalan? CORS_ORIGINS mengizinkan origin ini? ';
      if (location.protocol === 'https:' && /^http:\/\/(?!localhost|127\.0\.0\.1)/.test(cfg.url)) hint += 'Halaman HTTPS tidak boleh memanggil HTTP (mixed content) — pakai HTTPS. ';
      if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(cfg.url) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent)) hint += 'Safari memblokir http://localhost dari halaman HTTPS — pakai Chrome/Firefox. ';
      throw new Error(hint);
    }
    if (!res.ok) {
      let d = ''; try { const j = await res.json(); d = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch (e) { }
      throw new Error(res.status + (res.status === 401 ? ' API key salah' : '') + (d ? ': ' + d : ''));
    }
    if (expect === 'json') return res.json();
    if (expect === 'blob') return res.blob();
    return { text: await res.text(), status: res.headers.get('X-Job-Status') };
  }

  /* ---------------- 1. connection ---------------- */
  $('btnSave').onclick = () => { uiToCfg(); QC.store.set(CFG_KEY, cfg); modeUi(); QC.toast('Konfigurasi disimpan'); };
  $('cDemo').onchange = () => { uiToCfg(); modeUi(); };
  $('btnTest').onclick = async () => {
    uiToCfg(); QC.store.set(CFG_KEY, cfg); modeUi();
    const out = $('healthOut'); out.innerHTML = '<span class="spin"></span> menguji…';
    try {
      const h = await api('GET', '/api/health');
      $('connPill').textContent = 'terhubung · v' + h.version; $('connPill').className = 'pill ok';
      const rows = [['Server', true, 'versi ' + h.version + (h.auth_required ? ' · API key diperlukan' : ' · tanpa API key')]];
      Object.entries(h.adapters || {}).forEach(([k, v]) => rows.push([k, v.available, v.detail]));
      rows.push(['local_agent', null, 'antrean; butuh AGENT_TOKEN + agent poll di MacBook']);
      rows.push(['RDKit (embed 3D)', !!h.rdkit, h.rdkit ? 'POST /api/molecule/embed tersedia' : 'tidak terpasang']);
      out.innerHTML = '';
      rows.forEach(([n, ok, d]) => out.append(QC.el('div', { class: 'hrow' }, [QC.el('span', { class: 'pill ' + (ok === null ? '' : ok ? 'ok' : 'bad'), text: ok === null ? 'info' : ok ? 'siap' : 'tidak siap' }), QC.el('b', { text: n }), QC.el('span', { class: 'muted', text: d })])));
    } catch (e) {
      $('connPill').textContent = 'gagal'; $('connPill').className = 'pill bad';
      out.innerHTML = ''; out.append(QC.el('div', { class: 'callout bad', text: e.message }));
    }
  };

  /* ---------------- 2. submit ---------------- */
  let extras = []; // {name, b64, size}
  const SAMPLE = `! B3LYP def2-SVP Opt Freq
%pal nprocs 1 end
%maxcore 2000
* xyz 0 1
O   0.000000   0.000000   0.117790
H   0.000000   0.755453  -0.471160
H   0.000000  -0.755453  -0.471160
*
`;
  function loadFromBuilder(silent) {
    const o = QC.store.get('orcaInput', null);
    if (!o || !o.text) { if (!silent) QC.toast('Belum ada input dari Input Builder'); return false; }
    $('sText').value = o.text; if (o.name) { const base = String(o.name).replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_.\-]/g, '_'); $('sName').value = base || 'job'; $('sInpName').value = (base || 'job') + '.inp'; }
    runChecks(); if (!silent) QC.toast('Input dimuat dari Input Builder'); return true;
  }
  $('btnFromBuilder').onclick = () => loadFromBuilder(false);
  $('btnSample').onclick = () => { $('sText').value = SAMPLE; runChecks(); };
  $('fInp').onchange = async e => { const f = e.target.files[0]; if (!f) return; $('sText').value = await QC.readFile(f); const b = f.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_.\-]/g, '_'); $('sName').value = b; $('sInpName').value = b + '.inp'; runChecks(); };
  $('fExtra').onchange = async e => {
    extras = [];
    for (const f of e.target.files) {
      const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      extras.push({ name: f.name.replace(/[^A-Za-z0-9_.\-]/g, '_'), content_b64: btoa(s), size: f.size });
    }
    $('extraList').textContent = extras.map(x => x.name + ' (' + x.size + ' B)').join(', '); runChecks();
  };
  function runChecks() {
    const t = $('sText').value, n = +$('sProcs').value || 1, mem = +$('sMem').value || 0, L = [];
    const add = (lv, msg) => L.push([lv, msg]);
    if (!t.trim()) add('bad', 'Input kosong.');
    else {
      if (/^\s*!/m.test(t)) add('ok', 'Baris keyword "!" ada.'); else add('bad', 'Tidak ada baris keyword yang diawali "!".');
      const geom = t.match(/^\s*\*\s*(xyz|xyzfile|int|gzmt)\b(.*)$/mi);
      if (geom) {
        add('ok', 'Blok koordinat ditemukan (* ' + geom[1].toLowerCase() + ').');
        if (/xyzfile/i.test(geom[1])) { const fn = (geom[2].trim().split(/\s+/)[2] || ''); if (fn && !extras.some(x => x.name === fn)) add('warn', 'Input memakai xyzfile "' + fn + '" — tambahkan berkas itu di "Berkas tambahan".'); }
        else if (!/^\s*\*\s*$/m.test(t.slice(t.indexOf(geom[0]) + geom[0].length))) add('warn', 'Blok koordinat tampaknya tidak ditutup dengan "*".');
      } else add('bad', 'Blok koordinat "* xyz charge mult" tidak ditemukan.');
      const pal = t.match(/%pal[\s\S]*?nprocs\s+(\d+)/i) || t.match(/^\s*!.*\bPAL(\d+)\b/mi);
      if (pal) { if (+pal[1] !== n) add('warn', '%pal nprocs=' + pal[1] + ' ≠ nprocs job (' + n + ') — samakan agar tidak terjadi oversubscribe/MPI error.'); else add('ok', '%pal nprocs cocok (' + n + ').'); }
      else if (n > 1) add('warn', 'nprocs=' + n + ' tetapi input tanpa %pal — ORCA hanya memakai 1 core.');
      const mc = t.match(/%maxcore\s+(\d+)/i);
      if (mc) { if (+mc[1] > mem) add('warn', '%maxcore ' + mc[1] + ' MB > memori per core job (' + mem + ' MB). ORCA bisa melampaui batas container (pakai ±75% %maxcore dari memori fisik).'); else add('ok', '%maxcore ' + mc[1] + ' MB ≤ memori per core.'); }
      else add('warn', 'Tidak ada %maxcore (default ORCA 1024 MB/core).');
      if (/^\s*!.*\b(Opt|OPT)\b/m.test(t) && /^\s*!.*\bFreq\b/mi.test(t) === false) add('ok', 'Jangan lupa Freq setelah Opt untuk memeriksa frekuensi imajiner.');
    }
    const ul = $('checks'); ul.innerHTML = ''; L.forEach(([lv, m]) => ul.append(QC.el('li', { class: lv, text: m })));
    return L;
  }
  ['sText', 'sProcs', 'sMem'].forEach(i => $(i).addEventListener('input', QC.debounce(runChecks, 250)));
  $('btnPal').onclick = () => {
    let t = $('sText').value; const n = +$('sProcs').value || 1, mem = +$('sMem').value || 2000;
    t = t.replace(/^\s*%pal[\s\S]*?end\s*$/gim, '').replace(/^\s*%maxcore\s+\d+\s*$/gim, '').replace(/\n{3,}/g, '\n\n');
    const lines = t.split('\n'); let k = 0; while (k < lines.length && !/^\s*!/.test(lines[k])) k++;
    let last = k; while (last + 1 < lines.length && /^\s*!/.test(lines[last + 1])) last++;
    lines.splice(Math.min(last + 1, lines.length), 0, (n > 1 ? `%pal nprocs ${n} end\n` : '') + `%maxcore ${Math.floor(mem * 0.75)}`);
    $('sText').value = lines.join('\n'); runChecks(); QC.toast('Disisipkan: %maxcore = 75% memori per core');
  };
  $('btnSubmit').onclick = async () => {
    uiToCfg(); const msg = $('submitMsg'); msg.textContent = '';
    const L = runChecks(); if (L.some(x => x[0] === 'bad')) { msg.innerHTML = '<span class="pill bad">Perbaiki dulu pemeriksaan yang bertanda ✕</span>'; return; }
    let inpName = $('sInpName').value.trim(); if (!/\.inp$/i.test(inpName)) inpName += '.inp';
    const body = { backend: cfg.backend, name: $('sName').value.trim() || 'job', input_name: inpName, input_text: $('sText').value, nprocs: +$('sProcs').value || 1, memory_mb: +$('sMem').value || 2000, walltime: $('sWall').value.trim() || '24:00:00', extra_files: extras.map(x => ({ name: x.name, content_b64: x.content_b64 })) };
    if (cfg.image) body.orca_image = cfg.image;
    $('btnSubmit').disabled = true;
    try {
      const r = await api('POST', '/api/jobs', body);
      msg.innerHTML = ''; msg.append(QC.el('span', { class: 'pill ok', text: 'Terkirim: ' + r.id + ' (' + r.status + ')' }));
      selected = r.id; QC.showTab('t-monitor'); await refreshJobs(); showLog(r.id);
    } catch (e) { msg.innerHTML = ''; msg.append(QC.el('div', { class: 'callout bad', text: e.message })); }
    finally { $('btnSubmit').disabled = false; }
  };

  /* ---------------- 3. monitor ---------------- */
  let jobs = [], selected = null, busy = false;
  const ago = t => { if (!t) return '—'; const d = new Date(t * 1000); return d.toLocaleString('id-ID', { hour12: false }); };
  const dur = j => { if (!j.started) return '—'; const s = Math.max(0, Math.round(((j.finished || Date.now() / 1000) - j.started))); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  async function refreshJobs() {
    if (busy) return; busy = true;
    try {
      jobs = await api('GET', '/api/jobs'); $('monInfo').textContent = jobs.length + ' job · diperbarui ' + new Date().toLocaleTimeString('id-ID', { hour12: false });
      renderJobs(); renderResultSelect();
    } catch (e) { $('monInfo').textContent = 'Gagal memuat: ' + e.message.slice(0, 120); }
    busy = false;
  }
  function renderJobs() {
    const tb = $('jobTable').tBodies[0]; tb.innerHTML = '';
    if (!jobs.length) { tb.append(QC.el('tr', {}, [QC.el('td', { colspan: 8, class: 'muted', text: 'Belum ada job.' })])); return; }
    jobs.forEach(j => {
      const act = QC.el('div', { class: 'act' }, [
        QC.el('button', { class: 'btn sm', text: 'Log', onclick: () => showLog(j.id) }),
        QC.el('button', { class: 'btn sm', text: 'Hasil', onclick: () => { $('rJob').value = j.id; QC.showTab('t-results'); loadResult(); } }),
      ]);
      if (j.status === 'queued' || j.status === 'running') act.append(QC.el('button', { class: 'btn sm danger', text: 'Batal', onclick: async () => { try { await api('POST', '/api/jobs/' + j.id + '/cancel'); refreshJobs(); } catch (e) { QC.toast(e.message.slice(0, 100)); } } }));
      else act.append(QC.el('button', { class: 'btn sm danger', text: 'Hapus', onclick: async () => { if (!confirm('Hapus job ' + j.id + ' beserta berkasnya?')) return; try { await api('DELETE', '/api/jobs/' + j.id); if (selected === j.id) selected = null; refreshJobs(); } catch (e) { QC.toast(e.message.slice(0, 100)); } } }));
      const tr = QC.el('tr', { style: selected === j.id ? 'background:color-mix(in srgb,var(--accent) 8%,transparent)' : '' }, [
        QC.el('td', { class: 'mono', text: j.id }), QC.el('td', { text: j.name }), QC.el('td', { text: j.backend }),
        QC.el('td', {}, [QC.el('span', { class: 'pill st-' + j.status, text: j.status })]),
        QC.el('td', { class: 'num', text: j.nprocs }), QC.el('td', { text: ago(j.created) }), QC.el('td', { class: 'num', text: dur(j) }), QC.el('td', {}, [act])]);
      if (j.message && j.status === 'failed') tr.title = j.message;
      tb.append(tr);
    });
  }
  async function showLog(id) { selected = id; $('logJob').textContent = id; renderJobs(); await pullLog(); }
  async function pullLog() {
    if (!selected) return;
    try {
      const r = await api('GET', '/api/jobs/' + selected + '/log?tail=' + $('logTail').value, null, 'text');
      const box = $('logBox'), stick = $('autoScroll').checked;
      box.textContent = r.text || '(log belum ada — job mungkin masih antre)'; if (stick) box.scrollTop = box.scrollHeight;
    } catch (e) { $('logBox').textContent = 'Gagal memuat log: ' + e.message; }
  }
  $('btnRefresh').onclick = () => { refreshJobs(); pullLog(); };
  $('logTail').onchange = pullLog;
  setInterval(async () => {
    if (!$('autoRef').checked || document.hidden) return;
    const mon = $('t-monitor').classList.contains('active');
    if (mon || jobs.some(j => j.status === 'running' || j.status === 'queued')) await refreshJobs();
    if (mon && selected) { const j = jobs.find(x => x.id === selected); if (j && (j.status === 'running' || j.status === 'queued' || !$('logBox').dataset.final)) { await pullLog(); $('logBox').dataset.final = (j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') ? '1' : ''; } }
  }, 3000);

  /* ---------------- 4. results ---------------- */
  let curOut = null; // {name,text,job}
  function renderResultSelect() {
    const sel = $('rJob'), cur = sel.value; sel.innerHTML = '';
    jobs.forEach(j => sel.append(QC.el('option', { value: j.id, text: j.id + ' · ' + j.name + ' · ' + j.status })));
    if (cur && jobs.some(j => j.id === cur)) sel.value = cur;
  }
  function parseOrca(t) {
    const R = {}, num = s => parseFloat(s);
    let m, all = [...t.matchAll(/FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)/g)]; if (all.length) R.energy = num(all[all.length - 1][1]);
    R.terminated = /ORCA TERMINATED NORMALLY/.test(t); R.aborted = /ABORTING THE RUN|ORCA finished by error/.test(t);
    R.scfConv = /SCF CONVERGED AFTER/.test(t) ? true : /SCF NOT CONVERGED/.test(t) ? false : null;
    if ((m = [...t.matchAll(/SCF CONVERGED AFTER\s+(\d+)\s+CYCLES/g)]).length) R.scfCycles = +m[m.length - 1][1];
    R.optConv = /THE OPTIMIZATION HAS CONVERGED/.test(t) ? true : /optimization.*not converged|MAXIMUM NUMBER OF CYCLES|NOT CONVERGED/i.test(t) && /GEOMETRY OPTIMIZATION/i.test(t) ? false : null;
    const fi = t.lastIndexOf('VIBRATIONAL FREQUENCIES');
    if (fi >= 0) { const blk = t.slice(fi, fi + 20000); const fr = [...blk.matchAll(/^\s*\d+:\s+(-?\d+\.\d+)\s+cm\*\*-1/gm)].map(x => num(x[1])); R.freqs = fr; R.imag = fr.filter(f => f < -0.01); }
    const oi = t.lastIndexOf('ORBITAL ENERGIES');
    if (oi >= 0) { const rows = [...t.slice(oi, oi + 40000).matchAll(/^\s*(\d+)\s+(\d\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/gm)].map(x => ({ n: +x[1], occ: num(x[2]), eh: num(x[3]), ev: num(x[4]) })); const occ = rows.filter(r => r.occ > 0.5), vir = rows.filter(r => r.occ < 0.5); if (occ.length && vir.length) { R.homo = occ[occ.length - 1]; R.lumo = vir[0]; R.gap = R.lumo.ev - R.homo.ev; } }
    if ((m = t.match(/Final Gibbs free energy\s+\.\.\.\s+(-?\d+\.\d+)/))) R.gibbs = num(m[1]);
    if ((m = t.match(/TOTAL RUN TIME:\s+(\d+) days (\d+) hours (\d+) minutes (\d+) seconds (\d+) msec/))) R.wall = +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4] + +m[5] / 1000;
    return R;
  }
  const fmtWall = s => s == null ? '—' : (s >= 3600 ? Math.floor(s / 3600) + ' j ' : '') + (s >= 60 ? Math.floor(s % 3600 / 60) + ' m ' : '') + (s % 60).toFixed(1) + ' d';
  function stat(k, v, sub) { return QC.el('div', { class: 'stat' }, [QC.el('div', { class: 'k', text: k }), QC.el('div', { class: 'v', text: v }), sub ? QC.el('div', { class: 'small muted', text: sub }) : '']); }
  function flag(txt, cls) { return QC.el('span', { class: 'pill ' + cls, text: txt }); }
  async function loadResult() {
    const id = $('rJob').value, msg = $('rMsg'); if (!id) { msg.textContent = 'Pilih job dulu.'; return; }
    msg.innerHTML = '<span class="spin"></span> mengambil…'; $('btnToAnalyzer').disabled = true;
    try {
      const j = await api('GET', '/api/jobs/' + id);
      const ft = $('fileTable').tBodies[0]; ft.innerHTML = '';
      j.files.forEach(f => ft.append(QC.el('tr', {}, [QC.el('td', { class: 'mono', text: f.name }), QC.el('td', { class: 'num', text: f.size > 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : f.size > 1e3 ? (f.size / 1e3).toFixed(1) + ' kB' : f.size + ' B' }), QC.el('td', {}, [QC.el('button', { class: 'btn sm', text: 'Unduh', onclick: async () => { try { QC.download(f.name, await api('GET', '/api/jobs/' + id + '/files/' + encodeURIComponent(f.name), null, 'blob')); } catch (e) { QC.toast(e.message.slice(0, 100)); } } })])])));
      const outF = j.files.find(f => /\.out$/i.test(f.name));
      if (!outF) { msg.textContent = 'Job ini belum punya berkas .out (status: ' + j.status + ').'; $('rStats').innerHTML = ''; $('rFlags').innerHTML = ''; return; }
      const blob = await api('GET', '/api/jobs/' + id + '/files/' + encodeURIComponent(outF.name), null, 'blob'); const text = await blob.text();
      curOut = { name: outF.name, text, job: j }; const R = parseOrca(text);
      const S = $('rStats'); S.innerHTML = '';
      S.append(stat('Energi akhir (Eh)', R.energy != null ? R.energy.toFixed(8) : '—', R.energy != null ? (R.energy * QC.HARTREE_EV).toFixed(3) + ' eV' : ''));
      S.append(stat('HOMO / LUMO (eV)', R.homo ? R.homo.ev.toFixed(3) + ' / ' + R.lumo.ev.toFixed(3) : '—', R.gap != null ? 'gap ' + R.gap.toFixed(3) + ' eV' : 'tidak ada tabel orbital'));
      S.append(stat('Frekuensi imajiner', R.freqs ? String(R.imag.length) : '—', R.freqs ? (R.imag.length ? R.imag.map(f => f.toFixed(1)).join(', ') + ' cm⁻¹' : R.freqs.filter(f => f > 0).length + ' mode vibrasi positif') : 'tidak ada Freq'));
      S.append(stat('Waktu komputasi', fmtWall(R.wall), R.gibbs != null ? 'G = ' + R.gibbs.toFixed(6) + ' Eh' : ''));
      const F = $('rFlags'); F.innerHTML = '';
      F.append(flag(R.terminated ? 'ORCA terminated normally' : R.aborted ? 'ORCA ABORT / error' : 'tanpa penanda terminated normally', R.terminated ? 'ok' : 'bad'));
      if (R.scfConv !== null) F.append(flag(R.scfConv ? 'SCF konvergen' + (R.scfCycles ? ' (' + R.scfCycles + ' siklus)' : '') : 'SCF TIDAK konvergen', R.scfConv ? 'ok' : 'bad'));
      if (R.optConv !== null) F.append(flag(R.optConv ? 'Optimisasi konvergen' : 'Optimisasi belum konvergen', R.optConv ? 'ok' : 'warn'));
      if (R.freqs) F.append(flag(R.imag.length ? R.imag.length + ' frekuensi imajiner (bukan minimum / TS)' : 'Tanpa frekuensi imajiner', R.imag.length ? 'warn' : 'ok'));
      if (/SIMULASI/.test(text)) F.append(flag('keluaran SIMULASI (demo)', 'warn'));
      msg.textContent = outF.name + ' · ' + text.length.toLocaleString('id-ID') + ' karakter · status job: ' + j.status;
      $('btnToAnalyzer').disabled = false;
    } catch (e) { msg.innerHTML = ''; msg.append(QC.el('span', { class: 'pill bad', text: e.message.slice(0, 200) })); }
  }
  $('btnLoadOut').onclick = loadResult;
  $('rJob').onchange = () => { $('btnToAnalyzer').disabled = true; };

  /* hand-off to Results Analyzer: localStorage -> sessionStorage -> IndexedDB */
  function idbPut(key, val) {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('qc', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('handoff');
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => { const tx = rq.result.transaction('handoff', 'readwrite'); tx.objectStore('handoff').put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
    });
  }
  async function handoff(name, text) {
    const payload = { name, text, from: 'orca-docker', t: Date.now() };
    QC.store.del('analyzerHandoff'); try { sessionStorage.removeItem('qc.analyzerHandoff'); } catch (e) { }
    if (QC.store.set('analyzerHandoff', payload)) return 'local';
    try { sessionStorage.setItem('qc.analyzerHandoff', JSON.stringify(payload)); return 'session'; } catch (e) { }
    try { await idbPut('analyzerHandoff', payload); QC.store.set('analyzerHandoffMeta', { name, where: 'idb', t: payload.t }); return 'idb'; } catch (e) { }
    return null;
  }
  $('btnToAnalyzer').onclick = async () => {
    if (!curOut) return;
    const w = await handoff(curOut.name, curOut.text);
    if (!w) { QC.toast('Penyimpanan browser penuh — unduh .out lalu unggah manual', 4500); return; }
    location.href = 'results-analyzer.html?from=docker&store=' + w;
  };

  /* ---------------- init ---------------- */
  cfgToUi();
  if (!loadFromBuilder(true)) $('sText').value = SAMPLE;
  runChecks(); refreshJobs();
  // test hooks
  window.__dockerDemo = { parseOrca, DEMO_OUT };
})();
