/**
 * REST API Kegiatan (task): CRUD, dependensi (FS/SS + delay),
 * penugasan resource, dan total biaya kegiatan.
 */
'use strict';

const express = require('express');
const db = require('../db');
const v = require('../validate');
const { requireProject, requireRow } = require('./helpers');
const { recalcProjectSchedule } = require('../logic/schedule');

const router = express.Router();

const PRIORITIES = ['rendah', 'sedang', 'tinggi'];
const DEP_TYPES = ['FS', 'SS'];

/** Ambil semua kegiatan proyek lengkap dengan pendahulu, resource, dan biaya. */
function listTasks(projectId) {
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId);

  const preds = db
    .prepare(
      `SELECT d.task_id, d.predecessor_id, d.type, d.delay,
              t.code AS predecessor_code, t.name AS predecessor_name
       FROM dependencies d
       JOIN tasks t ON t.id = d.predecessor_id
       WHERE d.task_id IN (SELECT id FROM tasks WHERE project_id = ?)`
    )
    .all(projectId);

  const assigns = db
    .prepare(
      `SELECT a.task_id, r.id, r.name, r.position, r.daily_rate
       FROM assignments a
       JOIN resources r ON r.id = a.resource_id
       JOIN tasks t ON t.id = a.task_id
       WHERE t.project_id = ?
       ORDER BY r.name`
    )
    .all(projectId);

  const predsByTask = new Map();
  for (const p of preds) {
    if (!predsByTask.has(p.task_id)) predsByTask.set(p.task_id, []);
    predsByTask.get(p.task_id).push({
      predecessorId: p.predecessor_id,
      code: p.predecessor_code,
      name: p.predecessor_name,
      type: p.type,
      delay: p.delay,
    });
  }
  const assignsByTask = new Map();
  for (const a of assigns) {
    if (!assignsByTask.has(a.task_id)) assignsByTask.set(a.task_id, []);
    assignsByTask.get(a.task_id).push({
      id: a.id,
      name: a.name,
      position: a.position,
      dailyRate: a.daily_rate,
    });
  }

  return tasks.map((t) => {
    const resources = assignsByTask.get(t.id) || [];
    const rateSum = resources.reduce((sum, r) => sum + (r.dailyRate || 0), 0);
    return {
      id: t.id,
      projectId: t.project_id,
      code: t.code,
      name: t.name,
      duration: t.duration,
      priority: t.priority,
      color: t.color,
      startDate: t.start_date,
      endDate: t.end_date,
      predecessors: predsByTask.get(t.id) || [],
      resources,
      cost: Math.round(t.duration * rateSum * 100) / 100,
    };
  });
}

/** Validasi payload kegiatan (create/update). */
function readTaskPayload(body, { projectId, taskId = null } = {}) {
  const code = v.str(body.code, 'Kode kegiatan', { max: 20 });
  const name = v.str(body.name, 'Nama kegiatan', { max: 200 });
  const duration = v.int(body.duration, 'Durasi', { min: 1, max: 3650, fallback: 1 });
  const priority = v.oneOf(body.priority, 'Prioritas', PRIORITIES, { required: false, fallback: 'sedang' });
  const color = v.hexColor(body.color, 'Warna bar');

  const predecessors = v.array(body.predecessors, 'Pendahulu').map((p) => {
    if (!p || typeof p !== 'object') throw new v.ValidationError('Data pendahulu tidak valid');
    const predecessorId = v.int(p.predecessorId, 'ID pendahulu', { min: 1 });
    if (taskId !== null && predecessorId === taskId) {
      throw new v.ValidationError('Kegiatan tidak bisa bergantung pada dirinya sendiri');
    }
    return {
      predecessorId,
      type: v.oneOf(p.type || 'FS', 'Tipe dependensi', DEP_TYPES, { required: false, fallback: 'FS' }),
      delay: v.int(p.delay, 'Delay', { min: 0, max: 3650, fallback: 0 }),
    };
  });
  // pendahulu unik per kegiatan
  const seen = new Set();
  for (const p of predecessors) {
    if (seen.has(p.predecessorId)) {
      throw new v.ValidationError('Pendahulu sama tidak boleh dua kali');
    }
    seen.add(p.predecessorId);
  }

  const resourceIds = v.array(body.resourceIds, 'Daftar resource').map((rid) =>
    v.int(rid, 'ID resource', { min: 1 })
  );

  // pastikan pendahulu & resource berasal dari proyek yang sama
  for (const p of predecessors) {
    const pred = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(p.predecessorId);
    if (!pred) throw new v.ValidationError(`Pendahulu #${p.predecessorId} tidak ditemukan`);
    if (pred.project_id !== projectId) {
      throw new v.ValidationError('Pendahulu harus berasal dari proyek yang sama');
    }
  }
  for (const rid of resourceIds) {
    const res = db.prepare('SELECT project_id FROM resources WHERE id = ?').get(rid);
    if (!res) throw new v.ValidationError(`Resource #${rid} tidak ditemukan`);
    if (res.project_id !== projectId) {
      throw new v.ValidationError('Resource harus berasal dari proyek yang sama');
    }
  }

  return {
    task: { code, name, duration, priority, color, predecessors, resourceIds },
    projectId,
  };
}

