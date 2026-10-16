/* Запуск: хранилище → миграции → старый журнал → новая оболочка → офлайн-кэш */
import { defaultBackend, createStore, memoryBackend } from './data/store.js';
import { migrate } from './data/migrations.js';
import { createRepos } from './data/repos/index.js';
import { pickSyncProvider } from './services/sync.js';
import { setLang, t } from './i18n/index.js';
import { startLegacy, showLegacy, legacyOpenAdd, legacyPersist, legacyBudget, legacyWeekStats } from '../app.js';
import { foodForLegacy, bodyForLegacy } from './data/legacy.js';
import { idbBlobs, memoryBlobs } from './data/store.js';
import { mealOf } from './domain/nutrition.js';
import { mountApp } from './ui/app.js';

const PREVIEW = window.JOURNAL_PREVIEW || null;
const root = document.getElementById('root');

function fail(text) {
  root.innerHTML = '<div class="wrap"><div class="card pad"><h2></h2><p></p></div></div>';
  root.querySelector('h2').textContent = t('boot.failTitle');
  root.querySelector('p').textContent = text;
}

/* Обновления: новый service worker ждёт, пока пользователь нажмёт «Обновить» */
function setupUpdates() {
  const subs = new Set();
  const u = {
    waiting: null,
    listen(cb) { subs.add(cb); return () => subs.delete(cb); },
    apply() { if (u.waiting) u.waiting.postMessage({ type: 'SKIP_WAITING' }); }
  };
  function set(w) { u.waiting = w; subs.forEach((cb) => cb(w)); }
  if ('serviceWorker' in navigator && !PREVIEW) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const watch = (w) => w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) set(w); });
      if (reg.waiting && navigator.serviceWorker.controller) set(reg.waiting);
      reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg.installing); });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      legacyPersist().finally(() => setTimeout(() => location.reload(), 150));
    });
  }
  return u;
}

async function boot() {
  let store;
  try {
    if (PREVIEW && PREVIEW.memory) store = await createStore(memoryBackend(PREVIEW.data || {}));
    else { const { backend, rows } = await defaultBackend(); store = await createStore(backend, rows); }
  } catch (e) {
    fail(t('boot.storage'));
    return;
  }
  /* предпросмотр внутри Claude: данные журнала при первом открытии */
  if (PREVIEW && PREVIEW.data && store.isEmpty()) { try { await store.importAll(PREVIEW.data); } catch (e) { /* пусто */ } }
  try { await migrate(store); } catch (e) { console.error(e); fail(t('boot.migrate', { e: (e && e.message) || String(e) })); return; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* не страшно */ }

  const repos = createRepos(store);
  setLang(repos.profile.get().lang);

  const container = document.createElement('div');
  container.className = 'wrap';
  container.id = 'app';
  const afterImport = () => migrate(store);
  /* старые экраны читают питание из новой модели; новые экраны узнают об изменениях данных журнала */
  const legacySubs = new Set();
  const foodProjection = (cb) => { const push = () => cb(foodForLegacy(store, mealOf)); setTimeout(push, 0); store.subscribe('foodEntries', push); };
  const bodyProjection = (cb) => { const push = () => cb(bodyForLegacy(store)); setTimeout(push, 0); store.subscribe(['scaleEntries', 'bodyEntries'], push); };
  startLegacy({ store, container, afterImport, foodProjection, bodyProjection, onChange: () => legacySubs.forEach((f) => f()) });

  const ctx = {
    store, repos, afterImport,
    blobs: PREVIEW && PREVIEW.memory ? memoryBlobs() : idbBlobs(),
    sync: pickSyncProvider(),
    updates: setupUpdates(),
    legacy: {
      container, show: showLegacy, openAdd: legacyOpenAdd, persist: legacyPersist,
      budget: legacyBudget, weekStats: legacyWeekStats,
      listen(cb) { legacySubs.add(cb); return () => legacySubs.delete(cb); }
    }
  };
  if (!location.hash) history.replaceState(null, '', '#/');
  mountApp(root, ctx);
}

boot();
