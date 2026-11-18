/* Admin panel – vanilla ES module, no inline scripts (CSP-safe). */
const API = '/api/admin';
const app = document.getElementById('app');
let csrf = '', me = null, unread = 0;

/* ---------- helpers ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const svgNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtDate = (ts) => ts ? new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const ago = (ts) => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; };

function toast(text, kind = 'ok') {
  const t = h('div', { class: 'toast ' + kind }, text); document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
}
async function api(path, { method = 'GET', body, raw, ctype } = {}) {
  const headers = {};
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  let payload;
  if (raw) { payload = raw; headers['Content-Type'] = ctype || 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(API + path, { method, headers, body: payload, credentials: 'same-origin' });
  let data = {}; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`); err.status = r.status; err.fields = data.fields;
    if (r.status === 401 && me) { me = null; renderLogin('Your session expired. Please sign in again.'); }
    throw err;
  }
  return data;
}
function modal(content, small) {
  const prev = document.activeElement;
  const dlg = h('div', { class: 'dlg' + (small ? ' sm' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const wrap = h('div', { class: 'modal' }, dlg);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); prev && prev.focus && prev.focus(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  const f = dlg.querySelector('input,textarea,select,button'); f && f.focus();
  return { close, dlg };
}
function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((res) => {
    const m = modal([h('h2', {}, title), h('p', {}, text), h('div', { class: 'acts' },
      h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Cancel'),
      h('button', { class: 'btn dng', onclick: () => { m.close(); res(true); } }, okLabel))], true);
  });
}
const field = (label, input, hint) => h('div', { class: 'f' }, h('label', {}, label), input, hint && h('div', { class: 'hint' }, hint));
const inp = (name, v = '', type = 'text', extra = {}) => h('input', { name, type, value: v ?? '', ...extra });

/* ---------- icons ---------- */
const ICON = {
  dash: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  site: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21m0-18C9.5 5.4 8.2 8.4 8.2 12s1.3 6.6 3.8 9M3.5 9h17M3.5 15h17',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zm12-10a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6',
  cert: 'M12 15a6 6 0 100-12 6 6 0 000 12zm-3 .5L8 22l4-2 4 2-1-6.5',
  proj: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  skill: 'M12 2l2.9 6.3 6.9.7-5.1 4.6 1.5 6.8L12 17l-6.2 3.4 1.5-6.8L2.2 9l6.9-.7L12 2z',
  mail: 'M3 6h18v12H3V6zm0 0l9 7 9-7',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1m10-11a4 4 0 11-8 0 4 4 0 018 0zm8 11v-1a4 4 0 00-3-3.9M16 5.1a4 4 0 010 7.8',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0',
  out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9',
};
const icon = (k) => S('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, S('path', { d: ICON[k] }));

/* ================= AUTH ================= */
function authShell(title, lead, ...kids) {
  app.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, 'PB'), h('div', {}, h('b', {}, 'Summit Journey'), h('small', {}, 'Admin panel'))),
    h('h1', {}, title), lead && h('p', { class: 'lead' }, lead), ...kids)));
}
function renderLogin(note) {
  const err = h('div', { class: 'msg bad', hidden: true }); if (note) { err.textContent = note; err.hidden = false; }
  const u = inp('username', '', 'text', { autocomplete: 'username', required: true, autocapitalize: 'none' });
  const p = inp('password', '', 'password', { autocomplete: 'current-password', required: true });
  const rem = h('input', { type: 'checkbox' });
  const btn = h('button', { class: 'btn pri block', type: 'submit' }, 'Sign in');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; err.hidden = true;
    try { const d = await api('/login', { method: 'POST', body: { username: u.value, password: p.value, remember: rem.checked } }); me = d.admin; csrf = d.csrf; start(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; p.value = ''; p.focus(); }
  } }, err, field('Username', u), field('Password', p),
  h('div', { class: 'f chk' }, h('label', {}, rem, 'Keep me signed in on this device')), btn,
  h('div', { class: 'switch' }, h('button', { type: 'button', onclick: renderForgot }, 'Forgot password?')));
  authShell('Welcome back', 'Sign in to manage the portfolio.', form); u.focus();
}
function renderForgot() {
  const err = h('div', { class: 'msg bad', hidden: true }); const box = h('div');
  const show = (m) => { err.textContent = m; err.hidden = !m; };
  let username = '', token = '';
  function step1() {
    const u = inp('username', username, 'text', { required: true, autocapitalize: 'none' });
    box.replaceChildren(h('form', { onsubmit: async (e) => { e.preventDefault(); show(''); username = u.value;
      try { const d = await api('/forgot/question', { method: 'POST', body: { username } }); step2(d.question); } catch (x) { show(x.message); } } },
    field('Username', u), h('button', { class: 'btn pri block' }, 'Continue'))); u.focus();
  }
  function step2(q) {
    const a = inp('answer', '', 'text', { required: true, autocomplete: 'off' });
    box.replaceChildren(h('form', { onsubmit: async (e) => { e.preventDefault(); show('');
      try { const d = await api('/forgot/verify', { method: 'POST', body: { username, answer: a.value } }); token = d.token; step3(); } catch (x) { show(x.message); } } },
    h('div', { class: 'msg info' }, q), field('Your answer', a), h('button', { class: 'btn pri block' }, 'Verify'))); a.focus();
  }
  function step3() {
    const p1 = inp('p1', '', 'password', { required: true, autocomplete: 'new-password' }), p2 = inp('p2', '', 'password', { required: true, autocomplete: 'new-password' });
    box.replaceChildren(h('form', { onsubmit: async (e) => { e.preventDefault(); show('');
      if (p1.value !== p2.value) return show('Passwords do not match.');
      try { await api('/forgot/reset', { method: 'POST', body: { token, password: p1.value } }); renderLogin(); toast('Password updated. Please sign in.'); } catch (x) { show(x.message); } } },
    field('New password', p1, 'At least 10 characters with letters and numbers.'), field('Repeat new password', p2), h('button', { class: 'btn pri block' }, 'Set new password'))); p1.focus();
  }
  authShell('Reset password', 'Answer your security question to choose a new password.', err, box,
    h('div', { class: 'switch' }, h('button', { type: 'button', onclick: () => renderLogin() }, '← Back to sign in')));
  step1();
}
function renderForceChange() {
  const err = h('div', { class: 'msg bad', hidden: true });
  const c = inp('c', '', 'password', { required: true, autocomplete: 'current-password' }), p1 = inp('p1', '', 'password', { required: true, autocomplete: 'new-password' }), p2 = inp('p2', '', 'password', { required: true, autocomplete: 'new-password' });
  authShell('Choose a new password', 'For your security, replace the temporary password before continuing.', h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; if (p1.value !== p2.value) { err.textContent = 'Passwords do not match.'; err.hidden = false; return; }
    try { await api('/me/password', { method: 'POST', body: { current_password: c.value, password: p1.value } }); me.must_change = false; toast('Password changed.'); start(); }
    catch (x) { err.textContent = x.message; err.hidden = false; } } },
  err, field('Temporary password', c), field('New password', p1, 'At least 10 characters with letters and numbers.'), field('Repeat new password', p2), h('button', { class: 'btn pri block' }, 'Save and continue'),
  h('div', { class: 'switch' }, h('button', { type: 'button', onclick: logout }, 'Sign out'))));
  c.focus();
}
async function logout() { try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ } me = null; csrf = ''; clearInterval(timer); renderLogin(); }

