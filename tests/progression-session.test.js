/* Умная прогрессия в тренировке: цели по прошлому разу, пересчёт по ходу, расширение диапазона, веса зала. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smartTarget, repRangeOf, progressable, exerciseEntry, completeSet, buildSession } from '../web/src/domain/workout.js';
import { progressionFor, GYM_TEMPLATES } from '../web/src/domain/gym.js';

const bench = { id: 'bench', name: 'Жим', type: 'compound', metrics: ['weight', 'reps'], equipment: ['barbell'] };
const item = { id: 'i1', exerciseId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2 };
const prog = { enabled: true, available: { step: 2.5, min: 20 } };
const hist = [{ type: 'normal', weight: 80, reps: 8, rir: 2, done: true }];
let n = 0;
const newId = () => 'x' + (++n);

test('диапазон повторов и подходящие упражнения', () => {
  assert.deepEqual(repRangeOf({ repMin: 6, repMax: 10 }), [6, 10]);
  assert.deepEqual(repRangeOf({ repMax: 8 }), [8, 8]);
  assert.equal(repRangeOf({}), null);
  assert.equal(progressable(bench), true);
  assert.equal(progressable({ type: 'cardio', metrics: ['time', 'distance'] }), false);
  assert.equal(progressable({ metrics: ['weight', 'reps', 'assist'] }), false);
});

test('цель по прошлому разу: в диапазоне, вес кратен шагу, усталость снижает поздние подходы', () => {
  const a = smartTarget({ item, exercise: bench, history: hist, index: 0, progression: prog });
  assert.ok(a.reps >= 6 && a.reps <= 10, JSON.stringify(a));
  assert.equal((a.weight - 20) % 2.5, 0);
  assert.equal(a.rir, 2);
  const c = smartTarget({ item, exercise: bench, history: hist, index: 2, progression: prog });
  assert.ok(c.weight <= a.weight);
});

test('нет истории, нет диапазона, выключено — null (остаётся старая цель)', () => {
  assert.equal(smartTarget({ item, exercise: bench, history: [], progression: prog }), null);
  assert.equal(smartTarget({ item: { sets: 3 }, exercise: bench, history: hist, progression: prog }), null);
  assert.equal(smartTarget({ item, exercise: bench, history: hist, progression: { enabled: false } }), null);
  assert.equal(smartTarget({ item, exercise: bench, history: [{ weight: 0, reps: 10, done: true }], progression: prog }), null, 'нулевой вес');
});

test('сессия строится с умными целями; без истории — цель из шаблона', () => {
  const e = exerciseEntry({ exercise: bench, item, prev: { sets: hist }, newId, progression: prog });
  assert.equal(e.sets.length, 3);
  assert.ok(e.sets.every((s) => s.target.weight != null && s.target.reason));
  const e2 = exerciseEntry({ exercise: bench, item, prev: null, newId, progression: prog });
  assert.equal(e2.sets[0].target.reps, 10);
  assert.equal(e2.sets[0].target.weight, null);
});

test('после тяжёлого подхода цели следующих пересчитываются, введённые руками — нет', () => {
  const plan = { id: 'p', sections: [{ kind: 'main', items: [item] }] };
  const logs = [{ id: 'w', date: '2026-10-01', exercises: [{ exerciseId: 'bench', sets: hist }] }];
  let s = buildSession({ plan, catalog: { bench }, logs, date: '2026-10-08', now: '2026-10-08T10:00:00Z', newId, progression: prog });
  const before = s.exercises[0].sets[1].target.weight;
  s.exercises[0].sets[0] = Object.assign({}, s.exercises[0].sets[0], { weight: 90, reps: 10, rir: 2 });
  s.exercises[0].sets[2] = Object.assign({}, s.exercises[0].sets[2], { weight: 70 });
  s = completeSet(s, 0, 0, { now: '2026-10-08T10:02:00Z', catalog: { bench }, progression: prog });
  assert.ok(s.exercises[0].sets[1].target.weight > before, 'подход оказался легче — цель выросла');
  assert.equal(s.exercises[0].sets[2].weight, 70, 'введённое не трогаем');
});

test('крупный шаг веса: расширение диапазона помечено expanded', () => {
  const r = smartTarget({ item: { repMin: 8, repMax: 8, rir: 2 }, exercise: bench, history: [{ weight: 60, reps: 8, rir: 2, done: true }], progression: { enabled: true, available: [20, 50, 70], expandRange: true } });
  assert.equal(r.expanded, true);
  assert.ok(['expanded_below_range', 'expanded_above_range'].includes(r.reason));
});

test('веса зала идут в прогрессию', () => {
  const gym = Object.assign({ id: 'g' }, GYM_TEMPLATES.commercial ? JSON.parse(JSON.stringify(GYM_TEMPLATES.commercial)) : {});
  const p = progressionFor({ smartProgression: true }, gym, {});
  assert.equal(p.enabled, true);
  const loads = p.loadsFor(bench);
  assert.ok(Array.isArray(loads) && loads.length > 5);
  assert.equal(progressionFor({ smartProgression: false }, gym).enabled, false);
});

import { volumeLevel, muscleContributors, averagePerWeek } from '../web/src/domain/calc/index.js';

test('уровни: пороги подходов в неделю и вклад упражнений', () => {
  assert.equal(volumeLevel(0), 0);
  assert.equal(volumeLevel(1), 1);
  assert.equal(volumeLevel(9.9), 2);
  assert.equal(volumeLevel(10), 3);
  assert.equal(volumeLevel(25), 4);
  assert.throws(() => volumeLevel(-1));
  const ex = { b: { primary: ['chest'], secondary: ['triceps'] }, d: { primary: ['triceps'], secondary: [] } };
  const W = (date, id, n) => ({ date, exercises: [{ exerciseId: id, sets: Array.from({ length: n }, () => ({ type: 'normal', weight: 50, reps: 8, done: true })).concat([{ type: 'warmup', done: true }]) }] });
  const ws = [W('2026-10-01', 'b', 4), W('2026-10-03', 'd', 3), W('2026-10-08', 'b', 4)];
  const c = muscleContributors(ws, ex, 'triceps', { from: '2026-10-01', to: '2026-10-14' });
  assert.deepEqual(c, [{ exerciseId: 'b', sets: 2 }, { exerciseId: 'd', sets: 1.5 }]);
  assert.deepEqual(muscleContributors([], ex, 'chest'), []);
  assert.equal(averagePerWeek(ws, ex, { from: '2026-10-01', to: '2026-10-14' }).triceps.sets, 3.5);
});

test('при сборке каждый подход не тяжелее предыдущего', () => {
  const e = exerciseEntry({ exercise: bench, item: { id: 'i', sets: 3, repMin: 12, repMax: 12, rir: 2 }, prev: { sets: [{ type: 'normal', weight: 60, reps: 12, rir: 2, done: true }] }, newId, progression: { enabled: true, available: { step: 2.5, min: 0 } } });
  const w = e.sets.map((s) => s.target.weight);
  assert.ok(w[1] <= w[0] && w[2] <= w[1], JSON.stringify(w));
});
