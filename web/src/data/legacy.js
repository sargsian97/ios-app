/* Чтение данных старого журнала для новых экранов, пока их части не перенесены в новую модель.
   Только чтение; форматы — как в web/app.js. */

function n(v) { const x = Number(v); return v === '' || v == null || !isFinite(x) ? null : x; }

/* Итог еды за день: { kcal, p, f, c, fib, count } */
export function foodTotals(store, date) {
  const d = store.get('food', date);
  const o = { kcal: 0, p: 0, f: 0, c: 0, fib: 0, count: 0 };
  ((d && d.entries) || []).forEach((e) => {
    o.count++;
    ['kcal', 'p', 'f', 'c', 'fib'].forEach((k) => { o[k] += n(e[k]) || 0; });
  });
  return o;
}

/* Взвешивания: [{ date, weight }] по возрастанию даты */
export function weighIns(store) {
  const m = store.map('body');
  return Object.keys(m).sort().map((date) => ({ date, weight: n(m[date].weight) })).filter((x) => x.weight != null);
}

/* Последний вес не позже даты и изменение относительно взвешивания ~неделю назад */
export function latestWeight(store, date) {
  const all = weighIns(store).filter((x) => x.date <= date);
  if (!all.length) return null;
  const last = all[all.length - 1];
  const weekAgo = addDays(last.date, -7);
  const before = all.filter((x) => x.date <= weekAgo);
  const prev = before.length ? before[before.length - 1] : null;
  return { date: last.date, weight: last.weight, change: prev ? last.weight - prev.weight : null, prevDate: prev ? prev.date : null };
}

/* Тренировки с хотя бы одним выполненным подходом в диапазоне дат */
export function workoutsBetween(store, from, to) {
  const m = store.map('workouts');
  return Object.keys(m).filter((d) => d >= from && d <= to && logged(m[d])).sort().map((d) => m[d]);
}

function logged(w) {
  return !!w && (w.exercises || []).some((e) => (e.sets || []).some((s) => s.done || n(s.r) != null));
}

export function stepsOn(store, date) {
  const d = store.get('days', date);
  return d ? n(d.steps) : null;
}

export function addDays(ymd, k) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + k));
  return dt.toISOString().slice(0, 10);
}

/* Понедельник недели, в которую попадает дата */
export function weekStart(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(ymd, -wd);
}
