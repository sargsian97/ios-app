import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calorieFloor, calorieTarget, macroTargets, weeklyDistribution, dayTargets } from '../../web/src/domain/calc/macros.js';
import { CALORIE_FLOOR, HIGH_DAY_SHARE, KETO_CARBS_MAX_G, PROTEIN_G_PER_KG, DIET_TYPES } from '../../web/src/domain/calc/constants.js';

const BASE = { weightKg: 80, proteinLevel: 'moderate', dietType: 'balanced' };

test('calorieTarget: поддержание = расход', () => {
  assert.deepEqual(calorieTarget({ tdee: 2500.4, goal: { type: 'maintain' }, sex: 'male' }), { kcal: 2500, floored: false });
});

test('calorieTarget: похудение и набор по темпу % массы в неделю', () => {
  /* 0,5 % × 80 кг × 7700 / 7 = 440 ккал в день */
  assert.deepEqual(calorieTarget({ tdee: 2500, goal: { type: 'lose', ratePctPerWeek: 0.5 }, weightKg: 80, sex: 'male' }), { kcal: 2060, floored: false });
  assert.deepEqual(calorieTarget({ tdee: 2500, goal: { type: 'gain', ratePctPerWeek: 0.25 }, weightKg: 80, sex: 'male' }), { kcal: 2720, floored: false });
  assert.deepEqual(calorieTarget({ tdee: 2500, goal: { type: 'lose', ratePctPerWeek: 0 }, weightKg: 80, sex: 'male' }), { kcal: 2500, floored: false });
});

test('calorieTarget: нижний порог по полу', () => {
  /* 1500 − 1 % × 60 × 7700 / 7 = 840 */
  const p = { tdee: 1500, goal: { type: 'lose', ratePctPerWeek: 1 }, weightKg: 60, sex: 'female' };
  assert.deepEqual(calorieTarget(p), { kcal: CALORIE_FLOOR.standard.female, floored: true });
  assert.deepEqual(calorieTarget({ ...p, floor: 'low' }), { kcal: CALORIE_FLOOR.low.female, floored: true });
  assert.deepEqual(calorieTarget({ ...p, floor: 'ignore' }), { kcal: 840, floored: false });
  assert.deepEqual(calorieTarget({ ...p, sex: 'male' }), { kcal: CALORIE_FLOOR.standard.male, floored: true });
  assert.deepEqual(calorieTarget({ tdee: 1100, goal: { type: 'maintain' }, sex: 'female' }), { kcal: 1200, floored: true });
});

test('calorieTarget: даже с floor ignore не ниже нуля', () => {
  assert.deepEqual(calorieTarget({ tdee: 1000, goal: { type: 'lose', ratePctPerWeek: 2 }, weightKg: 100, floor: 'ignore' }), { kcal: 0, floored: true });
});

test('calorieTarget: ошибки', () => {
  const ok = { tdee: 2500, goal: { type: 'lose', ratePctPerWeek: 0.5 }, weightKg: 80, sex: 'male' };
  assert.throws(() => calorieTarget({ ...ok, tdee: NaN }), /tdee/);
  assert.throws(() => calorieTarget({ ...ok, goal: { type: 'lose', ratePctPerWeek: -0.5 } }), /ratePctPerWeek/);
  assert.throws(() => calorieTarget({ ...ok, goal: { type: 'lose' } }), /ratePctPerWeek/);
  assert.throws(() => calorieTarget({ ...ok, weightKg: 0 }), /weightKg/);
  assert.throws(() => calorieTarget({ ...ok, goal: { type: 'bulk' } }), /unknown goal type/);
  assert.throws(() => calorieTarget({ ...ok, goal: null }), /unknown goal type/);
  assert.throws(() => calorieTarget({ ...ok, floor: 'zero' }), /unknown floor/);
  assert.throws(() => calorieTarget({ ...ok, sex: undefined }), /unknown sex/);
});

