'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeCriticalPath } = require('../server/logic/criticalPath');
const { openDatabase } = require('../server/db');
const { SAMPLE_ABJAK, SAMPLE_SDLC, seedDatabase } = require('../server/seed');

/** Ubah definisi sample menjadi input computeCriticalPath (id-based). */
function sampleToCpInput(sample) {
  const idByCode = new Map(sample.tasks.map((t, i) => [t.code, i + 1]));
  const tasks = sample.tasks.map((t, i) => ({
    id: i + 1,
    code: t.code,
    name: t.name,
    duration: t.duration,
  }));
  const dependencies = [];
  for (const t of sample.tasks) {
    for (const p of t.predecessors || []) {
      const predCode = typeof p === 'string' ? p : p.code;
      dependencies.push({
        task_id: idByCode.get(t.code),
        predecessor_id: idByCode.get(predCode),
        type: typeof p === 'string' ? 'FS' : (p.type || 'FS'),
        delay: typeof p === 'string' ? 0 : (p.delay || 0),
      });
    }
  }
  return {
    startDate: sample.startDate,
    weekendDays: sample.weekendDays,
    weekendMode: sample.weekendMode,
    holidays: sample.holidays,
    tasks,
    dependencies,
  };
}

// ===================== Contoh 1: kegiatan A-J =====================

test('data contoh A-J: jalur A-D-H-J=30, B-E-H-J=33, B-F-J=9, C-G-I-J=20', () => {
  const r = computeCriticalPath(sampleToCpInput(SAMPLE_ABJAK));

  assert.equal(r.paths.length, 4);
  const totalOf = (codes) => {
    const p = r.paths.find((x) => x.codes.join('-') === codes);
    assert.ok(p, `jalur ${codes} harus ada`);
    return p.total;
  };
  assert.equal(totalOf('A-D-H-J'), 30);
  assert.equal(totalOf('B-E-H-J'), 33);
  assert.equal(totalOf('B-F-J'), 9);
  assert.equal(totalOf('C-G-I-J'), 20);
});

test('data contoh A-J: critical path B-E-H-J dengan total 33 hari', () => {
  const r = computeCriticalPath(sampleToCpInput(SAMPLE_ABJAK));

  assert.equal(r.maxPathTotal, 33);
  const criticalPaths = r.paths.filter((p) => p.isCritical);
  assert.equal(criticalPaths.length, 1);
  assert.deepEqual(criticalPaths[0].codes, ['B', 'E', 'H', 'J']);
  assert.equal(criticalPaths[0].total, 33);

  // Total durasi proyek (makespan) juga 33 hari kerja: 1 Jul - 14 Agu 2026
  assert.equal(r.project.durationWorkingDays, 33);
  assert.equal(r.project.startDate, '2026-07-01');
  assert.equal(r.project.endDate, '2026-08-14');

  // Kegiatan kritis (slack = 0) tepat B, E, H, J
  const criticalCodes = r.tasks.filter((t) => t.isCritical).map((t) => t.code).sort();
  assert.deepEqual(criticalCodes, ['B', 'E', 'H', 'J']);

  // Tanggal yang sudah diketahui
  const byCode = Object.fromEntries(r.tasks.map((t) => [t.code, t]));
  assert.equal(byCode.J.es, '2026-08-12'); // setelah H selesai 11 Agu
  assert.equal(byCode.H.es, '2026-07-14'); // menunggu E selesai 13 Jul
});

test('seedDatabase A-J: tersimpan, tanggal terhitung, idempoten', () => {
  const db = openDatabase(':memory:');
  const res = seedDatabase(db, SAMPLE_ABJAK);
  assert.equal(res.created, true);

  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks').get().n, 10);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM dependencies').get().n, 10);
  const j = db.prepare("SELECT * FROM tasks WHERE code = 'J'").get();
  assert.equal(j.end_date, '2026-08-14');

  // Muat ulang: proyek dengan nama sama tidak dibuat dua kali
  const again = seedDatabase(db, SAMPLE_ABJAK);
  assert.equal(again.created, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM projects').get().n, 1);
  db.close();
});

// ===================== Contoh 2: 6 tahap SDLC =====================

test('data contoh SDLC: SS + delay menggeser jadwal, libur 17 Juli dilewati', () => {
  const r = computeCriticalPath(sampleToCpInput(SAMPLE_SDLC));
  const byCode = Object.fromEntries(r.tasks.map((t) => [t.code, t]));

  // A: 30 Jun - 6 Jul (5 hari kerja)
  assert.equal(byCode.A.es, '2026-06-30');
  assert.equal(byCode.A.ef, '2026-07-06');
  // B: SS A +3 hari kerja -> mulai 3 Jul, durasi 8 -> selesai 14 Jul
  assert.equal(byCode.B.es, '2026-07-03');
  assert.equal(byCode.B.ef, '2026-07-14');
  // C: SS B +5 hari kerja -> mulai 10 Jul, durasi 7 -> 17 Jul libur, selesai 21 Jul
  assert.equal(byCode.C.es, '2026-07-10');
  assert.equal(byCode.C.ef, '2026-07-21');
  // Rantai FS setelahnya: D 22-28 Jul, E 29-30 Jul, F 31 Jul - 3 Agu
  assert.equal(byCode.D.ef, '2026-07-28');
  assert.equal(byCode.E.ef, '2026-07-30');
  assert.equal(byCode.F.ef, '2026-08-03');

  // Durasi proyek (makespan) = 24 hari kerja (30 Jun - 3 Agu)
  assert.equal(r.project.durationWorkingDays, 24);

  // Jalur A->B->C->D->E->F adalah jalur tunggal, total estimasi 29
  assert.equal(r.paths.length, 1);
  assert.deepEqual(r.paths[0].codes, ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(r.paths[0].total, 29);
});

test('seedDatabase SDLC: tim lengkap (1 PM, 2 analis, 2 programmer, 2 tester) + penugasan', () => {
  const db = openDatabase(':memory:');
  const res = seedDatabase(db, SAMPLE_SDLC);
  assert.equal(res.created, true);

  // Kalender: weekend Sab-Minggu + libur custom 17 Juli
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(res.id);
  assert.equal(JSON.parse(project.weekend_days).length, 2);
  const holiday = db.prepare('SELECT * FROM holidays').get();
  assert.equal(holiday.date, '2026-07-17');
  assert.equal(holiday.type, 'one_off');

  // 7 resource dengan komposisi sesuai
  const resources = db.prepare('SELECT * FROM resources ORDER BY id').all();
  assert.equal(resources.length, 7);
  const posCount = resources.reduce((acc, r) => ({ ...acc, [r.position]: (acc[r.position] || 0) + 1 }), {});
  assert.equal(posCount['Project Manager'], 1);
  assert.equal(posCount['Analis'], 2);
  assert.equal(posCount['Programmer'], 2);
  assert.equal(posCount['Tester'], 2);

  // Penugasan: A(3) + B(2) + C(2) + D(2) + E(2) + F(2) = 13 penugasan
  assert.equal(db.prepare('SELECT COUNT(*) n FROM assignments').get().n, 13);
  const taskA = db.prepare("SELECT id FROM tasks WHERE code = 'A'").get();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM assignments WHERE task_id = ?').get(taskA.id).n, 3);

  // Tanggal terhitung & jadwal tersimpan
  const b = db.prepare("SELECT * FROM tasks WHERE code = 'B'").get();
  assert.equal(b.start_date, '2026-07-03');
  db.close();
});
