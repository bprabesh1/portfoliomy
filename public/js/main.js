import { $, $$, h, pad2, clamp, prefersReducedMotion } from './util.js';
import { loadSite, track } from './api.js';
import { buildRoute } from './route.js';
import { renderHero, renderAbout, renderCertificates, renderProjects, renderSkills, renderContact } from './sections.js';
import { createPanel } from './panel.js';
import { createJourney } from './journey.js';

const reduced = prefersReducedMotion();

async function boot() {
  let data;
  try { data = await loadSite(); } catch (e) {
    $('#loader p').textContent = 'Could not load the portfolio. Please refresh.'; return;
  }
  const s = data.settings, items = data.milestones, hasResume = !!s.has_resume;

  // a throw-away path just to draw the little route preview in the hero panel
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); tmp.style.cssText = 'position:absolute;width:0;height:0'; document.body.append(tmp);
  const previewRoute = buildRoute(tmp); tmp.remove();
  renderHero(s, items, previewRoute); renderAbout(s); renderCertificates(data.certificates, (...a) => openLightbox(...a)); renderProjects(data.projects); renderSkills(data.skills); renderContact(s, hasResume);
  $$('#navResume,#navResume2').forEach((a) => { a.hidden = !hasResume; a.addEventListener('click', () => {}); });

  // ---- journey ----
  let journey = null;
  if (items.length) {
    const panel = createPanel({ items, onNavigate: (i) => journey.goTo(i), onClose: () => {} });
    journey = createJourney({ items, settings: s, panel, hasResume });
    const markExplored = panel.open;
    panel.open = (i) => { journey.markExplored(i); markExplored(i); };
  } else {
    $('#journey').hidden = true;
  }
  buildNav(journey, items);
  wireButtons(journey, items);
  initReveal();
  initLightbox();

  $('#loader').classList.add('done'); setTimeout(() => $('#loader').remove(), 800);
  track('view');
  if (location.hash) setTimeout(() => jumpTo(location.hash, journey), 120);
}

/* ---------- navigation ---------- */
const LINKS = [
  { label: 'Home', href: '#home' }, { label: 'About', href: '#about' }, { label: 'Journey', href: '#journey', journey: 'start' },
  { label: 'Education', href: '#journey', cat: 'education' }, { label: 'Training', href: '#journey', cat: 'training' }, { label: 'Certificates', href: '#certificates' },
  { label: 'Experience', href: '#journey', cat: 'experience' }, { label: 'Projects', href: '#projects' }, { label: 'Skills', href: '#skills' }, { label: 'Contact', href: '#contact' },
];
function jumpTo(hash, journey, cat) {
  const reduce = prefersReducedMotion();
  if (hash === '#journey' && journey && !journey.isListMode()) { if (cat && journey.goToCategory(cat)) return; journey.goStart(); return; }
  const el = document.querySelector(hash); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
function buildNav(journey, items) {
  const cats = new Set(items.map((i) => i.category));
  const links = LINKS.filter((l) => !l.cat || cats.has(l.cat));
  const make = (l, mobile) => h('a', { href: l.href, 'data-key': l.cat || l.href, onclick: (e) => { e.preventDefault(); closeDrawer(); track('nav_click', l.label); jumpTo(l.href, journey, l.cat); history.replaceState(null, '', l.href); } }, l.label);
  $('#navLinks').replaceChildren(...links.map((l) => make(l)));
  $('#navDrawerLinks').replaceChildren(...links.map((l) => make(l, true)));
  const burger = $('#navBurger');
  function closeDrawer() { $('#navDrawer').hidden = true; burger.setAttribute('aria-expanded', 'false'); document.documentElement.style.overflow = ''; }
  burger.addEventListener('click', () => { const open = $('#navDrawer').hidden; $('#navDrawer').hidden = !open; burger.setAttribute('aria-expanded', String(open)); document.documentElement.style.overflow = open ? 'hidden' : ''; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#navDrawer').hidden) closeDrawer(); });
  addEventListener('resize', () => { if (innerWidth >= 1260) closeDrawer(); });
  const skip = () => { closeDrawer(); track('journey_skip'); if (journey && !journey.isListMode()) journey.goSummit(true); else $('#certificates').scrollIntoView(); };
  $('#skipBtn').addEventListener('click', skip); $('#skipBtn2').addEventListener('click', skip);

  // active link: sections by position, journey by current checkpoint category
  const secs = ['home', 'about', 'journey', 'certificates', 'projects', 'skills', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
  let jCat = null, jIn = false;
  document.addEventListener('journey:progress', (e) => { jCat = e.detail.category; jIn = e.detail.inView; });
  function mark() {
    const y = innerHeight * 0.4; let cur = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= y) cur = s;
    let key = '#' + cur.id;
    if (cur.id === 'journey' && jIn && jCat && cats.has(jCat) && ['education', 'training', 'experience'].includes(jCat)) key = jCat;
    $$('#navLinks a, #navDrawerLinks a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
  }
  let tick = false; addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; mark(); }); } }, { passive: true }); mark();
}

function wireButtons(journey, items) {
  $('#startBtn').addEventListener('click', async () => {
    if (!journey) { document.querySelector('#about').scrollIntoView({ behavior: 'smooth' }); return; }
    if (journey.isListMode()) { journey.setListMode(false); }
    await journey.playIntro();
  });
  $('#exploreBtn').addEventListener('click', () => {
    track('cta_explore');
    if (!journey) return;
    if (journey.isListMode()) { $('#journey').scrollIntoView({ behavior: 'smooth' }); return; }
    journey.goTo(0);
  });
  $('#finResume').addEventListener('click', () => {}); // counted server-side by /resume
}

/* ---------- reveal on scroll ---------- */
function initReveal() {
  const els = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}

/* ---------- lightbox ---------- */
let openLightbox = () => {};
function initLightbox() {
  const lb = $('#lightbox'), img = $('#lbImg'); let opener = null;
  openLightbox = (src, alt) => { opener = document.activeElement; img.src = src; img.alt = alt || ''; lb.hidden = false; $('#lbClose').focus(); };
  const close = () => { lb.hidden = true; img.removeAttribute('src'); opener && opener.focus && opener.focus(); };
  $('#lbClose').addEventListener('click', close); lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.hidden) close(); });
}

boot();
