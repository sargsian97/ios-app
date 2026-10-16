/* Генератор программы тренировок (раздел 2.1): цель, опыт, дни и время, зал, исключения, сплит, акценты на мышцы,
   периодизация и делоад → программа (один блок по неделям) и шаблоны тренировок по дням недели.
   Чистые функции: справочник, проверка оборудования и id передаются параметрами.
   Подбор: у каждого «слота» тренировки — свой упорядоченный список базовых упражнений (наш выбор),
   если ни одно не доступно — поиск по паттерну движения или основной мышце в справочнике. */
import {
  GEN_REP_RANGES, GEN_RIR, GEN_RIR_BEGINNER_ADD, GEN_SETS, GEN_MIN_SETS, GEN_MIN_EXERCISES, GEN_REST_SEC,
  GEN_SET_WORK_SEC, GEN_WARMUP_MIN_PER_MAIN, GEN_SESSION_OVERHEAD_MIN, GEN_CORE_HOLD_SEC, PERIODIZATIONS, DELOADS,
  programWeek, weekModifiers
} from './calc/index.js';

const fe = (s) => s.split(' ').map((x) => 'fe-' + x);

/* Слоты: роль (main — основное многосуставное, secondary — второстепенное, iso — изоляция, core — кор),
   мышцы (для акцентов и запасного поиска), паттерн (для запасного поиска многосуставных), список кандидатов. */
export const SLOTS = Object.freeze({
  squat: { role: 'main', muscles: ['quads', 'glutes'], pattern: 'squat', list: fe('Barbell_Squat Hack_Squat Leg_Press Smith_Machine_Squat Goblet_Squat Dumbbell_Squat Bodyweight_Squat') },
  squat2: { role: 'secondary', muscles: ['quads'], pattern: 'squat', list: fe('Leg_Press Hack_Squat Front_Barbell_Squat Goblet_Squat Dumbbell_Squat Smith_Machine_Squat Bodyweight_Squat') },
  deadlift: { role: 'main', muscles: ['hamstrings', 'glutes', 'lower_back'], pattern: 'hinge', list: fe('Barbell_Deadlift Romanian_Deadlift Stiff-Legged_Dumbbell_Deadlift Good_Morning Hyperextensions_Back_Extensions') },
  hinge: { role: 'secondary', muscles: ['hamstrings', 'glutes'], pattern: 'hinge', list: fe('Romanian_Deadlift Stiff-Legged_Dumbbell_Deadlift Good_Morning Hyperextensions_Back_Extensions Single_Leg_Glute_Bridge') },
  glutes: { role: 'secondary', muscles: ['glutes'], pattern: 'hinge', list: fe('Barbell_Hip_Thrust Butt_Lift_Bridge Single_Leg_Glute_Bridge') },
  lunge: { role: 'secondary', muscles: ['quads', 'glutes'], pattern: 'lunge', list: fe('Split_Squat_with_Dumbbells Dumbbell_Lunges Barbell_Walking_Lunge Dumbbell_Rear_Lunge Dumbbell_Step_Ups') },
  quadIso: { role: 'iso', muscles: ['quads'], list: fe('Leg_Extensions') },
  hamIso: { role: 'iso', muscles: ['hamstrings'], list: fe('Lying_Leg_Curls Seated_Leg_Curl Glute_Ham_Raise') },
  calves: { role: 'iso', muscles: ['calves'], list: fe('Standing_Calf_Raises Seated_Calf_Raise Calf_Press_On_The_Leg_Press_Machine') },
  bench: { role: 'main', muscles: ['chest', 'triceps', 'front_delts'], pattern: 'push_horizontal', list: fe('Barbell_Bench_Press_-_Medium_Grip Dumbbell_Bench_Press Machine_Bench_Press Leverage_Chest_Press Pushups') },
  incline: { role: 'secondary', muscles: ['chest', 'front_delts'], pattern: 'push_horizontal', list: fe('Incline_Dumbbell_Press Barbell_Incline_Bench_Press_-_Medium_Grip Dumbbell_Bench_Press Leverage_Chest_Press Pushups') },
  ohp: { role: 'secondary', muscles: ['front_delts', 'triceps'], pattern: 'push_vertical', list: fe('Standing_Military_Press Seated_Dumbbell_Press Dumbbell_Shoulder_Press Machine_Shoulder_Military_Press Arnold_Dumbbell_Press') },
  dips: { role: 'secondary', muscles: ['chest', 'triceps'], pattern: 'push_vertical', list: fe('Dips_-_Chest_Version Bench_Dips Push-Ups_-_Close_Triceps_Position') },
  chestIso: { role: 'iso', muscles: ['chest'], list: fe('Cable_Crossover Butterfly Dumbbell_Flyes') },
  vpull: { role: 'secondary', muscles: ['lats', 'biceps'], pattern: 'pull_vertical', list: fe('Pullups Wide-Grip_Lat_Pulldown Chin-Up Close-Grip_Front_Lat_Pulldown') },
  row: { role: 'secondary', muscles: ['upper_back', 'lats', 'rear_delts'], pattern: 'pull_horizontal', list: fe('Bent_Over_Barbell_Row One-Arm_Dumbbell_Row Seated_Cable_Rows T-Bar_Row_with_Handle Bent_Over_Two-Dumbbell_Row Inverted_Row') },
  latIso: { role: 'iso', muscles: ['lats'], list: fe('Straight-Arm_Pulldown Rope_Straight-Arm_Pulldown') },
  sideDelts: { role: 'iso', muscles: ['side_delts'], list: fe('Side_Lateral_Raise Cable_Seated_Lateral_Raise') },
  rearDelts: { role: 'iso', muscles: ['rear_delts'], list: fe('Face_Pull Reverse_Flyes Dumbbell_Lying_Rear_Lateral_Raise Band_Pull_Apart') },
  biceps: { role: 'iso', muscles: ['biceps'], list: fe('EZ-Bar_Curl Barbell_Curl Dumbbell_Bicep_Curl Hammer_Curls Incline_Hammer_Curls Preacher_Curl') },
  triceps: { role: 'iso', muscles: ['triceps'], list: fe('Triceps_Pushdown_-_Rope_Attachment Triceps_Pushdown EZ-Bar_Skullcrusher Lying_Triceps_Press Standing_Dumbbell_Triceps_Extension Tricep_Dumbbell_Kickback') },
  traps: { role: 'iso', muscles: ['traps'], list: fe('Barbell_Shrug Dumbbell_Shrug') },
  abs: { role: 'core', muscles: ['abs'], list: fe('Hanging_Leg_Raise Cable_Crunch Ab_Roller Plank Crunches') }
});

