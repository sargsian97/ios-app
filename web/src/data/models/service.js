/* Служебные сущности: счётчики ИИ-функций и подключённые интеграции. */
import { model, f } from '../schema.js';

const COUNT = () => f.shape({ key: f.string({ def: '' }), count: f.number({ def: 0, nullable: false, min: 0, int: true }) });

/* Счётчик использования; id — функция (ai_photo, ai_text, ai_label, ai_recipe, ai_stack, ai_fill) */
export const UsageCounter = model({
  name: 'UsageCounter',
  collection: 'usage',
  fields: { day: COUNT(), week: COUNT(), month: COUNT() }
});

/* Интеграция; id — источник (apple_health, health_connect, …) */
export const Integration = model({
  name: 'Integration',
  collection: 'integrations',
  fields: {
    enabled: f.bool(),
    read: f.array(f.string({ max: 40 }), { max: 20 }),
    write: f.array(f.string({ max: 40 }), { max: 20 }),
    lastSyncAt: f.timestamp()
  }
});
