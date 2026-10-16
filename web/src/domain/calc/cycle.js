/* Менструальный цикл: начала месячных по отмеченным дням, средняя длина цикла, день цикла и прогноз. */
import { CYCLE_DEFAULT_LENGTH, CYCLE_PERIOD_GAP_DAYS, CYCLE_HISTORY, CYCLE_MIN_LENGTH, CYCLE_MAX_LENGTH } from './constants.js';
import { dayNumber, fromDayNumber } from './dates.js';
import { mean } from './util.js';

/* Отрезки месячных: [{ start, end, days }] по датам с отметкой (дни подряд, разрыв ≤ CYCLE_PERIOD_GAP_DAYS) */
export function periodRuns(dates) {
  const ns = [...new Set((dates || []).map(dayNumber))].sort((a, b) => a - b);
  const runs = [];
  ns.forEach((n) => {
    const last = runs[runs.length - 1];
    if (last && n - last.e <= CYCLE_PERIOD_GAP_DAYS) last.e = n;
    else runs.push({ s: n, e: n });
  });
  return runs.map((r) => ({ start: fromDayNumber(r.s), end: fromDayNumber(r.e), days: r.e - r.s + 1 }));
}

/* Сводка на дату: { cycleDay, avgLength, avgPeriod, lastStart, nextStart, inPeriod, known } */
export function cycleSummary(dates, onDate) {
  const today = dayNumber(onDate);
  const runs = periodRuns(dates).filter((r) => dayNumber(r.start) <= today);
  if (!runs.length) return { known: false, cycleDay: null, avgLength: CYCLE_DEFAULT_LENGTH, avgPeriod: null, lastStart: null, nextStart: null, inPeriod: false };
  const starts = runs.map((r) => dayNumber(r.start));
  const lengths = starts.slice(1).map((s, i) => s - starts[i]).filter((l) => l >= CYCLE_MIN_LENGTH && l <= CYCLE_MAX_LENGTH).slice(-CYCLE_HISTORY);
  const avgLength = lengths.length ? Math.round(mean(lengths)) : CYCLE_DEFAULT_LENGTH;
  const last = runs[runs.length - 1];
  const lastStart = dayNumber(last.start);
  let next = lastStart + avgLength;
  while (next <= today) next += avgLength; /* пропущенные циклы: прогноз на ближайший будущий */
  return {
    known: true,
    cycleDay: today - lastStart + 1,
    avgLength,
    avgPeriod: Math.round(mean(runs.slice(-CYCLE_HISTORY).map((r) => r.days))),
    lastStart: last.start,
    nextStart: fromDayNumber(next),
    inPeriod: today <= dayNumber(last.end)
  };
}
