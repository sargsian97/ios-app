/* Счётчики использования ИИ-функций: день, неделя (с понедельника), месяц. */
import { AI_LIMITS } from '../config.js';
import { UsageCounter } from '../data/models/service.js';

export function periodKeys(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(y, m - 1, d - wd)).toISOString().slice(0, 10);
  return { day: ymd, week: mon, month: ymd.slice(0, 7) };
}

function counts(doc, keys) {
  const o = {};
  ['day', 'week', 'month'].forEach((p) => { o[p] = doc && doc[p] && doc[p].key === keys[p] ? doc[p].count : 0; });
  return o;
}

/* { allowed, used: {day, week, month}, limit, blockedBy: 'day'|'week'|'month'|null } */
export function usageStatus(store, feature, ymd, limits = AI_LIMITS) {
  const limit = limits[feature];
  if (!limit) throw new Error('unknown AI feature: ' + feature);
  const used = counts(store.get(UsageCounter.collection, feature), periodKeys(ymd));
  const blockedBy = ['day', 'week', 'month'].find((p) => limit[p] > 0 && used[p] >= limit[p]) || null;
  return { allowed: !blockedBy, used, limit, blockedBy };
}

/* Операция для store.batch: +1 к счётчикам */
export function recordUseOp(store, feature, ymd, nowIso) {
  const keys = periodKeys(ymd);
  const doc = store.get(UsageCounter.collection, feature);
  const c = counts(doc, keys);
  const next = UsageCounter.normalize({
    id: feature,
    createdAt: (doc && doc.createdAt) || nowIso,
    updatedAt: nowIso,
    day: { key: keys.day, count: c.day + 1 },
    week: { key: keys.week, count: c.week + 1 },
    month: { key: keys.month, count: c.month + 1 }
  });
  return { op: 'put', col: UsageCounter.collection, id: feature, data: next };
}
