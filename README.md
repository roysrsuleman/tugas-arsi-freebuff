# 📅 Mini Gantt Project

Aplikasi web penjadwalan proyek pengembangan perangkat lunak sederhana — versi mini
alat seperti GanttProject. Buat proyek, atur kalender kerja (weekend & hari libur),
susun kegiatan dengan dependensi **FS/SS**, kelola resource/anggota tim, dan biarkan
tanggal mulai–selesai serta biaya **dihitung otomatis**. Tersedia Gantt chart,
analisis **critical path** (CPM), diagram **PERT**, dan **data contoh bawaan**.

Tampilan rapi, responsif, dan berbahasa Indonesia.

## ✨ Fitur

### 1. Proyek

- CRUD proyek: nama, organisasi, deskripsi, tanggal mulai.
- Pengaturan kalender per proyek:
  - Hari weekend yang bisa dicentang (Sabtu/Minggu, atau hari lain);
  - Pilihan **weekend libur** atau **weekend tetap bekerja**;
  - Hari libur custom: tanggal + keterangan, tipe **sekali (one-off)** atau
    **berulang tiap tahun (recurring)**.
- Perubahan kalender otomatis menghitung ulang seluruh jadwal kegiatan.

### 2. Kegiatan (Task)

- CRUD kegiatan: kode (A, B, C, …), nama, durasi (hari kerja), prioritas, warna bar.
- Dependensi: satu atau beberapa kegiatan pendahulu, masing-masing dengan
  **tipe FS (Finish-Start) / SS (Start-Start)** dan **delay (hari kerja)**.
- Tanggal mulai & selesai dihitung **otomatis** dari durasi, dependensi, weekend,
  dan hari libur — hari non-kerja dilewati dan tidak dihitung sebagai durasi.
  Dengan beberapa pendahulu, diambil tanggal mulai **paling akhir**.
- Jika sebuah kegiatan diubah, semua kegiatan turunannya dihitung ulang otomatis.
- Dependensi melingkar (circular) terdeteksi dan ditolak dengan pesan yang jelas.

### 3. Resource / Anggota Tim

- CRUD resource: nama, email, telepon, posisi (Project Manager, Analis,
  Programmer, Tester), tarif per hari, dan hari libur pribadi (opsional).
- Penugasan satu atau lebih resource ke tiap kegiatan.
- Nama resource tampil di baris kegiatan beserta **total biaya**
  (durasi × jumlah tarif resource yang ditugaskan).

### 4. Gantt Chart

- Panel kiri: daftar kegiatan (kode, nama, durasi, mulai, selesai, resource).
- Panel kanan: bar pada timeline per hari — kolom **weekend & hari libur diarsir**
  warna berbeda, **panah dependensi** antar bar (FS/SS + label delay).
- Tombol **Show/Hide Critical Path**: bar kegiatan kritis diberi warna merah.
- Tabel rincian ES/EF/LS/LF/slack dan tabel **semua jalur** + total durasi proyek.

### 5. Critical Path (CPM)

- Graf dependensi → **forward pass** (ES, EF) dan **backward pass** (LS, LF);
  **slack** = hari kerja yang bisa digeser; slack = 0 → kegiatan **kritis**.
- Tabel semua jalur dari awal sampai akhir proyek: urutan kegiatan, durasi tiap
  kegiatan, total estimasi durasi; jalur terpanjang ditandai sebagai critical path.

### 6. Diagram PERT

- Jaringan (SVG): node = kegiatan (kode + durasi, tooltip nama + tanggal),
  panah = dependensi; node & panah jalur kritis berwarna merah.

### 7. Data Contoh Bawaan

- Tombol **🎲 Muat Data Contoh** (tab Proyek) memuat dua proyek sekaligus
  (idempoten — tidak menduplikasi nama yang sudah ada):
  1. **"Sistem Informasi Kelola Pemberkasan"** — 10 kegiatan (A–J), dependensi FS.
     Hasil: jalur A-D-H-J = 30, **B-E-H-J = 33 (critical path)**, B-F-J = 9,
     C-G-I-J = 20; total durasi proyek **33 hari kerja** (1 Jul – 14 Agu 2026).
  2. **"Pengembangan Sistem SDLC (Contoh)"** — 6 tahap (SS + delay), mulai
     30 Juni, weekend Sabtu–Minggu libur, libur custom **17 Juli**, dan
     7 anggota tim (1 Project Manager, 2 Analis, 2 Programmer, 2 Tester).

### 8. Validasi & Error

- Semua input tervalidasi (wajib diisi, durasi bilangan bulat ≥ 1, tanggal valid,
  email valid, warna heksa, prioritas/posisi dari pilihan resmi).
- Dependensi melingkar & pendahulu diri sendiri ditolak dengan pesan jelas
  (transaksi dibatalkan penuh).
- Error server/database selalu berupa JSON `{ "error": "pesan" }` berbahasa
  Indonesia; pesan ditampilkan sebagai toast di UI. Penghapusan selalu
  didahului konfirmasi.

## 🛠 Tech Stack

| Bagian   | Teknologi                                                       |
| -------- | --------------------------------------------------------------- |
| Backend  | Node.js + Express                                               |
| Database | SQLite via `better-sqlite3` (sinkron, tanpa server)             |
| Frontend | HTML + CSS + JavaScript murni (tanpa framework)                 |
| Test     | `node:test` (bawaan Node.js) + smoke test Chrome headless (CDP) |

