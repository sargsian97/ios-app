import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingEstimate, targetDate, planTargets, dayTargetDocs, microGoalDocs } from '../web/src/domain/program.js';
import { microGoals } from '../web/src/domain/calc/index.js';

const man = { sex: 'male', birthDate: '1996-05-20', heightCm: 178, weightKg: 84, activity: 'moderate', today: '2026-10-16' };

test('стартовая оценка: Миффлин без % жира, Каннингем с ним', () => {
  const a = startingEstimate(man);
  assert.equal(a.ageYears, 30);
  assert.equal(a.bmr.method, 'mifflin');
  assert.ok(Math.abs(a.bmr.kcal - (10 * 84 + 6.25 * 178 - 5 * 30 + 5)) < 1, String(a.bmr.kcal));
  assert.ok(a.tdee > a.bmr.kcal);
  const b = startingEstimate(Object.assign({ bodyFatPct: 20 }, man));
  assert.equal(b.bmr.method, 'cunningham');
  assert.equal(Math.round(b.leanMassKg * 10) / 10, 67.2);
});

test('дата цели по темпу', () => {
  assert.equal(targetDate({ startKg: 80, targetKg: 76, ratePctPerWeek: 0.5, start: '2026-10-16' }), '2026-12-25');
  assert.equal(targetDate({ startKg: 80, targetKg: 80, ratePctPerWeek: 0.5, start: '2026-10-16' }), null);
  assert.equal(targetDate({ startKg: 80, targetKg: 76, ratePctPerWeek: 0, start: '2026-10-16' }), null);
});

const coached = { style: 'coached', dietType: 'balanced', proteinLevel: 'high', distribution: 'even', floor: 'standard' };

test('coached: дефицит от расхода, 7 одинаковых дней, сумма БЖУ ≈ калориям', () => {
  const r = planTargets({ tdee: 2700, goal: { type: 'lose', ratePctPerWeek: 0.5 }, weightKg: 84, sex: 'male', program: coached });
  assert.equal(r.days.length, 7);
  assert.ok(r.daily.kcal < 2700);
  assert.ok(r.days.every((d) => d.kcal === r.daily.kcal));
  const d = r.days[0];
  assert.ok(Math.abs(d.protein * 4 + d.fat * 9 + d.carbs * 4 - d.kcal) < 15, JSON.stringify(d));
  assert.equal(d.protein, Math.round(2.0 * 84));
});

test('coached: высокие дни, нижний порог', () => {
  const r = planTargets({ tdee: 2700, goal: { type: 'maintain' }, weightKg: 84, sex: 'male', program: Object.assign({}, coached, { distribution: 'high_days', highDays: [5, 6] }) });
  assert.ok(r.days[5].kcal > r.days[0].kcal);
  assert.ok(Math.abs(r.days.reduce((a, x) => a + x.kcal, 0) - 7 * 2700) <= 1);
  const low = planTargets({ tdee: 1500, goal: { type: 'lose', ratePctPerWeek: 1 }, weightKg: 84, sex: 'male', program: coached });
  assert.ok(low.warnings.includes('floored'));
  assert.equal(low.daily.kcal, 1500);
});

test('collaborative: рамки калорий и минимум белка', () => {
  const p = Object.assign({}, coached, { style: 'collaborative', proteinLevel: 'low', limits: { kcalMin: 2400, kcalMax: null, proteinMin: 150 } });
  const r = planTargets({ tdee: 2700, goal: { type: 'lose', ratePctPerWeek: 0.75 }, weightKg: 84, sex: 'male', program: p });
  assert.equal(r.daily.kcal, 2400);
  assert.ok(r.warnings.includes('limit_min'));
  assert.ok(r.days.every((d) => d.protein >= 150));
  assert.ok(r.warnings.includes('protein_min'));
});

test('manual: одинаково каждый день и по дням недели', () => {
  const same = planTargets({ program: { style: 'manual' }, manual: { sameEveryDay: true, days: [{ kcal: 2200, protein: 160, fat: 70 }] } });
  assert.ok(same.days.every((d) => d.kcal === 2200 && d.carbs === Math.round((2200 - 160 * 4 - 70 * 9) / 4)));
  const by = planTargets({ program: { style: 'manual' }, manual: { sameEveryDay: false, days: [{ protein: 150, fat: 60, carbs: 250 }, { kcal: 2500, protein: 150, fat: 80, carbs: 300 }] } });
  assert.equal(by.days[0].kcal, 150 * 4 + 60 * 9 + 250 * 4);
  assert.equal(by.days[1].kcal, 2500);
  assert.equal(by.days[6].kcal, by.days[0].kcal, 'незаданные дни — как первый');
});

test('документы целей и микронорм', () => {
  const docs = dayTargetDocs([{ weekday: 0, kcal: 2000, protein: 150, fat: 60, carbs: 200 }], { programId: 'p1', validFrom: '2026-10-16' });
  assert.deepEqual(docs[0], { id: '2026-10-16_0', programId: 'p1', validFrom: '2026-10-16', weekday: 0, kcal: 2000, protein: 150, fat: 60, carbs: 200 });
  const g = microGoals({ sex: 'male', ageYears: 30 });
  const mg = microGoalDocs(g, { iron: { auto: false, target: 20 } });
  assert.ok(!mg.find((x) => x.id === 'iron'), 'ручная норма не перезаписывается');
  assert.equal(mg.find((x) => x.id === 'calcium').target, 1000);
});
