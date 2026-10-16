import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTdee, dayIntake, adaptiveTdee, energyBalance } from '../../web/src/domain/calc/tdee.js';
import {
  ACTIVITY_FACTORS,
  KCAL_PER_KG_TISSUE,
  TDEE_FIRST_UPDATE_DAY,
  TDEE_HOLD_NO_WEIGHIN_DAYS,
  TDEE_SMOOTHING,
  TDEE_RAW_MAX
} from '../../web/src/domain/calc/constants.js';
import { addDays } from '../../web/src/domain/calc/dates.js';
import { trendWeight } from '../../web/src/domain/calc/trend_weight.js';
import { near } from './helpers.js';

const S = '2026-01-01';

/* n дней питания: f(i) → объект дня без даты (или null — дня нет) */
function food(n, f) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = f(i);
    if (d) out.push({ date: addDays(S, i), ...d });
  }
  return out;
}

/* тренд на n дней: f(i) → тренд; weighed(i) — было ли взвешивание */
function trendRows(n, f, weighed = () => true) {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(S, i), weight: weighed(i) ? f(i) : null, trend: f(i) }));
}

function run(n, days, trend, extra = {}) {
  return adaptiveTdee({ days, trend, startTdee: 2000, startDate: S, endDate: addDays(S, n - 1), ...extra });
}

test('initialTdee: BMR × активность', () => {
  near(initialTdee({ bmrKcal: 1780, activity: 'sedentary' }), 1780 * ACTIVITY_FACTORS.sedentary);
  near(initialTdee({ bmrKcal: 1780, activity: 'moderate' }), 1780 * ACTIVITY_FACTORS.moderate);
  near(initialTdee({ bmrKcal: 1780, activity: 'very_active' }), 1780 * ACTIVITY_FACTORS.very_active);
  assert.ok(ACTIVITY_FACTORS.sedentary < ACTIVITY_FACTORS.moderate && ACTIVITY_FACTORS.moderate < ACTIVITY_FACTORS.very_active);
});

test('initialTdee: ошибки', () => {
  assert.throws(() => initialTdee({ bmrKcal: 1780, activity: 'lazy' }), /unknown activity/);
  assert.throws(() => initialTdee({ bmrKcal: NaN, activity: 'moderate' }), /bmrKcal/);
  assert.throws(() => initialTdee({ bmrKcal: -1, activity: 'moderate' }), /bmrKcal/);
  assert.throws(() => initialTdee({ bmrKcal: 1780, activity: 'toString' }), /unknown activity/);
});

test('dayIntake: голодание, частичный, не записан, ноль', () => {
  assert.equal(dayIntake({ kcal: 2100 }), 2100);
  assert.equal(dayIntake({ kcal: 2100, logged: true }), 2100);
  assert.equal(dayIntake({ kcal: 0, fasting: true }), 0);
  assert.equal(dayIntake({ fasting: true }), 0);
  assert.equal(dayIntake({ kcal: 150, fasting: true }), 0);
  assert.equal(dayIntake({ kcal: 900, partial: true }), null);
  assert.equal(dayIntake({ kcal: 2100, logged: false }), null);
  assert.equal(dayIntake({ kcal: 0 }), null);
  assert.equal(dayIntake({ kcal: NaN }), null);
  assert.equal(dayIntake({ kcal: -100 }), null);
  assert.equal(dayIntake({}), null);
  assert.equal(dayIntake(null), null);
});

test('adaptiveTdee: fixedTdee — каждый день одно значение', () => {
  const rows = adaptiveTdee({ fixedTdee: 2300, startDate: S, endDate: '2026-01-05' });
  assert.deepEqual(rows.map((r) => [r.tdee, r.status]), Array(5).fill([2300, 'fixed']));
  assert.equal(rows[4].date, '2026-01-05');
  assert.throws(() => adaptiveTdee({ fixedTdee: -1, startDate: S, endDate: S }), /fixedTdee/);
});

