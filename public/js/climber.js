import { svg as S, clamp, lerp } from './util.js';

// Prabesh, the climber. The supplied climbing artwork is placed on the route and animated
// procedurally: it follows the path tangent, turns to face the direction of travel, takes a
// "step" every few units of rope, breathes when still, relaxes at checkpoints and hops when an
// achievement unlocks. A slack rope trails behind him along the route.
const SPRITE = { w: 365, h: 760, ax: 0.3, ay: 0.985 };
export const CLIMBER_H = 46;                       // height in world units (tent ~ 50 wide)

export function createClimber(layer, route) {
  const k = CLIMBER_H / SPRITE.h, wU = SPRITE.w * k;
  const g = S('g', { class: 'climber' });
  const shadow = S('ellipse', { rx: 13, ry: 3.6, fill: 'url(#shadowG)', opacity: 0.8 });
  const rope = S('path', { fill: 'none', stroke: '#ff8a1f', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.95 });
  const ropeHi = S('path', { fill: 'none', stroke: '#ffe0b8', 'stroke-width': 0.6, 'stroke-dasharray': '2 3', 'stroke-linecap': 'round', opacity: 0.85 });
  const body = S('g');
  const img = S('image', { href: '/assets/img/climber.webp', x: 0, y: 0, width: SPRITE.w, height: SPRITE.h, class: 'climber-img' });
  const halo = S('circle', { cx: SPRITE.w * 0.45, cy: SPRITE.h * 0.4, r: SPRITE.w * 0.9, fill: 'url(#goldG)', opacity: 0 });
  body.append(halo, img);
  g.append(shadow, rope, ropeHi, body);
  layer.append(g);

  let face = 1, hop = 0, hopT = 0, restBlend = 0, lastLen = 0, stride = 0;
  const api = {
    g, face: () => face,
    celebrate() { hop = 1; hopT = 0; },
    /** len: distance along route; moving: bool; t: seconds; dt: frame time; mode 'climb' | 'rest' */
    update(len, moving, t, dt, mode, ratio) {
      const p = route.pointAt(len), a = route.angleAt(len);
      const target = Math.cos(a * Math.PI / 180) >= 0 ? 1 : -1;
      face += (target - face) * clamp(dt * 7, 0, 1);
      const delta = ((a + 90 + 540) % 360) - 180;
      const lean = clamp(delta * 0.3, -16, 16);

      stride += Math.abs(len - lastLen); lastLen = len;
      const phase = stride / 15;
      restBlend = lerp(restBlend, mode === 'rest' ? 1 : 0, clamp(dt * 4, 0, 1));
      let bob = 0, tilt = 0, sy = 1;
      if (moving) { bob = -Math.abs(Math.sin(phase * Math.PI)) * 1.5; tilt = Math.sin(phase * Math.PI) * 2.2 * face; sy = 1 + Math.cos(phase * Math.PI * 2) * 0.012; }
      else { sy = 1 + Math.sin(t * 2.3) * 0.008; tilt = Math.sin(t * 1.1) * 0.6; }
      tilt += -3 * restBlend * face;                    // sits back a little while resting
      bob += 1.1 * restBlend;
      if (hop > 0) { hopT += dt; const u = hopT / 0.85; if (u >= 1) hop = 0; else bob -= Math.abs(Math.sin(u * Math.PI * 2)) * 7 * (1 - u * 0.5); }
      const s = k, flip = face;
      g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      body.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${(lean + tilt).toFixed(2)}) scale(${(flip * s).toFixed(4)} ${(s * sy).toFixed(4)}) translate(${-SPRITE.ax * SPRITE.w} ${-SPRITE.ay * SPRITE.h})`);
      shadow.setAttribute('transform', `scale(${(1 - Math.min(0, bob) * 0.02).toFixed(3)} 1)`);
      halo.setAttribute('opacity', (restBlend * 0.55 + (hop > 0 ? 0.35 : 0)).toFixed(2));
      // slack rope: harness -> a few units back along the route (hangs with a sag)
      const back = route.pointAt(len - 30), hx = 0, hy = -CLIMBER_H * 0.42 + bob;
      const bx = back.x - p.x, by = back.y - p.y, mx = (hx + bx) / 2, my = (hy + by) / 2 + 9;
      const d = `M${hx} ${hy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
      rope.setAttribute('d', d); ropeHi.setAttribute('d', d);
      return p;
    },
    setOpacity(o) { g.setAttribute('opacity', o); },
  };
  return api;
}
