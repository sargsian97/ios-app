import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyVolume, averagePerWeek } from '../../web/src/domain/calc/volume.js';
import { SECONDARY_MUSCLE_FACTOR } from '../../web/src/domain/calc/constants.js';

const EX = {
  bench: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
  pushdown: { primary: ['triceps'], secondary: [] },
  dip: { primary: ['chest', 'triceps'], secondary: ['triceps'] },
  pullup: { primary: ['lats'] }
};

const W = [
  {
    date: '2026-01-05',
    exercises: [
      {
        exerciseId: 'bench',
        sets: [
          { weight: 40, reps: 10, type: 'warmup' },
          { weight: 80, reps: 8 },
          { weight: 80, reps: 8, type: 'normal', done: true },
          { weight: 80, reps: 6, done: false }
        ]
      },
      { exerciseId: 'pushdown', sets: [{ weight: 30, reps: 12 }, { weight: 30, reps: 12 }] }
    ]
  },
  { date: '2026-01-08', exercises: [{ exerciseId: 'pullup', sets: [{ weight: null, reps: 10 }, { reps: 8 }] }] },
  { date: '2026-01-20', exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5 }] }] }
];

test('weeklyVolume: основные и вторичные мышцы, только рабочие подходы', () => {
  const f = SECONDARY_MUSCLE_FACTOR;
  const r = weeklyVolume(W, EX, { from: '2026-01-05', to: '2026-01-11' });
  assert.deepEqual(r.chest, { sets: 2, volume: 1280 });
  assert.deepEqual(r.front_delts, { sets: 2 * f, volume: 1280 * f });
  assert.deepEqual(r.triceps, { sets: 2 + 2 * f, volume: 720 + 1280 * f });
  assert.deepEqual(r.lats, { sets: 2, volume: 0 });
});

test('weeklyVolume: период включительно; без границ — всё', () => {
  assert.deepEqual(weeklyVolume(W, EX, { from: '2026-01-20', to: '2026-01-20' }).chest, { sets: 1, volume: 500 });
  assert.equal(weeklyVolume(W, EX).chest.sets, 3);
  assert.deepEqual(weeklyVolume(W, EX, { from: '2026-01-09', to: '2026-01-19' }), {});
});

test('weeklyVolume: коэффициент вторичных из параметров; мышца в обоих списках — как основная', () => {
  const r = weeklyVolume(W, EX, { from: '2026-01-05', to: '2026-01-05', secondaryFactor: 1 });
  assert.deepEqual(r.triceps, { sets: 4, volume: 2000 });
  const dip = weeklyVolume([{ date: '2026-01-05', exercises: [{ exerciseId: 'dip', sets: [{ weight: 10, reps: 10 }] }] }], EX);
  assert.deepEqual(dip, { chest: { sets: 1, volume: 100 }, triceps: { sets: 1, volume: 100 } });
});

test('weeklyVolume: пусто, неизвестное упражнение, ошибки', () => {
  assert.deepEqual(weeklyVolume([], EX), {});
  assert.deepEqual(weeklyVolume(undefined, EX), {});
  assert.deepEqual(weeklyVolume([{ date: '2026-01-05', exercises: [{ exerciseId: 'nope', sets: [{ weight: 10, reps: 10 }] }] }], EX), {});
  assert.deepEqual(weeklyVolume(W, {}), {});
  assert.throws(() => weeklyVolume(W, EX, { from: '2026-13-01' }), /invalid date/);
  assert.throws(() => weeklyVolume(W, EX, { secondaryFactor: -1 }), /secondaryFactor/);
});

test('averagePerWeek: делим на число недель периода', () => {
  const r = averagePerWeek(W, EX, { from: '2026-01-05', to: '2026-01-18' });
  assert.deepEqual(r.chest, { sets: 1, volume: 640 });
  assert.deepEqual(r.lats, { sets: 1, volume: 0 });
});

test('averagePerWeek: короткий период считается за неделю', () => {
  assert.deepEqual(averagePerWeek(W, EX, { from: '2026-01-05', to: '2026-01-06' }).chest, { sets: 2, volume: 1280 });
});

test('averagePerWeek: даты по тренировкам, если не заданы; пусто', () => {
  /* 05.01–20.01 = 16 дней */
  const r = averagePerWeek(W, EX);
  assert.deepEqual(r.chest, { sets: Math.round((3 / (16 / 7)) * 1e6) / 1e6, volume: Math.round((1780 / (16 / 7)) * 1e6) / 1e6 });
  assert.deepEqual(averagePerWeek([], EX), {});
  assert.deepEqual(averagePerWeek(W, EX, { from: '2026-01-10', to: '2026-01-05' }), {});
});