function assertUniqueCode(projectId, code, excludeTaskId = null) {
  const row = excludeTaskId
    ? db.prepare('SELECT id FROM tasks WHERE project_id = ? AND code = ? AND id <> ?').get(projectId, code, excludeTaskId)
    : db.prepare('SELECT id FROM tasks WHERE project_id = ? AND code = ?').get(projectId, code);
  if (row) throw new v.ValidationError(`Kode kegiatan "${code}" sudah dipakai di proyek ini`);
}

function writeDependenciesAndAssignments(taskId, predecessors, resourceIds) {
  db.prepare('DELETE FROM dependencies WHERE task_id = ?').run(taskId);
  const insDep = db.prepare(
    'INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)'
  );
  for (const p of predecessors) insDep.run(taskId, p.predecessorId, p.type, p.delay);

  db.prepare('DELETE FROM assignments WHERE task_id = ?').run(taskId);
  const insRes = db.prepare('INSERT INTO assignments (task_id, resource_id) VALUES (?, ?)');
  for (const rid of new Set(resourceIds)) insRes.run(taskId, rid);
}

function getTaskOrFail(taskId) {
  return requireRow('tasks', taskId, 'Kegiatan tidak ditemukan');
}

function getTaskJson(taskId) {
  const task = getTaskOrFail(taskId);
  return listTasks(task.project_id).find((t) => t.id === taskId);
}

// --- Daftar & pembuatan kegiatan (nested) ---

router.get('/projects/:id/tasks', (req, res) => {
  const projectId = v.idParam(req.params.id);
  requireProject(projectId);
  res.json(listTasks(projectId));
});

router.post('/projects/:id/tasks', (req, res) => {
  const projectId = v.idParam(req.params.id);
  requireProject(projectId);
  const { task } = readTaskPayload(req.body || {}, { projectId });
  assertUniqueCode(projectId, task.code);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO tasks (project_id, code, name, duration, priority, color) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(projectId, task.code, task.name, task.duration, task.priority, task.color);
    writeDependenciesAndAssignments(info.lastInsertRowid, task.predecessors, task.resourceIds);
    recalcProjectSchedule(db, projectId);
    return info.lastInsertRowid;
  });

  res.status(201).json(getTaskJson(tx()));
});

// --- Detail, update, hapus kegiatan ---

router.get('/tasks/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  res.json(getTaskJson(id));
});

router.put('/tasks/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  const existing = getTaskOrFail(id);
  const { task } = readTaskPayload(req.body || {}, { projectId: existing.project_id, taskId: id });
  assertUniqueCode(existing.project_id, task.code, id);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tasks SET code = ?, name = ?, duration = ?, priority = ?, color = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(task.code, task.name, task.duration, task.priority, task.color, id);
    writeDependenciesAndAssignments(id, task.predecessors, task.resourceIds);
    recalcProjectSchedule(db, existing.project_id); // kegiatan turunan dihitung ulang
  });
  tx();

  res.json(getTaskJson(id));
});

router.delete('/tasks/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  const existing = getTaskOrFail(id);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    recalcProjectSchedule(db, existing.project_id);
  });
  tx();

  res.json({ ok: true, message: 'Kegiatan berhasil dihapus' });
});

module.exports = router;
module.exports.listTasks = listTasks;
module.exports.readTaskPayload = readTaskPayload;
module.exports.getTaskJson = getTaskJson;
