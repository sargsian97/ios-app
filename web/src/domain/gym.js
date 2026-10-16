/* Залы и оборудование: шаблоны залов, какие веса доступны упражнению в зале (блины на грифе, ряд гантелей,
   стек тренажёра, свои веса упражнения), округление до них, раскладка блинов, разминка с учётом зала.
   Чистые функции; веса — в кг (блины в фунтах переводятся). Расчёты блинов и разминки — в domain/calc. */
import { platesFor, achievableLoads, warmupSets, needsWarmup, roundToAvailable, WARMUP_SIMPLE_MIN_PLATE_KG, DEFAULT_BAR_WEIGHT } from './calc/index.js';
import { EQUIPMENT_KEYS } from '../data/models/workout.js';
import { blankSet } from './workout.js';

export const KG_PER_LB = 0.45359237;
const MAX_BAR_LOAD = 500; /* потолок перебора весов на грифе, кг — техническое ограничение, не коэффициент */

/* Категории инвентаря (раздел 2.6) → ключи оборудования справочника */
export const EQUIPMENT_CATEGORIES = Object.freeze([
  ['free_weight', ['dumbbell', 'kettlebell']],
  ['bar', ['barbell', 'ez_bar']],
  ['band', ['band']],
  ['cable', ['cable']],
  ['machine_stack', ['machine']],
  ['machine_plate', ['smith']],
  ['bench_rack', ['bench', 'pullup_bar', 'dip_bars']],
  ['bodyweight', ['bodyweight']],
  ['accessory', ['medicine_ball', 'exercise_ball', 'foam_roll', 'other']]
]);

/* Цвета блинов по весу — привычная маркировка соревновательных дисков */
export const PLATE_COLORS = Object.freeze({ 25: '#D7263D', 20: '#1E5BD7', 15: '#F2C230', 10: '#2E9E44', 5: '#F4F4F4', 2.5: '#D7263D', 2: '#1E5BD7', 1.5: '#F2C230', 1.25: '#B8BCC2', 1: '#2E9E44', 0.5: '#F4F4F4', 0.25: '#B8BCC2' });
export function plateColor(weight) { return PLATE_COLORS[weight] || '#6E6E73'; }

const kgPlates = (list) => list.map(([weight, count]) => ({ weight, unit: 'kg', count, color: plateColor(weight), bumper: false }));
const range = (min, max, step) => ({ min, max, step, list: [] });

/* Шаблоны залов: типичный набор, пользователь правит под себя */
export const GYM_TEMPLATES = Object.freeze({
  commercial: {
    icon: 'gym',
    equipment: EQUIPMENT_KEYS.filter((k) => k !== 'foam_roll'),
    plates: kgPlates([[25, 8], [20, 8], [15, 4], [10, 8], [5, 8], [2.5, 8], [1.25, 4]]),
    bars: [{ id: 'olympic', name: 'olympic', weight: 20 }, { id: 'women', name: 'women', weight: 15 }, { id: 'ez', name: 'ez', weight: 10 }],
    dumbbells: range(2, 50, 2),
    stacks: [{ id: 'cable', name: 'cable', min: 5, max: 100, step: 5, micro: [2.5] }, { id: 'machine', name: 'machine', min: 5, max: 120, step: 5, micro: [] }]
  },
  garage: {
    icon: 'garage',
    equipment: ['barbell', 'dumbbell', 'kettlebell', 'bench', 'pullup_bar', 'dip_bars', 'band', 'bodyweight', 'other'],
    plates: kgPlates([[20, 2], [15, 2], [10, 4], [5, 4], [2.5, 4], [1.25, 2]]),
    bars: [{ id: 'olympic', name: 'olympic', weight: 20 }],
    dumbbells: range(2.5, 30, 2.5),
    stacks: []
  },
  home: {
    icon: 'house',
    equipment: ['dumbbell', 'kettlebell', 'band', 'pullup_bar', 'exercise_ball', 'foam_roll', 'bodyweight', 'other'],
    plates: [],
    bars: [],
    dumbbells: range(2, 20, 2),
    stacks: []
  },
  full: {
    icon: 'gym',
    equipment: EQUIPMENT_KEYS.slice(),
    plates: kgPlates([[25, 10], [20, 10], [15, 6], [10, 10], [5, 10], [2.5, 10], [1.25, 6], [0.5, 4], [0.25, 4]]),
    bars: [{ id: 'olympic', name: 'olympic', weight: 20 }, { id: 'women', name: 'women', weight: 15 }, { id: 'ez', name: 'ez', weight: 10 }, { id: 'trap', name: 'trap', weight: 25 }],
    dumbbells: range(1, 60, 1),
    stacks: [{ id: 'cable', name: 'cable', min: 2.5, max: 120, step: 2.5, micro: [1.25] }, { id: 'machine', name: 'machine', min: 5, max: 150, step: 5, micro: [2.5] }]
  }
});

