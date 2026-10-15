import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundToAvailable, stepUp, nextSetTarget } from '../../web/src/domain/calc/progression.js';
import { FATIGUE_MAX_SHARE, FATIGUE_PER_SET } from '../../web/src/domain/calc/constants.js';

const LIST = [20, 30, 40, 50, 60];
const GRID = { step: 2.5, min: 20 };

test('roundToAvailable: массив весов — nearest, down, up', () => {
  assert.equal(roundToAvailable(44, LIST), 40);
  assert.equal(roundToAvailable(46, LIST), 50);
  assert.equal(roundToAvailable(45, LIST), 40); /* равенство — вниз */
  assert.equal(roundToAvailable(49, LIST, { mode: 'down' }), 40);
  assert.equal(roundToAvailable(41, LIST, { mode: 'up' }), 50);
  assert.equal(roundToAvailable(40, LIST, { mode: 'up' }), 40);
  assert.equal(roundToAvailable(40, LIST, { mode: 'down' }), 40);
  assert.equal(roundToAvailable(39.9999999999, LIST, { mode: 'down' }), 40);
});

test('roundToAvailable: за пределами — ближайший край, порядок массива не важен', () => {
  assert.equal(roundToAvailable(5, LIST, { mode: 'down' }), 20);
  assert.equal(roundToAvailable(5, LIST), 20);
  assert.equal(roundToAvailable(100, LIST, { mode: 'up' }), 60);
  assert.equal(roundToAvailable(44, [60, 20, 40, NaN, 30]), 40);
  assert.equal(roundToAvailable(-10, LIST), 20);
});

test('roundToAvailable: шаг от минимума', () => {
  assert.equal(roundToAvailable(71, GRID), 70);
  assert.equal(roundToAvailable(71.25, GRID), 70); /* равенство — вниз */
  assert.equal(roundToAvailable(71.3, GRID), 72.5);
  assert.equal(roundToAvailable(72.4, GRID, { mode: 'down' }), 70);
  assert.equal(roundToAvailable(70.1, GRID, { mode: 'up' }), 72.5);
  assert.equal(roundToAvailable(10, GRID, { mode: 'down' }), 20);
  assert.equal(roundToAvailable(60, { step: 2.5, min: 20, max: 51 }), 50);
  assert.equal(roundToAvailable(0.3, { step: 0.1 }), 0.3);
  assert.equal(roundToAvailable(0.7, { step: 0.1 }, { mode: 'down' }), 0.7);
  assert.equal(roundToAvailable(13, { step: 5 }), 15);
});

test('roundToAvailable: без ограничений — как есть; ошибки', () => {
  assert.equal(roundToAvailable(71.3, undefined), 71.3);
  assert.equal(roundToAvailable(71.3, null), 71.3);
  assert.throws(() => roundToAvailable(NaN, LIST), /invalid weight/);
  assert.throws(() => roundToAvailable(50, []), /нет доступных/);
  assert.throws(() => roundToAvailable(50, { step: 0 }), /invalid step/);
  assert.throws(() => roundToAvailable(50, { step: 2.5, min: 20, max: 10 }), /invalid max/);
  assert.throws(() => roundToAvailable(50, LIST, { mode: 'ceil' }), /unknown mode/);
});

test('stepUp: следующий доступный вес', () => {
  assert.equal(stepUp(40, LIST), 50);
  assert.equal(stepUp(41, LIST), 50);
  assert.equal(stepUp(60, LIST), null);
  assert.equal(stepUp(70, GRID), 72.5);
  assert.equal(stepUp(71, GRID), 72.5);
  assert.equal(stepUp(5, GRID), 20);
  assert.equal(stepUp(50, { step: 2.5, min: 20, max: 50 }), null);
});

test('nextSetTarget: нет истории — null', () => {
  assert.equal(nextSetTarget({ sets: [], repRange: [8, 12] }), null);
  assert.equal(nextSetTarget({ repRange: [8, 12] }), null);
  assert.equal(nextSetTarget({ sets: [{ weight: 40, reps: 10, type: 'warmup' }, { weight: 0, reps: 0 }], repRange: [8, 12] }), null);
});

test('nextSetTarget: самый тяжёлый доступный вес в диапазоне', () => {
  /* e1RM = 70 × (1 + 12/30) = 98; 98 / (1 + 10/30) = 73,5 → 72,5 × 8 */
  const r = nextSetTarget({ sets: [{ weight: 70, reps: 10, rir: 2 }], repRange: [8, 12], targetRir: 2 });
  assert.deepEqual(r, { weight: 72.5, reps: 8, rir: 2, expanded: false, reason: 'in_range' });
});

test('nextSetTarget: в расчёт идут рабочие подходы, лучший e1RM', () => {
  const sets = [
    { weight: 50, reps: 10, type: 'warmup' },
    { weight: 70, reps: 10, rir: 2 },
    { weight: 65, reps: 10, rir: 2 },
    { weight: 120, reps: 10, rir: 0, done: false }
  ];
  assert.equal(nextSetTarget({ sets, repRange: [8, 12], targetRir: 2 }).weight, 72.5);
});

test('nextSetTarget: поправка на усталость за прошлые подходы, с потолком', () => {
  const p = { sets: [{ weight: 100, reps: 8, rir: 2 }], repRange: [6, 10], targetRir: 2, available: { step: 1.25, min: 20 } };
  const w = [0, 1, 2, 3].map((setIndex) => nextSetTarget({ ...p, setIndex }).weight);
  for (let i = 1; i < w.length; i++) assert.ok(w[i] <= w[i - 1]);
  assert.ok(w[3] < w[0]);
  const capAt = Math.ceil(FATIGUE_MAX_SHARE / FATIGUE_PER_SET);
  assert.deepEqual(nextSetTarget({ ...p, setIndex: capAt + 5 }), nextSetTarget({ ...p, setIndex: capAt }));
});

