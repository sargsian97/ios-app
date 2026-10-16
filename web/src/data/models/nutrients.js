/* Ключи нутриентов. Значения в документах — на базовое количество продукта (обычно 100 г или 100 мл)
   или итог записи дневника; единицы — как в списке (g, mg, mcg, ml). */
import { NUTRIENTS } from '../../domain/calc/micro_goals.js';

export const MACROS = Object.freeze(['kcal', 'protein', 'fat', 'carbs']);

/* Свои ключи сверх микронутриентов: животный и растительный белок (были в журнале), крахмал */
const EXTRA = [['protein_animal', 'g', 'protein'], ['protein_plant', 'g', 'protein'], ['starch', 'g', 'carbs']];

export const NUTRIENT_UNITS = Object.freeze(Object.fromEntries(
  [['kcal', 'kcal', 'energy'], ['protein', 'g', 'macro'], ['fat', 'g', 'macro'], ['carbs', 'g', 'macro']]
    .concat(EXTRA, NUTRIENTS.map((n) => [n.key, n.unit, n.group]))
    .map(([k, u, g]) => [k, { unit: u, group: g }])
));

export const NUTRIENT_KEYS = Object.freeze(Object.keys(NUTRIENT_UNITS));

export function isNutrientKey(k) { return Object.prototype.hasOwnProperty.call(NUTRIENT_UNITS, k); }

/* Сложить и масштабировать наборы нутриентов (пустые значения пропускаются) */
export function scaleNutrients(n, k) {
  const o = {};
  Object.keys(n || {}).forEach((key) => { const v = Number(n[key]); if (isFinite(v)) o[key] = v * k; });
  return o;
}
export function addNutrients(a, b) {
  const o = Object.assign({}, a);
  Object.keys(b || {}).forEach((key) => { const v = Number(b[key]); if (isFinite(v)) o[key] = (o[key] || 0) + v; });
  return o;
}
export function roundNutrients(n, digits = 1) {
  const p = Math.pow(10, digits), o = {};
  Object.keys(n || {}).forEach((k) => { o[k] = Math.round(n[k] * p) / p; });
  return o;
}