/* ================= SHELL / ROUTER ================= */
const PAGES = [
  { id: 'dashboard', label: 'Dashboard', ic: 'dash', fn: pageDashboard },
  { id: 'site', label: 'Site content', ic: 'site', fn: pageSite },
  { id: 'journey', label: 'Journey (road)', ic: 'route', fn: () => crudPage(CFG.milestones) },
  { id: 'certificates', label: 'Certificates', ic: 'cert', fn: () => crudPage(CFG.certificates) },
  { id: 'projects', label: 'Projects', ic: 'proj', fn: () => crudPage(CFG.projects) },
  { id: 'skills', label: 'Skills', ic: 'skill', fn: () => crudPage(CFG.skills) },
  { id: 'messages', label: 'Messages', ic: 'mail', fn: pageMessages },
  { id: 'admins', label: 'Admins', ic: 'users', fn: pageAdmins, superOnly: true },
  { id: 'account', label: 'My account', ic: 'me', fn: pageAccount },
];
let timer = null;
function start() {
  if (!me) return renderLogin();
  if (me.must_change) return renderForceChange();
  addEventListener('hashchange', route);
  route(true);
}
async function route(first) {
  if (!me || me.must_change) return;
  const id = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  const page = PAGES.find((p) => p.id === id && (!p.superOnly || me.role === 'super')) || PAGES[0];
  clearInterval(timer);
  if (first === true || !document.getElementById('view')) buildShell();
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.id === page.id));
  document.getElementById('side').classList.remove('open');
  const view = document.getElementById('view'); view.replaceChildren(h('p', { class: 'boot' }, 'Loading…'));
  document.title = page.label + ' · Admin';
  try { const node = await page.fn(); view.replaceChildren(h('div', { class: 'top' }, h('button', { class: 'btn burger', 'aria-label': 'Menu', onclick: () => document.getElementById('side').classList.toggle('open') }, '☰'), h('h1', {}, page.label), node.actions || null), node.el || node); }
  catch (x) { if (x.status !== 401) view.replaceChildren(h('div', { class: 'msg bad' }, x.message)); }
  refreshUnread();
}
function buildShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Admin' }, PAGES.filter((p) => !p.superOnly || me.role === 'super').map((p) =>
    h('a', { href: '#/' + p.id, 'data-id': p.id }, icon(p.ic), p.label, p.id === 'messages' ? h('span', { class: 'bdg', id: 'unreadBdg', hidden: true }) : null)));
  app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side', id: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, 'PB'), h('div', {}, h('b', {}, 'Summit Journey'), h('small', {}, 'Admin panel'))), nav,
      h('a', { class: 'btn sm', href: '/', target: '_blank', rel: 'noopener', style: 'margin:10px 4px 0' }, 'View website ↗'),
      h('div', { class: 'foot' }, h('b', {}, me.display_name || me.username), h('span', {}, me.role === 'super' ? 'Super admin' : 'Editor'),
        h('button', { class: 'btn sm block', style: 'margin-top:10px', onclick: logout }, icon('out'), 'Sign out'))),
    h('main', { class: 'main', id: 'view' })));
}
async function refreshUnread() {
  try { const d = await api('/messages?limit=1&status=unread'); unread = d.unread; const b = document.getElementById('unreadBdg'); if (b) { b.textContent = unread; b.hidden = !unread; } } catch { /* ignore */ }
}

