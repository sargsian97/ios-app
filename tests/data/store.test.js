import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, parseBackup } from '../../web/src/data/store.js';

const tick = () => new Promise((r) => setTimeout(r, 5));

test('store: put/get/list/remove', async () => {
  const s = await createStore(memoryBackend());
  await s.put('foods', 'a', { name: 'Яблоко' });
  assert.equal(s.get('foods', 'a').name, 'Яблоко');
  assert.equal(s.list('foods').length, 1);
  await s.remove('foods', 'a');
  assert.equal(s.get('foods', 'a'), null);
});

test('store: документы заморожены, запись копирует', async () => {
  const s = await createStore(memoryBackend());
  const src = { name: 'x', tags: ['a'] };
  await s.put('c', '1', src);
  src.name = 'y';
  assert.equal(s.get('c', '1').name, 'x');
  assert.throws(() => { s.get('c', '1').name = 'z'; });
  assert.throws(() => { s.get('c', '1').tags.push('b'); });
});

test('store: подписка срабатывает один раз за такт и только на свои коллекции', async () => {
  const s = await createStore(memoryBackend());
  let calls = 0, other = 0, seen;
  s.subscribe('food', (ch) => { calls++; seen = ch; });
  s.subscribe('body', () => { other++; });
  s.put('food', '1', { a: 1 });
  s.put('food', '2', { a: 2 });
  await tick();
  assert.equal(calls, 1);
  assert.equal(other, 0);
  assert.ok(seen.has('food'));
});

test('store: batch пишет одной операцией', async () => {
  const b = memoryBackend();
  const s = await createStore(b);
  await s.batch([{ op: 'put', col: 'a', id: '1', data: { v: 1 } }, { op: 'put', col: 'b', id: '2', data: { v: 2 } }, { op: 'remove', col: 'a', id: 'x' }]);
  assert.equal(b.writes, 1);
  assert.equal(s.get('b', '2').v, 2);
});

test('store: batch без id — ошибка', async () => {
  const s = await createStore(memoryBackend());
  assert.throws(() => s.batch([{ op: 'put', col: 'a', data: {} }]), /id/);
});

test('store: загрузка из места хранения', async () => {
  const s = await createStore(memoryBackend({ body: { '2026-01-01': { weight: 80 } } }));
  assert.equal(s.get('body', '2026-01-01').weight, 80);
  assert.equal(s.isEmpty(), false);
});

test('store: экспорт и импорт заменяют всё, включая новые коллекции', async () => {
  const s = await createStore(memoryBackend({ body: { d1: { weight: 80 } }, profile: { me: { sex: 'male' } } }));
  const exp = s.exportAll();
  assert.equal(exp.app, 'journal');
  assert.equal(exp.format, 2);
  assert.equal(exp.data.profile.me.sex, 'male');
  await s.importAll({ food: { d2: { entries: [] } } });
  assert.equal(s.get('body', 'd1'), null);
  assert.equal(s.get('profile', 'me'), null);
  assert.ok(s.get('food', 'd2'));
  assert.ok(parseBackup(JSON.stringify(exp)).profile);
});

test('store: интерфейс старого журнала', async () => {
  const s = await createStore(memoryBackend());
  const got = [];
  s.collection('body').onSnapshot((snap) => got.push(snap.docs.map((d) => d.id)));
  await tick();
  await s.doc('body/2026-02-02').set({ weight: 81 });
  await tick();
  assert.deepEqual(got, [[], ['2026-02-02']]);
  const snapDoc = await new Promise((r) => { const off = s.collection('body').onSnapshot((snap) => { off(); r(snap.docs[0].data()); }); });
  snapDoc.weight = 1; /* копия, можно менять */
  assert.equal(s.get('body', '2026-02-02').weight, 81);
  await s.doc('body/2026-02-02').delete();
  assert.equal(s.get('body', '2026-02-02'), null);
});

test('store: counts по коллекциям журнала', async () => {
  const s = await createStore(memoryBackend({ workouts: { a: {}, b: {} } }));
  assert.equal(s.counts().workouts, 2);
  assert.equal(s.counts({ food: { x: {} } }).food, 1);
});
