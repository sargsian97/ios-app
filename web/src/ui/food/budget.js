/* Цель дня по еде: из программы (этап 5), иначе — из настроек журнала (расход + сдвиг). */
import { KCAL_PER_G } from '../../domain/calc/constants.js';
import { weekdayOf } from '../../domain/calc/dates.js';

export function dayBudget({ repos, legacy, date }) {
  const dt = repos.dayTarget.on(date, weekdayOf(date));
  const fiberGoal = repos.microGoal.get('fiber');
  if (dt && dt.kcal) {
    return { source: 'program', kcal: dt.kcal, protein: dt.protein, fat: dt.fat, carbs: dt.carbs, fiber: fiberGoal ? fiberGoal.target : null };
  }
  const b = legacy && legacy.budget ? legacy.budget(date) : null;
  if (b) {
    const carbs = Math.max(0, (b.goal - b.protein * KCAL_PER_G.protein - b.fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs);
    return { source: 'journal', kcal: b.goal, protein: b.protein, fat: b.fat, carbs, fiber: b.fiber, journal: b };
  }
  return { source: 'none', kcal: 0, protein: null, fat: null, carbs: null, fiber: null };
}
