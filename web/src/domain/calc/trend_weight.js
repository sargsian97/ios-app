/* Тренд веса, темп и прогноз даты цели. */
import {
  TREND_V1_ALPHA,
  TREND_V2_OUTLIER_HALF_WINDOW,
  TREND_V2_OUTLIER_K,
  TREND_V2_SIGMA_MIN,
  TREND_V2_OUTLIER_MIN_POINTS,
  TREND_V2_SMOOTH_HALF_WIDTH,
  MAD_TO_SIGMA,
  WEIGHT_RATE_DAYS,
  WEIGHT_RATE_MIN_DAYS,
  FORECAST_FLAT_KG_PER_WEEK,
  FORECAST_MAX_DAYS
} from './constants.js';
import { dayNumber, fromDayNumber, addDays } from './dates.js';
import { EPS, isNum, clamp, median, pickVersion } from './util.js';

/* Взвешивания → одно среднее на день, по порядку дат: [{ day, weight }].
   Пустой и неверный вес (null, NaN, ≤ 0) пропускаем; неверная дата при живом весе — ошибка. */
export function dailyWeights(entries) {
  const byDay = new Map();
  for (const e of entries || []) {
    if (!e || !isNum(e.weight) || e.weight <= 0) continue;
    const n = dayNumber(e.date);
    const s = byDay.get(n) || { sum: 0, count: 0 };
    s.sum += e.weight;
    s.count += 1;
    byDay.set(n, s);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, s]) => ({ day, weight: s.sum / s.count }));
}

/* v1: EMA только по прошлым точкам. Первый тренд = первый вес; без взвешивания тренд переносится. */
function trendV1(points, { alpha = TREND_V1_ALPHA }) {
  if (!isNum(alpha) || alpha <= 0 || alpha > 1) throw new Error('invalid alpha: ' + alpha);
  const byDay = new Map(points.map((p) => [p.day, p.weight]));
  const first = points[0].day, last = points[points.length - 1].day;
  const rows = [];
  let trend = points[0].weight;
  for (let n = first; n <= last; n++) {
    const w = byDay.has(n) ? byDay.get(n) : null;
    if (w !== null && n !== first) trend += alpha * (w - trend);
    rows.push({ date: fromDayNumber(n), weight: w, trend });
  }
  return rows;
}

/* v2, шаг 1: выбросы — фильтр Хампеля (медиана и MAD в окне ± N дней). */
function markOutliers(points) {
  const h = TREND_V2_OUTLIER_HALF_WINDOW;
  let lo = 0, hi = 0;
  return points.map((p) => {
    while (points[lo].day < p.day - h) lo++;
    while (hi < points.length && points[hi].day <= p.day + h) hi++;
    const win = points.slice(lo, hi).map((q) => q.weight);
    if (win.length < TREND_V2_OUTLIER_MIN_POINTS) return { ...p, outlier: false };
    const m = median(win);
    const sigma = Math.max(MAD_TO_SIGMA * median(win.map((w) => Math.abs(w - m))), TREND_V2_SIGMA_MIN);
    return { ...p, outlier: Math.abs(p.weight - m) > TREND_V2_OUTLIER_K * sigma };
  });
}

/* v2, шаг 2: локальная линейная регрессия с весами tricube вокруг дня x0.
   Если в окне меньше двух точек — окно расширяется вдвое (длинный пропуск). pts — по порядку дней. */
function localLinear(pts, x0) {
  let h = TREND_V2_SMOOTH_HALF_WIDTH;
  for (;;) {
    const near = pts.filter((p) => Math.abs(p.day - x0) <= h);
    if (near.length >= 2 || near.length === pts.length) {
      let sw = 0, sx = 0, sy = 0;
      const ws = near.map((p) => {
        const u = Math.abs(p.day - x0) / (h + 1);
        const w = (1 - u ** 3) ** 3;
        sw += w; sx += w * p.day; sy += w * p.weight;
        return w;
      });
      const mx = sx / sw, my = sy / sw;
      let sxx = 0, sxy = 0;
      near.forEach((p, i) => { sxx += ws[i] * (p.day - mx) ** 2; sxy += ws[i] * (p.day - mx) * (p.weight - my); });
      const y = sxx > EPS ? my + (sxy / sxx) * (x0 - mx) : my;
      /* за краем точек (пропуск, выброс в конце) не уводим линию дальше наблюдённых весов */
      if (x0 < near[0].day || x0 > near[near.length - 1].day) {
        const ys = near.map((p) => p.weight);
        return clamp(y, Math.min(...ys), Math.max(...ys));
      }
      return y;
    }
    h *= 2;
  }
}

