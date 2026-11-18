import { svg as S, NS, clamp, lerp, smooth, pad2, shortTitle } from './util.js';
import { WORLD } from './route.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function ridge(seed, baseY, amp, x0 = -900, x1 = 2450, step = 70, bottom = 1500) {
  const r = rng(seed); let d = `M${x0} ${bottom}L${x0} ${baseY}`;
  for (let x = x0; x <= x1; x += step) {
    const peak = Math.sin(x * 0.0042 + seed) * amp * 0.55 + Math.sin(x * 0.011 + seed * 2) * amp * 0.3 + r() * amp * 0.35;
    d += `L${x} ${(baseY - Math.abs(peak) * 1.25).toFixed(0)}`;
  }
  return d + `L${x1} ${bottom}Z`;
}
function cloud(x, y, s, o = 1) {
  const g = S('g', { transform: `translate(${x} ${y}) scale(${s})`, opacity: o });
  [[0, 0, 70, 24], [-48, 8, 48, 20], [52, 6, 56, 20], [-12, -14, 44, 22], [26, -10, 36, 18]].forEach(([cx, cy, rx, ry]) => g.append(S('ellipse', { cx, cy, rx, ry, fill: 'url(#cloudG)' })));
  return g;
}

export function createWorld(root, route, items, slots) {
  const { w: W, h: H } = WORLD;
  root.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const defs = S('defs');
  defs.innerHTML = `
    <linearGradient id="skyG" gradientUnits="userSpaceOnUse" x1="0" y1="-1500" x2="0" y2="1100">
      <stop offset="0" stop-color="#0a2140"/><stop offset=".38" stop-color="#2a68a8"/><stop offset=".68" stop-color="#86c0e8"/><stop offset=".88" stop-color="#cfe7f3"/><stop offset="1" stop-color="#f3ecd8"/></linearGradient>
    <linearGradient id="dawnG" gradientUnits="userSpaceOnUse" x1="0" y1="-500" x2="0" y2="760">
      <stop offset="0" stop-color="#ff7a3c" stop-opacity=".62"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".5"/><stop offset="1" stop-color="#ffe3a0" stop-opacity="0"/></linearGradient>
    <linearGradient id="groundG" gradientUnits="userSpaceOnUse" x1="0" y1="930" x2="0" y2="1300">
      <stop offset="0" stop-color="#0c2a20" stop-opacity="0"/><stop offset=".25" stop-color="#0d2a23" stop-opacity=".9"/><stop offset="1" stop-color="#06121c"/></linearGradient>
    <radialGradient id="cloudG"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".6" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="sunG"><stop offset="0" stop-color="#fffbe8"/><stop offset=".18" stop-color="#fff0b0"/><stop offset=".5" stop-color="#ffc85a" stop-opacity=".45"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
    <radialGradient id="fireG"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset=".5" stop-color="#ff8a30" stop-opacity=".35"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></radialGradient>
    <radialGradient id="veilG"><stop offset="0" stop-color="#071426" stop-opacity=".78"/><stop offset=".7" stop-color="#071426" stop-opacity=".6"/><stop offset="1" stop-color="#071426" stop-opacity="0"/></radialGradient>
    <radialGradient id="goldG"><stop offset="0" stop-color="#fff3b8" stop-opacity=".95"/><stop offset=".45" stop-color="#ffc83a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient>
    <radialGradient id="shadowG"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <filter id="blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`;
  root.append(defs);

  /* --- sky + far scenery (parallax) --- */
  const bg = S('g', { id: 'bg' });
  bg.append(S('rect', { x: -1500, y: -1700, width: 4600, height: 3200, fill: 'url(#skyG)' }));
  const dawn = S('rect', { x: -1500, y: -1700, width: 4600, height: 3200, fill: 'url(#dawnG)', opacity: 0 });
  bg.append(dawn);
  const stars = S('g', { opacity: 0.0 }); const r = rng(7);
  for (let i = 0; i < 70; i++) stars.append(S('circle', { cx: -400 + r() * 2400, cy: -900 + r() * 800, r: 0.7 + r() * 1.3, fill: '#fff', opacity: 0.4 + r() * 0.6 }));
  bg.append(stars);
  // sun rising behind the right ridge
  const sun = S('g', { transform: 'translate(1130 178)' });
  const rays = S('g', { class: 'sun-rays' });
  for (let i = 0; i < 18; i++) rays.append(S('path', { d: 'M0 0L-9 -330L9 -330Z', fill: '#ffe39a', opacity: 0.1 + (i % 3) * 0.04, transform: `rotate(${i * 20})` }));
  sun.append(rays, S('circle', { r: 300, fill: 'url(#sunG)', opacity: 0.85 }), S('circle', { r: 30, fill: '#fffbe8' }));
  bg.append(sun);
  const far = [
    S('g', { 'data-depth': 0.18 }, S('path', { d: ridge(3, 640, 260, -900, 2450, 90), fill: '#6f95bd', opacity: 0.55 })),
    S('g', { 'data-depth': 0.3 }, S('path', { d: ridge(11, 760, 210, -900, 2450, 80), fill: '#3f6a92', opacity: 0.72 })),
    S('g', { 'data-depth': 0.45 }, S('path', { d: ridge(23, 860, 150, -900, 2450, 70), fill: '#24465e', opacity: 0.9 })),
  ];
  const cloudsFar = S('g', { class: 'clouds clouds-far', 'data-depth': 0.1 });
  [[120, 250, 1.6], [600, 150, 1.2], [1250, 330, 1.7], [1720, 200, 1.4], [-260, 420, 1.5], [1000, -60, 1.5], [260, -170, 1.4], [1500, -280, 1.6]].forEach(([x, y, s]) => cloudsFar.append(cloud(x, y, s, 0.85)));
  bg.append(...far, cloudsFar);
  root.append(bg);

  /* --- the mountain illustration --- */
  root.append(S('image', { href: '/assets/img/mountain.webp', x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }));
  // mist pooled at the foot of the mountain
  root.append(S('rect', { x: -1500, y: 930, width: 4600, height: 700, fill: 'url(#groundG)' }));

  /* --- route layer: rope, holds, anchors --- */
  const rl = S('g', { id: 'route' });
  rl.append(S('path', { d: route.d, fill: 'none', stroke: '#150d06', 'stroke-opacity': 0.5, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  rl.append(S('path', { d: route.d, fill: 'none', stroke: '#ffe9c4', 'stroke-opacity': 0.55, 'stroke-width': 2.4, 'stroke-dasharray': '1 8', 'stroke-linecap': 'round' }));
  const done = S('path', { d: route.d, fill: 'none', stroke: '#ffd25a', 'stroke-width': 4.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#blur2)', opacity: 0.95 });
  const done2 = S('path', { d: route.d, fill: 'none', stroke: '#fff2b8', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  done.style.strokeDasharray = done2.style.strokeDasharray = `${route.total} ${route.total}`;
  done.style.strokeDashoffset = done2.style.strokeDashoffset = route.total;
  rl.append(done, done2);
  const rr = rng(42);
  for (let l = 30; l < route.total - 10; l += 34) { // rock holds beside the rope
    const p = route.pointAt(l), a = route.angleAt(l) * Math.PI / 180, side = rr() > 0.5 ? 1 : -1, off = 6 + rr() * 5;
    const hx = p.x - Math.sin(a) * off * side, hy = p.y + Math.cos(a) * off * side;
    rl.append(S('ellipse', { cx: hx.toFixed(1), cy: hy.toFixed(1), rx: (2.4 + rr() * 1.8).toFixed(1), ry: (1.7 + rr() * 1.2).toFixed(1), fill: '#9a8a78', stroke: '#2a1f14', 'stroke-width': 0.6, 'stroke-opacity': 0.7, transform: `rotate(${(rr() * 60 - 30).toFixed(0)} ${hx.toFixed(1)} ${hy.toFixed(1)})` }));
  }
  for (let l = 70; l < route.total - 20; l += 120) { // safety anchors with carabiners
    const p = route.pointAt(l); const g = S('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` });
    g.append(S('circle', { r: 3.4, fill: '#cfd6de', stroke: '#2b343f', 'stroke-width': 0.9 }), S('path', { d: 'M-1.8 3 L-1.8 8 Q0 10.5 1.8 8 L1.8 3', fill: 'none', stroke: '#b9c2cc', 'stroke-width': 1.1, 'stroke-linecap': 'round' }));
    rl.append(g);
  }
  root.append(rl);

  /* --- base camp props: start flag, campfire glow, lantern glow --- */
  const camp = S('g', { id: 'camp' });
  const startFlag = S('g', { transform: 'translate(300 897)' });
  startFlag.append(S('rect', { x: -1, y: -44, width: 2.4, height: 46, rx: 1, fill: '#5a3b1f' }), S('path', { class: 'flag-wave', d: 'M1.4 -44 L30 -39 L1.4 -29Z', fill: '#2fa66a', stroke: '#fff', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    S('text', { x: 6, y: -49, 'font-size': 7.5, 'font-weight': 800, fill: '#fff', 'letter-spacing': 1.2, 'paint-order': 'stroke', stroke: '#0b1b2e', 'stroke-width': 2.4 }, 'START'));
  const lights = S('g', { id: 'lights', opacity: 0 });
  lights.append(S('circle', { class: 'fire-glow', cx: 333, cy: 878, r: 64, fill: 'url(#fireG)' }), S('circle', { class: 'fire-glow b', cx: 402, cy: 780, r: 34, fill: 'url(#fireG)' }));
  const flies = S('g'); for (let i = 0; i < 14; i++) flies.append(S('circle', { class: 'firefly', cx: 250 + rr() * 220, cy: 780 + rr() * 130, r: 1.3, fill: '#ffe48a', style: `animation-delay:${(-rr() * 6).toFixed(2)}s;animation-duration:${(4 + rr() * 5).toFixed(1)}s` }));
  lights.append(flies);
  camp.append(startFlag, lights);
  root.append(camp);

  /* --- checkpoints (physically attached to the route) --- */
  const markerLayer = S('g', { id: 'markers' });
  const markers = items.map((it, i) => {
    const len = slots[i]; const p = route.pointAt(len); const canon = route.isCanonical(len);
    const g = S('g', { class: 'marker', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`, 'data-state': 'locked', 'data-index': i });
    const veil = canon ? S('ellipse', { cx: 0, cy: -20, rx: 36, ry: 48, fill: 'url(#veilG)' }) : null;
    const glow = S('circle', { cx: 0, cy: -4, r: 40, fill: 'url(#goldG)', opacity: 0 });
    const ring = S('ellipse', { cx: 0, cy: 0, rx: 24, ry: 8, fill: 'none', stroke: '#ffd25a', 'stroke-width': 2.4, class: 'm-ring' });
    const plat = canon ? null : S('ellipse', { cx: 0, cy: 3, rx: 22, ry: 7, fill: '#6b5a48', stroke: '#2b1d10', 'stroke-width': 1.2 });
    const pole = canon ? null : S('g', {}, S('rect', { x: -1.2, y: -52, width: 2.4, height: 54, rx: 1, fill: '#7a4d1c' }), S('path', { class: 'flag-wave', d: 'M1.2 -52 L26 -46 L1.2 -35Z', fill: '#ffc83a', stroke: '#8a5a00', 'stroke-width': 0.8 }));
    const bx = 0, by = -78;
    const badge = S('g', { class: 'm-badge', transform: `translate(${bx} ${by})` });
    badge.append(S('circle', { r: 12.5, fill: '#0b1b2e', stroke: '#ffd25a', 'stroke-width': 2 }), S('text', { y: 4.6, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 800, fill: '#ffd25a', 'font-family': 'Outfit,Manrope,sans-serif' }, String(i + 1)));
    const label = S('g', { class: 'm-label', transform: `translate(0 ${by - 24})`, opacity: 0 });
    const txt = (()=>{const t=shortTitle(it.title).toUpperCase();return t.length>20?t.slice(0,19).trimEnd()+'…':t;})(); const wpx = Math.max(34, txt.length * 6.4 + 20);
    label.append(S('rect', { x: -wpx / 2, y: -10, width: wpx, height: 18, rx: 9, fill: '#0b1b2e', 'fill-opacity': 0.88, stroke: '#ffd25a', 'stroke-opacity': 0.7, 'stroke-width': 1 }),
      S('text', { y: 2.6, 'text-anchor': 'middle', 'font-size': 8.6, 'font-weight': 800, fill: '#fff', 'letter-spacing': 0.7, 'font-family': 'Manrope,sans-serif' }, txt));
    g.append(...[veil, glow, plat, ring, pole, badge, label].filter(Boolean));
    markerLayer.append(g);
    return { g, veil, glow, ring, badge, label, len, point: p, canon, state: 'locked' };
  });
  // summit ring
  const sp = route.pointAt(route.total);
  const summit = S('g', { transform: `translate(${sp.x} ${sp.y})`, class: 'summit-mark', opacity: 0.0 });
  summit.append(S('circle', { cx: 0, cy: -8, r: 46, fill: 'url(#goldG)' }), S('ellipse', { rx: 20, ry: 6, fill: 'none', stroke: '#ffd25a', 'stroke-width': 2.2 }));
  markerLayer.append(summit);
  root.append(markerLayer);

  /* --- climber + fx --- */
  const climberLayer = S('g', { id: 'climberLayer' }); root.append(climberLayer);
  const fx = S('g', { id: 'fx' }); root.append(fx);
  const parts = Array.from({ length: 36 }, () => { const c = S('circle', { r: 2, fill: '#ffd25a', opacity: 0 }); fx.append(c); return { c, life: 0, vx: 0, vy: 0, x: 0, y: 0 }; });
  const cloudsNear = S('g', { class: 'clouds clouds-near', 'data-depth': -0.08 });
  [[-100, 520, 2.2, 0.6], [820, 640, 2.4, 0.55], [1500, 470, 2.1, 0.55], [420, 330, 2.0, 0.5], [1180, 260, 2.3, 0.5], [60, 130, 2.0, 0.5]].forEach(([x, y, s, o]) => cloudsNear.append(cloud(x, y, s, o)));
  root.append(cloudsNear);
  const dusk = S('rect', { x: -1500, y: -1700, width: 4600, height: 3200, fill: '#07122a', opacity: 0.55, 'pointer-events': 'none' }); root.append(dusk);

  let burstIdx = 0;
  function burst(x, y, n = 22) {
    for (let i = 0; i < n; i++) {
      const q = parts[burstIdx++ % parts.length]; const a = Math.random() * Math.PI * 2, sp2 = 20 + Math.random() * 55;
      q.x = x; q.y = y - 8; q.vx = Math.cos(a) * sp2; q.vy = Math.sin(a) * sp2 - 40; q.life = 1; q.c.setAttribute('r', (1.2 + Math.random() * 2.2).toFixed(1));
    }
  }
  function fxStep(dt) {
    for (const q of parts) if (q.life > 0) {
      q.life -= dt * 0.9; q.vy += 70 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.c.setAttribute('cx', q.x.toFixed(1)); q.c.setAttribute('cy', q.y.toFixed(1)); q.c.setAttribute('opacity', Math.max(0, q.life).toFixed(2));
    }
  }

  /* --- per-frame state --- */
  function setProgress(len, ratio, lightsOn) {
    done.style.strokeDashoffset = done2.style.strokeDashoffset = (route.total - len).toFixed(1);
    dawn.setAttribute('opacity', (smooth(0.5, 1, ratio) * 0.95).toFixed(3));
    stars.setAttribute('opacity', (smooth(0.0, 0.2, 1 - ratio) * 0.0).toFixed(3));
    dusk.setAttribute('opacity', (0.5 * (1 - lightsOn)).toFixed(3));
    lights.setAttribute('opacity', lightsOn.toFixed(3));
    cloudsNear.setAttribute('opacity', (0.25 + smooth(0.25, 0.8, ratio) * 0.75).toFixed(3));
    summit.setAttribute('opacity', smooth(0.8, 1, ratio).toFixed(3));
  }
  function setView(x, y, w, h) {
    root.setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    const cx = x + w / 2, cy = y + h / 2;
    for (const g of far) { const k = +g.dataset.depth; g.setAttribute('transform', `translate(${((cx - W / 2) * k).toFixed(1)} ${((cy - H / 2) * k).toFixed(1)})`); }
    cloudsFar.setAttribute('transform', `translate(${((cx - W / 2) * 0.1).toFixed(1)} ${((cy - H / 2) * 0.1).toFixed(1)})`);
    cloudsNear.style.transform = `translate(${((cx - W / 2) * -0.08).toFixed(1)}px,${((cy - H / 2) * -0.04).toFixed(1)}px)`;
  }
  function setMarkerState(m, state, b) {
    if (m.state !== state) { m.state = state; m.g.setAttribute('data-state', state); }
    if (m.veil) m.veil.setAttribute('opacity', (1 - b).toFixed(3));
    m.glow.setAttribute('opacity', (state === 'unlocked' || state === 'explored' ? 0.95 : state === 'reached' ? 1 : b * 0.55).toFixed(3));
    m.ring.setAttribute('stroke-opacity', (0.3 + b * 0.7).toFixed(2));
    m.label.setAttribute('opacity', (state === 'locked' ? clamp((b - 0.3) / 0.5) : 1).toFixed(2));
    m.badge.setAttribute('opacity', (0.55 + 0.45 * b).toFixed(2));
  }

  return { root, climberLayer, markers, setProgress, setView, setMarkerState, burst, fxStep, W, H };
}
