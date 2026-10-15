import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendWeight, dailyWeights, weightRate, forecastGoalDate } from '../../web/src/domain/calc/trend_weight.js';
import { TREND_V1_ALPHA, FORECAST_MAX_DAYS } from '../../web/src/domain/calc/constants.js';
import { addDays } from '../../web/src/domain/calc/dates.js';
import { near } from './helpers.js';

const D0 = '2026-01-01';

/* ряд взвешиваний: f(i) → вес на i-й день */
function weighIns(n, f, start = D0) {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), weight: f(i) }));
}

/* готовый ряд тренда для темпа и прогноза */
function series(n, f, start = D0) {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), weight: f(i), trend: f(i) }));
}

test('trendWeight: пустые данные', () => {
  assert.deepEqual(trendWeight([]), []);
  assert.deepEqual(trendWeight(undefined), []);
  assert.deepEqual(trendWeight([{ date: D0, weight: NaN }, { date: D0, weight: null }]), []);
  assert.deepEqual(trendWeight([], { version: 'v2' }), []);
});

test('trendWeight: один день', () => {
  assert.deepEqual(trendWeight([{ date: D0, weight: 80 }]), [{ date: D0, weight: 80, trend: 80 }]);
  assert.deepEqual(trendWeight([{ date: D0, weight: 80 }], { version: 'v2' }), [{ date: D0, weight: 80, trend: 80 }]);
});

test('trendWeight: несколько взвешиваний за день усредняются, порядок не важен', () => {
  const rows = trendWeight([
    { date: '2026-01-02', weight: 81 },
    { date: D0, weight: 79 },
    { date: D0, weight: 81 },
    { date: '2026-01-02', weight: 83 }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].weight, 80);
  assert.equal(rows[1].weight, 82);
  near(rows[1].trend, 80 + TREND_V1_ALPHA * 2);
});

test('trendWeight: NaN, null, 0 и отрицательный вес пропускаются', () => {
  const rows = trendWeight([
    { date: D0, weight: 80 },
    { date: '2026-01-02', weight: NaN },
    { date: '2026-01-02', weight: -5 },
    { date: '2026-01-03', weight: 0 },
    { date: '2026-01-04', weight: 81 },
    null
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.weight), [80, null, null, 81]);
});

test('trendWeight: неверная дата у живого веса — ошибка', () => {
  assert.throws(() => trendWeight([{ date: '2026-02-30', weight: 80 }]), /invalid date/);
});

test('trendWeight: неизвестная версия — ошибка', () => {
  assert.throws(() => trendWeight([], { version: 'v9' }), /unknown version: v9/);
});

test('trendWeight v1: EMA только по прошлым точкам', () => {
  const rows = trendWeight([{ date: D0, weight: 80 }, { date: '2026-01-02', weight: 81 }, { date: '2026-01-03', weight: 79 }]);
  near(rows[0].trend, 80);
  near(rows[1].trend, 80.1);
  near(rows[2].trend, 80.1 + 0.1 * (79 - 80.1));
});

