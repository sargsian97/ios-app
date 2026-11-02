/* Расход и цель «по журналу», v1 — запасной расчёт дня, когда программы питания нет.
   Перенесено из старого журнала (web/app.js: cfg, cardioEst, burn, weekStats) без изменения формул, с правками 31.10
   (силовая только по записанной тренировке, фиксированные шаги в зале). Чистые функции; коэффициенты — JOURNAL_DEFAULTS. */
import { JOURNAL_DEFAULTS as D } from './constants.js';
import { strengthEstimate } from './strength_kcal.js';

const num = (x) => (x === '' || x == null || !isFinite(Number(x)) ? null : Number(x));

/* Настройки с подстановкой значений по умолчанию (raw — документ expenditureSettings или объект старого журнала) */
export function journalConfig(raw = {}) {
  const r = raw || {};
  const pick = (a, b, def) => { const v = num(r[a]); if (v != null) return v; const w = num(r[b]); return w != null ? w : def; };
  return {
    base: pick('baseKcal', 'base', D.base), trainKcal: pick('trainKcal', 'trainKcal', D.trainKcal), gymSteps: pick('gymSteps', 'gymSteps', D.gymSteps),
    corrPct: pick('corrPct', 'corrPct', D.corrPct), offset: pick('offsetKcal', 'offset', D.offset),
    protein: pick('proteinG', 'protein', D.protein), fat: pick('fatG', 'fat', D.fat), fiber: pick('fiberG', 'fiber', D.fiber),
    kPer1000: pick('kcalPer1000Steps', 'kPer1000', null), stepLen: pick('stepLenM', 'stepLen', null)
  };
}

/* Вес на дату: последнее взвешивание не позже даты, иначе по умолчанию */
export function journalWeightOn(scaleEntries, date) {
  let best = null;
  (scaleEntries || []).forEach((s) => { if (s.date <= date && num(s.weightKg) != null && (!best || s.date > best.date || (s.date === best.date && (s.time || '') >= (best.time || '')))) best = s; });
  return best ? best.weightKg : D.weightKg;
}

/* Скорость и дистанция кардио: одно из них можно вывести из другого по времени */
function cardioMetrics(s) {
  const min = num(s.minutes) || 0;
  let v = num(s.speed) || 0, km = num(s.km) || 0;
  if (!v && km > 0 && min > 0) v = km / (min / 60);
  if (!km && v > 0 && min > 0) km = v * min / 60;
  return { min, v, km };
}

/* Кардио-сессия: { kcal, src: 'user' | 'acsm' | 'watch' | 'none', steps, stepsSrc: 'band' | 'stride' | '', stepLen, v, km, min }
   Ходьба/бег (дорожка, улица) при inSteps дают шаги: с браслета или по длине шага от роста. Ккал без покоя (он в базе). */
export function cardioEstimate(s, { weightKg, baseKcal, heightCm, stepLenM = null }) {
  const m = cardioMetrics(s), walkRun = s.type === 'treadmill' || s.type === 'outdoor';
  const out = { kcal: 0, src: 'none', steps: 0, stepsSrc: '', stepLen: 0, v: m.v, km: m.km, min: m.min };
  if (walkRun && s.inSteps !== false) {
    if (num(s.steps) > 0) { out.steps = num(s.steps); out.stepsSrc = 'band'; }
    else if (m.km > 0) {
      const H = (num(heightCm) || D.height) / 100;
      const len = num(stepLenM) != null ? num(stepLenM) : (m.v <= D.walkMaxKmh ? D.strideShare.walk : D.strideShare.run) * H;
      out.stepLen = len; out.steps = Math.round(m.km * 1000 / len); out.stepsSrc = 'stride';
    }
  }
  if (num(s.kcal) != null) { out.kcal = num(s.kcal); out.src = 'user'; return out; }
  if (walkRun && m.v > 0 && m.min > 0) {
    const sp = m.v * 1000 / 60, g = (s.type === 'treadmill' && num(s.incline) != null ? num(s.incline) : 0) / 100;
    const a = m.v <= D.walkMaxKmh ? D.acsm.walk : D.acsm.run;
    const vo2 = a.speed * sp + a.grade * sp * g;
    out.kcal = vo2 * (num(weightKg) || D.weightKg) * D.kcalPerLitreO2 / 1000 * m.min; out.src = 'acsm'; return out;
  }
  if (num(s.kcalWatch) != null && m.min > 0) { out.kcal = Math.max(0, num(s.kcalWatch) - (num(baseKcal) || D.base) / 1440 * m.min); out.src = 'watch'; return out; }
  return out;
}

