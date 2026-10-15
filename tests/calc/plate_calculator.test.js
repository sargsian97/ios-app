import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platesFor, achievableLoads } from '../../web/src/domain/calc/plate_calculator.js';

/* обычный набор зала: штук всего (на обе стороны) */
const GYM = [
  { weight: 25, count: 2 },
  { weight: 20, count: 4 },
  { weight: 15, count: 2 },
  { weight: 10, count: 2 },
  { weight: 5, count: 2 },
  { weight: 2.5, count: 2 },
  { weight: 1.25, count: 2 }
];

test('platesFor: точный вес, меньше всего блинов, тяжёлые первыми', () => {
  assert.deepEqual(platesFor({ target: 60, barWeight: 20, plates: GYM }), { perSide: [20], total: 60, remainder: 0, exact: true, belowBar: false });
  assert.deepEqual(platesFor({ target: 100, barWeight: 20, plates: GYM }).perSide, [25, 15]);
  assert.deepEqual(platesFor({ target: 142.5, barWeight: 20, plates: GYM }).perSide, [25, 20, 15, 1.25]);
  assert.deepEqual(platesFor({ target: 72.5, barWeight: 20, plates: GYM }).perSide, [25, 1.25]);
});

test('platesFor: точное сочетание там, где жадный алгоритм застревает', () => {
  /* на сторону 30: жадный берёт 20 и дальше 15 не влезает; правильно — 15 + 15 */
  const plates = [{ weight: 20, count: 2 }, { weight: 15, count: 4 }];
  assert.deepEqual(platesFor({ target: 80, barWeight: 20, plates }), { perSide: [15, 15], total: 80, remainder: 0, exact: true, belowBar: false });
  /* ограниченные штуки: 25 × 1 пара, 10 × 3 пары, на сторону 30 → 10 + 10 + 10 */
  assert.deepEqual(platesFor({ target: 80, barWeight: 20, plates: [{ weight: 25, count: 2 }, { weight: 10, count: 6 }] }).perSide, [10, 10, 10]);
});

test('platesFor: точно не собрать — ближайший вес не больше цели', () => {
  assert.deepEqual(platesFor({ target: 101, barWeight: 20, plates: GYM }), { perSide: [25, 15], total: 100, remainder: 1, exact: false, belowBar: false });
  const r = platesFor({ target: 500, barWeight: 20, plates: GYM });
  assert.equal(r.total, 20 + 2 * (25 + 40 + 15 + 10 + 5 + 2.5 + 1.25));
  assert.equal(r.exact, false);
});

test('platesFor: остаток меньше самого лёгкого блина', () => {
  assert.deepEqual(platesFor({ target: 21, barWeight: 20, plates: GYM }), { perSide: [], total: 20, remainder: 1, exact: false, belowBar: false });
  assert.deepEqual(platesFor({ target: 63, barWeight: 20, plates: GYM }), { perSide: [20, 1.25], total: 62.5, remainder: 0.5, exact: false, belowBar: false });
});

test('platesFor: цель легче грифа и ровно гриф', () => {
  assert.deepEqual(platesFor({ target: 15, barWeight: 20, plates: GYM }), { perSide: [], total: 20, remainder: -5, exact: false, belowBar: true });
  assert.deepEqual(platesFor({ target: 20, barWeight: 20, plates: GYM }), { perSide: [], total: 20, remainder: 0, exact: true, belowBar: false });
  assert.deepEqual(platesFor({ target: 0, barWeight: 0, plates: [] }), { perSide: [], total: 0, remainder: 0, exact: true, belowBar: false });
});

test('platesFor: на две стороны нужны пары', () => {
  assert.deepEqual(platesFor({ target: 60, barWeight: 20, plates: [{ weight: 20, count: 1 }] }).total, 20);
  /* 5 блинов по 10 → 2 пары, на сторону максимум 20 */
  assert.equal(platesFor({ target: 80, barWeight: 20, plates: [{ weight: 10, count: 5 }] }).total, 60);
  /* одинаковые веса в списке складываются: 1 + 1 = пара */
  assert.deepEqual(platesFor({ target: 60, barWeight: 20, plates: [{ weight: 20, count: 1 }, { weight: 20, count: 1 }] }).perSide, [20]);
});