/* Тренировки сплитов: слоты по убыванию важности (при нехватке времени отрезаются с конца).
   Слот с «!» — основное упражнение дня (роль main, даже если у слота она secondary). */
export const DAY_TYPES = Object.freeze({
  fullA: ['squat', 'bench', 'row', 'hinge', 'ohp', 'sideDelts', 'biceps', 'triceps', 'calves', 'abs'],
  fullB: ['deadlift', 'ohp!', 'vpull', 'lunge', 'incline', 'rearDelts', 'triceps', 'biceps', 'abs'],
  fullC: ['squat2!', 'incline!', 'row', 'glutes', 'vpull', 'sideDelts', 'hamIso', 'biceps', 'calves', 'abs'],
  upperA: ['bench', 'row!', 'ohp', 'vpull', 'sideDelts', 'biceps', 'triceps', 'rearDelts'],
  upperB: ['ohp!', 'vpull!', 'incline', 'row', 'chestIso', 'sideDelts', 'triceps', 'biceps'],
  lowerA: ['squat', 'hinge', 'lunge', 'hamIso', 'calves', 'abs'],
  lowerB: ['deadlift', 'squat2', 'glutes', 'quadIso', 'calves', 'abs'],
  push: ['bench', 'ohp', 'incline', 'dips', 'chestIso', 'sideDelts', 'triceps'],
  pull: ['vpull!', 'row', 'latIso', 'rearDelts', 'biceps', 'traps'],
  legs: ['squat', 'hinge', 'lunge', 'quadIso', 'hamIso', 'calves', 'abs'],
  squatDay: ['squat', 'lunge', 'squat2', 'quadIso', 'calves', 'abs'],
  hingeDay: ['deadlift', 'glutes', 'hinge', 'hamIso', 'calves', 'abs'],
  acc: ['sideDelts', 'rearDelts', 'biceps', 'triceps', 'chestIso', 'calves', 'traps', 'abs']
});

