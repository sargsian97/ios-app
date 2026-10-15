import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warmupSets, needsWarmup } from '../../web/src/domain/calc/warmup.js';
import { WARMUP_MIN_WORKING_WEIGHT, WARMUP_SCHEMES } from '../../web/src/domain/calc/constants.js';

test('warmupSets: схема по умолчанию', () => {
  assert.deepEqual(warmupSets({ workingWeight: 100 }), [
    { weight: 40, reps: 8, pct: 0.4 },
    { weight: 60, reps: 5, pct: 0.6 },
    { weight: 80, reps: 3, pct: 0.8 }
  ]);
});

test('warmupSets: вес округляется вниз, не легче грифа, без повторов', () => {
  /* 40 % от 32,5 = 13 → гриф 20; 60 % = 19,5 → тоже гриф (повтор); 80 % = 26 → 25 */
  assert.deepEqual(warmupSets({ workingWeight: 32.5 }), [
    { weight: 20, reps: 8, pct: 0.62 },
    { weight: 25, reps: 3, pct: 0.77 }
  ]);
  assert.deepEqual(warmupSets({ workingWeight: 101 }).map((s) => s.weight), [40, 60, 80]);
});

test('warmupSets: никогда не тяжелее и не равен рабочему', () => {
  for (let w = WARMUP_MIN_WORKING_WEIGHT; w <= 200; w += 1.25) {
    for (const scheme of Object.keys(WARMUP_SCHEMES)) {
      const sets = warmupSets({ workingWeight: w, scheme });
      const ws = sets.map((s) => s.weight);
      assert.ok(ws.every((x) => x < w && x >= 20), `${w}: ${ws}`);
      assert.equal(new Set(ws).size, ws.length);
      for (let i = 1; i < ws.length; i++) assert.ok(ws[i] > ws[i - 1]);
    }
  }
});

test('warmupSets: малый рабочий вес — разминки нет', () => {
  assert.deepEqual(warmupSets({ workingWeight: WARMUP_MIN_WORKING_WEIGHT - 0.5 }), []);
  assert.deepEqual(warmupSets({ workingWeight: 0 }), []);
  assert.deepEqual(warmupSets({ workingWeight: -10 }), []);
  /* рабочий вес не тяжелее грифа — легче грифа разминку не собрать */
  assert.deepEqual(warmupSets({ workingWeight: 30, barWeight: 30 }), []);
});

test('warmupSets: доступные веса из зала', () => {
  const available = [20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.deepEqual(warmupSets({ workingWeight: 95, available }).map((s) => s.weight), [30, 50, 70]);
  assert.deepEqual(warmupSets({ workingWeight: 30, available: { step: 10, min: 20 } }), [{ weight: 20, reps: 8, pct: 0.67 }]);
});

test('warmupSets: гантели (гриф 0)', () => {
  const dumbbells = [2, 4, 6, 8, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35];
  assert.deepEqual(warmupSets({ workingWeight: 35, barWeight: 0, available: dumbbells }).map((s) => s.weight), [12.5, 20, 27.5]);
});

test('warmupSets: другие схемы', () => {
  assert.equal(warmupSets({ workingWeight: 140, scheme: 'short' }).length, WARMUP_SCHEMES.short.length);
  assert.deepEqual(warmupSets({ workingWeight: 140, scheme: 'long' }).map((s) => s.weight), [55, 75, 97.5, 117.5]);
});

test('warmupSets: ошибки', () => {
  assert.throws(() => warmupSets({ workingWeight: NaN }), /workingWeight/);
  assert.throws(() => warmupSets({}), /workingWeight/);
  assert.throws(() => warmupSets({ workingWeight: 100, scheme: 'pyramid' }), /unknown scheme/);
  assert.throws(() => warmupSets({ workingWeight: 100, barWeight: -1 }), /barWeight/);
});

test('needsWarmup: только если основная мышца ещё не работала', () => {
  assert.equal(needsWarmup({ primaryMuscles: ['chest'], workedMuscles: [] }), true);
  assert.equal(needsWarmup({ primaryMuscles: ['chest'], workedMuscles: ['chest', 'triceps'] }), false);
  assert.equal(needsWarmup({ primaryMuscles: ['chest', 'triceps'], workedMuscles: ['triceps'] }), true);
  assert.equal(needsWarmup({ primaryMuscles: ['quads'], workedMuscles: new Set(['quads']) }), false);
  assert.equal(needsWarmup({ primaryMuscles: ['chest'], workedMuscles: ['chest'], onlyIfNotWorked: false }), true);
  assert.equal(needsWarmup({ primaryMuscles: [], workedMuscles: ['chest'] }), true);
  assert.equal(needsWarmup({ primaryMuscles: ['chest'] }), true);
  assert.equal(needsWarmup(), true);
});