/* ================= DASHBOARD ================= */
const EVENT_LABEL = { journey_start: 'Started the journey', checkpoint_reached: 'Reached a checkpoint', checkpoint_open: 'Opened a checkpoint', summit_reached: 'Reached the summit', contact_submit: 'Sent a message', cta_explore: 'Clicked Explore achievements', journey_skip: 'Skipped the climb', nav_click: 'Used the menu', project_github: 'Clicked project GitHub', project_live: 'Clicked project live link', project_open: 'Opened a project', resume_download: 'Downloaded the resume', visited: 'Visited' };
const evl = (t) => EVENT_LABEL[t] || t.replace(/_/g, ' ');
let range = 30;
async function pageDashboard() {
  const root = h('div'); const actions = h('div', { class: 'seg' }, [7, 30, 90].map((d) => h('button', { class: d === range ? 'on' : '', onclick: () => { range = d; route(); } }, d + ' days')));
  async function load() {
    const d = await api('/stats?days=' + range);
    const delta = (a, b) => { if (!b) return a ? h('span', { class: 'up' }, 'new') : h('span', {}, '—'); const p = Math.round(((a - b) / b) * 100); return h('span', { class: p >= 0 ? 'up' : 'down' }, (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% vs previous'); };
    const clicks = d.events.filter((e) => !['checkpoint_reached'].includes(e.type)).reduce((s, e) => s + e.total, 0);
    const kpi = (l, v, sub) => h('div', { class: 'card kpi' }, h('small', {}, l), h('b', {}, v), h('span', {}, sub));
    const maxF = Math.max(1, ...d.funnel.map((f) => f.people));
    const bars = (rows, key, val, label) => rows.length ? h('table', { class: 'tbl' }, rows.map((r) => h('tr', {}, h('td', {}, label ? label(r) : r[key]), h('td', { style: 'width:38%' }, h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(3, (r[val] / Math.max(...rows.map((x) => x[val]))) * 100)}%` }))), h('td', { style: 'text-align:right' }, fmtNum(r[val]))))) : h('p', { class: 'empty' }, 'No data yet.');
    root.replaceChildren(
      h('div', { class: 'cards' },
        kpi('Page views', fmtNum(d.totals.views), delta(d.totals.views, d.previous.views)),
        kpi('Unique visitors', fmtNum(d.totals.uniques), delta(d.totals.uniques, d.previous.uniques)),
        kpi('Online now', fmtNum(d.online), 'active in last 5 min'),
        kpi('Today', fmtNum(d.todayStats.views), fmtNum(d.todayStats.uniques) + ' unique'),
        kpi('Interactions', fmtNum(clicks), d.totals.uniques ? (clicks / d.totals.uniques).toFixed(1) + ' per visitor' : 'clicks & actions'),
        kpi('Unread messages', fmtNum(d.messages.unread), fmtNum(d.messages.total) + ' total')),
      h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, 'Traffic'), h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--gold)' }), 'Views'), h('span', {}, h('i', { style: 'background:var(--blue)' }), 'Unique visitors')), chart(d.series)),
      h('div', { class: 'cols' },
        h('div', { class: 'card' }, h('h2', {}, 'Visitor journey (people)'), h('table', { class: 'tbl' }, d.funnel.map((f, i) => h('tr', {}, h('td', {}, evl(f.step)), h('td', { style: 'width:36%' }, h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(2, (f.people / maxF) * 100)}%` }))),
          h('td', { style: 'text-align:right' }, fmtNum(f.people), i && d.funnel[0].people ? h('small', { style: 'color:var(--mut)' }, ` · ${Math.round(f.people / d.funnel[0].people * 100)}%`) : null))))),
        h('div', { class: 'card' }, h('h2', {}, 'Click & event rate'), d.events.length ? h('div', { class: 'wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Action'), h('th', {}, 'Total'), h('th', {}, 'People'), h('th', {}, 'Rate'))),
          h('tbody', {}, d.events.map((e) => h('tr', {}, h('td', {}, evl(e.type)), h('td', {}, fmtNum(e.total)), h('td', {}, fmtNum(e.people)), h('td', {}, e.rate + '%')))))) : h('p', { class: 'empty' }, 'No interactions yet.'))),
      h('div', { class: 'cols' },
        h('div', { class: 'card' }, h('h2', {}, 'Top referrers'), bars(d.referrers, 'name', 'views')),
        h('div', { class: 'card' }, h('h2', {}, 'Devices'), bars(d.devices, 'name', 'views')),
        h('div', { class: 'card' }, h('h2', {}, 'Most opened checkpoints'), bars(d.checkpoints, 'target', 'n')),
        h('div', { class: 'card' }, h('h2', {}, 'Project clicks'), bars(d.projectClicks, 'target', 'n', (r) => `${r.target || '—'} · ${evl(r.type).replace('Clicked project ', '')}`))),
      h('div', { class: 'card' }, h('h2', {}, 'Recent visits'), d.recent.length ? h('div', { class: 'wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['When', 'Page', 'From', 'Device', 'Visitor'].map((t) => h('th', {}, t)))),
        h('tbody', {}, d.recent.map((r) => h('tr', {}, h('td', {}, ago(r.ts)), h('td', {}, r.path), h('td', {}, r.referrer || 'Direct'), h('td', {}, r.device), h('td', {}, h('span', { class: 'pill ' + (r.is_new ? 'g' : 'b') }, r.is_new ? 'new' : 'returning'))))))) : h('p', { class: 'empty' }, 'No visits recorded yet.')));
  }
  await load();
  timer = setInterval(() => load().catch(() => {}), 30000);
  return { el: root, actions };
}
function chart(series) {
  const W = 900, H = 260, L = 38, B = 28, T = 10, R = 10;
  const max = Math.max(4, ...series.map((s) => s.views)); const nice = Math.ceil(max / 4) * 4;
  const x = (i) => L + (series.length === 1 ? 0 : (i / (series.length - 1)) * (W - L - R)); const y = (v) => T + (1 - v / nice) * (H - T - B);
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Views and unique visitors per day', style: 'width:100%;height:auto' });
  for (let i = 0; i <= 4; i++) { const v = (nice / 4) * i; svg.append(S('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,.08)' }), S('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v)))); }
  const step = Math.ceil(series.length / 8);
  series.forEach((s, i) => { if (i % step === 0 || i === series.length - 1) svg.append(S('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, s.day.slice(5))); });
  const line = (key, color, fill) => {
    const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`);
    if (fill) svg.append(S('path', { d: `M${x(0)},${y(0)} L${pts.join(' L')} L${x(series.length - 1)},${y(0)}Z`, fill: color, 'fill-opacity': 0.12 }));
    svg.append(S('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  };
  line('views', '#f6c453', true); line('uniques', '#6cb6ff', false);
  const tip = S('g', { opacity: 0 }); const tl = S('line', { y1: T, y2: H - B, stroke: 'rgba(255,255,255,.3)' }); const tt = S('text', { 'text-anchor': 'middle', style: 'fill:#fff;font-weight:700' }); tip.append(tl, tt); svg.append(tip);
  svg.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(series.length - 1, Math.round(((px - L) / (W - L - R)) * (series.length - 1)))); const s = series[i];
    tl.setAttribute('x1', x(i)); tl.setAttribute('x2', x(i)); tt.setAttribute('x', Math.min(W - 90, Math.max(90, x(i)))); tt.setAttribute('y', T + 12); tt.textContent = `${s.day}: ${s.views} views · ${s.uniques} visitors`; tip.setAttribute('opacity', 1); });
  svg.addEventListener('pointerleave', () => tip.setAttribute('opacity', 0));
  return svg;
}

/* ================= IMAGE FIELD ================= */
/* Big photos are shrunk in the browser (max 1800px, WEBP) so they fit the free database limits. */
async function shrinkImage(file) {
  if (file.type === 'image/gif' || (file.size < 900000 && file.type !== '')) { if (file.size < 900000) return file; }
  const bmp = await createImageBitmap(file); const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.86, 0.72, 0.58]) { const b = await new Promise((r) => c.toBlob(r, 'image/webp', q)); if (b && b.size < 1400000) return b; }
  throw new Error('That image is still too large. Please choose a smaller one.');
}
function imageField(label, value, onChange) {
  let cur = value || ''; const prev = h('div'); const status = h('span', { class: 'hint' });
  const draw = () => prev.replaceChildren(cur ? h('img', { src: cur, alt: '' }) : h('div', { class: 'noimg' }, 'No image'));
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: async () => {
    let f = file.files[0]; if (!f) return; status.textContent = 'Preparing…';
    try { f = await shrinkImage(f); status.textContent = 'Uploading…'; const d = await api('/upload?kind=image', { method: 'POST', raw: f, ctype: f.type }); cur = d.url; draw(); onChange(cur); status.textContent = 'Uploaded. Save to apply.'; } catch (x) { status.textContent = ''; toast(x.message, 'bad'); }
    file.value = ''; } });
  draw();
  const box = h('div', { class: 'imgfield' }, prev, h('div', {}, h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, 'Upload image'), ' ',
    h('button', { type: 'button', class: 'btn sm', onclick: () => { cur = ''; draw(); onChange(''); } }, 'Remove'), h('div', {}, status)), file);
  return field(label, box, 'PNG, JPG, WEBP or GIF. Large photos are shrunk automatically.');
}

/* ================= SITE CONTENT ================= */
const SITE_GROUPS = [
  ['Hero (top of the page)', [['hero_image', 'Main image', 'image'], ['name', 'Display name (the big word)'], ['hero_badge', 'Small line above the name'], ['title', 'Job title'], ['hero_headline', 'Tagline / headline'], ['hero_subtitle', 'Sub-tagline', 'textarea'], ['location', 'Location']]],
  ['About', [['about_quote', 'Quote', 'textarea'], ['about_intro', 'Introduction', 'textarea'], ['about_interests', 'Interests', 'textarea'], ['about_direction', 'Career direction', 'textarea'], ['about_approach', 'Approach', 'textarea'], ['about_mindset', 'Mindset', 'textarea']]],
  ['Contact details', [['email', 'Public email'], ['phone', 'Phone'], ['github', 'GitHub URL'], ['linkedin', 'LinkedIn URL'], ['portfolio', 'Other website URL'], ['contact_heading', 'Contact heading'], ['contact_text', 'Contact text', 'textarea']]],
  ['Summit finale', [['summit_title', 'Summit title'], ['summit_quote', 'Summit quote', 'textarea'], ['summit_roles', 'Roles line'], ['final_message', 'Closing message', 'textarea']]],
  ['Search & browser', [['site_title', 'Browser tab title'], ['meta_description', 'Search description', 'textarea'], ['full_name', 'Full name']]],
];
async function pageSite() {
  const { settings } = await api('/settings'); const vals = { ...settings }; const root = h('div');
  const err = h('div', { class: 'msg bad', hidden: true });
  const groups = SITE_GROUPS.map(([title, fields]) => h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, title), h('div', { class: 'grid2' },
    fields.map(([k, label, type]) => {
      if (type === 'image') return imageField(label, vals[k], (v) => { vals[k] = v; });
      const el = type === 'textarea' ? h('textarea', { value: vals[k] ?? '' }) : inp(k, vals[k]);
      el.addEventListener('input', () => { vals[k] = el.value; });
      const f = field(label, el); if (type === 'textarea') f.style.gridColumn = '1/-1'; return f;
    }))));
  // resume
  const resumeBox = h('div'); const rfile = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async () => {
    const f = rfile.files[0]; if (!f) return;
    try { await api('/upload?kind=resume', { method: 'POST', raw: f, ctype: 'application/pdf' }); vals.has_resume = true; drawResume(); toast('Resume uploaded.'); } catch (x) { toast(x.message, 'bad'); } rfile.value = ''; } });
  function drawResume() {
    resumeBox.replaceChildren(h('p', { style: 'margin-bottom:10px;color:var(--mut)' }, vals.has_resume ? 'A resume PDF is live. Visitors can view and download it.' : 'No resume uploaded yet — the Resume buttons stay hidden until you add one.'),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => rfile.click() }, vals.has_resume ? 'Replace PDF' : 'Upload PDF'), h('span', { class: 'hint', style: 'align-self:center' }, 'PDF up to 2 MB'),
        vals.has_resume ? h('a', { class: 'btn', href: '/resume', target: '_blank', rel: 'noopener' }, 'Preview') : null,
        vals.has_resume ? h('button', { class: 'btn dng', onclick: async () => { if (await confirmBox('Remove resume?', 'The Resume buttons will disappear from the website.', 'Remove')) { await api('/resume', { method: 'DELETE' }); vals.has_resume = false; drawResume(); toast('Resume removed.'); } } }, 'Remove') : null, rfile));
  }
  drawResume();
  const save = h('button', { class: 'btn pri', onclick: async () => {
    err.hidden = true; save.disabled = true;
    try { const out = { ...vals }; delete out.has_resume; await api('/settings', { method: 'PUT', body: { settings: out } }); toast('Site content saved.'); } catch (x) { err.textContent = x.message; err.hidden = false; scrollTo(0, 0); }
    save.disabled = false; } }, 'Save all changes');
  root.append(err, ...groups, h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, 'Resume'), resumeBox), h('div', { class: 'toolbar' }, save, h('a', { class: 'btn', href: '/', target: '_blank', rel: 'noopener' }, 'Open website ↗')));
  return root;
}

/* ================= GENERIC CRUD ================= */
const CATS = [['education', 'Education'], ['training', 'Training'], ['certificate', 'Certificate'], ['experience', 'Experience'], ['other', 'Other']];
const CFG = {
  milestones: { path: '/milestones', one: 'checkpoint', nameKey: 'title',
    intro: 'Each checkpoint is a flag on the climbing road. Position on the mountain follows the Start date, so keep it accurate (YYYY or YYYY-MM).',
    cols: [['image', 'img'], ['title', 'Checkpoint', (r) => h('div', {}, h('b', {}, r.title), h('div', { style: 'color:var(--mut);font-size:.82rem' }, r.organization))], ['category', 'Type', (r) => h('span', { class: 'pill y' }, r.category)], ['date_label', 'Dates'], ['start_date', 'Start']],
    fields: [['category', 'Type', 'select', CATS], ['title', 'Title', 'text', null, true], ['organization', 'Institution / organisation'], ['date_label', 'Date label shown on the site', 'text', null, false, 'e.g. 2021–2026 or March 2024 – March 2025'], ['start_date', 'Start date (sets position on the road)', 'text', null, false, 'YYYY or YYYY-MM, e.g. 2021-01'],
      ['description', 'Description', 'textarea'], ['skills', 'Skills (one per line)', 'list'], ['quote', 'Short quote'], ['image', 'Photo / certificate image', 'image'], ['sort_order', 'Order (tie-breaker)', 'number'], ['published', 'Published on website', 'bool']],
    blank: { category: 'education', published: 1 } },
  certificates: { path: '/certificates', one: 'certificate', nameKey: 'title',
    cols: [['image', 'img'], ['title', 'Certificate', (r) => h('div', {}, h('b', {}, r.title), h('div', { style: 'color:var(--mut);font-size:.82rem' }, r.issuer))], ['date_label', 'Date'], ['published', 'Status', (r) => h('span', { class: 'pill ' + (r.published ? 'g' : '') }, r.published ? 'Live' : 'Hidden')]],
    fields: [['title', 'Title', 'text', null, true], ['issuer', 'Issuer'], ['date_label', 'Date label'], ['issue_date', 'Issue date (sorting)', 'text', null, false, 'YYYY or YYYY-MM'], ['description', 'Description', 'textarea'], ['image', 'Certificate image', 'image'], ['credential_url', 'Verification link (https://…)', 'text'], ['sort_order', 'Order', 'number'], ['published', 'Published on website', 'bool']], blank: { published: 1 } },
  projects: { path: '/projects', one: 'project', nameKey: 'name',
    cols: [['image', 'img'], ['name', 'Project', (r) => h('b', {}, r.name)], ['status', 'Status'], ['tech', 'Tech', (r) => (r.tech || []).join(', ')], ['published', 'Visible', (r) => h('span', { class: 'pill ' + (r.published ? 'g' : '') }, r.published ? 'Live' : 'Hidden')]],
    fields: [['name', 'Name', 'text', null, true], ['status', 'Status', 'text', null, false, 'e.g. Completed, In progress'], ['description', 'Description', 'textarea'], ['tech', 'Technologies (one per line)', 'list'], ['features', 'Key features (one per line)', 'list'], ['github_url', 'GitHub link'], ['live_url', 'Live demo link'], ['image', 'Screenshot', 'image'], ['sort_order', 'Order', 'number'], ['published', 'Published on website', 'bool']], blank: { published: 1 } },
  skills: { path: '/skills', one: 'skill group', nameKey: 'title',
    intro: 'Skills are shown as tags, grouped by category — no made-up percentages.',
    cols: [['title', 'Category', (r) => h('b', {}, r.title)], ['items', 'Skills', (r) => (r.items || []).join(', ')], ['published', 'Visible', (r) => h('span', { class: 'pill ' + (r.published ? 'g' : '') }, r.published ? 'Live' : 'Hidden')]],
    fields: [['title', 'Category name', 'text', null, true], ['items', 'Skills (one per line)', 'list'], ['sort_order', 'Order', 'number'], ['published', 'Published on website', 'bool']], blank: { published: 1 } },
};
async function crudPage(cfg) {
  const root = h('div'); let items = (await api(cfg.path)).items;
  const add = h('button', { class: 'btn pri', onclick: () => edit(null) }, '+ Add ' + cfg.one);
  function draw() {
    root.replaceChildren(cfg.intro ? h('div', { class: 'msg info' }, cfg.intro) : null,
      items.length ? h('div', { class: 'card wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, cfg.cols.map((c) => h('th', {}, c[1] === 'img' ? '' : c[1])), h('th', {}))),
        h('tbody', {}, items.map((r) => h('tr', {}, cfg.cols.map(([k, , fn]) => h('td', {}, k === 'image' && fn === undefined && cfg.cols.find((c) => c[0] === 'image')[1] === 'img' ? (r.image ? h('img', { class: 'thumb', src: r.image, alt: '' }) : h('div', { class: 'thumb' })) : fn ? fn(r) : (r[k] == null ? '' : String(r[k])))),
          h('td', {}, h('div', { class: 'row-actions' },
            h('button', { class: 'btn sm', title: 'Move up', 'aria-label': 'Move up', onclick: () => move(r, -1) }, '↑'), h('button', { class: 'btn sm', title: 'Move down', 'aria-label': 'Move down', onclick: () => move(r, 1) }, '↓'),
            h('button', { class: 'btn sm', onclick: () => edit(r) }, 'Edit'), h('button', { class: 'btn sm dng', onclick: () => del(r) }, 'Delete'))))))))
        : h('div', { class: 'card empty' }, `No ${cfg.one}s yet. Click “Add ${cfg.one}” to create the first one.`));
  }
  async function move(r, d) {
    const i = items.indexOf(r), j = i + d; if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    try { await api(cfg.path + '/reorder', { method: 'POST', body: { ids: items.map((x) => x.id) } }); items = (await api(cfg.path)).items; draw(); } catch (x) { toast(x.message, 'bad'); }
  }
  async function del(r) {
    if (!await confirmBox(`Delete this ${cfg.one}?`, `“${r[cfg.nameKey]}” will be permanently removed from the website.`)) return;
    try { await api(`${cfg.path}/${r.id}`, { method: 'DELETE' }); items = items.filter((x) => x.id !== r.id); draw(); toast('Deleted.'); } catch (x) { toast(x.message, 'bad'); }
  }
  function edit(r) {
    const data = { ...(cfg.blank || {}), ...(r || {}) }; const err = h('div', { class: 'msg bad', hidden: true }); const ctrls = {};
    const form = h('div', { class: 'grid2' }, cfg.fields.map(([k, label, type, opts, req, hint]) => {
      let f;
      if (type === 'image') return Object.assign(imageField(label, data[k], (v) => { data[k] = v; }), { style: 'grid-column:1/-1' });
      if (type === 'select') { const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v, selected: data[k] === v }, l))); ctrls[k] = () => s.value; f = field(label, s); }
      else if (type === 'bool') { const c = h('input', { type: 'checkbox', checked: !!data[k] }); ctrls[k] = () => c.checked ? 1 : 0; f = h('div', { class: 'f chk' }, h('label', {}, c, label)); }
      else if (type === 'list') { const t = h('textarea', { value: (data[k] || []).join('\n') }); ctrls[k] = () => t.value.split('\n').map((x) => x.trim()).filter(Boolean); f = field(label, t, hint); f.style.gridColumn = '1/-1'; }
      else if (type === 'textarea') { const t = h('textarea', { value: data[k] || '' }); ctrls[k] = () => t.value; f = field(label, t, hint); f.style.gridColumn = '1/-1'; }
      else if (type === 'number') { const n = h('input', { type: 'number', value: data[k] ?? '' }); ctrls[k] = () => n.value === '' ? undefined : Number(n.value); f = field(label, n, hint); }
      else { const t = h('input', { type: 'text', value: data[k] || '', required: !!req }); ctrls[k] = () => t.value; f = field(label, t, hint); if (k === 'title' || k === 'name') f.style.gridColumn = '1/-1'; }
      return f;
    }));
    const save = h('button', { class: 'btn pri' }, r ? 'Save changes' : 'Create');
    const m = modal([h('h2', {}, (r ? 'Edit ' : 'Add ') + cfg.one), err, form, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save)]);
    save.addEventListener('click', async () => {
      err.hidden = true; const body = { ...data };
      for (const [k, get] of Object.entries(ctrls)) { const v = get(); if (v !== undefined) body[k] = v; else delete body[k]; }
      delete body.id; delete body.created_at; delete body.updated_at;
      save.disabled = true;
      try {
        const d = await api(r ? `${cfg.path}/${r.id}` : cfg.path, { method: r ? 'PUT' : 'POST', body });
        items = (await api(cfg.path)).items; draw(); m.close(); toast(r ? 'Saved.' : 'Created.');
      } catch (x) { err.textContent = x.message + (x.fields ? ' — ' + Object.values(x.fields).join('; ') : ''); err.hidden = false; save.disabled = false; m.dlg.scrollTo(0, 0); }
    });
  }
  draw();
  return { el: root, actions: add };
}

/* ================= MESSAGES ================= */
async function pageMessages() {
  const root = h('div'); const st = { status: '', q: '', page: 1 }; const sel = new Set(); const list = h('div', { class: 'mlist' }); const pager = h('div', { class: 'toolbar' });
  const tabs = h('div', { class: 'seg' }); const search = h('input', { type: 'search', placeholder: 'Search messages…', 'aria-label': 'Search messages' }); const bulk = h('div', { class: 'toolbar', hidden: true });
  let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; st.page = 1; load(); }, 300); });
  async function bulkDo(action) {
    const ids = [...sel]; if (!ids.length) return;
    if (action === 'delete' && !await confirmBox('Delete messages?', `${ids.length} message(s) will be permanently deleted.`)) return;
    try { await api('/messages/bulk', { method: 'POST', body: { ids, action } }); sel.clear(); toast('Done.'); load(); } catch (x) { toast(x.message, 'bad'); }
  }
  async function one(id, status) { try { await api('/messages/' + id, { method: 'PATCH', body: { status } }); load(); } catch (x) { toast(x.message, 'bad'); } }
  async function load() {
    const d = await api(`/messages?status=${st.status}&q=${encodeURIComponent(st.q)}&page=${st.page}&limit=20`);
    tabs.replaceChildren(...[['', 'All'], ['unread', `Unread (${d.unread})`], ['read', 'Read']].map(([v, l]) => h('button', { class: st.status === v ? 'on' : '', onclick: () => { st.status = v; st.page = 1; sel.clear(); load(); } }, l)));
    const b = document.getElementById('unreadBdg'); if (b) { b.textContent = d.unread; b.hidden = !d.unread; }
    bulk.hidden = !sel.size; bulk.replaceChildren(h('b', {}, sel.size + ' selected'), h('button', { class: 'btn sm', onclick: () => bulkDo('read') }, 'Mark read'), h('button', { class: 'btn sm', onclick: () => bulkDo('unread') }, 'Mark unread'), h('button', { class: 'btn sm dng', onclick: () => bulkDo('delete') }, 'Delete'));
    const first = (st.page - 1) * d.limit;
    list.replaceChildren(...(d.items.length ? d.items.map((m, i) => {
      const cb = h('input', { type: 'checkbox', checked: sel.has(m.id), 'aria-label': 'Select message', onchange: () => { cb.checked ? sel.add(m.id) : sel.delete(m.id); bulk.hidden = !sel.size; bulk.firstChild.textContent = sel.size + ' selected'; } });
      return h('article', { class: 'mitem ' + m.status }, cb,
        h('div', {}, h('div', { class: 'who' }, `#${first + i + 1}  `, m.name, h('small', {}, h('a', { href: 'mailto:' + m.email }, m.email))), m.subject ? h('div', { class: 'sub' }, m.subject) : null, h('div', { class: 'body' }, m.message),
          h('div', { class: 'row-actions', style: 'justify-content:flex-start;margin-top:10px' },
            h('button', { class: 'btn sm', onclick: () => one(m.id, m.status === 'unread' ? 'read' : 'unread') }, m.status === 'unread' ? 'Mark as read' : 'Mark as unread'),
            h('a', { class: 'btn sm', href: `mailto:${m.email}?subject=${encodeURIComponent('Re: ' + (m.subject || 'Your message'))}` }, 'Reply'),
            h('button', { class: 'btn sm dng', onclick: async () => { if (await confirmBox('Delete message?', `Message from ${m.name} will be permanently deleted.`)) { await api('/messages/' + m.id, { method: 'DELETE' }); toast('Deleted.'); load(); } } }, 'Delete'))),
        h('div', { class: 'ts' }, fmtDate(m.created_at), m.status === 'unread' ? h('div', {}, h('span', { class: 'pill y' }, 'NEW')) : null));
    }) : [h('div', { class: 'card empty' }, st.q || st.status ? 'No messages match.' : 'No messages yet. Messages sent through the contact form will appear here.')]));
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    pager.replaceChildren(h('span', { style: 'color:var(--mut)' }, `${d.total} message${d.total === 1 ? '' : 's'} · page ${st.page} of ${pages}`),
      h('button', { class: 'btn sm', disabled: st.page <= 1, onclick: () => { st.page--; load(); } }, '← Newer'), h('button', { class: 'btn sm', disabled: st.page >= pages, onclick: () => { st.page++; load(); } }, 'Older →'));
  }
  root.append(h('div', { class: 'toolbar' }, tabs, search), bulk, list, pager);
  await load();
  return root;
}

