/* Адаптивный расход для экранов: считается по данным в памяти и кэшируется до изменения данных. */
import { useApp, useData, todayYmd } from '../core.js';
import { expenditure } from '../../domain/expenditure.js';
import { startingEstimate } from '../../domain/program.js';
import { addDays, trendWeight, goalChangeFactor, diffDays } from '../../domain/calc/index.js';

const COLS = ['foodEntries', 'dayEntries', 'scaleEntries', 'dietProfile', 'profile', 'goals'];
let cache = { key: null, value: null };

/* Стартовая оценка по профилю и весу на начало данных; null — если профиль не заполнен */
export function startTdeeFor(repos, weightKg, today) {
  const p = repos.profile.get(), dp = repos.dietProfile.get();
  if (!p.sex || !p.birthDate || !p.heightCm || !dp.activity || !weightKg) return null;
  const g = repos.goal.active();
  const rate = g ? (g.type === 'lose' ? -1 : g.type === 'gain' ? 1 : 0) * (g.ratePctPerWeek || 0) : 0;
  try { return startingEstimate({ sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, weightKg, bodyFatPct: dp.bodyFatPct, activity: dp.activity, today, version: dp.bmrVersion || 'v1', goalRatePct: rate, athlete: !!dp.athlete }).tdee; }
  catch (e) { return null; }
}

export function computeExpenditure({ store, repos }, today = todayYmd()) {
  const key = COLS.map((c) => store.version(c)).join('|') + '|' + today;
  if (cache.key === key) return cache.value;
  const dp = repos.dietProfile.get();
  const scale = repos.scaleEntry.list();
  const trend = trendWeight(scale.map((s) => ({ date: s.date, weight: s.weightKg })), { version: dp.trendVersion || 'v3' });
  const startW = trend.length ? trend[0].trend : null;
  const startTdee = startTdeeFor(repos, startW, today);
  const fixed = dp.tdeeMode === 'fixed' && dp.fixedTdee ? dp.fixedTdee : null;
  const value = expenditure({ foodEntries: repos.foodEntry.list(), dayEntries: repos.dayEntry.list(), scaleEntries: scale, startTdee, fixedTdee: fixed, version: dp.tdeeVersion || 'v2', trendVersion: dp.trendVersion || 'v3', today, addDays });
  /* поправка при смене цели (v2): расход сдвигается заранее и плавно за 2 недели */
  if (value && value.current && dp.goalChangeCorrection && value.current.status !== 'fixed') {
    const f = goalShift(repos, today);
    if (f !== 1) value.current = Object.assign({}, value.current, { tdee: value.current.tdee * f, goalShift: f });
  }
  cache = { key, value: value ? Object.assign({ startTdee }, value) : null };
  return cache.value;
}

export function useExpenditure() {
  const app = useApp();
  useData(COLS);
  return computeExpenditure(app);
}

/* Множитель расхода после смены цели: по активной цели и предыдущей (темпы со знаком) */
function goalShift(repos, today) {
  const signed = (g) => (g ? (g.type === 'lose' ? -1 : g.type === 'gain' ? 1 : 0) * (g.ratePctPerWeek || 0) : 0);
  const goals = repos.goal.list().slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const cur = repos.goal.active();
  if (!cur || !cur.startDate) return 1;
  const prev = goals.filter((g) => g.id !== cur.id && (g.startDate || '') <= cur.startDate).pop();
  if (!prev) return 1;
  const days = diffDays(cur.startDate, today);
  if (days < 0) return 1;
  return goalChangeFactor({ oldRatePct: signed(prev), newRatePct: signed(cur), daysSince: days });
}
