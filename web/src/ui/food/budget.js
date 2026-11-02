/* Цель дня по еде: из программы (этап 5), иначе — расход «по журналу» (domain/calc/journal_burn.js) по настройкам expenditureSettings.
   Расчёт по журналу собирает данные новой модели (шаги, тренировки, кардио, вес) и кэшируется, пока данные не изменились. */
import { KCAL_PER_G, journalBurn, journalWeightOn, strengthForDay, journalWeek, ageOn, addDays } from '../../domain/calc/index.js';
import { weekdayOf } from '../../domain/calc/dates.js';
import { daysForLegacy, workoutsForLegacy } from '../../data/legacy.js';
import { dayTotals } from '../../domain/nutrition.js';
import { todayYmd } from '../core.js';

const COLS = ['expenditureSettings', 'profile', 'scaleEntries', 'workoutLogs', 'stepsEntries', 'foodEntries', 'dayTargets', 'microGoals'];
let cache = { key: null, days: null, workouts: null, burn: new Map(), budget: new Map() };

function ensure(store, today) {
  const key = COLS.map((c) => store.version(c)).join('|') + '|' + today;
  if (cache.key !== key) cache = { key, days: null, workouts: null, burn: new Map(), budget: new Map() };
  return cache;
}

/* Расход «по журналу» на дату (с protein/fat/fiber из настроек); считается лениво и кэшируется */
export function journalBurnFor({ store, repos }, date, today = todayYmd()) {
  const c = ensure(store, today);
  if (c.burn.has(date)) return c.burn.get(date);
  if (!c.days) { c.days = daysForLegacy(store, today); c.workouts = workoutsForLegacy(store); }
  const settings = repos.expenditureSettings.get();
  const profile = repos.profile.get();
  const weightKg = journalWeightOn(repos.scaleEntry.list(), date);
  const day = c.days[date] || { date, lifted: false };
  const strength = day.lifted ? strengthForDay(c.workouts[date], { weightKg, age: profile.birthDate ? ageOn(profile.birthDate, date) : null, sex: profile.sex || 'male', base: settings.baseKcal }) : null;
  const b = journalBurn({ settings, day, strength, weightKg, heightCm: profile.heightCm });
  c.burn.set(date, b);
  return b;
}

/* Цель дня: { source: 'program' | 'journal', kcal, protein, fat, carbs, fiber, journal? } */
export function dayBudget(app, date) {
  const { store, repos } = app;
  const c = ensure(store, todayYmd());
  if (c.budget.has(date)) return c.budget.get(date);
  let out;
  const dt = repos.dayTarget.on(date, weekdayOf(date));
  const fiberGoal = repos.microGoal.get('fiber');
  if (dt && dt.kcal) {
    out = { source: 'program', kcal: dt.kcal, protein: dt.protein, fat: dt.fat, carbs: dt.carbs, fiber: fiberGoal ? fiberGoal.target : null };
  } else {
    const b = journalBurnFor(app, date);
    const carbs = Math.max(0, (b.goal - b.protein * KCAL_PER_G.protein - b.fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs);
    out = { source: 'journal', kcal: b.goal, protein: b.protein, fat: b.fat, carbs, fiber: b.fiber, journal: b };
  }
  c.budget.set(date, out);
  return out;
}

/* Средние за 7 дней до даты (съедено, расход по журналу, средний вес за эту и прошлую неделю) */
export function journalWeekFor(app, date) {
  const { repos } = app;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, -i);
    const entries = repos.foodEntry.byDate(d);
    return { date: d, eaten: entries.length ? dayTotals(entries, repos.dayEntry.get(d)).kcal || 0 : null, burned: journalBurnFor(app, d).burned };
  });
  return journalWeek({ end: date, days, weights: repos.scaleEntry.list(), addDays });
}