test('adaptiveTdee: первые дни — initial со стартовым значением, обновление с 3-го дня', () => {
  const rows = run(5, food(5, () => ({ kcal: 2500 })), trendRows(5, () => 80));
  assert.equal(TDEE_FIRST_UPDATE_DAY, 3);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.tdee, r.status]), [[2000, 'initial'], [2000, 'initial']]);
  assert.equal(rows[2].status, 'ok');
  near(rows[2].tdee, 2000 + TDEE_SMOOTHING * 500);
});

test('adaptiveTdee: один день и пустой период', () => {
  assert.deepEqual(run(1, [], []), [{ date: S, tdee: 2000, status: 'initial' }]);
  assert.deepEqual(adaptiveTdee({ startTdee: 2000, startDate: '2026-01-05', endDate: S }), []);
});

test('adaptiveTdee: нет данных — hold на стартовом значении', () => {
  const rows = run(10, [], []);
  assert.equal(rows.length, 10);
  for (const r of rows.slice(2)) assert.deepEqual([r.tdee, r.status, r.reason], [2000, 'hold', 'no_weighin']);
});

test('adaptiveTdee: вес стоит — оценка сходится к среднему потреблению', () => {
  const rows = run(60, food(60, () => ({ kcal: 2500 })), trendRows(60, () => 80));
  for (let i = 3; i < 60; i++) assert.ok(rows[i].tdee > rows[i - 1].tdee);
  near(rows[59].tdee, 2500, 5);
  assert.ok(rows.slice(2).every((r) => r.status === 'ok'));
});

test('adaptiveTdee: похудение 0,1 кг/день при 2000 ккал → расход ≈ 2000 + 770', () => {
  const rows = run(80, food(80, () => ({ kcal: 2000 })), trendRows(80, (i) => 90 - 0.1 * i));
  near(rows[79].tdee, 2000 + 0.1 * KCAL_PER_KG_TISSUE, 5);
});

test('adaptiveTdee: набор массы → расход ниже потребления', () => {
  const rows = run(80, food(80, () => ({ kcal: 3000 })), trendRows(80, (i) => 70 + 0.05 * i));
  near(rows[79].tdee, 3000 - 0.05 * KCAL_PER_KG_TISSUE, 5);
});

test('adaptiveTdee: нет взвешивания 7 дней — hold, значение заморожено, потом возобновляется', () => {
  const weighed = (i) => i < 20 || i >= 35;
  const rows = run(50, food(50, () => ({ kcal: 2500 })), trendRows(50, () => 80, weighed));
  const lastOk = rows[19 + TDEE_HOLD_NO_WEIGHIN_DAYS - 1];
  assert.equal(lastOk.status, 'ok');
  for (let i = 19 + TDEE_HOLD_NO_WEIGHIN_DAYS; i < 35; i++) {
    assert.deepEqual([rows[i].status, rows[i].reason, rows[i].tdee], ['hold', 'no_weighin', lastOk.tdee]);
  }
  assert.equal(rows[35].status, 'ok');
  assert.ok(rows[35].tdee > lastOk.tdee);
});

test('adaptiveTdee: перерыв в логировании — hold из-за мало дней с едой', () => {
  const days = food(40, (i) => (i < 15 || i >= 30 ? { kcal: 2500 } : null));
  const rows = run(40, days, trendRows(40, () => 80));
  assert.equal(rows[14].status, 'ok');
  const first = rows.findIndex((r) => r.reason === 'few_intake_days');
  assert.ok(first > 14);
  assert.equal(rows[first - 1].status, 'ok');
  const held = rows.filter((r) => r.status === 'hold');
  assert.ok(held.length > 5);
  for (const r of held) assert.deepEqual([r.reason, r.tdee], ['few_intake_days', rows[first - 1].tdee]);
  assert.equal(rows[39].status, 'ok');
});

