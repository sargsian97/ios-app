/* Чек-ин: поиск подозрительно неполных дней и перерывов в записях за неделю.
   days — [{ date, kcal, partial?, fasting?, logged? }] (как для adaptiveTdee). */
import { CHECKIN_LOOKBACK_DAYS, CHECKIN_PARTIAL_SHARE, CHECKIN_PARTIAL_MIN_KCAL, CHECKIN_BREAK_DAYS, PARTIAL_V2_SHARE } from './constants.js';
import { addDays, rangeDays } from './dates.js';
import { isNum, median, mean } from './util.js';

function byDate(days) { const m = new Map(); (days || []).forEach((d) => d && m.set(d.date, d)); return m; }
function logged(d) { return !!d && !d.fasting && d.logged !== false && isNum(d.kcal) && d.kcal > 0; }

/* Даты from..to, где записи есть, но калорий подозрительно мало (не отмеченные как неполный или голодание) */
export function findPartialDays(days, { from, to, version = 'v1' } = {}) {
  if (version === 'v2') return findPartialDaysV2(days, { from, to });
  const m = byDate(days);
  const look = rangeDays(addDays(to, -(CHECKIN_LOOKBACK_DAYS - 1)), to).map((d) => m.get(d)).filter((d) => logged(d) && !d.partial);
  if (!look.length) return [];
  const med = median(look.map((d) => d.kcal));
  return rangeDays(from, to).filter((date) => {
    const d = m.get(date);
    return logged(d) && !d.partial && (d.kcal < med * CHECKIN_PARTIAL_SHARE || d.kcal < CHECKIN_PARTIAL_MIN_KCAL);
  });
}

/* Даты from..to без записей (и не отмеченные голоданием) — кандидаты «голодание или пропуск» */
export function unloggedDays(days, { from, to } = {}) {
  const m = byDate(days);
  return rangeDays(from, to).filter((date) => { const d = m.get(date); return !d || (!d.fasting && !logged(d)); });
}

/* Перерыв в логировании: { days, isBreak } */
export function loggingBreak(days, { from, to } = {}) {
  const n = unloggedDays(days, { from, to }).length;
  return { days: n, isBreak: n >= CHECKIN_BREAK_DAYS };
}

/* v2: день неполный, если калорий меньше 50 % среднего остальных записанных дней этой же недели (from..to).
   0 ккал считается голоданием и не отмечается. */
export function findPartialDaysV2(days, { from, to } = {}) {
  const m = byDate(days);
  const week = rangeDays(from, to).map((date) => ({ date, d: m.get(date) })).filter(({ d }) => logged(d) && !d.partial);
  return week.filter(({ date, d }) => {
    const others = week.filter((x) => x.date !== date).map((x) => x.d.kcal);
    return others.length && d.kcal < PARTIAL_V2_SHARE * mean(others);
  }).map((x) => x.date);
}
