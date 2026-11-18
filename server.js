'use strict';
/**
 * Prabesh - The Summit Journey
 * Zero-dependency Node.js server: static site + JSON API + admin panel (/prabeshadmin) + SQLite.
 * Requires Node 22.5+ (built-in node:sqlite).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

try { // optional .env loader (no dependency)
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ignore */ }

const { db, DATA_DIR, DEFAULT_SETTINGS } = require('./lib/db');
const sec = require('./lib/security');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? 345); // Nepal = UTC+5:45
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(PUBLIC_DIR, 'admin');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ADMIN_PATH = '/prabeshadmin';
const COOKIE = 'ps_sid';

/* ------------------------------------------------------------- helpers */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.webmanifest']);

const nowDay = (ts = Date.now()) => new Date(ts + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
const clientIp = (req) => {
  if (TRUST_PROXY) { const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (x) return x; }
  return req.socket.remoteAddress || '0.0.0.0';
};
const isHttps = (req) => !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
const cleanStr = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => { const i = c.indexOf('='); return i < 0 ? [] : [c.slice(0, i).trim(), c.slice(i + 1).trim()]; }).filter((a) => a.length));

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, { ...SEC_HEADERS, 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 1_000_000) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  if (!/application\/json/i.test(req.headers['content-type'] || '')) fail(415, 'Content-Type must be application/json');
  try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { fail(400, 'Invalid JSON'); }
}

/* ------------------------------------------------------------- settings */
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const PUBLIC_KEYS = SETTING_KEYS.filter((k) => k !== 'resume_file');
const URL_KEYS = new Set(['github', 'linkedin', 'portfolio']);
function allSettings() { const o = {}; for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value; return o; }

/* ------------------------------------------------------------ validators */
const isUrl = (v) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };
const isMedia = (v) => /^\/(uploads|assets\/img)\/[A-Za-z0-9._-]+$/.test(v);
const FIELD = {
  str: (max) => ({ t: 'str', max }), text: (max) => ({ t: 'text', max }), int: () => ({ t: 'int' }), bool: () => ({ t: 'bool' }),
  list: (max = 40, item = 120) => ({ t: 'list', max, item }), url: () => ({ t: 'url' }), media: () => ({ t: 'media' }),
  ym: () => ({ t: 'ym' }), enm: (vals) => ({ t: 'enum', vals }),
};
function coerce(name, spec, v, req) {
  switch (spec.t) {
    case 'str': v = cleanStr(v, spec.max); break;
    case 'text': v = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, spec.max); break;
    case 'int': v = Math.max(-100000, Math.min(100000, parseInt(v, 10) || 0)); break;
    case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
    case 'list': {
      const arr = Array.isArray(v) ? v : String(v ?? '').split(/\r?\n|,/);
      v = JSON.stringify(arr.map((x) => cleanStr(x, spec.item)).filter(Boolean).slice(0, spec.max)); break;
    }
    case 'url': v = cleanStr(v, 500); if (v && !isUrl(v)) fail(400, `${name}: must be a valid http(s) link`); break;
    case 'media': v = cleanStr(v, 200); if (v && !isMedia(v)) fail(400, `${name}: invalid image path`); break;
    case 'ym': v = cleanStr(v, 10); if (v && !/^\d{4}(-\d{2}){0,2}$/.test(v)) fail(400, `${name}: use YYYY or YYYY-MM`); break;
    case 'enum': v = cleanStr(v, 40); if (!spec.vals.includes(v)) fail(400, `${name}: invalid value`); break;
  }
  return v;
}
const RESOURCES = {
  milestones: { table: 'milestones', required: ['title'], media: ['image'], fields: {
    category: FIELD.enm(['education', 'training', 'certificate', 'experience', 'other']), title: FIELD.str(200), organization: FIELD.str(200), date_label: FIELD.str(100),
    start_date: FIELD.ym(), description: FIELD.text(4000), skills: FIELD.list(), quote: FIELD.str(300), image: FIELD.media(), sort_order: FIELD.int(), published: FIELD.bool() } },
  certificates: { table: 'certificates', required: ['title'], media: ['image'], fields: {
    title: FIELD.str(200), issuer: FIELD.str(200), date_label: FIELD.str(100), issue_date: FIELD.ym(), description: FIELD.text(3000), image: FIELD.media(),
    credential_url: FIELD.url(), sort_order: FIELD.int(), published: FIELD.bool() } },
  projects: { table: 'projects', required: ['name'], media: ['image'], fields: {
    name: FIELD.str(150), description: FIELD.text(4000), status: FIELD.str(60), tech: FIELD.list(), features: FIELD.list(20, 250), github_url: FIELD.url(), live_url: FIELD.url(),
    image: FIELD.media(), sort_order: FIELD.int(), published: FIELD.bool() } },
  skills: { table: 'skill_categories', required: ['title'], media: [], fields: { title: FIELD.str(100), items: FIELD.list(60, 120), sort_order: FIELD.int(), published: FIELD.bool() } },
};
const JSON_COLS = new Set(['skills', 'tech', 'features', 'items']);
const parseRow = (r) => { const o = { ...r }; for (const k of JSON_COLS) if (k in o) { try { o[k] = JSON.parse(o[k]); } catch { o[k] = []; } } return o; };

