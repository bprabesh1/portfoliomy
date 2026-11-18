import { $, $$, clamp, lerp, smooth, easeInOut, pad2, h, prefersReducedMotion, isSmall, SESSION, CATEGORY_LABEL } from './util.js';
import { buildRoute, WORLD } from './route.js';
import { createWorld } from './world.js';
import { createClimber, CLIMBER_H } from './climber.js';
import { createFinale } from './finale.js';
import { track } from './api.js';

const ZONES = [[0, 'Base Camp'], [0.14, 'Lower Mountain'], [0.4, 'Middle Mountain'], [0.64, 'Upper Mountain'], [0.9, 'Summit']];
const DWELL = 0.75, FINALE_VH = 4.4;

export function createJourney({ items, settings, panel, hasResume }) {
  const reduced = prefersReducedMotion();
  const trackEl = $('#journeyTrack'), stage = $('#stage'), root = $('#world');
  const N = items.length;
  const route = buildRoute(root);
  const slots = route.slotsFor(N);
  const world = createWorld(root, route, items, slots);
  const climber = createClimber(world.climberLayer, route);
  const finale = createFinale({ settings, hasResume });
  const hud = { pct: $('#hudPct'), bar: $('#hudBar'), zone: $('#hudZone'), now: $('#hudNow'), done: $('#hudDone'), left: $('#hudLeft'), dots: $('#hudDots'), el: $('#hud') };
  const unlock = { el: $('#unlock'), title: $('#unlockTitle'), quote: $('#unlockQuote'), btn: $('#unlockBtn') };
  const navProg = $('#navProgress'), npRing = $('.np-ring'), npPct = $('#npPct'), npLabel = $('#npLabel');
  const explored = new Set(); const reachedOnce = new Set();
  let segs = [], totalWeight = 0, vh = innerHeight, trackTop = 0;
  let sSmooth = 0, sTarget = 0, len = 0, lastLen = 0, introT = 1, lightsOn = 0.25, introActive = false, introSkip = false;
  let shownUnlock = -1, inView = false, camX = 760, camY = 700, camW = 780, panelOpen = false, running = false;

  /* ---- scroll mapping: travel segments + dwell plateaus at every checkpoint + the summit finale ---- */
  function buildSegments() {
    const dists = []; let prev = 0;
    for (let i = 0; i < N; i++) { dists.push(slots[i] - prev); prev = slots[i]; }
    dists.push(route.total - prev);
    const ref = Math.max(...dists, 1);
    segs = []; let acc = 0, a = 0;
    const add = (type, w, extra) => { segs.push({ type, w, from: acc, to: acc + w, ...extra }); acc += w; };
    for (let i = 0; i < N; i++) {
      add('travel', 0.5 + 0.95 * (dists[i] / ref), { a, b: slots[i], next: i });
      add('dwell', DWELL, { index: i, len: slots[i] }); a = slots[i];
    }
    add('travel', 0.55 + 0.95 * (dists[N] / ref), { a, b: route.total, next: -1 });
    add('finale', FINALE_VH, {});
    totalWeight = acc;
  }
  function layout() {
    vh = innerHeight; buildSegments();
    trackEl.style.height = `${Math.round((totalWeight + 1) * vh)}px`;
    trackTop = trackEl.getBoundingClientRect().top + scrollY;
    hud.el.dataset.n = N;
  }
  const pxFor = (w) => w * vh;
  const scrollForSeg = (seg, frac = 0) => trackTop + pxFor(seg.from + seg.w * frac);

  function locate(s) { // s in px within the track
    const u = clamp(s / vh, 0, totalWeight);
    const seg = segs.find((g) => u <= g.to) || segs[segs.length - 1];
    const f = clamp((u - seg.from) / seg.w);
    if (seg.type === 'travel') return { seg, f, len: lerp(seg.a, seg.b, easeInOut(f)), phase: 'travel' };
    if (seg.type === 'dwell') return { seg, f, len: seg.len, phase: 'dwell', index: seg.index };
    return { seg, f, len: route.total, phase: 'finale' };
  }

  /* ---- HUD ---- */
  function buildHud() {
    hud.dots.replaceChildren(...items.map((it, i) => h('li', {}, h('button', { type: 'button', 'data-i': i, 'aria-label': `Go to checkpoint ${i + 1}: ${it.title}`, title: it.title, onclick: () => goTo(i) }, pad2(i + 1)))));
  }
  function updateHud(ratio, loc) {
    const passed = markersPassed();
    const cur = loc.phase === 'dwell' ? loc.index : passed - 1;
    const pct = Math.round(ratio * 100);
    hud.pct.textContent = pct; hud.bar.style.width = `${pct}%`;
    const zone = [...ZONES].reverse().find((z) => ratio >= z[0])[1];
    hud.zone.textContent = loc.phase === 'finale' ? 'Summit' : zone;
    hud.now.textContent = cur >= 0 ? items[cur].title : 'Base camp';
    const done = loc.phase === 'finale' ? N : passed;
    hud.done.textContent = done; hud.left.textContent = N - done;
    $$('button', hud.dots).forEach((b, i) => { b.className = i === cur && loc.phase === 'dwell' ? 'current' : i < done ? 'done' : ''; if (explored.has(i)) b.classList.add('seen'); });
    navProg.hidden = !inView; npRing.style.setProperty('--p', pct); npPct.textContent = `${pct}%`; npLabel.textContent = cur >= 0 ? items[cur].title : 'Base camp';
    document.dispatchEvent(new CustomEvent('journey:progress', { detail: { pct, current: cur, category: cur >= 0 ? items[cur].category : null, inView } }));
  }
  const markersPassed = () => world.markers.filter((m) => len >= m.len - 0.5).length;

  /* ---- checkpoint states: locked -> approaching -> reached -> unlocked -> explored ---- */
  function updateMarkers(loc, dt) {
    world.markers.forEach((m, i) => {
      let state = 'locked', b = 0;
      const dist = m.len - len;
      if (loc.phase === 'dwell' && loc.index === i) { state = loc.f < 0.14 ? 'reached' : 'unlocked'; b = 1; }
      else if (dist <= 0.5) { state = explored.has(i) ? 'explored' : 'unlocked'; b = 1; }
      else { b = smooth(340, 40, dist); state = b > 0.04 ? 'approaching' : 'locked'; }
      if (state === 'unlocked' && explored.has(i)) state = 'explored';
      world.setMarkerState(m, state, b);
    });
    // achievement notification when the climber stops at a checkpoint
    const idx = loc.phase === 'dwell' ? loc.index : -1;
    if (idx !== shownUnlock) {
      shownUnlock = idx;
      if (idx >= 0) showUnlock(idx, loc.f < 0.5); else hideUnlock();
    }
  }
  function showUnlock(i, fresh) {
    const it = items[i], m = world.markers[i];
    unlock.title.textContent = it.title; unlock.quote.textContent = it.quote ? `“${it.quote}”` : (it.organization || '');
    unlock.btn.dataset.i = i; unlock.el.hidden = false; requestAnimationFrame(() => unlock.el.classList.add('show'));
    if (!reachedOnce.has(i)) {
      reachedOnce.add(i); track('checkpoint_reached', it.title);
      if (!reduced) { world.burst(m.point.x, m.point.y - 6, 30); climber.celebrate(); }
    }
  }
  function hideUnlock() { unlock.el.classList.remove('show'); setTimeout(() => { if (!unlock.el.classList.contains('show')) unlock.el.hidden = true; }, 350); }
  unlock.btn.addEventListener('click', () => openItem(+unlock.btn.dataset.i));

  function openItem(i) { track('checkpoint_open', items[i].title); explored.add(i); panel.open(i); }

  /* ---- camera ---- */
  function viewSize() {
    const vw = stage.clientWidth || innerWidth, vhh = stage.clientHeight || innerHeight;
    const base = vw < 700 ? 290 : vw < 1100 ? 540 : 740;
    return { vw, vhh, base, aspect: vhh / vw };
  }
  function camera(dt, loc, p, ratio) {
    const { base, aspect } = viewSize();
    let zoom = 1, tx = p.x, ty = p.y, bias = 0;
    if (loc.phase === 'finale') { zoom = lerp(1, 0.5, smooth(0, 0.22, loc.f)); tx = p.x; ty = p.y + 10; }
    if (introActive || introT < 1) { const e = easeInOut(clamp(introT)); zoom = lerp(zoom, 2.5, 1 - e); tx = lerp(960, tx, e); ty = lerp(300, ty, e); }
    const w = base * zoom, hh = w * aspect;
    if (panelOpen && stage.clientWidth > 900) bias = 0.17 * w;
    const a = route.angleAt(len) * Math.PI / 180;
    const look = loc.phase === 'finale' ? 0 : 1;
    const targetX = tx + Math.cos(a) * 22 * look + bias;
    const targetY = ty - 0.08 * hh + Math.sin(a) * 16 * look;
    const k = reduced ? 1 : 1 - Math.exp(-dt * (introActive ? 14 : 5.5));
    camX += (targetX - camX) * k; camY += (targetY - camY) * k; camW += (w - camW) * k;
    const H = camW * aspect;
    const cx = clamp(camX, -250 + camW / 2, WORLD.w + 250 - camW / 2), cy = clamp(camY, -450 + H / 2, 1280 - H / 2);
    world.setView(cx - camW / 2, cy - H / 2, camW, H);
  }

  /* ---- main loop ---- */
  let last = performance.now(), time = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    const rect = trackEl.getBoundingClientRect();
    inView = rect.top < innerHeight * 0.9 && rect.bottom > innerHeight * 0.1;
    if (inView || introActive) {
      const s = clamp(-rect.top, 0, totalWeight * vh);
      sTarget = s;
      sSmooth += (sTarget - sSmooth) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
      const loc = locate(sSmooth);
      len = loc.len;
      const moving = Math.abs(len - lastLen) / Math.max(dt, 0.001) > 6; lastLen = len;
      const ratio = len / route.total;
      lightsOn = introActive ? lightsOn : Math.min(1, lightsOn + dt * 0.6);
      const p = climber.update(len, moving && loc.phase !== 'finale', time, dt, loc.phase === 'dwell' ? 'rest' : 'climb', ratio);
      world.setProgress(len, ratio, Math.max(lightsOn, smooth(0.02, 0.1, ratio)));
      updateMarkers(loc, dt);
      camera(dt, loc, p, ratio);
      world.fxStep(dt);
      finale.update(loc.phase === 'finale' ? loc.f : 0, time, dt);
      const fin = loc.phase === 'finale' ? loc.f : 0;
      climber.setOpacity((1 - smooth(0.04, 0.16, fin)).toFixed(2));
      hud.el.style.opacity = (1 - smooth(0.1, 0.22, fin)).toFixed(2); hud.el.style.pointerEvents = fin > 0.2 ? 'none' : '';
      $('#scrollCue').classList.toggle('hide', sSmooth > 30 || introActive);
      updateHud(loc.phase === 'finale' ? 1 : ratio, loc);
    } else { navProg.hidden = true; }
    requestAnimationFrame(frame);
  }

  /* ---- navigation ---- */
  const scrollTo = (top, instant) => window.scrollTo({ top: Math.round(top), behavior: instant || reduced ? 'auto' : 'smooth' });
  function goTo(i, instant) { const seg = segs.find((g) => g.type === 'dwell' && g.index === i); if (seg) scrollTo(scrollForSeg(seg, 0.2), instant); }
  function goToCategory(cat) { const i = items.findIndex((x) => x.category === cat); if (i >= 0) goTo(i); return i >= 0; }
  const goStart = (instant) => scrollTo(trackTop, instant);
  const goSummit = (instant) => scrollTo(trackTop + pxFor(totalWeight) - 1, instant);
  const scrollToFinaleEnd = () => goSummit(true);

  /* ---- cinematic intro ---- */
  async function playIntro() {
    if (reduced) { goStart(true); return; }
    track('journey_start');
    const cap = $('#introCaption'), skip = $('#introSkip');
    introActive = true; introSkip = false; introT = 0; lightsOn = 0;
    goStart(true); sSmooth = 0; document.documentElement.style.overflow = 'hidden';
    skip.hidden = false; cap.hidden = false;
    const lines = [[0.0, 'Base camp'], [1.3, 'Prabesh is preparing to climb…'], [2.9, 'The summit is waiting.']];
    const dur = 4.6; const t0 = performance.now(); let li = -1;
    skip.onclick = () => { introSkip = true; };
    await new Promise((res) => {
      (function tick() {
        const t = (performance.now() - t0) / 1000;
        introT = clamp(t / (dur - 0.4)); lightsOn = smooth(1.2, 3.4, t);
        const idx = lines.reduce((a, [at], k) => (t >= at ? k : a), 0);
        if (idx !== li) { li = idx; cap.classList.remove('in'); cap.textContent = lines[idx][1]; void cap.offsetWidth; cap.classList.add('in'); }
        if (introSkip || t >= dur) return res();
        requestAnimationFrame(tick);
      })();
    });
    introT = 1; lightsOn = 1; introActive = false; cap.hidden = true; skip.hidden = true; document.documentElement.style.overflow = '';
  }

  /* ---- list (accessible / reduced-motion) alternative ---- */
  function buildList() {
    $('#jlItems').replaceChildren(...items.map((it, i) => h('li', { class: 'jl-item' },
      h('span', { class: 'jl-n' }, pad2(i + 1)),
      h('div', { class: 'jl-b' }, h('p', { class: 'jl-cat' }, CATEGORY_LABEL[it.category] || 'Milestone', it.date_label ? ` · ${it.date_label}` : ''), h('h3', {}, it.title), h('p', { class: 'jl-org' }, it.organization),
        h('p', { class: 'jl-d' }, it.description), h('button', { class: 'btn-ghost-dark', type: 'button', onclick: () => openItem(i) }, 'Open achievement')))));
  }
  function setListMode(on) {
    SESSION.set('listMode', on ? '1' : '0');
    $('#journeyList').hidden = !on; trackEl.hidden = on; document.body.classList.toggle('list-mode', on);
    layout();
  }
  $('#listToggle').addEventListener('click', () => { setListMode(true); $('#journey').scrollIntoView(); });
  $('#climbToggle').addEventListener('click', () => { setListMode(false); goStart(true); });

  /* ---- init ---- */
  buildHud(); buildList(); layout();
  const saved = SESSION.get('listMode'); if (saved === '1' || (saved == null && reduced)) setListMode(true);
  addEventListener('resize', () => { layout(); });
  document.addEventListener('panel:state', (e) => { panelOpen = e.detail.open; });
  addEventListener('load', layout);
  document.fonts && document.fonts.ready.then(layout);
  if (!running) { running = true; requestAnimationFrame(frame); }
  $('#journey').addEventListener('click', (e) => { const l = e.target.closest('a[href^="#"]'); if (l && l.closest('.fin-actions')) { e.preventDefault(); document.querySelector(l.getAttribute('href'))?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); } });

  return { goTo, goToCategory, goStart, goSummit, playIntro, openItem, layout, items, isListMode: () => document.body.classList.contains('list-mode'), setListMode,
    markExplored: (i) => { explored.add(i); }, hasCategory: (c) => items.some((x) => x.category === c) };
}