test('platesFor: одна сторона', () => {
  const plates = [{ weight: 20, count: 1 }, { weight: 10, count: 2 }];
  assert.deepEqual(platesFor({ target: 40, barWeight: 0, plates, mode: 'one_side' }), { perSide: [20, 10, 10], total: 40, remainder: 0, exact: true, belowBar: false });
  assert.deepEqual(platesFor({ target: 30, barWeight: 0, plates, mode: 'one_side' }).perSide, [20, 10]);
});

test('platesFor: дробные и фунтовые блины без ошибок округления', () => {
  assert.deepEqual(platesFor({ target: 21, barWeight: 20, plates: [{ weight: 0.5, count: 2 }] }).perSide, [0.5]);
  const lb = (x) => Math.round(x * 0.45359237 * 1000) / 1000;
  const plates = [{ weight: lb(45), count: 4 }, { weight: lb(25), count: 2 }, { weight: lb(10), count: 2 }];
  const r = platesFor({ target: lb(45) + 2 * (lb(45) + lb(25) + lb(10)), barWeight: lb(45), plates });
  assert.equal(r.exact, true);
  assert.deepEqual(r.perSide, [lb(45), lb(25), lb(10)]);
});

test('platesFor: бесконечный запас блинов', () => {
  assert.deepEqual(platesFor({ target: 120, barWeight: 20, plates: [{ weight: 10, count: Infinity }] }).perSide, [10, 10, 10, 10, 10]);
});

test('platesFor: ошибки', () => {
  assert.throws(() => platesFor({ target: NaN, plates: GYM }), /invalid target/);
  assert.throws(() => platesFor({ target: 60, barWeight: -1, plates: GYM }), /barWeight/);
  assert.throws(() => platesFor({ target: 60, plates: [{ weight: 0, count: 2 }] }), /plate weight/);
  assert.throws(() => platesFor({ target: 60, plates: [{ weight: 20, count: -2 }] }), /plate count/);
  assert.throws(() => platesFor({ target: 60, plates: [{ weight: 20 }] }), /plate count/);
  assert.throws(() => platesFor({ target: 60, plates: GYM, mode: 'both' }), /unknown mode/);
});

test('achievableLoads: все веса по возрастанию без повторов', () => {
  const plates = [{ weight: 20, count: 2 }, { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 }, { weight: 1.25, count: 2 }];
  const loads = achievableLoads({ barWeight: 20, plates });
  assert.equal(loads[0], 20);
  assert.equal(loads[loads.length - 1], 20 + 2 * 38.75);
  assert.equal(loads.length, 32);
  for (let i = 1; i < loads.length; i++) assert.ok(loads[i] > loads[i - 1]);
  assert.deepEqual(loads.slice(0, 4), [20, 22.5, 25, 27.5]);
});

test('achievableLoads: max, одна сторона, без блинов', () => {
  assert.deepEqual(achievableLoads({ barWeight: 20, plates: GYM, max: 30 }), [20, 22.5, 25, 27.5, 30]);
  assert.deepEqual(achievableLoads({ barWeight: 0, plates: [{ weight: 5, count: 1 }, { weight: 2.5, count: 1 }], mode: 'one_side' }), [0, 2.5, 5, 7.5]);
  assert.deepEqual(achievableLoads({ barWeight: 20, plates: [] }), [20]);
  assert.deepEqual(achievableLoads({ barWeight: 20, plates: GYM, max: 10 }), []);
  assert.deepEqual(achievableLoads({ barWeight: 20, plates: [{ weight: 15, count: Infinity }], max: 80 }), [20, 50, 80]);
});

test('achievableLoads: каждый вес собирается точно', () => {
  for (const target of achievableLoads({ barWeight: 20, plates: GYM })) {
    assert.equal(platesFor({ target, barWeight: 20, plates: GYM }).exact, true, String(target));
  }
});

test('achievableLoads: ошибки', () => {
  assert.throws(() => achievableLoads({ plates: [{ weight: 10, count: Infinity }] }), /нужен max/);
  assert.throws(() => achievableLoads({ barWeight: NaN }), /barWeight/);
  assert.throws(() => achievableLoads({ plates: GYM, max: NaN }), /invalid max/);
});
