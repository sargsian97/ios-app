/* Service worker: приложение открывается без интернета.
   При каждом выпуске новой версии меняй VERSION — тогда телефон предложит обновиться. */
const VERSION = '2026-10-16.2';
const CACHE = 'journal-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'ai.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/anthropic-0.131.0.mjs',
  'vendor/preact-htm-10.29.8.mjs',
  /* новая оболочка */
  'src/main.js',
  'src/version.js',
  'src/i18n/index.js',
  'src/i18n/ru.js',
  'src/data/store.js',
  'src/data/schema.js',
  'src/data/repo.js',
  'src/data/ids.js',
  'src/data/migrations.js',
  'src/data/legacy.js',
  'src/data/models/profile.js',
  'src/data/repos/index.js',
  'src/services/sync.js',
  'src/domain/units.js',
  'src/ui/core.js',
  'src/ui/icons.js',
  'src/ui/kit.js',
  'src/ui/app.js',
  'src/ui/screens/dashboard.js',
  'src/ui/screens/backup.js',
  'src/ui/screens/profile.js',
  'src/ui/screens/settings.js',
  'src/ui/screens/more.js',
  /* расчёты */
  'src/domain/calc/constants.js',
  'src/domain/calc/util.js',
  'src/domain/calc/dates.js',
  'src/domain/calc/trend_weight.js',
  'src/domain/calc/bmr.js',
  'src/domain/calc/tdee.js',
  'src/domain/calc/macros.js',
  'src/domain/calc/micro_goals.js',
  'src/domain/calc/e1rm.js',
  'src/domain/calc/progression.js',
  'src/domain/calc/warmup.js',
  'src/domain/calc/plate_calculator.js',
  'src/domain/calc/volume.js',
  'src/domain/calc/index.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('journal-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* api.anthropic.com идёт мимо кэша */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
