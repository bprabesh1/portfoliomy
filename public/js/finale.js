import { $, clamp, lerp, smooth, easeInOut, NS, prefersReducedMotion } from './util.js';

// The emotional summit sequence. The supplied "helping hand" artwork is directed like a film:
// establishing shot -> Prabesh reaches up -> a hand reaches down -> the hands meet (golden flash)
// -> pull back to the summit -> closing message. Sun rays, drifting clouds, a rippling flag and wind
// particles keep the whole scene alive.
const IMG = { w: 1536, h: 1024 };
const SHOTS = [ // t, focusX, focusY, zoom (relative to "cover")
  [0.0, 768, 512, 1.0], [0.1, 768, 512, 1.0], [0.24, 560, 560, 1.85], [0.3, 560, 560, 1.85],
  [0.43, 1000, 235, 1.75], [0.49, 1000, 235, 1.75], [0.58, 792, 322, 2.9], [0.64, 792, 322, 2.9],
  [0.82, 768, 430, 1.12], [1.0, 768, 440, 1.06],
];
const CAPTIONS = [[0.12, 'Prabesh reaches upward…'], [0.31, '…and a hand reaches down.'], [0.5, 'Opportunity. Teamwork. Support.'], [0.66, 'Together, they reach the summit.'], [0.8, '']];
const HANDS = [792, 322];

