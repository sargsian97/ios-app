/* Хранилище внутри Artifact на claude.ai: общая база артефакта (возможность db) вместо IndexedDB.
   Тот же интерфейс, что у idbBackend в store.js: kind, load() → [{ path, col, id, data }], write(puts, dels, clearFirst).
   В этой базе уже лежат настоящие данные журнала, поэтому всё осторожно:
   - load() читает все известные коллекции целиком; любая ошибка чтения — отказ, а не «пустой журнал»;
   - write() пишет каждый документ по одному запросу за раз, ошибки не глотает;
   - clearFirst удаляет лишнее только после успешной записи и только то, что этот экземпляр видел сам.
   Списка коллекций у базы нет: берём встроенный список + документ-индекс _sys/collections. */

/* Все коллекции, которые пишет приложение (старый журнал + новая модель) */
export const KNOWN_COLLECTIONS = [
  'workouts', 'body', 'templates', 'days', 'food', 'foods', 'settings', 'i18n',
  'meta', 'profile', 'dietProfile', 'autoTargets', 'bodyEntries', 'checkInModules', 'checkIns',
  'dayEntries', 'dayTargets', 'equipment', 'equipmentGroups', 'exerciseConfigs', 'exercises',
  'favorites', 'foodEntries', 'foodItems', 'goals', 'gyms', 'integrations', 'macroPrograms',
  'microGoals', 'periodEntries', 'progressPhotos', 'recipes', 'scaleEntries', 'stepsEntries',
  'tdee', 'trendWeight', 'usage', 'workoutLogs', 'workoutPlans', 'workoutProfile',
  'workoutPrograms', 'workoutSessions'
];

const SYS = '_sys';
const INDEX_ID = 'collections';
export const MAX_DOC_BYTES = 256 * 1024;
const PAGE = 1000;
/* Длинный id храним под хэшем, а настоящий id — в этом поле документа (при чтении убирается) */
const ID_FIELD = '__journal_id';
/* В каждом записанном документе — его сегмент пути: по нему читаем коллекции больше 1000 документов
   (при чтении убирается, данные в хранилище совпадают байт в байт) */
const KEY = '__k';

/* ---------- кодирование id в сегмент пути ---------- */

const SAFE = /^[A-Za-z0-9_\-.~:@+]+$/;
const KEEP = /[A-Za-z0-9_\-.:@+]/;
const ESC = '~e~';
const HASHED = '~h~';
const MAX_SEG = 200;

function utf8(s) { return new TextEncoder().encode(s); }
function bytes(s) { return utf8(s).length; }

/* id, допустимый грамматикой пути, идёт как есть (старые документы 2026-10-05, A, main, muwmb8jfkaza — один к одному) */
function verbatim(id) {
  return SAFE.test(id) && id !== '.' && id !== '..' && !id.startsWith(ESC) && !id.startsWith(HASHED) && bytes(id) <= MAX_SEG;
}

/* Обратимое экранирование: допустимые символы как есть, остальное (и сам ~) — ~XX по байтам UTF-8 */
function escapeId(id) {
  let out = ESC;
  for (const ch of id) {
    if (KEEP.test(ch)) out += ch;
    else utf8(ch).forEach((b) => { out += '~' + b.toString(16).toUpperCase().padStart(2, '0'); });
  }
  return out;
}

function unescapeId(seg) {
  const body = seg.slice(ESC.length), buf = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '~') { buf.push(parseInt(body.slice(i + 1, i + 3), 16)); i += 2; }
    else buf.push(body.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(buf));
}

/* Два независимых 53-битных хэша (cyrb53) — для id длиннее 200 байт */
function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function hashedSeg(id) { return HASHED + cyrb53(id, 1) + '-' + cyrb53(id, 7) + '-' + id.length.toString(36); }

/* id → сегмент: { seg, hashed } */
export function encodeId(id) {
  id = String(id);
  if (verbatim(id)) return { seg: id, hashed: false };
  const e = escapeId(id);
  if (bytes(e) <= MAX_SEG) return { seg: e, hashed: false };
  return { seg: hashedSeg(id), hashed: true };
}

/* сегмент (+ тело документа для хэшированных) → id; null — не удалось восстановить */
export function decodeId(seg, data) {
  if (seg.startsWith(HASHED)) return data && typeof data[ID_FIELD] === 'string' ? data[ID_FIELD] : null;
  if (seg.startsWith(ESC)) return unescapeId(seg);
  return seg;
}

