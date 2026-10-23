/* Хранилище в базе артефакта: поддельная база с тем же API, что window.claude.use('db') */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { artifactBackend, encodeId, decodeId, encodeCol, KNOWN_COLLECTIONS, MAX_DOC_BYTES } from '../../web/src/data/artifact-backend.js';
import { createStore, LEGACY_COLLECTIONS } from '../../web/src/data/store.js';
import { migrate } from '../../web/src/data/migrations.js';

const SAMPLE = JSON.parse(readFileSync(new URL('../fixtures/backup-sample.json', import.meta.url), 'utf8')).data;
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;

function dbError(code, message) { const e = new Error(message || code); e.code = code; return e; }

/* Поддельная база: документы хранятся строками JSON, как на сервере.
   opts.failOnce: { 'set:col/id': 'unavailable' } — первая такая операция падает с кодом.
   opts.noNameFilter: where('__name__') не поддерживается. */
function fakeDb(opts = {}) {
  const cols = new Map();
  const active = new Map();
  const failOnce = Object.assign({}, opts.failOnce || {});
  const log = { overlaps: [], writes: 0, maxActive: 0, gets: 0 };
  let activeAll = 0;
  function checkSeg(s) {
    if (typeof s !== 'string' || !SEG.test(s) || s === '.' || s === '..' || new TextEncoder().encode(s).length > 200) throw new TypeError('bad segment: ' + s);
  }
  function maybeFail(key) {
    if (failOnce[key]) { const c = failOnce[key]; delete failOnce[key]; throw dbError(c); }
  }
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  function docRef(col, id) {
    checkSeg(col); checkSeg(id);
    const path = col + '/' + id;
    async function write(fn) {
      if (active.get(path)) log.overlaps.push(path);
      active.set(path, (active.get(path) || 0) + 1);
      activeAll++; log.maxActive = Math.max(log.maxActive, activeAll);
      try { await tick(); maybeFail(fn.name + ':' + path); fn(); log.writes++; }
      finally { active.set(path, active.get(path) - 1); activeAll--; }
    }
    return {
      id, path,
      async get() {
        await tick();
        const m = cols.get(col), raw = m && m.get(id);
        return { id, exists: raw != null, data: () => (raw == null ? undefined : Object.freeze(JSON.parse(raw))) };
      },
      set(data) {
        return write(function set() {
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw dbError('invalid_argument', 'body');
          const raw = JSON.stringify(data);
          if (new TextEncoder().encode(raw).length > 256 * 1024) throw dbError('invalid_argument', 'too big');
          if (!cols.has(col)) cols.set(col, new Map());
          cols.get(col).set(id, raw);
        });
      },
      delete() { return write(function del() { const m = cols.get(col); if (m) m.delete(id); }); }
    };
  }
  function query(col, filters = [], lim = null, order = null) {
    return {
      where(f, op, v) { return query(col, filters.concat([[f, op, v]]), lim, order); },
      orderBy(f) { return query(col, filters, lim, f); },
      limit(n) { if (!(n >= 1 && n <= 1000)) throw dbError('invalid_argument', 'limit'); return query(col, filters, n, order); },
      async get() {
        log.gets++;
        await tick();
        maybeFail('get:' + col);
        const m = cols.get(col) || new Map();
        let rows = [...m.keys()].sort().map((id) => ({ id, d: JSON.parse(m.get(id)) }));
        for (const [f, op, v] of filters) {
          if (op !== '>') throw dbError('invalid_argument', 'filter');
          if (f === '__name__') throw dbError('invalid_argument', 'no __name__');
          rows = rows.filter((r) => r.d[f] != null && r.d[f] > v);
        }
        /* без поля — в конце, как в настоящей базе */
        if (order) rows.sort((a, b) => (a.d[order] == null) - (b.d[order] == null) || (a.d[order] < b.d[order] ? -1 : a.d[order] > b.d[order] ? 1 : 0));
        rows = rows.slice(0, lim || opts.defaultPage || rows.length);
        const docs = rows.map((r) => ({ id: r.id, exists: true, data: () => Object.freeze(JSON.parse(m.get(r.id))) }));
        return { docs, size: docs.length, empty: !docs.length };
      }
    };
  }
  return {
    log, cols,
    collection(col) { checkSeg(col); return Object.assign(query(col), { path: col, doc: (id) => docRef(col, id) }); },
    doc(path) { const [c, i] = path.split('/'); return docRef(c, i); },
    /* для теста: посеять как будто старый журнал */
    seed(data) { Object.keys(data).forEach((c) => { const m = new Map(); Object.keys(data[c]).forEach((id) => m.set(id, JSON.stringify(data[c][id]))); cols.set(c, m); }); },
    raw(col, id) { const m = cols.get(col); return m ? m.get(id) : undefined; },
    /* тело без служебного __k */
    body(col, id) { const r = this.raw(col, id); if (r == null) return undefined; const d = JSON.parse(r); assert.equal(d.__k, id, '__k = сегмент'); delete d.__k; return JSON.stringify(d); }
  };
}

