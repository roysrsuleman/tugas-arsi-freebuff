# PROGRESS — Mini Gantt Project

Checklist tahapan pengembangan. **Baca file ini di awal setiap sesi dan lanjutkan dari
tahap pertama yang belum dicentang.** Jangan mengulang tahap yang sudah selesai.

## Checklist Tahapan

- [x] 1. Setup proyek (struktur folder, package.json, .gitignore, database SQLite)
- [x] 2. Logika penjadwalan: kalender kerja (weekend & libur) + hitung tanggal mulai/selesai
- [x] 3. Dependensi FS/SS + delay, perhitungan ulang otomatis, deteksi circular dependency
- [x] 4. Critical path (forward/backward pass, tabel semua jalur)
- [x] 5. Unit test logika (kalender, dependensi, critical path) dan lulus semua
- [x] 6. REST API: CRUD proyek, kegiatan, resource, penugasan + validasi
- [x] 7. Frontend: manajemen proyek, kegiatan, resource
- [x] 8. Frontend: Gantt chart + highlight critical path
- [x] 9. Frontend: diagram PERT
- [x] 10. Data contoh (A-J dan PT XZ) + verifikasi hasil 33 hari
- [x] 11. Pengujian menyeluruh & perbaikan bug
- [x] 12. README (instalasi, fitur, placeholder screenshot)

## Aturan

- Kerjakan SATU tahap pada satu waktu, sesuai urutan.
- Setelah tahap selesai dan teruji: centang `[x]`, tambahkan catatan singkat
  (file apa yang dibuat, masalah yang tersisa), lalu commit dengan pesan
  `"tahap N: <ringkasan>"`.
- Jika menemukan bug di tahap sebelumnya, catat di bagian **Catatan / Bug**.

## Catatan / Bug

- **Tahap 1 selesai.** File: `package.json` (script `start`/`test`), `.gitignore`,
  `server/db.js` (skema SQLite: projects, holidays, tasks, dependencies, resources,
  assignments), folder `server/`, `public/`, `tests/`, `docs/`. `npm install` OK,
  database terbuka dan tabel terbentuk. Belum ada masalah tersisa.
- **Tahap 2 selesai.** File: `server/logic/calendar.js` (weekend bisa dikonfigurasi,
  mode libur/kerja, libur one-off & recurring, `advanceWorkingDays`, `endDateFor`),
  `tests/calendar.test.js` (17 test, lulus). Catatan: argumen direktori `node --test
  tests/` tidak dikenali di Windows, script test diubah ke
  `node --test "tests/**/*.test.js"`.
- **Tahap 3 selesai.** File: `server/logic/schedule.js` (`topoSort` Kahn +
  `CircularDependencyError`, `computeSchedule` FS/SS + delay hari kerja, ambil
  tanggal mulai paling akhir dari multi-pendahulu, `recalcProjectSchedule` yang
  menulis ulang tanggal ke DB), `tests/schedule.test.js` (22 test, lulus; total 39).
  Semua tahap 1-3 teruji, belum ada bug tersisa.
- **Tahap 6 selesai.** File: `server/validate.js` (validasi berbahasa Indonesia),
  `server/app.js`, `server/index.js`, `server/routes/{helpers,projects,tasks,resources}.js`.
  Endpoint: CRUD `/api/projects` (+ `/calendar`), `/api/projects/:id/tasks`,
  `/api/tasks/:id`, `/api/projects/:id/resources`, `/api/resources/:id`; penugasan
  resource lewat field `resourceIds` pada payload kegiatan; biaya = durasi x total
  tarif. Diuji via curl: recalc, circular -> 400 (rollback aman), duplikat kode,
  validasi input, DELETE cascade, 404. `npm test` tetap 39 lulus.
- **Tahap 7 selesai.** File: `public/index.html`, `public/css/styles.css`,
  `public/js/{api,app,projects,tasks,resources}.js` (murni tanpa framework),
  `scripts/ui-smoke.js` (smoke test UI opsional via Chrome headless CDP,
  14 pemeriksaan lulus: CRUD proyek, kalender/libur, tanggal otomatis, toast
  circular, resource + biaya). Tampilan responsif (tabel jadi kartu di layar
  kecil), seluruh teks berbahasa Indonesia. Data uji otomatis dibersihkan.
- **Tahap 12 selesai.** File: `README.md` (deskripsi, fitur, tech stack, struktur,
  instalasi `npm install`, menjalankan `npm start`, test `npm test`, ringkasan REST
  API, bagian Screenshot dengan referensi gambar di `docs/`, lisensi).
- **Status sesi 1:** tahap 1, 2, 3, 6, 7, 12 selesai & ter-commit. Tahap 4, 5
  (sebagian), 8, 9, 10, 11 menunggu prompt berikutnya.
- **Tahap 4 selesai (Sesi 2 — Prompt 2).** File: `server/logic/criticalPath.js`
  (`computeCriticalPath`: forward pass ES/EF dari jadwal, backward pass LF/LS
  via FS/SS + delay hari kerja, slack, enumerasi semua jalur sumber->akhir dengan
  total estimasi durasi & penandaan jalur terpanjang), `server/logic/calendar.js`
  (tambah `previousWorkingDayBefore` & `retreatWorkingDays`),
  `server/routes/analysis.js` (GET /api/projects/:id/critical-path),
  `tests/critical-path.test.js` (9 test; total 48 lulus, EXIT=0). Kasus SS dengan
  pendahulu lebih panjang dari penerus di-clamp (LS>=ES) sehingga slack tetap
  masuk akal (LF<EF ditampilkan sebagai LF=EF). Tahap 5 masih menunggu test
  lanjutan prompt 3.