test('nextSetTarget: предпочитать вес прошлого подхода', () => {
  const sets = [{ weight: 70, reps: 10, rir: 2 }];
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 12], targetRir: 2, preferPrevWeight: true }), {
    weight: 70, reps: 10, rir: 2, expanded: false, reason: 'prev_weight'
  });
  /* прошлого веса нет в этом зале — обычный расчёт */
  assert.equal(nextSetTarget({ sets: [{ weight: 71, reps: 10, rir: 2 }], repRange: [8, 12], targetRir: 2, preferPrevWeight: true }).reason, 'in_range');
  /* прошлый вес уже вне диапазона — обычный расчёт */
  assert.equal(nextSetTarget({ sets: [{ weight: 50, reps: 20, rir: 2 }], repRange: [8, 12], targetRir: 2, preferPrevWeight: true }).reason, 'in_range');
});

test('nextSetTarget: в диапазон не попасть — линейная прогрессия', () => {
  /* e1RM = 60 × (1 + 20/30) = 100: с 60 выходит 18, с 80 — 5 повторов, диапазон 8–10 */
  const sets = [{ weight: 60, reps: 18, rir: 2 }];
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 10], targetRir: 2, available: [60, 80] }), {
    weight: 80, reps: 8, rir: 2, expanded: false, reason: 'linear_progression'
  });
  /* крупный шаг: 70 → 10 повторов, 80 → 5, диапазон 8–9; +1 шаг от 60 */
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 9], targetRir: 2, available: { step: 10, min: 20 } }), {
    weight: 70, reps: 9, rir: 2, expanded: false, reason: 'linear_progression'
  });
});

test('nextSetTarget: expandRange — ближайший выход за диапазон', () => {
  const sets = [{ weight: 60, reps: 18, rir: 2 }];
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 10], targetRir: 2, available: [60, 80], expandRange: true }), {
    weight: 80, reps: 5, rir: 2, expanded: true, reason: 'expanded_below_range'
  });
  /* 70 → 10 повторов (на 2 выше 6–8), 90 → 1 (на 5 ниже) */
  assert.deepEqual(nextSetTarget({ sets, repRange: [6, 8], targetRir: 2, available: [70, 90], expandRange: true }), {
    weight: 70, reps: 10, rir: 2, expanded: true, reason: 'expanded_above_range'
  });
});

test('nextSetTarget: цель легче грифа — самый лёгкий вес', () => {
  /* e1RM = 20 × (1 + 5/30) ≈ 23,3; цель ≈ 17,5 < 20 */
  assert.deepEqual(nextSetTarget({ sets: [{ weight: 20, reps: 5 }], repRange: [8, 12], targetRir: 2, available: GRID }), {
    weight: 20, reps: 3, rir: 2, expanded: true, reason: 'lightest_too_heavy'
  });
  const tooHeavy = nextSetTarget({ sets: [{ weight: 10, reps: 1 }], repRange: [8, 12], targetRir: 2, available: GRID });
  assert.deepEqual([tooHeavy.weight, tooHeavy.reps], [20, 1]);
});

test('nextSetTarget: тяжелее веса в зале нет', () => {
  const sets = [{ weight: 100, reps: 10, rir: 2 }];
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 12], targetRir: 2, available: [40, 50, 60] }), {
    weight: 60, reps: 12, rir: 2, expanded: false, reason: 'at_max_available'
  });
  assert.deepEqual(nextSetTarget({ sets, repRange: [8, 12], targetRir: 2, available: [40, 50, 60], expandRange: true }), {
    weight: 60, reps: 38, rir: 2, expanded: true, reason: 'expanded_above_range'
  });
  /* в диапазон не попасть, а прошлый вес уже самый тяжёлый: остаёмся на нём, повторы прижаты к диапазону */
  assert.deepEqual(nextSetTarget({ sets: [{ weight: 60, reps: 18, rir: 2 }, { weight: 80, reps: 3 }], repRange: [8, 10], targetRir: 2, available: [60, 80] }), {
    weight: 80, reps: 8, rir: 2, expanded: false, reason: 'at_max_available'
  });
});

test('nextSetTarget: без зала — шаг 2,5 кг; RIR по умолчанию', () => {
  const r = nextSetTarget({ sets: [{ weight: 83, reps: 7, rir: 1 }], repRange: [5, 8] });
  assert.equal(r.weight % 2.5, 0);
  assert.equal(r.rir, 2);
  assert.ok(r.reps >= 5 && r.reps <= 8);
});

test('nextSetTarget: ошибки', () => {
  const sets = [{ weight: 70, reps: 10 }];
  for (const repRange of [undefined, [8], [12, 8], [0, 5], [8.5, 12], 'x']) {
    assert.throws(() => nextSetTarget({ sets, repRange }), /invalid repRange/);
  }
  assert.throws(() => nextSetTarget({ sets, repRange: [8, 12], targetRir: -1 }), /invalid targetRir/);
  assert.throws(() => nextSetTarget({ sets, repRange: [8, 12], setIndex: -1 }), /invalid setIndex/);
  assert.throws(() => nextSetTarget({ sets, repRange: [8, 12], version: 'v2' }), /unknown version: v2/);
});
