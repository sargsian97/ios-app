/* Данные новой модели по дням для расчёта расхода «по журналу» и для истории: силовые по датам, дни с шагами и кардио,
   плюс помощники дат. (Раньше здесь же были проекции для старого журнала web/app.js — он удалён.) */
import { legacyCardioType } from '../domain/workout.js';

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

const v = (x) => (x == null ? '' : x);
const byTime = (a, b) => (a.date + (a.finishedAt || a.startedAt || '') + a.id).localeCompare(b.date + (b.finishedAt || b.startedAt || '') + b.id);
const isStrength = (w) => (w.exercises || []).some((e) => !e.cardio && (e.sets || []).some((s) => s.done !== false));

/* Силовые тренировки по датам: { дата: { date, day, exercises: [{ name, sets: [{ w, r, t, done, dur, rest }] }], durationMin, avgHr, maxHr, vo2max, kcalWatch, gymSteps, note } }.
   Несколько тренировок за день складываются. Вход расчёта расхода «по журналу» (strengthForDay). */
export function strengthByDate(store) {
  const out = {};
  store.list('workoutLogs').slice().sort(byTime).forEach((w) => {
    if (!isStrength(w)) return;
    const st = w.stats || {};
    const o = out[w.date] || (out[w.date] = { date: w.date, day: '', exercises: [], durationMin: '', avgHr: '', maxHr: '', vo2max: '', kcalWatch: '', gymSteps: '', note: '' });
    if (!o.day && w.planId && /^legacy-[A-C]$/.test(w.planId)) o.day = w.planId.slice(7);
    (w.exercises || []).filter((e) => !e.cardio).forEach((e) => {
      o.exercises.push({ name: e.name, sets: (e.sets || []).map((s) => ({ w: v(s.weight), r: s.reps != null ? s.reps : v(s.timeSec), t: v(s.timeSec), done: s.done !== false, dur: v(s.durSec), rest: v(s.restSec) })) });
    });
    const add = (k, x) => { if (x != null) o[k] = (Number(o[k]) || 0) + x; };
    add('durationMin', st.durMin != null ? st.durMin : w.durationSec != null ? Math.round(w.durationSec / 60) : null); /* длительность с часов точнее таймера приложения */
    add('kcalWatch', st.kcalWatch);
    add('gymSteps', st.steps);
    if (o.avgHr === '' && st.avgHr != null) o.avgHr = st.avgHr;
    if (o.maxHr === '' && st.maxHr != null) o.maxHr = st.maxHr;
    if (o.vo2max === '' && st.vo2max != null) o.vo2max = st.vo2max;
    if (w.notes) o.note = o.note ? o.note + ' · ' + w.notes : w.notes;
  });
  return out;
}

/* Дни по датам: { дата: { date, steps, lifted, trainKcal, cardioOn, cardio: [...] } }.
   lifted — была ли силовая: true только при записанной тренировке; для всех дней по сегодня включительно без записи — false
   (с 31.10 расписание пн/ср/пт не считается: калории за силовую появляются, когда тренировка проведена). */
export function daysByDate(store, today) {
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
  if (today) {
    const first = dates.length && dates[0] < today ? dates[0] : today;
    for (let d = first; d <= today; d = addDays(d, 1)) { const o = day(d); if (o.lifted == null) o.lifted = false; }
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
