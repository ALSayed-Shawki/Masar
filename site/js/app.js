// Masar app shell. Two installable faces from one codebase:
//   index.html → "مسار"       (owner: today, group, settings)
//   shela.html → "حساب الشلة" (friends: group only, join with code + PIN)
// New features plug in as modules: add a route here and a tab entry below.
import { $, actions, closeSheet, sheetOpen } from './core/dom.js';
import { configured, sb, getSession, isAnon, errText } from './core/supa.js';
import { fmtDay, today } from './core/dates.js';
import { renderLogin, renderNotConfigured } from './modules/auth/view.js';
import { renderToday } from './modules/today/view.js';
import { renderSettings } from './modules/settings/view.js';
import { renderShela, renderJoin } from './modules/shela/views.js';
import { G, load, subscribe, findMyGroupId, onChange } from './modules/shela/data.js';

const MODE = document.documentElement.dataset.mode; // 'masar' | 'shela'
const view = $('#view');

const ICONS = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  shela: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><circle cx="12" cy="15" r="4"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
};
const TABS = [['today', 'اليوم'], ['shela', 'الشلة'], ['settings', 'الإعدادات']];

let session = null;
const route = () => (location.hash.replace(/^#\/?/, '') || (MODE === 'shela' ? 'shela' : 'today')).split('/');

function setTabs(show, active) {
  const t = $('#tabs'); t.hidden = !show; document.body.classList.toggle('no-tabs', !show);
  if (show) t.innerHTML = `<div class="in">${TABS.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" data-act="nav" data-v="${k}">${ICONS[k]}${l}</button>`).join('')}</div>`;
}

async function ensureGroup() {
  if (G.loaded) return true;
  const gid = await findMyGroupId();
  if (!gid) return false;
  await load(gid); subscribe(gid);
  return true;
}

let rendering = false;
async function render() {
  if (rendering) return; rendering = true;
  try { await renderInner(); }
  catch (e) { view.innerHTML = `<section class="card"><p class="empty">${errText(e)}</p><button class="btn ghost sm" data-act="reload">حاول تاني</button></section>`; }
  finally { rendering = false; }
}

async function renderInner() {
  $('#sub').textContent = fmtDay(today());
  if (!configured) { setTabs(false); return renderNotConfigured(view); }
  const [page, arg] = route();

  if (MODE === 'shela') {
    setTabs(false);
    if (page === 'join') return renderJoin(view, arg, async gid => { await load(gid); subscribe(gid); location.hash = '#/shela'; });
    if (!session) return renderJoin(view, (() => { try { return localStorage.getItem('shela.code'); } catch { return ''; } })() || '', async gid => { await load(gid); subscribe(gid); session = await getSession(); location.hash = '#/shela'; });
    if (!(await ensureGroup())) return renderJoin(view, (() => { try { return localStorage.getItem('shela.code'); } catch { return ''; } })() || '', async gid => { await load(gid); subscribe(gid); location.hash = '#/shela'; });
    $('#brand').firstChild.textContent = G.group.name;
    $('#top-right').innerHTML = G.me ? `<span class="who">${G.me.name}</span>` : '';
    return renderShela(view, render);
  }

  // owner app
  if (!session || isAnon(session)) { setTabs(false); $('#fab').hidden = true; return renderLogin(view, async () => { session = await getSession(); location.hash = '#/today'; render(); }); }
  setTabs(true, page);
  if (page === 'shela') {
    if (!(await ensureGroup())) { view.innerHTML = '<section class="card"><p class="empty">لسه معملتش الشلة.</p><a class="btn primary sm" href="#/settings">اعملها من الإعدادات</a></section>'; return; }
    return renderShela(view, render);
  }
  if (page === 'settings') return renderSettings(view, render);
  return renderToday(view, render);
}

// one click handler for the whole app
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'nav') { location.hash = '#/' + el.dataset.v; return; }
  if (el.dataset.act === 'reload') { location.reload(); return; }
  const f = actions[el.dataset.act];
  if (f) { ev.preventDefault(); f(el); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
addEventListener('hashchange', () => { if (sheetOpen()) closeSheet(); render(); scrollTo(0, 0); });
let pending = false;
onChange(() => { const [p] = route(); if (MODE === 'shela' || p === 'shela') { if (sheetOpen()) pending = true; else render(); } });
document.addEventListener('sheetclosed', () => { if (pending) { pending = false; render(); } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

(async () => {
  if (configured) {
    session = await getSession();
    sb.auth.onAuthStateChange((_e, s) => { session = s; });
  }
  render();
})();
