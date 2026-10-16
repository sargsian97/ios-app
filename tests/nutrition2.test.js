import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourlyGoTos, historyMatches, explodeRecipeEntry, kcalFromMacros, recipeTotals } from '../web/src/domain/nutrition.js';
import { addDays } from '../web/src/domain/calc/index.js';

const e = (id, date, time, name, ref = null) => ({ id, date, time, name, ref: ref || { kind: 'quick', id: null }, nutrients: { kcal: 100 } });

test('калории: алкоголь 7 ккал/г', () => {
  assert.equal(kcalFromMacros({ protein: 10, fat: 10, carbs: 10, alcohol: 14 }), 40 + 90 + 40 + 98);
});

test('«обычно в это время»: частые записи в окне ± 90 минут', () => {
  const list = [
    e('1', '2026-10-10', '08:10', 'Овсянка', { kind: 'food', id: 'oat' }), e('2', '2026-10-12', '07:50', 'Овсянка', { kind: 'food', id: 'oat' }),
    e('3', '2026-10-13', '08:30', 'Кофе'), e('4', '2026-10-14', '08:00', 'кофе'),
    e('5', '2026-10-11', '13:00', 'Суп'), e('6', '2026-10-12', '13:10', 'Суп'),
    e('7', '2026-10-01', '08:00', 'Йогурт')
  ];
  const r = hourlyGoTos(list, { time: '08:15', today: '2026-10-16', addDays });
  assert.deepEqual(r.map((x) => x.name.toLowerCase()), ['кофе', 'овсянка']);
  assert.deepEqual(hourlyGoTos(list, { time: '13:05', today: '2026-10-16', addDays }).map((x) => x.name), ['Суп']);
  assert.deepEqual(hourlyGoTos(list, { time: '23:30', today: '2026-10-16', addDays }), []);
  assert.deepEqual(hourlyGoTos(list, { time: 'xx', today: '2026-10-16', addDays }), []);
});

test('поиск по истории: начала слов, ё = е, без повторов', () => {
  const list = [e('1', '2026-10-10', '08:00', 'Творог 5 %'), e('2', '2026-10-11', '08:00', 'Творог 5 %'), e('3', '2026-10-12', '09:00', 'Мёд')];
  assert.equal(historyMatches(list, 'твор').length, 1);
  assert.deepEqual(historyMatches(list, 'мед').map((x) => x.name), ['Мёд']);
  assert.deepEqual(historyMatches(list, ''), []);
});

test('разложить рецепт на продукты в той же доле', () => {
  const foods = { rice: { id: 'rice', name: 'Рис', base: { amount: 100, unit: 'g' }, nutrients: { kcal: 350, carbs: 78 } }, oil: { id: 'oil', name: 'Масло', base: { amount: 100, unit: 'g' }, nutrients: { kcal: 900, fat: 100 } } };
  const rec = { id: 'r', name: 'Плов', servings: 2, ingredients: [{ ref: { kind: 'food', id: 'rice' }, amount: 200 }, { ref: { kind: 'food', id: 'oil' }, amount: 20 }] };
  const resolve = (k, id) => (k === 'recipe' ? (id === 'r' ? rec : null) : foods[id]);
  const tot = recipeTotals(rec, resolve);
  const half = { ref: { kind: 'recipe', id: 'r' }, nutrients: { kcal: tot.nutrients.kcal / 2 } };
  const parts = explodeRecipeEntry(half, resolve);
  assert.deepEqual(parts.map((p) => [p.name, p.amount]), [['Рис', 100], ['Масло', 10]]);
  assert.equal(Math.round(parts.reduce((a, p) => a + p.nutrients.kcal, 0)), Math.round(tot.nutrients.kcal / 2));
  assert.deepEqual(explodeRecipeEntry({ ref: { kind: 'food', id: 'rice' } }, resolve), []);
});
