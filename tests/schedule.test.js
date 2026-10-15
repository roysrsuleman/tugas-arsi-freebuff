'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSchedule, topoSort, CircularDependencyError, recalcProjectSchedule } = require('../server/logic/schedule');
const { openDatabase } = require('../server/db');

/** Helper: jadwal dengan proyek mulai Senin 2026-10-12, weekend Sab/Min. */
function schedule({ tasks, dependencies = [], startDate = '2026-10-12', holidays = [], weekendDays, weekendMode }) {
  return computeSchedule({
    startDate,
    weekendDays: weekendDays || [0, 6],
    weekendMode: weekendMode || 'off',
    holidays,
    tasks,
    dependencies,
  }).schedule;
}

const T = (id, code, duration) => ({ id, code, duration });

test('kegiatan akar mulai dari tanggal proyek (digeser ke hari kerja)', () => {
  const s = schedule({ tasks: [T(1, 'A', 3)] });
  assert.deepEqual(s.get(1), { start: '2026-10-12', end: '2026-10-14' }); // Sen-Sel-Rab
});

test('kegiatan akar digeser jika tanggal proyek hari non-kerja', () => {
  const s = schedule({ tasks: [T(1, 'A', 2)], startDate: '2026-10-17' }); // Sabtu
  assert.deepEqual(s.get(1), { start: '2026-10-19', end: '2026-10-20' }); // Sen-Sel
});

test('durasi melewati weekend: hari libur tidak dihitung', () => {
  const s = schedule({ tasks: [T(1, 'A', 7)] });
  // Senin + 7 hari kerja -> Selasa minggu berikutnya
  assert.deepEqual(s.get(1), { start: '2026-10-12', end: '2026-10-20' });
});

test('durasi melewati hari libur custom', () => {
  const s = schedule({
    tasks: [T(1, 'A', 5)],
    holidays: [{ date: '2026-10-14', label: 'Libur', type: 'one_off' }],
  });
  // Sen(1), Sel(2), Rab LIBUR, Kam(3), Jum(4), Sen(5) -> 2026-10-19
  assert.deepEqual(s.get(1), { start: '2026-10-12', end: '2026-10-19' });
});

test('FS: kegiatan mulai setelah pendahulu selesai', () => {
  const s = schedule({
    tasks: [T(1, 'A', 3), T(2, 'B', 2)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 }],
  });
  // A: 12-14 Okt, B mulai hari kerja setelah 14 Okt = 15 Okt
  assert.deepEqual(s.get(1), { start: '2026-10-12', end: '2026-10-14' });
  assert.deepEqual(s.get(2), { start: '2026-10-15', end: '2026-10-16' });
});

test('FS + delay: delay dihitung dalam hari kerja', () => {
  const s = schedule({
    tasks: [T(1, 'A', 3), T(2, 'B', 1)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'FS', delay: 2 }],
  });
  // A: 12-14 Okt (Sen-Rab); mulai default = 15 Okt; +2 hari kerja delay = 16, 19
  assert.equal(s.get(2).start, '2026-10-19');
});

test('SS: kegiatan mulai bersamaan dengan pendahulu', () => {
  const s = schedule({
    tasks: [T(1, 'A', 5), T(2, 'B', 2)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'SS', delay: 0 }],
  });
  assert.equal(s.get(2).start, s.get(1).start);
  assert.deepEqual(s.get(2), { start: '2026-10-12', end: '2026-10-13' });
});

test('SS + delay: mulai mundur delay hari kerja dari mulai pendahulu', () => {
  const s = schedule({
    tasks: [T(1, 'A', 5), T(2, 'B', 2)],
    dependencies: [{ task_id: 2, predecessor_id: 1, type: 'SS', delay: 2 }],
  });
  // A mulai Sen 12; +2 hari kerja = Rab 14
  assert.equal(s.get(2).start, '2026-10-14');
});

test('beberapa pendahulu: diambil tanggal mulai paling akhir', () => {
  const s = schedule({
    tasks: [T(1, 'A', 1), T(2, 'B', 5), T(3, 'C', 2)],
    dependencies: [
      { task_id: 3, predecessor_id: 1, type: 'FS', delay: 0 }, // C >= 13 Okt
      { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 }, // C >= 19 Okt (A selesai 12, B 12-16)
    ],
  });
  // A: 12, B: 12-16 (Sen-Jum), C mulai setelah B: Sen 19
  assert.equal(s.get(3).start, '2026-10-19');
});

test('rantai A -> B -> C dihitung berurutan (topological)', () => {
  const s = schedule({
    tasks: [T(1, 'A', 2), T(2, 'B', 2), T(3, 'C', 2)],
    dependencies: [
      { task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 },
      { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 },
    ],
  });
  assert.deepEqual(s.get(1), { start: '2026-10-12', end: '2026-10-13' });
  assert.deepEqual(s.get(2), { start: '2026-10-14', end: '2026-10-15' });
  assert.deepEqual(s.get(3), { start: '2026-10-16', end: '2026-10-19' });
});

test('dependensi SS berantai dengan FS dicampur', () => {
  const s = schedule({
    tasks: [T(1, 'A', 4), T(2, 'B', 3), T(3, 'C', 2)],
    dependencies: [
      { task_id: 2, predecessor_id: 1, type: 'SS', delay: 1 }, // B mulai Sel 13
      { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 }, // C mulai setelah B selesai
    ],
  });
  assert.equal(s.get(2).start, '2026-10-13');
  assert.deepEqual(s.get(2), { start: '2026-10-13', end: '2026-10-15' });
  assert.equal(s.get(3).start, '2026-10-16');
});

