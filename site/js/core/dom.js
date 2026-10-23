export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Click actions: any element with data-act="name" calls actions[name](element). */
export const actions = {};
export function registerActions(map) { Object.assign(actions, map); }

let toastTimer;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

let onClose = null;
export function openSheet(html, { onClosed } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="grab"></div><button class="x" data-act="close" aria-label="إغلاق">×</button>${html}`;
  s.hidden = false; $('#scrim').hidden = false; s.scrollTop = 0; onClose = onClosed || null;
}
export function closeSheet() {
  $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheet').innerHTML = '';
  const f = onClose; onClose = null; f && f();
  document.dispatchEvent(new Event('sheetclosed'));
}
export const sheetOpen = () => !$('#sheet').hidden;

export const seg = (id, opts, v) => `<div class="seg" id="${id}">${opts.map(([k, l]) =>
  `<button type="button" data-act="seg" data-v="${esc(k)}" class="${String(k) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
export const segV = id => document.querySelector('#' + id + ' .on')?.dataset.v;
export const val = id => (document.getElementById(id)?.value || '').trim();

/** Two-tap confirm for destructive buttons. Returns true on the second tap. */
export function confirmTap(el, label = 'اضغط تاني للتأكيد') {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1'; const old = el.textContent; el.textContent = label;
  setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = old; } }, 3000);
  return false;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('اتنسخ'); }
  catch { toast('النسخ مش متاح؛ حدد النص وانسخه'); }
}

export const waLink = text => 'https://wa.me/?text=' + encodeURIComponent(text);

registerActions({
  close: closeSheet,
  seg: el => {
    const p = el.parentElement;
    p.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    p.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: el.dataset.v }));
  },
});