/* Данные нового зала по шаблону (без id, имени и дат) */
export function gymFromTemplate(template) {
  const t = GYM_TEMPLATES[template] || null;
  if (!t) return { template: 'custom', icon: 'gym', equipment: ['bodyweight', 'other'], plates: [], bars: [], dumbbells: { min: null, max: null, step: null, list: [] }, stacks: [] };
  return JSON.parse(JSON.stringify(Object.assign({ template }, t)));
}

/* Блины зала в кг (фунтовые — переводятся) */
export function platesKg(gym) {
  return ((gym && gym.plates) || []).filter((p) => p && p.weight > 0 && p.count > 0)
    .map((p) => ({ weight: Math.round((p.unit === 'lb' ? p.weight * KG_PER_LB : p.weight) * 1e4) / 1e4, count: p.count, color: p.color || plateColor(p.weight), bumper: !!p.bumper, unit: p.unit || 'kg', label: p.weight }));
}

/* Какой снарядом нагружается упражнение */
export function loadKind(exercise) {
  const eq = (exercise && exercise.equipment) || [];
  if (eq.includes('barbell') || eq.includes('ez_bar') || eq.includes('smith')) return 'barbell';
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return 'dumbbell';
  if (eq.includes('cable') || eq.includes('machine')) return 'stack';
  return 'free';
}

/* Гриф для упражнения: свой в настройке упражнения → EZ для EZ-упражнений → первый гриф зала */
export function barFor(exercise, gym, config) {
  const bars = (gym && gym.bars) || [];
  if (config && config.barId) { const b = bars.find((x) => x.id === config.barId); if (b) return b; }
  const eq = (exercise && exercise.equipment) || [];
  if (eq.includes('ez_bar')) { const ez = bars.find((x) => x.id === 'ez' || /ez/i.test(x.name || '')); if (ez) return ez; }
  return bars[0] || { id: 'default', name: 'default', weight: DEFAULT_BAR_WEIGHT };
}

export function stackFor(exercise, gym, config) {
  const stacks = (gym && gym.stacks) || [];
  if (config && config.stackId) { const s = stacks.find((x) => x.id === config.stackId); if (s) return s; }
  const eq = (exercise && exercise.equipment) || [];
  return (eq.includes('cable') && stacks.find((x) => x.id === 'cable')) || stacks.find((x) => x.id === 'machine') || stacks[0] || null;
}

function stepList(min, max, step, extra = []) {
  if (!(step > 0) || !(max >= min) || min == null) return [];
  const out = [];
  for (let w = min; w <= max + 1e-9; w += step) out.push(Math.round(w * 1e4) / 1e4);
  const withMicro = new Set(out);
  (extra || []).filter((m) => m > 0).forEach((m) => out.forEach((w) => { if (w + m <= max + step) withMicro.add(Math.round((w + m) * 1e4) / 1e4); }));
  return [...withMicro].sort((a, b) => a - b);
}

/* Доступные веса упражнения: отсортированный список или null (любой вес).
   Свои веса упражнения → гриф с блинами зала → гантели зала → стек тренажёра. simplify — только крупные блины (разминка). */
export function availableLoads(exercise, gym, config, { simplify = false } = {}) {
  if (config && (config.loads || []).length) return config.loads.filter((x) => x >= 0).slice().sort((a, b) => a - b);
  if (!gym) return null;
  const kind = loadKind(exercise);
  if (kind === 'barbell') {
    let plates = platesKg(gym);
    if (simplify) plates = plates.filter((p) => p.weight >= WARMUP_SIMPLE_MIN_PLATE_KG - 1e-9);
    const bar = barFor(exercise, gym, config);
    if (!plates.length) return [bar.weight];
    return achievableLoads({ barWeight: bar.weight, plates, mode: 'per_side', max: MAX_BAR_LOAD });
  }
  if (kind === 'dumbbell') {
    const d = gym.dumbbells || {};
    const list = (d.list || []).length ? d.list.slice().sort((a, b) => a - b) : stepList(d.min, d.max, d.step);
    return list.length ? list : null;
  }
  if (kind === 'stack') {
    const s = stackFor(exercise, gym, config);
    const list = s ? stepList(s.min, s.max, s.step, s.micro) : [];
    return list.length ? list : null;
  }
  return null;
}

/* Округлить вес до доступного в зале (mode: nearest | down | up); нет ограничений — как есть */
export function roundForGym(weight, exercise, gym, config, mode = 'nearest') {
  if (weight == null || !isFinite(weight)) return weight;
  const a = availableLoads(exercise, gym, config);
  return a && a.length ? roundToAvailable(weight, a, { mode }) : weight;
}

/* Раскладка блинов для веса упражнения со штангой; не штанга или нет блинов — null */
export function plateLoadout(weight, exercise, gym, config, { mode = 'per_side', offsetKg = 0 } = {}) {
  if (loadKind(exercise) !== 'barbell' || weight == null || !gym) return null;
  const bar = barFor(exercise, gym, config);
  return loadoutFor({ target: weight, barWeight: bar.weight + (offsetKg || 0), plates: platesKg(gym), mode, bar });
}

