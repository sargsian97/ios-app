import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDays, dataStart, expenditure, periodAverages } from '../web/src/domain/expenditure.js';
import { addDays } from '../web/src/domain/calc/dates.js';

const entries = [];
const scale = [];
/* 30 дней: едим 2200, вес падает на 0,1 кг/день (≈ 770 ккал дефицита) → расход должен уйти к ~2970 */
for (let i = 0; i < 30; i++) {
  const d = addDays('2026-09-01', i);
  entries.push({ date: d, time: '12:00', nutrients: { kcal: 2200 } });
  scale.push({ date: d, weightKg: 85 - 0.1 * i });
}

test('дни для расчёта: калории, флаги, записан ли день', () => {
  const days = buildDays({ foodEntries: entries.slice(0, 2), dayEntries: [{ id: '2026-09-03', fasting: true }, { id: '2026-09-02', partial: true }], from: '2026-09-01', to: '2026-09-04' });
  assert.deepEqual(days.map((d) => [d.date, d.kcal, d.partial, d.fasting, d.logged]), [
    ['2026-09-01', 2200, false, false, true], ['2026-09-02', 2200, true, false, true], ['2026-09-03', 0, false, true, true], ['2026-09-04', 0, false, false, false]
  ]);
});

test('начало данных и ограничение глубины', () => {
  assert.equal(dataStart({ foodEntries: entries, scaleEntries: [{ date: '2026-08-20' }], today: '2026-10-01', addDays }), '2026-08-20');
  assert.equal(dataStart({ foodEntries: [], scaleEntries: [], today: '2026-10-01', addDays }), null);
  assert.equal(dataStart({ foodEntries: [{ date: '2020-01-01' }], scaleEntries: [], today: '2026-10-01', maxDays: 30, addDays }), '2026-09-01');
});

test('адаптивный расход уходит вверх при дефиците и снижении веса', () => {
  const r = expenditure({ foodEntries: entries, dayEntries: [], scaleEntries: scale, startTdee: 2300, today: '2026-09-30', addDays });
  assert.equal(r.series.length, 30);
  assert.equal(r.series[0].status, 'initial');
  assert.equal(r.current.status, 'ok');
  assert.ok(r.current.tdee > 2600, String(r.current.tdee));
  const avg = periodAverages(r.balance, { from: '2026-09-24', to: '2026-09-30' });
  assert.equal(avg.days, 7);
  assert.equal(Math.round(avg.intake), 2200);
  assert.ok(avg.balance < 0);
});

test('фиксированный расход и нехватка данных', () => {
  const f = expenditure({ foodEntries: entries, dayEntries: [], scaleEntries: scale, startTdee: null, fixedTdee: 2500, today: '2026-09-30', addDays });
  assert.ok(f.series.every((x) => x.status === 'fixed' && x.tdee === 2500));
  assert.equal(expenditure({ foodEntries: [], dayEntries: [], scaleEntries: [], startTdee: 2300, today: '2026-09-30', addDays }), null);
  assert.equal(expenditure({ foodEntries: entries, dayEntries: [], scaleEntries: scale, startTdee: null, today: '2026-09-30', addDays }), null);
  assert.deepEqual(periodAverages([], { from: 'a', to: 'b' }), { intake: null, tdee: null, balance: null, days: 0 });
});
