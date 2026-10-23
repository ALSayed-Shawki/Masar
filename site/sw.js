// Deployed by .github/workflows/pages.yml
// Masar service worker: offline app shell + push notifications.
// __BUILD__ is replaced on deploy so each release refreshes the cache.
const CACHE = 'masar-__BUILD__';
const SHELL = [
  './', './index.html', './shela.html', './css/app.css',
  './js/app.js', './js/config.js',
  './js/core/dom.js', './js/core/dates.js', './js/core/supa.js', './js/core/push.js',
  './js/modules/shela/math.js', './js/modules/shela/data.js', './js/modules/shela/views.js', './js/modules/shela/report.js',
  './js/modules/today/view.js', './js/modules/settings/view.js', './js/modules/auth/view.js',
  './js/core/store.js', './js/core/ai.js', './js/core/flip.js', './js/modules/tasks/view.js', './js/modules/capture/view.js',
  './js/modules/ledger/view.js', './js/modules/ideas/view.js', './js/modules/money/view.js',
  './js/modules/azkar/view.js', './js/modules/azkar/library.js', './js/modules/chat/view.js',
  './js/modules/projects/view.js', './js/modules/more/view.js',
  './manifest-masar.webmanifest', './manifest-shela.webmanifest',
  './icons/masar-192.png', './icons/shela-192.png', './icons/badge-96.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('masar-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin files: network first (fresh after deploys), cache as fallback offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // no-cache: always revalidate with GitHub Pages (its CDN otherwise serves files up to 10 min old)
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

const ICON = 'icons/masar-192.png', BADGE = 'icons/badge-96.png';

async function azkarList(slot) {
  try { const r = await (await caches.open('azkar-data')).match('./__azkar.json'); return r ? (await r.json())[slot] || [] : []; }
  catch { return []; }
}
// One zikr per notification; tapping shows the next one (Android). The "open" action opens the reader.
async function showZikr(slot, i) {
  const list = await azkarList(slot), label = slot === 'morning' ? 'أذكار الخروج والصباح' : 'أذكار الرجوع والمساء';
  if (!list.length) return self.registration.showNotification(label, { body: 'افتح التطبيق عشان تقرأ الأذكار.', icon: ICON, badge: BADGE, tag: 'azkar-' + slot, lang: 'ar', dir: 'rtl', data: { url: './#/azkar/' + slot } });
  if (i >= list.length) return self.registration.showNotification('تقبّل الله', { body: `خلّصت ${label}.`, icon: ICON, badge: BADGE, tag: 'azkar-' + slot, lang: 'ar', dir: 'rtl', data: { url: './#/today' } });
  const z = list[i];
  return self.registration.showNotification(`${z.t} · ${i + 1}/${list.length}${z.c > 1 ? ` · ${z.c} مرات` : ''}`, {
    body: z.b, icon: ICON, badge: BADGE, tag: 'azkar-' + slot, renotify: true, requireInteraction: true, silent: i > 0, lang: 'ar', dir: 'rtl',
    actions: [{ action: 'next', title: 'اللي بعده' }, { action: 'open', title: 'افتح' }],
    data: { type: 'azkar', slot, i, url: './#/azkar/' + slot },
  });
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'مسار', body: e.data?.text() || '' }; }
  if (d.type === 'azkar') { e.waitUntil(showZikr(d.slot, 0)); return; }
  e.waitUntil(self.registration.showNotification(d.title || 'مسار', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, lang: 'ar', dir: 'rtl',
    icon: ICON, badge: BADGE, data: { url: d.url || './#/today' },
  }));
});

function openUrl(url) {
  const target = new URL(url || './#/today', self.registration.scope).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  });
}

self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  if (d.type === 'azkar' && e.action !== 'open') { e.waitUntil(showZikr(d.slot, d.i + 1)); return; }
  e.waitUntil(openUrl(d.url));
});
