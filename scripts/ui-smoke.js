#!/usr/bin/env node
/**
 * Smoke test UI Mini Gantt Project lewat Chrome headless (Chrome DevTools
 * Protocol, tanpa dependensi ekstra).
 *
 * Prasyarat:
 *   1. Server berjalan:  npm start
 *   2. Chrome/Chromium terinstal (atau set CHROME_PATH)
 *
 * Jalankan:  node scripts/ui-smoke.js
 *
 * Alur yang diuji: buat proyek -> simpan kalender/libur -> buat kegiatan
 * (cek tanggal otomatis) -> deteksi circular lewat toast -> CRUD resource ->
 * penugasan resource + biaya -> bersihkan data uji.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.APP_URL || 'http://localhost:3000';
const CDP_PORT = 9333;
const TEST_PROJECT = 'Proyek Uji UI';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Chrome tidak ditemukan. Set env CHROME_PATH ke lokasi chrome.exe.');
  }
  return found;
}

async function fetchJson(url, method = 'GET') {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}`);
  return res.json();
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];

    ws.onopen = () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
        on(fn) { listeners.push(fn); },
        close() { try { ws.close(); } catch (_) { /* abaikan */ } },
      });
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`CDP ${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = () => reject(new Error('Gagal terhubung ke WebSocket CDP'));
  });
}

let passed = 0;
let smokeCreatedIds = []; // proyek contoh yang dibuat smoke test (untuk dibersihkan)
function ok(label) {
  passed += 1;
  console.log(`  ✔ ${label}`);
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  // Bersihkan sisa data uji dari run sebelumnya
  const existing = await fetchJson(`${BASE}/api/projects`);
  for (const p of existing.filter((x) => x.name === TEST_PROJECT)) {
    await fetch(`${BASE}/api/projects/${p.id}`, { method: 'DELETE' });
  }

  const chromePath = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mgp-ui-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1366,900',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp = null;
  const pageErrors = [];
  let expectApiError = false; // fase uji circular memang memicu HTTP 400

  try {
    // Tunggu endpoint CDP siap
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      try {
        target = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
      } catch (_) {
        await sleep(250);
      }
    }
    if (!target) fail('Chrome headless tidak siap dalam 15 detik');

    cdp = await connectCdp(target.webSocketDebuggerUrl);
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        pageErrors.push(`exception: ${(d.exception && d.exception.description) || d.text}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
        pageErrors.push(`console.error: ${text}`);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error'
          && !String(msg.params.entry.url || msg.params.entry.text).includes('favicon')
          && !(expectApiError && msg.params.entry.source === 'network')) {
        pageErrors.push(`log: ${msg.params.entry.text} (${msg.params.entry.url || ''})`);
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.navigate', { url: BASE });

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      });
      if (r.exceptionDetails) {
        fail(`Ekspresi gagal: ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text}\n  -> ${expression}`);
      }
      return r.result.value;
    };

    const waitFor = async (expr, timeoutMs = 9000) => {
      const start = Date.now();
      for (;;) {
        const value = await evaluate(`(() => { try { return !!(${expr}); } catch (e) { return false; } })()`);
        if (value) return;
        if (Date.now() - start > timeoutMs) fail(`Timeout menunggu: ${expr}`);
        await sleep(130);
      }
    };

    const expect = async (expr, label) => {
      if (await evaluate(expr)) ok(label);
      else fail(`Gagal: ${label}\n  -> ${expr}`);
    };

    console.log('Menjalankan smoke test UI...');

    // 1. Aplikasi termuat & render awal
    await waitFor(`document.readyState === 'complete'`);
    await waitFor(`document.querySelectorAll('#project-cards > *').length > 0`);
    ok('Halaman termuat dan kartu proyek dirender');

    // 2. Buat proyek lewat modal
    await expect(
      `(() => { document.getElementById('btn-new-project').click(); return !document.getElementById('project-modal').hidden; })()`,
      'Modal proyek terbuka'
    );
    await evaluate(`(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
      set('project-name', ${JSON.stringify(TEST_PROJECT)});
      set('project-org', 'PT Uji UI');
      set('project-start', '2026-10-12');
      set('project-desc', 'Dibuat oleh scripts/ui-smoke.js');
      return true;
    })()`);
    await evaluate(`document.getElementById('project-form').requestSubmit(); true`);
    await waitFor(`document.getElementById('project-modal').hidden
      && document.getElementById('project-cards').innerText.includes(${JSON.stringify(TEST_PROJECT)})`);
    ok('Proyek dibuat dan muncul di daftar + selector');
    await expect(
      `document.getElementById('project-select').value !== ''`,
      'Proyek otomatis menjadi proyek aktif'
    );

    // 3. Kalender: default weekend Sab/Ming, tambah libur, simpan
    await expect(
      `document.querySelectorAll('input[name="weekend-day"]:checked').length === 2`,
      'Weekend default (Sabtu & Minggu) tercentang'
    );
    await evaluate(`(() => {
      document.getElementById('holiday-date').value = '2026-10-14';
      document.getElementById('holiday-label').value = 'Libur Uji UI';
      document.getElementById('btn-add-holiday').click();
      return true;
    })()`);
    await waitFor(`document.getElementById('holiday-list').innerText.includes('Libur Uji UI')`);
    await evaluate(`document.getElementById('btn-save-calendar').click(); true`);
    await waitFor(`[...document.querySelectorAll('#toast-container .toast')]
      .some(t => t.innerText.includes('Kalender disimpan'))
      && document.getElementById('holiday-list').innerText.includes('Libur Uji UI')`);
    ok('Hari libur ditambahkan & pengaturan kalender tersimpan');

    // 4. Tab kegiatan: buat Kegiatan A (tanggal otomatis, libur 14 Okt dilewati)
    await evaluate(`document.querySelector('[data-tab="tasks"]').click(); true`);
    await expect(`document.getElementById('tab-tasks').classList.contains('active')`, 'Berpindah ke tab Kegiatan');
    await evaluate(`document.getElementById('btn-new-task').click(); true`);
    await expect(`!document.getElementById('task-modal').hidden`, 'Modal kegiatan terbuka');
    await evaluate(`(() => {
      document.getElementById('task-code').value = 'A';
      document.getElementById('task-name').value = 'Kegiatan Uji';
      document.getElementById('task-duration').value = 3;
      return true;
    })()`);
    await evaluate(`document.getElementById('task-form').requestSubmit(); true`);
    await waitFor(`document.getElementById('tasks-content').innerText.includes('Kegiatan Uji')`);
    await expect(
      `(() => { const t = document.getElementById('tasks-content').innerText;
        return t.includes('12 Oktober 2026') && t.includes('15 Oktober 2026'); })()`,
      'Tanggal A benar: 12-15 Okt 2026 (libur 14 Okt dilewati)'
    );

    // 5. Kegiatan B dengan pendahulu A (FS) -> mulai 16, selesai 19 Okt
    await evaluate(`document.getElementById('btn-new-task').click(); true`);
    await evaluate(`(() => {
      document.getElementById('task-code').value = 'B';
      document.getElementById('task-name').value = 'Kegiatan Lanjutan';
      document.getElementById('task-duration').value = 2;
      document.getElementById('btn-add-pred').click();
      return true;
    })()`);
    await waitFor(`document.querySelectorAll('#pred-rows .pred-row').length === 1`);
    await evaluate(`document.getElementById('task-form').requestSubmit(); true`);
    await waitFor(`document.getElementById('tasks-content').innerText.includes('Kegiatan Lanjutan')`);
    await expect(
      `(() => { const t = document.getElementById('tasks-content').innerText;
        return t.includes('16 Oktober 2026') && t.includes('19 Oktober 2026'); })()`,
      'Tanggal B benar: 16-19 Okt 2026 (FS setelah A)'
    );

    // 6. Circular dependency lewat UI -> toast error, modal tetap terbuka
    await evaluate(`document.querySelectorAll('#tasks-content tbody tr')[0]
      .querySelector('button[data-action="edit"]').click(); true`);
    await waitFor(`!document.getElementById('task-modal').hidden`);
    await evaluate(`document.getElementById('btn-add-pred').click(); true`);
    await waitFor(`document.querySelectorAll('#pred-rows .pred-row').length >= 1`);
    expectApiError = true; // PUT berikut sengaja memicu 400 (circular)
    await evaluate(`document.getElementById('task-form').requestSubmit(); true`);
    await waitFor(`[...document.querySelectorAll('#toast-container .toast.error')]
      .some(t => t.innerText.toLowerCase().includes('melingkar'))`);
    await sleep(400); // pastikan entri log jaringan 400 sudah tiba
    expectApiError = false;
    await expect(
      `!document.getElementById('task-modal').hidden`,
      'Circular dependency ditolak dengan toast & modal tetap terbuka'
    );
    await evaluate(`document.querySelector('#task-modal [data-close="task-modal"]').click(); true`);
    await waitFor(`document.getElementById('task-modal').hidden`);

    // 7. Resource: buat "Andi"
    await evaluate(`document.querySelector('[data-tab="resources"]').click(); true`);
    await evaluate(`document.getElementById('btn-new-resource').click(); true`);
    await evaluate(`(() => {
      document.getElementById('resource-name').value = 'Andi Wijaya';
      document.getElementById('resource-email').value = 'andi@contoh.com';
      document.getElementById('resource-position').value = 'Programmer';
      document.getElementById('resource-rate').value = 500000;
      return true;
    })()`);
    await evaluate(`document.getElementById('resource-form').requestSubmit(); true`);
    await waitFor(`document.getElementById('resources-content').innerText.includes('Andi Wijaya')`);
    ok('Resource dibuat');

    // 8. Tugaskan Andi ke Kegiatan B -> biaya = 2 x 500.000 = 1.000.000
    await evaluate(`document.querySelector('[data-tab="tasks"]').click(); true`);
    await evaluate(`document.querySelectorAll('#tasks-content tbody tr')[1]
      .querySelector('button[data-action="edit"]').click(); true`);
    await waitFor(`!document.getElementById('task-modal').hidden
      && document.querySelectorAll('#res-choices input').length > 0`);
    await evaluate(`(() => { const cb = document.querySelector('#res-choices input');
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await evaluate(`document.getElementById('task-form').requestSubmit(); true`);
    await waitFor(`document.getElementById('tasks-content').innerText.match(/Rp\\s*1\\.000\\.000/)`);
    ok('Penugasan resource & biaya kegiatan benar (Rp 1.000.000)');

    // 9. Tab Gantt: bar, arsip weekend/libur, panah dependensi, tabel jalur
    await evaluate(`document.querySelector('[data-tab="gantt"]').click(); true`);
    await waitFor(`document.getElementById('tab-gantt').classList.contains('active')`);
    await waitFor(`document.querySelectorAll('#gantt-content .gl-row').length === 2`);
    await expect(`document.querySelectorAll('#gantt-content .gbar').length === 2`, 'Bar Gantt dirender per kegiatan');
    await expect(`document.querySelectorAll('#gantt-content .gcol.we').length > 0`, 'Kolom weekend diarsir');
    await expect(`document.querySelectorAll('#gantt-content .gcol.hol').length === 1`, 'Kolom hari libur (14 Okt) diarsir');
    await expect(`document.querySelectorAll('#gantt-content svg.glinks path.glink').length >= 1`, 'Panah dependensi digambar');
    await expect(`document.getElementById('gantt-analysis').innerText.includes('Critical Path')`, 'Tabel semua jalur menampilkan critical path');
    await expect(`document.getElementById('gantt-analysis').innerText.toLowerCase().includes('slack')`, 'Tabel ES/EF/LS/LF/slack tampil');

    // 10. Tombol Show/Hide Critical Path
    await evaluate(`document.getElementById('btn-critical').click(); true`);
    await waitFor(`document.querySelectorAll('#gantt-content .gbar.critical').length >= 1`);
    await expect(`document.getElementById('btn-critical').getAttribute('aria-pressed') === 'true'`, 'Tombol critical aktif & bar kritis merah');
    await evaluate(`document.getElementById('btn-critical').click(); true`);
    await waitFor(`document.querySelectorAll('#gantt-content .gbar.critical').length === 0`);
    ok('Toggle Show/Hide Critical Path berfungsi');

    // 11. Tab PERT: node + panah, jalur kritis merah
    await evaluate(`document.querySelector('[data-tab="pert"]').click(); true`);
    await waitFor(`document.getElementById('tab-pert').classList.contains('active')`);
    await waitFor(`document.querySelectorAll('#pert-content svg.pert-svg .pnode').length === 2`);
    await expect(`document.querySelectorAll('#pert-content svg.pert-svg .pedge').length >= 1`, 'Panah dependensi PERT digambar');
    await expect(`document.querySelectorAll('#pert-content svg.pert-svg .pnode.crit').length === 2`, 'Node jalur kritis merah (A & B kritis)');
    await expect(`document.querySelectorAll('#pert-content svg.pert-svg .pedge.critical').length === 1`, 'Panah jalur kritis merah');
    await expect(`document.getElementById('pert-content').innerText.includes('hari kerja')`, 'Info total durasi proyek tampil');

    // 12. Data contoh: tombol "Muat Data Contoh" (dialog dikonfirmasi otomatis)
    const beforeIds = (await fetchJson(`${BASE}/api/projects`)).map((p) => p.id);
    await evaluate(`document.querySelector('[data-tab="projects"]').click(); true`);
    await evaluate(`(() => { window.confirm = () => true; return true; })()`);
    await evaluate(`document.getElementById('btn-seed').click(); true`);
    await waitFor(`document.getElementById('project-cards').innerText.includes('Sistem Informasi Kelola Pemberkasan')
      && document.getElementById('project-cards').innerText.includes('SDLC')`);
    smokeCreatedIds = (await fetchJson(`${BASE}/api/projects`)).map((p) => p.id).filter((id) => !beforeIds.includes(id));
    ok('Tombol Muat Data Contoh memuat 2 proyek contoh');

    // 13. Data contoh A-J di Gantt: 10 bar, total 33 hari, critical B-E-H-J
    await evaluate(`document.querySelector('[data-tab="gantt"]').click(); true`);
    await waitFor(`document.querySelectorAll('#gantt-content .gl-row').length === 10`);
    await expect(`document.querySelectorAll('#gantt-content .gbar').length === 10`, 'Gantt A-J: 10 bar kegiatan');
    await waitFor(`document.getElementById('gantt-analysis').innerText.includes('33 hari kerja')`);
    await expect(`document.getElementById('gantt-analysis').innerText.includes('B → E → H → J')`, 'Jalur B-E-H-J muncul di tabel jalur');
    await evaluate(`document.getElementById('btn-critical').click(); true`);
    await waitFor(`document.querySelectorAll('#gantt-content .gbar.critical').length === 4`);
    await expect(`document.getElementById('btn-critical').getAttribute('aria-pressed') === 'true'`, 'Critical path A-J = 4 bar merah (B, E, H, J)');
    await evaluate(`document.getElementById('btn-critical').click(); true`);

    // 14. PERT A-J: 10 node, 4 node kritis
    await evaluate(`document.querySelector('[data-tab="pert"]').click(); true`);
    await waitFor(`document.querySelectorAll('#pert-content svg.pert-svg .pnode').length === 10`);
    await expect(`document.querySelectorAll('#pert-content svg.pert-svg .pnode.crit').length === 4`, 'PERT A-J: 4 node kritis merah');

    // 15. Proyek SDLC: SS + delay, libur 17 Juli, resource tampil
    await evaluate(`(() => { const s = document.getElementById('project-select');
      const opt = [...s.options].find((o) => o.textContent.includes('SDLC'));
      s.value = opt.value; s.dispatchEvent(new Event('change')); return true; })()`);
    await waitFor(`document.querySelectorAll('#gantt-content .gl-row').length === 6`);
    await expect(`document.getElementById('gantt-analysis').innerText.includes('24 hari kerja')`, 'SDLC: total durasi proyek 24 hari kerja');
    await expect(`(() => { const t = document.getElementById('gantt-content').innerText;
      return t.includes('3 Jul 2026') && t.includes('10 Jul 2026'); })()`, 'SDLC: jadwal SS + delay (B 3 Jul, C 10 Jul)');
    await expect(`document.getElementById('gantt-content').innerText.includes('Rani Puspita')`, 'SDLC: nama resource tampil di panel kiri');

    // 16. Validasi form & konfirmasi hapus
    await evaluate(`document.querySelector('[data-tab="projects"]').click(); true`);
    await evaluate(`document.getElementById('btn-new-project').click(); true`);
    await waitFor(`!document.getElementById('project-modal').hidden`);
    await evaluate(`(() => { document.getElementById('project-name').value = '';
      document.getElementById('project-form').requestSubmit(); return true; })()`);
    await expect(`!document.getElementById('project-modal').hidden && document.getElementById('project-name').matches(':invalid')`, 'Form proyek menolak nama kosong (validasi browser)');
    await evaluate(`document.querySelector('#project-modal [data-close="project-modal"]').click(); true`);
    await waitFor(`document.getElementById('project-modal').hidden`);
    await evaluate(`(() => { const card = [...document.querySelectorAll('#project-cards .project-card')]
      .find((c) => c.innerText.includes('SDLC'));
      card.querySelector('button[data-action="delete"]').click(); return true; })()`);
    await waitFor(`!document.getElementById('project-cards').innerText.includes('SDLC')`);
    ok('Konfirmasi hapus proyek berfungsi (proyek SDLC terhapus)');

    // 17. Tidak boleh ada error JavaScript di halaman
    if (pageErrors.length) {
      fail(`Ada error di browser:\n    - ${pageErrors.join('\n    - ')}`);
    }
    ok('Tidak ada error JavaScript di browser');

    console.log(`\nSEMUA LULUS (${passed} pemeriksaan).`);
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* abaikan */ }
  }
}

async function cleanupSmokeData() {
  try {
    const projects = await fetchJson(`${BASE}/api/projects`);
    for (const p of projects.filter((x) => x.name === TEST_PROJECT || smokeCreatedIds.includes(x.id))) {
      await fetch(`${BASE}/api/projects/${p.id}`, { method: 'DELETE' });
    }
  } catch (_) { /* abaikan */ }
}

main()
  .then(async () => {
    await cleanupSmokeData(); // Bersihkan data uji
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`\nGAGAL: ${err.message}`);
    await cleanupSmokeData();
    process.exit(1);
  });
