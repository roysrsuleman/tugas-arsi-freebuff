'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeCriticalPath } = require('../server/logic/criticalPath');
const { Calendar, parseISO, toISO } = require('../server/logic/calendar');

const T = (id, code, duration) => ({ id, code, name: `Kegiatan ${code}`, duration });

function cp({ tasks, dependencies = [], startDate = '2026-10-12', holidays = [], weekendDays, weekendMode }) {
  return computeCriticalPath({
    startDate,
    weekendDays: weekendDays || [0, 6],
    weekendMode: weekendMode || 'off',
    holidays,
    tasks,
    dependencies,
  });
}

const byCode = (result) => Object.fromEntries(result.tasks.map((t) => [t.code, t]));

test('rantai FS: semua kegiatan kritis, slack 0', () => {
  const r = cp({
    tasks: [T(1, 'A', 2), T(2, 'B', 2), T(3, 'C', 2)],
    dependencies: [
      { task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 },
      { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 },
    ],
  });
  const t = byCode(r);
  // A: 12-13, B: 14-15, C: 16-19 (lewati weekend)
  assert.deepEqual({ es: t.A.es, ef: t.A.ef, ls: t.A.ls, lf: t.A.lf }, { es: '2026-10-12', ef: '2026-10-13', ls: '2026-10-12', lf: '2026-10-13' });
  assert.deepEqual({ es: t.B.es, ef: t.B.ef, ls: t.B.ls, lf: t.B.lf }, { es: '2026-10-14', ef: '2026-10-15', ls: '2026-10-14', lf: '2026-10-15' });
  assert.deepEqual({ es: t.C.es, ef: t.C.ef, ls: t.C.ls, lf: t.C.lf }, { es: '2026-10-16', ef: '2026-10-19', ls: '2026-10-16', lf: '2026-10-19' });
  assert.equal(t.A.slack, 0);
  assert.equal(t.B.slack, 0);
  assert.equal(t.C.slack, 0);
  assert.ok(r.tasks.every((x) => x.isCritical));

  // Satu jalur A -> B -> C, total 6, critical, durasi proyek 6 hari kerja
  assert.equal(r.paths.length, 1);
  assert.deepEqual(r.paths[0].codes, ['A', 'B', 'C']);
  assert.equal(r.paths[0].total, 6);
  assert.equal(r.paths[0].isCritical, true);
  assert.equal(r.project.durationWorkingDays, 6);
  assert.equal(r.project.endDate, '2026-10-19');
});

test('cabang paralel: jalur terpanjang kritis, yang pendek punya slack', () => {
  const r = cp({
    tasks: [T(1, 'A', 3), T(2, 'B', 10), T(3, 'C', 2)],
    dependencies: [
      { task_id: 3, predecessor_id: 1, type: 'FS', delay: 0 },
      { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 },
    ],
  });
  const t = byCode(r);
  // B: 12-23 Okt (10 hari kerja, 23 = Jumat); C mulai hari kerja berikutnya: 26-27 Okt
  assert.equal(t.B.es, '2026-10-12');
  assert.equal(t.B.ef, '2026-10-23');
  assert.equal(t.C.es, '2026-10-26');
  assert.equal(t.C.ef, '2026-10-27');

  assert.equal(t.B.slack, 0); // kritis
  assert.equal(t.C.slack, 0); // kritis
  assert.equal(t.A.slack, 7); // A bisa mundur 7 hari kerja (12 -> 21)
  assert.equal(t.A.ls, '2026-10-21');
  assert.equal(t.A.lf, '2026-10-23');
  assert.equal(t.A.isCritical, false);

  // Jalur: A-C total 5; B-C total 12 -> B-C critical
  assert.equal(r.paths.length, 2);
  assert.deepEqual(r.paths[0].codes, ['B', 'C']);
  assert.equal(r.paths[0].total, 12);
  assert.equal(r.paths[0].isCritical, true);
  assert.equal(r.paths[1].total, 5);
  assert.equal(r.paths[1].isCritical, false);
  assert.equal(r.maxPathTotal, 12);
  assert.equal(r.project.durationWorkingDays, 12); // 12 Okt .. 25 Okt
});

