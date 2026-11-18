'use strict';
// Builds d1/setup.sql (schema + your content + first admin) for Cloudflare D1.
//   node scripts/build-d1-sql.js [temporaryPassword]
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const { DEFAULT_SETTINGS, SEED_MILESTONES, SEED_CERTS, SEED_PROJECTS, SEED_SKILLS } = require('../lib/seed-data');

const dbSrc = fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8');
const schema = dbSrc.match(/db\.exec\(`\n([\s\S]*?)`\);\n/)[1].trim();
const extra = `
CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS file_chunks (name TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, idx));`;

const q = (v) => (typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const row = (t, cols, vals) => `INSERT INTO ${t} (${cols.join(',')}) VALUES (${vals.map(q).join(',')});`;
const out = [];
out.push('-- Prabesh Summit Journey: Cloudflare D1 setup (schema + content + first admin)', '-- Paste into D1 > your database > Console, or: wrangler d1 execute portfolio --remote --file=d1/setup.sql', '');
out.push(schema.replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TABLE IF NOT EXISTS').replace(/\n\s*\n/g, '\n'), extra, '');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) out.push(`INSERT OR IGNORE INTO settings (key,value) VALUES (${q(k)},${q(v)});`);
for (const m of SEED_MILESTONES) out.push(row('milestones', ['category', 'title', 'organization', 'date_label', 'start_date', 'description', 'skills', 'quote', 'sort_order'], [m.category, m.title, m.organization, m.date_label, m.start_date, m.description, JSON.stringify(m.skills), m.quote, m.sort_order]));
for (const c of SEED_CERTS) out.push(row('certificates', ['title', 'issuer', 'date_label', 'issue_date', 'description', 'sort_order'], [c.title, c.issuer, c.date_label, c.issue_date, c.description, c.sort_order]));
for (const p of SEED_PROJECTS) out.push(row('projects', ['name', 'description', 'status', 'tech', 'features', 'sort_order'], [p.name, p.description, p.status, JSON.stringify(p.tech), JSON.stringify(p.features), p.sort_order]));
SEED_SKILLS.forEach(([t, items], i) => out.push(row('skill_categories', ['title', 'items', 'sort_order'], [t, JSON.stringify(items), i + 1])));

const pw = process.argv[2] || ('Summit' + crypto.randomBytes(5).toString('hex') + crypto.randomInt(10, 99));
const salt = crypto.randomBytes(16); const hash = crypto.pbkdf2Sync(pw, salt, 100000, 32, 'sha256');
out.push('', row('admins', ['username', 'display_name', 'email', 'password_hash', 'role', 'must_change', 'created_at'], ['prabesh', 'Prabesh', '', `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`, 'super', 1, Date.now()]));
fs.mkdirSync(path.join(__dirname, '../d1'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../d1/setup.sql'), out.join('\n') + '\n');
console.log('Wrote d1/setup.sql\nFirst login -> username: prabesh   temporary password: ' + pw + '  (you must change it at first login)');
