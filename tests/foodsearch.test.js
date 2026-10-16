import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { offToFood, offNutrients, offProduct, offSearch } from '../web/src/services/foodsearch/off.js';
import { usdaToFood, usdaNutrients, usdaSearch } from '../web/src/services/foodsearch/usda.js';
import { searchLocal, searchOnline, saveOnlineFood, findBarcode } from '../web/src/services/foodsearch/index.js';
import { createStore, memoryBackend } from '../web/src/data/store.js';
import { createRepos } from '../web/src/data/repos/index.js';
import { Food } from '../web/src/data/models/nutrition.js';

const fx = (n) => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url)));
const resp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('OFF: продукт → Food, единицы нутриентов', () => {
  const p = fx('off-product.json');
  const f = offToFood(Object.assign({ code: p.code }, p.product));
  assert.equal(f.name, 'Творог 5%');
  assert.equal(f.brand, 'Простоквашино');
  assert.equal(f.barcode, '4607001771562');
  assert.deepEqual(f.base, { amount: 100, unit: 'g' });
  assert.equal(f.nutrients.kcal, 121);
  assert.equal(f.nutrients.calcium, 164, 'г → мг');
  assert.equal(f.nutrients.vitamin_a, 30, 'г → мкг');
  assert.equal(f.nutrients.b12, 1.3);
  assert.equal(f.nutrients.sodium, 40, 'натрий из соли');
  assert.deepEqual(f.servings, [{ id: 'serving', label: '100 г', amount: 100, unit: 'g' }]);
  assert.deepEqual(Food.validate(Food.normalize(Object.assign({ id: 'x' }, f))), []);
});

test('OFF: поиск — жидкости в мл, кДж → ккал, без названия пропускаются, алкоголь', () => {
  const list = fx('off-search.json').products.map(offToFood).filter(Boolean);
  assert.deepEqual(list.map((f) => f.name), ['Молоко 3,2%', 'Кефир', 'Пиво светлое']);
  assert.equal(list[0].base.unit, 'ml');
  assert.equal(list[1].nutrients.kcal, 40);
  assert.equal(list[2].base.unit, 'ml');
  assert.equal(list[2].nutrients.alcohol, 3.55);
  assert.deepEqual(offNutrients(null), {});
  assert.equal(offToFood(null), null);
});

test('OFF: запросы по сети', async () => {
  const urls = [];
  const fetch = async (u) => { urls.push(u); if (u.includes('/product/000')) return resp({}, 404); if (u.includes('/product/')) return resp(fx('off-product.json')); return resp(fx('off-search.json')); };
  const p = await offProduct('4607 0017 71562', { fetch });
  assert.equal(p.name, 'Творог 5%');
  assert.match(urls[0], /\/api\/v2\/product\/4607001771562\.json/);
  assert.equal(await offProduct('000', { fetch }), null);
  assert.equal(await offProduct('', { fetch }), null);
  assert.equal((await offSearch('молоко', { fetch })).length, 3);
  assert.match(urls[urls.length - 1], /search_terms=%D0%BC/);
  assert.deepEqual(await offSearch('м', { fetch }), [], 'слишком короткий запрос');
  await assert.rejects(() => offSearch('молоко', { fetch: async () => resp({}, 500) }));
});

test('USDA: продукты, единицы, кДж, порция', () => {
  const list = fx('usda-search.json').foods.map(usdaToFood).filter(Boolean);
  assert.equal(list.length, 2);
  const egg = list[0];
  assert.equal(egg.name, 'Egg, whole, raw, fresh');
  assert.deepEqual([egg.nutrients.kcal, egg.nutrients.protein, egg.nutrients.calcium, egg.nutrients.b12, egg.nutrients.vitamin_d, egg.nutrients.cholesterol], [143, 12.6, 56, 0.89, 2, 372]);
  const bar = list[1];
  assert.equal(bar.nutrients.kcal, 400.1);
  assert.equal(bar.barcode, '012345678905');
  assert.deepEqual(bar.servings[0], { id: 'serving', label: '1 bar', amount: 60, unit: 'g' });
  assert.deepEqual(usdaNutrients([{ nutrientNumber: '301', unitName: 'IU', value: 5 }]), {}, 'неизвестная единица пропускается');
});

test('USDA: без ключа не ходит в сеть, ошибки ключа и лимита', async () => {
  let called = false;
  assert.deepEqual(await usdaSearch('egg', { key: '', fetch: async () => { called = true; } }), []);
  assert.equal(called, false);
  await assert.rejects(() => usdaSearch('egg', { key: 'k', fetch: async () => resp({}, 403) }), (e) => e.code === 'bad_key');
  await assert.rejects(() => usdaSearch('egg', { key: 'k', fetch: async () => resp({}, 429) }), (e) => e.code === 'rate_limited');
  const urls = [];
  const r = await usdaSearch('egg', { key: 'K1', fetch: async (u) => { urls.push(u); return resp(fx('usda-search.json')); } });
  assert.equal(r.length, 2);
  assert.match(urls[0], /api_key=K1/);
});

async function repos() { return createRepos(await createStore(memoryBackend())); }

test('поиск: свои продукты и рецепты, слова в любом порядке, ё = е', async () => {
  const r = await repos();
  await r.food.create({ name: 'Творог 5%', brand: 'Простоквашино' });
  await r.food.create({ name: 'Йогурт с творогом' });
  await r.food.create({ name: 'Ёжевика' });
  await r.food.create({ name: 'Старый творог', archived: true });
  await r.recipe.create({ name: 'Сырники из творога' });
  const res = searchLocal(r, 'твор');
  assert.deepEqual(res.map((x) => x.doc.name), ['Творог 5%', 'Йогурт с творогом', 'Сырники из творога']);
  assert.equal(res[2].kind, 'recipe');
  assert.equal(searchLocal(r, 'простоквашино творог').length, 1);
  assert.equal(searchLocal(r, 'ежевика').length, 1);
  assert.equal(searchLocal(r, '').length, 4);
});

test('поиск в интернете: объединение, ошибки не мешают, сохранённые скрываются', async () => {
  const r = await repos();
  const fetch = async (u) => (u.includes('openfoodfacts') ? resp(fx('off-search.json')) : resp({}, 500));
  let res = await searchOnline(r, 'молоко', { usdaKey: 'K', fetch });
  assert.equal(res.off.length, 3);
  assert.equal(res.usda.length, 0);
  assert.ok(res.errors.usda);
  const saved = await saveOnlineFood(r, res.off[0]);
  assert.equal(saved.source, 'off');
  assert.equal((await saveOnlineFood(r, res.off[0])).id, saved.id, 'второй раз не дублируется');
  res = await searchOnline(r, 'молоко', { usdaKey: '', fetch });
  assert.equal(res.off.length, 2);
});

test('штрихкод: свой продукт, потом OFF с сохранением, потом null', async () => {
  const r = await repos();
  await r.food.create({ name: 'Мой хлеб', barcode: '111' });
  let calls = 0;
  const fetch = async (u) => { calls++; return u.includes('4607001771562') ? resp(fx('off-product.json')) : resp({ status: 0 }); };
  assert.equal((await findBarcode(r, '111', { fetch })).name, 'Мой хлеб');
  assert.equal(calls, 0);
  const f = await findBarcode(r, '4607001771562', { fetch });
  assert.equal(f.name, 'Творог 5%');
  assert.equal(r.food.byBarcode('4607001771562').id, f.id);
  assert.equal(await findBarcode(r, '999', { fetch }), null);
});
