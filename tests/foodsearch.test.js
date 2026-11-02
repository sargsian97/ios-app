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

/* ---------- Search-a-licious, местный поиск, кэш, лимит, ранжирование ---------- */
import { salQuery, salUrl, salSearch, offSearchLocal, offSearchUrl, stripMeta } from '../web/src/services/foodsearch/off.js';
import { cachedJson, makeBudget, clearMemoryCache } from '../web/src/services/foodsearch/cache.js';
import { rankOff, scoreOff, kcalMismatch, RANK_WEIGHTS } from '../web/src/services/foodsearch/rank.js';

test('Search-a-licious: запрос с синонимами и странами, названия по языкам, служебные поля', () => {
  assert.equal(salQuery(['мацун', 'мацони', 'մածուն'], ['en:armenia', 'en:russia']), '("мацун" OR "мацони" OR "մածուն") AND countries:("en:armenia" OR "en:russia")');
  assert.equal(salQuery('кефир', []), '"кефир"');
  assert.equal(salQuery(['a"b']), '"a b"');
  const u = salUrl(['мацун'], { countries: ['en:armenia'] });
  assert.match(u, /^https:\/\/search\.openfoodfacts\.org\/search\?q=/);
  assert.match(u, /langs=ru,hy,en/);
  assert.match(u, /product_name_hy/);
  assert.match(offSearchUrl('тан', { cc: 'am' }), /cc=am/);
  const list = fx('off-sal.json').hits.map(offToFood).filter(Boolean);
  assert.equal(list.length, 8, 'без названия — пропускается');
  assert.equal(list[0].name, 'Мацун 3,2%');
  assert.equal(list[1].name, 'Մածուն 2,5%', 'без русского — основное название');
  assert.deepEqual(list[0].meta.countries, ['en:armenia']);
  assert.equal(list[0].meta.nameRu, true);
  assert.equal(list[1].meta.nameRu, false);
  assert.equal(list[1].meta.nameHy, true);
  assert.equal(stripMeta(list[0]).meta, undefined);
  assert.deepEqual(Food.validate(Food.normalize(Object.assign({ id: 'x' }, stripMeta(list[0])))), []);
});

test('местный поиск: по странам, при короткой выдаче — ещё без стран, при сбое — search.pl с cc', async () => {
  const urls = [];
  const loadOk = async (u) => { urls.push(u); return u.includes('countries%3A') ? fx('off-sal.json') : fx('off-sal-world.json'); };
  let r = await offSearchLocal('мацун', { terms: ['мацони'], load: loadOk });
  assert.equal(r.strategy, 'sal-local');
  assert.equal(r.items.length, 8);
  assert.equal(urls.length, 1);
  assert.match(decodeURIComponent(urls[0]), /"мацун" OR "мацони"/);
  urls.length = 0;
  const loadShort = async (u) => { urls.push(u); return u.includes('countries%3A') ? { hits: fx('off-sal.json').hits.slice(0, 2) } : fx('off-sal-world.json'); };
  r = await offSearchLocal('мацун', { load: loadShort });
  assert.equal(r.strategy, 'sal-world');
  assert.equal(r.items.length, 4, 'местные + мировые без повторов');
  assert.equal(urls.length, 2);
  urls.length = 0;
  const loadFail = async (u) => { urls.push(u); if (u.includes('search.openfoodfacts.org')) throw new Error('503'); return fx('off-search.json'); };
  r = await offSearchLocal('молоко', { load: loadFail });
  assert.equal(r.strategy, 'cgi-cc');
  assert.equal(r.items.length, 3, 'одинаковые ответы am и ru слиты по штрихкоду');
  assert.ok(urls.some((u) => /cc=am/.test(u)) && urls.some((u) => /cc=ru/.test(u)));
  assert.ok(!urls.some((u) => /search\.pl/.test(u) && !/cc=/.test(u)), 'мировой старый поиск не используется');
  assert.deepEqual(await offSearchLocal('м', { load: loadOk }), { items: [], strategy: 'none' });
  urls.length = 0;
  const loadEmpty = async (u) => { urls.push(u); return u.includes('search.openfoodfacts.org') ? { hits: [] } : fx('off-search.json'); };
  r = await offSearchLocal('молоко', { load: loadEmpty });
  assert.equal(r.strategy, 'cgi-cc', 'пустой Search-a-licious — тоже запасной путь');
  assert.equal(urls.length, 4);
  const loadNothing = async (u) => (u.includes('search.openfoodfacts.org') ? { hits: [] } : { products: [] });
  assert.deepEqual((await offSearchLocal('молоко', { load: loadNothing })).items, []);
});

