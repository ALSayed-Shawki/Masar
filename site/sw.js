// Masar service worker: offline app shell + push notifications.
// __BUILD__ is replaced on deploy so each release refreshes the cache.
const CACHE = 'masar-__BUILD__';
const SHELL = [
  './', './index.html', './shela.html', './css/app.css',
  './js/app.js', './js/config.js',
  './js/core/dom.js', './js/core/dates.js', './js/core/supa.js', './js/core/push.js',
  './js/modules/shela/math.js', './js/modules/shela/data.js', './js/modules/shela/views.js', './js/modules/shela/report.js',
  './js/modules/today/view.js', './js/modules/settings/view.js', './js/modules/auth/view.js',
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
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'مسار', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'مسار', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, lang: 'ar', dir: 'rtl',
    icon: 'icons/masar-192.png', badge: 'icons/badge-96.png', data: { url: d.url || './#/today' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './#/today', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
