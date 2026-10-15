/**
 * Assembly aplikasi Express: file statis frontend + REST API + error handler.
 */
'use strict';

const express = require('express');
const path = require('path');

const projectsRouter = require('./routes/projects');
const tasksRouter = require('./routes/tasks');
const resourcesRouter = require('./routes/resources');
const analysisRouter = require('./routes/analysis');
const seedRouter = require('./routes/seed');
const { ValidationError } = require('./validate');
const { CircularDependencyError } = require('./logic/schedule');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Frontend (HTML/CSS/JS murni)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // REST API
  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Mini Gantt Project' }));
  app.use('/api', projectsRouter);
  app.use('/api', tasksRouter);
  app.use('/api', resourcesRouter);
  app.use('/api', analysisRouter);
  app.use('/api', seedRouter);

  // Endpoint API tidak dikenal
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  });

  // Error handler (pesan berbahasa Indonesia)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Format JSON tidak valid' });
    }
    if (err instanceof ValidationError || err instanceof CircularDependencyError) {
      return res.status(400).json({ error: err.message });
    }
    if (err && err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error && err.message && err.message.includes('tidak valid')) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  });

  return app;
}

module.exports = createApp;
