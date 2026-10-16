/* Все репозитории приложения поверх одного хранилища.
   К базовым операциям (repo.js) добавлены частые запросы: записи за день, взвешивания за период и т.п.
   Индексы строятся в памяти и пересчитываются, когда коллекция меняется. */
import { createRepo, createSingletonRepo } from '../repo.js';
import { Profile, DietProfile, WorkoutProfile } from '../models/profile.js';
import { Food, Recipe, FoodEntry, DayEntry, Favorite, Goal, MacroProgram, DayTarget, MicroGoal, CheckIn, ModuleStatus } from '../models/nutrition.js';
import { ScaleEntry, BodyEntry, StepsEntry, ProgressPhoto, PeriodEntry, TrendWeightEntry, TdeeEntry } from '../models/body.js';
import { Exercise, Equipment, EquipmentGroup, Gym, WorkoutProgram, WorkoutPlan, WorkoutSession, Workout, AutoTarget, UserExerciseConfig } from '../models/workout.js';
import { UsageCounter, Integration } from '../models/service.js';

export const MODELS = [Profile, DietProfile, WorkoutProfile, Food, Recipe, FoodEntry, DayEntry, Favorite, Goal, MacroProgram, DayTarget, MicroGoal, CheckIn, ModuleStatus,
  ScaleEntry, BodyEntry, StepsEntry, ProgressPhoto, PeriodEntry, TrendWeightEntry, TdeeEntry,
  Exercise, Equipment, EquipmentGroup, Gym, WorkoutProgram, WorkoutPlan, WorkoutSession, Workout, AutoTarget, UserExerciseConfig,
  UsageCounter, Integration];

/* Индекс «ключ → документы», пересобирается при изменении коллекции */
function indexBy(store, col, keyOf) {
  let ver = -1, idx = new Map();
  return () => {
    const v = store.version(col);
    if (v !== ver || ver === -1) {
      idx = new Map();
      store.list(col).forEach((d) => { const k = keyOf(d); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(d); });
      ver = v;
    }
    return idx;
  };
}

const byTime = (a, b) => (a.time || '').localeCompare(b.time || '') || (a.createdAt || '').localeCompare(b.createdAt || '');
const byDate = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
const inRange = (from, to) => (d) => (!from || d.date >= from) && (!to || d.date <= to);

export function createRepos(store, opts) {
  const repo = (m) => (m.singleton ? createSingletonRepo(store, m, opts) : createRepo(store, m, opts));
  const r = {};
  MODELS.forEach((m) => { r[m.name[0].toLowerCase() + m.name.slice(1)] = repo(m); });

  /* записи дневника */
  const entriesIdx = indexBy(store, FoodEntry.collection, (e) => e.date);
  r.foodEntry.byDate = (date) => (entriesIdx().get(date) || []).slice().sort(byTime);
  r.foodEntry.between = (from, to) => r.foodEntry.list(inRange(from, to)).sort(byDate);
  r.foodEntry.dates = () => [...entriesIdx().keys()].sort();

  /* продукты */
  const barcodeIdx = indexBy(store, Food.collection, (f) => f.barcode || '');
  r.food.byBarcode = (code) => (code ? (barcodeIdx().get(String(code)) || []).filter((f) => !f.archived)[0] || null : null);
  r.food.search = (q, { limit = 50 } = {}) => {
    const s = String(q || '').trim().toLowerCase();
    const all = r.food.list((f) => !f.archived);
    const hit = s ? all.filter((f) => (f.name + ' ' + f.brand).toLowerCase().includes(s)) : all;
    return hit.sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '') || a.name.localeCompare(b.name)).slice(0, limit);
  };

  /* тело */
  const scaleIdx = indexBy(store, ScaleEntry.collection, (e) => e.date);
  r.scaleEntry.byDate = (date) => (scaleIdx().get(date) || []).slice().sort(byTime);
  r.scaleEntry.between = (from, to) => r.scaleEntry.list(inRange(from, to)).sort(byDate);
  r.bodyEntry.between = (from, to) => r.bodyEntry.list(inRange(from, to)).sort(byDate);
  r.stepsEntry.between = (from, to) => r.stepsEntry.list(inRange(from, to)).sort(byDate);

  /* тренировки */
  r.workout.between = (from, to) => r.workout.list(inRange(from, to)).sort(byDate);
  r.workout.forExercise = (exerciseId) => r.workout.list((w) => w.exercises.some((e) => e.exerciseId === exerciseId)).sort(byDate);
  r.workoutSession.current = () => r.workoutSession.list().sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;

  /* цели на дни недели: последние, действующие на дату */
  r.dayTarget.on = (date, weekday) => {
    const all = r.dayTarget.list((t) => t.weekday === weekday && t.validFrom <= date);
    return all.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] || null;
  };
  r.goal.active = () => r.goal.list((g) => g.status === 'active').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
  r.macroProgram.active = () => r.macroProgram.list((p) => p.active).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;

  return r;
}
