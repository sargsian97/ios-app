import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { createRepos } from '../../web/src/data/repos/index.js';

async function setup() {
  const store = await createStore(memoryBackend());
  return { store, r: createRepos(store) };
}

test('записи дневника по дню отсортированы по времени, индекс обновляется', async () => {
  const { r } = await setup();
  await r.foodEntry.create({ date: '2026-10-16', time: '19:00', name: 'ужин' });
  await r.foodEntry.create({ date: '2026-10-16', time: '08:00', name: 'завтрак' });
  await r.foodEntry.create({ date: '2026-10-15', time: '13:00', name: 'обед' });
  assert.deepEqual(r.foodEntry.byDate('2026-10-16').map((e) => e.name), ['завтрак', 'ужин']);
  assert.deepEqual(r.foodEntry.dates(), ['2026-10-15', '2026-10-16']);
  const e = r.foodEntry.byDate('2026-10-15')[0];
  await r.foodEntry.update(e.id, { date: '2026-10-16' });
  assert.equal(r.foodEntry.byDate('2026-10-16').length, 3);
  assert.equal(r.foodEntry.byDate('2026-10-15').length, 0);
  assert.equal(r.foodEntry.between('2026-10-16', '2026-10-16').length, 3);
  assert.deepEqual(r.foodEntry.byDate('2000-01-01'), []);
});

test('продукты: поиск и штрихкод', async () => {
  const { r } = await setup();
  await r.food.create({ name: 'Творог 5%', brand: 'Простоквашино', barcode: '4600000000017' });
  await r.food.create({ name: 'Творожный сырок', archived: true });
  await r.food.create({ name: 'Яблоко' });
  assert.deepEqual(r.food.search('твор').map((f) => f.name), ['Творог 5%']);
  assert.equal(r.food.search('простокв').length, 1);
  assert.equal(r.food.search('').length, 2);
  assert.equal(r.food.byBarcode('4600000000017').name, 'Творог 5%');
  assert.equal(r.food.byBarcode('000'), null);
  assert.equal(r.food.byBarcode(''), null);
});

test('взвешивания, тренировки, цели на день', async () => {
  const { r } = await setup();
  await r.scaleEntry.create({ date: '2026-10-16', time: '09:00', weightKg: 81 });
  await r.scaleEntry.create({ date: '2026-10-16', time: '07:00', weightKg: 80.5 });
  await r.scaleEntry.create({ date: '2026-10-10', weightKg: 82 });
  assert.deepEqual(r.scaleEntry.byDate('2026-10-16').map((s) => s.weightKg), [80.5, 81]);
  assert.equal(r.scaleEntry.between('2026-10-11', null).length, 2);

  await r.workout.create({ date: '2026-10-12', exercises: [{ id: 'e', exerciseId: 'squat', sets: [] }] });
  await r.workout.create({ date: '2026-10-14', exercises: [{ id: 'e', exerciseId: 'bench', sets: [] }] });
  assert.equal(r.workout.forExercise('squat').length, 1);
  assert.equal(r.workout.between('2026-10-13', '2026-10-20').length, 1);

  await r.dayTarget.create({ id: '2026-10-01_0', validFrom: '2026-10-01', weekday: 0, kcal: 2400 });
  await r.dayTarget.create({ id: '2026-10-12_0', validFrom: '2026-10-12', weekday: 0, kcal: 2300 });
  assert.equal(r.dayTarget.on('2026-10-11', 0).kcal, 2400);
  assert.equal(r.dayTarget.on('2026-10-19', 0).kcal, 2300);
  assert.equal(r.dayTarget.on('2026-09-01', 0), null);
});

test('активная цель, программа и тренировка', async () => {
  const { r } = await setup();
  assert.equal(r.goal.active(), null);
  await r.goal.create({ type: 'lose', status: 'archived' });
  const g = await r.goal.create({ type: 'lose', status: 'active' });
  assert.equal(r.goal.active().id, g.id);
  await r.macroProgram.create({ style: 'manual', active: true });
  assert.equal(r.macroProgram.active().style, 'manual');
  assert.equal(r.workoutSession.current(), null);
  await r.workoutSession.create({ date: '2026-10-16', startedAt: '2026-10-16T10:00:00.000Z' });
  assert.ok(r.workoutSession.current());
});
