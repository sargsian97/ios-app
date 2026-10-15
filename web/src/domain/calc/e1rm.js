/* Оценка 1ПМ (e1RM) по подходу и обратная задача — сколько повторов выйдет с весом.
   Неверные числа не роняют расчёт: вес или повторы ≤ 0 / NaN → 0, отрицательный или пустой RIR → 0. */
import { E1RM_V1_DIVISOR } from './constants.js';
import { EPS, isNum, pickVersion } from './util.js';

const E1RM_VERSIONS = {
  v1: {
    estimate: (weight, reps) => weight * (1 + reps / E1RM_V1_DIVISOR),
    reps: (max, weight) => E1RM_V1_DIVISOR * (max / weight - 1)
  }
};

function safeRir(rir) {
  return isNum(rir) && rir > 0 ? rir : 0;
}

/* e1RM = вес × (1 + (повторы + RIR) / 30) — временная формула из раздела 2.4 */
export function e1rm({ weight, reps, rir = 0 } = {}, { version = 'v1' } = {}) {
  const v = pickVersion(E1RM_VERSIONS, version);
  if (!isNum(weight) || !isNum(reps) || weight <= 0 || reps <= 0) return 0;
  return v.estimate(weight, reps + safeRir(rir));
}

/* Рабочий подход: не разминка и не помечен как невыполненный (done === false). */
export function isWorkingSet(set) {
  return !!set && set.type !== 'warmup' && set.done !== false;
}

/* Лучший e1RM по рабочим подходам; нет ни одного годного подхода — null. */
export function bestE1rm(sets, { version = 'v1' } = {}) {
  let best = 0;
  for (const s of sets || []) if (isWorkingSet(s)) best = Math.max(best, e1rm(s, { version }));
  return best > 0 ? best : null;
}

/* Сколько повторов выйдет с весом при данном RIR (вниз до целого, не меньше 0).
   e1rm или вес ≤ 0 / NaN → 0. */
export function repsAt({ e1rm: max, weight, rir = 0 } = {}, { version = 'v1' } = {}) {
  const v = pickVersion(E1RM_VERSIONS, version);
  if (!isNum(max) || !isNum(weight) || max <= 0 || weight <= 0) return 0;
  return Math.max(0, Math.floor(v.reps(max, weight) - safeRir(rir) + EPS));
}