/* Силовая за день в формате проекции журнала ({ exercises: [{ name, sets: [{ r, t, dur, rest, done }] }], durationMin, avgHr, vo2max, kcalWatch })
   → оценка strengthEstimate (или null, если данных мало) */
export function strengthForDay(w, { weightKg, age, sex = 'male', base }) {
  if (!w) return null;
  const exercises = (w.exercises || []).map((e) => ({
    name: e.name,
    sets: (e.sets || []).map((x) => {
      const t = num(x.t), r = num(x.r);
      const plank = t == null && /планк|plank/i.test(e.name || ''); /* старые записи без поля t: время планки лежало в r */
      return { reps: t != null || plank ? null : r, timeSec: t != null ? t : plank ? r : null, dur: num(x.dur), rest: num(x.rest), done: x.done };
    })
  }));
  const r = strengthEstimate({ exercises, durationMin: w.durationMin, avgHr: w.avgHr, vo2max: w.vo2max, weightKg, age, sex, base });
  if (r) r.watch = num(w.kcalWatch);
  return r;
}

/* Расход и цель дня. day — { steps, lifted, cardioOn, cardio: [...] } (из daysForLegacy), strength — strengthForDay(...) | null.
   → { base, steps, gymSteps, cardioSteps, cardioOn, cardioNet, k, stepK, train, trainTimer, lifted, raw, corr, burned, goal, offset, hasSteps, protein, fat, fiber } */
export function journalBurn({ settings, day = {}, strength = null, weightKg, heightCm = null }, { version = 'v1' } = {}) {
  if (version !== 'v1') throw new Error('journalBurn: неизвестная версия ' + version);
  const c = journalConfig(settings);
  const w = num(weightKg) || D.weightKg;
  const steps = num(day.steps) || 0;
  let cNet = 0, cSteps = 0;
  if (day.cardioOn) (day.cardio || []).forEach((s) => { const e = cardioEstimate(s, { weightKg: w, baseKcal: c.base, heightCm, stepLenM: c.stepLen }); cNet += e.kcal; cSteps += e.steps; });
  const k = c.kPer1000 != null ? c.kPer1000 : D.kcalPer1000StepsPerKg * w;
  const lifted = !!day.lifted;
  const gs = lifted ? c.gymSteps : 0; /* шаги в зале уже в калориях силовой */
  const stepsEff = Math.max(0, steps - cSteps - gs);
  const stepK = stepsEff * k / 1000;
  const sk = lifted ? strength : null;
  const train = lifted ? (sk ? sk.kcal : c.trainKcal) : 0;
  const raw = c.base + stepK + train + cNet;
  const burned = raw * (1 + c.corrPct / 100);
  return {
    base: c.base, steps, gymSteps: gs, cardioSteps: Math.min(cSteps, steps), cardioOn: !!day.cardioOn, cardioNet: cNet, k, stepK, train, trainTimer: !!sk, lifted,
    raw, corr: c.corrPct, burned, goal: burned + c.offset, offset: c.offset, hasSteps: num(day.steps) != null,
    protein: c.protein, fat: c.fat, fiber: c.fiber
  };
}

/* Средние за 7 дней до end включительно: days — [{ date, eaten (ккал | null, если записей нет), burned }], weights — взвешивания.
   → { n, eat, bur, w1 (средний вес за неделю), w0 (за предыдущую) } */
export function journalWeek({ end, days = [], weights = [], addDays }) {
  const lo = addDays(end, -6);
  let n = 0, eat = 0, bur = 0;
  days.forEach((d) => { if (d.date < lo || d.date > end || d.eaten == null) return; n++; eat += d.eaten; bur += d.burned || 0; });
  const avgW = (e) => {
    const from = addDays(e, -6);
    const v = weights.filter((s) => s.date >= from && s.date <= e && num(s.weightKg) != null).map((s) => s.weightKg);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { n, eat: n ? eat / n : 0, bur: n ? bur / n : 0, w1: avgW(end), w0: avgW(addDays(end, -7)) };
}
