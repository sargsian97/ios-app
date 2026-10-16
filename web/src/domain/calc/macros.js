/* Цель по калориям, БЖУ и распределение по дням недели.
   Дни недели: 0 = понедельник … 6 = воскресенье.
   Неверные входные данные (NaN, отрицательные, неизвестные варианты) — ошибка с понятным текстом. */
import {
  KCAL_PER_KG_TISSUE,
  KCAL_PER_G,
  CALORIE_FLOOR,
  PROTEIN_USE_LEAN_MASS,
  PROTEIN_G_PER_KG,
  DIET_TYPES,
  HIGH_DAY_SHARE,
  KCAL_PER_KG_V2,
  CALORIE_FLOOR_V2,
  MAINTENANCE_BAND_KG,
  MAINTENANCE_RATE_PCT,
  PROTEIN_V2_G_PER_KG,
  FAT_MIN_G_PER_KG,
  CHECKIN_SMOOTHING
} from './constants.js';
import { isNum, checkSex, roundKeepSum } from './util.js';

function positive(name, x) {
  if (!isNum(x) || x <= 0) throw new Error('invalid ' + name + ': ' + x);
  return x;
}

/* Нижний порог калорий: floor 'standard' | 'low' — по полу из CALORIE_FLOOR, 'ignore' — 0. */
export function calorieFloor(sex, floor = 'standard') {
  if (floor === 'ignore') return 0;
  if (!Object.hasOwn(CALORIE_FLOOR, floor)) throw new Error('unknown floor: ' + floor);
  return CALORIE_FLOOR[floor][checkSex(sex)];
}

/* Цель по калориям в день: { kcal (целое), floored }.
   lose / gain: tdee ∓ темп % × вес × ккал/кг / 7; maintain: tdee (вес и темп не нужны).
   Ниже порога — поднимаем до порога, floored: true. Даже при floor 'ignore' ниже 0 не опускаемся. */
/* version 'v2': 7716 ккал/кг; поддержание «умное» — если тренд дальше ± 0,7 кг от goal.targetWeightKg,
   ± 0,15 % массы в неделю в сторону цели; стандартный нижний предел 1200 ккал для всех. */
export function calorieTarget({ tdee, goal, weightKg, sex, floor = 'standard', version = 'v1' } = {}) {
  positive('tdee', tdee);
  const type = goal && goal.type;
  const v2 = version === 'v2';
  const perKg = v2 ? KCAL_PER_KG_V2 : KCAL_PER_KG_TISSUE;
  let kcal;
  if (type === 'maintain') {
    kcal = tdee;
    if (v2 && isNum(goal.targetWeightKg) && isNum(weightKg)) {
      const diff = weightKg - goal.targetWeightKg;
      if (Math.abs(diff) > MAINTENANCE_BAND_KG) kcal = tdee + (diff > 0 ? -1 : 1) * (MAINTENANCE_RATE_PCT / 100) * weightKg * perKg / 7;
    }
  } else if (type === 'lose' || type === 'gain') {
    const rate = goal.ratePctPerWeek;
    if (!isNum(rate) || rate < 0) throw new Error('invalid ratePctPerWeek: ' + rate);
    positive('weightKg', weightKg);
    const delta = (rate / 100) * weightKg * perKg / 7;
    kcal = type === 'lose' ? tdee - delta : tdee + delta;
  } else {
    throw new Error('unknown goal type: ' + type);
  }
  const min = v2 && floor === 'standard' ? CALORIE_FLOOR_V2 : calorieFloor(sex, floor);
  const floored = kcal < min || kcal < 0;
  return { kcal: Math.round(floored ? Math.max(min, 0) : kcal), floored };
}

/* БЖУ на день: { kcal, protein, fat, carbs } в граммах (целые), иногда warning.
   Белок = г/кг по уровню × масса; от безжировой массы, если она дана и PROTEIN_USE_LEAN_MASS.
   carbsAsRemainder: жиры = доля DIET_TYPES[diet].fat от всех ккал, углеводы — всё, что осталось;
   иначе остаток после белка делится между жирами и углеводами в пропорции fat : carbs.
   Потолок углеводов (кето) — лишнее уходит в жиры. Ничего не бывает отрицательным:
   если белок один больше kcal — белок урезается до kcal, жиры и углеводы 0, warning 'protein_exceeds_kcal'.
   Из-за округления 4·Б + 9·Ж + 4·У может отличаться от kcal на несколько ккал. */
