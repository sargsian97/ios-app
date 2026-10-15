/* Общие помощники для тестов расчётов (не тест: имя без .test.js). */
import assert from 'node:assert/strict';

/* числа равны с допуском */
export function near(actual, expected, eps = 1e-6, msg = '') {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= eps, `${msg} ${actual} ≈ ${expected} (±${eps})`);
}