function crudValidate(cfg, body, partial, req) {
  const out = {};
  for (const [name, spec] of Object.entries(cfg.fields)) {
    if (!(name in body)) { if (!partial && cfg.required.includes(name)) fail(400, `${name} is required`); continue; }
    out[name] = coerce(name, spec, body[name], req);
    if (cfg.required.includes(name) && !out[name]) fail(400, `${name} is required`);
  }
  return out;
}

/* --------------------------------------------------------------- uploads */
function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', kind: 'image' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', kind: 'image' };
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: '.webp', kind: 'image' };
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.slice(0, 6).toString('latin1'))) return { ext: '.gif', kind: 'image' };
  if (buf.length > 5 && buf.slice(0, 5).toString() === '%PDF-') return { ext: '.pdf', kind: 'pdf' };
  return null;
}
function isReferenced(rel) {
  for (const t of ['milestones', 'certificates', 'projects']) if (db.prepare(`SELECT 1 FROM ${t} WHERE image = ? LIMIT 1`).get(rel)) return true;
  if (db.prepare('SELECT 1 FROM settings WHERE value = ? LIMIT 1').get(rel)) return true;
  return false;
}
function dropUpload(rel) {
  if (!rel || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(rel) || isReferenced(rel)) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(rel)), () => {});
}

