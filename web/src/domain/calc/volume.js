/* Подходы и объём по мышечным группам (раздел 2.8). */
import { SECONDARY_MUSCLE_FACTOR, VOLUME_LEVEL_SETS } from './constants.js';
import { dayNumber, diffDays, fromDayNumber } from './dates.js';
import { isWorkingSet } from './e1rm.js';
import { isNum, roundTo } from './util.js';

/* Подходы и объём за период from..to (включительно; не задано — без границы): { [мышца]: { sets, volume } }.
   Считаются только рабочие подходы (не разминка, done !== false). volume = Σ вес × повторы
   (нет веса или повторов — подход идёт в sets, объём 0). Вторичные мышцы — с коэффициентом secondaryFactor;
   мышца и в основных, и во вторичных считается как основная. Упражнение не из справочника пропускается. */
export function weeklyVolume(workouts, exercises, { from, to, secondaryFactor = SECONDARY_MUSCLE_FACTOR } = {}) {
  if (!isNum(secondaryFactor) || secondaryFactor < 0) throw new Error('invalid secondaryFactor: ' + secondaryFactor);
  const a = from ? dayNumber(from) : -Infinity;
  const b = to ? dayNumber(to) : Infinity;
  const out = {};
  const add = (m, sets, volume) => {
    const r = out[m] || (out[m] = { sets: 0, volume: 0 });
    r.sets += sets;
    r.volume += volume;
  };
  for (const w of workouts || []) {
    if (!w) continue;
    const n = dayNumber(w.date);
    if (n < a || n > b) continue;
    for (const ex of w.exercises || []) {
      const info = ex && exercises ? exercises[ex.exerciseId] : null;
      if (!info) continue;
      const primary = [...new Set(info.primary || [])];
      const secondary = [...new Set(info.secondary || [])].filter((m) => !primary.includes(m));
      for (const s of ex.sets || []) {
        if (!isWorkingSet(s)) continue;
        const vol = isNum(s.weight) && s.weight > 0 && isNum(s.reps) && s.reps > 0 ? s.weight * s.reps : 0;
        primary.forEach((m) => add(m, 1, vol));
        secondary.forEach((m) => add(m, secondaryFactor, vol * secondaryFactor));
      }
    }
  }
  for (const r of Object.values(out)) {
    r.sets = roundTo(r.sets, 6);
    r.volume = roundTo(r.volume, 6);
  }
  return out;
}

/* Среднее в неделю за период: weeklyVolume ÷ (дней / 7), но не меньше чем на одну неделю,
   чтобы два дня истории не превращались в «35 подходов в неделю».
   from / to не заданы — берутся первая / последняя дата тренировок; тренировок нет — {}. */
export function averagePerWeek(workouts, exercises, { from, to, secondaryFactor } = {}) {
  const dates = (workouts || []).filter(Boolean).map((w) => dayNumber(w.date));
  const start = from || (dates.length ? fromDayNumber(Math.min(...dates)) : null);
  const end = to || (dates.length ? fromDayNumber(Math.max(...dates)) : null);
  if (!start || !end) return {};
  const days = diffDays(start, end) + 1;
  if (days <= 0) return {};
  const weeks = Math.max(1, days / 7);
  const total = weeklyVolume(workouts, exercises, { from: start, to: end, secondaryFactor });
  const out = {};
  for (const [m, r] of Object.entries(total)) out[m] = { sets: roundTo(r.sets / weeks, 6), volume: roundTo(r.volume / weeks, 6) };
  return out;
}

/* Уровень нагрузки мышцы по подходам в неделю: 0 (нет) … 4 (много), пороги — VOLUME_LEVEL_SETS.
   Отрицательное или не число — ошибка. */
export function volumeLevel(setsPerWeek, thresholds = VOLUME_LEVEL_SETS) {
  if (!isNum(setsPerWeek) || setsPerWeek < 0) throw new Error('invalid sets: ' + setsPerWeek);
  let lv = 0;
  thresholds.forEach((th, i) => { if (setsPerWeek >= th - 1e-9) lv = i + 1; });
  return lv;
}

/* Вклад упражнений в подходы мышцы за период: [{ exerciseId, sets }] по убыванию (вторичные — с коэффициентом).
   В среднем в неделю — как averagePerWeek (не меньше одной недели). */
export function muscleContributors(workouts, exercises, muscle, { from, to, secondaryFactor = SECONDARY_MUSCLE_FACTOR } = {}) {
  const dates = (workouts || []).filter(Boolean).map((w) => dayNumber(w.date));
  const start = from || (dates.length ? fromDayNumber(Math.min(...dates)) : null);
  const end = to || (dates.length ? fromDayNumber(Math.max(...dates)) : null);
  if (!start || !end || diffDays(start, end) < 0) return [];
  const weeks = Math.max(1, (diffDays(start, end) + 1) / 7);
  const a = dayNumber(start), b = dayNumber(end);
  const by = {};
  for (const w of workouts || []) {
    if (!w || dayNumber(w.date) < a || dayNumber(w.date) > b) continue;
    for (const ex of w.exercises || []) {
      const info = ex && exercises ? exercises[ex.exerciseId] : null;
      if (!info) continue;
      const k = (info.primary || []).includes(muscle) ? 1 : (info.secondary || []).includes(muscle) ? secondaryFactor : 0;
      if (!k) continue;
      const n = (ex.sets || []).filter(isWorkingSet).length * k;
      if (n) by[ex.exerciseId] = (by[ex.exerciseId] || 0) + n;
    }
  }
  return Object.entries(by).map(([exerciseId, n]) => ({ exerciseId, sets: roundTo(n / weeks, 6) })).sort((x, y) => y.sets - x.sets || x.exerciseId.localeCompare(y.exerciseId));
}
