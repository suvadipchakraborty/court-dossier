const CACHE = 'court-dossier-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.endsWith('wikidata.org') || u.hostname.endsWith('wikipedia.org')) return; // always live
  e.respondWith(
    caches.match(r).then(hit => {
      const net = fetch(r).then(res => {
        if (res.ok && (u.origin === location.origin || u.hostname.includes('gstatic') || u.hostname.includes('googleapis'))) {
          const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
