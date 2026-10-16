import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSession, completeSet, uncompleteSet, nextPointer, finishSession, findRecords, workoutSummary, suggestPlan,
  pickAlternative, previousSets, restFor, targetFor, weekdayOf, cardioExerciseId, legacyCardioType, cardioPace, setVolume
} from '../web/src/domain/workout.js';

let n = 0;
const newId = () => 'id' + (++n);
const PROFILE = { rest: { compound: 150, isolation: 90, betweenSides: 15, afterWarmup: 60, betweenExercises: 120 } };
const CAT = {
  sq: { id: 'sq', name: 'Присед', type: 'compound', metrics: ['weight', 'reps'] },
  curl: { id: 'curl', name: 'Сгибание рук', type: 'isolation', metrics: ['weight', 'reps'] },
  ext: { id: 'ext', name: 'Разгибание рук', type: 'isolation', metrics: ['weight', 'reps'] },
  run: { id: 'run', name: 'Бег', type: 'cardio', category: 'cardio', metrics: ['time', 'distance'] }
};
const PLAN = { id: 'p1', name: 'День A', sections: [{ id: 'm', kind: 'main', items: [
  { id: 'i1', exerciseId: 'sq', sets: 3, repMin: 8, repMax: 10, weight: 60, rir: 2 },
  { id: 'i2', exerciseId: 'curl', sets: 2, repMin: 10, repMax: 12, group: 'A' },
  { id: 'i3', exerciseId: 'ext', sets: 2, repMin: 10, repMax: 12, group: 'A' }
] }] };
const T0 = '2026-10-16T10:00:00.000Z';
const at = (sec) => new Date(Date.parse(T0) + sec * 1000).toISOString();

test('сессия из шаблона: цели из шаблона, суперсет, курсор', () => {
  const s = buildSession({ plan: PLAN, catalog: CAT, logs: [], date: '2026-10-16', now: T0, newId, bodyweightKg: 80 });
  assert.equal(s.name, 'День A');
  assert.equal(s.exercises.length, 3);
  assert.equal(s.exercises[0].sets.length, 3);
  assert.deepEqual([s.exercises[0].sets[0].target.weight, s.exercises[0].sets[0].target.reps, s.exercises[0].sets[0].target.rir], [60, 10, 2]);
  assert.equal(s.exercises[1].groupKind, 'superset');
  assert.deepEqual(s.cursor, { ei: 0, si: 0 });
  assert.equal(s.bodyweightKg, 80);
});

test('цели: повтор прошлого раза, иначе шаблон', () => {
  const logs = [{ id: 'w1', date: '2026-10-14', exercises: [{ exerciseId: 'sq', sets: [{ weight: 65, reps: 9, done: true }, { weight: 65, reps: 8, done: true }] }] }];
  const s = buildSession({ plan: PLAN, catalog: CAT, logs, date: '2026-10-16', now: T0, newId });
  assert.deepEqual(s.exercises[0].sets.map((x) => [x.target.weight, x.target.reps]), [[65, 9], [65, 8], [65, 8]]);
  assert.deepEqual(targetFor({ repMin: 8, weight: 50 }, null), { weight: 50, reps: 8, rir: null, timeSec: null, distanceM: null, assist: null });
  assert.equal(previousSets(logs, 'sq').date, '2026-10-14');
  assert.equal(previousSets(logs, 'sq', { programId: 'other' }), null);
  assert.equal(previousSets(logs, 'curl'), null);
});

