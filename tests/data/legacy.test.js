import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { latestWeight, workoutsBetween, stepsOn, weekStart, addDays } from '../../web/src/data/legacy.js';

const data = {
  food: { '2026-10-15': { entries: [{ kcal: 100, p: 10, f: 2, c: 5 }, { kcal: '50', p: '', f: 1, c: 0 }] } },
  body: { '2026-10-01': { weight: 85 }, '2026-10-08': { weight: '' }, '2026-10-09': { weight: 84.2 }, '2026-10-15': { weight: 84 } },
  workouts: { '2026-10-13': { exercises: [{ sets: [{ done: true }] }] }, '2026-10-14': { exercises: [{ sets: [{ done: false, r: '' }] }] } },
  days: { '2026-10-15': { steps: '9000' }, '2026-10-14': { steps: '' } }
};

test('legacy: последний вес и изменение за неделю', async () => {
  const s = await createStore(memoryBackend(data));
  const w = latestWeight(s, '2026-10-15');
  assert.equal(w.weight, 84);
  assert.equal(w.prevDate, '2026-10-01');
  assert.ok(Math.abs(w.change + 1) < 1e-9);
  assert.equal(latestWeight(s, '2026-09-01'), null);
});

test('legacy: тренировки, шаги, недели', async () => {
  const s = await createStore(memoryBackend(data));
  assert.equal(workoutsBetween(s, '2026-10-13', '2026-10-19').length, 1);
  assert.equal(stepsOn(s, '2026-10-15'), 9000);
  assert.equal(stepsOn(s, '2026-10-14'), null);
  assert.equal(weekStart('2026-10-15'), '2026-10-12');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
});

test('legacy: записи новой модели в формате журнала', async () => {
  const { foodForLegacy } = await import('../../web/src/data/legacy.js');
  const s = await createStore(memoryBackend({ foodEntries: {
    b: { id: 'b', date: '2026-10-16', time: '13:00', name: 'Суп', amount: 300, nutrients: { kcal: 150, protein: 8, protein_animal: 5, protein_plant: 3 } },
    a: { id: 'a', date: '2026-10-16', time: '08:00', name: 'Каша', amount: null, nutrients: { kcal: 200, carbs: 30, fiber: 4 } }
  } }));
  const m = foodForLegacy(s, (e) => (e.time < '11:00' ? 'b' : 'l'));
  assert.deepEqual(m['2026-10-16'].entries.map((e) => [e.name, e.meal, e.kcal, e.grams, e.pa]), [['Каша', 'b', 200, '', 0], ['Суп', 'l', 150, 300, 5]]);
  assert.equal(m['2026-10-16'].entries[0].fib, 4);
});