/* Сплиты: дни (возможные количества) и тренировки по порядку */
export const SPLITS = Object.freeze({
  full_body: { days: [2, 3, 4, 5, 6], types: (n) => Array.from({ length: n }, (_, i) => ['fullA', 'fullB', 'fullC'][i % 3]) },
  upper_lower: { days: [2, 4], types: (n) => (n === 2 ? ['upperA', 'lowerA'] : ['upperA', 'lowerA', 'upperB', 'lowerB']) },
  ulf: { days: [3], types: () => ['upperA', 'lowerA', 'fullA'] },
  ppl: { days: [3], types: () => ['push', 'pull', 'legs'] },
  ppl6: { days: [6], types: () => ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
  pphs: { days: [4], types: () => ['push', 'squatDay', 'pull', 'hingeDay'] },
  ppl_acc: { days: [4], types: () => ['push', 'pull', 'legs', 'acc'] },
  pphs_acc: { days: [5], types: () => ['push', 'squatDay', 'pull', 'hingeDay', 'acc'] },
  ppl_ul: { days: [5], types: () => ['push', 'pull', 'legs', 'upperA', 'lowerA'] },
  pphs_ul: { days: [6], types: () => ['push', 'squatDay', 'pull', 'hingeDay', 'upperA', 'lowerA'] }
});
export const SPLIT_KEYS = Object.freeze(Object.keys(SPLITS));
export const GOALS = Object.freeze(['strength', 'hypertrophy', 'both']);
export const EXPERIENCE = Object.freeze(['beginner', 'intermediate', 'advanced']);

/* Сплиты под число дней; первый — по умолчанию */
export function splitsFor(days) {
  const auto = { 2: 'full_body', 3: 'full_body', 4: 'upper_lower', 5: 'ppl_ul', 6: 'ppl6' }[days];
  const list = SPLIT_KEYS.filter((k) => SPLITS[k].days.includes(days));
  return auto ? [auto].concat(list.filter((k) => k !== auto)) : list;
}

/* Дни недели тренировок (0 = пн): равномерно, с отдыхом между, где получается */
export function scheduleDays(n) {
  const map = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  if (!map[n]) throw new Error('invalid days: ' + n);
  return map[n];
}

const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };
const MAX_LEVEL = { beginner: 1, intermediate: 2, advanced: 2 };
const STRENGTH_CATS = new Set(['strength', 'powerlifting', null, undefined, '']);
const NEEDS_PARTNER = /partner/i; /* упражнения с партнёром в одиночную программу не ставим */

/* Кандидаты слота: сначала список базовых, потом справочник (паттерн / мышца), без повторов */
export function slotCandidates(slotKey, { catalog, isAvailable = () => true, exclude = [], experience = 'intermediate' }) {
  const slot = SLOTS[slotKey];
  if (!slot) throw new Error('unknown slot: ' + slotKey);
  const byId = catalog || {};
  const excluded = new Set(exclude || []);
  const maxLv = MAX_LEVEL[experience] != null ? MAX_LEVEL[experience] : 2;
  const ok = (e) => e && !e.archived && !excluded.has(e.id) && isAvailable(e) && (LEVEL_RANK[e.level] == null || LEVEL_RANK[e.level] <= maxLv);
  const first = slot.list.map((id) => byId[id]).filter(ok);
  const seen = new Set(first.map((e) => e.id));
  const iso = slot.role === 'iso' || slot.role === 'core';
  const rest = Object.values(byId).filter((e) => ok(e) && !seen.has(e.id) && STRENGTH_CATS.has(e.category) && e.type !== 'cardio' && !NEEDS_PARTNER.test(e.nameEn || '') &&
    (iso ? (e.primaryMuscles || [])[0] === slot.muscles[0] && (slot.role === 'core' ? e.type === 'core' : e.type === 'isolation')
      : e.pattern === slot.pattern && e.type === 'compound' && (e.primaryMuscles || []).some((m) => slot.muscles.includes(m))))
    .sort((a, b) => (LEVEL_RANK[a.level] || 0) - (LEVEL_RANK[b.level] || 0) || String(a.name).localeCompare(String(b.name), 'ru'));
  return first.concat(rest);
}

