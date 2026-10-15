/* Микронутриенты: список и автонормы по полу и возрасту (беременность и лактация — по желанию).
   Сами нормы — в constants.js (MICRO_DRI), временные. */
import { MICRO_AGE_BANDS, MICRO_MIN_SHARE, MICRO_KCAL_LIMITS, MICRO_DRI } from './constants.js';
import { isNum, roundTo, checkSex } from './util.js';

/* unit: g, mg, mcg (мкг), ml. group: carbs, fats, vitamins, minerals, other. */
export const NUTRIENTS = Object.freeze([
  ['fiber', 'g', 'carbs'],
  ['sugars', 'g', 'carbs'],
  ['added_sugar', 'g', 'carbs'],
  ['saturated_fat', 'g', 'fats'],
  ['monounsaturated_fat', 'g', 'fats'],
  ['polyunsaturated_fat', 'g', 'fats'],
  ['trans_fat', 'g', 'fats'],
  ['omega3', 'g', 'fats'],
  ['omega6', 'g', 'fats'],
  ['cholesterol', 'mg', 'fats'],
  ['vitamin_a', 'mcg', 'vitamins'],
  ['vitamin_c', 'mg', 'vitamins'],
  ['vitamin_d', 'mcg', 'vitamins'],
  ['vitamin_e', 'mg', 'vitamins'],
  ['vitamin_k', 'mcg', 'vitamins'],
  ['b1', 'mg', 'vitamins'],
  ['b2', 'mg', 'vitamins'],
  ['b3', 'mg', 'vitamins'],
  ['b5', 'mg', 'vitamins'],
  ['b6', 'mg', 'vitamins'],
  ['b12', 'mcg', 'vitamins'],
  ['folate', 'mcg', 'vitamins'],
  ['choline', 'mg', 'vitamins'],
  ['calcium', 'mg', 'minerals'],
  ['iron', 'mg', 'minerals'],
  ['magnesium', 'mg', 'minerals'],
  ['phosphorus', 'mg', 'minerals'],
  ['potassium', 'mg', 'minerals'],
  ['sodium', 'mg', 'minerals'],
  ['zinc', 'mg', 'minerals'],
  ['copper', 'mg', 'minerals'],
  ['manganese', 'mg', 'minerals'],
  ['selenium', 'mcg', 'minerals'],
  ['water', 'ml', 'other'],
  ['caffeine', 'mg', 'other'],
  ['alcohol', 'g', 'other']
].map(([key, unit, group]) => Object.freeze({ key, unit, group })));

/* значение нормы для статуса (m, f, p, l) и возрастной группы; нет значения — null */
function resolve(spec, status, band) {
  if (spec === undefined || spec === null) return null;
  if (typeof spec === 'number') return spec;
  if (Array.isArray(spec)) return spec[Math.min(band, spec.length - 1)];
  let v = spec[status];
  if (v === undefined && (status === 'p' || status === 'l')) v = spec.f;
  if (v === undefined) v = spec.all;
  return resolve(v, status, band);
}

/* Нормы на день: { [key]: { min, target, max, unit } }, null — где нормы нет.
   target — RDA/AI, max — UL, min = target × MICRO_MIN_SHARE.
   kcal (необязательно) — тогда потолок насыщенных жиров и добавленного сахара как доля калорий.
   Ошибка: возраст < 14 или не число, неизвестный пол, беременность/лактация у мужчин или обе сразу. */
export function microGoals({ sex, ageYears, pregnant = false, lactating = false, kcal = null } = {}) {
  checkSex(sex);
  if (!isNum(ageYears) || ageYears < MICRO_AGE_BANDS[0]) throw new Error('нормы есть только с ' + MICRO_AGE_BANDS[0] + ' лет: ' + ageYears);
  if ((pregnant || lactating) && sex !== 'female') throw new Error('беременность и лактация — только для sex: female');
  if (pregnant && lactating) throw new Error('выбери одно: pregnant или lactating');
  let band = 0;
  MICRO_AGE_BANDS.forEach((from, i) => { if (ageYears >= from) band = i; });
  const status = pregnant ? 'p' : lactating ? 'l' : sex === 'male' ? 'm' : 'f';
  const out = {};
  for (const { key, unit } of NUTRIENTS) {
    const d = MICRO_DRI[key] || {};
    const target = resolve(d.target, status, band);
    let max = resolve(d.max, status, band);
    const lim = MICRO_KCAL_LIMITS[key];
    if (lim && isNum(kcal) && kcal > 0) max = roundTo((kcal * lim.share) / lim.kcalPerG, 1);
    out[key] = { min: target === null ? null : roundTo(target * MICRO_MIN_SHARE, 2), target, max, unit };
  }
  return out;
}
