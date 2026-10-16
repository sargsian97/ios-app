/* Адаптивный расход для экранов: считается по данным в памяти и кэшируется до изменения данных. */
import { useApp, useData, todayYmd } from '../core.js';
import { expenditure } from '../../domain/expenditure.js';
import { startingEstimate } from '../../domain/program.js';
import { addDays, trendWeight } from '../../domain/calc/index.js';

const COLS = ['foodEntries', 'dayEntries', 'scaleEntries', 'dietProfile', 'profile'];
let cache = { key: null, value: null };

/* Стартовая оценка по профилю и весу на начало данных; null — если профиль не заполнен */
export function startTdeeFor(repos, weightKg, today) {
  const p = repos.profile.get(), dp = repos.dietProfile.get();
  if (!p.sex || !p.birthDate || !p.heightCm || !dp.activity || !weightKg) return null;
  try { return startingEstimate({ sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, weightKg, bodyFatPct: dp.bodyFatPct, activity: dp.activity, today }).tdee; }
  catch (e) { return null; }
}

export function computeExpenditure({ store, repos }, today = todayYmd()) {
  const key = COLS.map((c) => store.version(c)).join('|') + '|' + today;
  if (cache.key === key) return cache.value;
  const dp = repos.dietProfile.get();
  const scale = repos.scaleEntry.list();
  const trend = trendWeight(scale.map((s) => ({ date: s.date, weight: s.weightKg })), { version: dp.trendVersion || 'v1' });
  const startW = trend.length ? trend[0].trend : null;
  const startTdee = startTdeeFor(repos, startW, today);
  const fixed = dp.tdeeMode === 'fixed' && dp.fixedTdee ? dp.fixedTdee : null;
  const value = expenditure({ foodEntries: repos.foodEntry.list(), dayEntries: repos.dayEntry.list(), scaleEntries: scale, startTdee, fixedTdee: fixed, version: dp.tdeeVersion || 'v1', trendVersion: dp.trendVersion || 'v1', today, addDays });
  cache = { key, value: value ? Object.assign({ startTdee }, value) : null };
  return cache.value;
}

export function useExpenditure() {
  const app = useApp();
  useData(COLS);
  return computeExpenditure(app);
}
