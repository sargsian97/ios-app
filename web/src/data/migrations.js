/* Версии схемы данных и миграции.
   Версия 1 — данные старого журнала (коллекции workouts, body, templates, days, food, foods, settings, i18n).
   Каждая миграция возвращает список операций для store.batch и не удаляет старые записи. */
import { Profile } from './models/profile.js';
import { nutritionOps, bodyOps, workoutOps, stepsOps } from './legacy-migrate.js';

const META = 'meta', SCHEMA = 'schema';

export const MIGRATIONS = [
  {
    version: 2,
    name: 'profile',
    /* Профиль: рост и язык из настроек журнала, остальное по умолчанию */
    up(store, { now }) {
      if (store.get('profile', 'me')) return [];
      const legacy = store.get('settings', 'main') || {};
      const h = Number(legacy.height);
      const doc = Profile.normalize({
        id: 'me',
        heightCm: h >= 50 && h <= 272 ? h : null,
        lang: 'ru',
        createdAt: now,
        updatedAt: now
      });
      return [{ op: 'put', col: 'profile', id: 'me', data: doc }];
    }
  },
  {
    version: 3,
    name: 'nutrition',
    /* Продукты и дневник журнала → foodItems и foodEntries (этап 3) */
    up(store, { now }) {
      if (store.ids('foodEntries').length || store.ids('foodItems').length) return [];
      return nutritionOps(store, { now });
    }
  },
  {
    version: 4,
    name: 'body',
    /* Взвешивания и замеры журнала → scaleEntries и bodyEntries (этап 4); шаги пока остаются в журнале */
    up(store, { now }) {
      if (store.ids('scaleEntries').length || store.ids('bodyEntries').length) return [];
      return bodyOps(store, { now, steps: false });
    }
  },
  {
    version: 5,
    name: 'workouts',
    /* Шаблоны A/B/C, тренировки, кардио и шаги журнала → workoutPlans, workoutLogs, exercises, stepsEntries (этап 7) */
    up(store, { now }) {
      const ops = [];
      if (!store.ids('workoutLogs').length && !store.ids('workoutPlans').length) ops.push(...workoutOps(store, { now }));
      if (!store.ids('stepsEntries').length) ops.push(...stepsOps(store, { now }));
      return ops;
    }
  }
];

export const SCHEMA_VERSION = MIGRATIONS.reduce((v, m) => Math.max(v, m.version), 1);

export function schemaVersion(store) {
  const m = store.get(META, SCHEMA);
  return m && Number(m.version) > 0 ? Number(m.version) : 1;
}

export async function migrate(store, { now = new Date().toISOString(), migrations = MIGRATIONS } = {}) {
  const from = schemaVersion(store);
  const applied = [];
  let version = from;
  for (const m of migrations.slice().sort((a, b) => a.version - b.version)) {
    if (m.version <= version) continue;
    const ops = m.up(store, { now });
    const meta = store.get(META, SCHEMA) || {};
    const history = (meta.history || []).concat([{ version: m.version, name: m.name, at: now }]);
    await store.batch(ops.concat([{ op: 'put', col: META, id: SCHEMA, data: { version: m.version, history } }]));
    version = m.version;
    applied.push(m.name);
  }
  return { from, to: version, applied };
}
