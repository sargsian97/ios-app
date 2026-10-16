/* Перенос данных старого журнала в новую модель. Каждая функция читает хранилище и возвращает
   операции для store.batch; старые коллекции не трогает. Подключаются к миграциям
   (migrations.js) на тех этапах, где появляются новые экраны соответствующего раздела. */
import { Food, FoodEntry } from './models/nutrition.js';
import { ScaleEntry, BodyEntry, StepsEntry } from './models/body.js';
import { Exercise, WorkoutPlan, Workout } from './models/workout.js';
import { guessFromName } from '../domain/exercises.js';
import { cardioExerciseId } from '../domain/workout.js';

function num(v) { const x = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(',', '.')); return v === '' || v == null || !isFinite(x) ? null : x; }
function put(model, data) {
  const doc = model.normalize(data);
  const errs = model.validate(doc);
  if (errs.length) return null; /* испорченная запись журнала: пропускаем, а не роняем миграцию */
  return { op: 'put', col: model.collection, id: doc.id, data: doc };
}

/* Время записи по приёму пищи журнала */
export const MEAL_TIME = Object.freeze({ b: '08:00', l: '13:00', s: '16:00', d: '19:00' });

/* Нутриенты журнала (kcal, p, f, c, fib, pa, pv) → ключи новой модели */
export function legacyNutrients(o) {
  const map = { kcal: 'kcal', p: 'protein', f: 'fat', c: 'carbs', fib: 'fiber', pa: 'protein_animal', pv: 'protein_plant' };
  const out = {};
  Object.keys(map).forEach((k) => { const v = num(o && o[k]); if (v != null && v >= 0) out[map[k]] = v; });
  return out;
}

/* Продукты и дневник */
export function nutritionOps(store, { now }) {
  const ops = [];
  const foods = store.map('foods');
  Object.keys(foods).forEach((id) => {
    const f = foods[id];
    const op = put(Food, { id, name: String(f.name || '').trim() || 'Без названия', source: 'legacy', base: { amount: 100, unit: 'g' }, nutrients: legacyNutrients(f), createdAt: now, updatedAt: now });
    if (op) ops.push(op);
  });
  const days = store.map('food');
  Object.keys(days).sort().forEach((date) => {
    (days[date].entries || []).forEach((e, i) => {
      const meal = MEAL_TIME[e.meal] ? e.meal : null;
      const op = put(FoodEntry, {
        id: e.id ? String(e.id) : date + '-' + i,
        date,
        time: meal ? MEAL_TIME[meal] : '12:00',
        meal,
        ref: e.foodId && foods[e.foodId] ? { kind: 'food', id: String(e.foodId) } : { kind: 'quick', id: null },
        name: String(e.name || ''),
        amount: num(e.grams),
        nutrients: legacyNutrients(e),
        createdAt: now, updatedAt: now
      });
      if (op) ops.push(op);
    });
  });
  return ops;
}

/* Взвешивания, замеры и (по желанию) шаги */
export function bodyOps(store, { now, steps: withSteps = true }) {
  const ops = [];
  const body = store.map('body');
  Object.keys(body).sort().forEach((date) => {
    const b = body[date];
    const w = num(b.weight), fat = num(b.fat);
    if (w != null) {
      const op = put(ScaleEntry, { id: 'legacy-' + date, date, weightKg: w, bodyFatPct: fat, source: 'legacy', createdAt: now, updatedAt: now });
      if (op) ops.push(op);
    }
    const m = { neck: num(b.neck), waist: num(b.waist), hips: num(b.glute), bicepsL: num(b.bic), bicepsR: num(b.bicR), thighL: num(b.thigh) };
    if (Object.values(m).some((v) => v != null) || fat != null || b.note) {
      const op = put(BodyEntry, { id: date, date, measurements: m, bodyFatPct: fat, note: b.note || '', source: 'legacy', createdAt: now, updatedAt: now });
      if (op) ops.push(op);
    }
  });
  return withSteps ? ops.concat(stepsOps(store, { now })) : ops;
}

/* Шаги за день: из дней журнала, а в старом формате — из записи тренировки */
export function stepsOps(store, { now }) {
  const ops = [];
  const days = store.map('days'), ws = store.map('workouts');
  const dates = [...new Set(Object.keys(days).concat(Object.keys(ws)))].sort();
  dates.forEach((date) => {
    const d = num(days[date] && days[date].steps);
    const s = d != null ? d : num(ws[date] && ws[date].steps);
    if (s != null && s > 0) {
      const op = put(StepsEntry, { id: date, date, steps: Math.round(s), source: 'legacy', createdAt: now, updatedAt: now });
      if (op) ops.push(op);
    }
  });
  return ops;
}

/* Устойчивый id упражнения по названию — повторный перенос не плодит дубли */
export function exerciseIdFor(name) {
  const s = String(name).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'lx-' + h.toString(36);
}

/* «10–12» → [10, 12], «12» → [12, 12], «20 сек» → [20, 20] */
export function parseReps(s) {
  const m = String(s == null ? '' : s).match(/\d+/g);
  if (!m) return [null, null];
  const a = Number(m[0]), b = Number(m[m.length - 1]);
  return [Math.min(a, b), Math.max(a, b)];
}

/* «60 с», «2 мин» → секунды; повторы — null */
export function parseTime(s) {
  const str = String(s == null ? '' : s);
  if (!/\d\s*(с|сек|s|мин|min)/i.test(str)) return null;
  const m = str.match(/\d+(?:[.,]\d+)?/g);
  if (!m) return null;
  const v = Number(m[m.length - 1].replace(',', '.'));
  return Math.round(/мин|min/i.test(str) ? v * 60 : v);
}

