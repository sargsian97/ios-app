/* Встроенная таблица базовых продуктов (web/data/foods-basic.json): значения на 100 г из USDA (CC0),
   русские и армянские названия и синонимы — свои. Грузится один раз, ищется офлайн, при выборе
   продукт сохраняется в «Мои продукты» (source: 'basic'), чтобы записи дневника ссылались на документ. */
import { prepare, rank, tokens, stemRu } from './match.js';

const URL_BASIC = new URL('../../../data/foods-basic.json', import.meta.url);
let table = null, promise = null;

export function basicCache() { return table; }

export function loadBasic(fetchFn = (u) => fetch(u)) {
  if (table) return Promise.resolve(table);
  if (!promise) {
    promise = fetchFn(URL_BASIC).then((r) => { if (!r.ok) throw new Error('foods-basic ' + r.status); return r.json(); })
      .then((d) => { table = Object.freeze(setTable(d)); return table; })
      .catch((e) => { promise = null; throw e; });
  }
  return promise;
}

/* Подготовить таблицу (из файла или теста): ключи поиска считаются один раз */
export function setTable(d) {
  const items = (d && d.items || []).map((it) => Object.assign({}, it, { key: prepare({ name: it.n, syn: it.s, other: [it.hy].concat(it.lat || []) }) }));
  table = { meta: { source: d.source, url: d.url, license: d.license, version: d.version }, items };
  return table;
}

/* Поиск по таблице; exclude — id, которые уже есть в своих продуктах (чтобы не дублировать строки) */
export function searchBasic(q, { limit = 12, exclude = null } = {}) {
  if (!table) return [];
  const list = exclude ? table.items.filter((it) => !exclude.has(it.id)) : table.items;
  return rank(list, q, { limit });
}

/* Синонимы запроса для поиска в интернете: русские, армянские и латинские формы продуктов, чьё название
   или синоним совпадает со словом запроса (по основе). Не больше limit слов, без повторов. */
export function synonymsFor(q, { limit = 6 } = {}) {
  if (!table) return [];
  const words = tokens(q).map(stemRu);
  if (!words.length) return [];
  const out = new Set();
  table.items.forEach((it) => {
    const own = [it.n].concat(it.s || []).map((s) => tokens(s).map(stemRu));
    const hit = own.some((ws) => ws.length <= 2 && words.every((w) => ws.some((x) => x.startsWith(w) || w.startsWith(x))));
    if (!hit) return;
    [it.n].concat(it.s || [], it.hy ? [it.hy] : [], it.lat || []).forEach((s) => { const t = String(s).toLowerCase().trim(); if (t && t.split(' ').length <= 2) out.add(t); });
  });
  return [...out].slice(0, limit);
}

/* Запись таблицы → документ Food (без id) */
export function basicToFood(it) {
  return {
    name: it.n, brand: '', barcode: '', source: 'basic', sourceId: it.id,
    base: { amount: 100, unit: it.u === 'ml' ? 'ml' : 'g' },
    nutrients: Object.assign({}, it.nu),
    servings: (it.p || []).map((p, i) => ({ id: 'p' + (i + 1), label: p.l, amount: p.g, unit: 'piece' })),
    labelFormat: 'per100',
    note: (it.a ? it.a + ' · ' : '') + 'USDA: ' + it.en
  };
}

/* Сохранить базовый продукт в свои (или вернуть уже сохранённый) */
export async function saveBasicFood(repos, it) {
  const same = repos.food.list((x) => x.source === 'basic' && x.sourceId === it.id)[0];
  if (same) return same;
  return repos.food.create(Object.assign(basicToFood(it), { lastUsedAt: new Date().toISOString() }));
}

/* id базовых продуктов, уже сохранённых в свои */
export function savedBasicIds(repos) {
  return new Set(repos.food.list((x) => x.source === 'basic' && x.sourceId && !x.archived).map((x) => x.sourceId));
}
