import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { MIGRATIONS, migrate, schemaVersion, SCHEMA_VERSION } from '../../web/src/data/migrations.js';

test('миграции: пустое хранилище доходит до последней версии', async () => {
  const s = await createStore(memoryBackend());
  assert.equal(schemaVersion(s), 1);
  const r = await migrate(s, { now: '2026-10-16T00:00:00.000Z' });
  assert.equal(r.from, 1);
  assert.equal(r.to, SCHEMA_VERSION);
  assert.equal(schemaVersion(s), SCHEMA_VERSION);
  assert.equal(s.get('profile', 'me').theme, 'system');
  assert.equal(s.get('meta', 'schema').history.length, r.applied.length);
});

test('миграции: повторный запуск ничего не меняет', async () => {
  const s = await createStore(memoryBackend());
  await migrate(s);
  const r = await migrate(s);
  assert.deepEqual(r.applied, []);
});

test('миграция 2: рост берётся из настроек журнала, старые записи на месте', async () => {
  const s = await createStore(memoryBackend({ settings: { main: { height: 181, lang: 'ru' } }, body: { '2026-01-01': { weight: 80 } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, 181);
  assert.equal(s.get('settings', 'main').height, 181);
  assert.equal(s.get('body', '2026-01-01').weight, 80);
});

test('миграция 2: неправдоподобный рост не переносится', async () => {
  const s = await createStore(memoryBackend({ settings: { main: { height: 17 } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, null);
});

test('миграция 2: существующий профиль не перезаписывается', async () => {
  const s = await createStore(memoryBackend({ profile: { me: { id: 'me', sex: 'female', theme: 'dark' } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').sex, 'female');
  assert.equal(s.get('profile', 'me').theme, 'dark');
});

test('миграции: старая копия после импорта снова мигрирует', async () => {
  const s = await createStore(memoryBackend());
  await migrate(s);
  await s.importAll({ settings: { main: { height: 170 } } });
  assert.equal(schemaVersion(s), 1);
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, 170);
});

test('миграция 3: питание журнала переносится один раз', async () => {
  const s = await createStore(memoryBackend({
    foods: { f1: { name: 'Хлеб', kcal: 250 } },
    food: { '2026-10-01': { entries: [{ id: 'x1', foodId: 'f1', name: 'Хлеб', grams: 50, kcal: 125, meal: 'b' }] } }
  }));
  await migrate(s);
  assert.equal(s.get('foodItems', 'f1').name, 'Хлеб');
  assert.equal(s.get('foodEntries', 'x1').time, '08:00');
  assert.ok(s.get('food', '2026-10-01'), 'старые записи на месте');
});

test('миграция 3: если в новой модели уже есть еда, ничего не переносится', async () => {
  const s = await createStore(memoryBackend({
    meta: { schema: { version: 2 } },
    foodEntries: { a: { id: 'a', date: '2026-10-02', time: '09:00', ref: { kind: 'quick', id: null }, nutrients: { kcal: 10 } } },
    food: { '2026-10-01': { entries: [{ id: 'x1', name: 'Хлеб', kcal: 125 }] } }
  }));
  await migrate(s);
  assert.equal(s.get('foodEntries', 'x1'), null);
});

test('миграция 4: взвешивания и замеры переносятся, шаги остаются в журнале', async () => {
  const s = await createStore(memoryBackend({
    body: { '2026-10-01': { weight: 80.5, waist: 85, glute: 100 } },
    days: { '2026-10-01': { steps: 9000 } }
  }));
  await migrate(s, { migrations: MIGRATIONS.filter((m) => m.version <= 4) });
  assert.equal(s.list('scaleEntries')[0].weightKg, 80.5);
  assert.equal(s.get('bodyEntries', '2026-10-01').measurements.hips, 100);
  assert.equal(s.list('stepsEntries').length, 0);
  assert.equal(s.get('days', '2026-10-01').steps, 9000);
});

test('миграция 5: тренировки, шаблоны, кардио и шаги журнала', async () => {
  const s = await createStore(memoryBackend({
    meta: { schema: { version: 4 } },
    templates: { A: { name: 'День A', weekday: 1, exercises: [{ name: 'Присед со штангой', sets: 3, reps: '12', weight: 70 }, { name: 'Тяга (чередуется)', sets: 3, reps: '10–12', alt: ['Тяга А', 'Тяга Б'] }, { name: 'Планка', sets: 2, reps: '60 с' }] } },
    workouts: { '2026-10-07': { day: 'A', exercises: [{ name: 'Присед со штангой', sets: [{ w: 70, r: 12, done: false }] }] }, '2026-10-05': { day: 'A', durationMin: 96, kcalWatch: 795, avgHr: 120, steps: 27192, exercises: [{ name: 'Присед со штангой', sets: [{ w: 70, r: 12, done: true }, { w: 70, r: '', done: false }] }, { name: 'Планка', sets: [{ r: 60, done: true }] }] } },
    days: {
      '2026-10-05': { lifted: true, trainKcal: 500 },
      '2026-10-06': { steps: 12000, cardioOn: true, cardio: [{ type: 'treadmill', minutes: 100, km: 8.35, speed: 5, incline: 5, avgHr: 107, inSteps: true }] },
      '2026-10-07': { lifted: false },
      '2026-10-08': { cardioOn: false, cardio: [{ type: 'treadmill', minutes: 30 }] }
    }
  }));
  await migrate(s);
  const plan = s.get('workoutPlans', 'legacy-A');
  assert.equal(plan.weekday, 0);
  const [sq, row, plank] = plan.sections[0].items;
  assert.equal(row.alternatives.length, 2, 'варианты упражнения');
  assert.equal(row.exerciseId, row.alternatives[0]);
  assert.deepEqual([plank.timeSec, plank.repMin], [60, null]);
  const w = s.get('workoutLogs', 'legacy-2026-10-05');
  assert.equal(w.exercises[0].sets.length, 1, 'невыполненный подход не переносится');
  assert.deepEqual([w.exercises[1].sets[0].timeSec, w.exercises[1].sets[0].reps], [60, null]);
  assert.deepEqual([w.durationSec, w.stats.kcalWatch, w.stats.kcal, w.stats.avgHr], [5760, 795, 500, 120]);
  assert.equal(s.get('exercises', sq.exerciseId).primaryMuscles[0], 'quads', 'мышцы по названию');
  assert.deepEqual(s.get('exercises', plank.exerciseId).metrics, ['time']);
  const c = s.get('workoutLogs', 'legacy-cardio-2026-10-06');
  assert.equal(c.exercises[0].exerciseId, 'fe-Walking_Treadmill');
  assert.deepEqual([c.exercises[0].sets[0].timeSec, c.exercises[0].sets[0].distanceM, c.exercises[0].cardio.inclinePct], [6000, 8350, 5]);
  assert.equal(s.get('workoutLogs', 'legacy-cardio-2026-10-08'), null, 'выключенное кардио не переносится');
  assert.equal(s.get('workoutLogs', 'legacy-2026-10-07'), null, 'черновик в день без силовой не переносится');
  assert.equal(s.get('stepsEntries', '2026-10-06').steps, 12000);
  assert.equal(s.get('stepsEntries', '2026-10-05').steps, 27192, 'шаги старого формата — из тренировки');
  assert.ok(s.get('workouts', '2026-10-05'), 'старые записи на месте');
});