/* Раскладка для калькулятора: блины с цветами по убыванию */
export function loadoutFor({ target, barWeight, plates, mode = 'per_side', bar = null }) {
  const r = platesFor({ target, barWeight, plates, mode });
  const info = (w) => plates.find((p) => Math.abs(p.weight - w) < 1e-6) || { weight: w, color: plateColor(w), bumper: false, unit: 'kg', label: w };
  return Object.assign({}, r, { bar, items: r.perSide.map(info) });
}

/* Мышцы, уже поработавшие в сессии до упражнения ei (по рабочим подходам; planned — по порядку плана) */
export function workedMuscles(session, ei, catalog, { planned = false } = {}) {
  const out = new Set();
  (session.exercises || []).forEach((e, i) => {
    if (i >= ei || e.skipped) return;
    const ex = catalog[e.exerciseId];
    if (!ex) return;
    if (planned || (e.sets || []).some((s) => s.done && s.type !== 'warmup')) (ex.primaryMuscles || []).forEach((m) => out.add(m));
  });
  return [...out];
}

/* Разминочные подходы для упражнения: [{ weight, reps, pct }] или [].
   Учитывает настройку упражнения (всегда / никогда / авто и свою схему), профиль (схема, «только если группа
   не работала», упрощённые блины) и доступные веса зала. */
export function warmupPlan({ exercise, workingWeight, gym, config, profile, worked = [], force = false }) {
  if (!exercise || workingWeight == null || !(workingWeight > 0)) return [];
  if (exercise.type === 'cardio' || exercise.category === 'stretching') return [];
  const mode = force ? 'always' : (config && config.warmup) || 'auto';
  if (mode === 'never') return [];
  const onlyIfNotWorked = mode === 'always' ? false : !(profile && profile.warmupOnlyIfNotWorked === false);
  if (!needsWarmup({ primaryMuscles: exercise.primaryMuscles, workedMuscles: worked, onlyIfNotWorked })) return [];
  const scheme = (config && config.warmupScheme) || (profile && profile.warmupScheme) || 'default';
  const kind = loadKind(exercise);
  const bar = kind === 'barbell' ? barFor(exercise, gym, config).weight : 0;
  let avail = availableLoads(exercise, gym, config, { simplify: !!(profile && profile.simplifyWarmupPlates !== false) });
  if (avail && !avail.length) avail = null;
  try {
    return warmupSets({ workingWeight, scheme: SCHEME_OK(scheme), barWeight: bar, available: avail || undefined });
  } catch (e) { return []; }
}
const SCHEME_OK = (s) => (['default', 'short', 'long'].includes(s) ? s : 'default');

/* Зал по умолчанию: отмеченный, иначе первый */
export function defaultGym(gyms, profile) {
  const list = (gyms || []).filter(Boolean);
  if (profile && profile.defaultGymId) { const g = list.find((x) => x.id === profile.defaultGymId); if (g) return g; }
  return list.find((g) => g.isDefault) || list[0] || null;
}

/* Упражнение доступно в зале: всё его оборудование есть (свой вес и «другое» — всегда) */
export function availableInGym(exercise, gym) {
  if (!gym) return true;
  const have = new Set((gym.equipment || []).concat(['bodyweight', 'other']));
  return ((exercise && exercise.equipment) || []).every((k) => have.has(k));
}

/* Рабочий вес упражнения в сессии: первый рабочий подход (введённый вес или цель) */
export function workingWeightOf(entry) {
  const s = ((entry && entry.sets) || []).find((x) => x.type !== 'warmup');
  if (!s) return null;
  return s.weight != null ? s.weight : (s.target && s.target.weight != null ? s.target.weight : null);
}

/* Разминочные подходы для упражнения сессии (цели — вес и повторы схемы) */
export function warmupSetsForEntry(session, ei, { catalog = {}, gym = null, configs = {}, profile = null, newId, planned = false, force = false }) {
  const entry = session.exercises[ei];
  const ex = entry && catalog[entry.exerciseId];
  const plan = warmupPlan({ exercise: ex, workingWeight: workingWeightOf(entry), gym, config: configs[entry && entry.exerciseId], profile, worked: workedMuscles(session, ei, catalog, { planned }), force });
  return plan.map((w) => blankSet(newId(), 'warmup', { weight: w.weight, reps: w.reps, rir: null, timeSec: null, distanceM: null, assist: null }, false));
}

/* Добавить разминку в новую сессию: каждому упражнению без разминочных подходов, по порядку плана */
export function addWarmups(session, opts) {
  const exercises = session.exercises.map((e, ei) => {
    if (e.cardio || (e.sets || []).some((s) => s.type === 'warmup')) return e;
    const w = warmupSetsForEntry(session, ei, Object.assign({}, opts, { planned: true }));
    return w.length ? Object.assign({}, e, { sets: w.concat(e.sets) }) : e;
  });
  return Object.assign({}, session, { exercises, cursor: exercises.length ? { ei: 0, si: 0 } : null });
}