test('adaptiveTdee: частичные дни и logged: false не влияют на оценку', () => {
  const trend = trendRows(40, () => 80);
  const base = food(40, (i) => (i % 5 === 4 ? null : { kcal: 2500 }));
  const partial = food(40, (i) => (i % 5 === 4 ? { kcal: 300, partial: true } : { kcal: 2500 }));
  const unlogged = food(40, (i) => (i % 5 === 4 ? { kcal: 300, logged: false } : { kcal: 2500 }));
  const zero = food(40, (i) => (i % 5 === 4 ? { kcal: 0 } : { kcal: 2500 }));
  const a = run(40, base, trend);
  assert.deepEqual(run(40, partial, trend), a);
  assert.deepEqual(run(40, unlogged, trend), a);
  assert.deepEqual(run(40, zero, trend), a);
});

test('adaptiveTdee: дни голодания идут как 0 ккал', () => {
  const trend = trendRows(40, () => 80);
  const skipped = run(40, food(40, (i) => (i % 5 === 4 ? null : { kcal: 2500 })), trend);
  const fasting = run(40, food(40, (i) => (i % 5 === 4 ? { kcal: 0, fasting: true } : { kcal: 2500 })), trend);
  assert.ok(fasting[39].tdee < skipped[39].tdee - 100);
  near(fasting[39].tdee, 2000, 60);
});

test('adaptiveTdee: первое взвешивание позже старта — окно с первого тренда', () => {
  const trend = trendRows(20, () => 80).slice(2); /* тренд с 3-го дня */
  const rows = run(20, food(20, () => ({ kcal: 2500 })), trend);
  assert.deepEqual([rows[2].status, rows[2].reason], ['hold', 'short_window']);
  assert.deepEqual([rows[3].status, rows[3].reason], ['hold', 'short_window']);
  assert.equal(rows[4].status, 'ok');
});

test('adaptiveTdee: скачок тренда (вода) — сырая оценка обрезана', () => {
  const trend = trendRows(10, (i) => (i < 5 ? 80 : 75));
  const rows = run(10, food(10, () => ({ kcal: 2000 })), trend);
  const before = rows[4].tdee;
  assert.ok(rows[5].tdee - before <= TDEE_SMOOTHING * (TDEE_RAW_MAX - before) + 1e-9);
  assert.ok(rows.every((r) => Number.isFinite(r.tdee)));
});

test('adaptiveTdee: работает с выходом trendWeight и пропусками взвешиваний', () => {
  const entries = [];
  for (let i = 0; i < 30; i += 2) entries.push({ date: addDays(S, i), weight: 85 - 0.05 * i });
  const rows = run(30, food(30, () => ({ kcal: 2200 })), trendWeight(entries));
  assert.equal(rows.length, 30);
  assert.ok(rows.slice(2).every((r) => r.status === 'ok'));
  assert.ok(rows[29].tdee > 2000);
});

test('adaptiveTdee: ошибки', () => {
  assert.throws(() => adaptiveTdee({ startTdee: 2000, startDate: S, endDate: S, version: 'v9' }), /unknown version: v9/);
  assert.throws(() => adaptiveTdee({ startTdee: NaN, startDate: S, endDate: S }), /startTdee/);
  assert.throws(() => adaptiveTdee({ startTdee: 2000, startDate: 'x', endDate: S }), /invalid date/);
  assert.throws(() => adaptiveTdee({ startTdee: 2000, startDate: S }), /invalid date/);
});

test('energyBalance: потребление − расход, пропуская незаписанные дни', () => {
  const days = [
    { date: '2026-01-03', kcal: 1800 },
    { date: S, kcal: 2500 },
    { date: '2026-01-02', kcal: 900, partial: true },
    { date: '2026-01-04', fasting: true },
    { date: '2026-01-05', kcal: 2000, logged: false },
    { date: '2026-01-06', kcal: 2100 }
  ];
  const tdee = adaptiveTdee({ fixedTdee: 2200, startDate: S, endDate: '2026-01-05' });
  assert.deepEqual(energyBalance(days, tdee), [
    { date: S, intake: 2500, tdee: 2200, balance: 300 },
    { date: '2026-01-03', intake: 1800, tdee: 2200, balance: -400 },
    { date: '2026-01-04', intake: 0, tdee: 2200, balance: -2200 }
  ]);
  assert.deepEqual(energyBalance([], tdee), []);
  assert.deepEqual(energyBalance(days, []), []);
});
