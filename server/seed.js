/**
 * Data contoh bawaan (seed) untuk Mini Gantt Project.
 *
 * Dipakai oleh endpoint POST /api/seed dan unit test (sebagai fixture
 * perhitungan critical path). Semua dependensi kecuali dinyatakan lain
 * bertipe FS dengan delay 0.
 */
'use strict';

const { recalcProjectSchedule } = require('./logic/schedule');

const COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ab'];

/**
 * Contoh 1 — "Sistem Informasi Kelola Pemberkasan" (kegiatan A-J).
 * Hasil: jalur A-D-H-J = 30, B-E-H-J = 33, B-F-J = 9, C-G-I-J = 20;
 * critical path B-E-H-J dengan total 33 hari kerja.
 */
const SAMPLE_ABJAK = {
  name: 'Sistem Informasi Kelola Pemberkasan',
  organization: 'PT XZ',
  description: 'Contoh penjadwalan 10 kegiatan (kode A-J) dengan dependensi FS.',
  startDate: '2026-07-01',
  weekendDays: [0, 6],
  weekendMode: 'off',
  holidays: [],
  tasks: [
    { code: 'A', name: 'Analisis kebutuhan', duration: 1, predecessors: [] },
    { code: 'B', name: 'Pemodelan sistem', duration: 2, predecessors: [] },
    { code: 'C', name: 'Analisis kebutuhan hardware', duration: 3, predecessors: [] },
    { code: 'D', name: 'Pengadaan & instalasi DBMS', duration: 5, predecessors: ['A'] },
    { code: 'E', name: 'Desain input/output/database', duration: 7, predecessors: ['B'] },
    { code: 'F', name: 'Pelatihan', duration: 4, predecessors: ['B'] },
    { code: 'G', name: 'Pengadaan hardware', duration: 12, predecessors: ['C'] },
    { code: 'H', name: 'Programming', duration: 21, predecessors: ['D', 'E'] },
    { code: 'I', name: 'Instalasi hardware', duration: 2, predecessors: ['G'] },
    { code: 'J', name: 'Implementasi', duration: 3, predecessors: ['F', 'H', 'I'] },
  ].map((t, i) => ({ ...t, color: COLORS[i % COLORS.length] })),
  resources: [],
  assignments: {},
};

/**
 * Contoh 2 — 6 tahap SDLC dengan dependensi SS + delay, libur custom
 * 17 Juli, dan 7 anggota tim (1 Project Manager, 2 Analis, 2 Programmer,
 * 2 Tester). Proyek mulai 30 Juni 2026.
 */
const SAMPLE_SDLC = {
  name: 'Pengembangan Sistem SDLC (Contoh)',
  organization: 'PT XZ',
  description: 'Enam tahap SDLC: dependensi SS + delay, libur 17 Juli, dan 7 anggota tim.',
  startDate: '2026-06-30',
  weekendDays: [0, 6],
  weekendMode: 'off',
  holidays: [
    { date: '2026-07-17', label: 'Libur Nasional (contoh)', type: 'one_off' },
  ],
  tasks: [
    { code: 'A', name: 'Analisis Kebutuhan', duration: 5, predecessors: [] },
    { code: 'B', name: 'Analisis Sistem', duration: 8, predecessors: [{ code: 'A', type: 'SS', delay: 3 }] },
    { code: 'C', name: 'Perancangan', duration: 7, predecessors: [{ code: 'B', type: 'SS', delay: 5 }] },
    { code: 'D', name: 'Implementasi', duration: 5, predecessors: ['C'] },
    { code: 'E', name: 'Pengujian', duration: 2, predecessors: ['D'] },
    { code: 'F', name: 'Deployment & Maintenance', duration: 2, predecessors: ['E'] },
  ].map((t, i) => ({ ...t, color: COLORS[i % COLORS.length] })),
  resources: [
    { name: 'Rani Puspita', email: 'rani@contoh.com', phone: '0811000001', position: 'Project Manager', dailyRate: 1500000 },
    { name: 'Ahmad Fauzi', email: 'ahmad@contoh.com', phone: '0811000002', position: 'Analis', dailyRate: 1000000 },
    { name: 'Dewi Lestari', email: 'dewi@contoh.com', phone: '0811000003', position: 'Analis', dailyRate: 1000000 },
    { name: 'Budi Santoso', email: 'budi@contoh.com', phone: '0811000004', position: 'Programmer', dailyRate: 900000 },
    { name: 'Yoga Pratama', email: 'yoga@contoh.com', phone: '0811000005', position: 'Programmer', dailyRate: 900000 },
    { name: 'Maya Sari', email: 'maya@contoh.com', phone: '0811000006', position: 'Tester', dailyRate: 700000 },
    { name: 'Eko Prasetyo', email: 'eko@contoh.com', phone: '0811000007', position: 'Tester', dailyRate: 700000 },
  ],
  assignments: {
    A: ['Rani Puspita', 'Ahmad Fauzi', 'Dewi Lestari'],
    B: ['Ahmad Fauzi', 'Dewi Lestari'],
    C: ['Budi Santoso', 'Yoga Pratama'],
    D: ['Budi Santoso', 'Yoga Pratama'],
    E: ['Maya Sari', 'Eko Prasetyo'],
    F: ['Rani Puspita', 'Maya Sari'],
  },
};

