/* USDA FoodData Central (fdc.nal.usda.gov, общественное достояние): поиск продуктов.
   Нужен свой бесплатный ключ api.data.gov — вводится в настройках, хранится на телефоне. */

const BASE = 'https://api.nal.usda.gov/fdc/v1';

/* номер нутриента USDA → наш ключ (единица в нашей модели) */
const MAP = {
  '203': 'protein', '204': 'fat', '205': 'carbs', '291': 'fiber', '269': 'sugars', '539': 'added_sugar', '209': 'starch',
  '606': 'saturated_fat', '645': 'monounsaturated_fat', '646': 'polyunsaturated_fat', '605': 'trans_fat', '601': 'cholesterol',
  '320': 'vitamin_a', '401': 'vitamin_c', '328': 'vitamin_d', '323': 'vitamin_e', '430': 'vitamin_k',
  '404': 'b1', '405': 'b2', '406': 'b3', '410': 'b5', '415': 'b6', '418': 'b12', '435': 'folate', '417': 'folate', '421': 'choline',
  '301': 'calcium', '303': 'iron', '304': 'magnesium', '305': 'phosphorus', '306': 'potassium', '307': 'sodium',
  '309': 'zinc', '312': 'copper', '315': 'manganese', '317': 'selenium', '262': 'caffeine', '221': 'alcohol', '255': 'water'
};
const UNIT = { protein: 'g', fat: 'g', carbs: 'g', fiber: 'g', sugars: 'g', added_sugar: 'g', starch: 'g', saturated_fat: 'g', monounsaturated_fat: 'g', polyunsaturated_fat: 'g', trans_fat: 'g', alcohol: 'g', water: 'ml',
  cholesterol: 'mg', vitamin_c: 'mg', vitamin_e: 'mg', b1: 'mg', b2: 'mg', b3: 'mg', b5: 'mg', b6: 'mg', choline: 'mg', calcium: 'mg', iron: 'mg', magnesium: 'mg', phosphorus: 'mg', potassium: 'mg', sodium: 'mg', zinc: 'mg', copper: 'mg', manganese: 'mg', caffeine: 'mg',
  vitamin_a: 'mcg', vitamin_d: 'mcg', vitamin_k: 'mcg', b12: 'mcg', folate: 'mcg', selenium: 'mcg' };
const TO_G = { G: 1, MG: 1e-3, UG: 1e-6, 'µG': 1e-6, ML: 1 };
const FROM_G = { g: 1, ml: 1, mg: 1e3, mcg: 1e6 };

function round(x, d = 3) { const p = Math.pow(10, d); return Math.round(x * p) / p; }

export function usdaNutrients(list) {
  const out = {};
  let kj = null;
  (list || []).forEach((n) => {
    const num = String(n.nutrientNumber || (n.nutrient && n.nutrient.number) || '');
    const value = Number(n.value != null ? n.value : n.amount);
    const unit = String(n.unitName || (n.nutrient && n.nutrient.unitName) || '').toUpperCase();
    if (!isFinite(value) || value < 0) return;
    if (num === '208' && unit === 'KCAL') { out.kcal = round(value, 1); return; }
    if (num === '268' || (num === '208' && unit === 'KJ')) { kj = value; return; }
    const key = MAP[num];
    if (!key || out[key] != null || !(unit in TO_G)) return;
    if (key === 'folate' && num === '417' && out.folate != null) return;
    out[key] = round(value * TO_G[unit] * FROM_G[UNIT[key]]);
  });
  if (out.kcal == null && kj != null) out.kcal = round(kj / 4.184, 1);
  return out;
}

function titleCase(s) { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }

export function usdaToFood(item) {
  if (!item) return null;
  const nutrients = usdaNutrients(item.foodNutrients);
  const name = titleCase(item.description).trim();
  if (!name || nutrients.kcal == null) return null;
  const sz = Number(item.servingSize), su = String(item.servingSizeUnit || '').toLowerCase();
  const servings = sz > 0 && (su === 'g' || su === 'ml' || su === 'grm' || su === 'mlt')
    ? [{ id: 'serving', label: String(item.householdServingFullText || (sz + ' ' + (su.startsWith('m') ? 'мл' : 'г'))), amount: sz, unit: su.startsWith('m') ? 'ml' : 'g' }] : [];
  return {
    name, brand: String(item.brandName || item.brandOwner || '').trim(), barcode: String(item.gtinUpc || ''),
    source: 'usda', sourceId: String(item.fdcId || ''), base: { amount: 100, unit: 'g' }, nutrients, servings, labelFormat: 'per100'
  };
}

export async function usdaSearch(q, { key, fetch: f = fetch, signal, pageSize = 20 } = {}) {
  const s = String(q || '').trim();
  if (!key || s.length < 2) return [];
  const url = BASE + '/foods/search?api_key=' + encodeURIComponent(key) + '&query=' + encodeURIComponent(s) + '&pageSize=' + pageSize + '&dataType=' + encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS),Branded');
  const r = await f(url, { signal, headers: { Accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('USDA: ключ не подходит'), { code: 'bad_key' });
  if (r.status === 429) throw Object.assign(new Error('USDA: лимит запросов'), { code: 'rate_limited' });
  if (!r.ok) throw Object.assign(new Error('USDA ' + r.status), { code: 'http' });
  const j = await r.json();
  return ((j && j.foods) || []).map(usdaToFood).filter(Boolean);
}
