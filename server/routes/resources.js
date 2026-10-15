/**
 * REST API Resource (anggota tim): CRUD, posisi, tarif per hari,
 * dan hari libur pribadi.
 */
'use strict';

const express = require('express');
const db = require('../db');
const v = require('../validate');
const { requireProject, requireRow } = require('./helpers');
const { isValidISO } = require('../logic/calendar');

const router = express.Router();

const POSITIONS = ['Project Manager', 'Analis', 'Programmer', 'Tester'];

function toResourceJson(row, assignedTaskCount = undefined) {
  const json = {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    position: row.position,
    dailyRate: row.daily_rate,
    daysOff: JSON.parse(row.days_off || '[]'),
  };
  if (assignedTaskCount !== undefined) json.assignedTaskCount = assignedTaskCount;
  return json;
}

function listResources(projectId) {
  const rows = db
    .prepare('SELECT * FROM resources WHERE project_id = ? ORDER BY id')
    .all(projectId);
  const counts = db
    .prepare(
      `SELECT r.id, COUNT(a.task_id) AS n
       FROM resources r
       LEFT JOIN assignments a ON a.resource_id = r.id
       WHERE r.project_id = ?
       GROUP BY r.id`
    )
    .all(projectId);
  const countMap = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((row) => toResourceJson(row, countMap.get(row.id) || 0));
}

/** Validasi payload resource (create/update). */
function readResourcePayload(body) {
  const name = v.str(body.name, 'Nama resource', { max: 120 });
  const email = v.email(body.email, 'Email');
  const phone = v.str(body.phone, 'Telepon', { required: false, max: 40 });
  const position = v.oneOf(body.position, 'Posisi', POSITIONS, { required: false, fallback: 'Programmer' });
  const dailyRate = v.num(body.dailyRate, 'Tarif per hari', { min: 0, fallback: 0 });
  const daysOff = v.array(body.daysOff, 'Hari libur pribadi').map((d) =>
    v.isoDate(d, 'Hari libur pribadi')
  );
  return { name, email, phone, position, dailyRate, daysOff };
}

function getResourceOrFail(id) {
  return requireRow('resources', id, 'Resource tidak ditemukan');
}

// --- Daftar & pembuatan resource (nested) ---

router.get('/projects/:id/resources', (req, res) => {
  const projectId = v.idParam(req.params.id);
  requireProject(projectId);
  res.json(listResources(projectId));
});

router.post('/projects/:id/resources', (req, res) => {
  const projectId = v.idParam(req.params.id);
  requireProject(projectId);
  const payload = readResourcePayload(req.body || {});

  const info = db
    .prepare(
      'INSERT INTO resources (project_id, name, email, phone, position, daily_rate, days_off) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(projectId, payload.name, payload.email, payload.phone, payload.position, payload.dailyRate, JSON.stringify(payload.daysOff));

  res.status(201).json(toResourceJson(getResourceOrFail(info.lastInsertRowid)));
});

// --- Detail, update, hapus resource ---

router.get('/resources/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  res.json(toResourceJson(getResourceOrFail(id)));
});

router.put('/resources/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  getResourceOrFail(id);
  const payload = readResourcePayload(req.body || {});

  db.prepare(
    "UPDATE resources SET name = ?, email = ?, phone = ?, position = ?, daily_rate = ?, days_off = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(payload.name, payload.email, payload.phone, payload.position, payload.dailyRate, JSON.stringify(payload.daysOff), id);

  res.json(toResourceJson(getResourceOrFail(id)));
});

router.delete('/resources/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  getResourceOrFail(id);
  db.prepare('DELETE FROM resources WHERE id = ?').run(id);
  res.json({ ok: true, message: 'Resource berhasil dihapus' });
});

module.exports = router;
module.exports.listResources = listResources;
module.exports.readResourcePayload = readResourcePayload;
module.exports.POSITIONS = POSITIONS;
module.exports.isValidISO = isValidISO;
