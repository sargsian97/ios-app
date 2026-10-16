/* Подписи нутриентов, единиц и источников (ключи каталога строятся по имени нутриента). */
import { t, hasKey } from '../../i18n/index.js';

export function nutrientLabel(k) { const key = 'nutrient.' + k; return hasKey(key) ? t(key) : k; }
export function unitLabel(u) { const key = 'unit.' + u; return hasKey(key) ? t(key) : u; }
export function sourceLabel(s) { const key = 'food.src.' + s; return hasKey(key) ? t(key) : s; }
export function periodLabel(p) { const key = 'ai.period.' + p; return hasKey(key) ? t(key) : p; }
