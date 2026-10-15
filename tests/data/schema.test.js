import { test } from 'node:test';
import assert from 'node:assert/strict';
import { model, f, validDate, ValidationError } from '../../web/src/data/schema.js';
import { createRepo, createSingletonRepo } from '../../web/src/data/repo.js';
import { createStore, memoryBackend } from '../../web/src/data/store.js';

const Thing = model({
  name: 'Thing', collection: 'things',
  fields: {
    title: f.string({ nullable: false, def: '' }),
    kcal: f.number({ min: 0, max: 5000 }),
    kind: f.enum(['a', 'b']),
    day: f.date(),
    tags: f.array(f.string()),
    per: f.record(f.number({ min: 0 })),
    portion: f.shape({ grams: f.number({ min: 0 }), label: f.string() })
  }
});

test('validDate', () => {
  assert.ok(validDate('2024-02-29'));
  assert.ok(!validDate('2023-02-29'));
  assert.ok(!validDate('2023-13-01'));
  assert.ok(!validDate('01.02.2023'));
});

test('schema: нормализация приводит типы и подставляет значения по умолчанию', () => {
  const o = Thing.normalize({ id: 'x', kcal: '12,5', kind: 'zzz', day: 'плохо', tags: ['a', 3], per: { p: '2', bad: 'no' }, extra: 1 });
  assert.equal(o.kcal, 12.5);
  assert.equal(o.kind, 'a');
  assert.equal(o.day, null);
  assert.deepEqual(o.tags, ['a', '3']);
  assert.deepEqual(o.per, { p: 2 });
  assert.deepEqual(o.portion, { grams: null, label: '' });
  assert.equal(o.extra, 1, 'неизвестные поля не теряются');
});

test('schema: проверка ловит выход за пределы', () => {
  const o = Thing.normalize({ id: 'x', kcal: 6000 });
  const errs = Thing.validate(o);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /kcal/);
});

const clock = () => { let i = 0; return () => new Date(Date.UTC(2026, 0, 1, 0, 0, i++)).toISOString(); };

test('repo: create / update / save / remove', async () => {
  const s = await createStore(memoryBackend());
  const r = createRepo(s, Thing, { now: clock() });
  const a = await r.create({ title: 'Овсянка', kcal: 350 });
  assert.ok(a.id);
  assert.ok(a.createdAt && a.updatedAt);
  const b = await r.update(a.id, { kcal: 360 });
  assert.equal(b.kcal, 360);
  assert.equal(b.createdAt, a.createdAt);
  assert.notEqual(b.updatedAt, a.updatedAt);
  await assert.rejects(() => r.update('нет', {}), /не найдено/);
  await assert.rejects(() => r.create({ id: a.id }), /занят/);
  await assert.rejects(() => r.create({ kcal: -1 }), ValidationError);
  const c = await r.save({ id: a.id, title: 'Овсянка', kcal: 1 });
  assert.equal(c.createdAt, a.createdAt);
  assert.equal(r.count(), 1);
  assert.equal(r.list((x) => x.kcal === 1).length, 1);
  await r.remove(a.id);
  assert.equal(r.get(a.id), null);
});

test('repo: putOp для пакетной записи', async () => {
  const s = await createStore(memoryBackend());
  const r = createRepo(s, Thing, { now: clock() });
  await s.batch([r.putOp({ id: 'p1', title: 'a' }), r.putOp({ id: 'p2', title: 'b' })]);
  assert.equal(r.count(), 2);
  assert.throws(() => r.putOp({ kcal: 'abc', kind: 'a', title: 'x', id: 'q', portion: { grams: -5 } }), ValidationError);
});

test('singleton repo: значения по умолчанию до первой записи', async () => {
  const s = await createStore(memoryBackend());
  const r = createSingletonRepo(s, Thing, { now: clock() });
  assert.equal(r.exists(), false);
  assert.equal(r.get().id, 'me');
  await r.update({ title: 'один' });
  assert.equal(r.exists(), true);
  await r.update({ kcal: 5 });
  assert.equal(r.get().title, 'один');
  assert.equal(r.get().kcal, 5);
});