/* Имя коллекции → сегмент. Имя известно из списка, поэтому декодировать не нужно; _sys занят индексом. */
export function encodeCol(name) {
  name = String(name);
  if (name === SYS) return escapeId(name);
  return encodeId(name).seg;
}

/* ---------- вспомогательное ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function codeOf(e) { return (e && e.code) || ''; }
function wrapError(e, what) {
  const err = new Error(what + ': ' + ((e && e.message) || String(e)));
  err.code = codeOf(e) || undefined;
  err.cause = e;
  return err;
}

/* Повтор: unavailable — один раз после короткой случайной паузы; resource_exhausted — замедляемся, до трёх раз */
async function retry(fn, { delay = 1 } = {}) {
  let unavailable = 0, exhausted = 0;
  for (;;) {
    try { return await fn(); }
    catch (e) {
      const c = codeOf(e);
      if (c === 'unavailable' && unavailable < 1) { unavailable++; await sleep(delay * (200 + Math.random() * 400)); continue; }
      if (c === 'resource_exhausted' && exhausted < 3) { exhausted++; await sleep(delay * (500 * 2 ** exhausted + Math.random() * 300)); continue; }
      throw e;
    }
  }
}

/* Простой пул: задачи по limit штук одновременно; первая ошибка — отказ (остальные дорабатывают) */
async function pool(items, limit, fn) {
  let i = 0, firstErr = null;
  async function worker() {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k], k); } catch (e) { if (!firstErr) firstErr = e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (firstErr) throw firstErr;
}

/* ---------- сам бэкенд ---------- */

