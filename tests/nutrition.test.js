import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servingAmount, foodNutrients, recipeTotals, recipePortion, recipePer100, dayTotals, entryHour, mealOf, timelineHours, copyEntries, moveEntries, recentItems, perServingTo100, kcalFromMacros } from '../web/src/domain/nutrition.js';

const egg = { id: 'egg', base: { amount: 100, unit: 'g' }, nutrients: { kcal: 155, protein: 13, fat: 11, carbs: 1.1 }, servings: [{ id: 'pc', label: '1 шт', amount: 55, unit: 'piece' }] };
const milk = { id: 'milk', base: { amount: 100, unit: 'ml' }, nutrients: { kcal: 60, protein: 3, fat: 3.2, carbs: 4.7 } };

test('порции: граммы, штуки, неизвестная порция', () => {
  assert.equal(servingAmount(egg, 'pc', 2), 110);
  assert.equal(servingAmount(egg, '', 150), 150);
  assert.equal(servingAmount(egg, 'g', 80), 80);
  assert.equal(servingAmount(egg, 'nope', 3), 3);
  assert.equal(servingAmount(egg, 'pc', -1), 0);
  assert.equal(servingAmount(egg, 'pc', 'abc'), 0);
});

test('нутриенты на количество', () => {
  assert.deepEqual(foodNutrients(egg, 110), { kcal: 170.5, protein: 14.3, fat: 12.1, carbs: 1.21 });
  assert.deepEqual(foodNutrients(egg, 0), { kcal: 0, protein: 0, fat: 0, carbs: 0 });
  assert.deepEqual(foodNutrients(null, 100), {});
  assert.deepEqual(foodNutrients({ nutrients: { kcal: 50 } }, 200), { kcal: 100 }, 'без base — на 100 г');
});

const omelet = { id: 'om', name: 'Омлет', servings: 2, cookedWeight: 300, ingredients: [{ ref: { kind: 'food', id: 'egg' }, amount: 220 }, { ref: { kind: 'food', id: 'milk' }, amount: 100 }] };
const lunch = { id: 'lunch', name: 'Обед', servings: 1, ingredients: [{ ref: { kind: 'recipe', id: 'om' }, amount: 150 }, { ref: { kind: 'food', id: 'gone' }, amount: 50, name: 'Удалённый' }] };
const db = { egg, milk, om: omelet, lunch };
const resolve = (kind, id) => db[id] || null;

test('рецепт: итог, вес готового, порция, на 100 г', () => {
  const t = recipeTotals(omelet, resolve);
  assert.equal(t.rawWeight, 320);
  assert.equal(t.weight, 300);
  assert.equal(t.nutrients.kcal, 401);
  assert.deepEqual(recipePortion(omelet, t, { servings: 1 }).kcal, 200.5);
  assert.deepEqual(recipePortion(omelet, t, { grams: 150 }).kcal, 200.5);
  assert.equal(recipePer100(t).kcal, 133.67);
});

test('рецепт: вложенный рецепт и пропавший ингредиент', () => {
  const t = recipeTotals(lunch, resolve);
  assert.equal(t.nutrients.kcal, 200.5, '150 г омлета из 300 г');
  assert.deepEqual(t.missing, ['Удалённый']);
  assert.equal(t.weight, 200, 'без веса готового — сырой вес');
});

test('рецепт: цикл — ошибка, пустой рецепт — нули', () => {
  const a = { id: 'a', name: 'А', ingredients: [{ ref: { kind: 'recipe', id: 'b' }, amount: 10 }] };
  const b = { id: 'b', name: 'Б', ingredients: [{ ref: { kind: 'recipe', id: 'a' }, amount: 10 }] };
  assert.throws(() => recipeTotals(a, (k, id) => ({ a, b })[id]), /сам в себя/);
  const empty = recipeTotals({ id: 'e', ingredients: [] }, resolve);
  assert.deepEqual([empty.weight, empty.nutrients], [0, {}]);
  assert.deepEqual(recipePortion({ servings: 1 }, empty, { grams: 100 }), {});
  assert.deepEqual(recipePer100(empty), {});
});

