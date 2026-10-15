/* Единицы измерения. В базе всё хранится в метрических: кг, см, ккал, км.
   Здесь только перевод туда и обратно; подписи берутся из локализации по ключу unit.*. */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const KJ_PER_KCAL = 4.184;
export const KM_PER_MI = 1.609344;

export const DEFAULT_UNITS = Object.freeze({ weight: 'kg', length: 'cm', energy: 'kcal', distance: 'km', clock: '24h' });

export const UNIT_CHOICES = Object.freeze({
  weight: ['kg', 'lb'],
  length: ['cm', 'in'],
  energy: ['kcal', 'kj'],
  distance: ['km', 'mi'],
  clock: ['24h', '12h']
});

export const IMPERIAL = Object.freeze({ weight: 'lb', length: 'in', energy: 'kcal', distance: 'mi', clock: '12h' });

export function normalizeUnits(u) {
  const o = {};
  Object.keys(UNIT_CHOICES).forEach((k) => {
    o[k] = u && UNIT_CHOICES[k].includes(u[k]) ? u[k] : DEFAULT_UNITS[k];
  });
  return o;
}

/* kind: weight | length | energy | distance */
export function toDisplay(kind, metric, units) {
  if (metric == null || metric === '' || !isFinite(metric)) return null;
  const v = Number(metric), u = normalizeUnits(units);
  if (kind === 'weight') return u.weight === 'lb' ? v / KG_PER_LB : v;
  if (kind === 'length') return u.length === 'in' ? v / CM_PER_IN : v;
  if (kind === 'energy') return u.energy === 'kj' ? v * KJ_PER_KCAL : v;
  if (kind === 'distance') return u.distance === 'mi' ? v / KM_PER_MI : v;
  throw new Error('unknown unit kind: ' + kind);
}

export function fromDisplay(kind, value, units) {
  if (value == null || value === '') return null;
  const v = Number(String(value).replace(',', '.'));
  if (!isFinite(v)) return null;
  const u = normalizeUnits(units);
  if (kind === 'weight') return u.weight === 'lb' ? v * KG_PER_LB : v;
  if (kind === 'length') return u.length === 'in' ? v * CM_PER_IN : v;
  if (kind === 'energy') return u.energy === 'kj' ? v / KJ_PER_KCAL : v;
  if (kind === 'distance') return u.distance === 'mi' ? v * KM_PER_MI : v;
  throw new Error('unknown unit kind: ' + kind);
}

/* Ключ подписи единицы в каталоге локализации */
export function unitKey(kind, units) {
  return 'unit.' + normalizeUnits(units)[kind];
}

/* Рост в футах и дюймах: 180 см → { ft: 5, inch: 11 } */
export function cmToFtIn(cm) {
  if (!(cm > 0)) return null;
  let total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}
export function ftInToCm(ft, inch) {
  const f = Number(ft) || 0, i = Number(inch) || 0;
  if (f <= 0 && i <= 0) return null;
  return (f * 12 + i) * CM_PER_IN;
}

/* Время суток по настройке 12/24 ч: '07:05' / '7:05 AM' */
export function formatClock(h, m, clock) {
  const mm = String(m).padStart(2, '0');
  if (clock === '12h') {
    const ap = h < 12 ? 'AM' : 'PM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return hh + ':' + mm + ' ' + ap;
  }
  return String(h).padStart(2, '0') + ':' + mm;
}
