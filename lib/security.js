'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');

/* ------------------------------------------------------- password hashing */
// scrypt with a per-password salt. Format: scrypt$N$saltB64$hashB64
const N = 16384;
function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(secret), salt, 64, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString('base64')}$${h.toString('base64')}`;
}
function verifySecret(secret, stored) {
  try {
    const [alg, n, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(String(secret), Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
    return crypto.timingSafeEqual(got, expected);
  } catch { return false; }
}
const normAnswer = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

/* ------------------------------------------------------------- sessions */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SESSION_TTL = 12 * 3600 * 1000;
const REMEMBER_TTL = 30 * 24 * 3600 * 1000;

function createSession(adminId, ip, ua, remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  db.prepare('INSERT INTO sessions (token_hash,admin_id,csrf,created_at,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?)')
    .run(sha(token), adminId, csrf, now, now + ttl, ip.slice(0, 64), String(ua || '').slice(0, 200));
  return { token, csrf, ttl };
}
function getSession(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare(`SELECT s.token_hash, s.csrf, s.expires_at, a.id, a.username, a.display_name, a.email, a.role, a.must_change, a.security_question
    FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash); return null; }
  return row;
}
const destroySession = (token) => token && db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
const destroyAdminSessions = (adminId, exceptToken) =>
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(adminId, exceptToken ? sha(exceptToken) : '');
function cleanup() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?').run(now);
}
setInterval(cleanup, 3600 * 1000).unref();

/* ----------------------------------------------------------- reset token */
function createResetToken(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM reset_tokens WHERE admin_id = ?').run(adminId);
  db.prepare('INSERT INTO reset_tokens (token_hash,admin_id,expires_at) VALUES (?,?,?)').run(sha(token), adminId, Date.now() + 15 * 60 * 1000);
  return token;
}
function consumeResetToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT admin_id, expires_at FROM reset_tokens WHERE token_hash = ?').get(sha(token));
  if (!row || row.expires_at < Date.now()) return null;
  db.prepare('DELETE FROM reset_tokens WHERE token_hash = ?').run(sha(token));
  return row.admin_id;
}

/* ----------------------------------------------------------- rate limiter */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); }, 60000).unref();

/* ------------------------------------------------------- first-run admin */
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (count) return null;
  const fs = require('node:fs'); const path = require('node:path');
  const { DATA_DIR } = require('./db');
  const username = (process.env.ADMIN_USERNAME || 'prabesh').trim();
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password || passwordProblem(password)) {
    password = crypto.randomBytes(9).toString('base64url') + crypto.randomInt(10, 99);
    generated = true;
  }
  db.prepare(`INSERT INTO admins (username,display_name,email,password_hash,role,must_change,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(username, 'Prabesh', process.env.ADMIN_EMAIL || '', hashSecret(password), 'super', generated ? 1 : 0, Date.now());
  if (generated) {
    const file = path.join(DATA_DIR, 'FIRST-RUN-CREDENTIALS.txt');
    fs.writeFileSync(file, `Admin login: /prabeshadmin\nUsername: ${username}\nPassword: ${password}\n\nChange this password after first login, then delete this file.\n`, { mode: 0o600 });
  }
  return { username, password: generated ? password : '(from ADMIN_PASSWORD)', generated };
}

module.exports = { hashSecret, verifySecret, normAnswer, passwordProblem, createSession, getSession, destroySession, destroyAdminSessions,
  createResetToken, consumeResetToken, rateLimit, ensureAdmin, sha };