const opts = (o = {}) => Object.assign({ retryDelay: 0, onError: () => {} }, o);

/* ---------- id ---------- */

test('artifact: id старого журнала идут в путь как есть', () => {
  ['2026-10-05', 'A', 'main', 'muwmb8jfkaza', 'f1', 'en', 'legacy-2026-10-05', 'a.b', 'x~y', 'u@e:1+2'].forEach((id) => {
    assert.equal(encodeId(id).seg, id);
    assert.equal(decodeId(id), id);
  });
});

test('artifact: прочие id обратимо кодируются и проходят грамматику пути', () => {
  const ids = ['a/b', 'a b', 'Яблоко', '.', '..', '~e~x', '~h~x', '~', '%41', 'emoji 🍎', 'x'.repeat(200), 'x'.repeat(201), 'я'.repeat(150), 'a/b/'.repeat(80), ''];
  const segs = new Set();
  ids.forEach((id) => {
    const { seg, hashed } = encodeId(id);
    assert.match(seg, SEG, id);
    assert.ok(seg !== '.' && seg !== '..');
    assert.ok(new TextEncoder().encode(seg).length <= 200, id);
    assert.equal(decodeId(seg, hashed ? { __journal_id: id } : {}), id);
    assert.ok(!segs.has(seg), 'разные id → разные сегменты');
    segs.add(seg);
  });
  assert.equal(encodeId('я'.repeat(150)).hashed, true);
  assert.equal(encodeId('Яблоко').hashed, false);
  assert.equal(decodeId(encodeId('x'.repeat(300)).seg, {}), null, 'без поля id хэш не восстановить');
});

test('artifact: имя коллекции _sys занято индексом и кодируется', () => {
  assert.equal(encodeCol('foodEntries'), 'foodEntries');
  assert.notEqual(encodeCol('_sys'), '_sys');
  LEGACY_COLLECTIONS.forEach((c) => assert.ok(KNOWN_COLLECTIONS.includes(c)));
});

/* ---------- запись и чтение ---------- */

test('artifact: запись → чтение новым экземпляром, странные id и коллекции', async () => {
  const db = fakeDb();
  const s = await createStore(artifactBackend(db, opts()));
  const weird = ['a/b', 'Яблоко', '..', 'q'.repeat(400)];
  for (const id of weird) await s.put('foods', id, { name: id });
  await s.put('brandNew', 'x', { v: 1 });
  await s.put('с пробелом', 'y', { v: 2 });
  await s.flush();
  assert.ok(JSON.parse(db.raw('_sys', 'collections')).names.includes('brandNew'));
  const s2 = await createStore(artifactBackend(db, opts()));
  weird.forEach((id) => assert.deepEqual(s2.get('foods', id), { name: id }));
  assert.deepEqual(s2.get('brandNew', 'x'), { v: 1 });
  assert.deepEqual(s2.get('с пробелом', 'y'), { v: 2 });
  assert.deepEqual(s2.exportAll().data, s.exportAll().data);
});

test('artifact: удаление и «последняя операция побеждает»', async () => {
  const db = fakeDb();
  db.seed({ foods: { a: { n: 1 }, b: { n: 2 } } });
  const s = await createStore(artifactBackend(db, opts()));
  await s.remove('foods', 'a');
  await s.batch([{ op: 'put', col: 'foods', id: 'c', data: { n: 1 } }, { op: 'put', col: 'foods', id: 'c', data: { n: 3 } }]);
  assert.equal(db.raw('foods', 'a'), undefined);
  assert.equal(JSON.parse(db.body('foods', 'c')).n, 3);
  assert.equal(db.raw('foods', 'b'), '{"n":2}');
});

