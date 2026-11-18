/**
 * Prabesh - The Summit Journey  |  Cloudflare Worker (free plan friendly)
 * - Static site is served from /public by Workers Static Assets
 * - This Worker handles /api/*, /resume, /uploads/*, /prabeshadmin/*
 * - All data (settings, content, messages, analytics, uploaded images + resume) lives in D1
 * No Node APIs are used: only fetch/Request/Response and Web Crypto.
 */
import seedData from '../lib/seed-data.js';

const ADMIN_PATH = '/prabeshadmin';
const COOKIE = 'ps_sid';
const MAX_IMAGE = 1_500_000;   // bytes (admin panel auto-shrinks big photos before upload)
const MAX_PDF = 2_000_000;
const PBKDF2_ITER = 100000;    // Cloudflare's maximum

let DB = null; let ENV = null;

/* ------------------------------------------------------------- db helpers */
const all = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results || [];
const one = async (sql, ...p) => (await DB.prepare(sql).bind(...p).first()) || null;
const run = async (sql, ...p) => DB.prepare(sql).bind(...p).run();
const stmt = (sql, ...p) => DB.prepare(sql).bind(...p);

/* --------------------------------------------------------------- utilities */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
const cleanStr = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const nowDay = (ts = Date.now()) => new Date(ts + Number(ENV.TZ_OFFSET_MINUTES ?? 345) * 60000).toISOString().slice(0, 10);

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};
function send(status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer);
  const payload = isObj ? JSON.stringify(body) : body;
  const noBody = status === 204 || status === 304;
  return new Response(noBody ? null : payload, { status, headers: { ...SEC_HEADERS, 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

const clientIp = (req) => req.headers.get('cf-connecting-ip') || String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
const parseCookies = (req) => Object.fromEntries(String(req.headers.get('cookie') || '').split(';').map((c) => { const i = c.indexOf('='); return i < 0 ? [] : [c.slice(0, i).trim(), c.slice(i + 1).trim()]; }).filter((a) => a.length));

async function readBytes(req, limit) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > limit) fail(413, 'File or request is too large.');
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > limit) fail(413, 'File or request is too large.');
  return buf;
}
async function readJson(req, limit = 1_000_000) {
  const buf = await readBytes(req, limit);
  if (!buf.length) return {};
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) fail(415, 'Content-Type must be application/json');
  try { const v = JSON.parse(new TextDecoder().decode(buf)); return v && typeof v === 'object' ? v : {}; } catch { fail(400, 'Invalid JSON'); }
}

