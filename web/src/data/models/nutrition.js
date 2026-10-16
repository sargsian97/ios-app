/* Сущности питания (спецификация, раздел 3): продукт, рецепт, запись дневника, день, избранное,
   цель, программа макросов, цели на день недели, микроцели, чек-ин и статусы его модулей. */
import { model, f } from '../schema.js';
import { isNutrientKey } from './nutrients.js';

const WEEKDAY = () => f.number({ nullable: false, def: 0, min: 0, max: 6, int: true }); /* 0 — понедельник */

/* { ключ нутриента: число ≥ 0 } — только известные ключи */
export function nutrientsField() {
  const base = f.record(f.number({ min: 0, max: 1e6 }));
  return {
    def: base.def,
    normalize: base.normalize,
    validate(v) {
      const e = base.validate(v);
      if (e) return e;
      const bad = Object.keys(v).find((k) => !isNutrientKey(k));
      return bad ? 'неизвестный нутриент: ' + bad : null;
    }
  };
}

const ref = (kinds) => f.shape({ kind: f.enum(kinds), id: f.ref() });

/* Порция продукта: «1 шт» = 60 г, «стакан» = 250 мл */
const Serving = f.shape({
  id: f.string({ def: '' }),
  label: f.string({ def: '' }),
  amount: f.number({ min: 0, max: 100000 }), /* в базовых единицах продукта (г или мл) */
  unit: f.enum(['g', 'ml', 'piece'])
});

export const Food = model({
  name: 'Food',
  collection: 'foodItems',
  fields: {
    name: f.string({ nullable: false, def: '', max: 200 }),
    brand: f.string({ def: '', max: 120 }),
    barcode: f.string({ def: '', max: 32 }),
    source: f.enum(['user', 'off', 'usda', 'legacy', 'ai']),
    sourceId: f.string({ def: '', max: 120 }),
    /* нутриенты указаны на base.amount base.unit, обычно 100 г */
    base: f.shape({ amount: f.number({ nullable: false, def: 100, min: 0.0001 }), unit: f.enum(['g', 'ml']) }),
    nutrients: nutrientsField(),
    servings: f.array(Serving, { max: 50 }),
    density: f.number({ min: 0.01, max: 5 }), /* г/мл — для перевода объёма в вес */
    labelFormat: f.enum(['per100', 'perServing']),
    photo: f.ref(),
    archived: f.bool(),
    lastUsedAt: f.timestamp()
  },
  check(o) { return o.name.trim() ? null : 'name: нужно название'; }
});

export const Recipe = model({
  name: 'Recipe',
  collection: 'recipes',
  fields: {
    name: f.string({ nullable: false, def: '', max: 200 }),
    ingredients: f.array(f.shape({
      ref: ref(['food', 'recipe']),
      name: f.string({ def: '' }),
      amount: f.number({ min: 0, max: 100000 }), /* граммы (или мл) ингредиента */
      servingId: f.string({ def: '' }),
      quantity: f.number({ min: 0 })
    }), { max: 200 }),
    steps: f.array(f.string({ max: 2000 }), { max: 100 }),
    prepMinutes: f.number({ min: 0, max: 10000, int: true }),
    cookMinutes: f.number({ min: 0, max: 10000, int: true }),
    cookedWeight: f.number({ min: 0 }), /* вес готового блюда, г */
    servings: f.number({ min: 0.01, max: 1000, def: 1, nullable: false }),
    sourceUrl: f.string({ def: '', max: 2000 }),
    photo: f.ref(),
    archived: f.bool(),
    lastUsedAt: f.timestamp()
  },
  check(o) {
    if (!o.name.trim()) return 'name: нужно название';
    if (o.ingredients.some((i) => i.ref.kind === 'recipe' && i.ref.id === o.id)) return 'ingredients: рецепт не может входить сам в себя';
    return null;
  }
});

export const FoodEntry = model({
  name: 'FoodEntry',
  collection: 'foodEntries',
  fields: {
    date: f.date({ nullable: false, def: '1970-01-01' }),
    time: f.time({ nullable: false, def: '12:00' }),
    ref: ref(['food', 'recipe', 'quick']),
    name: f.string({ def: '', max: 200 }),
    amount: f.number({ min: 0, max: 100000 }), /* граммы или мл */
    servingId: f.string({ def: '' }),
    quantity: f.number({ min: 0 }),
    /* снимок итоговых нутриентов записи — дневник не меняется, если продукт потом поправили */
    nutrients: nutrientsField(),
    meal: f.enum(['b', 'l', 'd', 's'], { nullable: true }),
    note: f.string({ def: '', max: 500 })
  }
});

/* День питания: id — дата */
export const DayEntry = model({
  name: 'DayEntry',
  collection: 'dayEntries',
  fields: {
    fasting: f.bool(),
    partial: f.bool(),
    manualTotals: { def: null, normalize: (v) => (v && typeof v === 'object' ? nutrientsField().normalize(v) : null), validate: (v) => (v == null ? null : nutrientsField().validate(v)) },
    note: f.string({ def: '', max: 2000 })
  },
  check(o) { return /^\d{4}-\d{2}-\d{2}$/.test(o.id) ? null : 'id: дата ГГГГ-ММ-ДД'; }
});

