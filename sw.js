const CACHE_NAME = 'fit-hub-v7';
// Every page + shared asset the Hub actually needs to work offline on a
// completely fresh install — not just the Hub shell itself. Before this,
// only 7 files were pre-cached at install; everything else (every app
// page, the banner/theme assets, the tile icons) only became available
// offline *after* you'd opened it at least once while online, since the
// fetch handler below only caches things as they're actually requested.
// That's fine for a device that's been used for a while, but means a
// fresh install (or a cleared cache) wouldn't open Gym/Diet/To-Do/etc. at
// all with no connection until each had been visited once. Listing them
// here means they're all ready offline from the very first install.
const ASSETS = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './assets/app.css', './assets/app.js', './assets/banners.css', './assets/banners.js', './assets/theme.js',
  './apps/todo.html', './apps/diet.html', './apps/schedule.html', './apps/grocery.html',
  './apps/chores.html', './apps/skin.html', './apps/calendar.html', './apps/clock.html',
  './apps/budget.html',
  './gym/index.html',
  './tile-icons/gym.png', './tile-icons/diet.png', './tile-icons/todo.png', './tile-icons/schedule.png',
  './tile-icons/grocery.png', './tile-icons/chores.png', './tile-icons/skin.png', './tile-icons/calendar.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // One failed fetch used to sink the entire precache via cache.addAll
      // (it's all-or-nothing) — a single renamed/missing file in the list
      // above would then silently mean NONE of the rest got pre-cached
      // either, with zero visible error. allSettled + per-file add means
      // one bad entry only loses that one file, not the whole warm-up.
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    ).catch(()=>{})
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
