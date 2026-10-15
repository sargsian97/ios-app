import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, fromDayNumber, isDate, addDays, diffDays, rangeDays, weekdayOf } from '../../web/src/domain/calc/dates.js';
import { roundKeepSum, pickVersion, median, roundTo } from '../../web/src/domain/calc/util.js';

test('dayNumber / fromDayNumber: туда и обратно', () => {
  assert.equal(dayNumber('1970-01-01'), 0);
  assert.equal(dayNumber('1970-01-02'), 1);
  assert.equal(fromDayNumber(dayNumber('2026-10-15')), '2026-10-15');
  assert.equal(fromDayNumber(-1), '1969-12-31');
});

test('addDays: месяцы, годы, високосный год', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-10-15', 0), '2026-10-15');
  assert.equal(addDays('2026-12-31', 365), '2027-12-31');
});

test('addDays / diffDays: переход на летнее время не сдвигает дни', () => {
  /* Европа: 29.03.2026 и 25.10.2026, США: 08.03.2026 и 01.11.2026 */
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  assert.equal(diffDays('2026-10-31', '2026-11-02'), 2);
});

test('diffDays: знак', () => {
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(diffDays('2026-01-31', '2026-01-01'), -30);
  assert.equal(diffDays('2026-01-01', '2026-01-01'), 0);
});

test('rangeDays: включительно, один день, пусто', () => {
  assert.deepEqual(rangeDays('2026-02-27', '2026-03-02'), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  assert.deepEqual(rangeDays('2026-05-05', '2026-05-05'), ['2026-05-05']);
  assert.deepEqual(rangeDays('2026-05-06', '2026-05-05'), []);
});

test('weekdayOf: 0 = понедельник … 6 = воскресенье', () => {
  assert.equal(weekdayOf('2024-01-01'), 0); /* понедельник */
  assert.equal(weekdayOf('2023-12-31'), 6); /* воскресенье */
  assert.equal(weekdayOf('2026-10-15'), 3); /* четверг */
  assert.equal(weekdayOf('1969-12-29'), 0); /* до 1970 тоже */
});

test('неверная дата — понятная ошибка', () => {
  for (const bad of ['2026-02-30', '2026-2-3', '2026-13-01', 'abc', '', null, undefined, 20260101, '0050-01-01']) {
    assert.throws(() => dayNumber(bad), /invalid date/);
    assert.equal(isDate(bad), false);
  }
  assert.equal(isDate('2026-10-15'), true);
  assert.throws(() => addDays('2026-01-01', 1.5), /invalid days/);
  assert.throws(() => rangeDays('2026-01-01', 'x'), /invalid date/);
});

test('roundKeepSum: сумма сохраняется', () => {
  assert.deepEqual(roundKeepSum([1.5, 1.5, 1.5, 1.5]), [2, 2, 1, 1]);
  assert.deepEqual(roundKeepSum([0.3, 0.3, 0.4]), [0, 0, 1]);
  const r = roundKeepSum([1866.6667, 1866.6667, 1866.6667, 1866.6667, 1866.6667, 2240, 2240], 13813);
  assert.equal(r.reduce((a, b) => a + b, 0), 13813);
});

test('pickVersion: неизвестная версия — ошибка', () => {
  const f = () => 1;
  assert.equal(pickVersion({ v1: f }, 'v1'), f);
  assert.throws(() => pickVersion({ v1: f }, 'v2'), /unknown version: v2/);
  assert.throws(() => pickVersion({ v1: f }, 'toString'), /unknown version/);
  assert.throws(() => pickVersion({ v1: f }, undefined), /unknown version/);
});

test('median и roundTo', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(roundTo(1.23456, 2), 1.23);
  assert.equal(roundTo(2.5), 3);
});
