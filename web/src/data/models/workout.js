/* Тренировки (спецификация, раздел 3): упражнения, оборудование, залы, программы, шаблоны,
   активная и завершённые тренировки, автоцели, настройки упражнения. Веса — в кг. */
import { model, f } from '../schema.js';

export const MUSCLES = Object.freeze([
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'lower_back',
  'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves', 'neck'
]);
export const PATTERNS = Object.freeze(['squat', 'hinge', 'lunge', 'push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'isolation', 'carry', 'core', 'cardio', 'other']);
export const METRICS = Object.freeze(['weight', 'reps', 'time', 'distance', 'assist']);
export const SET_TYPES = Object.freeze(['normal', 'warmup', 'failure', 'drop', 'myo', 'rest_pause']);
export const EX_TYPES = Object.freeze(['compound', 'isolation', 'core', 'cardio']);
export const EX_CATEGORIES = Object.freeze(['strength', 'stretching', 'plyometrics', 'powerlifting', 'olympic', 'strongman', 'cardio']);
export const EQUIPMENT_KEYS = Object.freeze(['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'smith', 'cable', 'machine', 'bench', 'pullup_bar', 'dip_bars', 'band', 'medicine_ball', 'exercise_ball', 'foam_roll', 'bodyweight', 'other']);

const muscleList = () => f.array(f.enum(MUSCLES), { max: 20 });
const scale5 = () => f.number({ min: 1, max: 5, int: true });

export const Exercise = model({
  name: 'Exercise',
  collection: 'exercises',
  fields: {
    name: f.string({ nullable: false, def: '', max: 160 }),
    nameEn: f.string({ def: '', max: 160 }),
    synonyms: f.array(f.string({ max: 160 }), { max: 30 }),
    type: f.enum(EX_TYPES),
    category: f.enum(EX_CATEGORIES),
    level: f.enum(['beginner', 'intermediate', 'expert']),
    pattern: f.enum(PATTERNS, { def: 'other' }),
    region: f.enum(['upper', 'lower', 'core', 'full']),
    laterality: f.enum(['bilateral', 'unilateral', 'alternating']),
    primaryMuscles: muscleList(),
    secondaryMuscles: muscleList(),
    jointActions: f.array(f.string({ max: 60 }), { max: 20 }),
    rom: scale5(),
    stability: scale5(),
    bodyweightShare: f.number({ min: 0, max: 1 }),
    equipment: f.array(f.string({ max: 60 }), { max: 20 }),
    prerequisites: f.array(f.string({ max: 60 }), { max: 10 }),
    exclusionGroups: f.array(f.string({ max: 60 }), { max: 10 }),
    metrics: f.array(f.enum(METRICS), { def: () => ['weight', 'reps'], max: 5 }),
    perSide: f.bool(),
    recommend: f.shape({ strength: scale5(), hypertrophy: scale5() }),
    role: f.enum(['main_compound', 'secondary_compound', 'isolation', 'core'], { nullable: true }),
    instructions: f.string({ def: '', max: 6000 }),
    source: f.enum(['user', 'library', 'legacy']),
    sourceId: f.string({ def: '' }),
    archived: f.bool()
  },
  check(o) { return o.name.trim() ? null : 'name: нужно название'; }
});

export const EquipmentGroup = model({
  name: 'EquipmentGroup',
  collection: 'equipmentGroups',
  fields: {
    name: f.string({ nullable: false, def: '' }),
    order: f.number({ def: 0, nullable: false })
  }
});

export const Equipment = model({
  name: 'Equipment',
  collection: 'equipment',
  fields: {
    name: f.string({ nullable: false, def: '' }),
    groupId: f.ref(),
    kind: f.enum(['free_weight', 'bar', 'band', 'cable', 'machine_stack', 'machine_plate', 'bench_rack', 'bodyweight', 'accessory', 'cardio']),
    custom: f.bool()
  }
});

const Plate = f.shape({ weight: f.number({ nullable: false, def: 0, min: 0, max: 100 }), unit: f.enum(['kg', 'lb']), count: f.number({ nullable: false, def: 2, min: 0, max: 100, int: true }), color: f.string({ def: '' }), bumper: f.bool() });

export const Gym = model({
  name: 'Gym',
  collection: 'gyms',
  fields: {
    name: f.string({ nullable: false, def: '' }),
    icon: f.string({ def: 'gym' }),
    template: f.enum(['commercial', 'garage', 'home', 'full', 'custom'], { def: 'custom' }),
    equipment: f.array(f.string({ max: 60 }), { max: 300 }),
    plates: f.array(Plate, { max: 40 }),
    bars: f.array(f.shape({ id: f.string({ def: '' }), name: f.string({ def: '' }), weight: f.number({ min: 0, max: 100 }) }), { max: 20 }),
    dumbbells: f.shape({ min: f.number({ min: 0 }), max: f.number({ min: 0 }), step: f.number({ min: 0 }), list: f.array(f.number({ min: 0 }), { max: 200 }) }),
    stacks: f.array(f.shape({ id: f.string({ def: '' }), name: f.string({ def: '' }), min: f.number({ min: 0 }), max: f.number({ min: 0 }), step: f.number({ min: 0 }), micro: f.array(f.number({ min: 0 }), { max: 10 }) }), { max: 50 }),
    isDefault: f.bool()
  }
});

/* Упражнение в шаблоне тренировки с целями */
const PlanExercise = f.shape({
  id: f.string({ def: '' }),
  exerciseId: f.ref(),
  name: f.string({ def: '' }),
  sets: f.number({ min: 0, max: 50, int: true }),
  repMin: f.number({ min: 0, max: 500, int: true }),
  repMax: f.number({ min: 0, max: 500, int: true }),
  timeSec: f.number({ min: 0, max: 86400 }),
  distanceM: f.number({ min: 0, max: 1e6 }),
  rir: f.number({ min: 0, max: 10 }),
  setType: f.enum(SET_TYPES),
  weight: f.number({ min: 0 }),
  restSec: f.number({ min: 0, max: 3600, int: true }),
  group: f.string({ def: '' }), /* суперсет или круг: одинаковая метка */
  groupKind: f.enum(['superset', 'circuit'], { nullable: true }),
  notes: f.string({ def: '' }),
  alternatives: f.array(f.string({ max: 160 }), { max: 10 })
});

export const WorkoutPlan = model({
  name: 'WorkoutPlan',
  collection: 'workoutPlans',
  fields: {
    name: f.string({ nullable: false, def: '' }),
    programId: f.ref(),
    weekday: f.number({ min: 0, max: 6, int: true }),
    sections: f.array(f.shape({ id: f.string({ def: '' }), name: f.string({ def: '' }), kind: f.enum(['main', 'warmup', 'finisher']), items: f.array(PlanExercise, { max: 60 }) }), { max: 10 }),
    notes: f.string({ def: '' }),
    archived: f.bool(),
    legacyKey: f.string({ def: '' }) /* A / B / C из журнала */
  }
});

export const WorkoutProgram = model({
  name: 'WorkoutProgram',
  collection: 'workoutPrograms',
  fields: {
    name: f.string({ nullable: false, def: '' }),
    color: f.string({ def: '' }),
    icon: f.string({ def: '' }),
    notes: f.string({ def: '' }),
    goal: f.enum(['hypertrophy', 'strength', 'both']),
    blocks: f.array(f.shape({
      id: f.string({ def: '' }),
      name: f.string({ def: '' }),
      weeks: f.number({ min: 1, max: 52, int: true, def: 4, nullable: false }),
      days: f.array(f.shape({ id: f.string({ def: '' }), name: f.string({ def: '' }), kind: f.enum(['workout', 'rest']), planId: f.ref() }), { max: 14 })
    }), { max: 20 }),
    periodization: f.enum(['none', 'linear', 'reverse', 'undulating']),
    deload: f.enum(['none', 'start', 'end']),
    repeat: f.enum(['forever', 'once']),
    startDate: f.date(),
    status: f.enum(['active', 'draft', 'archived'])
  }
});

/* Подход: что записано и что было целью */
const SetLog = f.shape({
  id: f.string({ def: '' }),
  type: f.enum(SET_TYPES),
  weight: f.number({ min: 0, max: 1000 }),
  assist: f.number({ min: 0, max: 500 }),
  reps: f.number({ min: 0, max: 1000 }),
  partials: f.number({ min: 0, max: 100, int: true }),
  timeSec: f.number({ min: 0, max: 86400 }),
  distanceM: f.number({ min: 0, max: 1e6 }),
  rir: f.number({ min: 0, max: 10 }),
  side: f.enum(['both', 'left', 'right']),
  perSide: f.bool(),
  done: f.bool(),
  doneAt: f.timestamp(),
  restSec: f.number({ min: 0, max: 86400 }),
  durSec: f.number({ min: 0, max: 86400 }),
  /* цель: что предложено; expanded / reason — от умной прогрессии (повторы вне диапазона и почему) */
  target: f.shape({ weight: f.number({ min: 0 }), reps: f.number({ min: 0 }), rir: f.number({ min: 0 }), timeSec: f.number({ min: 0 }), distanceM: f.number({ min: 0 }), assist: f.number({ min: 0 }), expanded: f.bool(), reason: f.string({ def: '' }) }, { nullable: true })
});

/* Кардио-сессия: время и дистанция — в подходе, остальное здесь */
const CardioLog = f.shape({
  speedKmh: f.number({ min: 0, max: 100 }),
  inclinePct: f.number({ min: -50, max: 50 }),
  avgHr: f.number({ min: 0, max: 260, int: true }),
  maxHr: f.number({ min: 0, max: 260, int: true }),
  kcalWatch: f.number({ min: 0, max: 20000 }),
  kcal: f.number({ min: 0, max: 20000 }),
  rpe: f.number({ min: 0, max: 10 }),
  steps: f.number({ min: 0, max: 200000, int: true }),
  inSteps: f.bool({ def: true }) /* шаги сессии уже входят в шаги дня */
}, { nullable: true });

const ExerciseLog = f.shape({
  id: f.string({ def: '' }),
  exerciseId: f.ref(),
  name: f.string({ def: '' }),
  planItemId: f.string({ def: '' }),
  group: f.string({ def: '' }),
  groupKind: f.enum(['superset', 'circuit'], { nullable: true }),
  target: f.shape({ sets: f.number({ min: 0 }), repMin: f.number({ min: 0 }), repMax: f.number({ min: 0 }), timeSec: f.number({ min: 0 }), rir: f.number({ min: 0 }), weight: f.number({ min: 0 }), restSec: f.number({ min: 0 }) }, { nullable: true }),
  sets: f.array(SetLog, { max: 100 }),
  cardio: CardioLog,
  notes: f.string({ def: '' }),
  skipped: f.bool()
});

const sessionFields = {
  date: f.date({ nullable: false, def: '1970-01-01' }),
  planId: f.ref(),
  programId: f.ref(),
  gymId: f.ref(),
  name: f.string({ def: '' }),
  startedAt: f.timestamp(),
  exercises: f.array(ExerciseLog, { max: 60 }),
  notes: f.string({ def: '' }),
  bodyweightKg: f.number({ min: 20, max: 400 }),
  /* пульс и калории с часов, шаги в зале, «ккал в расчёт» — для расхода за день */
  stats: f.shape({ avgHr: f.number({ min: 0, max: 260, int: true }), maxHr: f.number({ min: 0, max: 260, int: true }), kcalWatch: f.number({ min: 0, max: 20000 }), kcal: f.number({ min: 0, max: 20000 }), steps: f.number({ min: 0, max: 200000, int: true }) })
};

/* Идущая сейчас тренировка (одна) */
export const WorkoutSession = model({
  name: 'WorkoutSession',
  collection: 'workoutSessions',
  fields: Object.assign({}, sessionFields, {
    rest: f.shape({ startedAt: f.timestamp(), targetSec: f.number({ min: 0 }), exerciseId: f.string({ def: '' }), kind: f.string({ def: '' }) }, { nullable: true }),
    cursor: f.shape({ ei: f.number({ min: 0, int: true }), si: f.number({ min: 0, int: true }) }, { nullable: true }),
    events: f.array(f.shape({ at: f.timestamp(), kind: f.string({ def: '' }), data: f.any() }), { max: 2000 })
  })
});

/* Завершённая тренировка */
export const Workout = model({
  name: 'Workout',
  collection: 'workoutLogs',
  fields: Object.assign({}, sessionFields, {
    finishedAt: f.timestamp(),
    durationSec: f.number({ min: 0, max: 86400 * 2 }),
    records: f.array(f.shape({ exerciseId: f.ref(), kind: f.string({ def: '' }), value: f.number() }), { max: 200 }),
    source: f.enum(['app', 'legacy', 'import'])
  })
});

/* Рассчитанная цель на следующий раз; id — exerciseId */
export const AutoTarget = model({
  name: 'AutoTarget',
  collection: 'autoTargets',
  fields: {
    weight: f.number({ min: 0 }),
    reps: f.number({ min: 0 }),
    rir: f.number({ min: 0 }),
    expanded: f.bool(),
    reason: f.string({ def: '' }),
    basedOn: f.ref(),
    computedAt: f.timestamp()
  }
});

/* Свои настройки упражнения; id — exerciseId */
export const UserExerciseConfig = model({
  name: 'UserExerciseConfig',
  collection: 'exerciseConfigs',
  fields: {
    warmupScheme: f.string({ def: '' }),
    warmup: f.enum(['auto', 'always', 'never']),
    restSec: f.number({ min: 0, max: 3600, int: true }),
    restBetweenSidesSec: f.number({ min: 0, max: 3600, int: true }),
    loads: f.array(f.number({ min: 0 }), { max: 500 }), /* свои доступные веса для этого упражнения */
    barId: f.string({ def: '' }),
    stackId: f.string({ def: '' }),
    notes: f.string({ def: '' })
  }
});