test('mengubah durasi pendahulu memengaruhi penerusnya (hitung ulang)', () => {
  const tasks = [T(1, 'A', 2), T(2, 'B', 2)];
  const dependencies = [{ task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 }];
  const before = schedule({ tasks, dependencies });
  assert.equal(before.get(2).start, '2026-10-14');

  const after = schedule({
    tasks: [T(1, 'A', 4), T(2, 'B', 2)], // durasi A diperpanjang
    dependencies,
  });
  assert.equal(after.get(1).end, '2026-10-15');
  assert.equal(after.get(2).start, '2026-10-16');
});

test('dependensi melingkar A -> B -> A menghasilkan CircularDependencyError', () => {
  assert.throws(
    () => schedule({
      tasks: [T(1, 'A', 1), T(2, 'B', 1)],
      dependencies: [
        { task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 },
        { task_id: 1, predecessor_id: 2, type: 'FS', delay: 0 },
      ],
    }),
    (err) => {
      assert.ok(err instanceof CircularDependencyError);
      assert.match(err.message, /melingkar/);
      assert.match(err.message, /A/);
      assert.match(err.message, /B/);
      return true;
    }
  );
});

test('siklus panjang A -> B -> C -> A terdeteksi', () => {
  assert.throws(
    () => schedule({
      tasks: [T(1, 'A', 1), T(2, 'B', 1), T(3, 'C', 1)],
      dependencies: [
        { task_id: 2, predecessor_id: 1, type: 'FS', delay: 0 },
        { task_id: 3, predecessor_id: 2, type: 'FS', delay: 0 },
        { task_id: 1, predecessor_id: 3, type: 'SS', delay: 0 },
      ],
    }),
    CircularDependencyError
  );
});

test('diri sendiri ditolak', () => {
  assert.throws(
    () => schedule({
      tasks: [T(1, 'A', 1)],
      dependencies: [{ task_id: 1, predecessor_id: 1, type: 'FS', delay: 0 }],
    }),
    /dirinya sendiri/
  );
});

test('pendahulu yang tidak ada ditolak', () => {
  assert.throws(
    () => schedule({
      tasks: [T(1, 'A', 1)],
      dependencies: [{ task_id: 1, predecessor_id: 99, type: 'FS', delay: 0 }],
    }),
    /tidak ditemukan/
  );
});

test('durasi tidak valid ditolak', () => {
  assert.throws(() => schedule({ tasks: [T(1, 'A', 0)] }), /Durasi/);
});

test('topoSort mengembalikan pendahulu sebelum penerus', () => {
  const tasks = [T(3, 'C', 1), T(1, 'A', 1), T(2, 'B', 1)];
  const deps = [
    { task_id: 2, predecessor_id: 1 },
    { task_id: 3, predecessor_id: 2 },
  ];
  assert.deepEqual(topoSort(tasks, deps), [1, 2, 3]);
});

test('weekend mode "work": semua hari dihitung', () => {
  const s = schedule({
    tasks: [T(1, 'A', 4)],
    weekendMode: 'work',
    startDate: '2026-10-16', // Jumat
  });
  // Jum, Sab, Min, Sen -> selesai Senin 19
  assert.deepEqual(s.get(1), { start: '2026-10-16', end: '2026-10-19' });
});

// --- Integrasi dengan database (in-memory) ---

function setupDb() {
  const db = openDatabase(':memory:');
  const projectId = db
    .prepare("INSERT INTO projects (name, start_date) VALUES ('Proyek Uji', '2026-10-12')")
    .run().lastInsertRowid;
  const a = db
    .prepare("INSERT INTO tasks (project_id, code, name, duration) VALUES (?, 'A', 'Kegiatan A', 2)")
    .run(projectId).lastInsertRowid;
  const b = db
    .prepare("INSERT INTO tasks (project_id, code, name, duration) VALUES (?, 'B', 'Kegiatan B', 2)")
    .run(projectId).lastInsertRowid;
  return { db, projectId, a, b };
}

test('recalcProjectSchedule menulis tanggal ke database', () => {
  const { db, projectId, a, b } = setupDb();
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, 0)')
    .run(b, a, 'FS');

  recalcProjectSchedule(db, projectId);
  const rows = db.prepare('SELECT id, start_date, end_date FROM tasks ORDER BY id').all();
  assert.deepEqual(
    rows.map((r) => [r.start_date, r.end_date]),
    [['2026-10-12', '2026-10-13'], ['2026-10-14', '2026-10-15']]
  );
  db.close();
});

test('mengubah durasi di database lalu recalc memperbarui penerus', () => {
  const { db, projectId, a, b } = setupDb();
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, 0)')
    .run(b, a, 'FS');
  recalcProjectSchedule(db, projectId);

  db.prepare('UPDATE tasks SET duration = 4 WHERE id = ?').run(a);
  recalcProjectSchedule(db, projectId);

  const taskB = db.prepare('SELECT start_date, end_date FROM tasks WHERE id = ?').get(b);
  assert.equal(taskB.start_date, '2026-10-16'); // setelah A selesai 15 Okt
  db.close();
});

test('recalc membalikkan transaksi ketika dependensi melingkar', () => {
  const { db, projectId, a, b } = setupDb();
  // buat siklus A -> B -> A di database
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, 0)')
    .run(b, a, 'FS');
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, 0)')
    .run(a, b, 'FS');

  assert.throws(() => {
    const tx = db.transaction((id) => recalcProjectSchedule(db, id));
    tx(projectId);
  }, CircularDependencyError);
  db.close();
});
