import { $, h, pad2, CATEGORY_LABEL } from './util.js';

/** Achievement information panel: dark glass drawer with focus trap, Esc to close, prev/next. */
export function createPanel({ items, onNavigate, onClose }) {
  const el = $('#panel'), back = $('#panelBackdrop');
  let idx = -1, opener = null, open = false;
  const F = { num: $('#panelNum'), title: $('#panelTitle'), date: $('#panelDate'), org: $('#panelOrg'), desc: $('#panelDesc'), skills: $('#panelSkills'), quote: $('#panelQuote'), art: $('#panelArt'), prev: $('#panelPrev'), next: $('#panelNext') };

  function fill(i) {
    const it = items[i]; idx = i;
    F.num.textContent = `${CATEGORY_LABEL[it.category] || 'Milestone'} · Checkpoint ${pad2(i + 1)} of ${pad2(items.length)}`;
    F.title.textContent = it.title;
    F.date.textContent = it.date_label || '';
    F.org.textContent = it.organization || '';
    F.desc.textContent = it.description || '';
    F.quote.textContent = it.quote ? `“${it.quote}”` : ''; F.quote.hidden = !it.quote;
    F.skills.replaceChildren(...(it.skills || []).map((s) => h('span', { class: 'chip' }, s))); F.skills.hidden = !(it.skills || []).length;
    F.art.replaceChildren(h('img', { src: it.image || '/assets/img/checkpoint-scene.webp', alt: it.image ? `${it.title} - related image` : '', loading: 'lazy', class: it.image ? '' : 'art-default' }));
    F.prev.disabled = i === 0; F.next.disabled = i === items.length - 1;
    el.scrollTop = 0;
  }
  function show(i) {
    if (!open) { opener = document.activeElement; }
    fill(i);
    if (!open) {
      open = true; el.hidden = false; back.hidden = false;
      requestAnimationFrame(() => { el.classList.add('open'); back.classList.add('open'); });
      document.dispatchEvent(new CustomEvent('panel:state', { detail: { open: true } }));
      setTimeout(() => $('#panelClose').focus(), 60);
    }
  }
  function close() {
    if (!open) return; open = false;
    el.classList.remove('open'); back.classList.remove('open');
    document.dispatchEvent(new CustomEvent('panel:state', { detail: { open: false } }));
    setTimeout(() => { if (!open) { el.hidden = true; back.hidden = true; } }, 380);
    (opener && opener.focus && document.contains(opener)) ? opener.focus() : null; onClose && onClose();
  }
  const step = (d) => { const n = idx + d; if (n >= 0 && n < items.length) { fill(n); onNavigate(n); } };
  $('#panelClose').addEventListener('click', close);
  back.addEventListener('click', close);
  F.prev.addEventListener('click', () => step(-1));
  F.next.addEventListener('click', () => step(1));
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && !e.target.closest('input,textarea')) step(-1);
    else if (e.key === 'ArrowRight' && !e.target.closest('input,textarea')) step(1);
    else if (e.key === 'Tab') { // focus trap
      const f = [...el.querySelectorAll('button:not([disabled]),a[href]')]; if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  return { open: show, close, isOpen: () => open, index: () => idx };
}
