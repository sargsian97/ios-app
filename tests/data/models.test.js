import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { createRepos, MODELS } from '../../web/src/data/repos/index.js';
import { Food, Recipe, FoodEntry, DayEntry, MicroGoal, Goal, ModuleStatus } from '../../web/src/data/models/nutrition.js';
import { ScaleEntry, BodyEntry } from '../../web/src/data/models/body.js';
import { Workout, Exercise, WorkoutPlan } from '../../web/src/data/models/workout.js';
import { DietProfile, WorkoutProfile } from '../../web/src/data/models/profile.js';
import { NUTRIENT_KEYS, scaleNutrients, addNutrients, roundNutrients } from '../../web/src/data/models/nutrients.js';

/* Минимальные данные, чтобы документ каждой сущности прошёл проверку */
const MIN = {
  Food: { name: 'Яблоко' }, Recipe: { name: 'Омлет' }, Exercise: { name: 'Присед' },
  DayEntry: { id: '2026-10-16' }, MicroGoal: { id: 'iron' }, ModuleStatus: { id: 'weighin' },
  ScaleEntry: { date: '2026-10-16', weightKg: 80 }, StepsEntry: { date: '2026-10-16', steps: 1000 },
  ProgressPhoto: { date: '2026-10-16', blobId: 'b1' }, TrendWeightEntry: { trendKg: 80 }, TdeeEntry: { tdee: 2500 }
};

test('модели: у всех сущностей разные коллекции и есть репозиторий', async () => {
  const cols = MODELS.map((m) => m.collection);
  assert.equal(new Set(cols).size, cols.length);
  const legacy = ['workouts', 'body', 'templates', 'days', 'food', 'foods', 'settings', 'i18n', 'meta'];
  assert.deepEqual(cols.filter((c) => legacy.includes(c)), [], 'новые коллекции не пересекаются со старыми');
  const repos = createRepos(await createStore(memoryBackend()));
  MODELS.forEach((m) => assert.ok(repos[m.name[0].toLowerCase() + m.name.slice(1)], m.name));
});

test('модели: документ по умолчанию + минимум проходит проверку и создаётся', async () => {
  const s = await createStore(memoryBackend());
  const repos = createRepos(s);
  for (const m of MODELS) {
    const key = m.name[0].toLowerCase() + m.name.slice(1);
    const doc = await (m.singleton ? repos[key].update(MIN[m.name] || {}) : repos[key].create(MIN[m.name] || {}));
    assert.deepEqual(m.validate(doc), [], m.name);
    assert.ok(s.get(m.collection, doc.id), m.name + ' записан');
  }
});

test('модели: JSON туда и обратно без потерь', () => {
  const w = Workout.normalize({ id: 'w', date: '2026-10-12', exercises: [{ id: 'e', exerciseId: 'x', sets: [{ id: 's', weight: 60, reps: 10, rir: 2, done: true }] }], legacy: { avgHr: 120 } });
  const back = Workout.normalize(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(back, w);
  assert.equal(back.legacy.avgHr, 120);
  assert.deepEqual(Workout.validate(back), []);
});

test('Food: неизвестный нутриент и пустое название отклоняются', () => {
  assert.match(Food.validate(Food.normalize({ id: 'a', name: 'x', nutrients: { vitamin_zz: 1 } })).join(), /неизвестный нутриент/);
  assert.match(Food.validate(Food.normalize({ id: 'a', name: '  ' })).join(), /название/);
  assert.deepEqual(Food.validate(Food.normalize({ id: 'a', name: 'Сыр', nutrients: { kcal: 350, protein: 25, calcium: 700 }, servings: [{ id: '1', label: 'ломтик', amount: 20, unit: 'g' }] })), []);
  assert.equal(Food.normalize({ id: 'a', name: 'x' }).base.amount, 100);
});

test('Recipe: не может содержать сам себя', () => {
  const r = Recipe.normalize({ id: 'r1', name: 'Суп', ingredients: [{ ref: { kind: 'recipe', id: 'r1' }, amount: 100 }] });
  assert.match(Recipe.validate(r).join(), /сам в себя/);
});

test('FoodEntry, DayEntry: даты и время', () => {
  assert.equal(FoodEntry.normalize({ id: 'e', time: '25:00' }).time, '12:00');
  assert.match(DayEntry.validate(DayEntry.normalize({ id: 'вчера' })).join(), /дата/);
  const d = DayEntry.normalize({ id: '2026-10-16', fasting: true, manualTotals: { kcal: '1800' } });
  assert.equal(d.manualTotals.kcal, 1800);
  assert.equal(DayEntry.normalize({ id: '2026-10-16' }).manualTotals, null);
});

test('MicroGoal, Goal, ModuleStatus: свои проверки', () => {
  assert.match(MicroGoal.validate(MicroGoal.normalize({ id: 'xyz' })).join(), /нутриент/);
  assert.match(MicroGoal.validate(MicroGoal.normalize({ id: 'iron', min: 10, max: 5 })).join(), /min/);
  assert.match(Goal.validate(Goal.normalize({ id: 'g', maintainMinKg: 80, maintainMaxKg: 78 })).join(), /maintain/);
  assert.match(ModuleStatus.validate(ModuleStatus.normalize({ id: 'zzz' })).join(), /модуль/);
});

test('ScaleEntry, BodyEntry: границы', () => {
  assert.ok(ScaleEntry.validate(ScaleEntry.normalize({ id: 's', date: '2026-01-01', weightKg: 5 })).length);
  const b = BodyEntry.normalize({ id: '2026-01-01', date: '2026-01-01', measurements: { waist: '84,5', bogus: 3 } });
  assert.equal(b.measurements.waist, 84.5);
  assert.equal(b.measurements.bogus, undefined);
});

test('профили питания и тренировок: значения по умолчанию', () => {
  const d = DietProfile.defaults({ id: 'me' });
  assert.equal(d.diaryView, 'timeline');
  assert.equal(d.timeline.startHour, 6);
  assert.deepEqual(d.shortcuts, ['search', 'scan', 'quick', 'photo']);
  const w = WorkoutProfile.defaults({ id: 'me' });
  assert.equal(w.rest.compound, 150);
  assert.equal(w.keepAwake, true);
  assert.deepEqual(Exercise.defaults({ id: 'x', name: 'a' }).metrics, ['weight', 'reps']);
  assert.equal(WorkoutPlan.defaults({ id: 'p' }).sections.length, 0);
});

test('нутриенты: ключи, сложение и масштаб', () => {
  assert.ok(NUTRIENT_KEYS.includes('protein_animal'));
  assert.ok(NUTRIENT_KEYS.includes('selenium'));
  assert.deepEqual(scaleNutrients({ kcal: 100, protein: 'x' }, 1.5), { kcal: 150 });
  assert.deepEqual(addNutrients({ kcal: 1 }, { kcal: 2, fat: 3 }), { kcal: 3, fat: 3 });
  assert.deepEqual(roundNutrients({ kcal: 1.26 }), { kcal: 1.3 });
});
