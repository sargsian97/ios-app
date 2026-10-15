/* Округление до доступных весов и цель на следующий подход (умная прогрессия, раздел 2.4). */
import {
  E1RM_V1_DIVISOR,
  FATIGUE_PER_SET,
  FATIGUE_MAX_SHARE,
  DEFAULT_TARGET_RIR,
  DEFAULT_WEIGHT_STEP
} from './constants.js';
import { bestE1rm, repsAt, isWorkingSet, e1rm } from './e1rm.js';
import { EPS, isNum, roundTo, pickVersion } from './util.js';

const MODES = ['nearest', 'down', 'up'];

/* доступные веса: массив → отсортированный список чисел; { step, min = 0, max = ∞ } → проверенный объект */
function normalize(available) {
  if (Array.isArray(available)) {
    const list = available.filter(isNum).sort((a, b) => a - b);
    if (!list.length) throw new Error('нет доступных весов');
    return { list };
  }
  const { step, min = 0, max = Infinity } = available || {};
  if (!isNum(step) || step <= 0) throw new Error('invalid step: ' + step);
  if (!isNum(min) || min < 0) throw new Error('invalid min: ' + min);
  if (!(max >= min)) throw new Error('invalid max: ' + max);
  const kMax = max === Infinity ? Infinity : Math.floor((max - min) / step + EPS);
  return { step, min, kMax };
}

/* Округлить вес до доступного: mode 'nearest' (при равенстве — вниз), 'down', 'up'.
   available — отсортированный массив весов или { step, min, max }; не задан (null/undefined) — вес как есть.
   Результат всегда достижим: ниже минимума — минимум, выше максимума — максимум.
   Вес NaN, пустой массив, шаг ≤ 0, неизвестный mode — ошибка. */
export function roundToAvailable(weight, available, { mode = 'nearest' } = {}) {
  if (!isNum(weight)) throw new Error('invalid weight: ' + weight);
  if (!MODES.includes(mode)) throw new Error('unknown mode: ' + mode);
  if (available === undefined || available === null) return weight;
  const a = normalize(available);
  if (a.list) {
    const { list } = a;
    if (weight <= list[0] + EPS) return list[0];
    if (weight >= list[list.length - 1] - EPS) return list[list.length - 1];
    let i = 0;
    while (list[i + 1] <= weight + EPS) i++;
    const lo = list[i], hi = list[i + 1];
    if (Math.abs(weight - lo) < EPS || mode === 'down') return lo;
    if (mode === 'up') return hi;
    return weight - lo <= hi - weight + EPS ? lo : hi;
  }
  const k = (weight - a.min) / a.step;
  let n = mode === 'down' ? Math.floor(k + EPS) : mode === 'up' ? Math.ceil(k - EPS) : Math.ceil(k - 0.5 - EPS);
  n = Math.min(Math.max(n, 0), a.kMax);
  return roundTo(a.min + n * a.step, 6);
}

/* Самый лёгкий доступный вес строго тяжелее weight; такого нет — null. */
export function stepUp(weight, available) {
  const a = normalize(available);
  if (a.list) {
    const next = a.list.find((w) => w > weight + EPS);
    return next === undefined ? null : next;
  }
  const n = Math.max(Math.floor((weight - a.min) / a.step + EPS) + 1, 0);
  return n > a.kMax ? null : roundTo(a.min + n * a.step, 6);
}

