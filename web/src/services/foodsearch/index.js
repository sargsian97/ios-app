/* Поиск продуктов: свои (продукты, рецепты) + Open Food Facts + USDA, объединённая выдача.
   Найденное в интернете сохраняется в свои продукты при выборе (кэш). */
import { offSearch, offProduct } from './off.js';
import { usdaSearch } from './usda.js';
import { recipeTotals, recipePer100 } from '../../domain/nutrition.js';
import { barcodeVariants } from '../barcode.js';

const USDA_KEY = 'journal.usdaKey';
export function getUsdaKey() { try { return localStorage.getItem(USDA_KEY) || ''; } catch (e) { return ''; } }
export function setUsdaKey(k) { try { if (k) localStorage.setItem(USDA_KEY, k); else localStorage.removeItem(USDA_KEY); } catch (e) { /* приватный режим */ } }

function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }

/* Свои продукты и рецепты, подходящие под запрос; пустой запрос — недавние */
export function searchLocal(repos, q, { limit = 40 } = {}) {
  const s = norm(q);
  const words = s.split(/\s+/).filter(Boolean);
  const match = (text) => words.every((w) => norm(text).includes(w));
  const foods = repos.food.list((f) => !f.archived && (!s || match(f.name + ' ' + f.brand))).map((f) => ({ kind: 'food', doc: f }));
  const recipes = repos.recipe.list((r) => !r.archived && (!s || match(r.name))).map((r) => ({ kind: 'recipe', doc: r }));
  const score = (x) => (norm(x.doc.name).startsWith(words[0] || '') ? 0 : 1);
  return foods.concat(recipes)
    .sort((a, b) => score(a) - score(b) || (b.doc.lastUsedAt || '').localeCompare(a.doc.lastUsedAt || '') || a.doc.name.localeCompare(b.doc.name))
    .slice(0, limit);
}

/* Рецепт как строка выдачи: ккал на 100 г готового */
export function recipeSummary(repos, recipe) {
  const resolve = (kind, id) => (kind === 'recipe' ? repos.recipe.get(id) : repos.food.get(id));
  try { const t = recipeTotals(recipe, resolve); return { totals: t, per100: recipePer100(t) }; }
  catch (e) { return { totals: { nutrients: {}, weight: 0, missing: [] }, per100: {}, error: e.message }; }
}

/* Поиск в интернете: { off: [...], usda: [...], errors: { off?, usda? } }; уже сохранённые — отбрасываются */
export async function searchOnline(repos, q, { usdaKey = getUsdaKey(), signal, fetch: f } = {}) {
  const have = new Set(repos.food.list().filter((x) => x.sourceId).map((x) => x.source + ':' + x.sourceId));
  const opts = { signal, fetch: f };
  const [off, usda] = await Promise.allSettled([offSearch(q, opts), usdaKey ? usdaSearch(q, Object.assign({ key: usdaKey }, opts)) : Promise.resolve([])]);
  const fresh = (list) => list.filter((x) => !have.has(x.source + ':' + x.sourceId));
  return {
    off: off.status === 'fulfilled' ? fresh(off.value) : [],
    usda: usda.status === 'fulfilled' ? fresh(usda.value) : [],
    errors: { off: off.status === 'rejected' ? off.reason : null, usda: usda.status === 'rejected' ? usda.reason : null }
  };
}

/* Сохранить найденный продукт в свои (или вернуть уже сохранённый) */
export async function saveOnlineFood(repos, food) {
  const same = repos.food.list((x) => x.source === food.source && x.sourceId && x.sourceId === food.sourceId)[0];
  if (same) return same;
  return repos.food.create(Object.assign({}, food, { lastUsedAt: new Date().toISOString() }));
}

/* Продукт по штрихкоду: свой → Open Food Facts (с сохранением) → null */
export async function findBarcode(repos, code, opts = {}) {
  const vs = barcodeVariants(code);
  if (!vs.length) return null;
  for (const c of vs) { const own = repos.food.byBarcode(c); if (own) return own; }
  for (const c of vs) {
    const off = await offProduct(c, opts);
    if (off) return saveOnlineFood(repos, off);
  }
  return null;
}
