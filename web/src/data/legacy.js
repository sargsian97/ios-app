/* Мостик между старым журналом (web/app.js) и новой моделью, пока старые экраны не заменены:
   проекции новой модели в форматы журнала (только чтение) и вспомогательные функции дат. */
import { legacyCardioType } from '../domain/workout.js';

function n(v) { const x = Number(v); return v === '' || v == null || !isFinite(x) ? null : x; }

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

const v = (x) => (x == null ? '' : x);
const byTime = (a, b) => (a.date + (a.finishedAt || a.startedAt || '') + a.id).localeCompare(b.date + (b.finishedAt || b.startedAt || '') + b.id);
const isStrength = (w) => (w.exercises || []).some((e) => !e.cardio && (e.sets || []).some((s) => s.done !== false));

/* Силовые тренировки новой модели в формате журнала: { дата: { date, day, exercises: [{ name, sets: [{ w, r, done, dur, rest }] }], durationMin, avgHr, kcalWatch, gymSteps, note } }.
   Несколько тренировок за день складываются. Нужно расчёту расхода и истории журнала. */
export function workoutsForLegacy(store) {
  const out = {};
  store.list('workoutLogs').slice().sort(byTime).forEach((w) => {
    if (!isStrength(w)) return;
    const st = w.stats || {};
    const o = out[w.date] || (out[w.date] = { date: w.date, day: '', exercises: [], durationMin: '', avgHr: '', kcalWatch: '', gymSteps: '', note: '' });
    if (!o.day && w.planId && /^legacy-[A-C]$/.test(w.planId)) o.day = w.planId.slice(7);
    (w.exercises || []).filter((e) => !e.cardio).forEach((e) => {
      o.exercises.push({ name: e.name, sets: (e.sets || []).map((s) => ({ w: v(s.weight), r: s.reps != null ? s.reps : v(s.timeSec), done: s.done !== false, dur: v(s.durSec), rest: v(s.restSec) })) });
    });
    const add = (k, x) => { if (x != null) o[k] = (Number(o[k]) || 0) + x; };
    add('durationMin', w.durationSec != null ? Math.round(w.durationSec / 60) : null);
    add('kcalWatch', st.kcalWatch);
    add('gymSteps', st.steps);
    if (o.avgHr === '' && st.avgHr != null) o.avgHr = st.avgHr;
    if (w.notes) o.note = o.note ? o.note + ' · ' + w.notes : w.notes;
  });
  return out;
}

/* Дни журнала из новой модели: { дата: { date, steps, lifted, trainKcal, cardioOn, cardio: [...] } }.
   lifted — была ли силовая; для прошедших дней без тренировки — false (журнал иначе считал бы тренировку по расписанию),
   сегодня и дальше без записи — не задано (журнал берёт расписание). */
export function daysForLegacy(store, today) {
  const out = {};
  const day = (d) => out[d] || (out[d] = { date: d });
  store.list('stepsEntries').forEach((s) => { const o = day(s.date); if (s.steps != null && !(Number(o.steps) >= s.steps)) o.steps = s.steps; });
  store.list('workoutLogs').slice().sort(byTime).forEach((w) => {
    const o = day(w.date);
    if (isStrength(w)) {
      o.lifted = true;
      if (w.stats && w.stats.kcal != null) o.trainKcal = (Number(o.trainKcal) || 0) + w.stats.kcal;
    }
    (w.exercises || []).filter((e) => e.cardio).forEach((e) => {
      const s = (e.sets || [])[0] || {}, c = e.cardio;
      o.cardioOn = true;
      (o.cardio || (o.cardio = [])).push({
        id: w.id + '-' + e.id, type: legacyCardioType(e.exerciseId),
        minutes: s.timeSec != null ? Math.round(s.timeSec / 6) / 10 : '', km: s.distanceM != null ? s.distanceM / 1000 : '',
        speed: v(c.speedKmh), incline: v(c.inclinePct), avgHr: v(c.avgHr), maxHr: v(c.maxHr), kcalWatch: v(c.kcalWatch), kcal: v(c.kcal), rpe: v(c.rpe),
        steps: v(c.steps), inSteps: c.inSteps !== false, note: e.notes || ''
      });
    });
  });
  const dates = Object.keys(out).concat(store.ids('foodEntries').length ? store.list('foodEntries').map((e) => e.date) : []).sort();
  if (dates.length && today) {
    for (let d = dates[0]; d < today; d = addDays(d, 1)) { const o = day(d); if (o.lifted == null) o.lifted = false; }
  }
  return out;
}

/* Тренировки за период (новая модель): с хотя бы одним выполненным подходом */
export function workoutsBetween(store, from, to) {
  return store.list('workoutLogs').filter((w) => w.date >= from && w.date <= to && (w.exercises || []).some((e) => (e.sets || []).some((s) => s.done !== false))).sort(byTime);
}

/* Шаги за день (новая модель) */
export function stepsOn(store, date) {
  let best = null;
  store.list('stepsEntries').forEach((s) => { if (s.date === date && s.steps != null && (best == null || s.steps > best)) best = s.steps; });
  return best;
}
