// One continuous climbing route. Everything (climber, checkpoints, camera, rope) uses
// the same coordinate system: the 1536x1024 mountain illustration.
export const WORLD = { w: 1536, h: 1024 };

// Waypoints trace the trail painted in the mountain artwork. "c" marks the six golden flag platforms
// that are baked into the artwork (so the default six checkpoints land exactly on them).
const WP = [
  [292, 898], [350, 872], [388, 826], { c: [402, 780] }, [440, 766], [482, 742], { c: [518, 722] },
  [572, 694], [632, 676], [700, 662], [770, 652], [850, 641], [920, 624], [975, 598], { c: [1040, 562] },
  [1086, 536], [1126, 512], [1140, 488], [1124, 462], [1088, 442], [1030, 440], [975, 432], [915, 422], [850, 432], [790, 437], [735, 433],
  { c: [665, 432] }, [692, 402], [736, 372], [785, 336], [815, 314], { c: [838, 302] }, [882, 292], [926, 270], [954, 244],
  { c: [968, 217] }, [986, 184], [978, 150], [961, 116], [958, 82], [962, 46],
];

function toBezier(pts) {
  // Catmull-Rom -> cubic Bezier, one smooth continuous path
  const k = 1 / 6;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${(p1[0] + (p2[0] - p0[0]) * k).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * k).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * k).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * k).toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function buildRoute(svg) {
  const pts = WP.map((w) => (Array.isArray(w) ? w : w.c));
  const canon = WP.filter((w) => !Array.isArray(w)).map((w) => w.c);
  const d = toBezier(pts);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  svg.appendChild(path);
  const total = path.getTotalLength();

  // length along the path of each baked-in flag platform (nearest point on the path)
  const samples = []; for (let l = 0; l <= total; l += 2) { const p = path.getPointAtLength(l); samples.push([l, p.x, p.y]); }
  const canonLens = canon.map(([cx, cy]) => { let best = 0, bd = 1e9; for (const [l, x, y] of samples) { const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = l; } } return best; });

  const pointAt = (len) => { const l = Math.max(0, Math.min(total, len)); const p = path.getPointAtLength(l); return { x: p.x, y: p.y }; };
  const angleAt = (len) => { // tangent angle in degrees (0 = heading right, -90 = straight up)
    const a = pointAt(len - 6), b = pointAt(len + 6); return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  };

  // Place N checkpoints on the route. Default (6) lands exactly on the six artwork platforms;
  // any other count is spread evenly between the first and last platform, so records added in
  // the admin panel automatically take their place on the mountain.
  function slotsFor(n) {
    if (n <= 0) return [];
    if (n === canonLens.length) return canonLens.slice();
    if (n === 1) return [canonLens[0]];
    const a = canonLens[0], b = canonLens[canonLens.length - 1];
    return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));
  }
  const isCanonical = (len) => canonLens.some((c) => Math.abs(c - len) < 24);

  return { d, path, total, pointAt, angleAt, slotsFor, isCanonical, canonLens, summitLen: total };
}
