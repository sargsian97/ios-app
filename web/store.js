/* Локальное хранилище журнала на телефоне.
   Повторяет маленький кусок API, которым пользовался журнал в Claude:
   db.doc('col/id').set(obj) / .delete(), db.collection(col).onSnapshot(cb, err).
   Данные лежат в IndexedDB; если она недоступна — в localStorage. */

const DB_NAME = 'journal';
const STORE = 'docs';
const LS_KEY = 'journal.docs.v1';
export const COLLECTIONS = ['workouts', 'body', 'templates', 'days', 'food', 'foods', 'settings', 'i18n'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('no indexedDB')); return; }
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'path' }); };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
    rq.onblocked = () => reject(new Error('blocked'));
  });
}

function idbAll(idb) {
  return new Promise((resolve, reject) => {
    const rq = idb.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    rq.onsuccess = () => resolve(rq.result || []);
    rq.onerror = () => reject(rq.error);
  });
}

function idbWrite(idb, puts, dels, clearFirst) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    if (clearFirst) os.clear();
    dels.forEach((p) => os.delete(p));
    puts.forEach((r) => os.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

export async function openStore() {
  /* mem: { col: { id: data } } — источник правды в памяти, диск догоняет */
  const mem = {};
  COLLECTIONS.forEach((c) => { mem[c] = {}; });
  const listeners = {};
  let idb = null;

  try {
    idb = await idbOpen();
    (await idbAll(idb)).forEach((r) => {
      if (!mem[r.col]) mem[r.col] = {};
      mem[r.col][r.id] = r.data;
    });
  } catch (e) {
    idb = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) Object.assign(mem, JSON.parse(raw));
    } catch (e2) { /* пусто */ }
  }

  function persist(puts, dels, clearFirst) {
    if (idb) return idbWrite(idb, puts, dels, clearFirst);
    try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); return Promise.resolve(); }
    catch (e) { return Promise.reject(e); }
  }

  function snapOf(col) {
    const m = mem[col] || {};
    return { docs: Object.keys(m).map((id) => ({ id, exists: true, data: () => clone(m[id]) })) };
  }

  function notify(cols) {
    cols.forEach((col) => {
      (listeners[col] || []).forEach((l) => {
        setTimeout(() => { try { l.cb(snapOf(col)); } catch (e) { if (l.err) l.err(e); } }, 0);
      });
    });
  }

  function split(path) {
    const i = path.indexOf('/');
    return [path.slice(0, i), path.slice(i + 1)];
  }

  const db = {
    doc(path) {
      const [col, id] = split(path);
      return {
        set(data) {
          if (!mem[col]) mem[col] = {};
          mem[col][id] = clone(data);
          notify([col]);
          return persist([{ path, col, id, data: clone(data) }], [], false);
        },
        delete() {
          if (mem[col]) delete mem[col][id];
          notify([col]);
          return persist([], [path], false);
        }
      };
    },
    collection(col) {
      return {
        onSnapshot(cb, err) {
          (listeners[col] = listeners[col] || []).push({ cb, err });
          setTimeout(() => cb(snapOf(col)), 0);
          return () => { listeners[col] = (listeners[col] || []).filter((l) => l.cb !== cb); };
        }
      };
    },
    /* Резервная копия: { app, format, exportedAt, data: { col: { id: doc } } } */
    exportAll() {
      return { app: 'journal', format: 1, exportedAt: new Date().toISOString(), data: clone(mem) };
    },
    counts(data) {
      const d = data || mem, o = {};
      COLLECTIONS.forEach((c) => { o[c] = d[c] ? Object.keys(d[c]).length : 0; });
      return o;
    },
    isEmpty() {
      return ['workouts', 'body', 'templates', 'days', 'food', 'foods'].every((c) => !Object.keys(mem[c] || {}).length);
    },
    async importAll(data) {
      const puts = [];
      COLLECTIONS.forEach((c) => { mem[c] = {}; });
      Object.keys(data || {}).forEach((col) => {
        if (COLLECTIONS.indexOf(col) < 0) return;
        const m = data[col] || {};
        Object.keys(m).forEach((id) => {
          if (!m[id] || typeof m[id] !== 'object') return;
          mem[col][id] = clone(m[id]);
          puts.push({ path: col + '/' + id, col, id, data: clone(m[id]) });
        });
      });
      await persist(puts, [], true);
      notify(COLLECTIONS);
    }
  };
  return db;
}

/* Проверка файла резервной копии; возвращает data или бросает понятную ошибку */
export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('Это не файл резервной копии журнала (не JSON).'); }
  const data = o && o.app === 'journal' && o.data ? o.data : null;
  if (!data || typeof data !== 'object') throw new Error('В файле нет данных журнала.');
  return data;
}
