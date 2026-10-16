import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { createRepos } from '../../web/src/data/repos/index.js';
import { nutritionOps, bodyOps, workoutOps, parseReps, exerciseIdFor, legacyNutrients } from '../../web/src/data/legacy-migrate.js';

const NOW = '2026-10-16T00:00:00.000Z';
const sample = JSON.parse(readFileSync(new URL('../fixtures/backup-sample.json', import.meta.url))).data;

async function load(data) { const s = await createStore(memoryBackend(data)); return { s, r: createRepos(s) }; }

test('питание: продукты и записи дневника', async () => {
  const { s, r } = await load(sample);
  await s.batch(nutritionOps(s, { now: NOW }));
  const f = r.food.get('f1');
  assert.equal(f.name, 'Овсянка');
  assert.equal(f.source, 'legacy');
  assert.deepEqual(f.nutrients, { kcal: 356, protein: 12.5, fat: 6.3, carbs: 63, fiber: 10, protein_animal: 0, protein_plant: 12.5 });
  const day = r.foodEntry.byDate('2026-10-14');
  assert.deepEqual(day.map((e) => [e.time, e.name, e.nutrients.kcal]), [['08:00', 'Овсянка', 214], ['13:00', 'Куриная грудка', 165]]);
  assert.equal(day[0].ref.kind, 'quick', 'в записи журнала нет foodId');
  assert.equal(day[0].amount, 60);
  assert.ok(s.get('food', '2026-10-14'), 'старые записи на месте');
});

test('питание: запись со ссылкой на продукт, плохие записи пропускаются', async () => {
  const { s, r } = await load({
    foods: { f9: { name: 'Хлеб', kcal: 250 } },
    food: { '2026-10-01': { entries: [{ id: 'x1', foodId: 'f9', name: 'Хлеб', grams: 50, kcal: 125, meal: 's' }, { id: 'x2', name: 'нет еды', grams: 10, kcal: -5, meal: 'zz' }] } }
  });
  await s.batch(nutritionOps(s, { now: NOW }));
  const e = r.foodEntry.get('x1');
  assert.deepEqual(e.ref, { kind: 'food', id: 'f9' });
  assert.equal(e.time, '16:00');
  const bad = r.foodEntry.get('x2');
  assert.equal(bad.time, '12:00');
  assert.equal(bad.nutrients.kcal, undefined, 'отрицательные калории не переносятся');
});

test('тело: взвешивания, замеры, шаги', async () => {
  const { s, r } = await load(sample);
  await s.batch(bodyOps(s, { now: NOW }));
  assert.deepEqual(r.scaleEntry.between().map((x) => x.weightKg), [82.4, 82.1, 81.8]);
  assert.equal(r.bodyEntry.get('2026-10-10').measurements.waist, 84);
  assert.equal(r.bodyEntry.get('2026-10-07'), null, 'только вес — замеров нет');
  assert.equal(r.stepsEntry.get('2026-10-14').steps, 8500);
});

test('тело: обхваты журнала раскладываются по новым ключам', async () => {
  const { s, r } = await load({ body: { '2026-09-22': { weight: '', thigh: 63, glute: 104, bic: 38.5, bicR: 38, neck: 39, fat: 25.9, note: 'утро' } } });
  await s.batch(bodyOps(s, { now: NOW }));
  const b = r.bodyEntry.get('2026-09-22');
  assert.deepEqual([b.measurements.thighL, b.measurements.hips, b.measurements.bicepsL, b.measurements.bicepsR, b.measurements.neck], [63, 104, 38.5, 38, 39]);
  assert.equal(b.bodyFatPct, 25.9);
  assert.equal(b.note, 'утро');
  assert.equal(r.scaleEntry.count(), 0);
});

test('тренировки: упражнения, шаблоны, история', async () => {
  const { s, r } = await load(sample);
  await s.batch(workoutOps(s, { now: NOW }));
  assert.equal(r.exercise.count(), 3);
  const sq = r.exercise.get(exerciseIdFor('Присед со штангой'));
  assert.equal(sq.source, 'legacy');
  const a = r.workoutPlan.get('legacy-A');
  assert.equal(a.weekday, 0, 'понедельник');
  assert.deepEqual([a.sections[0].items[0].repMin, a.sections[0].items[0].sets, a.sections[0].items[0].weight], [12, 3, 60]);
  const w = r.workout.get('legacy-2026-10-12');
  assert.equal(w.planId, 'legacy-B');
  assert.equal(w.exercises[0].exerciseId, sq.id);
  assert.deepEqual(w.exercises[0].sets.map((x) => x.reps), [12, 12, 10]);
  assert.equal(r.workout.forExercise(sq.id).length, 1);
});

test('тренировки: пустые тренировки не переносятся, повтор идемпотентен', async () => {
  const data = { workouts: { '2026-10-01': { day: 'A', exercises: [{ name: 'Жим', sets: [{ done: false, r: '', w: '' }] }] } } };
  const { s, r } = await load(data);
  await s.batch(workoutOps(s, { now: NOW }));
  assert.equal(r.workout.count(), 0);
  await s.batch(workoutOps(s, { now: NOW }));
  assert.equal(r.exercise.count(), 1);
});

test('вспомогательные: повторы, id упражнения, нутриенты', () => {
  assert.deepEqual(parseReps('10–12'), [10, 12]);
  assert.deepEqual(parseReps('12'), [12, 12]);
  assert.deepEqual(parseReps(''), [null, null]);
  assert.equal(exerciseIdFor('Жим  лёжа'), exerciseIdFor('жим лежа'));
  assert.notEqual(exerciseIdFor('Жим лёжа'), exerciseIdFor('Жим стоя'));
  assert.deepEqual(legacyNutrients({ kcal: '100', p: '', fib: 'x' }), { kcal: 100 });
});
