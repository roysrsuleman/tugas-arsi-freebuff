/**
 * Koneksi database SQLite (better-sqlite3) + skema tabel.
 * Database dibuat otomatis jika belum ada.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'mini-gantt.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  organization  TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  start_date    TEXT    NOT NULL,
  weekend_days  TEXT    NOT NULL DEFAULT '[0,6]',
  weekend_mode  TEXT    NOT NULL DEFAULT 'off' CHECK (weekend_mode IN ('off','work')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  label       TEXT    NOT NULL DEFAULT '',
  type        TEXT    NOT NULL DEFAULT 'one_off' CHECK (type IN ('one_off','recurring'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  duration    INTEGER NOT NULL DEFAULT 1,
  priority    TEXT    NOT NULL DEFAULT 'sedang' CHECK (priority IN ('rendah','sedang','tinggi')),
  color       TEXT    NOT NULL DEFAULT '#4e79a7',
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dependencies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  predecessor_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL DEFAULT 'FS' CHECK (type IN ('FS','SS')),
  delay           INTEGER NOT NULL DEFAULT 0,
  UNIQUE (task_id, predecessor_id),
  CHECK (task_id <> predecessor_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL DEFAULT '',
  phone       TEXT    NOT NULL DEFAULT '',
  position    TEXT    NOT NULL DEFAULT 'Programmer',
  daily_rate  REAL    NOT NULL DEFAULT 0,
  days_off    TEXT    NOT NULL DEFAULT '[]',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_holidays_project  ON holidays(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_deps_task         ON dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_deps_pred         ON dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id);
CREATE INDEX IF NOT EXISTS idx_assign_task       ON assignments(task_id);
`;

/**
 * Buka (dan migrasikan) sebuah database.
 * @param {string} dbPath path file database, atau ':memory:' untuk test
 */
function openDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// Database singleton untuk aplikasi (test menggunakan openDatabase(':memory:')).
const db = openDatabase(process.env.DB_PATH || DEFAULT_DB_PATH);

module.exports = db;
module.exports.db = db;
module.exports.openDatabase = openDatabase;
module.exports.DEFAULT_DB_PATH = DEFAULT_DB_PATH;
