// Masar app shell. Two installable faces from one codebase:
//   index.html → "مسار"       (owner: today, tasks, ledger, ideas, money, group, settings)
//   shela.html → "حساب الشلة" (friends: group only, join with code + PIN)
// New features plug in as modules: add a route here and a tab entry below.
import { $, actions, closeSheet, sheetOpen } from './core/dom.js';
import { attachFlip } from './core/flip.js';
import { configured, sb, getSession, isAnon, errText } from './core/supa.js';
import { fmtDay, fmtWeekday, today } from './core/dates.js';
import { renderLogin, renderNotConfigured, maybeOnboard } from './modules/auth/view.js';
import { renderToday, renderReview } from './modules/today/view.js';
import { renderTasks } from './modules/tasks/view.js';
import { renderLedger } from './modules/ledger/view.js';
import { renderIdeas } from './modules/ideas/view.js';
import { renderMoney } from './modules/money/view.js';
import { openCapture } from './modules/capture/view.js';
import { renderAzkar, syncAzkarCache } from './modules/azkar/view.js';
import { renderChat } from './modules/chat/view.js';
import { renderProjects, renderProject } from './modules/projects/view.js';
import { renderMore } from './modules/more/view.js';
import { renderSettings } from './modules/settings/view.js';
import { P, loadAll, onP } from './core/store.js';
import { renderShela, renderJoin } from './modules/shela/views.js';
import { G, load, subscribe, findMyGroupId, onChange } from './modules/shela/data.js';

const MODE = document.documentElement.dataset.mode; // 'masar' | 'shela'
const view = $('#view');

const ICONS = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  shela: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><circle cx="12" cy="15" r="4"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/></svg>',
  ledger: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  ideas: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
  projects: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  money: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M16 15h2"/></svg>',
};
const TABS = [['today', 'اليوم'], ['projects', 'المشاريع'], ['tasks', 'المهام'], ['ledger', 'الميزان'], ['more', 'المزيد']];
const TAB_OF = { project: 'projects', ideas: 'more', money: 'more', shela: 'more', azkar: 'more', chat: 'more', review: 'today', settings: 'more' };
const PAGES = { projects: renderProjects, project: renderProject, review: renderReview, more: renderMore, azkar: renderAzkar, chat: renderChat, today: renderToday, tasks: renderTasks, ledger: renderLedger, ideas: renderIdeas, money: renderMoney, settings: renderSettings };

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

let rendering = false, again = false;
async function render() {
  if (rendering) { again = true; return; }
  rendering = true;
  try { do { again = false; await renderInner(); } while (again); }
  catch (e) { view.innerHTML = `<section class="card"><p class="empty">${errText(e)}</p><button class="btn ghost sm" data-act="reload">حاول تاني</button></section>`; }
  finally { rendering = false; }
}

async function renderInner() {
  $('#sub').innerHTML = `<b>${fmtWeekday(today())}</b> · ${fmtDay(today()).replace(/^[^،,]+[،,]\s*/, '')}`;
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
  setTabs(true, TAB_OF[page] || page);
  const ic = k => ICONS[k].replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px;fill:none;stroke:currentColor;stroke-width:1.8"');
  $('#top-right').innerHTML = `<span class="actions"><button class="who" data-act="nav" data-v="chat" aria-label="رفيقك">${ic('chat')}</button><button class="who" data-act="nav" data-v="settings" aria-label="الإعدادات">${ic('settings')}</button></span>`;
  if (page === 'shela') {
    if (!(await ensureGroup())) { view.innerHTML = '<section class="card"><p class="empty">لسه معملتش الشلة.</p><a class="btn primary sm" href="#/settings">اعملها من الإعدادات</a></section>'; $('#fab').hidden = true; return; }
    return renderShela(view, render);
  }
  const fab = $('#fab'); fab.hidden = page === 'settings'; fab.textContent = '+'; fab.dataset.act = 'capture'; fab.classList.add('round');
  if (!P.loaded) { view.innerHTML = '<section class="card"><div class="skel"></div><div class="skel" style="width:70%"></div></section>'; await loadAll(); syncAzkarCache(); setTimeout(maybeOnboard, 300); }
  if (['azkar', 'chat', 'more', 'project', 'review'].includes(page)) fab.hidden = true;
  return (PAGES[page] || renderToday)(view, render, arg);
}

// one click handler for the whole app
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'nav') { if (location.hash === '#/' + el.dataset.v) render(); else location.hash = '#/' + el.dataset.v; return; }
  if (el.dataset.act === 'capture') { openCapture(); return; }
  if (el.dataset.act === 'reload') { location.reload(); return; }
  const f = actions[el.dataset.act];
  if (f) { ev.preventDefault(); f(el); }
});
document.addEventListener('masar:rerender', () => render());

// Page-turn swipe between the bottom tabs (RTL: swiping left turns to the next tab on the left).
attachFlip(view, {
  enabled: () => MODE === 'masar' && !!session && !isAnon(session) && !sheetOpen() && route()[0] !== 'shela',
  neighbour: dir => { const keys = TABS.map(x => x[0]), [page] = route(), i = keys.indexOf(TAB_OF[page] || page); return i < 0 ? null : keys[i + dir] || null; },
  go: key => { location.hash = '#/' + key; },
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
addEventListener('hashchange', () => { if (sheetOpen()) closeSheet(); render(); scrollTo(0, 0); });
let pending = false;
onChange(() => { const [p] = route(); if (MODE === 'shela' || p === 'shela') { if (sheetOpen()) pending = true; else render(); } });
onP(() => { const [p] = route(); if (MODE === 'masar' && p !== 'shela' && p !== 'settings' && p !== 'more') { if (sheetOpen()) pending = true; else render(); } });
document.addEventListener('sheetclosed', () => { if (pending) { pending = false; render(); } });

let shownDay = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden && shownDay !== today()) { shownDay = today(); render(); } });
setInterval(() => { if (shownDay !== today()) { shownDay = today(); render(); } }, 60000);

// Updates: check for a new version whenever the app comes back to the screen, and reload once
// when the new service worker takes over, so a deploy shows up without clearing anything.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !sheetOpen()) { reloaded = true; location.reload(); } });
}

(async () => {
  if (configured) {
    session = await getSession();
    sb.auth.onAuthStateChange((_e, s) => { session = s; });
  }
  render();
})();
