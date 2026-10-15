/* Общие мелочи для расчётов. */

export const EPS = 1e-9; /* допуск на ошибки округления с плавающей точкой */

export function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/* округлить до digits знаков; −0 превращается в 0 */
export function roundTo(x, digits = 0) {
  const k = 10 ** digits;
  return Math.round(x * k) / k + 0;
}

export function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

export function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

/* функция нужной версии алгоритма; неизвестная версия — ошибка */
export function pickVersion(table, version) {
  if (typeof version === 'string' && Object.hasOwn(table, version)) return table[version];
  throw new Error('unknown version: ' + version);
}

export function checkSex(sex) {
  if (sex !== 'male' && sex !== 'female') throw new Error('unknown sex: ' + sex);
  return sex;
}

/* округлить до целых, сохранив сумму (метод наибольших остатков; при равенстве — раньше по списку) */
export function roundKeepSum(values, total = Math.round(values.reduce((a, b) => a + b, 0))) {
  const floors = values.map((v) => Math.floor(v + EPS));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = values.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k][1]] += 1;
  return floors;
}
