/* Тело (спецификация, раздел 3): взвешивания, замеры, шаги, фото прогресса, цикл,
   рассчитанные ряды тренда веса и расхода (кэш). */
import { model, f } from '../schema.js';

const DATE = () => f.date({ nullable: false, def: '1970-01-01' });
const SOURCE = () => f.enum(['manual', 'legacy', 'import', 'health']);
const CM = () => f.number({ min: 1, max: 400 });

/* hips — обхват бёдер по ягодицам; thigh*, biceps*, calf*, forearm* — левая и правая сторона */
export const MEASUREMENTS = Object.freeze(['neck', 'shoulders', 'chest', 'waist', 'hips', 'bicepsL', 'bicepsR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'calfL', 'calfR']);

/* Взвешивание; за день может быть несколько */
export const ScaleEntry = model({
  name: 'ScaleEntry',
  collection: 'scaleEntries',
  fields: {
    date: DATE(),
    time: f.time(),
    weightKg: f.number({ nullable: false, def: 0, min: 20, max: 400 }),
    bodyFatPct: f.number({ min: 2, max: 70 }),
    source: SOURCE()
  }
});

/* Замеры за день; id — дата */
export const BodyEntry = model({
  name: 'BodyEntry',
  collection: 'bodyEntries',
  fields: {
    date: DATE(),
    measurements: f.shape(Object.fromEntries(MEASUREMENTS.map((k) => [k, CM()]))),
    bodyFatPct: f.number({ min: 2, max: 70 }),
    note: f.string({ def: '', max: 1000 }),
    source: SOURCE()
  }
});

/* Шаги за день; id — дата */
export const StepsEntry = model({
  name: 'StepsEntry',
  collection: 'stepsEntries',
  fields: {
    date: DATE(),
    steps: f.number({ nullable: false, def: 0, min: 0, max: 200000, int: true }),
    source: SOURCE()
  }
});

export const ProgressPhoto = model({
  name: 'ProgressPhoto',
  collection: 'progressPhotos',
  fields: {
    date: DATE(),
    pose: f.enum(['front', 'side', 'back']),
    blobId: f.ref({ nullable: false }), /* сам снимок лежит в хранилище файлов */
    weightKg: f.number({ min: 20, max: 400 }),
    note: f.string({ def: '', max: 500 })
  }
});

export const PeriodEntry = model({
  name: 'PeriodEntry',
  collection: 'periodEntries',
  fields: {
    date: DATE(),
    kind: f.enum(['period', 'spotting', 'ovulation']),
    flow: f.number({ min: 1, max: 3, int: true }),
    note: f.string({ def: '', max: 500 })
  }
});

/* Рассчитанный тренд веса на день; id — дата */
export const TrendWeightEntry = model({
  name: 'TrendWeightEntry',
  collection: 'trendWeight',
  fields: {
    date: DATE(),
    trendKg: f.number({ nullable: false, def: 0, min: 0 }),
    version: f.string({ def: 'v1' })
  }
});

/* Расход энергии на день, зафиксированный в момент расчёта; id — дата */
export const TdeeEntry = model({
  name: 'TdeeEntry',
  collection: 'tdee',
  fields: {
    date: DATE(),
    tdee: f.number({ nullable: false, def: 0, min: 0 }),
    status: f.enum(['initial', 'ok', 'hold', 'fixed']),
    reason: f.string({ def: '' }),
    version: f.string({ def: 'v1' })
  }
});
