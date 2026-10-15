/**
 * REST API Data Contoh (seed).
 * POST /api/seed memuat proyek contoh bawaan (idempoten — nama sama tidak
 * dibuat ulang). Body opsional: { "sample": "all" | "abjak" | "sdlc" }.
 */
'use strict';

const express = require('express');
const db = require('../db');
const v = require('../validate');
const { SAMPLES, seedDatabase } = require('../seed');

const router = express.Router();

router.post('/seed', (req, res) => {
  const which = v.oneOf((req.body || {}).sample, 'Pilihan data contoh', ['all', 'abjak', 'sdlc'], {
    required: false,
    fallback: 'all',
  });
  const chosen = which === 'all' ? ['abjak', 'sdlc'] : [which];

  const created = [];
  const skipped = [];
  for (const key of chosen) {
    const result = seedDatabase(db, SAMPLES[key]);
    const entry = { id: result.id, name: result.name };
    if (result.created) created.push(entry);
    else skipped.push(entry);
  }

  res.status(created.length ? 201 : 200).json({
    created,
    skipped,
    message: created.length
      ? `${created.length} proyek contoh berhasil dimuat.`
      : 'Semua proyek contoh sudah ada — tidak ada yang dimuat ulang.',
  });
});

module.exports = router;
