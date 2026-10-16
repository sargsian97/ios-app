/* Тело: выборки по замерам и взвешиваниям для экранов (чистые функции). */

/* Значение замера на дату (последнее не позже) и предыдущее — для изменения */
export function latestMeasure(entries, key, onDate) {
  const list = entries.filter((e) => e.date <= onDate && valueOf(e, key) != null).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const last = list[list.length - 1], prev = list[list.length - 2] || null;
  return { value: valueOf(last, key), date: last.date, prev: prev ? { value: valueOf(prev, key), date: prev.date } : null };
}

/* key — ключ обхвата или 'bodyFatPct' */
export function valueOf(e, key) {
  if (key === 'bodyFatPct') return e.bodyFatPct ?? null;
  const v = e.measurements ? e.measurements[key] : null;
  return v == null ? null : v;
}

export function seriesOf(entries, key) {
  return entries.map((e) => ({ x: e.date, y: valueOf(e, key) })).filter((p) => p.y != null).sort((a, b) => a.x.localeCompare(b.x));
}

/* Точки за последние days дней до endDate (0 — всё время) */
export function lastDays(points, days, endDate, addDays) {
  if (!days) return points;
  const from = addDays(endDate, -(days - 1));
  return points.filter((p) => p.x >= from && p.x <= endDate);
}

/* Последнее взвешивание дня (по времени) для каждой даты */
export function dailyScale(scaleEntries) {
  const m = new Map();
  scaleEntries.slice().sort((a, b) => (a.date + (a.time || '') + (a.createdAt || '')).localeCompare(b.date + (b.time || '') + (b.createdAt || ''))).forEach((s) => m.set(s.date, s));
  return [...m.values()];
}