test('FS + delay: backward pass memakai delay hari kerja', () => {
  const r = cp({
    tasks: [T(1, 'A', 1), T(2, 'B', 1)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'FS', delay: 2 }],
  });
  const t = byCode(r);
  // A 12; B: advance(12, 1+2) = 15 Okt
  assert.equal(t.B.es, '2026-10-15');
  // LF_A = retreat(LS_B=15, 1+2) = 12 -> A tanpa slack
  assert.equal(t.A.lf, '2026-10-12');
  assert.equal(t.A.ls, '2026-10-12');
  assert.equal(t.A.slack, 0);
  assert.equal(t.B.slack, 0);
  // Jalur A -> B total estimasi = 1 + 1 = 2; rentang kalender 4 hari kerja (ada jeda delay)
  assert.equal(r.paths[0].total, 2);
  assert.equal(r.paths[0].elapsedWorkingDays, 4);
});

test('dependensi SS: penerus bisa memiliki slack', () => {
  const r = cp({
    tasks: [T(1, 'A', 5), T(2, 'B', 3)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'SS', delay: 0 }],
  });
  const t = byCode(r);
  // A: 12-16 (dur 5), B mulai bersamaan: 12-14; akhir proyek = 16 Okt
  assert.equal(t.A.ef, '2026-10-16');
  assert.equal(t.B.es, '2026-10-12');
  assert.equal(t.B.ef, '2026-10-14');
  assert.equal(t.A.slack, 0); // menentukan akhir proyek
  assert.equal(t.B.lf, '2026-10-16'); // boleh selesai sampai akhir proyek
  assert.equal(t.B.ls, '2026-10-14');
  assert.equal(t.B.slack, 2); // 12 -> 14 bisa digeser 2 hari kerja
});

test('backward pass melewati weekend dan hari libur', () => {
  const r = cp({
    tasks: [T(1, 'A', 1), T(2, 'B', 3)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 }],
    holidays: [{ date: '2026-10-13', label: 'Libur', type: 'one_off' }],
  });
  const t = byCode(r);
  // A 12; B: 14,15,16 (13 libur) -> LF_A = retreat(LS_B=14, 1) = 12 (13 libur dilewati)
  assert.equal(t.B.es, '2026-10-14');
  assert.equal(t.A.lf, '2026-10-12');
  assert.equal(t.A.slack, 0);
});

test('multi penerus: LF = ambil yang paling ketat (paling awal)', () => {
  const r = cp({
    tasks: [T(1, 'A', 2), T(2, 'B', 5), T(3, 'C', 1)],
    dependencies: [
      { task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 }, // B: 14-20
      { task_id: 3, predecessor_id: 1, type: 'FS', delay: 3 }, // C: advance(13, 1+3)=20
    ],
  });
  const t = byCode(r);
  // A 12-13; B 14-20 (14,15,16,19,20); C: advance(13, 1+3) = 19 Okt
  assert.equal(t.C.es, '2026-10-19');
  // LF_A = min(retreat(LS_B, 1), retreat(LS_C, 1+3))
  // LF_B = 20 -> LS_B = 14; retreat(14, 1) = 13
  // LF_C = 20 -> LS_C = 20; retreat(20, 4) = 14 -> ambil paling awal = 13
  assert.equal(t.A.lf, '2026-10-13');
  assert.equal(t.A.slack, 0);
  assert.equal(t.B.slack, 0); // B mendesak A -> kritis
  assert.equal(t.C.slack, 1); // C masih bisa mundur 1 hari kerja
});

test('proyek tanpa dependensi: tiap kegiatan jalur sendiri', () => {
  const r = cp({ tasks: [T(1, 'A', 2), T(2, 'B', 4)] });
  assert.equal(r.paths.length, 2);
  assert.equal(r.maxPathTotal, 4);
  const t = byCode(r);
  assert.equal(t.B.slack, 0);
  assert.equal(t.A.slack, 2); // A selesai 13, akhir proyek 16 -> slack 2 hari kerja (12..15?)
  assert.equal(r.project.durationWorkingDays, 4);
});

test('tanpa kegiatan hasil kosong', () => {
  const r = cp({ tasks: [] });
  assert.deepEqual(r.tasks, []);
  assert.deepEqual(r.paths, []);
  assert.equal(r.project.durationWorkingDays, 0);
});

test('retreatWorkingDays adalah kebalikan advanceWorkingDays', () => {
  const cal = new Calendar({ holidays: [{ date: '2026-10-15', label: 'Libur', type: 'one_off' }] });
  const tanggal = parseISO('2026-10-23'); // Jumat
  for (let n = 0; n <= 5; n += 1) {
    const maju = cal.advanceWorkingDays(tanggal, n);
    assert.equal(toISO(cal.retreatWorkingDays(maju, n)), toISO(tanggal));
  }
  assert.throws(() => cal.retreatWorkingDays(tanggal, -1), /Langkah tidak valid/);
});
