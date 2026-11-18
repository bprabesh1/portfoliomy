import { $, h, svg, pad2, safeHref, clamp } from './util.js';
import { track, sendContact } from './api.js';

const ICON = {
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Zm0-9.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  github: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1a3.6 3.6 0 0 1 .1 2.7 3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z',
  linkedin: 'M4 9h4v11H4zM6 3.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM10 9h3.8v1.6c.6-1 1.9-1.9 3.8-1.9 3.6 0 4.4 2.3 4.4 5.3V20h-4v-5.2c0-1.3 0-2.9-1.8-2.9s-2.2 1.4-2.2 2.8V20h-4z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3ZM3.5 9h17M3.5 15h17',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-3Z',
  arrow: 'M7 17 17 7M8 7h9v9',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3.5-1.5L7 21l5-3 5 3-1.5-7.5',
};
const icon = (n, size = 18) => svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d: ICON[n] }));

export function renderHero(s, items, route) {
  $('#heroName').textContent = (s.name || 'Prabesh').toUpperCase();
  $('#heroRole').textContent = s.title || '';
  $('#heroBadge').textContent = s.hero_badge || s.title || '';
  $('#heroLine').textContent = s.hero_headline || '';
  $('#heroSub').textContent = s.hero_subtitle || '';
  $('#heroLoc').textContent = s.location || '';
  if (s.hero_image) $('#heroImg').src = s.hero_image;
  $('#heroImg').alt = `Portrait of ${s.full_name || s.name || 'Prabesh'}`;
  $('#heroRoute').setAttribute('d', route.d);
  const cats = new Set(items.map((i) => i.category));
  $('#heroStats').replaceChildren(
    ...[[items.length, 'Checkpoints'], [cats.size || 0, 'Trails'], [1, 'Summit']].map(([n, l]) => h('li', {}, h('b', {}, pad2(n)), h('span', {}, l))));
  document.title = s.site_title || document.title;
  const md = document.querySelector('meta[name=description]'); if (md && s.meta_description) md.setAttribute('content', s.meta_description);
}

export function renderAbout(s) {
  $('#aboutRole').textContent = s.title || '';
  $('#aboutQuote').textContent = s.about_quote ? `“${s.about_quote}”` : '';
  $('#aboutMeta').replaceChildren(...[s.location && ['pin', s.location], s.full_name && ['award', s.full_name]].filter(Boolean).map(([i, t]) => h('li', {}, icon(i), h('span', {}, t))));
  const blocks = [['Introduction', s.about_intro], ['Technical interests', s.about_interests], ['Career direction', s.about_direction], ['Problem-solving approach', s.about_approach], ['Learning mindset', s.about_mindset]].filter(([, t]) => t);
  $('#aboutCards').replaceChildren(...blocks.map(([t, b], i) => h('article', { class: `about-card reveal${i === 0 ? ' wide' : ''}`, style: `transition-delay:${i * 70}ms` }, h('span', { class: 'ac-n' }, pad2(i + 1)), h('h3', {}, t), h('p', {}, b))));
}

export function renderCertificates(list, openLightbox) {
  const grid = $('#certGrid');
  if (!list.length) { $('#certificates').hidden = true; return; }
  grid.replaceChildren(...list.map((c, i) => {
    const art = c.image
      ? h('button', { class: 'cert-img', type: 'button', 'aria-label': `View ${c.title} image`, onclick: () => { track('cert_open', c.title); openLightbox(c.image, c.title); } }, h('img', { src: c.image, alt: '', loading: 'lazy' }))
      : h('div', { class: 'cert-img ph', 'aria-hidden': 'true' }, icon('award', 44));
    const link = c.credential_url && safeHref(c.credential_url);
    return h('article', { class: 'cert-card reveal', style: `transition-delay:${(i % 3) * 80}ms` }, art,
      h('div', { class: 'cert-body' }, h('p', { class: 'cert-date' }, c.date_label || ''), h('h3', {}, c.title), h('p', { class: 'cert-org' }, c.issuer || ''),
        c.description && h('p', { class: 'cert-d' }, c.description),
        link && h('a', { class: 'link-arrow', href: link, target: '_blank', rel: 'noopener noreferrer', onclick: () => track('social_click', 'credential') }, 'View credential ', icon('arrow', 14))));
  }));
}