export function macroTargets({ kcal, weightKg, leanMassKg = null, proteinLevel, dietType, carbsAsRemainder = true } = {}) {
  if (!isNum(kcal) || kcal < 0) throw new Error('invalid kcal: ' + kcal);
  positive('weightKg', weightKg);
  if (!Object.hasOwn(PROTEIN_G_PER_KG.body, proteinLevel)) throw new Error('unknown proteinLevel: ' + proteinLevel);
  if (!Object.hasOwn(DIET_TYPES, dietType)) throw new Error('unknown dietType: ' + dietType);
  const lean = PROTEIN_USE_LEAN_MASS && isNum(leanMassKg) && leanMassKg > 0;
  let protein = PROTEIN_G_PER_KG[lean ? 'lean' : 'body'][proteinLevel] * (lean ? leanMassKg : weightKg);
  let warning = null;
  if (protein * KCAL_PER_G.protein > kcal) {
    protein = kcal / KCAL_PER_G.protein;
    warning = 'protein_exceeds_kcal';
  }
  const rest = kcal - protein * KCAL_PER_G.protein;
  const diet = DIET_TYPES[dietType];
  let fatKcal = carbsAsRemainder ? Math.min(rest, diet.fat * kcal) : rest * diet.fat / (diet.fat + diet.carbs);
  let carbsKcal = rest - fatKcal;
  if (isNum(diet.carbsMaxG) && carbsKcal > diet.carbsMaxG * KCAL_PER_G.carbs) {
    carbsKcal = diet.carbsMaxG * KCAL_PER_G.carbs;
    fatKcal = rest - carbsKcal;
  }
  const res = {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fatKcal / KCAL_PER_G.fat),
    carbs: Math.round(carbsKcal / KCAL_PER_G.carbs)
  };
  if (warning) res.warning = warning;
  return res;
}

/* Калории по дням недели [пн … вс]: сумма = round(7 × dailyKcal) точно.
   День из highDays получает на highShare больше обычного дня (0.2 → +20 %).
   Нет дней с повышенной калорийностью или все 7 — поровну. highDays — целые 0…6, иначе ошибка. */
export function weeklyDistribution({ dailyKcal, highDays = [], highShare = HIGH_DAY_SHARE } = {}) {
  if (!isNum(dailyKcal) || dailyKcal < 0) throw new Error('invalid dailyKcal: ' + dailyKcal);
  if (!isNum(highShare) || highShare < 0) throw new Error('invalid highShare: ' + highShare);
  const high = new Set(highDays || []);
  for (const d of high) if (!Number.isInteger(d) || d < 0 || d > 6) throw new Error('invalid weekday: ' + d);
  const low = (7 * dailyKcal) / (7 + highShare * high.size);
  const raw = [0, 1, 2, 3, 4, 5, 6].map((d) => (high.has(d) ? low * (1 + highShare) : low));
  return roundKeepSum(raw, Math.round(7 * dailyKcal));
}

/* Цели на каждый день недели: [{ weekday, kcal, protein, fat, carbs, warning? }] × 7.
   distribution — 7 чисел ккал (например, из weeklyDistribution); нет — каждый день kcal из входа.
   Белок не зависит от калорий дня, поэтому одинаков; разницу забирают жиры и углеводы. */
export function dayTargets({ distribution, ...macro } = {}) {
  const kcals = distribution === undefined || distribution === null ? Array(7).fill(macro.kcal) : distribution;
  if (!Array.isArray(kcals) || kcals.length !== 7) throw new Error('distribution: нужно 7 чисел');
  return kcals.map((kcal, weekday) => ({ weekday, ...macroTargets({ ...macro, kcal }) }));
}

/* БЖУ v2: белок по типу тренировок (none | cardio | lift | both) и предпочтению (low | mid | high) в г/кг;
   при малой калорийности приоритет — жиры не ниже минимума → белок → углеводы. Доля жиров — по типу диеты,
   на кето углеводы не выше потолка. { kcal, protein, fat, carbs } — целые граммы. */
export function macroTargetsV2({ kcal, weightKg, training = 'lift', proteinPref = 'mid', dietType = 'balanced' } = {}) {
  if (!isNum(kcal) || kcal < 0) throw new Error('invalid kcal: ' + kcal);
  positive('weightKg', weightKg);
  if (!Object.hasOwn(PROTEIN_V2_G_PER_KG, training)) throw new Error('unknown training: ' + training);
  if (!Object.hasOwn(DIET_TYPES, dietType)) throw new Error('unknown dietType: ' + dietType);
  const [lo, hi] = PROTEIN_V2_G_PER_KG[training];
  const gPerKg = proteinPref === 'low' ? lo : proteinPref === 'high' ? hi : (lo + hi) / 2;
  const diet = DIET_TYPES[dietType];
  const fat = Math.max(FAT_MIN_G_PER_KG * weightKg, (kcal * diet.fat) / KCAL_PER_G.fat);
  const afterFat = Math.max(kcal - fat * KCAL_PER_G.fat, 0);
  const protein = Math.min(weightKg * gPerKg, afterFat / KCAL_PER_G.protein);
  let carbs = Math.max(afterFat - protein * KCAL_PER_G.protein, 0) / KCAL_PER_G.carbs;
  if (isNum(diet.carbsMaxG)) carbs = Math.min(carbs, diet.carbsMaxG);
  return { kcal: Math.round(kcal), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/* Сглаживание цели на чек-ине: шаг к новому расчёту, а не прыжок (без «калорийных качелей»).
   prev нет — сразу next. */
export function smoothTarget(prev, next, { share = CHECKIN_SMOOTHING } = {}) {
  if (!isNum(next)) throw new Error('invalid next: ' + next);
  if (!isNum(prev) || prev <= 0) return next;
  return prev + share * (next - prev);
}
