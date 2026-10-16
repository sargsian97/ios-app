/* Расчёты версии 2 по опубликованным формулам. Самопроверки — из учебного разбора (Python-модель),
   перенесены как тесты; плюс крайние случаи. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmrAllometric, bmrBodyComp, bmrAthlete, metabolicAdaptation, bmr, initialTdee, goalChangeFactor,
  adaptiveTdee, trendWeight, calorieTarget, macroTargetsV2, smoothTarget, findPartialDays, KCAL_PER_KG_V2
} from '../../web/src/domain/calc/index.js';

/* детерминированный шум: mulberry32 + Бокс — Мюллер */
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return (sd) => sd * Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}
const day = (k) => { const d = new Date(Date.UTC(2026, 0, 1 + k)); return d.toISOString().slice(0, 10); };

test('BMR v2: по росту и весу, состав тела, спортсмены, возраст после 60', () => {
  const b = bmrAllometric({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 });
  assert.ok(b > 1700 && b < 1900, b);
  assert.ok(bmrAllometric({ sex: 'female', weightKg: 80, heightCm: 180, ageYears: 30 }) < b);
  const a60 = bmrAllometric({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 60 });
  const a61 = bmrAllometric({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 61 });
  assert.ok(Math.abs(a60 - a61 - 4.9) < 1e-9, 'после 60 — 4,9 ккал за год');
  assert.ok(bmrBodyComp({ leanMassKg: 64, fatMassKg: 16, ageYears: 30 }) > 1500);
  assert.ok(bmrAthlete({ leanMassKg: 70 }) > bmrAthlete({ leanMassKg: 60 }));
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 }, { version: 'v2' }).method, 'allometric');
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30, bodyFatPct: 20 }, { version: 'v2' }).method, 'bodycomp');
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30, bodyFatPct: 12, athlete: true }, { version: 'v2' }).method, 'athlete');
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 }).method, 'mifflin', 'v1 не изменилась');
  assert.throws(() => bmrAllometric({ sex: 'male', weightKg: 0, heightCm: 180, ageYears: 30 }));
});

test('метаболическая адаптация: 0,95 / 0,97 / 0,92', () => {
  assert.ok(Math.abs(metabolicAdaptation(1000, { inDeficit: true, weightKg: 80, peakWeightKg: 100 }) - 920) < 1e-9);
  assert.ok(Math.abs(metabolicAdaptation(1000, { inDeficit: true }) - 950) < 1e-9);
  assert.ok(Math.abs(metabolicAdaptation(1000, { weightKg: 89, peakWeightKg: 100 }) - 970) < 1e-9);
  assert.equal(metabolicAdaptation(1000, { weightKg: 95, peakWeightKg: 100 }), 1000);
});

test('стартовый расход v2 с поправкой на цель и сдвиг при смене цели', () => {
  const base = initialTdee({ bmrKcal: 1800, activity: 'moderate' });
  assert.ok(Math.abs(initialTdee({ bmrKcal: 1800, activity: 'moderate', goalRatePct: -1, version: 'v2' }) - base * 0.96) < 1e-9);
  assert.equal(initialTdee({ bmrKcal: 1800, activity: 'moderate', goalRatePct: -1 }), base, 'v1 без поправки');
  assert.ok(Math.abs(goalChangeFactor({ oldRatePct: -1, newRatePct: 0.5, daysSince: 14 }) - 1.06) < 1e-9, '−1 → +0,5 %: +6 %');
  assert.ok(Math.abs(goalChangeFactor({ oldRatePct: -1, newRatePct: 0.5, daysSince: 7 }) - 1.03) < 1e-9, 'нарастает за 2 недели');
  assert.equal(goalChangeFactor({ oldRatePct: 0, newRatePct: 0, daysSince: 3 }), 1);
});

test('тренд v3: пропуски — линейная интерполяция, шум гасится', () => {
  const t = trendWeight([{ date: '2026-01-05', weight: 151 }, { date: '2026-01-07', weight: 150 }], { version: 'v3' });
  assert.equal(t.length, 3);
  assert.equal(t[1].scale, 150.5, '151 в пн и 150 в ср → 150,5 во вт');
  assert.equal(t[1].weight, null);
  const g = rng(1);
  const noisy = trendWeight(Array.from({ length: 120 }, (_, i) => ({ date: day(i), weight: 80 + g(0.5) })), { version: 'v3' });
  const tr = noisy.map((r) => r.trend);
  assert.ok(Math.max(...tr) - Math.min(...tr) < 1.5);
});