/* ================= ADMINS ================= */
async function pageAdmins() {
  const root = h('div'); let items = (await api('/admins')).items;
  const add = h('button', { class: 'btn pri', onclick: () => edit(null) }, '+ Add admin');
  function draw() {
    root.replaceChildren(h('div', { class: 'msg info' }, 'Super admins manage everything, including other admins. Editors manage content and messages only. A new admin must set their own password at first sign-in.'),
      h('div', { class: 'card wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Admin', 'Role', 'Recovery', 'Last sign-in', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, items.map((a) => h('tr', {}, h('td', {}, h('b', {}, a.display_name || a.username), h('div', { style: 'color:var(--mut);font-size:.82rem' }, '@' + a.username + (a.email ? ' · ' + a.email : '') + (a.id === me.id ? ' · you' : ''))),
          h('td', {}, h('span', { class: 'pill ' + (a.role === 'super' ? 'y' : 'b') }, a.role === 'super' ? 'Super admin' : 'Editor')), h('td', {}, a.has_security_question ? h('span', { class: 'pill g' }, 'Question set') : h('span', { class: 'pill' }, 'None')),
          h('td', {}, a.last_login ? fmtDate(a.last_login) : 'Never'),
          h('td', {}, h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: () => edit(a) }, 'Edit'), a.id !== me.id ? h('button', { class: 'btn sm dng', onclick: () => del(a) }, 'Delete') : null))))))));
  }
  async function del(a) { if (!await confirmBox('Delete admin?', `“${a.username}” will lose access immediately.`)) return; try { items = (await api('/admins/' + a.id, { method: 'DELETE' })).items; draw(); toast('Admin deleted.'); } catch (x) { toast(x.message, 'bad'); } }
  function edit(a) {
    const err = h('div', { class: 'msg bad', hidden: true });
    const un = inp('u', a?.username || '', 'text', { required: true, autocapitalize: 'none' }), dn = inp('d', a?.display_name || ''), em = inp('e', a?.email || '', 'email');
    const role = h('select', {}, [['editor', 'Editor'], ['super', 'Super admin']].map(([v, l]) => h('option', { value: v, selected: (a?.role || 'editor') === v }, l)));
    const pw = inp('p', '', 'password', { autocomplete: 'new-password', placeholder: a ? 'Leave blank to keep current' : '' });
    const q = inp('q', '', 'text', { placeholder: 'e.g. Name of my first school?' }), ans = inp('a', '', 'text', { autocomplete: 'off' });
    const save = h('button', { class: 'btn pri' }, a ? 'Save changes' : 'Create admin');
    const m = modal([h('h2', {}, a ? 'Edit admin' : 'Add admin'), err, h('div', { class: 'grid2' }, field('Username', un), field('Display name', dn), field('Email', em), field('Role', role), field(a ? 'Reset password (optional)' : 'Temporary password', pw, 'Min 10 characters, letters and numbers. They must change it at first sign-in.'),
      a ? null : h('div'), a ? null : field('Security question (optional)', q), a ? null : field('Answer', ans)), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save)]);
    save.addEventListener('click', async () => {
      err.hidden = true; save.disabled = true;
      const body = { username: un.value, display_name: dn.value, email: em.value, role: role.value }; if (pw.value) body.password = pw.value;
      if (!a) { body.security_question = q.value; body.security_answer = ans.value; }
      try { items = (await api(a ? '/admins/' + a.id : '/admins', { method: a ? 'PUT' : 'POST', body })).items; draw(); m.close(); toast('Saved.'); } catch (x) { err.textContent = x.message; err.hidden = false; save.disabled = false; }
    });
  }
  draw();
  return { el: root, actions: add };
}