/* --------------------------------------------------------- password hashing */
async function pbkdf2(secret, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashSecret(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toB64(salt)}$${toB64(await pbkdf2(secret, salt, PBKDF2_ITER))}`;
}
async function verifySecret(secret, stored) {
  try {
    const [alg, n, salt, hash] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const exp = fromB64(hash); const got = await pbkdf2(secret, fromB64(salt), Math.min(Number(n) || PBKDF2_ITER, 100000));
    if (got.length !== exp.length) return false;
    let d = 0; for (let i = 0; i < got.length; i++) d |= got[i] ^ exp[i];
    return d === 0;
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
// A dummy hash so unknown usernames cost the same time as known ones
const DUMMY = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/* ----------------------------------------------------------------- sessions */
const SESSION_TTL = 12 * 3600 * 1000, REMEMBER_TTL = 30 * 24 * 3600 * 1000;
async function createSession(adminId, ip, ua, remember) {
  const token = randHex(32), csrf = randHex(24), now = Date.now(), ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  await run('INSERT INTO sessions (token_hash,admin_id,csrf,created_at,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?)', await sha256(token), adminId, csrf, now, now + ttl, ip.slice(0, 64), String(ua || '').slice(0, 200));
  return { token, csrf, ttl };
}
async function getSession(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const th = await sha256(token);
  const row = await one(`SELECT s.token_hash, s.csrf, s.expires_at, a.id, a.username, a.display_name, a.email, a.role, a.must_change, a.security_question
    FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`, th);
  if (!row) return null;
  if (row.expires_at < Date.now()) { await run('DELETE FROM sessions WHERE token_hash = ?', th); return null; }
  return row;
}
const destroySession = async (token) => { if (token) await run('DELETE FROM sessions WHERE token_hash = ?', await sha256(token)); };
const destroyAdminSessions = async (adminId, exceptToken) => run('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?', adminId, exceptToken ? await sha256(exceptToken) : '');
async function createResetToken(adminId) {
  const token = randHex(32);
  await DB.batch([stmt('DELETE FROM reset_tokens WHERE admin_id = ?', adminId), stmt('INSERT INTO reset_tokens (token_hash,admin_id,expires_at) VALUES (?,?,?)', await sha256(token), adminId, Date.now() + 15 * 60 * 1000)]);
  return token;
}
async function consumeResetToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const th = await sha256(token); const row = await one('SELECT admin_id, expires_at FROM reset_tokens WHERE token_hash = ?', th);
  if (!row || row.expires_at < Date.now()) return null;
  await run('DELETE FROM reset_tokens WHERE token_hash = ?', th);
  return row.admin_id;
}
async function rateLimit(key, max, windowMs) {
  const now = Date.now(), reset = now + windowMs;
  await run(`INSERT INTO rate_limits (k,count,reset_at) VALUES (?,1,?)
    ON CONFLICT(k) DO UPDATE SET count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END, reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END`, key, reset, now, now, reset);
  const r = await one('SELECT count, reset_at FROM rate_limits WHERE k = ?', key);
  return { ok: r.count <= max, retryAfter: Math.max(1, Math.ceil((r.reset_at - now) / 1000)) };
}
async function housekeeping() {
  const now = Date.now();
  await DB.batch([stmt('DELETE FROM sessions WHERE expires_at < ?', now), stmt('DELETE FROM reset_tokens WHERE expires_at < ?', now), stmt('DELETE FROM rate_limits WHERE reset_at < ?', now)]);
}

/* ---------------------------------------------------- first-run admin (fallback) */
async function ensureAdmin() {
  const c = await one('SELECT COUNT(*) c FROM admins');
  if (c.c) return;
  const username = String(ENV.ADMIN_USERNAME || 'prabesh').trim(); const password = ENV.ADMIN_PASSWORD;
  if (!password || passwordProblem(password)) return; // admins are normally created by d1/setup.sql
  await run('INSERT INTO admins (username,display_name,email,password_hash,role,must_change,created_at) VALUES (?,?,?,?,?,?,?)', username, 'Prabesh', '', await hashSecret(password), 'super', 0, Date.now());
}

/* ----------------------------------------------------------------- settings */
const { DEFAULT_SETTINGS } = seedData;
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const PUBLIC_KEYS = SETTING_KEYS.filter((k) => k !== 'resume_file');
const URL_KEYS = new Set(['github', 'linkedin', 'portfolio']);
async function allSettings() { const o = {}; for (const r of await all('SELECT key,value FROM settings')) if (!r.key.startsWith('_')) o[r.key] = r.value; return o; }
let SECRET = null;
async function getSecret() {
  if (SECRET) return SECRET;
  const r = await one("SELECT value FROM settings WHERE key = '_secret'");
  if (r) return (SECRET = r.value);
  const s = randHex(32); await run("INSERT OR IGNORE INTO settings (key,value) VALUES ('_secret',?)", s);
  return (SECRET = (await one("SELECT value FROM settings WHERE key = '_secret'")).value);
}

/* --------------------------------------------------------------- validators */
const isUrl = (v) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };
const isMedia = (v) => /^\/(uploads|assets\/img)\/[A-Za-z0-9._-]+$/.test(v);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD = {
  str: (max) => ({ t: 'str', max }), text: (max) => ({ t: 'text', max }), int: () => ({ t: 'int' }), bool: () => ({ t: 'bool' }),
  list: (max = 40, item = 120) => ({ t: 'list', max, item }), url: () => ({ t: 'url' }), media: () => ({ t: 'media' }), ym: () => ({ t: 'ym' }), enm: (vals) => ({ t: 'enum', vals }),
};
function coerce(name, spec, v) {
  switch (spec.t) {
    case 'str': v = cleanStr(v, spec.max); break;
    case 'text': v = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, spec.max); break;
    case 'int': v = Math.max(-100000, Math.min(100000, parseInt(v, 10) || 0)); break;
    case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
    case 'list': { const arr = Array.isArray(v) ? v : String(v ?? '').split(/\r?\n|,/); v = JSON.stringify(arr.map((x) => cleanStr(x, spec.item)).filter(Boolean).slice(0, spec.max)); break; }
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
function crudValidate(cfg, body, partial) {
  const out = {};
  for (const [name, spec] of Object.entries(cfg.fields)) {
    if (!(name in body)) { if (!partial && cfg.required.includes(name)) fail(400, `${name} is required`); continue; }
    out[name] = coerce(name, spec, body[name]);
    if (cfg.required.includes(name) && !out[name]) fail(400, `${name} is required`);
  }
  return out;
}

/* ------------------------------------------------- uploads (stored in D1) */
function sniff(b) {
  const ascii = (s, e) => String.fromCharCode(...b.subarray(s, e));
  if (b.length > 12 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return { ext: '.png', kind: 'image', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: '.jpg', kind: 'image', mime: 'image/jpeg' };
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: '.webp', kind: 'image', mime: 'image/webp' };
  if (b.length > 6 && /^GIF8[79]a/.test(ascii(0, 6))) return { ext: '.gif', kind: 'image', mime: 'image/gif' };
  if (b.length > 5 && ascii(0, 5) === '%PDF-') return { ext: '.pdf', kind: 'pdf', mime: 'application/pdf' };
  return null;
}
const CHUNK = 500_000;
async function saveFile(name, mime, bytes) {
  const b64 = toB64(bytes); const ops = [stmt('INSERT INTO files (name,mime,size,created_at) VALUES (?,?,?,?)', name, mime, bytes.length, Date.now())];
  for (let i = 0, n = 0; i < b64.length; i += CHUNK, n++) ops.push(stmt('INSERT INTO file_chunks (name,idx,data) VALUES (?,?,?)', name, n, b64.slice(i, i + CHUNK)));
  await DB.batch(ops);
}
async function loadFile(name) {
  const meta = await one('SELECT mime,size FROM files WHERE name = ?', name); if (!meta) return null;
  const rows = await all('SELECT data FROM file_chunks WHERE name = ? ORDER BY idx', name);
  return { mime: meta.mime, bytes: fromB64(rows.map((r) => r.data).join('')) };
}
const deleteFile = (name) => DB.batch([stmt('DELETE FROM file_chunks WHERE name = ?', name), stmt('DELETE FROM files WHERE name = ?', name)]);
async function isReferenced(rel) {
  for (const t of ['milestones', 'certificates', 'projects']) if (await one(`SELECT 1 x FROM ${t} WHERE image = ? LIMIT 1`, rel)) return true;
  return !!(await one("SELECT 1 x FROM settings WHERE value = ? LIMIT 1", rel));
}
async function dropUpload(rel) {
  if (!rel || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(rel) || await isReferenced(rel)) return;
  await deleteFile(rel.slice('/uploads/'.length));
}

/* ---------------------------------------------------------------- analytics */
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom/i;
const EVENT_TYPES = new Set(['journey_start', 'journey_skip', 'checkpoint_reached', 'checkpoint_open', 'summit_reached', 'project_github', 'project_live', 'project_open',
  'resume_view', 'resume_download', 'contact_submit', 'cert_open', 'social_click', 'nav_click', 'cta_explore', 'contact_open']);
function deviceOf(ua) { ua = String(ua || ''); if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet'; if (/mobi|iphone|android/i.test(ua)) return 'mobile'; return 'desktop'; }
function refHost(ref, host) { try { const h = new URL(ref).hostname.replace(/^www\./, ''); return h === String(host).split(':')[0].replace(/^www\./, '') ? '' : h; } catch { return ''; } }
async function track(req, body, session) {
  if (session) return; // never count the admin's own browsing
  const ua = req.headers.get('user-agent') || '';
  if (BOT_RE.test(ua)) return;
  const v = (await sha256((await getSecret()) + clientIp(req) + ua)).slice(0, 16); const ts = Date.now(), day = nowDay(ts);
  if (body.type === 'view') {
    const isNew = (await one('SELECT 1 x FROM visits WHERE visitor = ? LIMIT 1', v)) ? 0 : 1;
    await run('INSERT INTO visits (ts,day,visitor,path,referrer,device,country,is_new) VALUES (?,?,?,?,?,?,?,?)', ts, day, v, cleanStr(body.path || '/', 120),
      refHost(cleanStr(body.ref, 300), new URL(req.url).host), deviceOf(ua), cleanStr(req.headers.get('cf-ipcountry') || '', 2).toUpperCase(), isNew);
  } else if (EVENT_TYPES.has(body.type)) {
    await run('INSERT INTO events (ts,day,visitor,type,target) VALUES (?,?,?,?,?)', ts, day, v, body.type, cleanStr(body.target, 120));
  }
}
async function stats(days) {
  days = Math.max(1, Math.min(365, days | 0 || 30));
  const today = nowDay(); const since = nowDay(Date.now() - (days - 1) * 86400000); const prevFrom = nowDay(Date.now() - (2 * days - 1) * 86400000); const t5 = Date.now() - 300000;
  const [totals, prev, todayRow, allRow, dayRows, evDay, online, evCounts, referrers, devices, countries, checkpoints, reached, projectClicks, recent, msg] = await Promise.all([
    one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques, COALESCE(SUM(is_new),0) newv FROM visits WHERE day >= ?', since),
    one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? AND day < ?', prevFrom, since),
    one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day = ?', today),
    one('SELECT COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits'),
    all('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? GROUP BY day', since),
    all('SELECT day, COUNT(*) n FROM events WHERE day >= ? GROUP BY day', since),
    one('SELECT COUNT(DISTINCT visitor) n FROM (SELECT visitor FROM visits WHERE ts > ? UNION ALL SELECT visitor FROM events WHERE ts > ?)', t5, t5),
    all('SELECT type, COUNT(*) total, COUNT(DISTINCT visitor) people FROM events WHERE day >= ? GROUP BY type ORDER BY total DESC', since),
    all("SELECT CASE WHEN referrer = '' THEN 'Direct' ELSE referrer END name, COUNT(*) views, COUNT(DISTINCT visitor) uniques FROM visits WHERE day >= ? GROUP BY name ORDER BY views DESC LIMIT 10", since),
    all('SELECT device name, COUNT(*) views FROM visits WHERE day >= ? GROUP BY device ORDER BY views DESC', since),
    all("SELECT country name, COUNT(*) views FROM visits WHERE day >= ? AND country != '' AND country != 'XX' GROUP BY country ORDER BY views DESC LIMIT 10", since),
    all("SELECT target, COUNT(*) n, COUNT(DISTINCT visitor) people FROM events WHERE day >= ? AND type = 'checkpoint_open' AND target != '' GROUP BY target ORDER BY n DESC LIMIT 10", since),
    all("SELECT target, COUNT(*) n, COUNT(DISTINCT visitor) people FROM events WHERE day >= ? AND type = 'checkpoint_reached' AND target != '' GROUP BY target ORDER BY n DESC LIMIT 10", since),
    all("SELECT type, target, COUNT(*) n FROM events WHERE day >= ? AND type IN ('project_github','project_live','project_open') GROUP BY type, target ORDER BY n DESC LIMIT 12", since),
    all('SELECT ts, path, referrer, device, country, is_new FROM visits ORDER BY id DESC LIMIT 20'),
    one("SELECT COUNT(*) total, COALESCE(SUM(status='unread'),0) unread FROM messages"),
  ]);
  const byDay = new Map(dayRows.map((r) => [r.day, r])), evByDay = new Map(evDay.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) { const d = nowDay(Date.now() - i * 86400000); const r = byDay.get(d); series.push({ day: d, views: r ? r.views : 0, uniques: r ? r.uniques : 0, events: evByDay.get(d) || 0 }); }
  const funnelTypes = ['journey_start', 'checkpoint_reached', 'checkpoint_open', 'summit_reached', 'contact_submit'];
  const funnel = [{ step: 'visited', people: totals.uniques }].concat(funnelTypes.map((t) => ({ step: t, people: (evCounts.find((e) => e.type === t) || { people: 0 }).people })));
  const rates = evCounts.map((e) => ({ type: e.type, total: e.total, people: e.people, rate: totals.uniques ? Math.round((e.people / totals.uniques) * 1000) / 10 : 0 }));
  return { range: days, today, totals: { ...totals, returning: Math.max(0, totals.uniques - totals.newv) }, previous: prev, todayStats: todayRow, allTime: allRow, online: online.n, series,
    referrers, devices, countries, events: rates, funnel, checkpoints, reached, projectClicks, recent, messages: msg, generatedAt: Date.now() };
}

/* --------------------------------------------------------------- public API */
async function publicSite() {
  const s = await allSettings(); const pub = {};
  for (const k of PUBLIC_KEYS) pub[k] = s[k] ?? '';
  pub.has_resume = !!s.resume_file;
  const rows = async (t, order) => (await all(`SELECT * FROM ${t} WHERE published = 1 ORDER BY ${order}`)).map(parseRow);
  const [milestones, certificates, projects, skills] = await Promise.all([rows('milestones', "CASE WHEN start_date = '' THEN '9999' ELSE start_date END, sort_order, id"), rows('certificates', 'sort_order, id'), rows('projects', 'sort_order, id'), rows('skill_categories', 'sort_order, id')]);
  return { settings: pub, milestones, certificates, projects, skills };
}
async function handleContact(req) {
  const ip = clientIp(req);
  const rl = await rateLimit('contact:' + ip, 5, 3600 * 1000);
  if (!rl.ok) fail(429, 'Too many messages. Please try again later.');
  const b = await readJson(req, 20000);
  if (b.website) return send(200, { ok: true }); // honeypot
  if (Number(b.elapsed) < 1500) fail(400, 'Please take a moment to fill in the form.');
  const name = cleanStr(b.name, 80), email = cleanStr(b.email, 254), subject = cleanStr(b.subject, 150);
  const message = String(b.message ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 4000);
  const errors = {};
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  if (message.length < 10) errors.message = 'Message must be at least 10 characters.';
  if (Object.keys(errors).length) return send(422, { error: 'Please check the highlighted fields.', fields: errors });
  await run('INSERT INTO messages (name,email,subject,message,ip_hash,created_at) VALUES (?,?,?,?,?,?)', name, email, subject, message, (await sha256((await getSecret()) + ip)).slice(0, 16), Date.now());
  await track(req, { type: 'contact_submit' }, null);
  return send(200, { ok: true });
}

/* ---------------------------------------------------------------- admin API */
const adminPublic = (a) => ({ id: a.id, username: a.username, display_name: a.display_name, email: a.email, role: a.role, must_change: !!a.must_change, has_security_question: !!a.security_question, security_question: a.security_question });
const cookieHeader = (token, maxAgeSec) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}; Secure`;
const getAdminRow = (id) => one('SELECT * FROM admins WHERE id = ?', id);
const superCount = async () => (await one("SELECT COUNT(*) c FROM admins WHERE role = 'super'")).c;
function sameOrigin(req) { const o = req.headers.get('origin'); if (!o) return true; try { return new URL(o).host === new URL(req.url).host; } catch { return false; } }

async function adminLogin(req) {
  const ip = clientIp(req);
  await ensureAdmin();
  if (Math.random() < 0.05) await housekeeping();
  const rl = await rateLimit('login:' + ip, 10, 15 * 60 * 1000);
  if (!rl.ok) return send(429, { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` }, { 'Retry-After': String(rl.retryAfter) });
  const b = await readJson(req, 5000);
  const username = cleanStr(b.username, 60); const password = String(b.password ?? '').slice(0, 200);
  const a = username ? await one('SELECT * FROM admins WHERE username = ?', username) : null;
  if (a && a.locked_until > Date.now()) return send(429, { error: `Account locked. Try again in ${Math.ceil((a.locked_until - Date.now()) / 60000)} min.` });
  const ok = a ? await verifySecret(password, a.password_hash) : (await verifySecret(password, DUMMY), false);
  if (!ok) {
    if (a) { const f = a.failed_attempts + 1; await run('UPDATE admins SET failed_attempts = ?, locked_until = ? WHERE id = ?', f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, a.id); }
    return send(401, { error: 'Incorrect username or password.' });
  }
  await run('UPDATE admins SET failed_attempts = 0, locked_until = 0, last_login = ? WHERE id = ?', Date.now(), a.id);
  const s = await createSession(a.id, ip, req.headers.get('user-agent'), !!b.remember);
  return send(200, { admin: adminPublic(a), csrf: s.csrf }, { 'Set-Cookie': cookieHeader(s.token, Math.floor(s.ttl / 1000)) });
}
async function adminForgot(req, step) {
  const ip = clientIp(req);
  const rl = await rateLimit('forgot:' + ip, 8, 15 * 60 * 1000);
  if (!rl.ok) return send(429, { error: 'Too many attempts. Try again later.' });
  const b = await readJson(req, 5000);
  if (step === 'question') {
    const a = await one('SELECT security_question q FROM admins WHERE username = ?', cleanStr(b.username, 60));
    return send(200, { question: a && a.q ? a.q : 'What is the answer to your security question?' });
  }
  if (step === 'verify') {
    const a = await one('SELECT * FROM admins WHERE username = ?', cleanStr(b.username, 60));
    if (a && a.locked_until > Date.now()) return send(429, { error: 'Account temporarily locked.' });
    const ok = a && a.security_answer_hash && await verifySecret(normAnswer(b.answer), a.security_answer_hash);
    if (!ok) {
      if (a) { const f = a.failed_attempts + 1; await run('UPDATE admins SET failed_attempts = ?, locked_until = ? WHERE id = ?', f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, a.id); }
      return send(401, { error: 'That answer is not correct. If no security question was set, reset the admin in the D1 console (see README).' });
    }
    return send(200, { token: await createResetToken(a.id) });
  }
  if (step === 'reset') {
    const pw = String(b.password ?? ''); const problem = passwordProblem(pw); if (problem) fail(400, problem);
    const id = await consumeResetToken(String(b.token || '')); if (!id) fail(400, 'Reset link expired. Please start again.');
    await run('UPDATE admins SET password_hash = ?, must_change = 0, failed_attempts = 0, locked_until = 0 WHERE id = ?', await hashSecret(pw), id);
    await destroyAdminSessions(id, null);
    return send(200, { ok: true });
  }
  fail(404, 'Not found');
}

async function adminApi(req, url, method) {
  const sub = url.pathname.slice('/api/admin'.length) || '/';
  if (!sameOrigin(req)) fail(403, 'Cross-origin request blocked');
  if (method === 'POST' && sub === '/login') return adminLogin(req);
  if (method === 'POST' && /^\/forgot\/(question|verify|reset)$/.test(sub)) return adminForgot(req, sub.split('/')[2]);

  const token = parseCookies(req)[COOKIE];
  const me = await getSession(token);
  if (!me) fail(401, 'Please sign in.');
  if (method !== 'GET' && method !== 'HEAD') { if (req.headers.get('x-csrf-token') !== me.csrf) fail(403, 'Security token mismatch. Reload the page.'); }
  const isSuper = me.role === 'super';
  if (me.must_change && !['/me', '/logout', '/me/password'].includes(sub)) fail(403, 'You must change your password first.');
  let m;

  if (sub === '/me' && method === 'GET') return send(200, { admin: adminPublic(me), csrf: me.csrf });
  if (sub === '/logout' && method === 'POST') { await destroySession(token); return send(200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) }); }

  if (sub === '/me' && method === 'PUT') {
    const b = await readJson(req, 10000); const a = await getAdminRow(me.id);
    const upd = { display_name: cleanStr(b.display_name ?? a.display_name, 80), email: cleanStr(b.email ?? a.email, 254), username: a.username, q: a.security_question, h: a.security_answer_hash };
    if (upd.email && !EMAIL_RE.test(upd.email)) fail(400, 'Invalid email address.');
    const newUser = cleanStr(b.username ?? a.username, 60);
    if (newUser !== a.username) {
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(newUser)) fail(400, 'Username: 3-40 letters, numbers, dot, dash or underscore.');
      if (!await verifySecret(String(b.current_password || ''), a.password_hash)) fail(403, 'Enter your current password to change the username.');
      if (await one('SELECT 1 x FROM admins WHERE username = ? AND id != ?', newUser, a.id)) fail(409, 'That username is already taken.');
      upd.username = newUser;
    }
    if (b.security_question !== undefined) {
      const q = cleanStr(b.security_question, 200); const ans = normAnswer(b.security_answer);
      if (q) { if (!ans && !a.security_answer_hash) fail(400, 'Provide an answer for your security question.'); upd.q = q; if (ans) upd.h = await hashSecret(ans); }
      else { upd.q = ''; upd.h = ''; }
    }
    await run('UPDATE admins SET display_name=?, email=?, username=?, security_question=?, security_answer_hash=? WHERE id=?', upd.display_name, upd.email, upd.username, upd.q, upd.h, a.id);
    return send(200, { admin: adminPublic(await getAdminRow(a.id)) });
  }
  if (sub === '/me/password' && method === 'POST') {
    const b = await readJson(req, 5000); const a = await getAdminRow(me.id);
    if (!await verifySecret(String(b.current_password || ''), a.password_hash)) fail(403, 'Current password is incorrect.');
    const problem = passwordProblem(b.password); if (problem) fail(400, problem);
    if (String(b.password) === String(b.current_password)) fail(400, 'Choose a different password.');
    await run('UPDATE admins SET password_hash=?, must_change=0 WHERE id=?', await hashSecret(String(b.password)), a.id);
    await destroyAdminSessions(a.id, token);
    return send(200, { ok: true });
  }

  if (sub === '/stats' && method === 'GET') return send(200, await stats(Number(url.searchParams.get('days'))));

  if (sub === '/settings' && method === 'GET') { const s = await allSettings(); const has = !!s.resume_file; delete s.resume_file; s.has_resume = has; return send(200, { settings: s }); }
  if (sub === '/settings' && method === 'PUT') {
    const b = await readJson(req, 100000); const cur = await allSettings(); const ops = [];
    for (const [k, v] of Object.entries(b.settings || b)) {
      if (!SETTING_KEYS.includes(k) || k === 'resume_file') continue;
      let val = String(v ?? '');
      if (k === 'hero_image') { val = cleanStr(val, 200); if (val && !isMedia(val)) fail(400, 'Invalid hero image'); }
      else if (URL_KEYS.has(k)) { val = cleanStr(val, 300); if (val && !isUrl(val)) fail(400, `${k}: must be a valid http(s) link`); }
      else if (k === 'email') { val = cleanStr(val, 254); if (val && !EMAIL_RE.test(val)) fail(400, 'Invalid contact email'); }
      else val = val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, k.startsWith('about_') || k.endsWith('_text') ? 4000 : 400);
      ops.push(stmt('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, val));
    }
    if (ops.length) await DB.batch(ops);
    if (cur.hero_image !== (await allSettings()).hero_image) await dropUpload(cur.hero_image);
    return send(200, { ok: true });
  }
  if (sub === '/resume' && method === 'DELETE') {
    const cur = (await allSettings()).resume_file; await run("UPDATE settings SET value = '' WHERE key = 'resume_file'");
    if (cur) await dropUpload(cur); return send(200, { ok: true });
  }

  if (sub === '/upload' && method === 'POST') {
    const kind = url.searchParams.get('kind') === 'resume' ? 'resume' : 'image';
    const buf = await readBytes(req, kind === 'resume' ? MAX_PDF : MAX_IMAGE);
    const t = sniff(buf);
    if (!t || (kind === 'resume' && t.kind !== 'pdf') || (kind === 'image' && t.kind !== 'image')) fail(415, kind === 'resume' ? 'Only PDF files are allowed for the resume.' : 'Only PNG, JPG, WEBP or GIF images are allowed.');
    const name = randHex(12) + t.ext;
    await saveFile(name, t.mime, buf);
    if (kind === 'resume') {
      const old = (await allSettings()).resume_file;
      await run("INSERT INTO settings (key,value) VALUES ('resume_file',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", '/uploads/' + name);
      if (old) await dropUpload(old);
      return send(200, { ok: true, has_resume: true });
    }
    return send(200, { url: '/uploads/' + name });
  }

  if (sub === '/messages' && method === 'GET') {
    const status = url.searchParams.get('status'); const qs = cleanStr(url.searchParams.get('q'), 100);
    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1); const limit = Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 25);
    const where = []; const p = [];
    if (status === 'unread' || status === 'read') { where.push('status = ?'); p.push(status); }
    if (qs) { where.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)'); const l = `%${qs.replace(/[%_]/g, '')}%`; p.push(l, l, l, l); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await one(`SELECT COUNT(*) c FROM messages ${W}`, ...p)).c;
    const items = await all(`SELECT id,name,email,subject,message,status,created_at FROM messages ${W} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, limit, (page - 1) * limit);
    return send(200, { items, total, page, limit, unread: (await one("SELECT COUNT(*) c FROM messages WHERE status='unread'")).c });
  }
  if (sub === '/messages/bulk' && method === 'POST') {
    const b = await readJson(req, 20000); const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Number.isInteger).slice(0, 90);
    if (!ids.length) fail(400, 'No messages selected');
    const ph = ids.map(() => '?').join(',');
    if (b.action === 'delete') await run(`DELETE FROM messages WHERE id IN (${ph})`, ...ids);
    else if (b.action === 'read' || b.action === 'unread') await run(`UPDATE messages SET status = ? WHERE id IN (${ph})`, b.action, ...ids);
    else fail(400, 'Unknown action');
    return send(200, { ok: true });
  }
  if ((m = sub.match(/^\/messages\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'PATCH') { const b = await readJson(req, 2000); if (!['read', 'unread'].includes(b.status)) fail(400, 'Invalid status'); await run('UPDATE messages SET status=? WHERE id=?', b.status, id); return send(200, { ok: true }); }
    if (method === 'DELETE') { await run('DELETE FROM messages WHERE id=?', id); return send(200, { ok: true }); }
  }

  if (sub === '/admins' || sub.startsWith('/admins/')) {
    if (!isSuper) fail(403, 'Only a Super Admin can manage admins.');
    const list = async () => (await all('SELECT id,username,display_name,email,role,created_at,last_login,security_question FROM admins ORDER BY id')).map((a) => ({ ...a, has_security_question: !!a.security_question }));
    if (sub === '/admins' && method === 'GET') return send(200, { items: await list() });
    if (sub === '/admins' && method === 'POST') {
      const b = await readJson(req, 10000); const username = cleanStr(b.username, 60);
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'Username: 3-40 letters, numbers, dot, dash or underscore.');
      if (await one('SELECT 1 x FROM admins WHERE username = ?', username)) fail(409, 'That username is already taken.');
      const problem = passwordProblem(b.password); if (problem) fail(400, problem);
      const role = b.role === 'super' ? 'super' : 'editor'; const email = cleanStr(b.email, 254); if (email && !EMAIL_RE.test(email)) fail(400, 'Invalid email address.');
      const q = cleanStr(b.security_question, 200); const ans = normAnswer(b.security_answer);
      await run('INSERT INTO admins (username,display_name,email,password_hash,role,security_question,security_answer_hash,must_change,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        username, cleanStr(b.display_name, 80) || username, email, await hashSecret(b.password), role, q && ans ? q : '', q && ans ? await hashSecret(ans) : '', 1, Date.now());
      return send(201, { items: await list() });
    }
    if ((m = sub.match(/^\/admins\/(\d+)$/))) {
      const id = Number(m[1]); const a = await getAdminRow(id); if (!a) fail(404, 'Admin not found');
      if (method === 'PUT') {
        const b = await readJson(req, 10000);
        const username = cleanStr(b.username ?? a.username, 60); const email = cleanStr(b.email ?? a.email, 254);
        const role = (b.role ?? a.role) === 'super' ? 'super' : 'editor';
        if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) fail(400, 'Invalid username.');
        if (email && !EMAIL_RE.test(email)) fail(400, 'Invalid email address.');
        if (await one('SELECT 1 x FROM admins WHERE username = ? AND id != ?', username, id)) fail(409, 'That username is already taken.');
        if (a.role === 'super' && role !== 'super' && await superCount() <= 1) fail(400, 'There must be at least one Super Admin.');
        if (b.password) { const problem = passwordProblem(b.password); if (problem) fail(400, problem); }
        await run('UPDATE admins SET username=?, display_name=?, email=?, role=? WHERE id=?', username, cleanStr(b.display_name ?? a.display_name, 80), email, role, id);
        if (b.password) {
          await run('UPDATE admins SET password_hash=?, must_change=?, failed_attempts=0, locked_until=0 WHERE id=?', await hashSecret(b.password), id === me.id ? 0 : 1, id);
          if (id !== me.id) await destroyAdminSessions(id, null);
        }
        return send(200, { items: await list() });
      }
      if (method === 'DELETE') {
        if (id === me.id) fail(400, 'You cannot delete your own account.');
        if (a.role === 'super' && await superCount() <= 1) fail(400, 'There must be at least one Super Admin.');
        await run('DELETE FROM admins WHERE id=?', id); return send(200, { items: await list() });
      }
    }
  }

  if ((m = sub.match(/^\/(milestones|certificates|projects|skills)(?:\/(reorder|\d+))?$/))) {
    const cfg = RESOURCES[m[1]]; const T = cfg.table; const arg = m[2];
    if (!arg && method === 'GET') return send(200, { items: (await all(`SELECT * FROM ${T} ORDER BY ${T === 'milestones' ? "CASE WHEN start_date = '' THEN '9999' ELSE start_date END, sort_order, id" : 'sort_order, id'}`)).map(parseRow) });
    if (!arg && method === 'POST') {
      const data = crudValidate(cfg, await readJson(req), false);
      if (!('sort_order' in data)) data.sort_order = (await one(`SELECT COALESCE(MAX(sort_order),0)+1 n FROM ${T}`)).n;
      if (!('published' in data)) data.published = 1;
      const keys = Object.keys(data);
      const r = await run(`INSERT INTO ${T} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k]));
      return send(201, { item: parseRow(await one(`SELECT * FROM ${T} WHERE id = ?`, r.meta.last_row_id)) });
    }
    if (arg === 'reorder' && method === 'POST') {
      const b = await readJson(req, 20000); const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Number.isInteger).slice(0, 90);
      if (ids.length) await DB.batch(ids.map((id, i) => stmt(`UPDATE ${T} SET sort_order = ? WHERE id = ?`, i + 1, id)));
      return send(200, { ok: true });
    }
    if (arg && /^\d+$/.test(arg)) {
      const id = Number(arg); const row = await one(`SELECT * FROM ${T} WHERE id = ?`, id); if (!row) fail(404, 'Not found');
      if (method === 'GET') return send(200, { item: parseRow(row) });
      if (method === 'PUT') {
        const data = crudValidate(cfg, await readJson(req), true); const keys = Object.keys(data);
        if (keys.length) await run(`UPDATE ${T} SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
        for (const f of cfg.media) if (f in data && row[f] !== data[f]) await dropUpload(row[f]);
        return send(200, { item: parseRow(await one(`SELECT * FROM ${T} WHERE id = ?`, id)) });
      }
      if (method === 'DELETE') { await run(`DELETE FROM ${T} WHERE id = ?`, id); for (const f of cfg.media) await dropUpload(row[f]); return send(200, { ok: true }); }
    }
  }
  fail(404, 'Unknown admin endpoint');
}

