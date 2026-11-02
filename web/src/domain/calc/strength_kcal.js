/* Расход силовой тренировки, v1: среднее двух оценок — по подходам (MET) и по среднему пульсу (Keytel) —
   без покоя (он уже в базовом расходе дня). Перенесено из правок журнала в артефакте (31.10.2026).
   Чистая функция: данные на входе, результат на выходе. Коэффициенты — STRENGTH_KCAL в constants.js. */
import { STRENGTH_KCAL as K } from './constants.js';

const num = (x) => (x === '' || x == null || !isFinite(Number(x)) ? null : Number(x));

/* Тип упражнения по названию (русские и английские слова) → ключ MET */
const KIND_RX = [
  [/планк|пресс|скручив|plank|crunch/i, 'core'],
  [/присед|румынск|станов|мост|ягодич|выпад|жим ног|гакк|болгар|squat|deadlift|lunge|thrust|bridge/i, 'legs'],
  [/бицепс|трицепс|мах|бабочк|развод|сгибан|разгибан|гиперэкст|кроссовер|curl|raise|fly|extension/i, 'iso'],
  [/жим|тяга|блок|отжим|подтяг|брус|гребл|row|press|pull|push/i, 'upper']
];
const SIDES_RX = /кажд(ая|ую|ой) (рук|ног)|на каждую|each (arm|leg|side)/i;

export function exerciseKind(name) {
  const n = String(name || '');
  for (const [re, kind] of KIND_RX) if (re.test(n)) return kind;
  return 'other';
}

/* Длительность подхода: замер таймера (dur, с), если он правдоподобен, иначе оценка по повторам или времени */
export function setWorkSec(s) {
  const t = num(s.timeSec), r = num(s.reps), d = num(s.dur);
  const est = t > 0 ? t + K.SET_SEC.timedExtra : r > 0 ? K.SET_SEC.base + K.SET_SEC.perRep * r : K.SET_SEC.unknown;
  if (d != null && d >= K.TIMED_SHARE.min * est && d <= K.TIMED_SHARE.max * est) return { sec: d, timed: true };
  return { sec: est, timed: false };
}

/* exercises: [{ name, sets: [{ reps, timeSec, dur, rest, done }] }] (dur и rest — секунды по таймеру)
   durationMin — вся тренировка по часам; avgHr — средний пульс; vo2max — если часы показывают; sex — 'male' | 'female'.
   → { kcal, bySets, byHr, hrGross, src: 'both' | 'hr' | 'sets', work, rest, done, timed, durationMin, restKcal, vo2 } или null */
export function strengthEstimate({ exercises = [], durationMin = null, avgHr = null, vo2max = null, weightKg = null, age = null, sex = 'male', base = null }, { version = 'v1' } = {}) {
  if (version !== 'v1') throw new Error('strengthEstimate: неизвестная версия ' + version);
  const W = num(weightKg) || K.DEFAULT_WEIGHT_KG, A = num(age) || K.DEFAULT_AGE;
  const dur = num(durationMin) > 0 ? num(durationMin) : null;
  const restPerMin = (num(base) || K.DEFAULT_BASE_KCAL) / 1440;
  const f = 3.5 * W / 200 / 60; /* ккал за секунду на 1 MET */
  let work = 0, workMet = 0, done = 0, timed = 0, restLogged = 0;
  exercises.forEach((e) => {
    const met = K.MET[exerciseKind(e.name)];
    const sides = SIDES_RX.test(String(e.name || '')) ? 2 : 1;
    (e.sets || []).forEach((s) => {
      if (!s || (s.done === false && num(s.reps) == null && num(s.timeSec) == null)) return;
      const w = setWorkSec(s);
      if (sides > 1 && !w.timed) w.sec *= sides;
      done++;
      if (w.timed) timed++;
      work += w.sec;
      workMet += (met - 1) * w.sec;
      if (num(s.rest) != null) restLogged += num(s.rest);
    });
  });
  const rest = dur ? Math.max(0, dur * 60 - work) : restLogged;
  const totalMin = dur || (work + rest) / 60;
  let bySets = null;
  if (done >= K.MIN_SETS && (dur || restLogged > 0)) bySets = (workMet + (K.REST_MET - 1) * rest) * f * K.EPOC;
  let byHr = null, hrGross = null;
  const hr = num(avgHr), vo2 = num(vo2max), hasVo2 = vo2 > K.VO2.min && vo2 < K.VO2.max;
  if (hr >= K.HR.min && hr <= K.HR.max && dur) {
    const female = sex === 'female';
    const c = hasVo2 ? (female ? K.KEYTEL.femaleVo2 : K.KEYTEL.maleVo2) : (female ? K.KEYTEL.female : K.KEYTEL.male);
    const perMin = (c.c + c.hr * hr + (hasVo2 ? c.vo2 * vo2 : 0) + c.w * W + c.age * A) / K.KJ_PER_KCAL;
    hrGross = Math.max(0, perMin * dur);
    byHr = Math.max(0, (perMin - restPerMin) * dur);
  }
  const parts = [bySets, byHr].filter((x) => x != null);
  if (!parts.length) return null;
  const kcal = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { kcal, bySets, byHr, hrGross, src: bySets != null && byHr != null ? 'both' : byHr != null ? 'hr' : 'sets', work, rest, done, timed, durationMin: totalMin, restKcal: totalMin * restPerMin, vo2: hasVo2 };
}
