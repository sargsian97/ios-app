import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, bestE1rm, repsAt, isWorkingSet } from '../../web/src/domain/calc/e1rm.js';
import { near } from './helpers.js';

test('e1rm: вес × (1 + (повторы + RIR) / 30)', () => {
  near(e1rm({ weight: 100, reps: 5 }), 100 * (1 + 5 / 30));
  near(e1rm({ weight: 100, reps: 5, rir: 2 }), 100 * (1 + 7 / 30));
  near(e1rm({ weight: 100, reps: 1 }), 100 * (1 + 1 / 30));
  near(e1rm({ weight: 60, reps: 10, rir: 1.5 }), 60 * (1 + 11.5 / 30));
});

test('e1rm: нулевые и неверные данные → 0', () => {
  assert.equal(e1rm({ weight: 100, reps: 0 }), 0);
  assert.equal(e1rm({ weight: 0, reps: 5 }), 0);
  assert.equal(e1rm({ weight: -100, reps: 5 }), 0);
  assert.equal(e1rm({ weight: 100, reps: -3 }), 0);
  assert.equal(e1rm({ weight: NaN, reps: 5 }), 0);
  assert.equal(e1rm({ weight: 100, reps: undefined }), 0);
  assert.equal(e1rm(), 0);
});

test('e1rm: отрицательный или пустой RIR считается нулём', () => {
  near(e1rm({ weight: 100, reps: 5, rir: -2 }), e1rm({ weight: 100, reps: 5 }));
  near(e1rm({ weight: 100, reps: 5, rir: null }), e1rm({ weight: 100, reps: 5 }));
  near(e1rm({ weight: 100, reps: 5, rir: NaN }), e1rm({ weight: 100, reps: 5 }));
});

test('e1rm: неизвестная версия — ошибка', () => {
  assert.throws(() => e1rm({ weight: 100, reps: 5 }, { version: 'v2' }), /unknown version: v2/);
  assert.throws(() => repsAt({ e1rm: 100, weight: 80 }, { version: 'v0' }), /unknown version/);
});

test('isWorkingSet: разминка и невыполненные не считаются', () => {
  assert.equal(isWorkingSet({ weight: 100, reps: 5 }), true);
  assert.equal(isWorkingSet({ weight: 100, reps: 5, type: 'normal', done: true }), true);
  assert.equal(isWorkingSet({ weight: 100, reps: 5, type: 'failure' }), true);
  assert.equal(isWorkingSet({ weight: 60, reps: 5, type: 'warmup' }), false);
  assert.equal(isWorkingSet({ weight: 100, reps: 5, done: false }), false);
  assert.equal(isWorkingSet(null), false);
});

test('bestE1rm: лучший по рабочим подходам', () => {
  const sets = [
    { weight: 60, reps: 10, type: 'warmup' },
    { weight: 100, reps: 5, rir: 1 },
    { weight: 90, reps: 10, rir: 0 },
    { weight: 200, reps: 5, done: false }
  ];
  near(bestE1rm(sets), 90 * (1 + 10 / 30));
});

test('bestE1rm: нет годных подходов — null', () => {
  assert.equal(bestE1rm([]), null);
  assert.equal(bestE1rm(undefined), null);
  assert.equal(bestE1rm([{ weight: 60, reps: 10, type: 'warmup' }, { weight: 0, reps: 0 }]), null);
});

test('repsAt: обратная задача без ошибки округления', () => {
  assert.equal(repsAt({ e1rm: e1rm({ weight: 100, reps: 10 }), weight: 100 }), 10);
  assert.equal(repsAt({ e1rm: e1rm({ weight: 100, reps: 10 }), weight: 100, rir: 2 }), 8);
  assert.equal(repsAt({ e1rm: e1rm({ weight: 72.5, reps: 7, rir: 3 }), weight: 72.5, rir: 3 }), 7);
  for (let reps = 1; reps <= 30; reps++) {
    for (const w of [20, 47.5, 61.25, 100, 142.5]) assert.equal(repsAt({ e1rm: e1rm({ weight: w, reps }), weight: w }), reps);
  }
});

test('repsAt: вниз до целого', () => {
  /* 30 × (100 / 80 − 1) = 7,5 */
  assert.equal(repsAt({ e1rm: 100, weight: 80 }), 7);
  assert.equal(repsAt({ e1rm: 100, weight: 80, rir: 1 }), 6);
});

test('repsAt: вес тяжелее e1rm и неверные данные → 0', () => {
  assert.equal(repsAt({ e1rm: 100, weight: 120 }), 0);
  assert.equal(repsAt({ e1rm: 100, weight: 100, rir: 2 }), 0);
  assert.equal(repsAt({ e1rm: 0, weight: 50 }), 0);
  assert.equal(repsAt({ e1rm: 100, weight: 0 }), 0);
  assert.equal(repsAt({ e1rm: NaN, weight: 50 }), 0);
  assert.equal(repsAt(), 0);
});