/* ================= MY ACCOUNT ================= */
async function pageAccount() {
  const root = h('div', { class: 'cols' }); const a = (await api('/me')).admin; me = { ...me, ...a };
  const e1 = h('div', { class: 'msg bad', hidden: true });
  const un = inp('u', a.username, 'text', { autocapitalize: 'none' }), dn = inp('d', a.display_name), em = inp('e', a.email, 'email'), cp = inp('c', '', 'password', { autocomplete: 'current-password' });
  const q = inp('q', a.security_question || ''), ans = inp('a', '', 'text', { autocomplete: 'off', placeholder: a.has_security_question ? 'Leave blank to keep current answer' : '' });
  const s1 = h('button', { class: 'btn pri' }, 'Save details');
  s1.addEventListener('click', async () => {
    e1.hidden = true; s1.disabled = true;
    const body = { display_name: dn.value, email: em.value, username: un.value, current_password: cp.value, security_question: q.value }; if (ans.value) body.security_answer = ans.value;
    try { const d = await api('/me', { method: 'PUT', body }); me = { ...me, ...d.admin }; cp.value = ''; ans.value = ''; toast('Details saved.'); } catch (x) { e1.textContent = x.message; e1.hidden = false; }
    s1.disabled = false;
  });
  const e2 = h('div', { class: 'msg bad', hidden: true }), c = inp('c', '', 'password', { autocomplete: 'current-password' }), p1 = inp('p', '', 'password', { autocomplete: 'new-password' }), p2 = inp('p2', '', 'password', { autocomplete: 'new-password' });
  const s2 = h('button', { class: 'btn pri' }, 'Change password');
  s2.addEventListener('click', async () => {
    e2.hidden = true; if (p1.value !== p2.value) { e2.textContent = 'Passwords do not match.'; e2.hidden = false; return; }
    s2.disabled = true;
    try { await api('/me/password', { method: 'POST', body: { current_password: c.value, password: p1.value } }); c.value = p1.value = p2.value = ''; toast('Password changed. Other sessions were signed out.'); } catch (x) { e2.textContent = x.message; e2.hidden = false; }
    s2.disabled = false;
  });
  root.append(
    h('div', { class: 'card' }, h('h2', {}, 'Profile & recovery'), e1, field('Display name', dn), field('Email', em), field('Username', un), field('Current password', cp, 'Only needed when you change the username.'),
      field('Security question', q, 'Used by “Forgot password?” on the sign-in page.'), field('Security answer', ans), s1),
    h('div', { class: 'card' }, h('h2', {}, 'Change password'), e2, field('Current password', c), field('New password', p1, 'At least 10 characters with letters and numbers.'), field('Repeat new password', p2), s2));
  return root;
}

/* ================= BOOT ================= */
(async () => {
  try { const d = await api('/me'); me = d.admin; csrf = d.csrf; start(); }
  catch (x) { renderLogin(); }
})();
