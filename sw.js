// Offline-Betrieb: alle Dateien der App beim Installieren zwischenspeichern und von dort laden.
// BUILD wird beim Veröffentlichen durch die Commit-Kennung ersetzt; dadurch holt sich jedes
// Gerät nach einem Update die neuen Dateien.
const BUILD = '__BUILD__';
const CACHE = `poldi-${BUILD}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/logic.js',
  'js/files.js',
  'js/xfa.js',
  'js/ui/common.js',
  'js/ui/icons.js',
  'js/ui/install.js',
  'js/ui/main.js',
  'js/ui/detail.js',
  'js/ui/picker.js',
  'js/ui/dialogs.js',
  'js/ui/fahrtenbuch.js',
  'js/ui/abrechnung.js',
  'vendor/preact-htm.js',
  'vendor/pdf-lib.min.js',
  'poldi_locations.json',
  'fonts/atkinson_hyperlegible_next_regular.ttf',
  'fonts/atkinson_hyperlegible_next_medium.ttf',
  'fonts/atkinson_hyperlegible_next_bold.ttf',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('poldi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});
