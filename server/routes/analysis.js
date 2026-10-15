/**
 * REST API Analisis: critical path + tabel semua jalur.
 */
'use strict';

const express = require('express');
const db = require('../db');
const v = require('../validate');
const { requireProject } = require('./helpers');
const { computeCriticalPath } = require('../logic/criticalPath');

const router = express.Router();

router.get('/projects/:id/critical-path', (req, res) => {
  const id = v.idParam(req.params.id);
  const project = requireProject(id);

  const holidays = db
    .prepare('SELECT date, label, type FROM holidays WHERE project_id = ?')
    .all(id)
    .map((h) => ({ date: h.date, label: h.label, type: h.type }));
  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY id').all(id);
  const dependencies = db
    .prepare(
      `SELECT d.* FROM dependencies d
       JOIN tasks t ON t.id = d.task_id
       WHERE t.project_id = ?`
    )
    .all(id);

  res.json(computeCriticalPath({
    startDate: project.start_date,
    weekendDays: JSON.parse(project.weekend_days || '[0,6]'),
    weekendMode: project.weekend_mode || 'off',
    holidays,
    tasks,
    dependencies,
  }));
});

module.exports = router;
