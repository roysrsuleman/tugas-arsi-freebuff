# PROGRESS — Mini Gantt Project

Checklist tahapan pengembangan. **Baca file ini di awal setiap sesi dan lanjutkan dari
tahap pertama yang belum dicentang.** Jangan mengulang tahap yang sudah selesai.

## Checklist Tahapan

- [x] 1. Setup proyek (struktur folder, package.json, .gitignore, database SQLite)
- [x] 2. Logika penjadwalan: kalender kerja (weekend & libur) + hitung tanggal mulai/selesai
- [x] 3. Dependensi FS/SS + delay, perhitungan ulang otomatis, deteksi circular dependency
- [ ] 4. Critical path (forward/backward pass, tabel semua jalur)
- [ ] 5. Unit test logika (kalender, dependensi, critical path) dan lulus semua
- [ ] 6. REST API: CRUD proyek, kegiatan, resource, penugasan + validasi
- [ ] 7. Frontend: manajemen proyek, kegiatan, resource
- [ ] 8. Frontend: Gantt chart + highlight critical path
- [ ] 9. Frontend: diagram PERT
- [ ] 10. Data contoh (A-J dan PT XZ) + verifikasi hasil 33 hari
- [ ] 11. Pengujian menyeluruh & perbaikan bug
- [ ] 12. README (instalasi, fitur, placeholder screenshot)

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

## Sesi

- **Sesi 1 (Prompt 1 — Fitur 1-3):** mengerjakan tahap yang terkait fitur Proyek,
  Kegiatan, dan Resource beserta struktur proyeknya. Tahap lain dibiarkan `[ ]`
  sampai prompt berikutnya.
