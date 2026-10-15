/* Даты — строки 'YYYY-MM-DD' (местный календарный день).
   Считаем в UTC от полуночи: переход на летнее время не сдвигает дни.
   Неверная дата (не та форма, 2026-02-30 и т. п.) — ошибка 'invalid date: ...'. */

const DAY_MS = 86400000;
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/* 'YYYY-MM-DD' → номер дня от 1970-01-01 */
export function dayNumber(date) {
  const m = typeof date === 'string' ? RE.exec(date) : null;
  if (m) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    const t = new Date(Date.UTC(y, mo, d));
    if (t.getUTCFullYear() === y && t.getUTCMonth() === mo && t.getUTCDate() === d) return t.getTime() / DAY_MS;
  }
  throw new Error('invalid date: ' + date);
}

/* номер дня → 'YYYY-MM-DD' */
export function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function isDate(date) {
  try { dayNumber(date); return true; } catch (e) { return false; }
}

/* дата + n дней (n — целое, можно отрицательное) */
export function addDays(date, n) {
  if (!Number.isInteger(n)) throw new Error('invalid days: ' + n);
  return fromDayNumber(dayNumber(date) + n);
}

/* сколько дней от from до to (to − from; раньше — отрицательное) */
export function diffDays(from, to) {
  return dayNumber(to) - dayNumber(from);
}

/* все дни от from до to включительно; from позже to — пустой список */
export function rangeDays(from, to) {
  const a = dayNumber(from), b = dayNumber(to);
  const out = [];
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

/* день недели: 0 = понедельник … 6 = воскресенье */
export function weekdayOf(date) {
  return (((dayNumber(date) + 3) % 7) + 7) % 7; /* 1970-01-01 — четверг */
}
