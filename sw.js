/* Fore Coffee Sales Dashboard — service worker
   Strategy:
   - Same-origin navigations / index.html → NETWORK FIRST (so a new deploy is
     shown immediately; cache is only a fallback when offline).
   - Same-origin static assets (icons, manifest) → CACHE FIRST.
   - Cross-origin (Google Sheets data, fonts, Chart.js CDN) → straight to
     network, never cached here (data must always be fresh).
   Bump CACHE_VERSION to invalidate old caches on the next deploy. */
const CACHE_VERSION = 'fore-v18';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE_ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only handle same-origin requests; let everything else hit the network.
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/');

  if (isDoc) {
    // Network first → fall back to cached shell when offline.
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: cache first, then network.
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }))
  );
});