export function artifactBackend(db, opts = {}) {
  const concurrency = opts.concurrency || 6;
  const readConcurrency = opts.readConcurrency || 4;
  const retryDelay = opts.retryDelay == null ? 1 : opts.retryDelay;
  const onError = opts.onError || null;
  const names = new Set(KNOWN_COLLECTIONS.concat(opts.collections || []));
  /* пути документов, которые есть в базе по данным этого экземпляра: 'col/id' → { col, id } */
  const known = new Map();
  /* одна запись за раз в документ: путь → хвост очереди */
  const tails = new Map();
  let indexChain = Promise.resolve();

  function refOf(col, id) { return db.collection(encodeCol(col)).doc(encodeId(id).seg); }

  function serial(key, fn) {
    const prev = tails.get(key) || Promise.resolve();
    const p = prev.then(fn, fn);
    const tail = p.catch(() => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return p;
  }

  async function readIndex() {
    const snap = await retry(() => db.collection(SYS).doc(INDEX_ID).get(), { delay: retryDelay });
    const d = snap && snap.exists ? snap.data() : null;
    return d && Array.isArray(d.names) ? d.names.filter((n) => typeof n === 'string' && n) : [];
  }

  /* Новые коллекции попадают в индекс до записи документов: иначе после перезагрузки их не найти */
  function ensureIndexed(cols) {
    const fresh = cols.filter((c) => !names.has(c));
    if (!fresh.length) return Promise.resolve();
    const run = indexChain.then(async () => {
      const add = fresh.filter((c) => !names.has(c));
      if (!add.length) return;
      /* другое устройство могло дописать свои имена — объединяем */
      const remote = await readIndex();
      const all = [...new Set(remote.concat([...names].filter((n) => !KNOWN_COLLECTIONS.includes(n)), add))].sort();
      await serial(SYS + '/' + INDEX_ID, () => retry(() => db.collection(SYS).doc(INDEX_ID).set({ names: all, updatedAt: new Date().toISOString() }), { delay: retryDelay }));
      add.forEach((c) => names.add(c));
    });
    indexChain = run.catch(() => {});
    return run;
  }

  async function readCollection(col) {
    const ref = db.collection(encodeCol(col));
    const docs = new Map();
    const snap = await retry(() => ref.limit(PAGE).get(), { delay: retryDelay });
    snap.docs.forEach((d) => docs.set(d.id, d));
    if (snap.docs.length >= PAGE) {
      /* Дальше страницами по полю KEY (оно равно id документа, поэтому порядок тот же).
         Документы без KEY (записаны старым журналом) так не найти — о них только предупреждаем. */
      if (snap.docs.some((d) => !hasKey(d))) {
        console.warn('journal: в коллекции ' + col + ' больше ' + PAGE + ' документов, часть без поля ' + KEY + ' — могла прочитаться не полностью');
        backend.truncated.push(col);
      }
      let last = snap.docs[snap.docs.length - 1].id;
      for (;;) {
        const page = await retry(() => ref.where(KEY, '>', last).orderBy(KEY).limit(PAGE).get(), { delay: retryDelay });
        page.docs.forEach((d) => { if (!docs.has(d.id)) docs.set(d.id, d); });
        if (page.docs.length < PAGE) break;
        const next = page.docs[page.docs.length - 1].id;
        if (next <= last) { console.warn('journal: страницы коллекции ' + col + ' не продвигаются'); backend.truncated.push(col); break; }
        last = next;
      }
    }
    const rows = [];
    docs.forEach((d, seg) => {
      if (!d.exists) return;
      const raw = d.data();
      if (!raw || typeof raw !== 'object') return;
      const id = decodeId(seg, raw);
      if (id == null) { console.warn('journal: не удалось восстановить id документа ' + col + '/' + seg); return; }
      let data = JSON.parse(JSON.stringify(raw));
      if (seg.startsWith(HASHED)) delete data[ID_FIELD];
      if (data[KEY] === seg) delete data[KEY];
      rows.push({ path: col + '/' + id, col, id, data });
    });
    return rows;
  }

  function hasKey(d) { const v = d.exists ? d.data() : null; return !!v && v[KEY] === d.id; }

  function report(e) {
    console.error('journal: запись в базу артефакта не удалась', e);
    if (onError) { try { onError(e); } catch (x) { console.error(x); } }
  }

  /* Тело для записи: проверка размера и формы. Ошибка — до того, как что-то записано. */
  function bodyFor(r) {
    const data = r.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Документ ' + r.path + ' не сохранён: это не объект.');
    const enc = encodeId(r.id);
    const body = Object.assign({}, data, { [KEY]: enc.seg }, enc.hashed ? { [ID_FIELD]: String(r.id) } : {});
    const size = bytes(JSON.stringify(body));
    if (size > MAX_DOC_BYTES) {
      const err = new Error('Документ ' + r.path + ' слишком большой для хранилища (' + Math.ceil(size / 1024) + ' КБ, можно до 256 КБ). Ничего не сохранено.');
      err.code = 'too_large';
      throw err;
    }
    return body;
  }

  function locate(path) {
    const k = known.get(path);
    if (k) return k;
    const i = path.indexOf('/');
    return { col: path.slice(0, i), id: path.slice(i + 1) };
  }

  const backend = {
    kind: 'artifact',
    truncated: [],
    async load() {
      const indexed = await readIndex();
      indexed.forEach((n) => names.add(n));
      const cols = [...names];
      const out = [];
      await pool(cols, readConcurrency, async (col) => {
        let rows;
        try { rows = await readCollection(col); }
        catch (e) { throw wrapError(e, 'Не удалось прочитать коллекцию ' + col); }
        out.push(...rows);
      });
      known.clear();
      out.forEach((r) => known.set(r.path, { col: r.col, id: r.id }));
      return out;
    },
    async write(puts, dels, clearFirst) {
      try {
        /* одна операция на путь — побеждает последняя */
        const ops = new Map();
        dels.forEach((p) => { ops.delete(p); ops.set(p, { op: 'del', path: p }); });
        puts.forEach((r) => { ops.delete(r.path); ops.set(r.path, { op: 'put', path: r.path, col: r.col, id: String(r.id), data: r.data }); });
        const list = [...ops.values()];
        list.forEach((o) => { if (o.op === 'put') o.body = bodyFor(o); });
        await ensureIndexed([...new Set(list.filter((o) => o.op === 'put').map((o) => o.col))]);
        await pool(list, concurrency, (o) => serial(o.path, async () => {
          if (o.op === 'put') {
            await retry(() => refOf(o.col, o.id).set(o.body), { delay: retryDelay });
            known.set(o.path, { col: o.col, id: o.id });
          } else {
            const { col, id } = locate(o.path);
            await retry(() => refOf(col, id).delete(), { delay: retryDelay });
            known.delete(o.path);
          }
        }));
        if (clearFirst) {
          /* восстановление из копии: лишнее удаляем только после того, как всё новое записано */
          const keep = new Set(list.filter((o) => o.op === 'put').map((o) => o.path));
          const extra = [...known.entries()].filter(([p]) => !keep.has(p));
          await pool(extra, concurrency, ([p, { col, id }]) => serial(p, async () => {
            await retry(() => refOf(col, id).delete(), { delay: retryDelay });
            known.delete(p);
          }));
        }
      } catch (e) {
        report(e);
        throw e;
      }
    }
  };
  return backend;
}
