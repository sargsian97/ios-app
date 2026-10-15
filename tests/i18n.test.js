/* Каждый ключ t('…') в новом коде должен быть в русском каталоге */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, hasKey, fmtNum } from '../web/src/i18n/index.js';

const SRC = new URL('../web/src/', import.meta.url).pathname;
function walk(dir) { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; }); }

test('i18n: все ключи из кода есть в каталоге', () => {
  const missing = [];
  walk(SRC).forEach((file) => {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!hasKey(m[1])) missing.push(m[1] + ' (' + file.slice(SRC.length) + ')');
  });
  assert.deepEqual(missing, []);
});

test('i18n: подстановки и множественное число', () => {
  assert.equal(t('profile.age', { count: 1 }), '1 год');
  assert.equal(t('profile.age', { count: 3 }), '3 года');
  assert.equal(t('profile.age', { count: 29 }), '29 лет');
  assert.equal(t('backup.saved', { name: 'f.json' }), 'Копия сохранена: f.json');
  assert.equal(t('нет.такого'), 'нет.такого');
});

test('i18n: числа по-русски', () => {
  assert.equal(fmtNum(84.55, 1), '84,6');
  assert.equal(fmtNum(null), '—');
  assert.match(fmtNum(12500), /^12\s500$/);
});
