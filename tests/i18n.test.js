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

test('i18n: подписи всех нутриентов', async () => {
  const { NUTRIENT_KEYS } = await import('../web/src/data/models/nutrients.js');
  assert.deepEqual(NUTRIENT_KEYS.filter((k) => !hasKey('nutrient.' + k)), []);
});

test('i18n: ключи, собранные из частей, есть в каталоге', () => {
  const keys = [];
  ['all', 'fav', 'history', 'mine', 'recipes'].forEach((k) => keys.push('food.tab.' + k));
  ['scan', 'quick', 'photo', 'new'].forEach((k) => keys.push('food.sc.' + k));
  ['b', 'l', 'd', 's'].forEach((k) => keys.push('food.meal.' + k));
  ['day', 'week', 'month'].forEach((k) => keys.push('ai.period.' + k));
  ['no_key', 'limit', 'cancelled', 'bad_key', 'no_credit', 'network', 'rate_limited', 'invalid_json', 'image_rejected', 'refused', 'not_granted', 'unsure', 'no_name', 'other'].forEach((k) => keys.push('ai.err.' + k));
  ['carbs', 'fats', 'protein', 'vitamins', 'minerals', 'other'].forEach((k) => keys.push('food.group.' + k));
  ['off', 'usda', 'ai', 'user', 'legacy'].forEach((k) => keys.push('food.src.' + k));
  [0, 1, 2, 3, 4, 5, 6].forEach((k) => keys.push('wd.' + k));
  ['floored', 'limit_min', 'limit_max', 'protein_min', 'protein_exceeds_kcal'].forEach((k) => keys.push('ob.warn.' + k));
  ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'].forEach((k) => keys.push('ob.fat.' + k));
  ['g', 'ml', 'mg', 'mcg', 'kcal', 'kg', 'lb', 'cm', 'in', 'kj', 'km', 'mi'].forEach((k) => keys.push('unit.' + k));
  assert.deepEqual(keys.filter((k) => !hasKey(k)), []);
});

test('i18n: подписи тренировок — для всех значений моделей', async () => {
  const W = await import('../web/src/data/models/workout.js');
  const { MUSCLE_GROUPS } = await import('../web/src/domain/exercises.js');
  const keys = [];
  W.MUSCLES.forEach((k) => keys.push('muscle.' + k));
  MUSCLE_GROUPS.forEach(([g]) => keys.push('muscle.g.' + g));
  W.EQUIPMENT_KEYS.forEach((k) => keys.push('equip.' + k));
  W.EX_TYPES.forEach((k) => keys.push('extype.' + k));
  W.EX_CATEGORIES.forEach((k) => keys.push('excat.' + k));
  W.PATTERNS.forEach((k) => keys.push('pattern.' + k));
  W.METRICS.forEach((k) => keys.push('metric.' + k));
  W.SET_TYPES.forEach((k) => { keys.push('settype.' + k); keys.push('settype.s.' + k); });
  ['upper', 'lower', 'core', 'full'].forEach((k) => keys.push('region.' + k));
  ['bilateral', 'unilateral', 'alternating'].forEach((k) => keys.push('lat.' + k));
  ['beginner', 'intermediate', 'expert'].forEach((k) => keys.push('level.' + k));
  ['e1rm', 'weight', 'reps', 'volume', 'timeSec', 'distanceM'].forEach((k) => keys.push('record.' + k));
  ['treadmill', 'outdoor', 'elliptical', 'bike', 'stepper', 'rower', 'other'].forEach((k) => keys.push('cardio.t.' + k));
  ['today', 'missed', 'next', 'cycle'].forEach((k) => keys.push('train.why.' + k));
  [0, 1, 2, 3, 4, 5].forEach((k) => keys.push('train.rir.' + k));
  [0, 1, 2, 3, 4, 5, 6].forEach((k) => keys.push('wd.s.' + k));
  ['left', 'right'].forEach((k) => keys.push('side.s.' + k));
  ['compound', 'isolation', 'sides', 'warmup', 'exercises'].forEach((k) => keys.push('train.set.rest.' + k));
  ['cardio', 'library', 'plans', 'history'].forEach((k) => keys.push('train.act.' + k));
  ['avgHr', 'maxHr', 'kcalWatch', 'kcal', 'steps'].forEach((k) => keys.push('train.stats.' + k));
  ['min', 'km', 'mi', 'speed', 'incline', 'avgHr', 'maxHr', 'kcalWatch', 'kcal', 'steps'].forEach((k) => keys.push('cardio.' + k));
  assert.deepEqual(keys.filter((k) => !hasKey(k)), []);
});

test('i18n: числа со знаком', async () => {
  const { fmtSigned } = await import('../web/src/i18n/index.js');
  assert.equal(fmtSigned(-643.4), '−643');
  assert.equal(fmtSigned(120), '+120');
  assert.equal(fmtSigned(0.2), '0');
  assert.equal(fmtSigned(null), '—');
});
