import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPartialDays, unloggedDays, loggingBreak } from '../../web/src/domain/calc/checkin.js';

const D = (date, kcal, extra) => Object.assign({ date, kcal }, extra || {});
const week = [D('2026-10-05', 2400), D('2026-10-06', 2300), D('2026-10-07', 900), D('2026-10-08', 2500), D('2026-10-09', 500, { partial: true }), D('2026-10-10', 0, { fasting: true }), D('2026-10-11', 450)];

test('чек-ин: подозрительно неполные дни', () => {
  assert.deepEqual(findPartialDays(week, { from: '2026-10-05', to: '2026-10-11' }), ['2026-10-07', '2026-10-11']);
  assert.deepEqual(findPartialDays([], { from: '2026-10-05', to: '2026-10-11' }), []);
  assert.deepEqual(findPartialDays([D('2026-10-05', 2000)], { from: '2026-10-05', to: '2026-10-05' }), [], 'один день — сравнить не с чем, но он не меньше себя');
});

test('чек-ин: дни без записей и перерыв', () => {
  assert.deepEqual(unloggedDays(week, { from: '2026-10-04', to: '2026-10-12' }), ['2026-10-04', '2026-10-12']);
  assert.deepEqual(loggingBreak(week, { from: '2026-10-05', to: '2026-10-11' }), { days: 0, isBreak: false });
  assert.deepEqual(loggingBreak([D('2026-10-05', 2000)], { from: '2026-10-05', to: '2026-10-11' }), { days: 6, isBreak: true });
});