/* v1: e1RM по подходам → поправка на усталость → самый тяжёлый доступный вес, с которым выходит нижняя граница диапазона. */
function nextV1({ sets, repRange, targetRir: rir, setIndex, available, expandRange, preferPrevWeight }) {
  const work = (sets || []).filter((s) => isWorkingSet(s) && e1rm(s) > 0);
  if (!work.length) return null;
  const [rMin, rMax] = repRange;
  const fatigue = Math.min(setIndex * FATIGUE_PER_SET, FATIGUE_MAX_SHARE);
  const eff = bestE1rm(work) * (1 - fatigue);
  const avail = available === undefined || available === null ? { step: DEFAULT_WEIGHT_STEP, min: 0 } : available;
  const repsFor = (w) => repsAt({ e1rm: eff, weight: w, rir });
  const res = (weight, reps, expanded, reason) => ({ weight, reps, rir, expanded, reason });
  const inRange = (w) => repsFor(w) >= rMin && repsFor(w) <= rMax;
  const last = work[work.length - 1].weight;

  if (preferPrevWeight && Math.abs(roundToAvailable(last, avail) - last) < EPS && inRange(last)) {
    return res(last, repsFor(last), false, 'prev_weight');
  }

  /* цель = e1RM / (1 + (повторы + RIR) / 30) − усталость, для нижней границы диапазона */
  const top = eff / (1 + (rMin + rir) / E1RM_V1_DIVISOR);
  const down = roundToAvailable(top, avail, { mode: 'down' });
  const lo = down <= top + EPS ? down : null;          /* самый тяжёлый вес, с которым выходит rMin */
  const hi = lo === null ? down : stepUp(lo, avail);   /* следующий тяжелее — уже меньше rMin повторов */
  if (lo !== null && repsFor(lo) <= rMax) return res(lo, repsFor(lo), false, 'in_range');

  /* в диапазон одной сменой веса не попасть */
  if (lo === null) return res(hi, Math.max(1, repsFor(hi)), true, 'lightest_too_heavy');
  if (expandRange) {
    if (hi !== null && repsFor(hi) >= 1 && rMin - repsFor(hi) <= repsFor(lo) - rMax) {
      return res(hi, repsFor(hi), true, 'expanded_below_range');
    }
    return res(lo, repsFor(lo), true, 'expanded_above_range');
  }
  if (hi === null) return res(lo, rMax, false, 'at_max_available');
  const clampReps = (w) => Math.min(Math.max(repsFor(w), rMin), rMax);
  const next = stepUp(last, avail);
  if (next === null) {
    const heaviest = roundToAvailable(last, avail, { mode: 'down' });
    return res(heaviest, clampReps(heaviest), false, 'at_max_available');
  }
  return res(next, clampReps(next), false, 'linear_progression');
}

const PROGRESSION_VERSIONS = { v1: nextV1 };

/* Цель на следующий подход: { weight, reps, rir, expanded, reason } или null, если истории нет (спросить пользователя).
   sets — недавние подходы упражнения по времени (последний — самый свежий); разминки и done === false не считаются.
   setIndex — номер подхода в этой сессии (0 — первый), за каждый прошлый подход поправка на усталость.
   available — доступные веса (см. roundToAvailable); не задан — шаг DEFAULT_WEIGHT_STEP от 0.
   reason:
     'in_range' — самый тяжёлый доступный вес, с которым повторы в диапазоне;
     'prev_weight' — preferPrevWeight и вес прошлого подхода по-прежнему даёт повторы в диапазоне;
     'expanded_below_range' / 'expanded_above_range' — expandRange: повторы чуть ниже / выше диапазона;
     'linear_progression' — без expandRange: +1 шаг от последнего веса, повторы прижаты к диапазону;
     'at_max_available' — тяжелее веса нет, повторы — верх диапазона;
     'lightest_too_heavy' — даже самый лёгкий вес тяжёл для диапазона (expanded: true, повторов сколько выйдет, ≥ 1).
   Неверный repRange (не [min, max] целых, 1 ≤ min ≤ max), RIR < 0, setIndex не целое ≥ 0 — ошибка. */
export function nextSetTarget({
  sets,
  repRange,
  targetRir = DEFAULT_TARGET_RIR,
  setIndex = 0,
  available,
  expandRange = false,
  preferPrevWeight = false,
  version = 'v1'
} = {}) {
  const algo = pickVersion(PROGRESSION_VERSIONS, version);
  if (!Array.isArray(repRange) || repRange.length !== 2 || !repRange.every(Number.isInteger) || repRange[0] < 1 || repRange[0] > repRange[1]) {
    throw new Error('invalid repRange: ' + JSON.stringify(repRange));
  }
  if (!isNum(targetRir) || targetRir < 0) throw new Error('invalid targetRir: ' + targetRir);
  if (!Number.isInteger(setIndex) || setIndex < 0) throw new Error('invalid setIndex: ' + setIndex);
  return algo({ sets, repRange, targetRir, setIndex, available, expandRange, preferPrevWeight });
}