export function createFinale({ settings, hasResume }) {
  const root = $('#finale'), cam = $('#finCam'), imgEl = $('#finImg'), flag = $('#finFlag'), rays = $('#finRays'), flash = $('#finFlash'), cap = $('#finCap'), end = $('#finEnd'), canvas = $('#finSpark');
  const ctx = canvas.getContext('2d'); const reduced = prefersReducedMotion();
  let W = 0, H = 0, sc = 1, dpr = 1, capIdx = -2, flashed = false, parts = [];

  // texts (always textContent - admin-editable content is never injected as HTML)
  $('#sumTitle').textContent = (settings.summit_title || 'The journey never ends.').toUpperCase();
  $('#sumQuote').textContent = settings.summit_quote ? `“${settings.summit_quote}”` : '';
  $('#sumRoles').textContent = settings.summit_roles || '';
  $('#sumFinal').textContent = (settings.final_message || '').toUpperCase();
  $('.fin-name').textContent = (settings.name || 'Prabesh').toUpperCase();
  const r = $('#finResume'); r.hidden = !hasResume;

  // ripple filter for the flag
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', 0); s.setAttribute('height', 0); s.setAttribute('aria-hidden', 'true'); s.style.position = 'absolute';
  s.innerHTML = `<filter id="flagWave" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.010 0.028" numOctaves="2" seed="3" result="t"><animate attributeName="baseFrequency" dur="5s" values="0.010 0.028;0.016 0.040;0.010 0.028" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="t" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.append(s);
  const url = '/assets/img/summit-rescue.webp';
  imgEl.style.backgroundImage = flag.style.backgroundImage = `url(${url})`;
  flag.style.clipPath = 'polygon(79.3% 1.2%,93.8% 3%,99% 9.8%,97.7% 23.4%,91.2% 19.5%,85.6% 20%,80% 21%)';

  function resize() {
    W = root.clientWidth; H = root.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
    sc = Math.max(W / IMG.w, H / IMG.h);
    const iw = IMG.w * sc, ih = IMG.h * sc;
    for (const e of [imgEl, flag, rays, $('#finClouds'), flash]) { e.style.width = `${iw}px`; e.style.height = `${ih}px`; }
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  addEventListener('resize', resize); resize();

  const shot = (t) => {
    let a = SHOTS[0], b = SHOTS[SHOTS.length - 1];
    for (let i = 0; i < SHOTS.length - 1; i++) if (t >= SHOTS[i][0] && t <= SHOTS[i + 1][0]) { a = SHOTS[i]; b = SHOTS[i + 1]; break; }
    const u = a[0] === b[0] ? 1 : easeInOut(clamp((t - a[0]) / (b[0] - a[0])));
    return { fx: lerp(a[1], b[1], u), fy: lerp(a[2], b[2], u), k: lerp(a[3], b[3], u) };
  };
  const toScreen = (ix, iy, st, tx, ty) => [tx + st.k * ix * sc, ty + st.k * iy * sc];

  function burst(x, y) { for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 380; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 1, size: 1 + Math.random() * 2.6, kind: 'spark' }); } }

  return {
    update(f, time, dt) {
      const on = f > 0.004;
      root.style.visibility = on ? 'visible' : 'hidden'; root.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (!on) { capIdx = -2; flashed = false; parts.length = 0; return; }
      root.style.opacity = smooth(0.0, 0.1, f).toFixed(3);
      const st = shot(f);
      const drift = reduced ? 0 : Math.sin(time * 0.5) * 0.008;
      const k = st.k * (1 + drift);
      let tx = W / 2 - k * st.fx * sc, ty = H / 2 - k * st.fy * sc;
      tx = clamp(tx, W - IMG.w * sc * k, 0); ty = clamp(ty, H - IMG.h * sc * k, 0);
      const s2 = { k }; cam.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k.toFixed(4)})`;
      rays.style.opacity = (0.35 + 0.5 * smooth(0.55, 0.85, f)).toFixed(2);
      rays.style.transform = reduced ? '' : `rotate(${(time * 4).toFixed(2)}deg)`;
      // golden flash when the hands meet
      const fl = Math.max(0, 1 - Math.abs(f - 0.585) / 0.04);
      flash.style.opacity = fl.toFixed(3);
      if (f > 0.575 && !flashed) { flashed = true; const [hx, hy] = toScreen(HANDS[0], HANDS[1], s2, tx, ty); if (!reduced) burst(hx, hy); }
      if (f < 0.55) flashed = false;
      // captions
      const ci = CAPTIONS.reduce((a, [t], i) => (f >= t ? i : a), -1);
      if (ci !== capIdx) { capIdx = ci; cap.classList.remove('in'); cap.textContent = ci >= 0 ? CAPTIONS[ci][1] : ''; void cap.offsetWidth; if (ci >= 0 && CAPTIONS[ci][1]) cap.classList.add('in'); }
      // closing card
      const e = smooth(0.8, 0.93, f);
      end.style.opacity = e.toFixed(3); end.style.pointerEvents = e > 0.85 ? 'auto' : 'none'; end.style.visibility = e > 0.01 ? 'visible' : 'hidden';
      end.style.transform = `translateY(${((1 - e) * 24).toFixed(1)}px)`;
      cap.style.opacity = (1 - smooth(0.78, 0.86, f)).toFixed(2);
      root.classList.toggle('ended', e > 0.5);
      // particles: golden dust + wind
      if (!reduced) {
        if (Math.random() < 0.5) parts.push({ x: Math.random() * W, y: H + 10, vx: 8 + Math.random() * 16, vy: -(18 + Math.random() * 40), life: 1.2, size: 0.8 + Math.random() * 1.8, kind: 'dust' });
        if (Math.random() < 0.18) parts.push({ x: W + 20, y: Math.random() * H * 0.8, vx: -(240 + Math.random() * 260), vy: 8, life: 1, size: 1, kind: 'wind', len: 30 + Math.random() * 60 });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt * (p.kind === 'spark' ? 0.9 : p.kind === 'wind' ? 0.45 : 0.28);
          if (p.life <= 0 || p.x < -90 || p.y < -20) { parts.splice(i, 1); continue; }
          if (p.kind === 'spark') p.vy += 150 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.kind === 'wind') { ctx.strokeStyle = `rgba(255,255,255,${(0.28 * Math.min(1, p.life)).toFixed(2)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y - 2); ctx.stroke(); }
          else { ctx.fillStyle = `rgba(255,${p.kind === 'spark' ? 214 : 226},${p.kind === 'spark' ? 110 : 150},${Math.min(1, p.life).toFixed(2)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill(); }
        }
        if (parts.length > 400) parts.splice(0, parts.length - 400);
      }
    },
  };
}