test('trendWeight v1: пропуски — строки с weight: null, тренд переносится', () => {
  const rows = trendWeight([{ date: D0, weight: 80 }, { date: '2026-01-05', weight: 82 }]);
  assert.deepEqual(rows.map((r) => r.date), ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
  assert.deepEqual(rows.slice(1, 4).map((r) => [r.weight, r.trend]), [[null, 80], [null, 80], [null, 80]]);
  near(rows[4].trend, 80.2);
});

test('trendWeight v1: alpha из параметров и проверка alpha', () => {
  const rows = trendWeight([{ date: D0, weight: 80 }, { date: '2026-01-02', weight: 82 }], { alpha: 0.5 });
  near(rows[1].trend, 81);
  assert.equal(trendWeight([{ date: D0, weight: 80 }, { date: '2026-01-02', weight: 82 }], { alpha: 1 })[1].trend, 82);
  for (const alpha of [0, -0.1, 1.5, NaN, null]) {
    assert.throws(() => trendWeight([{ date: D0, weight: 80 }], { alpha }), /invalid alpha/);
  }
});

test('trendWeight v1: прошлое не пересматривается', () => {
  const base = weighIns(10, (i) => 80 - 0.1 * i);
  const a = trendWeight(base);
  const b = trendWeight([...base, { date: addDays(D0, 10), weight: 70 }]);
  assert.deepEqual(b.slice(0, 10), a);
});

test('trendWeight v2: ровный вес — ровный тренд', () => {
  for (const r of trendWeight(weighIns(20, () => 75), { version: 'v2' })) near(r.trend, 75);
});

test('trendWeight v2: прямую линию повторяет без запаздывания', () => {
  const rows = trendWeight(weighIns(30, (i) => 90 - 0.1 * i), { version: 'v2' });
  rows.forEach((r, i) => near(r.trend, 90 - 0.1 * i, 1e-6));
  const v1 = trendWeight(weighIns(30, (i) => 90 - 0.1 * i));
  assert.ok(v1[29].trend - 87.1 > 0.5, 'v1 заметно запаздывает');
});

test('trendWeight v2: выброс помечен и не тянет тренд', () => {
  const data = weighIns(30, (i) => 90 - 0.1 * i + (i % 2 ? 0.3 : -0.3));
  data[10].weight = 60;
  const v2 = trendWeight(data, { version: 'v2' });
  assert.equal(v2[10].outlier, true);
  assert.equal(v2[10].weight, 60);
  assert.equal(v2.filter((r) => r.outlier).length, 1);
  near(v2[10].trend, 89, 0.3);
  const v1 = trendWeight(data);
  assert.ok(v1[10].trend < 87, 'v1 выброс тянет вниз');
});

test('trendWeight v2: обычное колебание ±1 кг не выброс', () => {
  const data = weighIns(21, (i) => 80 + (i % 3 === 0 ? 1 : 0) - (i % 5 === 0 ? 0.8 : 0));
  assert.equal(trendWeight(data, { version: 'v2' }).filter((r) => r.outlier).length, 0);
});

test('trendWeight v2: может пересматривать прошлые точки', () => {
  const base = weighIns(10, () => 80);
  const a = trendWeight(base, { version: 'v2' });
  const b = trendWeight([...base, ...weighIns(5, () => 82, addDays(D0, 10))], { version: 'v2' });
  assert.ok(b[9].trend > a[9].trend + 0.1);
});

test('trendWeight v2: длинный пропуск — тренд между кусками без скачков за пределы', () => {
  const data = [...weighIns(5, () => 80), ...weighIns(5, () => 78, '2026-03-01')];
  const rows = trendWeight(data, { version: 'v2' });
  assert.equal(rows.length, 31 + 28 + 5);
  for (const r of rows) assert.ok(r.trend <= 80 + 1e-9 && r.trend >= 78 - 1e-9, `${r.date}: ${r.trend}`);
});

test('trendWeight v2: выброс в последний день не уводит конец тренда', () => {
  const data = weighIns(20, (i) => 85 - 0.1 * i);
  data[19].weight = 95;
  const rows = trendWeight(data, { version: 'v2' });
  assert.equal(rows[19].outlier, true);
  assert.ok(rows[19].trend >= 83.2 - 1e-9 && rows[19].trend <= 83.3, `${rows[19].trend}`);
});

test('trendWeight v2: две точки', () => {
  const rows = trendWeight([{ date: D0, weight: 80 }, { date: '2026-01-03', weight: 81 }], { version: 'v2' });
  assert.equal(rows.length, 3);
  near(rows[0].trend, 80);
  near(rows[1].trend, 80.5);
  near(rows[2].trend, 81);
});

test('dailyWeights: среднее по дням по порядку', () => {
  assert.deepEqual(dailyWeights([{ date: '1970-01-02', weight: 2 }, { date: '1970-01-01', weight: 1 }, { date: '1970-01-01', weight: 3 }]), [
    { day: 0, weight: 2 },
    { day: 1, weight: 2 }
  ]);
});

test('weightRate: кг в неделю по наклону тренда', () => {
  near(weightRate(series(20, (i) => 90 - 0.1 * i)), -0.7, 1e-9);
  near(weightRate(series(20, (i) => 70 + 0.05 * i)), 0.35, 1e-9);
  near(weightRate(series(20, () => 80)), 0, 1e-9);
});

test('weightRate: берёт только последние N дней', () => {
  const s = series(30, (i) => (i < 16 ? 90 : 90 - 0.2 * (i - 15)));
  near(weightRate(s, { days: 14 }), -1.4, 1e-9);
  assert.ok(weightRate(s, { days: 30 }) > -1.4);
});

test('weightRate: мало данных — null', () => {
  assert.equal(weightRate([]), null);
  assert.equal(weightRate(null), null);
  assert.equal(weightRate(series(1, () => 80)), null);
  assert.equal(weightRate(series(6, (i) => 80 - i)), null);
  near(weightRate(series(7, (i) => 80 - 0.1 * i)), -0.7, 1e-9);
  near(weightRate(series(3, (i) => 80 - 0.1 * i), { days: 3 }), -0.7, 1e-9);
  assert.equal(weightRate(series(2, (i) => 80 - i), { days: 3 }), null);
});

test('weightRate: пропуски в ряду и строки без тренда', () => {
  const s = series(20, (i) => 90 - 0.1 * i).filter((_, i) => i % 3 !== 1);
  s.push({ date: '2026-01-05', weight: null, trend: NaN });
  near(weightRate(s), -0.7, 1e-9);
});

test('weightRate: неверное окно — ошибка', () => {
  assert.throws(() => weightRate(series(20, () => 80), { days: 1 }), /invalid days/);
  assert.throws(() => weightRate(series(20, () => 80), { days: 2.5 }), /invalid days/);
});

test('forecastGoalDate: дата при текущем темпе', () => {
  const s = series(20, (i) => 90 - 0.1 * i); /* последний тренд 88.1 на 2026-01-20 */
  assert.equal(forecastGoalDate(s, 88), '2026-01-21');
  assert.equal(forecastGoalDate(s, 85), addDays('2026-01-20', 31));
  assert.equal(forecastGoalDate(series(20, (i) => 70 + 0.1 * i), 75), addDays('2026-01-20', 31));
});

test('forecastGoalDate: уже на цели — сегодня', () => {
  assert.equal(forecastGoalDate(series(20, () => 80), 80), '2026-01-20');
  assert.equal(forecastGoalDate(series(1, () => 80), 80), D0);
});

test('forecastGoalDate: от цели, стоит на месте, мало данных — null', () => {
  assert.equal(forecastGoalDate(series(20, (i) => 90 - 0.1 * i), 95), null);
  assert.equal(forecastGoalDate(series(20, () => 80), 75), null);
  assert.equal(forecastGoalDate(series(20, (i) => 80 - 0.001 * i), 75), null);
  assert.equal(forecastGoalDate(series(3, (i) => 80 - i), 70), null);
  assert.equal(forecastGoalDate([], 70), null);
});

test('forecastGoalDate: слишком далеко — null', () => {
  const s = series(20, (i) => 90 - 0.01 * i); /* 0,07 кг в неделю */
  assert.equal(forecastGoalDate(s, 50), null);
  assert.ok(FORECAST_MAX_DAYS > 0);
});

test('forecastGoalDate: неверная цель — ошибка', () => {
  assert.throws(() => forecastGoalDate(series(20, () => 80), NaN), /invalid targetWeight/);
  assert.throws(() => forecastGoalDate(series(20, () => 80), -1), /invalid targetWeight/);
});

test('trendWeight → weightRate → forecastGoalDate вместе', () => {
  const rows = trendWeight(weighIns(40, (i) => 90 - 0.1 * i), { version: 'v2' });
  near(weightRate(rows), -0.7, 1e-6);
  assert.equal(forecastGoalDate(rows, 86), addDays(rows[rows.length - 1].date, 1));
});
