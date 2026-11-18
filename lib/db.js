'use strict';
// SQLite database (Node's built-in node:sqlite - no npm packages required).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'portfolio.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('super','editor')),
  security_question TEXT NOT NULL DEFAULT '',
  security_answer_hash TEXT NOT NULL DEFAULT '',
  must_change INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'education',
  title TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  quote TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  credential_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  tech TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  github_url TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS skill_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read')),
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  country TEXT NOT NULL DEFAULT '',
  is_new INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day, type);
`);

/* ------------------------------------------------------------------ seed */
const { DEFAULT_SETTINGS, SEED_MILESTONES, SEED_CERTS, SEED_PROJECTS, SEED_SKILLS } = require('./seed-data');


function seed() {
  const hasSettings = db.prepare('SELECT COUNT(*) c FROM settings').get().c;
  if (!hasSettings) {
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
    const im = db.prepare('INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const m of SEED_MILESTONES) im.run(m.category, m.title, m.organization, m.date_label, m.start_date, m.description, JSON.stringify(m.skills), m.quote, m.sort_order);
    const ic = db.prepare('INSERT INTO certificates (title,issuer,date_label,issue_date,description,sort_order) VALUES (?,?,?,?,?,?)');
    for (const c of SEED_CERTS) ic.run(c.title, c.issuer, c.date_label, c.issue_date, c.description, c.sort_order);
    const ip = db.prepare('INSERT INTO projects (name,description,status,tech,features,sort_order) VALUES (?,?,?,?,?,?)');
    for (const p of SEED_PROJECTS) ip.run(p.name, p.description, p.status, JSON.stringify(p.tech), JSON.stringify(p.features), p.sort_order);
    const is = db.prepare('INSERT INTO skill_categories (title,items,sort_order) VALUES (?,?,?)');
    SEED_SKILLS.forEach(([t, items], i) => is.run(t, JSON.stringify(items), i + 1));
  } else {
    // make sure newly introduced settings exist after upgrades
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  }
}
seed();

module.exports = { db, DATA_DIR, DEFAULT_SETTINGS };
