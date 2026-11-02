/* Сборка встроенной таблицы базовых продуктов из USDA National Nutrient Database for Standard Reference
   (SR28 / SR Legacy, общественное достояние, CC0): файлы ABBREV.txt и FOOD_DES.txt.
   Запуск: node scripts/build-foods.mjs <папка с ABBREV.txt и FOOD_DES.txt>
   Данные берутся, например, из npm-пакета fda-nutrient-database@1.0.2 (папка package/data) — это копия SR28;
   русские и армянские названия, синонимы, порции и пометки о приближениях — наши, из scripts/foods/ru-hy.json.
   Результат: web/data/foods-basic.json. Скрипт падает, если нет номера NDB, русского названия или пометки у производной. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { usdaNutrients } from '../web/src/services/foodsearch/usda.js';
import { scaleNutrients, addNutrients, roundNutrients } from '../web/src/data/models/nutrients.js';

const ROOT = new URL('../', import.meta.url).pathname;
const MAP = ROOT + 'scripts/foods/ru-hy.json';
const OUT = ROOT + 'web/data/foods-basic.json';
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'ABBREV.txt')) || !existsSync(join(dir, 'FOOD_DES.txt'))) {
  console.error('Укажи папку с ABBREV.txt и FOOD_DES.txt (SR28), например package/data из npm-пакета fda-nutrient-database@1.0.2');
  process.exit(1);
}

/* колонки ABBREV.txt (sr28_doc.pdf, с. 44) → номер нутриента USDA и единица; номера те же, что в API FoodData Central */
const COLS = [
  [2, '255', 'G'], [3, '208', 'KCAL'], [4, '203', 'G'], [5, '204', 'G'], [7, '205', 'G'], [8, '291', 'G'], [9, '269', 'G'],
  [10, '301', 'MG'], [11, '303', 'MG'], [12, '304', 'MG'], [13, '305', 'MG'], [14, '306', 'MG'], [15, '307', 'MG'], [16, '309', 'MG'], [17, '312', 'MG'], [18, '315', 'MG'], [19, '317', 'UG'],
  [20, '401', 'MG'], [21, '404', 'MG'], [22, '405', 'MG'], [23, '406', 'MG'], [24, '410', 'MG'], [25, '415', 'MG'], [26, '417', 'UG'], [30, '421', 'MG'], [31, '418', 'UG'],
  [33, '320', 'UG'], [40, '323', 'MG'], [41, '328', 'UG'], [43, '430', 'UG'], [44, '606', 'G'], [45, '645', 'G'], [46, '646', 'G'], [47, '601', 'MG']
];
const unq = (s) => String(s).replace(/^~|~$/g, '');
function parseSr(file) {
  const rows = new Map();
  readFileSync(file, 'latin1').split(/\r?\n/).forEach((line) => {
    if (!line) return;
    const p = line.split('^');
    rows.set(unq(p[0]), p);
  });
  return rows;
}
const abbrev = parseSr(join(dir, 'ABBREV.txt'));
const des = parseSr(join(dir, 'FOOD_DES.txt'));
if (!abbrev.size || abbrev.values().next().value.length !== 53) { console.error('ABBREV.txt: ожидалось 53 поля в строке'); process.exit(1); }

function nutrientsOf(ndb) {
  const p = abbrev.get(ndb);
  if (!p) throw new Error('NDB ' + ndb + ' нет в ABBREV.txt');
  const list = COLS.map(([i, num, unit]) => (p[i] === '' || p[i] == null ? null : { nutrientNumber: num, unitName: unit, value: Number(p[i]) })).filter(Boolean);
  return usdaNutrients(list);
}
function longDesc(ndb) { const p = des.get(ndb); return p ? unq(p[2]) : ''; }

const map = JSON.parse(readFileSync(MAP, 'utf8'));
const byId = new Map(map.map((m) => [m.id, m]));
const errors = [], warnings = [];
const items = [];
const built = new Map();
function build(m, stack = []) {
  if (built.has(m.id)) return built.get(m.id);
  if (!m.ru) errors.push(m.id + ': нет русского названия');
  if (!m.hy) warnings.push(m.id + ': нет армянского названия');
  if (stack.includes(m.id)) throw new Error('цикл в derive: ' + stack.concat(m.id).join(' → '));
  let nu, en;
  if (m.derive) {
    if (!m.approx) errors.push(m.id + ': у производной записи нужна пометка approx');
    let sum = {};
    m.derive.forEach(([id, share]) => {
      const src = byId.get(id);
      if (!src) { errors.push(m.id + ': в derive нет записи ' + id); return; }
      sum = addNutrients(sum, scaleNutrients(build(src, stack.concat(m.id)).nu, share));
    });
    nu = roundNutrients(sum, 2);
    en = m.derive.map(([id, share]) => Math.round(share * 100) + ' % ' + (byId.get(id) ? byId.get(id).ru.toLowerCase() : id)).join(' + ');
  } else {
    if (!m.ndb) { errors.push(m.id + ': нет номера NDB'); return { nu: {} }; }
    try { nu = nutrientsOf(m.ndb); } catch (e) { errors.push(e.message); return { nu: {} }; }
    en = longDesc(m.ndb);
  }
  if (nu.kcal == null) errors.push(m.id + ': нет калорий');
  const atw = 4 * (nu.protein || 0) + 4 * (nu.carbs || 0) + 9 * (nu.fat || 0) + 7 * (nu.alcohol || 0);
  if (nu.kcal != null && Math.abs(nu.kcal - atw) > Math.max(40, 0.2 * nu.kcal) && !(nu.alcohol == null && /beer|wine|distilled|vodka|пиво|вино|водка/i.test(en + m.ru))) warnings.push(m.id + ': ккал ' + nu.kcal + ' против 4Б+4У+9Ж = ' + Math.round(atw));
  const item = { id: m.id, n: m.ru, hy: m.hy || '', lat: m.lat || [], s: m.syn || [], c: m.cat || 'other', u: m.unit === 'ml' ? 'ml' : 'g', p: (m.portions || []).map((x) => ({ l: x.ru, g: x.amount })), en, nu };
  if (m.ndb) item.ndb = m.ndb;
  if (m.approx) item.a = m.approx;
  if (m.off) item.off = m.off;
  built.set(m.id, item);
  return item;
}
const ids = new Set();
map.forEach((m) => {
  if (ids.has(m.id)) errors.push('повтор id ' + m.id);
  ids.add(m.id);
  items.push(build(m));
});
if (errors.length) { console.error('Ошибки:\n  ' + errors.join('\n  ')); process.exit(1); }
warnings.forEach((w) => console.warn('Внимание: ' + w));
const out = {
  source: 'USDA National Nutrient Database for Standard Reference (SR28, 2015; те же значения в SR Legacy)',
  url: 'https://fdc.nal.usda.gov',
  license: 'CC0 1.0 (общественное достояние)',
  note: 'Русские и армянские названия, синонимы, порции и пометки о приближениях — свои (scripts/foods/ru-hy.json).',
  version: 1,
  items
};
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\{"id"/g, '\n{"id"') + '\n');
console.log('foods-basic.json: ' + items.length + ' продуктов, ' + Math.round(readFileSync(OUT).length / 1024) + ' КБ');
