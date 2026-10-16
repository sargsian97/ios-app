/* Программа питания: стартовая оценка расхода, цели на дни недели (coached / collaborative / manual),
   дата достижения цели. Только чистые функции поверх слоя расчётов. */
import { ageOn, leanMass, bmr, initialTdee, calorieTarget, macroTargets, weeklyDistribution, dayTargets, KCAL_PER_G } from './calc/index.js';
import { addDays } from './calc/dates.js';

/* Стартовая оценка: { ageYears, bmr: { kcal, method }, factor, tdee, leanMassKg } */
export function startingEstimate({ sex, birthDate, heightCm, weightKg, bodyFatPct = null, activity, today }) {
  const ageYears = ageOn(birthDate, today);
  const lean = bodyFatPct != null ? leanMass(weightKg, bodyFatPct) : null;
  const b = bmr({ sex, weightKg, heightCm, ageYears, bodyFatPct }, { method: 'auto' });
  const tdee = initialTdee({ bmrKcal: b.kcal, activity });
  return { ageYears, bmr: b, factor: tdee / b.kcal, tdee: Math.round(tdee), leanMassKg: lean };
}

/* Дата, к которой при темпе rate% массы в неделю будет достигнут целевой вес; null — если темп 0 или цель позади */
export function targetDate({ startKg, targetKg, ratePctPerWeek, start }) {
  if (!(startKg > 0) || !(targetKg > 0) || !(ratePctPerWeek > 0)) return null;
  const perWeek = startKg * ratePctPerWeek / 100;
  const weeks = Math.abs(startKg - targetKg) / perWeek;
  if (!(weeks > 0)) return null;
  return addDays(start, Math.ceil(weeks * 7));
}

/* Цели по программе.
   coached — по цели и типу диеты; collaborative — то же, но в рамках ограничений пользователя;
   manual — как задал пользователь (одинаково или по дням).
   Возвращает { daily: { kcal, floored }, days: [7 × { weekday, kcal, protein, fat, carbs }], warnings } */
export function planTargets({ tdee, goal, weightKg, sex, leanMassKg = null, program, manual = null }) {
  const warnings = [];
  if (program.style === 'manual') {
    const src = manual && manual.days && manual.days.length ? manual.days : [];
    const same = !manual || manual.sameEveryDay !== false;
    const base = src[0] || {};
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const d = same ? base : (src[weekday] || base);
      const protein = num(d.protein), fat = num(d.fat);
      let carbs = num(d.carbs), kcal = num(d.kcal);
      if (kcal == null) kcal = Math.round((protein || 0) * KCAL_PER_G.protein + (fat || 0) * KCAL_PER_G.fat + (carbs || 0) * KCAL_PER_G.carbs);
      if (carbs == null && kcal) carbs = Math.max(0, Math.round((kcal - (protein || 0) * KCAL_PER_G.protein - (fat || 0) * KCAL_PER_G.fat) / KCAL_PER_G.carbs));
      return { weekday, kcal, protein: protein || 0, fat: fat || 0, carbs: carbs || 0 };
    });
    return { daily: { kcal: Math.round(days.reduce((a, d) => a + d.kcal, 0) / 7), floored: false }, days, warnings };
  }
  const t = calorieTarget({ tdee, goal: { type: goal.type, ratePctPerWeek: goal.ratePctPerWeek || 0 }, weightKg, sex, floor: program.floor || 'standard' });
  let kcal = t.kcal;
  if (t.floored) warnings.push('floored');
  if (program.style === 'collaborative' && program.limits) {
    const { kcalMin, kcalMax } = program.limits;
    if (kcalMin != null && kcal < kcalMin) { kcal = kcalMin; warnings.push('limit_min'); }
    if (kcalMax != null && kcal > kcalMax) { kcal = kcalMax; warnings.push('limit_max'); }
  }
  const macro = { kcal, weightKg, leanMassKg, proteinLevel: program.proteinLevel || 'moderate', dietType: program.dietType || 'balanced', carbsAsRemainder: program.carbsAsRemainder !== false };
  const distribution = program.distribution === 'high_days' && (program.highDays || []).length ? weeklyDistribution({ dailyKcal: kcal, highDays: program.highDays }) : null;
  let days = dayTargets(Object.assign({ distribution }, macro));
  if (program.style === 'collaborative' && program.limits && program.limits.proteinMin != null) {
    days = days.map((d) => (d.protein >= program.limits.proteinMin ? d : rebalance(d, program.limits.proteinMin)));
    if (days.some((d) => d.raised)) warnings.push('protein_min');
  }
  days.forEach((d) => { if (d.warning && !warnings.includes(d.warning)) warnings.push(d.warning); });
  return { daily: { kcal, floored: t.floored }, days: days.map(({ weekday, kcal: k, protein, fat, carbs }) => ({ weekday, kcal: k, protein, fat, carbs })), warnings };
}

/* Поднять белок до минимума за счёт углеводов (потом жиров), калории те же */
function rebalance(d, proteinMin) {
  const extra = (proteinMin - d.protein) * KCAL_PER_G.protein;
  let carbs = d.carbs - extra / KCAL_PER_G.carbs, fat = d.fat;
  if (carbs < 0) { fat = Math.max(0, fat + carbs * KCAL_PER_G.carbs / KCAL_PER_G.fat); carbs = 0; }
  return Object.assign({}, d, { protein: proteinMin, carbs: Math.round(carbs), fat: Math.round(fat), raised: true });
}

function num(v) { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }

/* Документы DayTarget для записи: id `${validFrom}_${weekday}` */
export function dayTargetDocs(days, { programId, validFrom }) {
  return days.map((d) => ({ id: validFrom + '_' + d.weekday, programId, validFrom, weekday: d.weekday, kcal: d.kcal, protein: d.protein, fat: d.fat, carbs: d.carbs }));
}

/* Документы MicroGoal из microGoals(); ручные правки (auto === false) сохраняются */
export function microGoalDocs(goals, existing = {}) {
  return Object.keys(goals).map((key) => {
    const cur = existing[key];
    if (cur && cur.auto === false) return null;
    const g = goals[key];
    return { id: key, min: g.min, target: g.target, max: g.max, unit: g.unit, auto: true };
  }).filter(Boolean);
}