/* ------------------------------------------------------------- analytics */
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom/i;
const SECRET = (() => {
  const f = path.join(DATA_DIR, '.secret');
  try { return fs.readFileSync(f, 'utf8'); } catch { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, s, { mode: 0o600 }); return s; }
})();
const visitorId = (req) => crypto.createHash('sha256').update(SECRET + clientIp(req) + String(req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
function deviceOf(ua) { ua = String(ua || ''); if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet'; if (/mobi|iphone|android/i.test(ua)) return 'mobile'; return 'desktop'; }
function refHost(ref, host) { try { const h = new URL(ref).hostname.replace(/^www\./, ''); return h === String(host).split(':')[0].replace(/^www\./, '') ? '' : h; } catch { return ''; } }
const EVENT_TYPES = new Set(['journey_start', 'journey_skip', 'checkpoint_reached', 'checkpoint_open', 'summit_reached', 'project_github', 'project_live', 'project_open',
  'resume_view', 'resume_download', 'contact_submit', 'cert_open', 'social_click', 'nav_click', 'cta_explore']);
function track(req, body, session) {
  if (session) return; // never count the admin's own browsing
  const ua = req.headers['user-agent'] || '';
  if (BOT_RE.test(ua)) return;
  const v = visitorId(req); const ts = Date.now(); const day = nowDay(ts);
  if (body.type === 'view') {
    const isNew = db.prepare('SELECT 1 FROM visits WHERE visitor = ? LIMIT 1').get(v) ? 0 : 1;
    db.prepare('INSERT INTO visits (ts,day,visitor,path,referrer,device,country,is_new) VALUES (?,?,?,?,?,?,?,?)')
      .run(ts, day, v, cleanStr(body.path || '/', 120), refHost(cleanStr(body.ref, 300), req.headers.host || ''), deviceOf(ua),
        cleanStr(req.headers['cf-ipcountry'] || '', 2).toUpperCase(), isNew);
  } else if (EVENT_TYPES.has(body.type)) {
    db.prepare('INSERT INTO events (ts,day,visitor,type,target) VALUES (?,?,?,?,?)').run(ts, day, v, body.type, cleanStr(body.target, 120));
  }
}

function stats(days) {
  days = Math.max(1, Math.min(365, days | 0 || 30));
  const today = nowDay(); const since = nowDay(Date.now() - (days - 1) * 86400000);
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const totals = one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques, COALESCE(SUM(is_new),0) newv FROM visits WHERE day >= ?', since);
  const prev = one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? AND day < ?', nowDay(Date.now() - (2 * days - 1) * 86400000), since);
  const todayRow = one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day = ?', today);
  const all = one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits');
  const byDay = new Map(q('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? GROUP BY day', since).map((r) => [r.day, r]));
  const evByDay = new Map(q('SELECT day, COUNT(*) n FROM events WHERE day >= ? GROUP BY day', since).map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) { const d = nowDay(Date.now() - i * 86400000); const r = byDay.get(d); series.push({ day: d, views: r ? r.views : 0, uniques: r ? r.uniques : 0, events: evByDay.get(d) || 0 }); }
  const online = one('SELECT COUNT(DISTINCT visitor) n FROM (SELECT visitor FROM visits WHERE ts > ? UNION ALL SELECT visitor FROM events WHERE ts > ?)', Date.now() - 300000, Date.now() - 300000).n;
  const evCounts = q('SELECT type, COUNT(*) total, COUNT(DISTINCT visitor) people FROM events WHERE day >= ? GROUP BY type ORDER BY total DESC', since);
  const funnelTypes = ['journey_start', 'checkpoint_reached', 'checkpoint_open', 'summit_reached', 'contact_submit'];
  const funnel = [{ step: 'visited', people: totals.uniques }].concat(funnelTypes.map((t) => ({ step: t, people: (evCounts.find((e) => e.type === t) || { people: 0 }).people })));
  const rates = evCounts.map((e) => ({ type: e.type, total: e.total, people: e.people, rate: totals.uniques ? Math.round((e.people / totals.uniques) * 1000) / 10 : 0 }));
  const topTargets = (type) => q('SELECT target, COUNT(*) n, COUNT(DISTINCT visitor) people FROM events WHERE day >= ? AND type = ? AND target != \'\' GROUP BY target ORDER BY n DESC LIMIT 10', since, type);
  const msg = one("SELECT COUNT(*) total, COALESCE(SUM(status='unread'),0) unread FROM messages");
  return {
    range: days, today, totals: { ...totals, returning: Math.max(0, totals.uniques - totals.newv) }, previous: prev, todayStats: todayRow, allTime: all, online, series,
    referrers: q("SELECT CASE WHEN referrer = '' THEN 'Direct' ELSE referrer END name, COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? GROUP BY name ORDER BY views DESC LIMIT 10", since),
    devices: q('SELECT device name, COUNT(*) views FROM visits WHERE day >= ? GROUP BY device ORDER BY views DESC', since),
    countries: q("SELECT country name, COUNT(*) views FROM visits WHERE day >= ? AND country != '' AND country != 'XX' GROUP BY country ORDER BY views DESC LIMIT 10", since),
    events: rates, funnel,
    checkpoints: topTargets('checkpoint_open'), reached: topTargets('checkpoint_reached'), projectClicks: q("SELECT type, target, COUNT(*) n FROM events WHERE day >= ? AND type IN ('project_github','project_live','project_open') GROUP BY type, target ORDER BY n DESC LIMIT 12", since),
    recent: q('SELECT ts, path, referrer, device, country, is_new FROM visits ORDER BY id DESC LIMIT 20'),
    messages: msg, generatedAt: Date.now(),
  };
}

/* ----------------------------------------------------------- public API */
function publicSite() {
  const s = allSettings(); const pub = {};
  for (const k of PUBLIC_KEYS) pub[k] = s[k] ?? '';
  pub.has_resume = !!s.resume_file;
  const rows = (t, order) => db.prepare(`SELECT * FROM ${t} WHERE published = 1 ORDER BY ${order}`).all().map(parseRow);
  return {
    settings: pub,
    milestones: rows('milestones', "CASE WHEN start_date = '' THEN '9999' ELSE start_date END, sort_order, id"),
    certificates: rows('certificates', 'sort_order, id'),
    projects: rows('projects', 'sort_order, id'),
    skills: rows('skill_categories', 'sort_order, id'),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function handleContact(req, res) {
  const ip = clientIp(req);
  const rl = sec.rateLimit('contact:' + ip, 5, 3600 * 1000);
  if (!rl.ok) fail(429, 'Too many messages. Please try again later.');
  const b = await readJson(req, 20000);
  if (b.website) return send(res, 200, { ok: true }); // honeypot: pretend success to bots
  if (Number(b.elapsed) < 1500) fail(400, 'Please take a moment to fill in the form.');
  const name = cleanStr(b.name, 80), email = cleanStr(b.email, 254), subject = cleanStr(b.subject, 150);
  const message = String(b.message ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 4000);
  const errors = {};
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  if (message.length < 10) errors.message = 'Message must be at least 10 characters.';
  if (Object.keys(errors).length) return send(res, 422, { error: 'Please check the highlighted fields.', fields: errors });
  db.prepare('INSERT INTO messages (name,email,subject,message,ip_hash,created_at) VALUES (?,?,?,?,?,?)')
    .run(name, email, subject, message, crypto.createHash('sha256').update(SECRET + ip).digest('hex').slice(0, 16), Date.now());
  track(req, { type: 'contact_submit' }, null);
  send(res, 200, { ok: true });
}

/* ------------------------------------------------------------ admin API */
const adminPublic = (a) => ({ id: a.id, username: a.username, display_name: a.display_name, email: a.email, role: a.role, must_change: !!a.must_change, has_security_question: !!a.security_question, security_question: a.security_question });
const cookieHeader = (req, token, maxAgeSec) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;
const getAdminRow = (id) => db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
const superCount = () => db.prepare("SELECT COUNT(*) c FROM admins WHERE role = 'super'").get().c;
function sameOrigin(req) { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch { return false; } }

async function adminLogin(req, res) {
  const ip = clientIp(req);
  const rl = sec.rateLimit('login:' + ip, 10, 15 * 60 * 1000);
  if (!rl.ok) return send(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` }, { 'Retry-After': rl.retryAfter });
  const b = await readJson(req, 5000);
  const username = cleanStr(b.username, 60); const password = String(b.password ?? '').slice(0, 200);
  const a = username ? db.prepare('SELECT * FROM admins WHERE username = ?').get(username) : null;
  if (a && a.locked_until > Date.now()) return send(res, 429, { error: `Account locked. Try again in ${Math.ceil((a.locked_until - Date.now()) / 60000)} min.` });
  const ok = a ? sec.verifySecret(password, a.password_hash) : (sec.verifySecret(password, 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
  if (!ok) {
    if (a) {
      const f = a.failed_attempts + 1;
      db.prepare('UPDATE admins SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, a.id);
    }
    return send(res, 401, { error: 'Incorrect username or password.' });
  }
  db.prepare('UPDATE admins SET failed_attempts = 0, locked_until = 0, last_login = ? WHERE id = ?').run(Date.now(), a.id);
  const s = sec.createSession(a.id, ip, req.headers['user-agent'], !!b.remember);
  send(res, 200, { admin: adminPublic(a), csrf: s.csrf }, { 'Set-Cookie': cookieHeader(req, s.token, Math.floor(s.ttl / 1000)) });
}

async function adminForgot(req, res, step) {
  const ip = clientIp(req);
  const rl = sec.rateLimit('forgot:' + ip, 8, 15 * 60 * 1000);
  if (!rl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.' });
  const b = await readJson(req, 5000);
  if (step === 'question') {
    const a = db.prepare('SELECT security_question q FROM admins WHERE username = ?').get(cleanStr(b.username, 60));
    // identical shape for unknown users to avoid account enumeration
    return send(res, 200, { question: a && a.q ? a.q : 'What is the answer to your security question?' });
  }
  if (step === 'verify') {
    const a = db.prepare('SELECT * FROM admins WHERE username = ?').get(cleanStr(b.username, 60));
    if (a && a.locked_until > Date.now()) return send(res, 429, { error: 'Account temporarily locked.' });
    const ok = a && a.security_answer_hash && sec.verifySecret(sec.normAnswer(b.answer), a.security_answer_hash);
    if (!ok) {
      if (a) { const f = a.failed_attempts + 1; db.prepare('UPDATE admins SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, a.id); }
      return send(res, 401, { error: 'That answer is not correct. If no security question was set, use the reset-admin script on the server.' });
    }
    return send(res, 200, { token: sec.createResetToken(a.id) });
  }
  if (step === 'reset') {
    const pw = String(b.password ?? ''); const problem = sec.passwordProblem(pw); if (problem) fail(400, problem);
    const id = sec.consumeResetToken(String(b.token || '')); if (!id) fail(400, 'Reset link expired. Please start again.');
    db.prepare('UPDATE admins SET password_hash = ?, must_change = 0, failed_attempts = 0, locked_until = 0 WHERE id = ?').run(sec.hashSecret(pw), id);
    sec.destroyAdminSessions(id, null);
    return send(res, 200, { ok: true });
  }
  fail(404, 'Not found');
}

async function adminApi(req, res, url, method) {
  const sub = url.pathname.slice('/api/admin'.length) || '/';
  if (!sameOrigin(req)) fail(403, 'Cross-origin request blocked');
  if (method === 'POST' && sub === '/login') return adminLogin(req, res);
  if (method === 'POST' && /^\/forgot\/(question|verify|reset)$/.test(sub)) return adminForgot(req, res, sub.split('/')[2]);

  const token = parseCookies(req)[COOKIE];
  const me = sec.getSession(token);
  if (!me) fail(401, 'Please sign in.');
  if (method !== 'GET' && method !== 'HEAD') { if (req.headers['x-csrf-token'] !== me.csrf) fail(403, 'Security token mismatch. Reload the page.'); }
  const isSuper = me.role === 'super';
  const mustChange = !!me.must_change;
  // while a forced password change is pending, only allow the password endpoint, me and logout
  if (mustChange && !['/me', '/logout', '/me/password'].includes(sub)) fail(403, 'You must change your password first.');
  let m;

  if (sub === '/me' && method === 'GET') return send(res, 200, { admin: adminPublic(me), csrf: me.csrf });
  if (sub === '/logout' && method === 'POST') { sec.destroySession(token); return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) }); }

  if (sub === '/me' && method === 'PUT') {
    const b = await readJson(req, 10000); const a = getAdminRow(me.id);
    const upd = { display_name: cleanStr(b.display_name ?? a.display_name, 80), email: cleanStr(b.email ?? a.email, 254), username: a.username, q: a.security_question, h: a.security_answer_hash };
    if (upd.email && !EMAIL_RE.test(upd.email)) fail(400, 'Invalid email address.');
    const newUser = cleanStr(b.username ?? a.username, 60);
    if (newUser !== a.username) {
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(newUser)) fail(400, 'Username: 3-40 letters, numbers, dot, dash or underscore.');
      if (!sec.verifySecret(String(b.current_password || ''), a.password_hash)) fail(403, 'Enter your current password to change the username.');
      if (db.prepare('SELECT 1 FROM admins WHERE username = ? AND id != ?').get(newUser, a.id)) fail(409, 'That username is already taken.');
      upd.username = newUser;
    }
    if (b.security_question !== undefined) {
      const q = cleanStr(b.security_question, 200); const ans = sec.normAnswer(b.security_answer);
      if (q) { if (!ans && !a.security_answer_hash) fail(400, 'Provide an answer for your security question.'); upd.q = q; if (ans) upd.h = sec.hashSecret(ans); }
      else { upd.q = ''; upd.h = ''; }
    }
    db.prepare('UPDATE admins SET display_name=?, email=?, username=?, security_question=?, security_answer_hash=? WHERE id=?').run(upd.display_name, upd.email, upd.username, upd.q, upd.h, a.id);
    return send(res, 200, { admin: adminPublic(getAdminRow(a.id)) });
  }
  if (sub === '/me/password' && method === 'POST') {
    const b = await readJson(req, 5000); const a = getAdminRow(me.id);
    if (!sec.verifySecret(String(b.current_password || ''), a.password_hash)) fail(403, 'Current password is incorrect.');
    const problem = sec.passwordProblem(b.password); if (problem) fail(400, problem);
    if (String(b.password) === String(b.current_password)) fail(400, 'Choose a different password.');
    db.prepare('UPDATE admins SET password_hash=?, must_change=0 WHERE id=?').run(sec.hashSecret(String(b.password)), a.id);
    sec.destroyAdminSessions(a.id, token);
    return send(res, 200, { ok: true });
  }

  /* ---- dashboard ---- */
  if (sub === '/stats' && method === 'GET') return send(res, 200, stats(Number(url.searchParams.get('days'))));

  /* ---- site settings ---- */
  if (sub === '/settings' && method === 'GET') { const s = allSettings(); delete s.resume_file; s.has_resume = !!allSettings().resume_file; return send(res, 200, { settings: s }); }
  if (sub === '/settings' && method === 'PUT') {
    const b = await readJson(req, 100000); const cur = allSettings(); const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const oldHero = cur.hero_image;
    for (const [k, v] of Object.entries(b.settings || b)) {
      if (!SETTING_KEYS.includes(k) || k === 'resume_file') continue;
      let val = String(v ?? '');
      if (k === 'hero_image') { val = cleanStr(val, 200); if (val && !isMedia(val)) fail(400, 'Invalid hero image'); }
      else if (URL_KEYS.has(k)) { val = cleanStr(val, 300); if (val && !isUrl(val)) fail(400, `${k}: must be a valid http(s) link`); }
      else if (k === 'email') { val = cleanStr(val, 254); if (val && !EMAIL_RE.test(val)) fail(400, 'Invalid contact email'); }
      else val = val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, k.startsWith('about_') || k.endsWith('_text') ? 4000 : 400);
      up.run(k, val);
    }
    if (oldHero !== allSettings().hero_image) dropUpload(oldHero);
    return send(res, 200, { ok: true });
  }
  if (sub === '/resume' && method === 'DELETE') {
    const cur = allSettings().resume_file; db.prepare("UPDATE settings SET value = '' WHERE key = 'resume_file'").run();
    if (cur) fs.unlink(path.join(UPLOAD_DIR, path.basename(cur)), () => {}); return send(res, 200, { ok: true });
  }

  /* ---- uploads ---- */
  if (sub === '/upload' && method === 'POST') {
    const kind = url.searchParams.get('kind') === 'resume' ? 'resume' : 'image';
    const buf = await readBody(req, kind === 'resume' ? 12 * 1024 * 1024 : 8 * 1024 * 1024);
    const t = sniff(buf);
    if (!t || (kind === 'resume' && t.kind !== 'pdf') || (kind === 'image' && t.kind !== 'image')) fail(415, kind === 'resume' ? 'Only PDF files are allowed for the resume.' : 'Only PNG, JPG, WEBP or GIF images are allowed.');
    const name = crypto.randomBytes(12).toString('hex') + t.ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    if (kind === 'resume') {
      const old = allSettings().resume_file;
      db.prepare("INSERT INTO settings (key,value) VALUES ('resume_file',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run('/uploads/' + name);
      if (old) fs.unlink(path.join(UPLOAD_DIR, path.basename(old)), () => {});
      return send(res, 200, { ok: true, has_resume: true });
    }
    return send(res, 200, { url: '/uploads/' + name });
  }

  /* ---- messages ---- */
  if (sub === '/messages' && method === 'GET') {
    const status = url.searchParams.get('status'); const qs = cleanStr(url.searchParams.get('q'), 100);
    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1); const limit = Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 25);
    const where = []; const p = [];
    if (status === 'unread' || status === 'read') { where.push('status = ?'); p.push(status); }
    if (qs) { where.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)'); const l = `%${qs.replace(/[%_]/g, '')}%`; p.push(l, l, l, l); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM messages ${W}`).get(...p).c;
    const items = db.prepare(`SELECT id,name,email,subject,message,status,created_at FROM messages ${W} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...p, limit, (page - 1) * limit);
    return send(res, 200, { items, total, page, limit, unread: db.prepare("SELECT COUNT(*) c FROM messages WHERE status='unread'").get().c });
  }
  if (sub === '/messages/bulk' && method === 'POST') {
    const b = await readJson(req, 20000); const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Number.isInteger).slice(0, 500);
    if (!ids.length) fail(400, 'No messages selected');
    const ph = ids.map(() => '?').join(',');
    if (b.action === 'delete') db.prepare(`DELETE FROM messages WHERE id IN (${ph})`).run(...ids);
    else if (b.action === 'read' || b.action === 'unread') db.prepare(`UPDATE messages SET status = ? WHERE id IN (${ph})`).run(b.action, ...ids);
    else fail(400, 'Unknown action');
    return send(res, 200, { ok: true });
  }
  if ((m = sub.match(/^\/messages\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'PATCH') { const b = await readJson(req, 2000); if (!['read', 'unread'].includes(b.status)) fail(400, 'Invalid status'); db.prepare('UPDATE messages SET status=? WHERE id=?').run(b.status, id); return send(res, 200, { ok: true }); }
    if (method === 'DELETE') { db.prepare('DELETE FROM messages WHERE id=?').run(id); return send(res, 200, { ok: true }); }
  }

  /* ---- admins (super only) ---- */
  if (sub === '/admins' || sub.startsWith('/admins/')) {
    if (!isSuper) fail(403, 'Only a Super Admin can manage admins.');
    const list = () => db.prepare('SELECT id,username,display_name,email,role,created_at,last_login,security_question FROM admins ORDER BY id').all().map((a) => ({ ...a, has_security_question: !!a.security_question }));
    if (sub === '/admins' && method === 'GET') return send(res, 200, { items: list() });
    if (sub === '/admins' && method === 'POST') {
      const b = await readJson(req, 10000); const username = cleanStr(b.username, 60);
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'Username: 3-40 letters, numbers, dot, dash or underscore.');
      if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) fail(409, 'That username is already taken.');
      const problem = sec.passwordProblem(b.password); if (problem) fail(400, problem);
      const role = b.role === 'super' ? 'super' : 'editor'; const email = cleanStr(b.email, 254); if (email && !EMAIL_RE.test(email)) fail(400, 'Invalid email address.');
      const q = cleanStr(b.security_question, 200); const ans = sec.normAnswer(b.security_answer);
      db.prepare('INSERT INTO admins (username,display_name,email,password_hash,role,security_question,security_answer_hash,must_change,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(username, cleanStr(b.display_name, 80) || username, email, sec.hashSecret(b.password), role, q && ans ? q : '', q && ans ? sec.hashSecret(ans) : '', 1, Date.now());
      return send(res, 201, { items: list() });
    }
    if ((m = sub.match(/^\/admins\/(\d+)$/))) {
      const id = Number(m[1]); const a = getAdminRow(id); if (!a) fail(404, 'Admin not found');
      if (method === 'PUT') {
        const b = await readJson(req, 10000);
        const username = cleanStr(b.username ?? a.username, 60); const email = cleanStr(b.email ?? a.email, 254);
        const role = (b.role ?? a.role) === 'super' ? 'super' : 'editor';
        if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'Invalid username.');
        if (email && !EMAIL_RE.test(email)) fail(400, 'Invalid email address.');
        if (db.prepare('SELECT 1 FROM admins WHERE username = ? AND id != ?').get(username, id)) fail(409, 'That username is already taken.');
        if (a.role === 'super' && role !== 'super' && superCount() <= 1) fail(400, 'There must be at least one Super Admin.');
        db.prepare('UPDATE admins SET username=?, display_name=?, email=?, role=? WHERE id=?').run(username, cleanStr(b.display_name ?? a.display_name, 80), email, role, id);
        if (b.password) { const problem = sec.passwordProblem(b.password); if (problem) fail(400, problem);
          db.prepare('UPDATE admins SET password_hash=?, must_change=?, failed_attempts=0, locked_until=0 WHERE id=?').run(sec.hashSecret(b.password), id === me.id ? 0 : 1, id);
          if (id !== me.id) sec.destroyAdminSessions(id, null); }
        return send(res, 200, { items: list() });
      }
      if (method === 'DELETE') {
        if (id === me.id) fail(400, 'You cannot delete your own account.');
        if (a.role === 'super' && superCount() <= 1) fail(400, 'There must be at least one Super Admin.');
        db.prepare('DELETE FROM admins WHERE id=?').run(id); return send(res, 200, { items: list() });
      }
    }
  }

  /* ---- generic CRUD: milestones | certificates | projects | skills ---- */
  if ((m = sub.match(/^\/(milestones|certificates|projects|skills)(?:\/(reorder|\d+))?$/))) {
    const cfg = RESOURCES[m[1]]; const T = cfg.table; const arg = m[2];
    if (!arg && method === 'GET') return send(res, 200, { items: db.prepare(`SELECT * FROM ${T} ORDER BY ${T === 'milestones' ? "CASE WHEN start_date = '' THEN '9999' ELSE start_date END, sort_order, id" : 'sort_order, id'}`).all().map(parseRow) });
    if (!arg && method === 'POST') {
      const data = crudValidate(cfg, await readJson(req), false, req);
      if (!('sort_order' in data)) data.sort_order = (db.prepare(`SELECT COALESCE(MAX(sort_order),0)+1 n FROM ${T}`).get().n);
      if (!('published' in data)) data.published = 1;
      const keys = Object.keys(data);
      const r = db.prepare(`INSERT INTO ${T} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => data[k]));
      return send(res, 201, { item: parseRow(db.prepare(`SELECT * FROM ${T} WHERE id = ?`).get(Number(r.lastInsertRowid))) });
    }
    if (arg === 'reorder' && method === 'POST') {
      const b = await readJson(req, 20000); const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Number.isInteger);
      const st = db.prepare(`UPDATE ${T} SET sort_order = ? WHERE id = ?`); ids.forEach((id, i) => st.run(i + 1, id)); return send(res, 200, { ok: true });
    }
    if (arg && /^\d+$/.test(arg)) {
      const id = Number(arg); const row = db.prepare(`SELECT * FROM ${T} WHERE id = ?`).get(id); if (!row) fail(404, 'Not found');
      if (method === 'GET') return send(res, 200, { item: parseRow(row) });
      if (method === 'PUT') {
        const data = crudValidate(cfg, await readJson(req), true, req); const keys = Object.keys(data);
        if (keys.length) db.prepare(`UPDATE ${T} SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => data[k]), id);
        for (const f of cfg.media) if (f in data && row[f] !== data[f]) dropUpload(row[f]);
        return send(res, 200, { item: parseRow(db.prepare(`SELECT * FROM ${T} WHERE id = ?`).get(id)) });
      }
      if (method === 'DELETE') { db.prepare(`DELETE FROM ${T} WHERE id = ?`).run(id); for (const f of cfg.media) dropUpload(row[f]); return send(res, 200, { ok: true }); }
    }
  }
  fail(404, 'Unknown admin endpoint');
}

/* --------------------------------------------------------------- static */
const gzCache = new Map();
function serveFile(req, res, file, opts = {}) {
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase(); const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const longCache = /^\.(webp|png|jpg|jpeg|gif|woff2|ico)$/.test(ext) && !opts.noCache;
  const headers = { ...SEC_HEADERS, 'Content-Type': type, ETag: etag, 'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache', ...(opts.headers || {}) };
  if (opts.admin) { headers['X-Robots-Tag'] = 'noindex, nofollow'; headers['Cache-Control'] = 'no-store'; }
  if (req.headers['if-none-match'] === etag && !opts.admin) { res.writeHead(304, headers); res.end(); return true; }
  const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && st.size > 1024 && acceptsGz) {
    const key = file + etag; let gz = gzCache.get(key);
    if (!gz) { gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 }); gzCache.set(key, gz); if (gzCache.size > 200) gzCache.delete(gzCache.keys().next().value); }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': gz.length }); res.end(req.method === 'HEAD' ? undefined : gz); return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}
function safeJoin(base, rel) {
  let p; try { p = decodeURIComponent(rel); } catch { return null; }
  if (p.includes('\0')) return null;
  const full = path.join(base, p);
  return full.startsWith(base + path.sep) || full === base ? full : null;
}

function serveResume(req, res, url) {
  const rel = allSettings().resume_file; const file = rel && path.join(UPLOAD_DIR, path.basename(rel));
  if (!file || !fs.existsSync(file)) return send(res, 404, 'Resume has not been uploaded yet.');
  const download = url.searchParams.get('download') === '1';
  const label = (allSettings().full_name || 'Resume').replace(/[^A-Za-z0-9]+/g, '-');
  const st = fs.statSync(file);
  res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'application/pdf', 'Content-Length': st.size, 'Cache-Control': 'no-store',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${label}-Resume.pdf"` });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  if (req.method === 'GET' && !sec.getSession(parseCookies(req)[COOKIE])) track(req, { type: download ? 'resume_download' : 'resume_view' }, null);
}

/* --------------------------------------------------------------- server */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const method = req.method; const p = url.pathname;
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return send(res, 405, 'Method Not Allowed');

    if (p.startsWith('/api/')) {
      if (p === '/api/site' && method === 'GET') return send(res, 200, publicSite(), { 'Cache-Control': 'no-cache' });
      if (p === '/api/contact' && method === 'POST') { if (!sameOrigin(req)) fail(403, 'Blocked'); return await handleContact(req, res); }
      if (p === '/api/track' && method === 'POST') {
        const rl = sec.rateLimit('track:' + clientIp(req), 240, 60000); if (!rl.ok) return send(res, 204, '');
        const b = await readJson(req, 4000).catch(() => ({})); track(req, b, sec.getSession(parseCookies(req)[COOKIE])); return send(res, 204, '');
      }
      if (p === '/api/health') return send(res, 200, { ok: true });
      if (p.startsWith('/api/admin')) return await adminApi(req, res, url, method);
      return send(res, 404, { error: 'Not found' });
    }
    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

    if (p === '/resume') return serveResume(req, res, url);
    if (p.startsWith('/uploads/')) {
      const name = p.slice(9); if (!/^[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(name)) return send(res, 404, 'Not found'); // PDFs are only served through /resume
      return serveFile(req, res, path.join(UPLOAD_DIR, name)) || send(res, 404, 'Not found');
    }
    if (p === ADMIN_PATH) { res.writeHead(301, { Location: ADMIN_PATH + '/', ...SEC_HEADERS }); return res.end(); }
    if (p.startsWith(ADMIN_PATH + '/')) {
      const rel = p.slice(ADMIN_PATH.length + 1) || 'index.html'; const f = safeJoin(ADMIN_DIR, rel);
      return (f && serveFile(req, res, f, { admin: true })) || send(res, 404, 'Not found');
    }
    if (p === '/admin' || p.startsWith('/admin/')) return send(res, 404, 'Not found');
    const rel = p === '/' ? 'index.html' : p.slice(1); const f = safeJoin(PUBLIC_DIR, rel);
    if (f && serveFile(req, res, f)) return;
    if (!path.extname(p) && serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'))) return;
    send(res, 404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e); if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});

const first = sec.ensureAdmin();
server.listen(PORT, HOST, () => {
  console.log(`\n  Prabesh - The Summit Journey\n  Site:   http://localhost:${PORT}/\n  Admin:  http://localhost:${PORT}${ADMIN_PATH}\n`);
  if (first) {
    console.log('  First run: admin account created');
    console.log(`    username: ${first.username}\n    password: ${first.password}`);
    if (first.generated) console.log('    (also saved in data/FIRST-RUN-CREDENTIALS.txt - you will be asked to change it at first login)');
    console.log('');
  }
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
