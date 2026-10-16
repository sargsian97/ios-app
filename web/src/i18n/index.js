/* Локализация: t('ключ', { параметры }).
   Значение в каталоге — строка с {подстановками} или объект форм множественного числа
   { one, few, many, other } (форма выбирается по params.count). */
import ru from './ru.js';

const CATALOGS = { ru };
const FALLBACK = 'ru';
let lang = 'ru';
let plural = new Intl.PluralRules('ru-RU');
const LOCALE = { ru: 'ru-RU', en: 'en-US' };

export function setLang(l) {
  lang = CATALOGS[l] ? l : FALLBACK;
  plural = new Intl.PluralRules(LOCALE[lang] || lang);
}
export function getLang() { return lang; }
export function locale() { return LOCALE[lang] || lang; }
export function hasKey(key) { return Object.prototype.hasOwnProperty.call(CATALOGS[FALLBACK], key); }

export function t(key, params) {
  let v = (CATALOGS[lang] || {})[key];
  if (v == null) v = CATALOGS[FALLBACK][key];
  if (v == null) return key;
  if (typeof v === 'object') {
    const n = params && typeof params.count === 'number' ? params.count : 0;
    v = v[plural.select(n)] ?? v.other ?? '';
  }
  if (!params) return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] == null ? m : String(params[k])));
}

/* Числа и даты в формате языка: 84,5 · 1 250 · 16 окт. */
const nfCache = {};
export function fmtNum(n, digits = 0) {
  if (n == null || n === '' || !isFinite(n)) return '—';
  const k = lang + digits;
  const nf = nfCache[k] || (nfCache[k] = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
  return nf.format(n);
}

/* Ровно digits знаков после запятой: 82,0 */
export function fmtFix(n, digits = 1) {
  if (n == null || n === '' || !isFinite(n)) return '—';
  const k = 'f' + lang + digits;
  const nf = nfCache[k] || (nfCache[k] = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  return nf.format(n);
}

function toDate(ymd) { const p = String(ymd).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

export function fmtDate(ymd, style = 'short') {
  if (!ymd) return '—';
  const d = toDate(ymd);
  const o = style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' }
    : style === 'full' ? { day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'month' ? { month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(locale(), o).format(d);
}