/* Минут на упражнение: подходы × (подход + отдых) + разминка перед основным */
export function itemMinutes(item, role) {
  const sets = item.sets || 0;
  const work = item.timeSec != null ? item.timeSec : GEN_SET_WORK_SEC;
  return (sets * (work + (GEN_REST_SEC[role] || GEN_REST_SEC.iso))) / 60 + (role === 'main' ? GEN_WARMUP_MIN_PER_MAIN : 0);
}

export function dayMinutes(items) {
  return GEN_SESSION_OVERHEAD_MIN + items.reduce((n, it) => n + itemMinutes(it, it.role), 0);
}

/* Цели упражнения по роли, цели и опыту */
function targetsFor(role, { goal, experience, exercise }) {
  const [repMin, repMax] = GEN_REP_RANGES[goal][role];
  const rir = GEN_RIR[role] + (experience === 'beginner' ? GEN_RIR_BEGINNER_ADD : 0);
  const timed = exercise && (exercise.metrics || []).includes('time') && !(exercise.metrics || []).includes('reps');
  return timed ? { repMin: null, repMax: null, timeSec: GEN_CORE_HOLD_SEC, rir: null } : { repMin, repMax, timeSec: null, rir };
}

/* Одна тренировка: слоты → упражнения, акценты (+1 / −1 подход), укладка во время */
export function buildDay(typeKey, opts) {
  const { catalog, goal = 'hypertrophy', experience = 'intermediate', minutes = 60, priorities = {}, used = {}, newId = () => '' } = opts;
  const spec = DAY_TYPES[typeKey];
  if (!spec) throw new Error('unknown day type: ' + typeKey);
  const taken = new Set();
  let items = [];
  spec.forEach((raw, order) => {
    const key = raw.replace('!', '');
    const slot = SLOTS[key];
    const role = raw.endsWith('!') ? 'main' : slot.role;
    const cands = slotCandidates(key, opts).filter((e) => !taken.has(e.id));
    if (!cands.length) return;
    /* тот же слот второй раз за неделю (PPL ×2, фулбади) — следующий вариант, если есть */
    const k = used[key] || 0;
    const ex = cands[k % Math.min(cands.length, role === 'main' ? 2 : 3)];
    used[key] = k + 1;
    taken.add(ex.id);
    const more = slot.muscles.some((m) => priorities[m] === 'more');
    const less = !more && slot.muscles.every((m) => priorities[m] === 'less');
    const sets = Math.max(GEN_MIN_SETS, GEN_SETS[role] + (more ? 1 : 0) - (less ? 1 : 0));
    items.push(Object.assign({ id: 'i' + newId(), exerciseId: ex.id, name: ex.name, sets, setType: 'normal', weight: null, restSec: null, group: '', groupKind: null, notes: '', alternatives: [], role, slot: key, order, priority: more ? 1 : less ? -1 : 0 }, targetsFor(role, { goal, experience, exercise: ex })));
  });
  /* время: сначала отрезаем «меньше внимания», затем с конца; акцентные — в последнюю очередь */
  const dropOrder = items.slice().sort((a, b) => a.priority - b.priority || b.order - a.order);
  for (const it of dropOrder) {
    if (dayMinutes(items) <= minutes || items.length <= GEN_MIN_EXERCISES) break;
    if (it.role === 'main') continue;
    items = items.filter((x) => x !== it);
  }
  for (let i = items.length - 1; i >= 0 && dayMinutes(items) > minutes; i--) {
    if (items[i].sets > GEN_MIN_SETS) { items[i] = Object.assign({}, items[i], { sets: items[i].sets - 1 }); i++; }
  }
  return items.map(({ role, slot, order, priority, ...it }) => Object.assign(it, { restSec: GEN_REST_SEC[role] }));
}

/* Программа целиком: { program, plans, stages }.
   opts: goal, experience, days (2–6), minutes (20–180), split (ключ SPLITS или 'auto'), priorities { мышца: 'more'|'less' },
   exclude [id], isAvailable(e), catalog { id: e }, periodization, deload, weeks (блок, с делоадом), repeat, startDate,
   name, newId(). Неверные параметры — ошибка; слот без доступных упражнений пропускается. */
