export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
export const NS = 'http://www.w3.org/2000/svg';

/** Tiny DOM builder. Text is always inserted as text nodes (never HTML) so admin-entered content cannot inject markup. */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isSmall = () => innerWidth < 760;
export const pad2 = (n) => String(n).padStart(2, '0');
export const safeHref = (u) => { try { const x = new URL(u, location.origin); return ['http:', 'https:', 'mailto:'].includes(x.protocol) ? x.href : null; } catch { return null; } };
export const SESSION = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };

/** Shorten a milestone title for compact labels: prefer text in parentheses, e.g. "(BIM)". */
export function shortTitle(t) {
  const m = /\(([^)]{2,10})\)/.exec(t); if (m) return m[1];
  const words = t.split(/\s+/); return words.length > 3 ? words.slice(0, 2).join(' ') : t;
}
export const CATEGORY_LABEL = { education: 'Education', training: 'Training', certificate: 'Certificate', experience: 'Experience', other: 'Milestone' };