/* v2: робастный двусторонний сглаживатель. Может пересматривать прошлые точки.
   Выбросы остаются в weight, но не влияют на trend; у них outlier: true. */
function trendV2(points) {
  const marked = markOutliers(points);
  const inliers = marked.filter((p) => !p.outlier);
  const fit = inliers.length ? inliers : points;
  const byDay = new Map(marked.map((p) => [p.day, p]));
  const first = points[0].day, last = points[points.length - 1].day;
  const rows = [];
  for (let n = first; n <= last; n++) {
    const p = byDay.get(n);
    const row = { date: fromDayNumber(n), weight: p ? p.weight : null, trend: localLinear(fit, n) };
    if (p && p.outlier) row.outlier = true;
    rows.push(row);
  }
  return rows;
}

const TREND_VERSIONS = { v1: trendV1, v2: trendV2 };

/* Тренд веса: по строке на каждый день от первого до последнего взвешивания.
   entries — [{ date, weight }] в любом порядке, несколько взвешиваний за день усредняются.
   Возвращает [{ date, weight: число | null, trend }]; нет данных — []. */
export function trendWeight(entries, { version = 'v1', alpha } = {}) {
  const algo = pickVersion(TREND_VERSIONS, version);
  const points = dailyWeights(entries);
  if (!points.length) return [];
  return algo(points, { alpha });
}

/* строки ряда с числовым трендом → [{ x: номер дня, y: тренд }] по порядку */
function trendPoints(series) {
  return (Array.isArray(series) ? series : [])
    .filter((r) => r && isNum(r.trend))
    .map((r) => ({ x: dayNumber(r.date), y: r.trend }))
    .sort((a, b) => a.x - b.x);
}

/* Темп, кг в неделю: наклон линейной регрессии тренда за последние `days` дней (до последней даты ряда).
   Меньше max(2, min(WEIGHT_RATE_MIN_DAYS, days)) точек — null. days — целое ≥ 2, иначе ошибка. */
export function weightRate(series, { days = WEIGHT_RATE_DAYS } = {}) {
  if (!Number.isInteger(days) || days < 2) throw new Error('invalid days: ' + days);
  const pts = trendPoints(series);
  if (!pts.length) return null;
  const end = pts[pts.length - 1].x;
  const win = pts.filter((p) => p.x > end - days);
  if (win.length < Math.max(2, Math.min(WEIGHT_RATE_MIN_DAYS, days))) return null;
  const mx = win.reduce((a, p) => a + p.x, 0) / win.length;
  const my = win.reduce((a, p) => a + p.y, 0) / win.length;
  let sxx = 0, sxy = 0;
  win.forEach((p) => { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); });
  if (sxx < EPS) return null;
  return (sxy / sxx) * 7;
}

/* Дата, когда тренд дойдёт до targetWeight при текущем темпе. «Сегодня» — последняя дата ряда.
   Уже на цели — сегодняшняя дата. null: нет данных, вес стоит, движется от цели, дальше FORECAST_MAX_DAYS.
   Неверный targetWeight (NaN, ≤ 0) — ошибка. */
export function forecastGoalDate(series, targetWeight, { days } = {}) {
  if (!isNum(targetWeight) || targetWeight <= 0) throw new Error('invalid targetWeight: ' + targetWeight);
  const pts = trendPoints(series);
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const today = fromDayNumber(last.x);
  const diff = targetWeight - last.y;
  if (Math.abs(diff) < 1e-6) return today;
  const rate = weightRate(series, { days });
  if (rate === null || Math.abs(rate) < FORECAST_FLAT_KG_PER_WEEK) return null;
  if (Math.sign(diff) !== Math.sign(rate)) return null;
  const n = Math.ceil(diff / (rate / 7) - EPS);
  if (n > FORECAST_MAX_DAYS) return null;
  return addDays(today, n);
}
