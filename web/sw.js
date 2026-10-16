/* Service worker: приложение открывается без интернета.
   При каждом выпуске новой версии меняй VERSION — тогда телефон предложит обновиться. */
const VERSION = '2026-10-16.11';
const CACHE = 'journal-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'ai.js',
  'manifest.webmanifest',
  'data/exercise-guides.json',
  'data/exercises.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'src/config.js',
  'src/main.js',
  'src/version.js',
  'src/data/ids.js',
  'src/data/legacy-migrate.js',
  'src/data/legacy.js',
  'src/data/migrations.js',
  'src/data/repo.js',
  'src/data/schema.js',
  'src/data/store.js',
  'src/domain/body.js',
  'src/domain/checkin.js',
  'src/domain/exercises.js',
  'src/domain/expenditure.js',
  'src/domain/gym.js',
  'src/domain/nutrition.js',
  'src/domain/program.js',
  'src/domain/training-program.js',
  'src/domain/units.js',
  'src/domain/workout.js',
  'src/i18n/index.js',
  'src/i18n/ru-gym.js',
  'src/i18n/ru-train.js',
  'src/i18n/ru.js',
  'src/services/ai-food.js',
  'src/services/ai-planned.js',
  'src/services/barcode.js',
  'src/services/exercise-library.js',
  'src/services/sync.js',
  'src/services/usage.js',
  'src/ui/app.js',
  'src/ui/chart.js',
  'src/ui/core.js',
  'src/ui/icons.js',
  'src/ui/kit.js',
  'src/data/models/body.js',
  'src/data/models/nutrients.js',
  'src/data/models/nutrition.js',
  'src/data/models/profile.js',
  'src/data/models/service.js',
  'src/data/models/workout.js',
  'src/data/repos/index.js',
  'src/domain/calc/bmr.js',
  'src/domain/calc/body_fat.js',
  'src/domain/calc/checkin.js',
  'src/domain/calc/constants.js',
  'src/domain/calc/cycle.js',
  'src/domain/calc/dates.js',
  'src/domain/calc/e1rm.js',
  'src/domain/calc/index.js',
  'src/domain/calc/macros.js',
  'src/domain/calc/micro_goals.js',
  'src/domain/calc/periodization.js',
  'src/domain/calc/plate_calculator.js',
  'src/domain/calc/progression.js',
  'src/domain/calc/tdee.js',
  'src/domain/calc/trend_weight.js',
  'src/domain/calc/util.js',
  'src/domain/calc/volume.js',
  'src/domain/calc/warmup.js',
  'src/services/foodsearch/index.js',
  'src/services/foodsearch/off.js',
  'src/services/foodsearch/usda.js',
  'src/ui/food/budget.js',
  'src/ui/food/expenditure.js',
  'src/ui/food/labels.js',
  'src/ui/food/parts.js',
  'src/ui/food/plate.js',
  'src/ui/screens/backup.js',
  'src/ui/screens/checkin.js',
  'src/ui/screens/dashboard.js',
  'src/ui/screens/expenditure.js',
  'src/ui/screens/goal.js',
  'src/ui/screens/keys.js',
  'src/ui/screens/more.js',
  'src/ui/screens/onboarding.js',
  'src/ui/screens/profile.js',
  'src/ui/screens/program-options.js',
  'src/ui/screens/settings.js',
  'src/ui/train/bar.js',
  'src/ui/train/catalog.js',
  'src/ui/train/inputs.js',
  'src/ui/train/muscle-map.js',
  'src/ui/train/picker.js',
  'src/ui/train/timer.js',
  'src/ui/screens/body/body.js',
  'src/ui/screens/body/cycle.js',
  'src/ui/screens/body/history.js',
  'src/ui/screens/body/labels.js',
  'src/ui/screens/body/photos.js',
  'src/ui/screens/body/sheets.js',
  'src/ui/screens/food/add.js',
  'src/ui/screens/food/diary.js',
  'src/ui/screens/food/editor.js',
  'src/ui/screens/food/library.js',
  'src/ui/screens/food/nutrients.js',
  'src/ui/screens/food/recipes.js',
  'src/ui/screens/food/scanner.js',
  'src/ui/screens/train/gyms.js',
  'src/ui/screens/train/history.js',
  'src/ui/screens/train/levels.js',
  'src/ui/screens/train/library.js',
  'src/ui/screens/train/plans.js',
  'src/ui/screens/train/plates.js',
  'src/ui/screens/train/programs.js',
  'src/ui/screens/train/session.js',
  'src/ui/screens/train/settings.js',
  'src/ui/screens/train/train.js',
  'vendor/anthropic-0.131.0.mjs',
  'vendor/preact-htm-10.29.8.mjs',
  'vendor/zxing-upcean-0.23.0.mjs'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
  if (req.mode === 'navigate') { /* страница — сначала из сети, чтобы новая версия подхватывалась сразу */
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
