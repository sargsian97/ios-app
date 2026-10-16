/* Чтение данных старого журнала для новых экранов, пока их части не перенесены в новую модель.
   Только чтение; форматы — как в web/app.js. */

function n(v) { const x = Number(v); return v === '' || v == null || !isFinite(x) ? null : x; }

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

/* Записи новой модели питания в формате журнала: { дата: { date, entries: [{ id, name, grams, kcal, p, f, c, fib, pa, pv, meal }] } }.
   Нужен старым экранам (история, расход за неделю), пока они не заменены. */
export function foodForLegacy(store, mealOf) {
  const out = {};
  store.list('foodEntries').forEach((e) => {
    const n = e.nutrients || {};
    const d = out[e.date] || (out[e.date] = { date: e.date, entries: [] });
    d.entries.push({ id: e.id, name: e.name, grams: e.amount == null ? '' : e.amount, kcal: n.kcal || 0, p: n.protein || 0, f: n.fat || 0, c: n.carbs || 0, fib: n.fiber || 0, pa: n.protein_animal || 0, pv: n.protein_plant || 0, meal: mealOf(e), time: e.time });
  });
  Object.keys(out).forEach((k) => out[k].entries.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
  return out;
}
