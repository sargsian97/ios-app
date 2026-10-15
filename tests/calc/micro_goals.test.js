import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NUTRIENTS, microGoals } from '../../web/src/domain/calc/micro_goals.js';
import { MICRO_MIN_SHARE } from '../../web/src/domain/calc/constants.js';

const KEYS = ['fiber', 'sugars', 'added_sugar', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat',
  'omega3', 'omega6', 'cholesterol', 'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k', 'b1', 'b2', 'b3', 'b5',
  'b6', 'b12', 'folate', 'choline', 'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'sodium', 'zinc', 'copper',
  'manganese', 'selenium', 'water', 'caffeine', 'alcohol'];

test('NUTRIENTS: все нутриенты, у каждого единица и группа', () => {
  assert.deepEqual(NUTRIENTS.map((n) => n.key), KEYS);
  for (const n of NUTRIENTS) {
    assert.ok(['g', 'mg', 'mcg', 'ml'].includes(n.unit), n.key);
    assert.ok(['carbs', 'fats', 'vitamins', 'minerals', 'other'].includes(n.group), n.key);
  }
  assert.throws(() => { NUTRIENTS.push({}); });
});

test('microGoals: у каждого нутриента { min, target, max, unit }', () => {
  const g = microGoals({ sex: 'male', ageYears: 30 });
  assert.deepEqual(Object.keys(g), KEYS);
  for (const n of NUTRIENTS) {
    const r = g[n.key];
    assert.deepEqual(Object.keys(r), ['min', 'target', 'max', 'unit']);
    assert.equal(r.unit, n.unit);
    if (r.target !== null) assert.equal(r.min, Math.round(r.target * MICRO_MIN_SHARE * 100) / 100);
    else assert.equal(r.min, null);
    if (r.target !== null && r.max !== null) assert.ok(r.max >= r.target, n.key);
  }
});

test('microGoals: мужчина 30 лет', () => {
  const g = microGoals({ sex: 'male', ageYears: 30 });
  assert.deepEqual(g.vitamin_c, { min: 72, target: 90, max: 2000, unit: 'mg' });
  assert.equal(g.iron.target, 8);
  assert.equal(g.magnesium.target, 400);
  assert.equal(g.magnesium.max, null); /* UL магния — только для добавок */
  assert.equal(g.potassium.target, 3400);
  assert.deepEqual(g.sodium, { min: 1200, target: 1500, max: 2300, unit: 'mg' });
  assert.equal(g.water.target, 3700);
});

test('microGoals: возрастные группы', () => {
  assert.equal(microGoals({ sex: 'male', ageYears: 31 }).magnesium.target, 420);
  assert.equal(microGoals({ sex: 'female', ageYears: 30 }).iron.target, 18);
  assert.equal(microGoals({ sex: 'female', ageYears: 55 }).iron.target, 8);
  assert.equal(microGoals({ sex: 'female', ageYears: 55 }).calcium.target, 1200);
  assert.equal(microGoals({ sex: 'male', ageYears: 55 }).calcium.target, 1000);
  assert.equal(microGoals({ sex: 'male', ageYears: 75 }).vitamin_d.target, 20);
  assert.equal(microGoals({ sex: 'male', ageYears: 75 }).phosphorus.max, 3000);
  const teen = microGoals({ sex: 'male', ageYears: 18 });
  assert.equal(teen.calcium.target, 1300);
  assert.equal(teen.phosphorus.target, 1250);
  assert.equal(teen.vitamin_c.max, 1800);
});

test('microGoals: беременность и лактация', () => {
  const p = microGoals({ sex: 'female', ageYears: 30, pregnant: true });
  assert.equal(p.iron.target, 27);
  assert.equal(p.folate.target, 600);
  assert.equal(p.vitamin_a.target, 770);
  assert.equal(p.phosphorus.max, 3500);
  assert.equal(p.caffeine.max, 200);
  assert.equal(p.alcohol.max, 0);
  assert.equal(p.vitamin_k.target, 90); /* нет отдельной нормы — как у женщин того же возраста */
  const l = microGoals({ sex: 'female', ageYears: 30, lactating: true });
  assert.equal(l.vitamin_a.target, 1300);
  assert.equal(l.iron.target, 9);
  assert.equal(l.vitamin_e.target, 19);
  assert.equal(microGoals({ sex: 'female', ageYears: 17, pregnant: true }).vitamin_c.target, 80);
  assert.equal(microGoals({ sex: 'female', ageYears: 45, pregnant: true }).magnesium.target, 360);
});

test('microGoals: где нормы нет — null', () => {
  const g = microGoals({ sex: 'female', ageYears: 40 });
  for (const key of ['sugars', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat', 'cholesterol']) {
    assert.deepEqual([g[key].min, g[key].target, g[key].max], [null, null, null], key);
  }
  assert.deepEqual(g.caffeine, { min: null, target: null, max: 400, unit: 'mg' });
  assert.deepEqual(g.alcohol, { min: null, target: null, max: 14, unit: 'g' });
  assert.equal(g.saturated_fat.max, null);
  assert.equal(g.added_sugar.max, null);
});

test('microGoals: потолок насыщенных жиров и добавленного сахара от калорий', () => {
  const g = microGoals({ sex: 'male', ageYears: 30, kcal: 2000 });
  assert.equal(g.saturated_fat.max, 22.2);
  assert.equal(g.added_sugar.max, 50);
  assert.equal(microGoals({ sex: 'male', ageYears: 30, kcal: 0 }).added_sugar.max, null);
});

test('microGoals: ошибки', () => {
  assert.throws(() => microGoals({ sex: 'male', ageYears: 10 }), /14/);
  assert.throws(() => microGoals({ sex: 'male', ageYears: NaN }), /14/);
  assert.throws(() => microGoals({ sex: 'x', ageYears: 30 }), /unknown sex/);
  assert.throws(() => microGoals({ sex: 'male', ageYears: 30, pregnant: true }), /female/);
  assert.throws(() => microGoals({ sex: 'female', ageYears: 30, pregnant: true, lactating: true }), /одно/);
});
