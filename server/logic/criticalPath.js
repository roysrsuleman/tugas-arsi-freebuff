/**
 * Critical Path Method (CPM) untuk Mini Gantt Project.
 *
 * - Forward pass : ES (earliest start) & EF (earliest finish) diambil dari
 *                  jadwal otomatis (sudah memakai kalender kerja).
 * - Backward pass: LF (latest finish) & LS (latest start) dihitung mundur
 *                  dari akhir proyek melalui dependensi FS/SS + delay.
 * - Slack        : jumlah hari kerja yang bisa digeser tanpa menggeser
 *                  akhir proyek. Slack = 0 -> kegiatan KRITIS.
 * - Jalur        : seluruh lintasan sumber -> akhir, dengan total estimasi
 *                  durasi (jumlah durasi kegiatan pada jalur). Jalur dengan
 *                  total terpanjang ditandai sebagai critical path.
 *
 * Semua perhitungan dalam HARI KERJA (weekend & hari libur dilewati).
 */
'use strict';

const { Calendar, parseISO, toISO } = require('./calendar');
const { computeSchedule } = require('./schedule');

/** Batas jumlah jalur yang didaftar (graf sangat padat). */
const MAX_PATHS = 500;

/**
 * @param {object} input
 * @param {string} input.startDate
 * @param {number[]} [input.weekendDays]
 * @param {'off'|'work'} [input.weekendMode]
 * @param {Array<{date:string,label?:string,type?:string}>} [input.holidays]
 * @param {Array<{id:number,code:string,name?:string,duration:number}>} input.tasks
 * @param {Array<{task_id:number,predecessor_id:number,type?:string,delay?:number}>} [input.dependencies]
 */
function computeCriticalPath({
  startDate,
  weekendDays = [0, 6],
  weekendMode = 'off',
  holidays = [],
  tasks = [],
  dependencies = [],
}) {
  if (!tasks.length) {
    return {
      project: { startDate: null, endDate: null, durationWorkingDays: 0 },
      tasks: [],
      paths: [],
      maxPathTotal: 0,
      truncatedPaths: false,
    };
  }

  const calendar = new Calendar({ weekendDays, weekendMode, holidays });

  // Forward pass (tanggal tercepat) -- konsisten dengan penjadwalan utama.
  const { order, schedule } = computeSchedule({
    startDate, weekendDays, weekendMode, holidays, tasks, dependencies,
  });

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const es = new Map();
  const ef = new Map();
  for (const t of tasks) {
    es.set(t.id, parseISO(schedule.get(t.id).start));
    ef.set(t.id, parseISO(schedule.get(t.id).end));
  }

  const projectEnd = tasks.reduce((m, t) => (ef.get(t.id) > m ? ef.get(t.id) : m), ef.get(tasks[0].id));
  const projectStart = tasks.reduce((m, t) => (es.get(t.id) < m ? es.get(t.id) : m), es.get(tasks[0].id));

  // Graf dependensi
  const predsOf = new Map(tasks.map((t) => [t.id, []]));
  const succOf = new Map(tasks.map((t) => [t.id, []]));
  for (const d of dependencies) {
    predsOf.get(d.task_id).push(d);
    succOf.get(d.predecessor_id).push(d);
  }

  // Backward pass: LF & LS (urutan topologis terbalik)
  const lf = new Map();
  const ls = new Map();
  for (const id of [...order].reverse()) {
    const succs = succOf.get(id) || [];
    let latest;
    if (succs.length === 0) {
      latest = projectEnd; // kegiatan akhir: boleh selesai tepat akhir proyek
    } else {
      latest = null;
      for (const d of succs) {
        const lsSucc = ls.get(d.task_id);
        const delay = Number.isInteger(d.delay) && d.delay >= 0 ? d.delay : 0;
        // FS: pred selesai paling lambat (LS_penerus mundur delay+1 hari kerja)
        // SS: pred mulai paling lambat (LS_penerus mundur delay hari kerja)
        const candidate = calendar.retreatWorkingDays(lsSucc, d.type === 'SS' ? delay : delay + 1);
        if (latest === null || candidate < latest) latest = candidate;
      }
    }
    const duration = byId.get(id).duration;
    let lStart = calendar.retreatWorkingDays(latest, duration - 1);
    // Jaga-jaga: LS tidak boleh lebih awal dari ES (jarang terjadi)
    if (lStart < es.get(id)) {
      lStart = es.get(id);
      latest = ef.get(id);
    }
    ls.set(id, lStart);
    lf.set(id, latest);
  }

  const taskRows = order.map((id) => {
    const t = byId.get(id);
    const slackDays = ls.get(id) > es.get(id)
      ? calendar.countWorkingDaysInclusive(es.get(id), ls.get(id)) - 1
      : 0;
    return {
      id,
      code: t.code,
      name: t.name,
      duration: t.duration,
      es: toISO(es.get(id)),
      ef: toISO(ef.get(id)),
      ls: toISO(ls.get(id)),
      lf: toISO(lf.get(id)),
      slack: slackDays,
      isCritical: slackDays === 0,
    };
  });

  // Enumerasi semua jalur: dari kegiatan sumber (tanpa pendahulu) ke akhir.
  const paths = [];
  let truncatedPaths = false;
  const walk = (id, acc) => {
    if (truncatedPaths) return;
    const current = acc.concat(id);
    const succs = succOf.get(id) || [];
    if (succs.length === 0) {
      paths.push(current);
      if (paths.length >= MAX_PATHS) truncatedPaths = true;
      return;
    }
    for (const d of succs) walk(d.task_id, current);
  };
  const sources = tasks.filter((t) => predsOf.get(t.id).length === 0);
  for (const s of sources) {
    walk(s.id, []);
    if (truncatedPaths) break;
  }

  const pathRows = paths
    .map((ids) => {
      const items = ids.map((id) => {
        const t = byId.get(id);
        return { id, code: t.code, name: t.name, duration: t.duration };
      });
      const total = items.reduce((sum, it) => sum + it.duration, 0);
      const start = es.get(ids[0]);
      const end = ef.get(ids[ids.length - 1]);
      return {
        taskIds: ids,
        codes: items.map((it) => it.code),
        items,
        total,
        start: toISO(start),
        end: toISO(end),
        elapsedWorkingDays: calendar.countWorkingDaysInclusive(start, end),
      };
    })
    .sort((a, b) => b.total - a.total || a.codes.join('-').localeCompare(b.codes.join('-')));

  const maxPathTotal = pathRows.length ? pathRows[0].total : 0;
  for (const p of pathRows) p.isCritical = p.total === maxPathTotal;

  return {
    project: {
      startDate: toISO(projectStart),
      endDate: toISO(projectEnd),
      durationWorkingDays: calendar.countWorkingDaysInclusive(projectStart, projectEnd),
    },
    tasks: taskRows,
    paths: pathRows,
    maxPathTotal,
    truncatedPaths,
  };
}

module.exports = { computeCriticalPath, MAX_PATHS };
