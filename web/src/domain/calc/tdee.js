/* Расход энергии (TDEE): стартовый и адаптивный по энергобалансу. */
import {
  ACTIVITY_FACTORS,
  KCAL_PER_KG_TISSUE,
  TDEE_FIRST_UPDATE_DAY,
  TDEE_WINDOW_DAYS,
  TDEE_SMOOTHING,
  TDEE_HOLD_NO_WEIGHIN_DAYS,
  TDEE_MIN_INTAKE_DAYS,
  TDEE_MIN_INTAKE_SHARE,
  TDEE_RAW_MIN,
  TDEE_RAW_MAX
} from './constants.js';
import { dayNumber, fromDayNumber } from './dates.js';
import { isNum, clamp, mean, pickVersion } from './util.js';

function positive(name, x) {
  if (!isNum(x) || x <= 0) throw new Error('invalid ' + name + ': ' + x);
  return x;
}

/* Стартовый расход: BMR × коэффициент активности. Неизвестная активность или BMR ≤ 0 — ошибка. */
export function initialTdee({ bmrKcal, activity } = {}) {
  positive('bmrKcal', bmrKcal);
  if (!Object.hasOwn(ACTIVITY_FACTORS, activity)) throw new Error('unknown activity: ' + activity);
  return bmrKcal * ACTIVITY_FACTORS[activity];
}

/* Сколько съедено за день для расчёта: ккал или null (день в расчёт не идёт).
   голодание → 0 (настоящий ноль, даже если что-то записано); частичный → null; logged === false → null;
   0 ккал или нет числа без отметки голодания → null (день, скорее всего, не записан). */
export function dayIntake(day) {
  if (!day) return null;
  if (day.fasting) return 0;
  if (day.partial || day.logged === false) return null;
  return isNum(day.kcal) && day.kcal > 0 ? day.kcal : null;
}

/* дни питания → Map(номер дня → ккал | null); повтор даты — берётся последний */
function intakeMap(days) {
  const m = new Map();
  for (const d of days || []) if (d) m.set(dayNumber(d.date), dayIntake(d));
  return m;
}

/* v1: окно до TDEE_WINDOW_DAYS дней, сырая оценка = среднее потребление − Δтренд × ккал/кг / дни,
   затем EMA по дням с долей TDEE_SMOOTHING, начиная со startTdee. */
function adaptiveV1({ days, trend, startTdee, startDate, endDate }) {
  const s = dayNumber(startDate), e = dayNumber(endDate);
  if (e < s) return [];
  const intake = intakeMap(days);
  const rows = (Array.isArray(trend) ? trend : [])
    .filter((r) => r && isNum(r.trend))
    .map((r) => ({ n: dayNumber(r.date), trend: r.trend, weighed: isNum(r.weight) }))
    .sort((a, b) => a.n - b.n);

  /* тренд на каждый день с переносом вперёд и дата последнего взвешивания */
  const trendAt = new Map(), lastWeigh = new Map();
  let i = 0, cur, lw = -Infinity;
  for (let n = s; n <= e; n++) {
    while (i < rows.length && rows[i].n <= n) {
      cur = rows[i].trend;
      if (rows[i].weighed) lw = rows[i].n;
      i++;
    }
    trendAt.set(n, cur);
    lastWeigh.set(n, lw);
  }

  const out = [];
  let est = startTdee;
  for (let n = s; n <= e; n++) {
    const date = fromDayNumber(n);
    if (n - s + 1 < TDEE_FIRST_UPDATE_DAY) { out.push({ date, tdee: startTdee, status: 'initial' }); continue; }
    const hold = (reason) => out.push({ date, tdee: est, status: 'hold', reason });
    if (n - lastWeigh.get(n) >= TDEE_HOLD_NO_WEIGHIN_DAYS) { hold('no_weighin'); continue; }
    let a = Math.max(s, n - TDEE_WINDOW_DAYS + 1);
    while (a < n && trendAt.get(a) === undefined) a++;
    const span = n - a;
    if (span < TDEE_FIRST_UPDATE_DAY - 1) { hold('short_window'); continue; }
    const vals = [];
    for (let m = a; m <= n; m++) {
      const v = intake.get(m);
      if (v !== null && v !== undefined) vals.push(v);
    }
    if (vals.length < Math.max(TDEE_MIN_INTAKE_DAYS, Math.ceil((span + 1) * TDEE_MIN_INTAKE_SHARE))) { hold('few_intake_days'); continue; }
    const raw = mean(vals) - ((trendAt.get(n) - trendAt.get(a)) * KCAL_PER_KG_TISSUE) / span;
    est += TDEE_SMOOTHING * (clamp(raw, TDEE_RAW_MIN, TDEE_RAW_MAX) - est);
    out.push({ date, tdee: est, status: 'ok' });
  }
  return out;
}

const TDEE_VERSIONS = { v1: adaptiveV1 };

/* Адаптивный расход на каждый день startDate..endDate: [{ date, tdee, status, reason? }].
   status: 'initial' — до TDEE_FIRST_UPDATE_DAY-го дня, значение = startTdee;
           'ok' — оценка обновлена;
           'hold' — оценка заморожена на прошлом значении, reason:
             'no_weighin' (нет взвешивания за TDEE_HOLD_NO_WEIGHIN_DAYS дней),
             'short_window' (тренд есть меньше чем за TDEE_FIRST_UPDATE_DAY − 1 дня окна),
             'few_intake_days' (мало дней с едой в окне);
           'fixed' — задан fixedTdee, он и возвращается.
   days — [{ date, kcal, partial?, fasting?, logged? }] (см. dayIntake); trend — результат trendWeight.
   Неверные startTdee / fixedTdee / даты — ошибка; startDate позже endDate — []. */
export function adaptiveTdee({ days = [], trend = [], startTdee, fixedTdee = null, version = 'v1', startDate, endDate } = {}) {
  const algo = pickVersion(TDEE_VERSIONS, version);
  dayNumber(startDate);
  dayNumber(endDate);
  if (fixedTdee !== null && fixedTdee !== undefined) {
    positive('fixedTdee', fixedTdee);
    const out = [];
    for (let n = dayNumber(startDate); n <= dayNumber(endDate); n++) out.push({ date: fromDayNumber(n), tdee: fixedTdee, status: 'fixed' });
    return out;
  }
  positive('startTdee', startTdee);
  return algo({ days, trend, startTdee, startDate, endDate });
}

/* Энергобаланс по дням: [{ date, intake, tdee, balance = intake − tdee }] по порядку дат.
   Пропускаем дни, которые не идут в расчёт (см. dayIntake), и дни без расхода в tdeeSeries. */
export function energyBalance(days, tdeeSeries) {
  const t = new Map();
  for (const r of tdeeSeries || []) if (r && isNum(r.tdee)) t.set(dayNumber(r.date), r.tdee);
  const out = [];
  for (const [n, intake] of [...intakeMap(days).entries()].sort((a, b) => a[0] - b[0])) {
    if (intake === null || !t.has(n)) continue;
    out.push({ date: fromDayNumber(n), intake, tdee: t.get(n), balance: intake - t.get(n) });
  }
  return out;
}