export function renderProjects(list) {
  const grid = $('#projGrid');
  if (!list.length) { grid.replaceChildren(h('p', { class: 'empty' }, 'Projects will appear here soon.')); return; }
  grid.replaceChildren(...list.map((p, i) => {
    const gh = p.github_url && safeHref(p.github_url), live = p.live_url && safeHref(p.live_url);
    const art = p.image ? h('img', { src: p.image, alt: `${p.name} screenshot`, loading: 'lazy' })
      : h('div', { class: 'proj-ph', 'aria-hidden': 'true' }, svg('svg', { viewBox: '0 0 200 120', 'aria-hidden': 'true' }, svg('path', { d: 'M0 120 52 52l28 34 34-50 86 84z', fill: 'rgba(255,255,255,.14)' }), svg('path', { d: 'M110 36l12 16-12-6-9 6z', fill: 'rgba(255,255,255,.5)' }), svg('circle', { cx: 160, cy: 30, r: 11, fill: 'rgba(255,214,110,.8)' })), h('span', {}, p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()));
    const btn = (href, label, type, ic) => href
      ? h('a', { class: 'btn-glass sm', href, target: '_blank', rel: 'noopener noreferrer', onclick: () => track(type, p.name) }, ic, label)
      : h('span', { class: 'btn-glass sm off', 'aria-disabled': 'true', title: 'Link will be added soon' }, ic, `${label} · soon`);
    return h('article', { class: 'proj-card reveal', style: `transition-delay:${(i % 2) * 90}ms`, onmouseenter: () => {} },
      h('div', { class: 'proj-art' }, art, p.status && h('span', { class: 'proj-status' }, p.status)),
      h('div', { class: 'proj-body' }, h('h3', {}, p.name), h('p', { class: 'proj-d' }, p.description),
        (p.tech || []).length > 0 && h('div', { class: 'chips' }, (p.tech || []).map((t) => h('span', { class: 'chip' }, t))),
        (p.features || []).length > 0 && h('ul', { class: 'proj-feat' }, (p.features || []).map((f) => h('li', {}, f))),
        h('div', { class: 'proj-actions' }, btn(gh, 'GitHub', 'project_github', icon('github', 16)), btn(live, 'Live demo', 'project_live', icon('globe', 16)))));
  }));
}

export function renderSkills(cats) {
  $('#skillGrid').replaceChildren(...cats.map((c, i) => h('article', { class: 'skill-card reveal', style: `transition-delay:${(i % 3) * 80}ms` },
    h('header', {}, h('span', { class: 'sk-n' }, pad2(i + 1)), h('h3', {}, c.title), h('small', {}, `${(c.items || []).length} skills`)),
    svg('svg', { class: 'sk-ridge', viewBox: '0 0 300 30', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, svg('path', { d: 'M0 30 40 12l24 12 40-20 36 22 46-18 50 20 30-8 34 8v8z', fill: 'currentColor' })),
    h('ul', { class: 'chips' }, (c.items || []).map((t) => h('li', { class: 'chip' }, t))))));
}

export function renderContact(s, hasResume) {
  $('#contactText').textContent = s.contact_text || '';
  const links = [['mail', s.email, 'Email', s.email && `mailto:${s.email}`], ['phone', s.phone, 'Phone', s.phone && `tel:${s.phone.replace(/[^+\d]/g, '')}`], ['github', s.github, 'GitHub', s.github], ['linkedin', s.linkedin, 'LinkedIn', s.linkedin], ['globe', s.portfolio, 'Portfolio', s.portfolio]]
    .filter(([, v, , href]) => v && href);
  $('#contactLinks').replaceChildren(...links.map(([ic, v, label, href]) => {
    const safe = href.startsWith('tel:') ? href : safeHref(href); if (!safe) return null;
    return h('li', {}, h('a', { href: safe, ...(safe.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}), onclick: () => track('social_click', label) }, icon(ic, 20), h('span', {}, h('small', {}, label), v.replace(/^https?:\/\/(www\.)?/, ''))));
  }).filter(Boolean));
  $('#contactResume').hidden = !hasResume;
  $('#footFinal').textContent = (s.final_message || '').toUpperCase();
  $('#footName').textContent = s.full_name || s.name || 'Prabesh';
  $('#year').textContent = new Date().getFullYear();
  initForm();
}

function initForm() {
  const form = $('#contactForm'), status = $('#formStatus'), btn = $('#cSubmit'); let opened = Date.now();
  form.addEventListener('focusin', () => { if (!form.dataset.touched) { form.dataset.touched = '1'; opened = Date.now(); track('contact_open'); } }, { once: false });
  const setErr = (f, m) => { const p = form.querySelector(`.err[data-for="${f}"]`); if (p) p.textContent = m || ''; const i = form.elements[f]; if (i) i.setAttribute('aria-invalid', m ? 'true' : 'false'); };
  function validate(d) {
    const e = {};
    if (d.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = 'Please enter a valid email address.';
    if (d.message.trim().length < 10) e.message = 'Please write at least 10 characters.';
    return e;
  }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form)); ['name', 'email', 'subject', 'message'].forEach((f) => setErr(f, ''));
    const errs = validate(d); status.className = 'form-status';
    if (Object.keys(errs).length) { Object.entries(errs).forEach(([f, m]) => setErr(f, m)); form.elements[Object.keys(errs)[0]].focus(); status.textContent = 'Please fix the highlighted fields.'; status.classList.add('bad'); return; }
    btn.disabled = true; btn.textContent = 'SENDING…'; status.textContent = '';
    try {
      await sendContact({ ...d, elapsed: Date.now() - opened });
      form.reset(); status.textContent = 'Thank you! Your message has been sent. I’ll get back to you soon.'; status.classList.add('ok'); delete form.dataset.touched;
    } catch (e) {
      if (e.fields) Object.entries(e.fields).forEach(([f, m]) => setErr(f, m));
      status.textContent = e.message || 'Could not send your message.'; status.classList.add('bad');
    } finally { btn.disabled = false; btn.textContent = 'SEND MESSAGE'; }
  });
}
