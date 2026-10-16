import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestMeasure, valueOf, seriesOf, lastDays, dailyScale } from '../web/src/domain/body.js';
import { addDays } from '../web/src/data/legacy.js';

const E = [
  { date: '2026-10-01', measurements: { waist: 86 }, bodyFatPct: 22 },
  { date: '2026-10-08', measurements: { waist: 85, hips: 100 } },
  { date: '2026-10-15', measurements: { hips: 99 }, bodyFatPct: 21 }
];

test('замер на дату и предыдущий', () => {
  assert.deepEqual(latestMeasure(E, 'waist', '2026-10-16'), { value: 85, date: '2026-10-08', prev: { value: 86, date: '2026-10-01' } });
  assert.deepEqual(latestMeasure(E, 'waist', '2026-10-05'), { value: 86, date: '2026-10-01', prev: null });
  assert.equal(latestMeasure(E, 'neck', '2026-10-16'), null);
  assert.equal(latestMeasure(E, 'bodyFatPct', '2026-10-16').value, 21);
  assert.equal(valueOf({}, 'waist'), null);
});

test('ряды и периоды', () => {
  assert.deepEqual(seriesOf(E, 'hips'), [{ x: '2026-10-08', y: 100 }, { x: '2026-10-15', y: 99 }]);
  const pts = seriesOf(E, 'waist');
  assert.equal(lastDays(pts, 7, '2026-10-14', addDays).length, 1);
  assert.equal(lastDays(pts, 0, '2026-10-14', addDays).length, 2);
});

test('последнее взвешивание за день', () => {
  const d = dailyScale([{ date: '2026-10-01', time: '09:00', weightKg: 81 }, { date: '2026-10-01', time: '07:00', weightKg: 80 }, { date: '2026-10-02', weightKg: 79 }]);
  assert.deepEqual(d.map((x) => x.weightKg), [81, 79]);
});