test('artifact: в один документ одновременно не пишем, в разные — параллельно', async () => {
  const db = fakeDb();
  const b = artifactBackend(db, opts({ concurrency: 6 }));
  await b.load();
  const ps = [];
  for (let i = 0; i < 20; i++) ps.push(b.write([{ path: 'foods/x', col: 'foods', id: 'x', data: { i } }], [], false));
  const many = Array.from({ length: 30 }, (_, i) => ({ path: 'foods/m' + i, col: 'foods', id: 'm' + i, data: { i } }));
  ps.push(b.write(many, [], false));
  await Promise.all(ps);
  assert.deepEqual(db.log.overlaps, []);
  assert.equal(JSON.parse(db.body('foods', 'x')).i, 19, 'порядок записей сохранён');
  assert.ok(db.log.maxActive > 1 && db.log.maxActive <= 7);
});

test('artifact: unavailable — один повтор и успех', async () => {
  const db = fakeDb({ failOnce: { 'set:foods/a': 'unavailable', 'get:body': 'unavailable' } });
  db.seed({ body: { '2026-10-07': { weight: 82 } } });
  const s = await createStore(artifactBackend(db, opts()));
  assert.equal(s.get('body', '2026-10-07').weight, 82);
  await s.put('foods', 'a', { n: 1 });
  assert.equal(db.body('foods', 'a'), '{"n":1}');
});

test('artifact: прочая ошибка записи видна вызывающему и onError', async () => {
  const db = fakeDb({ failOnce: { 'set:foods/a': 'quota_exceeded' } });
  const errors = [];
  const s = await createStore(artifactBackend(db, opts({ onError: (e) => errors.push(e) })));
  await assert.rejects(s.put('foods', 'a', { n: 1 }), (e) => e.code === 'quota_exceeded');
  assert.equal(errors.length, 1);
  /* очередь записей не застряла */
  await s.put('foods', 'b', { n: 2 });
  assert.equal(db.body('foods', 'b'), '{"n":2}');
});

test('artifact: ошибка чтения — отказ загрузки, а не пустой журнал', async () => {
  const db = fakeDb({ failOnce: { 'get:workouts': 'revoked' } });
  db.seed({ workouts: { '2026-10-12': { date: '2026-10-12' } } });
  await assert.rejects(createStore(artifactBackend(db, opts())), /workouts/);
});

test('artifact: документ больше 256 КБ — понятная ошибка, ничего не записано', async () => {
  const db = fakeDb();
  const s = await createStore(artifactBackend(db, opts()));
  const big = { s: 'x'.repeat(MAX_DOC_BYTES) };
  await assert.rejects(s.batch([{ op: 'put', col: 'foods', id: 'ok', data: { n: 1 } }, { op: 'put', col: 'foods', id: 'big', data: big }]), /слишком большой/);
  assert.equal(db.raw('foods', 'ok'), undefined);
  assert.equal(db.raw('foods', 'big'), undefined);
});

test('artifact: неверный сегмент в базе — invalid_argument не глотается', async () => {
  const db = fakeDb({ failOnce: { 'set:foods/a': 'invalid_argument' } });
  const s = await createStore(artifactBackend(db, opts()));
  await assert.rejects(s.put('foods', 'a', { n: 1 }), (e) => e.code === 'invalid_argument');
});

test('artifact: больше 1000 документов (записанных приложением) читаются страницами по __k', async () => {
  const db = fakeDb();
  const b = artifactBackend(db, opts());
  await b.load();
  const puts = [];
  for (let i = 0; i < 2500; i++) { const id = 'e' + String(i).padStart(5, '0'); puts.push({ path: 'foodEntries/' + id, col: 'foodEntries', id, data: { i } }); }
  puts.push({ path: 'foodEntries/Яблоко', col: 'foodEntries', id: 'Яблоко', data: { i: -1 } });
  await b.write(puts, [], false);
  const b2 = artifactBackend(db, opts());
  const s = await createStore(b2);
  assert.equal(s.ids('foodEntries').length, 2501);
  assert.deepEqual(s.get('foodEntries', 'e02499'), { i: 2499 }, 'без __k в хранилище');
  assert.deepEqual(s.get('foodEntries', 'Яблоко'), { i: -1 });
  assert.deepEqual(b2.truncated, []);
});

