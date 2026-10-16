/* Профиль: пол, дата рождения, рост, единицы, тема, язык, согласия (спецификация, раздел 3) */
import { model, f } from '../schema.js';
import { normalizeUnits, DEFAULT_UNITS } from '../../domain/units.js';

export const Profile = model({
  name: 'Profile',
  collection: 'profile',
  singleton: true,
  fields: {
    name: f.string({ def: '', max: 60 }),
    sex: f.enum(['male', 'female'], { nullable: true }),
    birthDate: f.date(),
    heightCm: f.number({ min: 50, max: 272 }),
    units: { def: () => ({ ...DEFAULT_UNITS }), normalize: normalizeUnits, validate: () => null },
    theme: f.enum(['system', 'light', 'dark']),
    lang: f.enum(['ru']),
    /* время согласия с медицинским дисклеймером */
    consents: f.shape({ medical: f.timestamp() }),
    onboardedAt: f.timestamp()
  },
  check(p) {
    if (p.birthDate) {
      const y = Number(p.birthDate.slice(0, 4));
      if (y < 1900) return 'birthDate: слишком рано';
    }
    return null;
  }
});

const WEEKDAY = (def = 0) => f.number({ nullable: false, def, min: 0, max: 6, int: true }); /* 0 — понедельник */

/* Настройки питания: ответы онбординга, дневник, видимость, чек-ин, режим расхода */
export const DietProfile = model({
  name: 'DietProfile',
  collection: 'dietProfile',
  singleton: true,
  fields: {
    /* онбординг (спецификация, 1.1) */
    bodyFatPct: f.number({ min: 2, max: 70 }),
    maxWeightKg: f.number({ min: 20, max: 400 }),
    recentTrend: f.enum(['stable', 'losing', 'gaining'], { nullable: true }),
    activity: f.enum(['sedentary', 'moderate', 'very_active'], { nullable: true }),
    trainingPerWeek: f.number({ min: 0, max: 14, int: true }),
    cardioExperience: f.enum(['lt1', '1to4', 'gt4'], { nullable: true }),
    strengthExperience: f.enum(['lt1', '1to4', 'gt4'], { nullable: true }),
    athlete: f.enum(['amateur', 'pro']),
    /* дневник */
    diaryView: f.enum(['timeline', 'classic']),
    timeline: f.shape({ startHour: f.number({ def: 6, nullable: false, min: 0, max: 23, int: true }), endHour: f.number({ def: 23, nullable: false, min: 0, max: 23, int: true }), hideEmpty: f.bool() }),
    banner: f.enum(['eaten_left', 'eaten', 'left', 'progress']),
    showOverages: f.bool(), /* показывать перебор калорий и макросов (по умолчанию нет — без «красных цифр») */
    loggerMode: f.enum(['context', 'speed']), /* context — карточка продукта; speed — сразу на тарелку с прошлой порцией */
    shortcuts: f.array(f.string({ max: 40 }), { def: () => ['search', 'scan', 'quick', 'photo'], max: 4 }),
    hiddenNutrients: f.array(f.string({ max: 40 }), { max: 100 }),
    pinnedUnits: f.array(f.string({ max: 40 }), { max: 10 }),
    /* расход и алгоритмы */
    tdeeMode: f.enum(['adaptive', 'fixed']),
    fixedTdee: f.number({ min: 500, max: 10000 }),
    stepsBoost: f.bool(),
    goalChangeCorrection: f.bool(),
    trendVersion: f.enum(['v1', 'v2', 'v3'], { def: 'v3' }),
    tdeeVersion: f.enum(['v1', 'v2'], { def: 'v2' }),
    bmrVersion: f.enum(['v1', 'v2'], { def: 'v2' }),
    athlete: f.bool(), /* ≥ 7 ч интенсивных тренировок в неделю — своя формула BMR (v2) */
    /* чек-ин */
    checkInWeekday: WEEKDAY(0),
    /* тело */
    cycleTracking: f.bool()
  }
});

/* Настройки тренировок: таймеры, разминка, прогрессия */
export const WorkoutProfile = model({
  name: 'WorkoutProfile',
  collection: 'workoutProfile',
  singleton: true,
  fields: {
    rest: f.shape({
      compound: f.number({ def: 150, nullable: false, min: 0, max: 3600, int: true }),
      isolation: f.number({ def: 90, nullable: false, min: 0, max: 3600, int: true }),
      betweenSides: f.number({ def: 15, nullable: false, min: 0, max: 3600, int: true }),
      afterWarmup: f.number({ def: 60, nullable: false, min: 0, max: 3600, int: true }),
      betweenExercises: f.number({ def: 120, nullable: false, min: 0, max: 3600, int: true })
    }),
    sound: f.bool({ def: true }),
    vibration: f.bool({ def: true }),
    keepAwake: f.bool({ def: true }),
    autoWarmup: f.bool({ def: true }),
    warmupScheme: f.string({ def: 'default' }),
    warmupOnlyIfNotWorked: f.bool({ def: true }),
    simplifyWarmupPlates: f.bool({ def: true }),
    autofill: f.bool({ def: true }),
    preferPrevWeight: f.bool(),
    expandRepRange: f.bool(),
    previousFrom: f.enum(['any', 'program']),
    autoScrollSupersets: f.bool({ def: true }),
    autoAdvance: f.bool({ def: true }),
    hideDoneSets: f.bool(),
    bodyweightFromTrend: f.bool({ def: true }),
    defaultGymId: f.ref()
  }
});
