/* Еженедельный чек-ин: когда он положен и какие модули показать. Только чистые функции. */
import { addDays, diffDays, weekdayOf, findPartialDays, unloggedDays, loggingBreak, CHECKIN_WEIGHIN_STALE_DAYS } from './calc/index.js';

/* Минимум дней между чек-инами: первый — не раньше чем через 4 дня после старта программы */
export const MIN_GAP_DAYS = 4;

/* Дата следующего чек-ина: ближайший выбранный день недели не раньше lastDate + MIN_GAP_DAYS */
export function nextCheckinDate(lastDate, weekday) {
  let d = addDays(lastDate, MIN_GAP_DAYS);
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

export function checkinDue({ lastCheckin, programStart, weekday, today }) {
  const base = lastCheckin || programStart;
  if (!base) return { due: false, next: null };
  const next = nextCheckinDate(base, weekday);
  return { due: today >= next, next };
}

/* Модули чек-ина по данным за последние 7 дней (до вчера включительно — сегодня ещё не закончился).
   enabled — { id: bool }, seenIntro — показывалось ли введение. */
export function checkinModules({ days, scaleEntries, today, enabled = {}, seenIntro = false, hasProgram = true, partialVersion = 'v1' }) {
  const from = addDays(today, -7), to = addDays(today, -1);
  const on = (id) => enabled[id] !== false;
  const lastWeigh = scaleEntries.reduce((m, s) => (!m || s.date > m ? s.date : m), null);
  const partial = findPartialDays(days, { from, to, version: partialVersion });
  const unlogged = unloggedDays(days, { from, to });
  const brk = loggingBreak(days, { from, to });
  const mods = [];
  if (!seenIntro && on('intro')) mods.push({ id: 'intro' });
  if (on('weighin')) mods.push({ id: 'weighin', stale: !lastWeigh || diffDays(lastWeigh, today) >= CHECKIN_WEIGHIN_STALE_DAYS, lastWeigh });
  if (partial.length && on('partial')) mods.push({ id: 'partial', dates: partial });
  if (unlogged.length && on('fasting')) mods.push({ id: 'fasting', dates: unlogged });
  if (brk.isBreak && on('break')) mods.push({ id: 'break', days: brk.days });
  if (hasProgram && on('program')) mods.push({ id: 'program' });
  return { from, to, modules: mods };
}