test('кэш ответов (в памяти): второй запрос не ходит в сеть, срок истекает', async () => {
  clearMemoryCache();
  let n = 0;
  const loader = async () => ({ v: ++n });
  const a = await cachedJson('u1', loader, { now: 1000 });
  const b = await cachedJson('u1', loader, { now: 2000 });
  assert.deepEqual([a.cached, b.cached, b.data.v], [false, true, 1]);
  const c = await cachedJson('u1', loader, { now: 1000 + 8 * 24 * 3600 * 1000 });
  assert.deepEqual([c.cached, c.data.v], [false, 2]);
  await assert.rejects(() => cachedJson('u2', async () => { throw new Error('x'); }));
  assert.equal((await cachedJson('u2', loader)).cached, false, 'ошибка не кэшируется');
});

test('лимит запросов: не больше 8 в минуту, окно скользящее', () => {
  const b = makeBudget({ max: 3, windowMs: 1000 });
  assert.deepEqual([b.allow('k', 0), b.allow('k', 100), b.allow('k', 200), b.allow('k', 300)], [true, true, true, false]);
  assert.equal(b.allow('k', 1101), true, 'первый запрос вышел из окна');
  assert.equal(b.allow('other', 300), true);
});

test('ранжирование OFF: местные с русским названием и полными данными выше, несходящиеся калории помечаются', () => {
  const list = fx('off-sal.json').hits.map(offToFood).filter(Boolean);
  const ranked = rankOff(list, 'мацун');
  assert.equal(ranked[0].name, 'Мацун 3,2%');
  assert.ok(ranked.findIndex((x) => x.brand === 'Danone') > ranked.findIndex((x) => x.name === 'Мацони 3,2%'), 'французский йогурт ниже российского мацони');
  const bad = ranked.find((x) => x.name === 'Мацони' && x.brand === 'Кубанская бурёнка');
  assert.equal(bad.check, true, '400 ккал при 3/3/4 — проверь');
  assert.equal(ranked[0].check, false);
  assert.ok(kcalMismatch({ kcal: 400, protein: 3, fat: 3, carbs: 4 }));
  assert.ok(!kcalMismatch({ kcal: 60, protein: 3, fat: 3, carbs: 4 }));
  assert.ok(!kcalMismatch({ kcal: 400 }), 'без БЖУ не проверяем');
  const s = scoreOff(list[0], 'мацун', Object.assign({}, RANK_WEIGHTS, { soldAm: 0 }));
  assert.ok(s < scoreOff(list[0], 'мацун'));
});

test('поиск в интернете: синонимы, кэш, лимит и ранжирование вместе', async () => {
  clearMemoryCache();
  const r = await repos();
  const urls = [];
  const fetch = async (u) => { urls.push(u); return resp(u.includes('search.openfoodfacts.org') ? fx('off-sal.json') : fx('off-search.json')); };
  const budget = makeBudget({ max: 1, windowMs: 60000 });
  let res = await searchOnline(r, 'мацун', { usdaKey: '', fetch, budget, terms: ['мацони', 'matsun'] });
  assert.equal(res.strategy, 'sal-local');
  assert.equal(res.cached, false);
  assert.equal(res.off[0].name, 'Мацун 3,2%');
  assert.match(decodeURIComponent(urls[0]), /"matsun"/);
  res = await searchOnline(r, 'мацун', { usdaKey: '', fetch, budget, terms: ['мацони', 'matsun'] });
  assert.equal(res.cached, true, 'второй раз из кэша, лимит не тратится');
  assert.equal(urls.length, 1);
  res = await searchOnline(r, 'кефир', { usdaKey: '', fetch, budget, terms: [] });
  assert.equal(res.errors.off && res.errors.off.code, 'rate_limited', 'лимит исчерпан — понятная ошибка');
  assert.deepEqual(res.off, []);
});
