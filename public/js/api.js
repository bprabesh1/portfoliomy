export async function loadSite() {
  const r = await fetch('/api/site', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Could not load site data');
  return r.json();
}

/** Anonymous analytics: no cookies, no personal data. Fire-and-forget. */
export function track(type, target = '') {
  try {
    const body = JSON.stringify({ type, target: String(target).slice(0, 120), path: location.pathname, ref: type === 'view' ? document.referrer : '' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

export async function sendContact(payload) {
  const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.fields = data.fields; throw e; }
  return data;
}
