/**
 * REST API Proyek + pengaturan kalender (weekend & hari libur).
 */
'use strict';

const express = require('express');
const db = require('../db');
const v = require('../validate');
const { Calendar } = require('../logic/calendar');
const { recalcProjectSchedule } = require('../logic/schedule');
const { requireProject } = require('./helpers');

const router = express.Router();

const HOLIDAY_TYPES = ['one_off', 'recurring'];

/** Validasi & normalisasi pengaturan kalender dari body request. */
function readCalendar(input) {
  const cal = new Calendar({
    weekendDays: input.weekendDays === undefined ? [0, 6] : v.array(input.weekendDays, 'Hari weekend'),
    weekendMode: input.weekendMode === undefined ? 'off' : input.weekendMode,
    holidays: v.array(input.holidays, 'Daftar hari libur').map((h) => {
      if (!h || typeof h !== 'object') throw new v.ValidationError('Data hari libur tidak valid');
      return {
        date: v.isoDate(h.date, 'Tanggal hari libur'),
        label: v.str(h.label, 'Keterangan hari libur', { required: false, max: 120 }),
        type: v.oneOf(h.type || 'one_off', 'Tipe hari libur', HOLIDAY_TYPES, { required: false, fallback: 'one_off' }),
      };
    }),
  });
  return {
    weekendDays: cal.weekendDays,
    weekendMode: cal.weekendMode,
    holidays: cal.holidays,
  };
}

function getHolidays(projectId) {
  return db
    .prepare('SELECT id, date, label, type FROM holidays WHERE project_id = ? ORDER BY date, id')
    .all(projectId);
}

function toProjectJson(row) {
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    description: row.description,
    startDate: row.start_date,
    calendar: {
      weekendDays: JSON.parse(row.weekend_days || '[0,6]'),
      weekendMode: row.weekend_mode || 'off',
      holidays: getHolidays(row.id),
    },
  };
}

function replaceHolidays(projectId, holidays) {
  db.prepare('DELETE FROM holidays WHERE project_id = ?').run(projectId);
  const insert = db.prepare(
    'INSERT INTO holidays (project_id, date, label, type) VALUES (?, ?, ?, ?)'
  );
  for (const h of holidays) insert.run(projectId, h.date, h.label, h.type);
}

// --- Daftar & pembuatan proyek ---

router.get('/projects', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
       FROM projects p
       ORDER BY p.id`
    )
    .all();
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      organization: row.organization,
      description: row.description,
      startDate: row.start_date,
      taskCount: row.task_count,
    }))
  );
});

router.post('/projects', (req, res) => {
  const body = req.body || {};
  const name = v.str(body.name, 'Nama proyek');
  const organization = v.str(body.organization, 'Organisasi', { required: false });
  const description = v.str(body.description, 'Deskripsi', { required: false, max: 2000 });
  const startDate = v.isoDate(body.startDate, 'Tanggal mulai');
  const calendar = readCalendar(body.calendar || {});

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO projects (name, organization, description, start_date, weekend_days, weekend_mode) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(name, organization, description, startDate, JSON.stringify(calendar.weekendDays), calendar.weekendMode);
    replaceHolidays(info.lastInsertRowid, calendar.holidays);
    return info.lastInsertRowid;
  });

  res.status(201).json(toProjectJson(requireProject(tx())));
});

// --- Detail, update, hapus proyek ---

router.get('/projects/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  res.json(toProjectJson(requireProject(id)));
});

router.put('/projects/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  requireProject(id);
  const body = req.body || {};
  const name = v.str(body.name, 'Nama proyek');
  const organization = v.str(body.organization, 'Organisasi', { required: false });
  const description = v.str(body.description, 'Deskripsi', { required: false, max: 2000 });
  const startDate = v.isoDate(body.startDate, 'Tanggal mulai');

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE projects SET name = ?, organization = ?, description = ?, start_date = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, organization, description, startDate, id);
    recalcProjectSchedule(db, id); // tanggal mulai proyek berubah -> jadwal dihitung ulang
  });
  tx();

  res.json(toProjectJson(requireProject(id)));
});

router.delete('/projects/:id', (req, res) => {
  const id = v.idParam(req.params.id);
  requireProject(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ ok: true, message: 'Proyek berhasil dihapus' });
});

// --- Pengaturan kalender (weekend + hari libur) ---

router.put('/projects/:id/calendar', (req, res) => {
  const id = v.idParam(req.params.id);
  requireProject(id);
  const calendar = readCalendar(req.body || {});

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE projects SET weekend_days = ?, weekend_mode = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(calendar.weekendDays), calendar.weekendMode, id);
    replaceHolidays(id, calendar.holidays);
    recalcProjectSchedule(db, id); // kalender berubah -> semua tanggal dihitung ulang
  });
  tx();

  res.json(toProjectJson(requireProject(id)));
});

module.exports = router;
module.exports.readCalendar = readCalendar;
module.exports.toProjectJson = toProjectJson;
