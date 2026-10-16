/* Хранилище документов на телефоне.
   Коллекции { id: документ } живут в памяти, диск (IndexedDB, иначе localStorage) догоняет.
   Новый код пользуется get / list / put / remove / batch / subscribe,
   старый журнал (web/app.js) — doc(path).set/delete и collection(col).onSnapshot. */

const DB_NAME = 'journal';
const OS = 'docs';
const LS_KEY = 'journal.docs.v1';

/* Коллекции старого журнала: их показывает окно восстановления копии */
export const LEGACY_COLLECTIONS = ['workouts', 'body', 'templates', 'days', 'food', 'foods', 'settings', 'i18n'];

function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => freeze(o[k]));
  }
  return o;
}

/* ---------- места хранения ---------- */

export function idbBackend(name = DB_NAME) {
  let idb = null;
  return {
    kind: 'indexeddb',
    async load() {
      idb = await new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
        const rq = indexedDB.open(name, 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore(OS, { keyPath: 'path' }); };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
        rq.onblocked = () => reject(new Error('blocked'));
      });
      return new Promise((resolve, reject) => {
        const rq = idb.transaction(OS, 'readonly').objectStore(OS).getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => reject(rq.error);
      });
    },
    write(puts, dels, clearFirst) {
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(OS, 'readwrite');
        const os = tx.objectStore(OS);
        if (clearFirst) os.clear();
        dels.forEach((p) => os.delete(p));
        puts.forEach((r) => os.put(r));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
    }
  };
}

export function localStorageBackend(key = LS_KEY) {
  let mem = {};
  return {
    kind: 'localstorage',
    async load() {
      const raw = localStorage.getItem(key);
      mem = raw ? JSON.parse(raw) : {};
      const rows = [];
      Object.keys(mem).forEach((col) => Object.keys(mem[col] || {}).forEach((id) => rows.push({ path: col + '/' + id, col, id, data: mem[col][id] })));
      return rows;
    },
    async write(puts, dels, clearFirst) {
      if (clearFirst) mem = {};
      dels.forEach((p) => { const i = p.indexOf('/'); const c = p.slice(0, i); if (mem[c]) delete mem[c][p.slice(i + 1)]; });
      puts.forEach((r) => { (mem[r.col] = mem[r.col] || {})[r.id] = r.data; });
      localStorage.setItem(key, JSON.stringify(mem));
    }
  };
}

/* Для тестов и предпросмотра: всё только в памяти */
export function memoryBackend(initial = {}) {
  const rows = [];
  Object.keys(initial).forEach((col) => Object.keys(initial[col] || {}).forEach((id) => rows.push({ path: col + '/' + id, col, id, data: clone(initial[col][id]) })));
  return {
    kind: 'memory',
    writes: 0,
    async load() { return rows; },
    async write() { this.writes++; }
  };
}

export async function defaultBackend() {
  const b = idbBackend();
  try { const rows = await b.load(); return { backend: b, rows }; }
  catch (e) {
    const ls = localStorageBackend();
    return { backend: ls, rows: await ls.load() };
  }
}

/* ---------- само хранилище ---------- */