export function generateProgram(opts) {
  const o = Object.assign({ goal: 'hypertrophy', experience: 'intermediate', days: 3, minutes: 60, split: 'auto', priorities: {}, exclude: [], periodization: 'linear', deload: 'end', weeks: 5, repeat: 'forever', name: '' }, opts);
  if (!GOALS.includes(o.goal)) throw new Error('unknown goal: ' + o.goal);
  if (!EXPERIENCE.includes(o.experience)) throw new Error('unknown experience: ' + o.experience);
  if (!Number.isInteger(o.days) || o.days < 2 || o.days > 6) throw new Error('invalid days: ' + o.days);
  if (!(o.minutes >= 20 && o.minutes <= 180)) throw new Error('invalid minutes: ' + o.minutes);
  if (!PERIODIZATIONS.includes(o.periodization)) throw new Error('unknown periodization: ' + o.periodization);
  if (!DELOADS.includes(o.deload)) throw new Error('unknown deload: ' + o.deload);
  if (!Number.isInteger(o.weeks) || o.weeks < 1 || o.weeks > 52) throw new Error('invalid weeks: ' + o.weeks);
  const split = o.split === 'auto' || !o.split ? splitsFor(o.days)[0] : o.split;
  if (!SPLITS[split]) throw new Error('unknown split: ' + split);
  if (!SPLITS[split].days.includes(o.days)) throw new Error('split ' + split + ' does not fit ' + o.days + ' days');
  const newId = o.newId || (() => Math.random().toString(36).slice(2, 10));
  const programId = 'pg-' + newId();
  const types = SPLITS[split].types(o.days);
  const wds = scheduleDays(o.days);
  const used = {};
  const plans = types.map((type, i) => ({
    id: 'p-' + newId(),
    name: '',
    type,
    programId,
    weekday: wds[i],
    sections: [{ id: 'main', name: '', kind: 'main', items: buildDay(type, Object.assign({}, o, { used, newId })) }],
    notes: '',
    archived: false,
    legacyKey: ''
  }));
  const days = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const p = plans.find((x) => x.weekday === wd);
    return { id: 'd' + wd, name: '', kind: p ? 'workout' : 'rest', planId: p ? p.id : null };
  });
  const program = {
    id: programId, name: o.name, color: '', icon: '', notes: '', goal: o.goal,
    blocks: [{ id: 'b1', name: '', weeks: o.weeks, days }],
    periodization: o.periodization, deload: o.weeks > 1 ? o.deload : 'none', repeat: o.repeat === 'once' ? 'once' : 'forever',
    startDate: o.startDate || null, status: 'active',
    split, experience: o.experience, minutes: o.minutes
  };
  const stages = ['equipment', 'experience', 'priorities', 'split', 'exercises', 'time'];
  return { program, plans, stages };
}

/* Плановые подходы в неделю по мышцам: основные — 1, вторичные — secondaryFactor */
export function plannedSets(plans, catalog, { secondaryFactor = 0.5 } = {}) {
  const out = {};
  for (const p of plans || []) {
    for (const s of p.sections || []) {
      for (const it of s.items || []) {
        const e = catalog[it.exerciseId];
        if (!e || !it.sets) continue;
        (e.primaryMuscles || []).forEach((m) => { out[m] = (out[m] || 0) + it.sets; });
        (e.secondaryMuscles || []).filter((m) => !(e.primaryMuscles || []).includes(m)).forEach((m) => { out[m] = (out[m] || 0) + it.sets * secondaryFactor; });
      }
    }
  }
  return out;
}

/* Активная программа (последняя по старту) или null */
export function activeProgram(programs) {
  return (programs || []).filter((p) => p && p.status === 'active').sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0] || null;
}

/* Неделя программы и её поправки: { week…, mods } или null (нет программы, до старта, закончилась) */
export function programWeekMods(program, date) {
  const wk = programWeek(program, date);
  if (!wk || wk.finished) return wk && wk.finished ? { finished: true, mods: null } : null;
  return Object.assign({}, wk, { mods: weekModifiers({ periodization: PERIODIZATIONS.includes(program.periodization) ? program.periodization : 'none', workWeek: wk.workWeek, deload: wk.deload }) });
}