test('итог дня и ручной итог', () => {
  const es = [{ nutrients: { kcal: 100, protein: 10 } }, { nutrients: { kcal: 50.555, fat: 2 } }];
  assert.deepEqual(dayTotals(es), { kcal: 150.56, protein: 10, fat: 2 });
  assert.deepEqual(dayTotals([]), {});
  const t = dayTotals(es, { manualTotals: { kcal: 2000 } });
  assert.equal(t.kcal, 2000);
  assert.equal(t.protein, 10);
  assert.equal(t.manual, true);
  assert.equal(dayTotals(es, { manualTotals: {} }).manual, undefined);
});

test('час, приём пищи, таймлайн', () => {
  assert.equal(entryHour({ time: '07:45' }), 7);
  assert.equal(entryHour({}), 12);
  assert.equal(mealOf({ time: '10:59' }), 'b');
  assert.equal(mealOf({ time: '15:00' }), 'l');
  assert.equal(mealOf({ time: '20:30' }), 'd');
  assert.equal(mealOf({ time: '23:10' }), 's');
  assert.equal(mealOf({ time: '08:00', meal: 's' }), 's');
  const es = [{ time: '08:10' }, { time: '08:40' }, { time: '02:00' }];
  const tl = timelineHours(es, { startHour: 6, endHour: 9 });
  assert.deepEqual(tl.map((x) => x.hour), [2, 6, 7, 8, 9]);
  assert.equal(tl.find((x) => x.hour === 8).entries.length, 2);
  assert.deepEqual(timelineHours(es, { startHour: 6, endHour: 23, hideEmpty: true }).map((x) => x.hour), [2, 8]);
  assert.deepEqual(timelineHours([], { startHour: 22, endHour: 1 }).map((x) => x.hour), [0, 1, 22, 23], 'диапазон через полночь');
});

test('копирование и перенос записей', () => {
  let n = 0;
  const es = [{ id: 'a', date: '2026-10-15', time: '08:00', name: 'x', createdAt: 't' }];
  const c = copyEntries(es, ['2026-10-16', '2026-10-17'], { newId: () => 'n' + n++ });
  assert.deepEqual(c.map((e) => [e.id, e.date, e.time]), [['n0', '2026-10-16', '08:00'], ['n1', '2026-10-17', '08:00']]);
  assert.equal(c[0].createdAt, undefined);
  assert.equal(copyEntries(es, '2026-10-20', { time: '13:00', newId: () => 'z' })[0].time, '13:00');
  const m = moveEntries(es, '2026-10-18', { time: '19:00' });
  assert.deepEqual([m[0].id, m[0].date, m[0].time], ['a', '2026-10-18', '19:00']);
  assert.equal(moveEntries(es, null)[0].date, '2026-10-15');
});

test('история: уникальные продукты, последние первыми', () => {
  const es = [
    { date: '2026-10-14', time: '08:00', ref: { kind: 'food', id: 'oat' }, amount: 50 },
    { date: '2026-10-15', time: '08:00', ref: { kind: 'food', id: 'oat' }, amount: 70 },
    { date: '2026-10-15', time: '13:00', ref: { kind: 'quick', id: null }, name: 'Кофе' },
    { date: '2026-10-13', time: '13:00', ref: { kind: 'quick', id: null }, name: 'Кофе' }
  ];
  const r = recentItems(es);
  assert.deepEqual(r.map((e) => e.amount || e.name), ['Кофе', 70]);
  assert.equal(recentItems(es, { limit: 1 }).length, 1);
});

test('этикетка на порцию → на 100 г, калории из БЖУ', () => {
  assert.deepEqual(perServingTo100({ kcal: 120, protein: 6 }, 30), { kcal: 400, protein: 20 });
  assert.deepEqual(perServingTo100({ kcal: 120 }, 0), {});
  assert.equal(kcalFromMacros({ protein: 10, fat: 10, carbs: 10 }), 170);
  assert.equal(kcalFromMacros({}), 0);
});

