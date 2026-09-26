const CACHE_NAME = 'fit-hub-v5';
const ASSETS = ['./', './index.html', './assets/app.css', './assets/app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests. Cross-origin requests (CDN scripts
  // for the world map, Firebase, fonts, etc.) are left to the browser
  // untouched — intercepting and caching those "opaque" cross-origin
  // responses is fragile and was very likely why the world map's CDN
  // scripts were silently failing to load.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for our own pages/scripts, with the cache only as an
  // offline fallback. The previous cache-first strategy ("return cached
  // if we have it, refresh the cache in the background for next time")
  // meant a fresh deploy was invisible until a *second* reload — the
  // first reload would still serve the old cached HTML/JS while quietly
  // updating the cache behind the scenes. Network-first means today's
  // file is what you see today.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone)).catch(()=>{});
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
