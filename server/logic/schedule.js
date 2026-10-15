/**
 * Logika penjadwalan kegiatan:
 * - urutan topologis (Kahn) + deteksi circular dependency
 * - dependensi Finish-Start (FS) dan Start-Start (SS) + delay (hari kerja)
 * - perhitungan ulang otomatis seluruh kegiatan dalam satu proyek
 *
 * Tanggal mulai/selesai selalu dihitung dalam HARI KERJA:
 * weekend & hari libur dilewati dan tidak dihitung sebagai durasi.
 */
'use strict';

const { Calendar, parseISO, toISO } = require('./calendar');

/** Error ketika graph dependensi mengandung siklus. */
class CircularDependencyError extends Error {
  /**
   * @param {number[]} cycle id kegiatan berurutan membentuk siklus
   * @param {Map<number,string>} codeMap id -> kode kegiatan
   */
  constructor(cycle, codeMap = new Map()) {
    const names = cycle.map((id) => codeMap.get(id) || `#${id}`);
    super(`Dependensi melingkar (circular) terdeteksi: ${names.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Urutkan kegiatan (topological sort, algoritma Kahn).
 * @param {Array<{id:number}>} tasks
 * @param {Array<{task_id:number, predecessor_id:number}>} dependencies
 * @returns {number[]} id kegiatan berurutan (pendahulu selalu sebelum penerus)
 * @throws {CircularDependencyError} jika ada siklus
 */
function topoSort(tasks, dependencies) {
  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const next = new Map(ids.map((id) => [id, []])); // predecessor -> [successor]
  const prev = new Map(ids.map((id) => [id, []])); // successor -> [predecessor]

  for (const dep of dependencies) {
    if (!idSet.has(dep.task_id) || !idSet.has(dep.predecessor_id)) continue;
    if (dep.task_id === dep.predecessor_id) {
      throw new Error('Kegiatan tidak bisa bergantung pada dirinya sendiri');
    }
    indegree.set(dep.task_id, indegree.get(dep.task_id) + 1);
    next.get(dep.predecessor_id).push(dep.task_id);
    prev.get(dep.task_id).push(dep.predecessor_id);
  }

  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const succ of next.get(id)) {
      indegree.set(succ, indegree.get(succ) - 1);
      if (indegree.get(succ) === 0) queue.push(succ);
    }
  }

  if (order.length !== ids.length) {
    const remaining = new Set(ids.filter((id) => !order.includes(id)));
    throw new CircularDependencyError(findCycle(remaining, prev), codeMapOf(tasks));
  }
  return order;
}

function codeMapOf(tasks) {
  return new Map(tasks.map((t) => [t.id, t.code || `#${t.id}`]));
}

/** Cari satu siklus di antara node yang tersisa (dengan mengikuti edge pendahulu). */
function findCycle(remaining, prev) {
  const start = remaining.values().next().value;
  const path = [];
  const index = new Map();
  let cur = start;
  while (cur !== undefined && !index.has(cur)) {
    index.set(cur, path.length);
    path.push(cur);
    const predecessors = prev.get(cur) || [];
    cur = predecessors.find((p) => remaining.has(p));
  }
  const cycle = path.slice(index.get(cur));
  cycle.push(cur);
  return cycle;
}

/**
 * Hitung jadwal seluruh kegiatan.
 *
 * @param {object} input
 * @param {string} input.startDate       tanggal mulai proyek (YYYY-MM-DD)
 * @param {number[]} input.weekendDays   hari weekend (0=Minggu..6=Sabtu)
 * @param {'off'|'work'} input.weekendMode
 * @param {Array<{date:string,label?:string,type?:string}>} [input.holidays]
 * @param {Array<{id:number,code:string,duration:number}>} input.tasks
 * @param {Array<{task_id:number,predecessor_id:number,type?:string,delay?:number}>} input.dependencies
 * @returns {{order:number[], schedule:Map<number,{start:string,end:string}>}}
 * @throws {CircularDependencyError} jika dependensi melingkar
 */
function computeSchedule({
  startDate,
  weekendDays = [0, 6],
  weekendMode = 'off',
  holidays = [],
  tasks,
  dependencies = [],
}) {
  const calendar = new Calendar({ weekendDays, weekendMode, holidays });
  const projectStart = parseISO(startDate);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const t of tasks) {
    if (!Number.isInteger(t.duration) || t.duration < 1) {
      throw new Error(`Durasi kegiatan "${t.code || t.id}" tidak valid (harus >= 1 hari kerja)`);
    }
  }
  for (const dep of dependencies) {
    if (dep.task_id === dep.predecessor_id) {
      const t = byId.get(dep.task_id);
      throw new Error(`Kegiatan "${t ? t.code || t.id : dep.task_id}" tidak bisa bergantung pada dirinya sendiri`);
    }
    if (!byId.has(dep.predecessor_id)) {
      throw new Error(`Pendahulu #${dep.predecessor_id} tidak ditemukan untuk kegiatan #${dep.task_id}`);
    }
  }

  const order = topoSort(tasks, dependencies);

  const predsOf = new Map(tasks.map((t) => [t.id, []]));
  for (const dep of dependencies) predsOf.get(dep.task_id).push(dep);

  const schedule = new Map();
  for (const id of order) {
    const task = byId.get(id);
    const preds = predsOf.get(id);

    let start;
    if (preds.length === 0) {
      // Kegiatan akar: mulai dari tanggal mulai proyek (digeser ke hari kerja).
      start = calendar.nextWorkingDayOnOrAfter(projectStart);
    } else {
      const candidates = preds.map((dep) => {
        const pred = schedule.get(dep.predecessor_id);
        const delay = Number.isInteger(dep.delay) && dep.delay >= 0 ? dep.delay : 0;
        if (dep.type === 'SS') {
          // SS: mulai bersamaan dengan pendahulu (+ delay hari kerja)
          return calendar.advanceWorkingDays(parseISO(pred.start), delay);
        }
        // FS (default): mulai setelah pendahulu selesai (+ delay hari kerja)
        return calendar.advanceWorkingDays(parseISO(pred.end), 1 + delay);
      });
      // Beberapa pendahulu: ambil tanggal mulai paling akhir.
      const latest = candidates.reduce((a, b) => (b > a ? b : a));
      start = calendar.isWorkingDay(latest)
        ? latest
        : calendar.nextWorkingDayOnOrAfter(latest);
    }

    const end = calendar.endDateFor(start, task.duration);
    schedule.set(id, { start: toISO(start), end: toISO(end) });
  }

  return { order, schedule };
}

/**
 * Recalculate seluruh tanggal kegiatan dalam satu proyek dan tulis ke database.
 * Panggil di dalam transaksi.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} projectId
 * @returns {Map<number,{start:string,end:string}>} jadwal baru
 * @throws {CircularDependencyError} jika dependensi melingkar (transaksi gagal)
 */
function recalcProjectSchedule(db, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error(`Proyek #${projectId} tidak ditemukan`);

  const holidays = db.prepare('SELECT * FROM holidays WHERE project_id = ?').all(projectId);
  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
  const dependencies = db
    .prepare(
      `SELECT d.* FROM dependencies d
       JOIN tasks t ON t.id = d.task_id
       WHERE t.project_id = ?`
    )
    .all(projectId);

  const { schedule } = computeSchedule({
    startDate: project.start_date,
    weekendDays: JSON.parse(project.weekend_days || '[0,6]'),
    weekendMode: project.weekend_mode || 'off',
    holidays: holidays.map((h) => ({ date: h.date, label: h.label, type: h.type })),
    tasks,
    dependencies,
  });

  const update = db.prepare(
    "UPDATE tasks SET start_date = ?, end_date = ?, updated_at = datetime('now') WHERE id = ?"
  );
  for (const [id, dates] of schedule) update.run(dates.start, dates.end, id);

  return schedule;
}

module.exports = {
  computeSchedule,
  recalcProjectSchedule,
  topoSort,
  CircularDependencyError,
};
