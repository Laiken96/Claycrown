// Claycrown Service Worker: Offline Betrieb für Version 2.0 und die klassische Version 1.0
const CACHE = 'claycrown-v7';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/data.js', './js/util.js', './js/world.js', './js/ai.js', './js/render.js', './js/input.js', './js/ui.js', './js/audio.js',
  './js/gfx-util.js', './js/gfx-units.js', './js/gfx-buildings.js',
  './classic/index.html', './classic/css/style.css', './classic/js/main.js', './classic/js/data.js', './classic/js/util.js', './classic/js/world.js',
  './classic/js/ai.js', './classic/js/render.js', './classic/js/input.js', './classic/js/ui.js', './classic/js/audio.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netzwerk zuerst, damit Updates sofort ankommen. Offline aus dem Cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