test('подход: заполняется из цели, отдых по типу упражнения, суперсет без отдыха', () => {
  let s = buildSession({ plan: PLAN, catalog: CAT, logs: [], date: '2026-10-16', now: T0, newId });
  s = completeSet(s, 0, 0, { now: at(60), catalog: CAT, profile: PROFILE });
  assert.deepEqual([s.exercises[0].sets[0].weight, s.exercises[0].sets[0].reps, s.exercises[0].sets[0].done], [60, 10, true]);
  assert.deepEqual(s.rest && [s.rest.targetSec, s.rest.kind], [150, 'set']);
  assert.deepEqual(s.cursor, { ei: 0, si: 1 });
  s = completeSet(s, 0, 1, { now: at(250), catalog: CAT, profile: PROFILE });
  assert.equal(s.exercises[0].sets[1].restSec, 190, 'фактический отдых');
  s = completeSet(s, 0, 2, { now: at(400), catalog: CAT, profile: PROFILE });
  assert.deepEqual([s.rest.targetSec, s.rest.kind], [120, 'exercise'], 'между упражнениями');
  assert.deepEqual(s.cursor, { ei: 1, si: 0 });
  s = completeSet(s, 1, 0, { now: at(600), catalog: CAT, profile: PROFILE });
  assert.equal(s.rest, null, 'внутри суперсета без отдыха');
  assert.deepEqual(s.cursor, { ei: 2, si: 0 });
  s = completeSet(s, 2, 0, { now: at(660), catalog: CAT, profile: PROFILE });
  assert.deepEqual([s.rest.targetSec, s.cursor], [90, { ei: 1, si: 1 }], 'после круга — отдых и снова первое');
  s = completeSet(s, 1, 1, { now: at(800), catalog: CAT, profile: PROFILE });
  s = completeSet(s, 2, 1, { now: at(860), catalog: CAT, profile: PROFILE });
  assert.equal(s.cursor, null);
  assert.equal(s.rest, null, 'всё сделано');
  s = uncompleteSet(s, 2, 1);
  assert.equal(s.exercises[2].sets[1].done, false);
});

test('отдых: разминка, свой для упражнения, между сторонами', () => {
  assert.equal(restFor({ exercise: CAT.sq, profile: PROFILE, set: { type: 'warmup' } }), 60);
  assert.equal(restFor({ exercise: CAT.sq, profile: PROFILE, config: { restSec: 200 }, set: { type: 'normal' } }), 200);
  assert.equal(restFor({ exercise: CAT.sq, profile: PROFILE, entry: { target: { restSec: 75 } }, set: {} }), 75);
  assert.equal(restFor({ exercise: CAT.sq, profile: PROFILE, kind: 'sides' }), 15);
  assert.equal(restFor({ exercise: CAT.run, profile: PROFILE, set: {} }), 0);
  const s = { exercises: [{ sets: [{ side: 'left', done: true }, { side: 'right', done: false }, { side: 'both', done: false }] }] };
  assert.deepEqual(nextPointer(s, 0, 0), { ei: 0, si: 1, kind: 'sides' });
});

test('завершение: только выполненные подходы, длительность, итоги', () => {
  let s = buildSession({ plan: PLAN, catalog: CAT, logs: [], date: '2026-10-16', now: T0, newId });
  s = completeSet(s, 0, 0, { now: at(60), catalog: CAT, profile: PROFILE });
  s = completeSet(s, 0, 1, { now: at(240), catalog: CAT, profile: PROFILE });
  const w = finishSession(s, { now: at(3600) });
  assert.equal(w.exercises.length, 1);
  assert.equal(w.exercises[0].sets.length, 2);
  assert.equal(w.durationSec, 3600);
  const sum = workoutSummary(w);
  assert.deepEqual([sum.exercises, sum.sets, sum.reps, sum.volumeKg], [1, 2, 20, 1200]);
});

