/* Общие правила слоя расчётов: один вход, чистые модули, константы в одном файле. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as calc from '../../web/src/domain/calc/index.js';

const DIR = new URL('../../web/src/domain/calc/', import.meta.url).pathname;
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.js'));

const API = [
  'trendWeight', 'weightRate', 'forecastGoalDate',
  'ageOn', 'leanMass', 'bmrMifflin', 'bmrCunningham', 'bmr',
  'initialTdee', 'adaptiveTdee', 'energyBalance',
  'calorieTarget', 'macroTargets', 'weeklyDistribution', 'dayTargets',
  'microGoals',
  'e1rm', 'bestE1rm', 'repsAt',
  'roundToAvailable', 'nextSetTarget',
  'warmupSets', 'needsWarmup',
  'platesFor', 'achievableLoads',
  'weeklyVolume', 'averagePerWeek',
  'addDays', 'diffDays', 'rangeDays',
  'bodyFatEstimates', 'bodyFatEstimate', 'bodyRatios', 'periodRuns', 'cycleSummary'
];

test('index.js отдаёт все функции и константы', () => {
  for (const name of API) assert.equal(typeof calc[name], 'function', name);
  assert.ok(Array.isArray(calc.NUTRIENTS));
  assert.equal(typeof calc.KCAL_PER_KG_TISSUE, 'number');
});

test('index.js реэкспортирует каждый модуль папки', () => {
  const src = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const f of FILES.filter((x) => x !== 'index.js')) assert.ok(src.includes(`export * from './${f}';`), f);
});

test('модули расчётов чистые: импорты только из папки, без DOM, базы и текущего времени', () => {
  for (const f of FILES) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const m of src.matchAll(/^import .* from '([^']+)';/gm)) assert.match(m[1], /^\.\/[a-z_0-9]+\.js$/, `${f}: ${m[1]}`);
    assert.doesNotMatch(src, /Date\.now|new Date\(\)|Math\.random|document\.|window\.|localStorage|indexedDB|fetch\(/, f);
  }
});

test('константы: каждый блок помечен как временный', () => {
  const src = readFileSync(join(DIR, 'constants.js'), 'utf8');
  const blocks = src.split('/* ── ').slice(1);
  assert.ok(blocks.length >= 8);
  for (const b of blocks) assert.match(b.split('*/')[0], /Временное значение, уточнится в части 2 спецификации\./, b.slice(0, 40));
});

test('константы нельзя случайно изменить', () => {
  assert.throws(() => { calc.ACTIVITY_FACTORS.sedentary = 2; }, TypeError);
  assert.throws(() => { calc.CALORIE_FLOOR.standard.male = 0; }, TypeError);
  assert.throws(() => { calc.WARMUP_SCHEMES.default[0].pct = 1; }, TypeError);
});
