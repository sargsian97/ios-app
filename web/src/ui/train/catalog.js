/* Общее для экранов тренировок: справочник упражнений (встроенный + свои), подписи, форматирование подходов. */
import { useApp, useData, useState, useEffect, useMemo } from '../core.js';
import { t, hasKey, fmtNum } from '../../i18n/index.js';
import { mergeCatalog } from '../../domain/exercises.js';
import { loadLibrary, libraryCache } from '../../services/exercise-library.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { trendWeight } from '../../domain/calc/index.js';

/* Справочник: { ready, list, byId }. Пока встроенная база грузится — только свои упражнения. */
export function useCatalog() {
  const { store } = useApp();
  useData(['exercises']);
  const [lib, setLib] = useState(libraryCache());
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (!lib) loadLibrary().then(setLib).catch(() => { setFailed(true); setLib([]); }); }, []);
  const ver = store.version('exercises');
  const list = useMemo(() => mergeCatalog(lib || [], store.list('exercises')), [lib, ver]);
  const byId = useMemo(() => { const m = {}; list.forEach((e) => { m[e.id] = e; }); return m; }, [list]);
  return { ready: !!lib, failed, list, byId };
}

/* Название упражнения в записи: из справочника, иначе сохранённое в записи */
export function exName(entry, byId) {
  const e = entry && entry.exerciseId && byId ? byId[entry.exerciseId] : null;
  return (e && e.name) || (entry && entry.name) || t('train.ex.unknown');
}

const lab = (prefix) => (k) => (k != null && hasKey(prefix + k) ? t(prefix + k) : String(k == null ? '' : k));
export const muscleLabel = lab('muscle.');
export const groupLabel = lab('muscle.g.');
export const equipLabel = lab('equip.');
export const typeLabel = lab('extype.');
export const categoryLabel = lab('excat.');
export const patternLabel = lab('pattern.');
export const regionLabel = lab('region.');
export const lateralityLabel = lab('lat.');
export const levelLabel = lab('level.');
export const setTypeLabel = lab('settype.');
export const setTypeShort = lab('settype.s.');
export const metricLabel = lab('metric.');
export const recordLabel = lab('record.');
export const cardioTypeLabel = lab('cardio.t.');
export const whyLabel = lab('train.why.');
export const sideShort = lab('side.s.');
export const wdLabel = lab('wd.');
export const barLabel = lab('gym.bar.');
export const stackLabel = lab('gym.stack.');
export const tplLabel = lab('gym.tpl.');
export const tplSub = lab('gym.tplSub.');
export const eqCatLabel = lab('gym.cat.');
export const wdShort = lab('wd.s.');

/* Длительность: 75 → «1:15», 3725 → «1:02:05» */
export function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
}

/* Длительность словами: «1 ч 32 мин», «45 мин» */
export function fmtDuration(sec) {
  const m = Math.round((Number(sec) || 0) / 60);
  if (!m) return Number(sec) > 0 ? t('train.dur.lt1') : '—';
  const h = Math.floor(m / 60);
  return h ? t('train.dur.hm', { h, m: m % 60 }) : t('train.dur.m', { m });
}

export function weightUnit(units) { return t(unitKey('weight', units)); }
export function fmtWeight(kg, units, digits = 1) { return kg == null ? '—' : fmtNum(Math.round(toDisplay('weight', kg, units) * 100) / 100, digits); }

/* Подход одной строкой: «60 × 10», «+10 × 8», «−20 × 6», «1:00», «5,2 км за 30:00» */
export function fmtSet(s, units, { cardio = false } = {}) {
  if (!s) return '';
  const parts = [];
  if (cardio) {
    if (s.distanceM != null) parts.push(fmtNum(Math.round(toDisplay('distance', s.distanceM / 1000, units) * 100) / 100, 2) + ' ' + t(unitKey('distance', units)));
    if (s.timeSec != null) parts.push(fmtClock(s.timeSec));
    return parts.join(' · ');
  }
  const w = s.weight != null && s.weight > 0 ? fmtWeight(s.weight, units) : null;
  const a = s.assist != null && s.assist > 0 ? '−' + fmtWeight(s.assist, units) : null;
  if (s.reps != null) parts.push((w || a ? (w || a) + ' × ' : '') + fmtNum(s.reps));
  else if (w) parts.push(w + ' ' + weightUnit(units));
  if (s.timeSec != null) parts.push(fmtClock(s.timeSec));
  if (s.distanceM != null) parts.push(fmtNum(s.distanceM) + ' ' + t('unit.m'));
  let out = parts.join(' · ');
  if (s.partials) out += ' +' + s.partials;
  if (s.side === 'left' || s.side === 'right') out += ' ' + sideShort(s.side);
  return out;
}

/* Вес тела для упражнений с собственным весом: последний тренд-вес (или последнее взвешивание) */
export function currentBodyweight(repos) {
  const scale = repos.scaleEntry.list();
  if (!scale.length) return null;
  const dp = repos.dietProfile.get();
  const tr = trendWeight(scale.map((s) => ({ date: s.date, weight: s.weightKg })), { version: dp.trendVersion || 'v3' });
  const last = tr[tr.length - 1];
  return last && last.trend ? Math.round(last.trend * 10) / 10 : null;
}