export async function createStore(backend, preloaded) {
  const rows = preloaded || await backend.load();
  const mem = {};
  rows.forEach((r) => { (mem[r.col] = mem[r.col] || {})[r.id] = freeze(r.data); });

  const subs = new Set();
  const versions = {};
  let pending = null;
  let chain = Promise.resolve();

  function notify(cols) {
    if (!pending) {
      pending = new Set();
      setTimeout(() => {
        const changed = pending; pending = null;
        subs.forEach((s) => {
          if (!s.cols || s.cols.some((c) => changed.has(c))) {
            try { s.cb(changed); } catch (e) { console.error(e); }
          }
        });
      }, 0);
    }
    cols.forEach((c) => { pending.add(c); versions[c] = (versions[c] || 0) + 1; });
  }

  /* Записи на диск идут строго по очереди */
  function persist(puts, dels, clearFirst) {
    const p = chain.then(() => backend.write(puts, dels, clearFirst));
    chain = p.catch(() => {});
    return p;
  }

  function applyOps(ops) {
    const puts = [], dels = [], cols = new Set();
    ops.forEach((o) => {
      if (!o.col || o.id == null || String(o.id) === '') throw new Error('store: нужна коллекция и id');
      const id = String(o.id), path = o.col + '/' + id;
      cols.add(o.col);
      if (o.op === 'remove') {
        if (mem[o.col]) delete mem[o.col][id];
        dels.push(path);
      } else {
        const data = clone(o.data);
        (mem[o.col] = mem[o.col] || {})[id] = freeze(clone(data));
        puts.push({ path, col: o.col, id, data });
      }
    });
    notify([...cols]);
    return persist(puts, dels, false);
  }

  const store = {
    kind: backend.kind,
    get(col, id) { const m = mem[col]; return m && Object.prototype.hasOwnProperty.call(m, id) ? m[id] : null; },
    /* Документы коллекции (замороженные объекты — менять через копию) */
    map(col) { return mem[col] || {}; },
    list(col) { const m = mem[col] || {}; return Object.keys(m).map((id) => m[id]); },
    ids(col) { return Object.keys(mem[col] || {}); },
    /* Растёт при каждом изменении коллекции — для кэширования индексов */
    version(col) { return versions[col] || 0; },
    collections() { return Object.keys(mem).filter((c) => Object.keys(mem[c]).length); },
    put(col, id, data) { return applyOps([{ op: 'put', col, id, data }]); },
    remove(col, id) { return applyOps([{ op: 'remove', col, id }]); },
    batch(ops) { return ops.length ? applyOps(ops) : Promise.resolve(); },
    /* cb(changedCols) вызывается один раз за такт после изменений */
    subscribe(cols, cb) {
      const s = { cols: cols == null ? null : [].concat(cols), cb };
      subs.add(s);
      return () => subs.delete(s);
    },
    flush() { return chain; },
    isEmpty(cols = ['workouts', 'body', 'templates', 'days', 'food', 'foods']) {
      return cols.every((c) => !Object.keys(mem[c] || {}).length);
    },
    counts(data, cols = LEGACY_COLLECTIONS) {
      const d = data || mem, o = {};
      cols.forEach((c) => { o[c] = d[c] ? Object.keys(d[c]).length : 0; });
      return o;
    },
    /* Резервная копия: { app, format, schema, exportedAt, data: { col: { id: doc } } } */
    exportAll() {
      const data = {};
      Object.keys(mem).forEach((c) => { if (Object.keys(mem[c]).length) data[c] = clone(mem[c]); });
      const meta = mem.meta && mem.meta.schema;
      return { app: 'journal', format: 2, schema: meta ? meta.version : 1, exportedAt: new Date().toISOString(), data };
    },
    /* Заменяет всё содержимое */
    async importAll(data) {
      const puts = [], cols = new Set(Object.keys(mem));
      Object.keys(mem).forEach((c) => { mem[c] = {}; });
      Object.keys(data || {}).forEach((col) => {
        const m = data[col];
        if (!m || typeof m !== 'object' || Array.isArray(m)) return;
        Object.keys(m).forEach((id) => {
          if (!m[id] || typeof m[id] !== 'object') return;
          (mem[col] = mem[col] || {})[id] = freeze(clone(m[id]));
          puts.push({ path: col + '/' + id, col, id, data: clone(m[id]) });
          cols.add(col);
        });
      });
      notify([...cols]);
      await persist(puts, [], true);
    },

    /* ---------- интерфейс старого журнала ---------- */
    doc(path) {
      const i = path.indexOf('/'), col = path.slice(0, i), id = path.slice(i + 1);
      return {
        set(data) { return store.put(col, id, data); },
        delete() { return store.remove(col, id); }
      };
    },
    collection(col) {
      return {
        onSnapshot(cb, err) {
          const snap = () => ({ docs: Object.keys(mem[col] || {}).map((id) => ({ id, exists: true, data: () => clone(mem[col][id]) })) });
          const fire = () => { try { cb(snap()); } catch (e) { if (err) err(e); else console.error(e); } };
          setTimeout(fire, 0);
          return store.subscribe(col, fire);
        }
      };
    }
  };
  return store;
}

/* Проверка файла резервной копии; возвращает data или бросает понятную ошибку */
export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('Это не файл резервной копии журнала (не JSON).'); }
  const data = o && o.app === 'journal' && o.data ? o.data : null;
  if (!data || typeof data !== 'object') throw new Error('В файле нет данных журнала.');
  return data;
}