test('artifact: больше 1000 старых документов без __k — предупреждение, без потерь в базе', async () => {
  const db = fakeDb();
  const many = {};
  for (let i = 0; i < 1200; i++) many['e' + String(i).padStart(5, '0')] = { i };
  db.seed({ foodEntries: many });
  const warn = console.warn; console.warn = () => {};
  try {
    const b = artifactBackend(db, opts());
    const s = await createStore(b);
    assert.equal(s.ids('foodEntries').length, 1000);
    assert.deepEqual(b.truncated, ['foodEntries']);
    /* восстановление из копии не трогает непрочитанные документы */
    await s.importAll({ foods: { f: { n: 1 } } });
    assert.equal(db.cols.get('foodEntries').size, 200);
  } finally { console.warn = warn; }
});

test('artifact: importAll удаляет лишнее только после записи нового', async () => {
  const db = fakeDb({ failOnce: { 'set:foods/new': 'quota_exceeded' } });
  db.seed({ foods: { old: { n: 1 } }, body: { '2026-01-01': { weight: 80 } } });
  const s = await createStore(artifactBackend(db, opts()));
  await assert.rejects(s.importAll({ foods: { new: { n: 2 } } }));
  assert.equal(db.raw('foods', 'old'), '{"n":1}', 'запись не удалась — старое на месте');
  assert.equal(db.raw('body', '2026-01-01'), '{"weight":80}');
  await s.importAll({ foods: { new: { n: 2 } } });
  assert.equal(db.raw('foods', 'old'), undefined);
  assert.equal(db.raw('body', '2026-01-01'), undefined);
  assert.equal(db.body('foods', 'new'), '{"n":2}');
});

test('artifact: коллекция из индекса другого устройства читается', async () => {
  const db = fakeDb();
  db.seed({ _sys: { collections: { names: ['fromPhone'] } }, fromPhone: { a: { v: 1 } } });
  const s = await createStore(artifactBackend(db, opts()));
  assert.deepEqual(s.get('fromPhone', 'a'), { v: 1 });
  await s.put('another', 'b', { v: 2 });
  assert.deepEqual(JSON.parse(db.raw('_sys', 'collections')).names, ['another', 'fromPhone']);
});

/* ---------- данные старого журнала + миграции ---------- */

test('artifact: миграции на данных журнала не меняют старые документы, повторная загрузка совпадает', async () => {
  const db = fakeDb();
  db.seed(SAMPLE);
  const before = {};
  Object.keys(SAMPLE).forEach((c) => { before[c] = {}; Object.keys(SAMPLE[c]).forEach((id) => { before[c][id] = db.raw(c, id); }); });

  const s = await createStore(artifactBackend(db, opts()));
  const r = await migrate(s, { now: '2026-10-20T00:00:00.000Z' });
  assert.ok(r.applied.length > 0);
  await s.flush();

  Object.keys(before).forEach((c) => Object.keys(before[c]).forEach((id) => {
    assert.equal(db.raw(c, id), before[c][id], 'старый документ ' + c + '/' + id + ' не изменён');
  }));
  ['meta', 'profile', 'foodEntries', 'scaleEntries', 'workoutLogs', 'workoutPlans'].forEach((c) => {
    assert.ok(db.cols.get(c) && db.cols.get(c).size > 0, 'есть коллекция ' + c);
  });
  assert.deepEqual(db.log.overlaps, []);

  /* в хранилище нет служебных полей */
  Object.values(s.exportAll().data).forEach((m) => Object.values(m).forEach((d) => assert.ok(!('__k' in d))));
  /* старый журнал переписывает документ через doc().set: в базе появляется __k, хранилище его не видит */
  await s.doc('body/2026-10-07').set({ weight: 82.4, note: 'x' });
  assert.equal(db.body('body', '2026-10-07'), '{"weight":82.4,"note":"x"}');

  const s2 = await createStore(artifactBackend(db, opts()));
  assert.deepEqual(s2.get('body', '2026-10-07'), { weight: 82.4, note: 'x' });
  assert.deepEqual(s2.exportAll().data, s.exportAll().data);
  const r2 = await migrate(s2);
  assert.deepEqual(r2.applied, [], 'миграции не запускаются второй раз');
});