function tdeeV2(intake, weights, start) {
  const trend = trendWeight(weights.map((w, i) => (w == null ? null : { date: day(i), weight: w })).filter(Boolean), { version: 'v3' });
  const days = intake.map((k, i) => ({ date: day(i), kcal: k }));
  return adaptiveTdee({ days, trend, startTdee: start, version: 'v2', startDate: day(0), endDate: day(intake.length - 1) });
}

test('расход v2: стабильный человек сходится к 2500 со старта 3000', () => {
  const g = rng(1);
  const s = tdeeV2(Array(120).fill(2500), Array.from({ length: 120 }, () => 80 + g(0.5)), 3000);
  assert.ok(Math.abs(s[s.length - 1].tdee - 2500) < 150, s[s.length - 1].tdee);
});

test('расход v2: худеющий (−500 ккал в день) сходится к 2600', () => {
  const g = rng(2);
  let w = 90;
  const ws = Array.from({ length: 120 }, () => { w -= 500 / KCAL_PER_KG_V2; return w + g(0.4); });
  const s = tdeeV2(Array(120).fill(2100), ws, 2300);
  assert.ok(Math.abs(s[s.length - 1].tdee - 2600) < 200, s[s.length - 1].tdee);
});

test('расход v2: пауза, если пропущено больше 3 из 7 дней', () => {
  const intake = Array(20).fill(2500).concat(Array(5).fill(null), Array(5).fill(2500));
  const s = tdeeV2(intake, Array(30).fill(80), 2500);
  assert.equal(s[24].status, 'hold');
  assert.equal(s[24].tdee, s[23].tdee);
  assert.equal(s[22].status, 'ok', '3 пропуска из 7 — ещё считаем');
});

test('цель v2: умное поддержание ± 0,7 кг, 0,15 % в неделю, нижний предел 1200', () => {
  const m = { type: 'maintain', targetWeightKg: 75 };
  assert.equal(calorieTarget({ tdee: 2500, goal: m, weightKg: 75.5, sex: 'male', version: 'v2' }).kcal, 2500);
  assert.equal(calorieTarget({ tdee: 2500, goal: m, weightKg: 76, sex: 'male', version: 'v2' }).kcal, Math.round(2500 - 0.0015 * 76 * KCAL_PER_KG_V2 / 7));
  assert.equal(calorieTarget({ tdee: 2500, goal: m, weightKg: 74, sex: 'male', version: 'v2' }).kcal, Math.round(2500 + 0.0015 * 74 * KCAL_PER_KG_V2 / 7));
  const low = calorieTarget({ tdee: 1100, goal: { type: 'lose', ratePctPerWeek: 1 }, weightKg: 70, sex: 'male', version: 'v2' });
  assert.deepEqual(low, { kcal: 1200, floored: true });
  assert.equal(calorieTarget({ tdee: 2500, goal: m, weightKg: 76, sex: 'male' }).kcal, 2500, 'v1: поддержание = расход');
});

test('БЖУ v2: жиры не ниже минимума → белок → углеводы, кето', () => {
  const r = macroTargetsV2({ kcal: 2000, weightKg: 80, training: 'lift', proteinPref: 'mid' });
  assert.equal(r.protein, 152);
  assert.equal(r.fat, 67);
  assert.equal(r.carbs, Math.round((2000 - (2000 * 0.3 / 9) * 9 - 152 * 4) / 4));
  const tight = macroTargetsV2({ kcal: 900, weightKg: 100, training: 'lift', proteinPref: 'high' });
  assert.equal(tight.fat, 50, 'минимум жиров 0,5 г/кг');
  assert.equal(tight.carbs, 0);
  assert.equal(tight.protein, Math.round((900 - 50 * 9) / 4), 'белку — что осталось после жиров');
  assert.ok(macroTargetsV2({ kcal: 2500, weightKg: 80, dietType: 'keto' }).carbs <= 30);
  assert.throws(() => macroTargetsV2({ kcal: 2000, weightKg: 80, training: 'yoga' }));
});

test('неполные дни v2 по неделе и сглаживание цели на чек-ине', () => {
  const kcals = [2000, 2000, 600, 2000, 0, 2000, 2000];
  const days = kcals.map((k, i) => ({ date: day(i), kcal: k }));
  assert.deepEqual(findPartialDays(days, { from: day(0), to: day(6), version: 'v2' }), [day(2)]);
  assert.equal(smoothTarget(2500, 2000), 2200);
  assert.equal(smoothTarget(null, 2000), 2000);
});