test('calorieFloor', () => {
  assert.equal(calorieFloor('male'), CALORIE_FLOOR.standard.male);
  assert.equal(calorieFloor('female', 'low'), CALORIE_FLOOR.low.female);
  assert.equal(calorieFloor(undefined, 'ignore'), 0);
});

test('macroTargets: сбалансированная, углеводы как остаток', () => {
  /* белок 1,6 × 80 = 128 г (512 ккал); жиры 30 % от 2000 = 600 ккал ≈ 67 г; углеводы (2000 − 512 − 600) / 4 = 222 */
  assert.deepEqual(macroTargets({ ...BASE, kcal: 2000 }), { kcal: 2000, protein: 128, fat: 67, carbs: 222 });
});

test('macroTargets: белок по уровню и от безжировой массы', () => {
  for (const level of ['low', 'moderate', 'high', 'very_high']) {
    assert.equal(macroTargets({ ...BASE, kcal: 2500, proteinLevel: level }).protein, Math.round(PROTEIN_G_PER_KG.body[level] * 80));
  }
  assert.equal(macroTargets({ ...BASE, kcal: 2500, leanMassKg: 60 }).protein, Math.round(PROTEIN_G_PER_KG.lean.moderate * 60));
  assert.equal(macroTargets({ ...BASE, kcal: 2500, leanMassKg: NaN }).protein, 128);
});

test('macroTargets: пропорция жиры : углеводы, когда углеводы не остаток', () => {
  const r = macroTargets({ ...BASE, kcal: 2000, carbsAsRemainder: false });
  const rest = 2000 - 512, share = DIET_TYPES.balanced.fat / (DIET_TYPES.balanced.fat + DIET_TYPES.balanced.carbs);
  assert.deepEqual(r, { kcal: 2000, protein: 128, fat: Math.round((rest * share) / 9), carbs: Math.round((rest * (1 - share)) / 4) });
});

test('macroTargets: типы диет', () => {
  const lowFat = macroTargets({ ...BASE, kcal: 2000, dietType: 'low_fat' });
  const lowCarb = macroTargets({ ...BASE, kcal: 2000, dietType: 'low_carb' });
  const bal = macroTargets({ ...BASE, kcal: 2000 });
  assert.ok(lowFat.fat < bal.fat && lowFat.carbs > bal.carbs);
  assert.ok(lowCarb.fat > bal.fat && lowCarb.carbs < bal.carbs);
});

test('macroTargets: кето — углеводы не выше потолка', () => {
  for (const kcal of [1500, 2000, 3500]) {
    for (const carbsAsRemainder of [true, false]) {
      const r = macroTargets({ ...BASE, kcal, dietType: 'keto', proteinLevel: 'low', carbsAsRemainder });
      assert.ok(r.carbs <= KETO_CARBS_MAX_G, `${kcal}: ${r.carbs}`);
      assert.ok(Math.abs(r.protein * 4 + r.fat * 9 + r.carbs * 4 - kcal) <= 10);
    }
  }
  assert.equal(macroTargets({ ...BASE, kcal: 3500, dietType: 'keto', proteinLevel: 'low' }).carbs, KETO_CARBS_MAX_G);
});

test('macroTargets: белок больше калорий — урезаем и предупреждаем', () => {
  assert.deepEqual(macroTargets({ ...BASE, kcal: 300, weightKg: 100, proteinLevel: 'very_high' }), {
    kcal: 300, protein: 75, fat: 0, carbs: 0, warning: 'protein_exceeds_kcal'
  });
  assert.deepEqual(macroTargets({ ...BASE, kcal: 0 }), { kcal: 0, protein: 0, fat: 0, carbs: 0, warning: 'protein_exceeds_kcal' });
});

