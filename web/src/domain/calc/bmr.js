/* Возраст, безжировая масса, базовый обмен (BMR).
   Неверные числа (NaN, ≤ 0, % жира вне 0–100) — ошибка с понятным текстом. */
import { MIFFLIN, CUNNINGHAM } from './constants.js';
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

/* BMR по профилю p = { sex, weightKg, heightCm, ageYears, bodyFatPct?, leanMassKg? }.
   method: 'auto' — Каннингем, если известен % жира или безжировая масса, иначе Миффлин;
   'mifflin' | 'cunningham' — явно. Возвращает { kcal, method } (kcal не округлён). */
export function bmr(p = {}, { method = 'auto' } = {}) {
  const lean = isNum(p.leanMassKg) ? p.leanMassKg : leanMass(p.weightKg, p.bodyFatPct);
  const m = method === 'auto' ? (lean !== null ? 'cunningham' : 'mifflin') : method;
  if (m === 'cunningham') {
    if (lean === null) throw new Error('для cunningham нужен % жира или безжировая масса');
    return { kcal: bmrCunningham({ leanMassKg: lean }), method: m };
  }
  if (m === 'mifflin') return { kcal: bmrMifflin(p), method: m };
  throw new Error('unknown method: ' + method);
}
