/* Возраст, безжировая масса, базовый обмен (BMR).
   Неверные числа (NaN, ≤ 0, % жира вне 0–100) — ошибка с понятным текстом. */
import { MIFFLIN, CUNNINGHAM, BMR_ALLOMETRIC, BMR_BODYCOMP, BMR_ATHLETE, METABOLIC_ADAPTATION } from './constants.js';
import { dayNumber } from './dates.js';
import { isNum, checkSex } from './util.js';

function positive(name, x) {
  if (!isNum(x) || x <= 0) throw new Error('invalid ' + name + ': ' + x);
  return x;
}

/* Полных лет на дату onDate. Родившимся 29 февраля год прибавляется 1 марта (в невисокосный год).
   onDate раньше birthDate — ошибка. */
export function ageOn(birthDate, onDate) {
  dayNumber(birthDate);
  dayNumber(onDate);
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = onDate.split('-').map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  if (age < 0) throw new Error('onDate раньше birthDate');
  return age;
}

/* Безжировая масса, кг. % жира не задан (null, undefined, NaN) — null; вне [0, 100) — ошибка. */
export function leanMass(weightKg, bodyFatPct) {
  if (bodyFatPct === null || bodyFatPct === undefined || Number.isNaN(bodyFatPct)) return null;
  positive('weightKg', weightKg);
  if (!isNum(bodyFatPct) || bodyFatPct < 0 || bodyFatPct >= 100) throw new Error('invalid bodyFatPct: ' + bodyFatPct);
  return weightKg * (1 - bodyFatPct / 100);
}

/* Миффлин — Сан Жеор, ккал/день */
export function bmrMifflin({ sex, weightKg, heightCm, ageYears } = {}) {
  checkSex(sex);
  positive('weightKg', weightKg);
  positive('heightCm', heightCm);
  if (!isNum(ageYears) || ageYears < 0) throw new Error('invalid ageYears: ' + ageYears);
  return MIFFLIN.weight * weightKg + MIFFLIN.height * heightCm - MIFFLIN.age * ageYears + MIFFLIN[sex];
}

/* Каннингем, ккал/день — по безжировой массе */
export function bmrCunningham({ leanMassKg } = {}) {
  positive('leanMassKg', leanMassKg);
  return CUNNINGHAM.base + CUNNINGHAM.perKgLean * leanMassKg;
}

/* Возрастная поправка: до ageBreak — under ккал за год, после — over ккал за каждый год сверх */
function ageTerm(ageYears, c) {
  if (!isNum(ageYears) || ageYears < 0) throw new Error('invalid ageYears: ' + ageYears);
  return c.ageUnder * Math.min(ageYears, c.ageBreak) + c.ageOver * Math.max(ageYears - c.ageBreak, 0);
}

/* v2, по росту и весу (опубликованная аллометрическая формула):
   129,6·W^0,55 + 0,011·H² − возраст − 213,8 (жен.), ккал/день */
export function bmrAllometric({ sex, weightKg, heightCm, ageYears } = {}) {
  checkSex(sex);
  positive('weightKg', weightKg);
  positive('heightCm', heightCm);
  const c = BMR_ALLOMETRIC;
  return c.a * weightKg ** c.wExp + c.h2 * heightCm ** 2 - ageTerm(ageYears, c) - (sex === 'female' ? c.female : 0);
}

/* v2, по составу тела: 50,2·FFM^0,7 + 40,5·FFM^0,7·FM^0,066 − возраст */
export function bmrBodyComp({ leanMassKg, fatMassKg, ageYears } = {}) {
  positive('leanMassKg', leanMassKg);
  if (!isNum(fatMassKg) || fatMassKg < 0) throw new Error('invalid fatMassKg: ' + fatMassKg);
  const c = BMR_BODYCOMP;
  const ffm = leanMassKg ** c.ffmExp;
  return c.a * ffm + c.b * ffm * Math.max(fatMassKg, 0.001) ** c.fmExp - ageTerm(ageYears, c);
}

/* v2, для спортсменов (≥ 7 ч интенсивных тренировок в неделю): 40,4·FFM^0,932 */
export function bmrAthlete({ leanMassKg } = {}) {
  positive('leanMassKg', leanMassKg);
  return BMR_ATHLETE.a * leanMassKg ** BMR_ATHLETE.ffmExp;
}

/* Метаболическая адаптация: дефицит ×0,95; вес на 10 %+ ниже пикового ×0,97; оба условия ×0,92 */
export function metabolicAdaptation(kcal, { inDeficit = false, weightKg = null, peakWeightKg = null } = {}) {
  positive('kcal', kcal);
  const c = METABOLIC_ADAPTATION;
  let k = 1;
  if (inDeficit) k -= c.deficit;
  if (isNum(weightKg) && isNum(peakWeightKg) && peakWeightKg > 0 && weightKg < c.belowPeakShare * peakWeightKg) k -= c.belowPeak;
  return kcal * k;
}

/* BMR по профилю p = { sex, weightKg, heightCm, ageYears, bodyFatPct?, leanMassKg?, athlete? }.
   version 'v2' (method 'auto'): спортсмен с известной безжировой массой → bmrAthlete, известен состав тела → bmrBodyComp,
   иначе bmrAllometric. Методы можно задать явно: 'allometric' | 'bodycomp' | 'athlete'.
   method: 'auto' — Каннингем, если известен % жира или безжировая масса, иначе Миффлин;
   'mifflin' | 'cunningham' — явно. Возвращает { kcal, method } (kcal не округлён). */
export function bmr(p = {}, { method = 'auto', version = 'v1' } = {}) {
  const lean = isNum(p.leanMassKg) ? p.leanMassKg : leanMass(p.weightKg, p.bodyFatPct);
  const auto = version === 'v2'
    ? (lean !== null && p.athlete ? 'athlete' : lean !== null ? 'bodycomp' : 'allometric')
    : (lean !== null ? 'cunningham' : 'mifflin');
  const m = method === 'auto' ? auto : method;
  if (m === 'allometric') return { kcal: bmrAllometric(p), method: m };
  if (m === 'bodycomp' || m === 'athlete') {
    if (lean === null) throw new Error('для ' + m + ' нужен % жира или безжировая масса');
    if (m === 'athlete') return { kcal: bmrAthlete({ leanMassKg: lean }), method: m };
    positive('weightKg', p.weightKg);
    return { kcal: bmrBodyComp({ leanMassKg: lean, fatMassKg: Math.max(p.weightKg - lean, 0), ageYears: p.ageYears }), method: m };
  }
  if (m === 'cunningham') {
    if (lean === null) throw new Error('для cunningham нужен % жира или безжировая масса');
    return { kcal: bmrCunningham({ leanMassKg: lean }), method: m };
  }
  if (m === 'mifflin') return { kcal: bmrMifflin(p), method: m };
  throw new Error('unknown method: ' + method);
}
