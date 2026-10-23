/* Запуск: хранилище → миграции → старый журнал → новая оболочка → офлайн-кэш */
import { defaultBackend, createStore, memoryBackend, openJournalDb } from './data/store.js';
import { artifactBackend } from './data/artifact-backend.js';
import { migrate } from './data/migrations.js';
import { createRepos } from './data/repos/index.js';
import { pickSyncProvider } from './services/sync.js';
import { setLang, t } from './i18n/index.js';
import { startLegacy, showLegacy, legacyOpenAdd, legacyPersist, legacyBudget, legacyWeekStats } from '../app.js';
import { foodForLegacy, bodyForLegacy, workoutsForLegacy, daysForLegacy } from './data/legacy.js';
import { idbBlobs, memoryBlobs } from './data/store.js';
import { mealOf } from './domain/nutrition.js';
import { mountApp } from './ui/app.js';
import { navigate, todayYmd } from './ui/core.js';

const PREVIEW = window.JOURNAL_PREVIEW || null;
/* Внутри Artifact на claude.ai: данные в общей базе артефакта, без service worker */
const ARTIFACT = window.JOURNAL_ARTIFACT === true;
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
  if ('serviceWorker' in navigator && !PREVIEW && !ARTIFACT) {
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

/* Ошибка записи в базу артефакта: полоска поверх экрана, пока её не закроют */
function showWriteError(e) {
  let el = document.getElementById('write-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'write-error';
    el.className = 'banner warnb';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 8px);z-index:1000;cursor:pointer';
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }
  el.textContent = t('boot.writeFailed', { e: (e && e.message) || String(e) });
}

/* База артефакта; null — открыто не из аккаунта Claude или база не ответила */
async function artifactStore() {
  let db = null;
  try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
  if (!db) { fail(t('boot.artifactNoDb')); return null; }
  try { return await createStore(artifactBackend(db, { onError: showWriteError })); }
  catch (e) { console.error(e); fail(t('boot.artifactLoad', { e: (e && e.message) || String(e) })); return null; }
}

/* Фото прогресса: IndexedDB, если песочница её даёт, иначе только в памяти */
async function pickBlobs() {
  if (PREVIEW && PREVIEW.memory) return memoryBlobs();
  if (!ARTIFACT) return idbBlobs();
  try { await openJournalDb(); return idbBlobs(); } catch (e) { return memoryBlobs(); }
}

async function boot() {
  let store;
  if (ARTIFACT) {
    /* никогда не подменяем пустым локальным хранилищем: это выглядело бы как потеря данных */
    store = await artifactStore();
    if (!store) return;
  } else {
    try {
      if (PREVIEW && PREVIEW.memory) store = await createStore(memoryBackend(PREVIEW.data || {}));
      else { const { backend, rows } = await defaultBackend(); store = await createStore(backend, rows); }
    } catch (e) {
      fail(t('boot.storage'));
      return;
    }
  }
  /* предпросмотр внутри Claude: данные журнала при первом открытии */
  if (!ARTIFACT && PREVIEW && PREVIEW.data && store.isEmpty()) { try { await store.importAll(PREVIEW.data); } catch (e) { /* пусто */ } }
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
  const workoutsProjection = (cb) => { const push = () => cb(workoutsForLegacy(store)); setTimeout(push, 0); store.subscribe('workoutLogs', push); };
  const daysProjection = (cb) => { const push = () => cb(daysForLegacy(store, todayYmd())); setTimeout(push, 0); store.subscribe(['stepsEntries', 'workoutLogs', 'foodEntries'], push); };
  /* «Удалить день» в истории журнала: питание, тренировки и шаги новой модели */
  const deleteDay = (date) => store.batch(['foodEntries', 'workoutLogs', 'stepsEntries'].flatMap((col) => store.list(col).filter((d) => d.date === date).map((d) => ({ op: 'remove', col, id: d.id }))));
  const openDay = (date) => navigate('/train?d=' + date);
  startLegacy({ store, container, afterImport, foodProjection, bodyProjection, workoutsProjection, daysProjection, deleteDay, openDay, onChange: () => legacySubs.forEach((f) => f()) });

  const ctx = {
    store, repos, afterImport,
    blobs: await pickBlobs(),
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