const LEGACY_WEEKDAY = { A: 1, B: 3, C: 5 }; /* расписание журнала: пн, ср, пт (как getDay) */

/* Шаблоны A/B/C, тренировки, кардио и упражнения из них */
export function workoutOps(store, { now }) {
  const ops = [], names = new Map();
  const remember = (name) => { const n = String(name || '').trim(); if (n && !names.has(exerciseIdFor(n))) names.set(exerciseIdFor(n), n); return n ? exerciseIdFor(n) : null; };
  const timed = (name) => guessFromName(name).metrics.includes('time') && !guessFromName(name).metrics.includes('reps');

  const tpl = store.map('templates');
  Object.keys(tpl).sort().forEach((key) => {
    const t = tpl[key];
    const items = (t.exercises || []).map((e, i) => {
      const alt = (e.alt || []).map((x) => String(x).trim()).filter(Boolean);
      const altIds = alt.length > 1 ? alt.map(remember) : [];
      const sec = parseTime(e.reps);
      const [repMin, repMax] = sec != null ? [null, null] : parseReps(e.reps);
      const id = altIds.length ? altIds[0] : remember(e.name);
      return { id: 'i' + i, exerciseId: id, name: String(e.name || ''), sets: num(e.sets), repMin, repMax, timeSec: sec, weight: num(e.weight), alternatives: altIds };
    }).filter((x) => x.exerciseId);
    const wd0 = num(t.weekday);
    const wd = wd0 != null && wd0 >= 0 && wd0 <= 6 ? wd0 : LEGACY_WEEKDAY[key];
    const op = put(WorkoutPlan, { id: 'legacy-' + key, name: t.name || 'День ' + key, weekday: wd != null ? (wd + 6) % 7 : null, sections: [{ id: 'main', name: '', kind: 'main', items }], legacyKey: key, createdAt: now, updatedAt: now });
    if (op) ops.push(op);
  });

  const ws = store.map('workouts'), days = store.map('days');
  Object.keys(ws).sort().forEach((date) => {
    const w = ws[date];
    const off = !!days[date] && days[date].lifted === false; /* силовую в этот день выключили — повторы без галочек считаем черновиком */
    const exercises = (w.exercises || []).map((e, i) => {
      const asTime = timed(e.name);
      return {
        id: 'e' + i,
        exerciseId: remember(e.name),
        name: String(e.name || ''),
        sets: (e.sets || []).map((s, j) => ({ id: 's' + j, type: 'normal', weight: num(s.w), reps: asTime ? null : num(s.r), timeSec: asTime ? num(s.r) : null, done: !!s.done || (!off && num(s.r) != null), durSec: num(s.dur), restSec: num(s.rest) })),
        notes: e.note || ''
      };
    }).filter((e) => e.exerciseId);
    const logged = exercises.some((e) => e.sets.some((s) => s.done));
    if (!logged) return;
    exercises.forEach((e) => { e.sets = e.sets.filter((s) => s.done); });
    const dur = num(w.durationMin), dd = days[date] || {};
    const op = put(Workout, {
      id: 'legacy-' + date, date, name: w.day && tpl[w.day] ? (tpl[w.day].name || 'День ' + w.day) : (w.day ? 'День ' + w.day : ''), planId: w.day && tpl[w.day] ? 'legacy-' + w.day : null,
      exercises: exercises.filter((e) => e.sets.length), notes: w.note || '', durationSec: dur != null ? dur * 60 : null, source: 'legacy',
      stats: { avgHr: num(w.avgHr), kcalWatch: num(w.kcalWatch), steps: num(w.gymSteps), kcal: num(dd.trainKcal) },
      createdAt: now, updatedAt: now
    });
    if (op) ops.push(op);
  });

  /* кардио: только включённые сессии с временем или дистанцией */
  let otherCardio = false;
  Object.keys(days).sort().forEach((date) => {
    const d = days[date];
    if (!d.cardioOn) return;
    const exercises = (d.cardio || []).map((c, i) => {
      const min = num(c.minutes), km = num(c.km), speed = num(c.speed);
      if (!(min > 0) && !(km > 0)) return null;
      const exId = cardioExerciseId(c.type, speed);
      if (exId === 'cardio-other') otherCardio = true;
      return {
        id: 'c' + i, exerciseId: exId, name: '',
        sets: [{ id: 's0', type: 'normal', timeSec: min > 0 ? Math.round(min * 60) : null, distanceM: km > 0 ? Math.round(km * 1000) : null, done: true }],
        cardio: { speedKmh: speed, inclinePct: num(c.incline), avgHr: num(c.avgHr), maxHr: num(c.maxHr), kcalWatch: num(c.kcalWatch), kcal: num(c.kcal), rpe: num(c.rpe), steps: num(c.steps), inSteps: c.inSteps !== false },
        notes: c.note || ''
      };
    }).filter(Boolean);
    if (!exercises.length) return;
    const op = put(Workout, { id: 'legacy-cardio-' + date, date, name: 'Кардио', exercises, source: 'legacy', createdAt: now, updatedAt: now });
    if (op) ops.push(op);
  });

  names.forEach((name, id) => {
    const g = guessFromName(name);
    const op = put(Exercise, Object.assign(g, { id, name, source: 'legacy', createdAt: now, updatedAt: now }));
    if (op) ops.unshift(op);
  });
  if (otherCardio) {
    const op = put(Exercise, Object.assign(guessFromName('Кардио'), { id: 'cardio-other', name: 'Другое кардио', source: 'legacy', createdAt: now, updatedAt: now }));
    if (op) ops.unshift(op);
  }
  return ops;
}