test('приёмы пищи: время по умолчанию, «как в прошлый раз», прошлая порция, порция по умолчанию', async () => {
  const { mealDefaultTime, lastMeal, lastPortionOf, defaultPortion } = await import('../web/src/domain/nutrition.js');
  const { addDays } = await import('../web/src/domain/calc/index.js');
  /* время: «сейчас», если попадает в приём, иначе типичное время приёма; перекус — всегда сейчас */
  assert.equal(mealDefaultTime('b', '09:20'), '09:20');
  assert.equal(mealDefaultTime('b', '14:00'), '08:00');
  assert.equal(mealDefaultTime('l', '13:40'), '13:40');
  assert.equal(mealDefaultTime('d', null), '19:00');
  assert.equal(mealDefaultTime('s', '10:00'), '10:00');
  assert.equal(mealDefaultTime('s'), '16:00');
  assert.equal(mealDefaultTime('zzz', null), '13:00');

  const es = [
    { date: '2026-10-10', time: '08:00', meal: 'b', ref: { kind: 'food', id: 'oat' }, name: 'Овсянка', amount: 50, nutrients: { kcal: 180 } },
    { date: '2026-10-12', time: '08:30', ref: { kind: 'food', id: 'oat' }, name: 'Овсянка', amount: 70, unit: 'g', nutrients: { kcal: 250 } },
    { date: '2026-10-12', time: '08:40', ref: { kind: 'quick', id: null }, name: 'Кофе', nutrients: { kcal: 40 }, createdAt: 'b' },
    { date: '2026-10-12', time: '08:40', ref: { kind: 'quick', id: null }, name: 'Яйцо', nutrients: { kcal: 80 }, createdAt: 'a' },
    { date: '2026-10-12', time: '19:00', ref: { kind: 'food', id: 'rice' }, name: 'Рис', amount: 150, nutrients: { kcal: 190 } },
    { date: '2026-10-13', time: '13:00', meal: 's', ref: { kind: 'quick', id: null }, name: 'Орехи', nutrients: { kcal: 300 } },
    { date: '2026-10-14', time: '08:00', ref: { kind: 'food', id: 'oat' }, name: 'Овсянка', amount: 60, nutrients: { kcal: 215 } }
  ];
  /* последний завтрак до 14.10 — это 12.10, три записи по времени создания */
  const lm = lastMeal(es, 'b', { before: '2026-10-14', addDays });
  assert.equal(lm.date, '2026-10-12');
  assert.deepEqual(lm.entries.map((e) => e.name), ['Овсянка', 'Яйцо', 'Кофе']);
  /* явный meal важнее времени: «орехи» в 13:00 — перекус */
  assert.equal(lastMeal(es, 's', { before: '2026-10-20', addDays }).date, '2026-10-13');
  assert.equal(lastMeal(es, 'l', { before: '2026-10-20', addDays }), null);
  /* окно days: ужин 12.10 не старше 30 дней от 14.10, но старше 1 дня */
  assert.equal(lastMeal(es, 'd', { before: '2026-10-14', addDays }).date, '2026-10-12');
  assert.equal(lastMeal(es, 'd', { before: '2026-10-14', days: 1, addDays }), null);
  assert.equal(lastMeal([], 'b', { before: '2026-10-14' }), null);
  assert.equal(lastMeal(es, 'b', {}).date, '2026-10-14');

  /* прошлая порция: самая поздняя запись продукта; для быстрых — по имени */
  assert.deepEqual(lastPortionOf(es, { ref: { kind: 'food', id: 'oat' } }), { amount: 60, unit: 'g', servingId: '', quantity: null, nutrients: { kcal: 215 } });
  assert.equal(lastPortionOf(es, { ref: { kind: 'quick', id: null }, name: 'кофе' }).nutrients.kcal, 40);
  assert.equal(lastPortionOf(es, { ref: { kind: 'food', id: 'nope' } }), null);
  assert.equal(lastPortionOf([], { ref: { kind: 'food', id: 'oat' } }), null);

  /* порция по умолчанию: граммы первой порции продукта, иначе база */
  assert.deepEqual(defaultPortion({ servings: [{ id: 'pc', amount: 55 }], base: { amount: 100 } }), { servingId: '', quantity: null, amount: 55 });
  assert.deepEqual(defaultPortion({ base: { amount: 100 } }), { servingId: '', quantity: null, amount: 100 });
  assert.deepEqual(defaultPortion(null), { servingId: '', quantity: null, amount: 100 });
});