test('рекорды: e1RM и вес растут, первое выполнение — не рекорд', () => {
  const hist = [{ id: 'a', date: '2026-10-10', exercises: [{ exerciseId: 'sq', sets: [{ weight: 60, reps: 10, done: true }] }] }];
  const w = { id: 'b', date: '2026-10-16', exercises: [
    { exerciseId: 'sq', sets: [{ weight: 65, reps: 10, done: true }, { type: 'warmup', weight: 100, reps: 1, done: true }] },
    { exerciseId: 'curl', sets: [{ weight: 15, reps: 12, done: true }] }
  ] };
  const r = findRecords(w, hist);
  assert.deepEqual(r.map((x) => x.kind).sort(), ['e1rm', 'weight']);
  assert.equal(r.find((x) => x.kind === 'weight').value, 65, 'разминка не считается');
  assert.deepEqual(findRecords({ id: 'c', date: '2026-10-16', exercises: [{ exerciseId: 'sq', sets: [{ weight: 50, reps: 5, done: true }] }] }, hist), []);
  const bw = findRecords({ id: 'd', date: '2026-10-17', exercises: [{ exerciseId: 'pu', sets: [{ reps: 12, done: true }] }] }, [{ id: 'e', date: '2026-10-01', exercises: [{ exerciseId: 'pu', sets: [{ reps: 10, done: true }] }] }]);
  assert.deepEqual(bw.map((x) => [x.kind, x.value, x.prev]), [['reps', 12, 10]]);
});

test('варианты упражнения чередуются', () => {
  const item = { exerciseId: 'a', alternatives: ['a', 'b'] };
  assert.equal(pickAlternative(item, []), 'a');
  assert.equal(pickAlternative(item, [{ id: 'w', date: '2026-10-10', exercises: [{ exerciseId: 'a', sets: [{ done: true }] }] }]), 'b');
  assert.equal(pickAlternative({ exerciseId: 'x' }, []), 'x');
});

test('тренировка на сегодня: по расписанию, пропущенная, следующая, по кругу', () => {
  const A = { id: 'A', weekday: 0 }, B = { id: 'B', weekday: 2 }, C = { id: 'C', weekday: 4 };
  assert.equal(weekdayOf('2026-10-12'), 0, 'понедельник');
  assert.equal(suggestPlan([A, B, C], [], '2026-10-14').why, 'today');
  const logs = [{ date: '2026-10-12', planId: 'A' }];
  assert.deepEqual(['why', 'date'].map((k) => suggestPlan([A, B, C], logs, '2026-10-15')[k]), ['missed', '2026-10-14']);
  const s2 = suggestPlan([A, B, C], logs.concat([{ date: '2026-10-14', planId: 'B' }]), '2026-10-15');
  assert.deepEqual([s2.plan.id, s2.why, s2.date], ['C', 'next', '2026-10-16']);
  const free = [{ id: 'X' }, { id: 'Y' }];
  assert.equal(suggestPlan(free, [{ date: '2026-10-01', planId: 'X' }], '2026-10-15').plan.id, 'Y');
  assert.equal(suggestPlan([], [], '2026-10-15'), null);
});

test('кардио журнала ↔ справочник', () => {
  assert.equal(cardioExerciseId('treadmill', 5), 'fe-Walking_Treadmill');
  assert.equal(cardioExerciseId('treadmill', 9), 'fe-Running_Treadmill');
  assert.equal(cardioExerciseId('other'), 'cardio-other');
  assert.equal(legacyCardioType('fe-Running_Treadmill'), 'treadmill');
  assert.equal(legacyCardioType('fe-Elliptical_Trainer'), 'elliptical');
  assert.equal(legacyCardioType('xyz'), 'other');
  assert.deepEqual(cardioPace({ timeSec: 3600, distanceM: 5000 }, {}), { min: 60, km: 5, speedKmh: 5 });
  assert.deepEqual(cardioPace({ timeSec: 1800 }, { speedKmh: 6 }), { min: 30, km: 3, speedKmh: 6 });
});

test('объём подхода с весом тела и помощью', () => {
  assert.equal(setVolume({ weight: 20, reps: 10 }), 200);
  assert.equal(setVolume({ reps: 10 }, { bodyweightKg: 80, bodyweightShare: 1 }), 800);
  assert.equal(setVolume({ assist: 30, reps: 10 }, { bodyweightKg: 80, bodyweightShare: 1 }), 500);
  assert.equal(setVolume({ weight: 20, reps: null }), 0);
});
