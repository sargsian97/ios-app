/* Адаптивный расход: дни питания + тренд веса → ряд TDEE по дням (calc/tdee).
   Только чистые функции: на вход — списки документов, на выход — ряды. */
import { trendWeight, adaptiveTdee, energyBalance } from './calc/index.js';
import { rangeDays } from './calc/dates.js';
import { dayTotals } from './nutrition.js';

/* Дни для расчёта: [{ date, kcal, partial, fasting, logged }] за from..to */
export function buildDays({ foodEntries, dayEntries, from, to }) {
  const byDate = new Map();
  foodEntries.forEach((e) => { if (e.date >= from && e.date <= to) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); } });
  const flags = new Map(dayEntries.map((d) => [d.id, d]));
  return rangeDays(from, to).map((date) => {
    const es = byDate.get(date) || [], f = flags.get(date);
    const tot = dayTotals(es, f);
    return { date, kcal: tot.kcal || 0, partial: !!(f && f.partial), fasting: !!(f && f.fasting), logged: es.length > 0 || !!(f && (f.fasting || (f.manualTotals && f.manualTotals.kcal))) };
  });
}

/* Первый день данных: раньше всего из питания и взвешиваний, но не раньше чем за maxDays до today */
export function dataStart({ foodEntries, scaleEntries, today, maxDays = 365, addDays }) {
  const firsts = [foodEntries, scaleEntries].map((l) => l.reduce((m, x) => (!m || x.date < m ? x.date : m), null)).filter(Boolean);
  if (!firsts.length) return null;
  const s = firsts.sort()[0], lim = addDays(today, -maxDays);
  return s < lim ? lim : s;
}

/* Полный расчёт: { series, trend, days, balance, current } или null, если нечего считать */
export function expenditure({ foodEntries, dayEntries, scaleEntries, startTdee, fixedTdee = null, version = 'v1', trendVersion = 'v1', today, addDays }) {
  const start = dataStart({ foodEntries, scaleEntries, today, addDays });
  if (!start || (!(startTdee > 0) && !(fixedTdee > 0))) return null;
  const trend = trendWeight(scaleEntries.map((s) => ({ date: s.date, weight: s.weightKg })), { version: trendVersion });
  const days = buildDays({ foodEntries, dayEntries, from: start, to: today });
  const series = adaptiveTdee({ days, trend, startTdee: startTdee > 0 ? startTdee : fixedTdee, fixedTdee: fixedTdee > 0 ? fixedTdee : null, version, startDate: start, endDate: today });
  return { series, trend, days, balance: energyBalance(days, series), current: series[series.length - 1] || null, start };
}

/* Средние за последние n дней: { intake, tdee, balance, days } по записанным и полным дням */
export function periodAverages(balance, { from, to }) {
  const rows = balance.filter((r) => r.date >= from && r.date <= to);
  if (!rows.length) return { intake: null, tdee: null, balance: null, days: 0 };
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  return { intake: avg('intake'), tdee: avg('tdee'), balance: avg('balance'), days: rows.length };
}