const SAMPLES = {
  abjak: SAMPLE_ABJAK,
  sdlc: SAMPLE_SDLC,
};

/**
 * Tulis satu data contoh ke database (idempoten: proyek dengan nama sama
 * tidak dibuat ulang). Mengembalikan { created, id, name }.
 */
function seedDatabase(db, sample) {
  const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(sample.name);
  if (existing) return { created: false, id: existing.id, name: sample.name };

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO projects (name, organization, description, start_date, weekend_days, weekend_mode) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        sample.name,
        sample.organization || '',
        sample.description || '',
        sample.startDate,
        JSON.stringify(sample.weekendDays || [0, 6]),
        sample.weekendMode || 'off'
      );
    const projectId = info.lastInsertRowid;

    const insHoliday = db.prepare('INSERT INTO holidays (project_id, date, label, type) VALUES (?, ?, ?, ?)');
    for (const h of sample.holidays || []) insHoliday.run(projectId, h.date, h.label, h.type);

    const idByCode = new Map();
    const insTask = db.prepare(
      'INSERT INTO tasks (project_id, code, name, duration, priority, color) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const t of sample.tasks) {
      const r = insTask.run(projectId, t.code, t.name, t.duration, t.priority || 'sedang', t.color || '#4e79a7');
      idByCode.set(t.code, r.lastInsertRowid);
    }

    const insDep = db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)');
    for (const t of sample.tasks) {
      for (const p of t.predecessors || []) {
        const predCode = typeof p === 'string' ? p : p.code;
        const type = typeof p === 'string' ? 'FS' : (p.type || 'FS');
        const delay = typeof p === 'string' ? 0 : (p.delay || 0);
        insDep.run(idByCode.get(t.code), idByCode.get(predCode), type, delay);
      }
    }

    const idByName = new Map();
    const insRes = db.prepare(
      'INSERT INTO resources (project_id, name, email, phone, position, daily_rate, days_off) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const r of sample.resources || []) {
      const res = insRes.run(
        projectId, r.name, r.email || '', r.phone || '', r.position, r.dailyRate, JSON.stringify(r.daysOff || [])
      );
      idByName.set(r.name, res.lastInsertRowid);
    }

    const insAssign = db.prepare('INSERT INTO assignments (task_id, resource_id) VALUES (?, ?)');
    for (const [code, names] of Object.entries(sample.assignments || {})) {
      for (const nm of names) insAssign.run(idByCode.get(code), idByName.get(nm));
    }

    recalcProjectSchedule(db, projectId); // semua tanggal dihitung otomatis
    return projectId;
  });

  return { created: true, id: tx(), name: sample.name };
}

module.exports = { SAMPLE_ABJAK, SAMPLE_SDLC, SAMPLES, seedDatabase };
