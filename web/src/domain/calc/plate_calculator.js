/* Калькулятор блинов и все веса, которые можно собрать на грифе (раздел 2.6).
   Считаем в граммах целыми числами и делим на НОД весов блинов — так перебор маленький и без ошибок округления. */
import { DEFAULT_BAR_WEIGHT } from './constants.js';
import { EPS, isNum, roundTo } from './util.js';

const G = 1000; /* кг → граммы */
const MAX_STATES = 5e6; /* защита от зависания на абсурдной цели с бесконечными блинами */

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function sideFactor(mode) {
  if (mode === 'per_side') return 2;
  if (mode === 'one_side') return 1;
  throw new Error('unknown mode: ' + mode);
}

/* Блины → типы { weight, units, count } по возрастанию веса; count — сколько можно повесить на одну сторону.
   per_side — пары (из 5 блинов на сторону идут 2), one_side — все. Повтор веса в списке — штуки складываются.
   count: число ≥ 0 (Infinity — без ограничений); вес ≤ 0, NaN или count < 0 — ошибка. */
function plateTypes(plates, mode) {
  const byUnits = new Map();
  for (const p of plates || []) {
    if (!p) continue;
    if (!isNum(p.weight) || p.weight <= 0) throw new Error('invalid plate weight: ' + p.weight);
    if (typeof p.count !== 'number' || Number.isNaN(p.count) || p.count < 0) throw new Error('invalid plate count: ' + p.count);
    const units = Math.round(p.weight * G);
    const t = byUnits.get(units) || { weight: p.weight, units, count: 0 };
    t.count += Math.floor(p.count);
    byUnits.set(units, t);
  }
  return [...byUnits.values()]
    .map((t) => ({ ...t, count: mode === 'per_side' ? Math.floor(t.count / 2) : t.count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => a.units - b.units);
}

/* Динамика по типам блинов: самый тяжёлый набор на сторону ≤ limit единиц, из него — с наименьшим числом блинов,
   а при равенстве — с более тяжёлыми блинами. Возвращает { units, plates (по убыванию) }. */
function bestCombo(types, limit) {
  if (!types.length || limit <= 0) return { units: 0, plates: [] };
  const g = types.reduce((acc, t) => gcd(acc, t.units), 0);
  const N = Math.floor(limit / g);
  if (N > MAX_STATES) throw new Error('слишком большой перебор блинов');
  let dp = new Float64Array(N + 1).fill(Infinity);
  dp[0] = 0;
  const choice = [];
  for (const t of types) {
    const w = t.units / g;
    const kMax = Math.min(t.count, Math.floor(N / w));
    const next = new Float64Array(N + 1).fill(Infinity);
    const ch = new Uint32Array(N + 1);
    for (let s = 0; s <= N; s++) {
      for (let c = Math.min(kMax, Math.floor(s / w)); c >= 0; c--) {
        const v = dp[s - c * w] + c;
        if (v < next[s]) { next[s] = v; ch[s] = c; }
      }
    }
    dp = next;
    choice.push(ch);
  }
  let s = N;
  while (s > 0 && dp[s] === Infinity) s--;
  const plates = [];
  let rest = s;
  for (let i = types.length - 1; i >= 0; i--) {
    const c = choice[i][rest];
    for (let k = 0; k < c; k++) plates.push(types[i].weight);
    rest -= c * (types[i].units / g);
  }
  return { units: s * g, plates };
}

/* Какие блины повесить: { perSide (по убыванию), total, remainder = target − total, exact, belowBar }.
   per_side — perSide на каждую сторону (вторая зеркальна), one_side — все блины на одну сторону.
   Точное сочетание находится всегда, когда оно есть (не жадно: 15 + 15 там, где жадный взял бы 20 и застрял).
   Точного нет — самый тяжёлый вес не больше цели. Цель легче грифа — belowBar: true, блинов нет,
   total = гриф, remainder отрицательный. Цель NaN, гриф < 0 — ошибка. */
export function platesFor({ target, barWeight = DEFAULT_BAR_WEIGHT, plates = [], mode = 'per_side' } = {}) {
  if (!isNum(target)) throw new Error('invalid target: ' + target);
  if (!isNum(barWeight) || barWeight < 0) throw new Error('invalid barWeight: ' + barWeight);
  const factor = sideFactor(mode);
  const types = plateTypes(plates, mode);
  if (target < barWeight - EPS) {
    return { perSide: [], total: barWeight, remainder: roundTo(target - barWeight, 6), exact: false, belowBar: true };
  }
  const capacity = types.reduce((a, t) => a + t.units * t.count, 0);
  const limit = Math.min(Math.floor(((target - barWeight) / factor) * G + 1e-6), capacity);
  const { units, plates: perSide } = bestCombo(types, limit);
  const total = roundTo(barWeight + (factor * units) / G, 6);
  const remainder = roundTo(target - total, 6);
  return { perSide, total, remainder, exact: Math.abs(remainder) < 1e-6, belowBar: false };
}

/* Все веса, которые можно собрать: по возрастанию, без повторов, от голого грифа до max.
   Бесконечные блины без max — ошибка (список был бы бесконечным). max легче грифа — []. */
export function achievableLoads({ barWeight = DEFAULT_BAR_WEIGHT, plates = [], mode = 'per_side', max = Infinity } = {}) {
  if (!isNum(barWeight) || barWeight < 0) throw new Error('invalid barWeight: ' + barWeight);
  if (typeof max !== 'number' || Number.isNaN(max)) throw new Error('invalid max: ' + max);
  const factor = sideFactor(mode);
  const types = plateTypes(plates, mode);
  if (max < barWeight - EPS) return [];
  if (!types.length) return [barWeight];
  const capacity = types.reduce((a, t) => a + t.units * t.count, 0);
  const byMax = max === Infinity ? Infinity : Math.floor(((max - barWeight) / factor) * G + 1e-6);
  const limit = Math.min(capacity, byMax);
  if (limit === Infinity) throw new Error('нужен max: блинов без ограничения');
  const g = types.reduce((acc, t) => gcd(acc, t.units), 0);
  const N = Math.floor(limit / g);
  if (N > MAX_STATES) throw new Error('слишком большой перебор блинов');
  const reach = new Uint8Array(N + 1);
  reach[0] = 1;
  for (const t of types) {
    const w = t.units / g;
    const used = new Float64Array(N + 1);
    for (let s = w; s <= N; s++) {
      if (!reach[s] && reach[s - w] && used[s - w] < t.count) {
        reach[s] = 1;
        used[s] = used[s - w] + 1;
      }
    }
  }
  const out = [];
  for (let s = 0; s <= N; s++) if (reach[s]) out.push(roundTo(barWeight + (factor * s * g) / G, 6));
  return out;
}
