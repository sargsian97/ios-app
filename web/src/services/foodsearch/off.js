/* Open Food Facts (openfoodfacts.org, данные — ODbL): поиск и продукт по штрихкоду.
   Значения *_100g в OFF приведены к граммам (энергия — ккал/кДж), переводим в единицы нашей модели. */

const BASE = 'https://world.openfoodfacts.org';
export const OFF_FIELDS = 'code,product_name,product_name_ru,product_name_hy,product_name_en,generic_name_ru,brands,quantity,serving_size,serving_quantity,nutriments,nutrition_data_per,countries_tags,completeness,unique_scans_n';
const SAL = 'https://search.openfoodfacts.org';

/* ключ OFF → [наш ключ, множитель из граммов] */
const MAP = {
  proteins: ['protein', 1], fat: ['fat', 1], carbohydrates: ['carbs', 1], fiber: ['fiber', 1], sugars: ['sugars', 1],
  'added-sugars': ['added_sugar', 1], starch: ['starch', 1], 'saturated-fat': ['saturated_fat', 1],
  'monounsaturated-fat': ['monounsaturated_fat', 1], 'polyunsaturated-fat': ['polyunsaturated_fat', 1], 'trans-fat': ['trans_fat', 1],
  'omega-3-fat': ['omega3', 1], 'omega-6-fat': ['omega6', 1], cholesterol: ['cholesterol', 1e3], sodium: ['sodium', 1e3],
  'vitamin-a': ['vitamin_a', 1e6], 'vitamin-c': ['vitamin_c', 1e3], 'vitamin-d': ['vitamin_d', 1e6], 'vitamin-e': ['vitamin_e', 1e3],
  'vitamin-k': ['vitamin_k', 1e6], 'vitamin-b1': ['b1', 1e3], 'vitamin-b2': ['b2', 1e3], 'vitamin-pp': ['b3', 1e3],
  'pantothenic-acid': ['b5', 1e3], 'vitamin-b6': ['b6', 1e3], 'vitamin-b12': ['b12', 1e6], 'vitamin-b9': ['folate', 1e6], folates: ['folate', 1e6],
  choline: ['choline', 1e3], calcium: ['calcium', 1e3], iron: ['iron', 1e3], magnesium: ['magnesium', 1e3], phosphorus: ['phosphorus', 1e3],
  potassium: ['potassium', 1e3], zinc: ['zinc', 1e3], copper: ['copper', 1e3], manganese: ['manganese', 1e3], selenium: ['selenium', 1e6],
  caffeine: ['caffeine', 1e3]
};

function num(v) { const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; }
function round(x, d = 3) { const p = Math.pow(10, d); return Math.round(x * p) / p; }

export function offNutrients(nm) {
  const out = {};
  if (!nm) return out;
  let kcal = num(nm['energy-kcal_100g']);
  if (kcal == null && num(nm.energy_100g) != null) kcal = num(nm.energy_100g) / 4.184; /* energy_100g — в кДж */
  if (kcal != null && kcal >= 0) out.kcal = round(kcal, 1);
  Object.keys(MAP).forEach((k) => {
    const v = num(nm[k + '_100g']);
    if (v == null || v < 0 || out[MAP[k][0]] != null) return;
    out[MAP[k][0]] = round(v * MAP[k][1]);
  });
  if (out.sodium == null && num(nm.salt_100g) != null) out.sodium = round(num(nm.salt_100g) / 2.5 * 1e3);
  const alc = num(nm.alcohol_100g); /* % об. → г на 100 мл */
  if (alc != null && alc > 0) out.alcohol = round(alc * 0.789, 2);
  return out;
}

function isLiquid(p) { return /\d([.,]\d+)?\s*(ml|мл|cl|l|л)(?!\p{L})/iu.test(String(p.quantity || '') + ' ' + String(p.serving_size || '')); }

/* Продукт OFF → документ Food (без id); null, если нет ни названия, ни калорий */
/* Название по языкам: в Search-a-licious product_name — объект { ru, hy, en, main }, в старом поиске — поля product_name_ru и т. п. */
function names(p) {
  const pn = p.product_name && typeof p.product_name === 'object' ? p.product_name : null;
  const pick = (lang) => String((pn && pn[lang]) || p['product_name_' + lang] || '').trim();
  const main = String(pn ? (pn.main || '') : (p.product_name || '')).trim();
  return { ru: pick('ru'), hy: pick('hy'), en: pick('en'), main, generic: String(p.generic_name_ru || (p.generic_name && typeof p.generic_name === 'object' ? p.generic_name.ru : '') || '').trim() };
}