/* ---------------------------------------------------------- static / routing */
async function serveResume(req, url) {
  const s = await allSettings(); const rel = s.resume_file;
  const f = rel && await loadFile(rel.slice('/uploads/'.length));
  if (!f) return send(404, 'Resume has not been uploaded yet.');
  const download = url.searchParams.get('download') === '1';
  const label = (s.full_name || 'Resume').replace(/[^A-Za-z0-9]+/g, '-');
  const res = new Response(req.method === 'HEAD' ? null : f.bytes, { status: 200, headers: { ...SEC_HEADERS, 'Content-Type': 'application/pdf', 'Content-Length': String(f.bytes.length), 'Cache-Control': 'no-store',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${label}-Resume.pdf"` } });
  if (req.method === 'GET' && !(await getSession(parseCookies(req)[COOKIE]))) await track(req, { type: download ? 'resume_download' : 'resume_view' }, null);
  return res;
}
async function serveAsset(req, pathname, admin) {
  const u = new URL(req.url); u.pathname = pathname; u.search = '';
  const r = await ENV.ASSETS.fetch(new Request(u.toString(), { method: req.method, headers: req.headers }));
  if (r.status === 404) return send(404, 'Not found');
  const h = new Headers(r.headers); for (const [k, v] of Object.entries(SEC_HEADERS)) h.set(k, v);
  if (admin) { h.set('Cache-Control', 'no-store'); h.set('X-Robots-Tag', 'noindex, nofollow'); }
  return new Response(r.body, { status: r.status, headers: h });
}

async function handle(req) {
  const url = new URL(req.url); const method = req.method; const p = url.pathname;
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return send(405, 'Method Not Allowed');
  if (p.startsWith('/api/')) {
    if (p === '/api/site' && method === 'GET') return send(200, await publicSite(), { 'Cache-Control': 'no-cache' });
    if (p === '/api/contact' && method === 'POST') { if (!sameOrigin(req)) fail(403, 'Blocked'); return await handleContact(req); }
    if (p === '/api/track' && method === 'POST') {
      const b = await readJson(req, 4000).catch(() => ({})); await track(req, b, await getSession(parseCookies(req)[COOKIE])); return send(204, null);
    }
    if (p === '/api/health') return send(200, { ok: true });
    if (p.startsWith('/api/admin')) return await adminApi(req, url, method);
    return send(404, { error: 'Not found' });
  }
  if (p === '/resume' && (method === 'GET' || method === 'HEAD')) return serveResume(req, url);
  if (p.startsWith('/uploads/') && (method === 'GET' || method === 'HEAD')) {
    const name = p.slice(9); if (!/^[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(name)) return send(404, 'Not found'); // PDFs only via /resume
    const f = await loadFile(name); if (!f) return send(404, 'Not found');
    return new Response(method === 'HEAD' ? null : f.bytes, { status: 200, headers: { ...SEC_HEADERS, 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (method !== 'GET' && method !== 'HEAD') return send(405, 'Method Not Allowed');
  if (p === ADMIN_PATH) return new Response(null, { status: 301, headers: { Location: ADMIN_PATH + '/', ...SEC_HEADERS } });
  if (p.startsWith(ADMIN_PATH + '/')) { const rel = p.slice(ADMIN_PATH.length); return serveAsset(req, '/admin' + (rel === '/' ? '/' : rel), true); }
  if (p === '/admin' || p.startsWith('/admin/')) return send(404, 'Not found');
  return serveAsset(req, p, false);
}

export default {
  async fetch(req, env) {
    DB = env.DB; ENV = env;
    try { return await handle(req); }
    catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error(e && e.stack || e); return send(500, { error: 'Server error' });
    }
  },
};
