/** Helper bersama untuk route REST. */
'use strict';

const db = require('../db');

/** Ambil baris proyek atau lempar 404. */
function requireProject(id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('Proyek tidak ditemukan'), { status: 404 });
  }
  return row;
}

/** Ambil baris entitas apa pun (kegiatan/resource) atau lempar 404. */
function requireRow(table, id, notFoundMessage) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) {
    throw Object.assign(new Error(notFoundMessage), { status: 404 });
  }
  return row;
}

module.exports = { requireProject, requireRow };