- **Tahap 8 selesai (Sesi 2).** File: `public/js/gantt.js` (panel kiri: kode, nama,
  durasi, mulai, selesai, resource; panel kanan: timeline per hari dengan header
  bulan+tanggal, kolom weekend (abu) & hari libur (oranye) diarsir, bar warna
  kegiatan, panah dependensi SVG FS/SS+delay, tombol Show/Hide Critical Path yang
  memberi warna merah pada bar kritis, tabel ES/EF/LS/LF/slack + tabel semua jalur
  + kartu total durasi proyek), `public/index.html` (tab Gantt),
  `public/css/styles.css` (gaya Gantt, sticky left panel), penyempurnaan
  `app.js`/`tasks.js`/`projects.js`/`resources.js` (render ulang Gantt + invalidasi
  cache critical-path). Smoke test UI diperluas jadi 22 pemeriksaan, lulus (EXIT=0).
  Catatan: `innerText` header tabel berubah jadi huruf besar oleh CSS
  `text-transform`, smoke test memakai `toLowerCase()`.
- **Tahap 9 selesai (Sesi 2).** File: `public/js/pert.js` (diagram jaringan SVG
  activity-on-node: layering rank = jarak terpanjang dari sumber, node = kode +
  durasi dengan tooltip nama+tanggal, panah kurva/elbow berlabel FS/SS+delay,
  node & panah jalur kritis merah, legenda + info total durasi proyek),
  `public/index.html` (tab PERT), `public/css/styles.css` (gaya PERT), hook render
  di `app.js`/`tasks.js`/`projects.js`. Smoke test UI kini 26 pemeriksaan, lulus
  (EXIT=0).
- **Status sesi 2 (Prompt 2):** tahap 4, 8, 9 selesai & ter-commit. Tahap 5
  (test lanjutan), 10 (data contoh + verifikasi 33 hari), 11 (pengujian
  menyeluruh) menunggu prompt 3.
- **Tahap 5 selesai (Sesi 3 — Prompt 3).** File: `server/seed.js` (definisi data
  contoh A-J & SDLC sebagai fixture + `seedDatabase`), `tests/seed.test.js`
  (5 test: jalur A-D-H-J=30, B-E-H-J=33, B-F-J=9, C-G-I-J=20; critical path
  B-E-H-J total 33 hari & makespan 33 hari kerja (1 Jul - 14 Agu 2026); jadwal
  SDLC SS+delay & libur 17 Juli; tim SDLC 1 PM + 2 analis + 2 programmer + 2
  tester + 13 penugasan; seed idempoten). Total 53 test lulus (EXIT=0).
  Catatan: awalnya salah hitung jumlah penugasan (9 -> 13), dikoreksi.
- **Tahap 10 selesai (Sesi 3).** File: `server/routes/seed.js` (POST /api/seed
  idempoten: {sample:'all'|'abjak'|'sdlc'}), `public/index.html` (tombol
  "🎲 Muat Data Contoh"), `public/js/projects.js` (`loadSampleData` + konfirmasi
  dialog), `public/css/styles.css`. Verifikasi via curl: seed ke-1 membuat 2
  proyek, ke-2 skipped, sample ngasal -> 400; proyek A-J: durasi 33 hari kerja
  (1 Jul - 14 Agu 2026), jalur 30/33/9/20, critical path B-E-H-J; SDLC: 7 resource
  (1 PM, 2 analis, 2 programmer, 2 tester), A 30/6-6/7, B SS+3 3/7-14/7,
  C SS+5 10/7-21/7 (libur 17 Juli dilewati), F selesai 3/8, biaya per kegiatan
  terhitung. Data uji dihapus setelah verifikasi.
- **Tahap 11 selesai (Sesi 3 — akhir).** `scripts/ui-smoke.js` diperluas jadi
  **36 pemeriksaan, lulus (EXIT=0)**: tombol "Muat Data Contoh" (dialog
  dikonfirmasi otomatis di headless), Gantt A-J 10 bar + 33 hari + 4 bar merah
  (B,E,H,J), PERT A-J 10 node + 4 kritis, proyek SDLC (24 hari kerja, B 3 Jul
  & C 10 Jul = SS+delay, resource tampil), validasi form HTML5, konfirmasi hapus
  proyek, tanpa error JavaScript. Cleanup smoke test otomatis (hanya menghapus
  proyek yang ia buat). `README.md` dilengkapi (fitur 1-8, API seed &
  critical-path, struktur file, cara test, placeholder screenshot).
  Bug yang ditemukan & diperbaiki selama sesi 3: ekspektasi test jumlah
  penugasan salah hitung (9 -> 13). Tidak ada bug fungsional tersisa.
- **Status sesi 3 (Prompt 3): SEMUA TAHAP (1-12) SELESAI.** Kriteria selesai
  terpenuhi: aplikasi berjalan tanpa error fatal, 53 unit test lulus, data contoh
  menghasilkan critical path B-E-H-J = 33 hari, Gantt & PERT tampil benar.

## Sesi

- **Sesi 1 (Prompt 1 — Fitur 1-3):** mengerjakan tahap yang terkait fitur Proyek,
  Kegiatan, dan Resource beserta struktur proyeknya. Tahap lain dibiarkan `[ ]`
  sampai prompt berikutnya.
