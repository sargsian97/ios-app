/* Разминочные подходы (раздел 2.5). */
import { WARMUP_SCHEMES, WARMUP_MIN_WORKING_WEIGHT, DEFAULT_BAR_WEIGHT, DEFAULT_WEIGHT_STEP } from './constants.js';
import { roundToAvailable } from './progression.js';
import { EPS, isNum, roundTo } from './util.js';

/* Разминка к рабочему весу: [{ weight, reps, pct }], pct — фактическая доля рабочего веса (2 знака).
   Схема — доли и повторы из WARMUP_SCHEMES. Вес округляется вниз до доступного, не легче грифа,
   всегда легче рабочего; одинаковые веса не повторяются (остаётся первый, с бо́льшим числом повторов).
   Рабочий вес меньше WARMUP_MIN_WORKING_WEIGHT (или не тяжелее грифа) — разминки нет, [].
   available не задан — шаг DEFAULT_WEIGHT_STEP от веса грифа.
   Рабочий вес NaN, гриф < 0, неизвестная схема — ошибка. */
export function warmupSets({ workingWeight, scheme = 'default', barWeight = DEFAULT_BAR_WEIGHT, available } = {}) {
  if (!isNum(workingWeight)) throw new Error('invalid workingWeight: ' + workingWeight);
  if (!isNum(barWeight) || barWeight < 0) throw new Error('invalid barWeight: ' + barWeight);
  if (!Object.hasOwn(WARMUP_SCHEMES, scheme)) throw new Error('unknown scheme: ' + scheme);
  if (workingWeight < WARMUP_MIN_WORKING_WEIGHT) return [];
  const avail = available === undefined || available === null ? { step: DEFAULT_WEIGHT_STEP, min: barWeight } : available;
  const out = [];
  const seen = new Set();
  for (const { pct, reps } of WARMUP_SCHEMES[scheme]) {
    const w = roundTo(Math.max(roundToAvailable(workingWeight * pct, avail, { mode: 'down' }), barWeight), 6);
    if (w >= workingWeight - EPS || seen.has(w)) continue;
    seen.add(w);
    out.push({ weight: w, reps, pct: roundTo(w / workingWeight, 2) });
  }
  return out;
}

/* Нужна ли разминка: onlyIfNotWorked = false — всегда;
   иначе — если хоть одна основная мышца ещё не работала в этой тренировке (мышцы не заданы — да). */
export function needsWarmup({ primaryMuscles = [], workedMuscles = [], onlyIfNotWorked = true } = {}) {
  if (!onlyIfNotWorked) return true;
  const primary = primaryMuscles || [];
  if (!primary.length) return true;
  const worked = new Set(workedMuscles || []);
  return primary.some((m) => !worked.has(m));
}
