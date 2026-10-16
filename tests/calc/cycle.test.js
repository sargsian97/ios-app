import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRuns, cycleSummary } from '../../web/src/domain/calc/cycle.js';

const days = (start, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(...start.split('-').map((x, j) => (j === 1 ? x - 1 : +x)))); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });

test('цикл: отрезки месячных с небольшими пропусками', () => {
  const r = periodRuns(['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-29', '2026-01-30']);
  assert.deepEqual(r, [{ start: '2026-01-01', end: '2026-01-04', days: 4 }, { start: '2026-01-29', end: '2026-01-30', days: 2 }]);
  assert.deepEqual(periodRuns([]), []);
});

test('цикл: средняя длина, день цикла, прогноз', () => {
  const marks = [...days('2026-01-01', 5), ...days('2026-01-29', 5), ...days('2026-02-27', 4)];
  const s = cycleSummary(marks, '2026-03-05');
  assert.equal(s.known, true);
  assert.equal(s.avgLength, 29, '28 и 29 → 28.5 ≈ 29');
  assert.equal(s.lastStart, '2026-02-27');
  assert.equal(s.cycleDay, 7);
  assert.equal(s.nextStart, '2026-03-28');
  assert.equal(s.inPeriod, false);
  assert.equal(s.avgPeriod, 5);
  assert.equal(cycleSummary(marks, '2026-02-28').inPeriod, true);
});

test('цикл: один цикл — длина по умолчанию; пропуски — прогноз в будущем; нет данных', () => {
  const one = cycleSummary(days('2026-01-01', 4), '2026-01-10');
  assert.equal(one.avgLength, 28);
  assert.equal(one.nextStart, '2026-01-29');
  assert.equal(cycleSummary(days('2026-01-01', 4), '2026-03-10').nextStart, '2026-03-26');
  assert.equal(cycleSummary([], '2026-01-01').known, false);
  assert.equal(cycleSummary(days('2026-05-01', 3), '2026-01-01').known, false, 'будущие отметки не считаются');
  const gap = cycleSummary([...days('2026-01-01', 3), ...days('2026-04-01', 3), ...days('2026-04-29', 3)], '2026-05-01');
  assert.equal(gap.avgLength, 28, 'цикл в 90 дней не попадает в среднее');
});
