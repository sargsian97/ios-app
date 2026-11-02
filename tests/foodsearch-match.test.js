import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, stemRu, translit, latLoose, nearOne, prepare, score, queryWords, rank } from '../web/src/services/foodsearch/match.js';
import { setTable, searchBasic, synonymsFor, basicToFood, basicCache } from '../web/src/services/foodsearch/basic.js';
import { Food } from '../web/src/data/models/nutrition.js';

test('нормализация, основы, транслитерация, опечатки', () => {
  assert.equal(normalize('  Ёжевика, «свежая»!  '), 'ежевика свежая');
  assert.equal(normalize('և'), 'եւ');
  assert.deepEqual(['гречка', 'гречки', 'гречневая', 'мацуна', 'творогом', 'сыр', 'молоко'].map(stemRu), ['гречк', 'гречк', 'гречнев', 'мацун', 'творог', 'сыр', 'молок']);
  assert.equal(stemRu('kefir'), 'kefir');
  assert.equal(translit('гречка'), 'grechka');
  assert.equal(translit('мацун'), 'matsun');
  assert.equal(latLoose('matsun'), latLoose('macun'));
  assert.equal(latLoose('matsoun'), latLoose('matsun'));
  assert.equal(latLoose('khorovats'), latLoose('horovac'));
  assert.ok(nearOne('гречка', 'гречка'));
  assert.ok(nearOne('гречка', 'грекча'), 'перестановка');
  assert.ok(nearOne('гречка', 'гречкаа') && nearOne('гречка', 'грчка') && nearOne('гречка', 'гречко'));
  assert.ok(!nearOne('гречка', 'грчк'));
});

test('оценка: начало названия выше синонима, все слова запроса обязательны, латиница', () => {
  const k = prepare({ name: 'Гречка варёная', syn: ['гречневая каша'], other: ['հնդկաձավար', 'hndkadzavar', 'grechka'] });
  const s = (q) => score(k, queryWords(q));
  assert.ok(s('греч') > s('каша'), 'начало названия важнее синонима');
  assert.ok(s('гречка варёная') > s('гречка'));
  assert.equal(s('гречка сухая'), 0, 'слово «сухая» нигде не найдено');
  assert.ok(s('гречки') > 0 && s('гречневой') > 0, 'падежи');
  assert.ok(s('grechka') > 0 && s('hndkadzavar') > 0 && s('հնդկաձ') > 0);
  assert.ok(s('гречко') > 0, 'опечатка в последнюю очередь');
  assert.ok(s('гречко') < s('гречка'));
  assert.equal(s(''), 0);
});

test('встроенная таблица: поиск по-русски, по-армянски, латиницей, синонимы, исключения', () => {
  const data = JSON.parse(readFileSync(new URL('../web/data/foods-basic.json', import.meta.url)));
  setTable(data);
  assert.ok(basicCache().items.length > 150);
  const names = (q, o) => searchBasic(q, o).map((x) => x.n);
  assert.deepEqual(names('гречк').slice(0, 2).sort(), ['Гречка варёная', 'Гречка сухая']);
  assert.equal(names('гречневая каша')[0], 'Гречка варёная');
  assert.equal(names('мацун')[0], 'Мацун');
  assert.equal(names('мацони')[0], 'Мацун');
  assert.equal(names('matsun')[0], 'Мацун');
  assert.equal(names('մածուն')[0], 'Мацун');
  assert.equal(names('лаваш')[0], 'Лаваш тонкий');
  assert.equal(names('lavash')[0], 'Лаваш тонкий');
  assert.ok(names('творог').includes('Творог 5%'));
  assert.ok(names('творожок').includes('Творог 5%'), 'синоним');
  assert.ok(names('хоровац')[0].startsWith('Хоровац'));
  assert.ok(names('шашлык')[0].startsWith('Хоровац'), 'синоним через слово');
  assert.equal(names('кефир 1')[0], 'Кефир 1%');
  assert.equal(names('xyzxyz').length, 0);
  assert.equal(names('').length, 0);
  assert.ok(!names('мацун', { exclude: new Set(['matsun']) }).includes('Мацун'));
  /* ограничение */
  assert.equal(searchBasic('а', { limit: 3 }).length, 3);
});

test('встроенная таблица: синонимы для интернета, запись → документ Food', () => {
  const syn = synonymsFor('мацун');
  assert.ok(syn.includes('мацун') && syn.includes('մածուն') && syn.includes('matsun'), syn);
  assert.ok(syn.length <= 6);
  assert.deepEqual(synonymsFor('xyz'), []);
  assert.deepEqual(synonymsFor(''), []);
  const it = basicCache().items.find((x) => x.id === 'matsun');
  const f = basicToFood(it);
  assert.equal(f.source, 'basic');
  assert.equal(f.sourceId, 'matsun');
  assert.equal(f.base.unit, 'g');
  assert.equal(f.servings[0].label, 'стакан');
  assert.match(f.note, /йогурт/);
  assert.deepEqual(Food.validate(Food.normalize(Object.assign({ id: 'x' }, f))), []);
  const tan = basicCache().items.find((x) => x.id === 'tan');
  assert.ok(Math.abs(tan.nu.kcal - 30.5) < 1, 'тан — половина мацуна');
});
