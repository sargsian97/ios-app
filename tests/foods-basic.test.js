/* Встроенная таблица базовых продуктов: схема, уникальность, правдоподобие, пометки у приближений */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../web/data/foods-basic.json', import.meta.url)));
const map = JSON.parse(readFileSync(new URL('../scripts/foods/ru-hy.json', import.meta.url)));

test('таблица: источник и лицензия указаны, записей столько же, сколько в карте', () => {
  assert.match(data.source, /USDA/);
  assert.match(data.license, /CC0/);
  assert.equal(data.items.length, map.length);
  assert.ok(data.items.length >= 150);
});

test('таблица: id уникальны, у каждой записи русское и армянское название, калории и БЖУ', () => {
  const ids = new Set();
  for (const it of data.items) {
    assert.ok(!ids.has(it.id), 'повтор ' + it.id);
    ids.add(it.id);
    assert.ok(it.n && /[а-яА-ЯёЁ]/.test(it.n), it.id + ': русское название');
    assert.ok(it.hy && /[԰-֏]/.test(it.hy), it.id + ': армянское название');
    assert.ok(it.en, it.id + ': описание USDA');
    assert.ok(['g', 'ml'].includes(it.u));
    ['kcal', 'protein', 'fat', 'carbs'].forEach((k) => assert.equal(typeof it.nu[k], 'number', it.id + ': ' + k));
    assert.ok(it.nu.kcal >= 0 && it.nu.kcal <= 900, it.id + ': ккал ' + it.nu.kcal);
    assert.ok(it.nu.protein + it.nu.fat + it.nu.carbs <= 101, it.id + ': БЖУ больше 100 г');
    (it.p || []).forEach((p) => assert.ok(p.l && p.g > 0, it.id + ': порция'));
  }
});

test('таблица: у приближений и производных есть пометка, у остальных — номер NDB', () => {
  const byId = new Map(map.map((m) => [m.id, m]));
  for (const it of data.items) {
    const m = byId.get(it.id);
    if (m.derive) { assert.ok(it.a, it.id + ': производная без пометки'); assert.ok(!it.ndb); }
    else assert.match(it.ndb, /^\d{5}$/, it.id + ': NDB');
    if (m.approx) assert.equal(it.a, m.approx);
  }
  assert.ok(data.items.filter((it) => it.a).length >= 30, 'приближения помечены');
});

test('таблица: калории примерно сходятся с 4Б + 4У + 9Ж (кроме алкоголя и какао с клетчаткой)', () => {
  const bad = data.items.filter((it) => {
    const atw = 4 * it.nu.protein + 4 * it.nu.carbs + 9 * it.nu.fat;
    return Math.abs(it.nu.kcal - atw) > Math.max(40, 0.2 * it.nu.kcal) && !['beer', 'red-wine', 'white-wine', 'vodka', 'cocoa'].includes(it.id);
  }).map((it) => it.id);
  assert.deepEqual(bad, []);
});
