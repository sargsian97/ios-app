import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCheckinDate, checkinDue, checkinModules } from '../web/src/domain/checkin.js';

test('следующий чек-ин: выбранный день, не раньше чем через 4 дня', () => {
  /* 2026-10-16 — пятница; понедельник = 0 */
  assert.equal(nextCheckinDate('2026-10-16', 0), '2026-10-26', 'пн через 3 дня — слишком рано, следующий пн');
  assert.equal(nextCheckinDate('2026-10-12', 0), '2026-10-19');
  assert.equal(nextCheckinDate('2026-10-16', 2), '2026-10-21');
});

test('чек-ин положен', () => {
  assert.deepEqual(checkinDue({ programStart: '2026-10-12', weekday: 0, today: '2026-10-18' }), { due: false, next: '2026-10-19' });
  assert.equal(checkinDue({ programStart: '2026-10-12', weekday: 0, today: '2026-10-19' }).due, true);
  assert.equal(checkinDue({ programStart: '2026-10-12', weekday: 0, today: '2026-10-25' }).due, true, 'пропущенный чек-ин всё ещё положен');
  assert.equal(checkinDue({ lastCheckin: '2026-10-19', programStart: '2026-10-12', weekday: 0, today: '2026-10-22' }).due, false);
  assert.equal(checkinDue({ weekday: 0, today: '2026-10-22' }).due, false, 'без программы чек-ина нет');
});

const days = [
  { date: '2026-10-12', kcal: 2300, logged: true }, { date: '2026-10-13', kcal: 2400, logged: true },
  { date: '2026-10-14', kcal: 700, logged: true }, { date: '2026-10-15', kcal: 2350, logged: true },
  { date: '2026-10-16', kcal: 0, logged: false }, { date: '2026-10-17', kcal: 2200, logged: true }, { date: '2026-10-18', kcal: 2500, logged: true }
];

test('модули по данным недели', () => {
  const r = checkinModules({ days, scaleEntries: [{ date: '2026-10-18' }], today: '2026-10-19' });
  assert.equal(r.from, '2026-10-12');
  assert.equal(r.to, '2026-10-18');
  assert.deepEqual(r.modules.map((m) => m.id), ['intro', 'weighin', 'partial', 'fasting', 'program']);
  assert.equal(r.modules[1].stale, false);
  assert.deepEqual(r.modules[2].dates, ['2026-10-14']);
  assert.deepEqual(r.modules[3].dates, ['2026-10-16']);
});

test('модули: выключенные, введение показано, давнее взвешивание, перерыв', () => {
  const r = checkinModules({ days: days.slice(0, 2), scaleEntries: [{ date: '2026-10-01' }], today: '2026-10-19', seenIntro: true, enabled: { partial: false } });
  assert.deepEqual(r.modules.map((m) => m.id), ['weighin', 'fasting', 'break', 'program']);
  assert.equal(r.modules[0].stale, true);
  assert.equal(r.modules[2].days, 5);
  const none = checkinModules({ days, scaleEntries: [], today: '2026-10-19', seenIntro: true, hasProgram: false, enabled: { weighin: false, fasting: false, partial: false } });
  assert.deepEqual(none.modules, []);
});