## 📁 Struktur Proyek

```
mini-gantt-project/
├── server/                  # Backend
│   ├── index.js             # Entry point (npm start)
│   ├── app.js               # Assembly Express + error handler
│   ├── db.js                # Koneksi & skema SQLite
│   ├── seed.js              # Definisi data contoh + seedDatabase
│   ├── validate.js          # Validasi input (pesan Indonesia)
│   ├── logic/
│   │   ├── calendar.js      # Kalender kerja: weekend & hari libur
│   │   ├── schedule.js      # Dependensi FS/SS, recalc, deteksi circular
│   │   └── criticalPath.js  # Forward/backward pass, slack, semua jalur
│   └── routes/              # REST API (projects, tasks, resources,
│                            #           analysis, seed)
├── public/                  # Frontend
│   ├── index.html
│   ├── css/styles.css
│   └── js/                  # api, app, projects, tasks, resources, gantt, pert
├── tests/                   # Unit test (kalender, penjadwalan, critical path, seed)
├── scripts/ui-smoke.js      # Smoke test UI via Chrome headless (opsional)
├── docs/                    # Screenshot (lihat README ini)
├── data/                    # Database SQLite (dibuat otomatis, di-gitignore)
├── PROGRESS.md              # Checklist progres pengembangan
└── README.md
```

## 📦 Instalasi

Prasyarat: **Node.js 18+** (dikembangkan & diuji pada Node 24) dan npm.

```bash
# 1. Salin/clone proyek lalu masuk ke folder
cd SIMAPRO

# 2. Install dependensi
npm install
```

## ▶️ Menjalankan

```bash
npm start
```

Buka **http://localhost:3000** di browser.

- Port bisa diubah lewat environment variable, misal `PORT=8080 npm start`.
- File database dibuat otomatis di `data/mini-gantt.db` pada saat pertama dijalankan.
- Ingin langsung melihat Gantt & PERT? Klik **🎲 Muat Data Contoh** di tab Proyek.

## 🧪 Menjalankan Test

```bash
npm test
```

Menjalankan seluruh unit test dengan test runner bawaan Node.js:
kalender kerja (weekend & hari libur), dependensi FS/SS + delay, hitung ulang
otomatis, deteksi circular dependency, forward/backward pass & slack, serta
**data contoh A–J (critical path B-E-H-J = 33 hari)** dan contoh SDLC.

Opsional — smoke test UI lewat Chrome headless (server harus sedang berjalan;
membutuhkan Chrome/Chromium terinstal, atau set `CHROME_PATH`):

```bash
node scripts/ui-smoke.js
```

Smoke test memeriksa alur nyata di browser: CRUD proyek/kegiatan/resource,
kalender & hari libur, tanggal otomatis, penolakan circular, Gantt (bar, arsip
weekend/libur, panah, toggle critical), PERT, Muat Data Contoh (33 hari,
B-E-H-J), validasi form, dan konfirmasi hapus — semuanya tanpa error JavaScript.

## 🌐 Ringkasan REST API

| Method | Endpoint                          | Fungsi                               |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/projects`                   | Daftar proyek                        |
| POST   | `/api/projects`                   | Buat proyek                          |
| GET    | `/api/projects/:id`               | Detail proyek + kalender             |
| PUT    | `/api/projects/:id`               | Ubah proyek                          |
| DELETE | `/api/projects/:id`               | Hapus proyek                         |
| PUT    | `/api/projects/:id/calendar`      | Simpan weekend & hari libur (recalc) |
| GET    | `/api/projects/:id/tasks`         | Daftar kegiatan (+tanggal, biaya)    |
| POST   | `/api/projects/:id/tasks`         | Buat kegiatan (+dependensi)          |
| PUT    | `/api/tasks/:id`                  | Ubah kegiatan (recalc otomatis)      |
| DELETE | `/api/tasks/:id`                  | Hapus kegiatan                       |
| GET    | `/api/projects/:id/resources`     | Daftar resource                      |
| POST   | `/api/projects/:id/resources`     | Buat resource                        |
| PUT    | `/api/resources/:id`              | Ubah resource                        |
| DELETE | `/api/resources/:id`              | Hapus resource                       |
| GET    | `/api/projects/:id/critical-path` | ES/EF/LS/LF/slack + semua jalur      |
| POST   | `/api/seed`                       | Muat data contoh (idempoten)         |

Contoh:

```bash
curl -X POST http://localhost:3000/api/seed -H 'Content-Type: application/json' -d '{}'
```

## 📸 Screenshot

| Tampilan           | Gambar                                             |
| ------------------ | -------------------------------------------------- |
| Tampilan utama     | ![Tampilan utama](docs/tampilan-utama.png)         |
| Manajemen kegiatan | ![Manajemen kegiatan](docs/manajemen-kegiatan.png) |
| Manajemen resource | ![Manajemen resource](docs/manajemen-resource.png) |
| Gantt chart        | ![Gantt chart](docs/gantt-chart.png)               |
| Diagram PERT       | ![Diagram PERT](docs/pert.png)                     |

## 📄 Lisensi

MIT
