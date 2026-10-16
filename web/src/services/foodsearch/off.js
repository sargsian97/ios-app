/* Open Food Facts (openfoodfacts.org, данные — ODbL): поиск и продукт по штрихкоду.
   Значения *_100g в OFF приведены к граммам (энергия — ккал/кДж), переводим в единицы нашей модели. */

const BASE = 'https://world.openfoodfacts.org';
export const OFF_FIELDS = 'code,product_name,product_name_ru,product_name_en,generic_name_ru,brands,quantity,serving_size,serving_quantity,nutriments,nutrition_data_per';

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
export function offToFood(p) {
  if (!p) return null;
  const name = String(p.product_name_ru || p.product_name || p.generic_name_ru || p.product_name_en || '').trim();
  const nutrients = offNutrients(p.nutriments);
  if (!name || nutrients.kcal == null) return null;
  const unit = isLiquid(p) ? 'ml' : 'g';
  const sq = num(p.serving_quantity);
  const servings = sq > 0 ? [{ id: 'serving', label: String(p.serving_size || '').trim() || ('1 порция'), amount: sq, unit }] : [];
  return {
    name, brand: String(p.brands || '').split(',')[0].trim(), barcode: String(p.code || ''),
    source: 'off', sourceId: String(p.code || ''), base: { amount: 100, unit }, nutrients, servings, labelFormat: 'per100'
  };
}

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

export async function offSearch(q, opts = {}) {
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  const url = BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(s) + '&search_simple=1&action=process&json=1&page_size=' + (opts.pageSize || 20) + '&lc=ru&fields=' + OFF_FIELDS;
  const j = await getJson(url, opts);
  return ((j && j.products) || []).map(offToFood).filter(Boolean);
}