export function offToFood(p) {
  if (!p) return null;
  const nm = names(p);
  const name = nm.ru || nm.main || nm.generic || nm.en || nm.hy;
  const nutrients = offNutrients(p.nutriments);
  if (!name || nutrients.kcal == null) return null;
  const unit = isLiquid(p) ? 'ml' : 'g';
  const sq = num(p.serving_quantity);
  const servings = sq > 0 ? [{ id: 'serving', label: String(p.serving_size || '').trim() || ('1 порция'), amount: sq, unit }] : [];
  const countries = Array.isArray(p.countries_tags) ? p.countries_tags : [];
  return {
    name, brand: String(p.brands || '').split(',')[0].trim(), barcode: String(p.code || ''),
    source: 'off', sourceId: String(p.code || ''), base: { amount: 100, unit }, nutrients, servings, labelFormat: 'per100',
    /* служебное для ранжирования, в документ Food не сохраняется */
    meta: { nameRu: !!nm.ru, nameHy: !!nm.hy, nameEn: !!(nm.en || nm.main), countries, completeness: num(p.completeness) || 0, scans: num(p.unique_scans_n) || 0 }
  };
}
export function stripMeta(f) { const o = Object.assign({}, f); delete o.meta; delete o.score; delete o.check; return o; }

async function getJson(url, { fetch: f = fetch, signal } = {}) {
  const r = await f(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw Object.assign(new Error('OFF ' + r.status), { code: r.status === 404 ? 'not_found' : 'http' });
  return r.json();
}

/* Продукт по штрихкоду; null — нет в базе */
export async function offProduct(code, opts = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (!c) return null;
  try {
    const j = await getJson(BASE + '/api/v2/product/' + c + '.json?fields=' + OFF_FIELDS + '&lc=ru', opts);
    if (!j || j.status === 0 || !j.product) return null;
    return offToFood(Object.assign({ code: c }, j.product));
  } catch (e) {
    if (e.code === 'not_found') return null;
    throw e;
  }
}

/* Старый поиск search.pl; cc — страна продажи (жёсткий фильтр), без неё — мировая выдача по популярности */
export function offSearchUrl(q, { pageSize = 20, cc = '' } = {}) {
  return BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=' + pageSize + '&lc=ru' + (cc ? '&cc=' + cc : '') + '&fields=' + OFF_FIELDS;
}
export async function offSearch(q, opts = {}) {
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  const j = await (opts.load || getJson)(offSearchUrl(s, opts), opts);
  return ((j && j.products) || []).map(offToFood).filter(Boolean);
}

/* Search-a-licious: названия по языкам (ru, hy, en), фильтр по странам продажи прямо в запросе.
   terms — слово запроса и его синонимы: (мацун OR мацони OR մածուն) AND countries:("en:armenia" OR "en:russia") */
const quote = (t) => '"' + String(t).replace(/["\\]/g, ' ').trim() + '"';
export function salQuery(terms, countries = []) {
  const ts = [].concat(terms).map((t) => String(t).trim()).filter(Boolean);
  const words = ts.length > 1 ? '(' + ts.map(quote).join(' OR ') + ')' : quote(ts[0] || '');
  return countries.length ? words + ' AND countries:(' + countries.map(quote).join(' OR ') + ')' : words;
}
export function salUrl(terms, { countries = [], langs = ['ru', 'hy', 'en'], pageSize = 30 } = {}) {
  return SAL + '/search?q=' + encodeURIComponent(salQuery(terms, countries)) + '&langs=' + langs.join(',') + '&page_size=' + pageSize + '&boost_phrase=true&fields=' + OFF_FIELDS;
}
export async function salSearch(terms, opts = {}) {
  const j = await (opts.load || getJson)(salUrl(terms, opts), opts);
  return ((j && (j.hits || j.products)) || []).map(offToFood).filter(Boolean);
}

/* Поиск местных продуктов: Search-a-licious по Армении и России, при короткой выдаче — без стран;
   если Search-a-licious недоступен — старый поиск с cc=am и cc=ru параллельно (мировой не используется).
   opts.terms — синонимы запроса; opts.load(url) — загрузчик (кэш); opts.countries — страны.
   Возвращает { items, strategy } без повторов по штрихкоду. */
export async function offSearchLocal(q, { terms = [], countries = ['en:armenia', 'en:russia'], minLocal = 8, load, fetch: f, signal } = {}) {
  const s = String(q || '').trim();
  if (s.length < 2) return { items: [], strategy: 'none' };
  const all = [].concat(s, terms.filter((t) => t.toLowerCase() !== s.toLowerCase()));
  const opts = { load, fetch: f, signal };
  const dedupe = (lists) => { const seen = new Set(); return lists.flat().filter((x) => { if (!x || seen.has(x.sourceId)) return false; seen.add(x.sourceId); return true; }); };
  let salError = null;
  try {
    const local = await salSearch(all, Object.assign({ countries }, opts));
    if (local.length >= minLocal) return { items: local, strategy: 'sal-local' };
    const world = await salSearch(all, Object.assign({ countries: [] }, opts));
    const both = dedupe([local, world]);
    if (both.length) return { items: both, strategy: 'sal-world' };
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    salError = e;
  }
  /* Search-a-licious недоступен или совсем пуст — старый поиск по двум странам */
  const [am, ru] = await Promise.allSettled([offSearch(s, Object.assign({ cc: 'am' }, opts)), offSearch(s, Object.assign({ cc: 'ru' }, opts))]);
  if (am.status === 'rejected' && ru.status === 'rejected') throw salError || am.reason;
  return { items: dedupe([am.status === 'fulfilled' ? am.value : [], ru.status === 'fulfilled' ? ru.value : []]), strategy: 'cgi-cc' };
}
