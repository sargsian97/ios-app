/* Питание: чистые функции для порций, рецептов, записей дневника и итогов дня.
   Нутриенты продукта хранятся на food.base.amount (обычно 100 г); запись дневника — снимок итога. */
import { scaleNutrients, addNutrients, roundNutrients } from '../data/models/nutrients.js';
import { KCAL_PER_G } from './calc/constants.js';

/* Сколько граммов (мл) в выбранной порции: servingId '' или 'g'/'ml' — сами граммы */
export function servingAmount(food, servingId, quantity) {
  const q = Number(quantity);
  if (!(q >= 0)) return 0;
  if (!servingId || servingId === 'g' || servingId === 'ml') return q;
  const s = (food.servings || []).find((x) => x.id === servingId);
  if (!s || !(s.amount > 0)) return q;
  return s.amount * q;
}

/* Нутриенты продукта на количество в базовых единицах */
export function foodNutrients(food, amount) {
  const base = food && food.base && food.base.amount > 0 ? food.base.amount : 100;
  const a = Number(amount);
  if (!(a >= 0) || !food) return {};
  return roundNutrients(scaleNutrients(food.nutrients || {}, a / base), 2);
}

/* Итог рецепта: { nutrients, rawWeight, weight } — weight = вес готового (если указан) или сырой.
   resolve(kind, id) возвращает продукт или рецепт; вложенные рецепты считаются рекурсивно,
   цикл (рецепт в самом себе через другие) — ошибка. */
export function recipeTotals(recipe, resolve, seen = new Set()) {
  if (!recipe) return { nutrients: {}, rawWeight: 0, weight: 0, missing: [] };
  if (seen.has(recipe.id)) throw new Error('рецепт входит сам в себя: ' + recipe.name);
  const path = new Set(seen); path.add(recipe.id);
  let nutrients = {}, rawWeight = 0;
  const missing = [];
  (recipe.ingredients || []).forEach((ing) => {
    const amount = Number(ing.amount) || 0;
    rawWeight += amount;
    const doc = ing.ref && ing.ref.id ? resolve(ing.ref.kind, ing.ref.id) : null;
    if (!doc) { missing.push(ing.name || (ing.ref && ing.ref.id) || '?'); return; }
    if (ing.ref.kind === 'recipe') {
      const sub = recipeTotals(doc, resolve, path);
      missing.push(...sub.missing);
      if (sub.weight > 0) nutrients = addNutrients(nutrients, scaleNutrients(sub.nutrients, amount / sub.weight));
    } else {
      nutrients = addNutrients(nutrients, foodNutrients(doc, amount));
    }
  });
  const weight = recipe.cookedWeight > 0 ? recipe.cookedWeight : rawWeight;
  return { nutrients: roundNutrients(nutrients, 2), rawWeight, weight, missing };
}

/* Нутриенты части рецепта: по порциям (servings) или по граммам готового блюда (grams) */
export function recipePortion(recipe, totals, { servings, grams } = {}) {
  if (grams != null) {
    if (!(totals.weight > 0)) return {};
    return roundNutrients(scaleNutrients(totals.nutrients, Number(grams) / totals.weight), 2);
  }
  const per = recipe.servings > 0 ? recipe.servings : 1;
  return roundNutrients(scaleNutrients(totals.nutrients, (Number(servings) || 0) / per), 2);
}

/* Рецепт как продукт на 100 г готового — для поиска и карточки */
export function recipePer100(totals) {
  if (!(totals.weight > 0)) return {};
  return roundNutrients(scaleNutrients(totals.nutrients, 100 / totals.weight), 2);
}

/* Итог дня. Ручной итог (dayEntry.manualTotals) заменяет сумму записей по тем ключам, что заданы. */
export function dayTotals(entries, dayEntry) {
  let sum = {};
  (entries || []).forEach((e) => { sum = addNutrients(sum, e.nutrients); });
  sum = roundNutrients(sum, 2);
  const manual = dayEntry && dayEntry.manualTotals;
  if (manual && Object.keys(manual).length) return Object.assign({}, sum, manual, { manual: true });
  return sum;
}

/* Час записи (0–23) по времени 'ЧЧ:ММ' */
export function entryHour(e) {
  const h = Number(String(e && e.time || '12:00').slice(0, 2));
  return h >= 0 && h <= 23 ? h : 12;
}

/* Приём пищи по времени: завтрак до 11, обед до 16, ужин до 21, иначе перекус. Явный meal важнее. */
export function mealOf(e) {
  if (e && ['b', 'l', 'd', 's'].includes(e.meal)) return e.meal;
  const h = entryHour(e);
  return h < 11 ? 'b' : h < 16 ? 'l' : h < 21 ? 'd' : 's';
}

/* Часы для таймлайна: видимый диапазон плюс часы, где есть записи; hideEmpty — только с записями */
export function timelineHours(entries, { startHour = 6, endHour = 23, hideEmpty = false } = {}) {
  const busy = new Set((entries || []).map(entryHour));
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const inRange = startHour <= endHour ? h >= startHour && h <= endHour : h >= startHour || h <= endHour;
    if (busy.has(h) || (!hideEmpty && inRange)) hours.push(h);
  }
  return hours.map((h) => ({ hour: h, entries: (entries || []).filter((e) => entryHour(e) === h) }));
}

/* Записи для копирования на другие даты: новые id, та же еда; time — новое время или прежнее */
export function copyEntries(entries, dates, { time, newId }) {
  const out = [];
  [].concat(dates).forEach((date) => {
    entries.forEach((e) => {
      const c = Object.assign({}, e, { id: newId(), date, time: time || e.time });
      delete c.createdAt; delete c.updatedAt;
      out.push(c);
    });
  });
  return out;
}

/* Перенос: та же запись, новая дата и/или время */
export function moveEntries(entries, date, { time } = {}) {
  return entries.map((e) => Object.assign({}, e, { date: date || e.date, time: time || e.time }));
}

/* Последние уникальные продукты из дневника (для «Истории»): по ссылке, с последним количеством */
export function recentItems(entries, { limit = 30 } = {}) {
  const seen = new Map();
  entries.slice().sort((a, b) => (b.date + b.time + (b.createdAt || '')).localeCompare(a.date + a.time + (a.createdAt || ''))).forEach((e) => {
    const key = e.ref && e.ref.id ? e.ref.kind + ':' + e.ref.id : 'name:' + e.name;
    if (!seen.has(key)) seen.set(key, e);
  });
  return [...seen.values()].slice(0, limit);
}

/* Перевод нутриентов с этикетки «на порцию» в «на 100 г» */
export function perServingTo100(nutrients, servingGrams) {
  const g = Number(servingGrams);
  if (!(g > 0)) return {};
  return roundNutrients(scaleNutrients(nutrients, 100 / g), 2);
}

/* Калории из БЖУ по Атуотеру — подсказка, если калории не указаны */
export function kcalFromMacros(n) {
  const p = Number(n.protein) || 0, f = Number(n.fat) || 0, c = Number(n.carbs) || 0;
  return Math.round(p * KCAL_PER_G.protein + f * KCAL_PER_G.fat + c * KCAL_PER_G.carbs);
}
