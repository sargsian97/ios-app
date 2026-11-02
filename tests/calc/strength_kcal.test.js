import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strengthEstimate, exerciseKind, setWorkSec, STRENGTH_KCAL as K } from '../../web/src/domain/calc/index.js';
import { near } from './helpers.js';

const sets = (n, reps, extra = {}) => Array.from({ length: n }, () => Object.assign({ reps, done: true }, extra));
const bench = (n, reps, extra) => [{ name: 'Жим лёжа', sets: sets(n, reps, extra) }];

test('силовая: тип упражнения по названию', () => {
  assert.equal(exerciseKind('Присед со штангой'), 'legs');
  assert.equal(exerciseKind('Bench Press'), 'upper');
  assert.equal(exerciseKind('Сгибание рук на бицепс'), 'iso');
  assert.equal(exerciseKind('Планка'), 'core');
  assert.equal(exerciseKind('Что-то странное'), 'other');
  assert.equal(exerciseKind(null), 'other');
});

test('силовая: длительность подхода — по повторам, по времени, по таймеру', () => {
  assert.deepEqual(setWorkSec({ reps: 10 }), { sec: 54, timed: false });
  assert.deepEqual(setWorkSec({ timeSec: 60 }), { sec: 70, timed: false });
  assert.deepEqual(setWorkSec({}), { sec: 50, timed: false });
  assert.deepEqual(setWorkSec({ reps: 10, dur: 40 }), { sec: 40, timed: true }, 'таймер в пределах 0,5–2,5 оценки');
  assert.deepEqual(setWorkSec({ reps: 10, dur: 5 }), { sec: 54, timed: false }, 'слишком короткий замер отброшен');
  assert.deepEqual(setWorkSec({ reps: 10, dur: 400 }), { sec: 54, timed: false }, 'слишком длинный замер отброшен');
});

test('силовая: пустые данные и мало подходов — оценки нет', () => {
  assert.equal(strengthEstimate({}), null);
  assert.equal(strengthEstimate({ exercises: bench(2, 10), durationMin: 40 }), null, 'меньше 3 подходов');
  assert.equal(strengthEstimate({ exercises: bench(4, 10) }), null, 'без длительности и без таймеров отдыха');
  assert.equal(strengthEstimate({ exercises: bench(4, 10), avgHr: 130 }), null, 'пульс без длительности не считается');
  assert.equal(strengthEstimate({ exercises: [], durationMin: 40, avgHr: 60 }), null, 'пульс 60 — неправдоподобно низкий');
});

test('силовая: оценка по подходам (MET) — 4×10 жим лёжа за 40 минут', () => {
  const r = strengthEstimate({ exercises: bench(4, 10), durationMin: 40, weightKg: 80, base: 2000 });
  assert.equal(r.src, 'sets');
  assert.equal(r.done, 4);
  assert.equal(r.work, 216);
  assert.equal(r.rest, 2400 - 216);
  const f = 3.5 * 80 / 200 / 60;
  near(r.bySets, (4 * 216 + 1.5 * 2184) * f * 1.1, 1e-9);
  near(r.kcal, r.bySets, 1e-9);
  assert.equal(r.byHr, null);
  near(r.restKcal, 40 * 2000 / 1440, 1e-9);
});

test('силовая: по пульсу (Keytel) и среднее двух способов', () => {
  const r = strengthEstimate({ exercises: bench(4, 10), durationMin: 40, avgHr: 130, weightKg: 80, age: 30, base: 2000 });
  assert.equal(r.src, 'both');
  const perMin = (-55.0969 + 0.6309 * 130 + 0.1988 * 80 + 0.2017 * 30) / 4.184;
  near(r.hrGross, perMin * 40, 1e-9);
  near(r.byHr, (perMin - 2000 / 1440) * 40, 1e-9);
  near(r.kcal, (r.bySets + r.byHr) / 2, 1e-9);
  const only = strengthEstimate({ exercises: bench(1, 10), durationMin: 40, avgHr: 130, weightKg: 80, age: 30 });
  assert.equal(only.src, 'hr');
  near(only.kcal, only.byHr, 1e-9);
});

test('силовая: VO2max и пол меняют формулу пульса', () => {
  const base = { exercises: [], durationMin: 40, avgHr: 130, weightKg: 80, age: 30 };
  const m = strengthEstimate(base), f = strengthEstimate(Object.assign({}, base, { sex: 'female' }));
  const v = strengthEstimate(Object.assign({}, base, { vo2max: 45 }));
  assert.ok(f.kcal < m.kcal, 'женская формула даёт меньше');
  assert.equal(v.vo2, true);
  assert.equal(strengthEstimate(Object.assign({}, base, { vo2max: 5 })).vo2, false, 'VO2max вне диапазона не используется');
  assert.notEqual(Math.round(v.kcal), Math.round(m.kcal));
});

test('силовая: стороны «на каждую руку», подходы по таймеру, отдых по таймерам без длительности', () => {
  const two = strengthEstimate({ exercises: [{ name: 'Сгибание на бицепс на каждую руку', sets: sets(3, 10, { rest: 60 }) }], weightKg: 80 });
  const one = strengthEstimate({ exercises: [{ name: 'Сгибание на бицепс', sets: sets(3, 10, { rest: 60 }) }], weightKg: 80 });
  assert.equal(two.work, one.work * 2, 'оценка по повторам удваивается на стороны');
  assert.equal(one.rest, 180, 'отдых — сумма таймеров, когда длительности нет');
  const timed = strengthEstimate({ exercises: bench(3, 10, { dur: 45, rest: 90 }) });
  assert.equal(timed.timed, 3);
  assert.equal(timed.work, 135);
  const undone = strengthEstimate({ exercises: [{ name: 'Жим', sets: sets(3, 10).concat([{ done: false }]) }], durationMin: 30 });
  assert.equal(undone.done, 3, 'несделанный подход без данных не считается');
});

test('силовая: значения по умолчанию и версия', () => {
  const r = strengthEstimate({ exercises: bench(3, 8), durationMin: 30 });
  assert.ok(r.kcal > 0);
  near(r.restKcal, 30 * K.DEFAULT_BASE_KCAL / 1440, 1e-9);
  assert.throws(() => strengthEstimate({}, { version: 'v2' }), /версия/);
});