export const Favorite = model({
  name: 'Favorite',
  collection: 'favorites',
  fields: {
    ref: ref(['food', 'recipe']),
    servingId: f.string({ def: '' }),
    amount: f.number({ min: 0 }),
    order: f.number({ def: 0, nullable: false })
  }
});

export const Goal = model({
  name: 'Goal',
  collection: 'goals',
  fields: {
    type: f.enum(['lose', 'maintain', 'gain']),
    startWeightKg: f.number({ min: 20, max: 400 }),
    targetWeightKg: f.number({ min: 20, max: 400 }),
    ratePctPerWeek: f.number({ min: 0, max: 2 }), /* % массы тела в неделю */
    startDate: f.date(),
    targetDate: f.date(),
    forecast: f.enum(['data', 'goal', 'mixed']),
    maintainMinKg: f.number({ min: 20, max: 400 }),
    maintainMaxKg: f.number({ min: 20, max: 400 }),
    status: f.enum(['active', 'done', 'archived'])
  },
  check(o) {
    if (o.maintainMinKg != null && o.maintainMaxKg != null && o.maintainMinKg > o.maintainMaxKg) return 'maintain: нижняя граница больше верхней';
    return null;
  }
});

export const MacroProgram = model({
  name: 'MacroProgram',
  collection: 'macroPrograms',
  fields: {
    style: f.enum(['coached', 'collaborative', 'manual']),
    dietType: f.enum(['balanced', 'low_fat', 'low_carb', 'keto']),
    proteinLevel: f.enum(['moderate', 'low', 'high', 'very_high']),
    distribution: f.enum(['even', 'high_days']),
    highDays: f.array(f.number({ min: 0, max: 6, int: true }), { max: 7 }),
    floor: f.enum(['standard', 'low', 'ignore']),
    carbsAsRemainder: f.bool({ def: true }),
    trainingType: f.enum(['mixed', 'strength', 'cardio', 'none']),
    /* для manual: одинаково каждый день или по дням недели */
    sameEveryDay: f.bool({ def: true }),
    /* для collaborative: ограничения пользователя */
    limits: f.shape({ kcalMin: f.number({ min: 0 }), kcalMax: f.number({ min: 0 }), proteinMin: f.number({ min: 0 }) }),
    startDate: f.date(),
    active: f.bool({ def: true })
  }
});

/* Цели на день недели; id — `${validFrom}_${weekday}`, история сохраняется */
export const DayTarget = model({
  name: 'DayTarget',
  collection: 'dayTargets',
  fields: {
    programId: f.ref(),
    validFrom: f.date({ nullable: false, def: '1970-01-01' }),
    weekday: WEEKDAY(),
    kcal: f.number({ min: 0, max: 20000 }),
    protein: f.number({ min: 0, max: 2000 }),
    fat: f.number({ min: 0, max: 2000 }),
    carbs: f.number({ min: 0, max: 5000 })
  }
});

/* Цель по микронутриенту; id — ключ нутриента */
export const MicroGoal = model({
  name: 'MicroGoal',
  collection: 'microGoals',
  fields: {
    min: f.number({ min: 0 }),
    target: f.number({ min: 0 }),
    max: f.number({ min: 0 }),
    unit: f.string({ def: '' }),
    auto: f.bool({ def: true }) /* false — пользователь поправил вручную */
  },
  check(o) {
    if (!isNutrientKey(o.id)) return 'id: неизвестный нутриент';
    if (o.min != null && o.max != null && o.min > o.max) return 'min больше max';
    return null;
  }
});

export const CHECKIN_MODULES = Object.freeze(['intro', 'weighin', 'partial', 'fasting', 'break', 'program', 'notices']);

export const CheckIn = model({
  name: 'CheckIn',
  collection: 'checkIns',
  fields: {
    date: f.date({ nullable: false, def: '1970-01-01' }),
    weekStart: f.date(),
    modules: f.array(f.shape({ id: f.enum(CHECKIN_MODULES), status: f.enum(['shown', 'done', 'skipped']), decision: f.any() })),
    tdeeBefore: f.number({ min: 0 }),
    tdeeAfter: f.number({ min: 0 }),
    targetsBefore: f.any(),
    targetsAfter: f.any(),
    note: f.string({ def: '' })
  }
});

/* Состояние модуля чек-ина; id — модуль */
export const ModuleStatus = model({
  name: 'ModuleStatus',
  collection: 'checkInModules',
  fields: {
    enabled: f.bool({ def: true }),
    seen: f.bool(),
    lastShownAt: f.timestamp()
  },
  check(o) { return CHECKIN_MODULES.includes(o.id) ? null : 'id: неизвестный модуль'; }
});
