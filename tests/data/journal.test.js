import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { workoutsBetween, stepsOn, weekStart, addDays } from '../../web/src/data/journal.js';

const data = {
  workoutLogs: {
    a: { id: 'a', date: '2026-10-13', exercises: [{ id: 'e', exerciseId: 'x', sets: [{ id: 's', reps: 10, done: true }] }] },
    b: { id: 'b', date: '2026-10-14', exercises: [] }
  },
  stepsEntries: { '2026-10-15': { id: '2026-10-15', date: '2026-10-15', steps: 9000 } }
};

test('journal: тренировки, шаги, недели', async () => {
  const s = await createStore(memoryBackend(data));
  assert.equal(workoutsBetween(s, '2026-10-13', '2026-10-19').length, 1);
  assert.equal(stepsOn(s, '2026-10-15'), 9000);
  assert.equal(stepsOn(s, '2026-10-14'), null);
  assert.equal(weekStart('2026-10-15'), '2026-10-12');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
});

test('journal: тренировки, кардио и шаги новой модели в формате журнала', async () => {
  const { strengthByDate, daysByDate } = await import('../../web/src/data/journal.js');
  const s = await createStore(memoryBackend({
    workoutLogs: {
      w1: { id: 'w1', date: '2026-10-12', planId: 'legacy-B', durationSec: 5460, notes: 'ок', stats: { avgHr: 119, kcalWatch: 743, steps: 3000, kcal: 450 },
        exercises: [{ id: 'e0', exerciseId: 'lx-1', name: 'Присед', sets: [{ id: 's0', weight: 70, reps: 12, done: true, durSec: 40, restSec: 90 }] },
          { id: 'e1', exerciseId: 'lx-2', name: 'Планка', sets: [{ id: 's0', timeSec: 60, done: true }] }] },
      c1: { id: 'c1', date: '2026-10-11', exercises: [{ id: 'c0', exerciseId: 'fe-Walking_Treadmill', sets: [{ id: 's0', timeSec: 6000, distanceM: 8330, done: true }],
        cardio: { speedKmh: 5, inclinePct: 5, avgHr: 107, maxHr: 125, kcalWatch: 677, steps: 10781, inSteps: true } }] }
    },
    stepsEntries: { '2026-10-11': { id: '2026-10-11', date: '2026-10-11', steps: 15000 } },
    foodEntries: { f: { id: 'f', date: '2026-10-09', time: '12:00', nutrients: { kcal: 100 } } }
  }));
  const w = strengthByDate(s)['2026-10-12'];
  assert.equal(w.day, 'B');
  assert.deepEqual(w.exercises[0], { name: 'Присед', sets: [{ w: 70, r: 12, t: '', done: true, dur: 40, rest: 90 }] });
  assert.equal(w.exercises[1].sets[0].t, 60, 'время подхода — отдельным полем');
  assert.equal(w.exercises[1].sets[0].r, 60, 'время планки — как в журнале');
  assert.deepEqual([w.durationMin, w.avgHr, w.kcalWatch, w.gymSteps, w.note], [91, 119, 743, 3000, 'ок']);
  assert.equal(strengthByDate(s)['2026-10-11'], undefined, 'кардио — не силовая');
  const d = daysByDate(s, '2026-10-13');
  assert.equal(d['2026-10-12'].lifted, true);
  assert.equal(d['2026-10-12'].trainKcal, 450);
  assert.equal(d['2026-10-11'].lifted, false);
  assert.equal(d['2026-10-11'].steps, 15000);
  assert.equal(d['2026-10-11'].cardioOn, true);
  assert.deepEqual([d['2026-10-11'].cardio[0].type, d['2026-10-11'].cardio[0].minutes, d['2026-10-11'].cardio[0].km, d['2026-10-11'].cardio[0].speed], ['treadmill', 100, 8.33, 5]);
  assert.equal(d['2026-10-10'].lifted, false, 'прошедший день без тренировки');
  assert.equal(d['2026-10-13'].lifted, false, 'сегодня без записи — силовой нет (расписание не считается)');
  assert.equal(daysByDate(await createStore(memoryBackend({})), '2026-10-13')['2026-10-13'].lifted, false, 'и без данных вообще');
  assert.deepEqual([w.maxHr, w.vo2max], ['', ''], 'нет данных с часов — пусто');
});
