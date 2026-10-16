/* Чтение данных старого журнала для новых экранов, пока их части не перенесены в новую модель.
   Только чтение; форматы — как в web/app.js. */

function n(v) { const x = Number(v); return v === '' || v == null || !isFinite(x) ? null : x; }

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

/* Взвешивания и замеры новой модели в формате журнала: { дата: { weight, waist, neck, glute, thigh, bic, bicR, fat, note } }.
   За день берётся последнее взвешивание. Нужно старым экранам (расход по весу, история). */
export function bodyForLegacy(store) {
  const out = {};
  const day = (d) => out[d] || (out[d] = {});
  store.list('scaleEntries').slice().sort((a, b) => (a.date + (a.time || '') + (a.createdAt || '')).localeCompare(b.date + (b.time || '') + (b.createdAt || ''))).forEach((s) => {
    const o = day(s.date);
    o.weight = s.weightKg;
    if (s.bodyFatPct != null) o.fat = s.bodyFatPct;
  });
  store.list('bodyEntries').forEach((b) => {
    const o = day(b.date), m = b.measurements || {};
    if (m.waist != null) o.waist = m.waist;
    if (m.neck != null) o.neck = m.neck;
    if (m.hips != null) o.glute = m.hips;
    if (m.thighL != null) o.thigh = m.thighL;
    if (m.bicepsL != null) o.bic = m.bicepsL;
    if (m.bicepsR != null) o.bicR = m.bicepsR;
    if (b.bodyFatPct != null) o.fat = b.bodyFatPct;
    if (b.note) o.note = b.note;
  });
  return out;
}

/* Шаги за день в журнале (его экран тренировки — владелец шагов до этапа 7) */
export function setStepsOp(store, date, steps) {
  const cur = store.get('days', date) || { date };
  return { op: 'put', col: 'days', id: date, data: Object.assign({}, cur, { date, steps: steps == null ? '' : steps }) };
}