test('macroTargets: ничего не бывает отрицательным, сумма ≈ kcal', () => {
  for (const dietType of Object.keys(DIET_TYPES)) {
    for (const proteinLevel of ['low', 'very_high']) {
      for (const kcal of [0, 500, 900, 1200, 2000, 4000]) {
        for (const carbsAsRemainder of [true, false]) {
          const r = macroTargets({ kcal, weightKg: 90, proteinLevel, dietType, carbsAsRemainder });
          assert.ok(r.protein >= 0 && r.fat >= 0 && r.carbs >= 0, JSON.stringify(r));
          assert.ok(Math.abs(r.protein * 4 + r.fat * 9 + r.carbs * 4 - kcal) <= 10, JSON.stringify(r));
        }
      }
    }
  }
});

test('macroTargets: ошибки', () => {
  assert.throws(() => macroTargets({ ...BASE, kcal: -1 }), /kcal/);
  assert.throws(() => macroTargets({ ...BASE, kcal: NaN }), /kcal/);
  assert.throws(() => macroTargets({ ...BASE, kcal: 2000, weightKg: 0 }), /weightKg/);
  assert.throws(() => macroTargets({ ...BASE, kcal: 2000, proteinLevel: 'huge' }), /proteinLevel/);
  assert.throws(() => macroTargets({ ...BASE, kcal: 2000, dietType: 'paleo' }), /dietType/);
});

test('weeklyDistribution: поровну без дней с повышенной калорийностью', () => {
  assert.deepEqual(weeklyDistribution({ dailyKcal: 2000 }), Array(7).fill(2000));
  assert.deepEqual(weeklyDistribution({ dailyKcal: 2000, highDays: [0, 1, 2, 3, 4, 5, 6] }), Array(7).fill(2000));
  assert.deepEqual(weeklyDistribution({ dailyKcal: 0 }), Array(7).fill(0));
});

test('weeklyDistribution: выходные выше, сумма за неделю сохраняется', () => {
  const r = weeklyDistribution({ dailyKcal: 2000, highDays: [5, 6] });
  assert.equal(r.length, 7);
  assert.equal(r.reduce((a, b) => a + b, 0), 14000);
  assert.ok(r[5] > r[0] && r[5] === r[6]);
  assert.ok(Math.abs(r[5] / r[0] - (1 + HIGH_DAY_SHARE)) < 0.002);
  const odd = weeklyDistribution({ dailyKcal: 2001.3, highDays: [2], highShare: 0.3 });
  assert.equal(odd.reduce((a, b) => a + b, 0), Math.round(7 * 2001.3));
  assert.ok(odd.every(Number.isInteger));
});

test('weeklyDistribution: повторы дней не считаются дважды; ошибки', () => {
  assert.deepEqual(weeklyDistribution({ dailyKcal: 2000, highDays: [6, 6] }), weeklyDistribution({ dailyKcal: 2000, highDays: [6] }));
  assert.throws(() => weeklyDistribution({ dailyKcal: 2000, highDays: [7] }), /weekday/);
  assert.throws(() => weeklyDistribution({ dailyKcal: 2000, highDays: [1.5] }), /weekday/);
  assert.throws(() => weeklyDistribution({ dailyKcal: -1 }), /dailyKcal/);
  assert.throws(() => weeklyDistribution({ dailyKcal: 2000, highShare: -0.1 }), /highShare/);
});

test('dayTargets: белок одинаковый, жиры и углеводы забирают разницу', () => {
  const distribution = weeklyDistribution({ dailyKcal: 2200, highDays: [5, 6] });
  const rows = dayTargets({ ...BASE, distribution });
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.weekday), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rows.map((r) => r.kcal), distribution);
  assert.ok(rows.every((r) => r.protein === rows[0].protein));
  assert.ok(rows[6].carbs > rows[0].carbs && rows[6].fat >= rows[0].fat);
});

test('dayTargets: без распределения — каждый день kcal; ошибки', () => {
  const rows = dayTargets({ ...BASE, kcal: 2000 });
  assert.ok(rows.every((r) => r.kcal === 2000 && r.carbs === 222));
  assert.throws(() => dayTargets({ ...BASE, distribution: [2000, 2000] }), /7 чисел/);
});
