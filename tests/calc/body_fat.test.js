import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyFatEstimates, bodyFatEstimate, bodyRatios } from '../../web/src/domain/calc/body_fat.js';

const man = { sex: 'male', ageYears: 29, weightKg: 84, heightCm: 173, waistCm: 97, neckCm: 39 };

test('жир: формулы для мужчины совпадают с журналом', () => {
  const e = bodyFatEstimates(man);
  const by = Object.fromEntries(e.map((x) => [x.method, x.pct]));
  /* журнал: Deurenberg = 1.2·ИМТ + 0.23·возраст − 16.2 */
  const bmi = 84 / (1.73 * 1.73);
  assert.equal(by.deurenberg, Math.round((1.2 * bmi + 0.23 * 29 - 16.2) * 10) / 10);
  assert.equal(by.rfm, Math.round((64 - 20 * (173 / 97)) * 10) / 10);
  assert.ok(by.navy > 20 && by.navy < 30);
  assert.ok(by.cun_bae > 15 && by.cun_bae < 35);
  const m = bodyFatEstimate(man);
  assert.equal(m.methods.length, 4);
  assert.ok(m.pct > 20 && m.pct < 30);
});

test('жир: женщина — свои коэффициенты, US Navy нужны бёдра', () => {
  const w = { sex: 'female', ageYears: 30, weightKg: 62, heightCm: 165, waistCm: 72, neckCm: 32 };
  assert.ok(!bodyFatEstimates(w).some((x) => x.method === 'navy'));
  const e = bodyFatEstimates(Object.assign({ hipsCm: 98 }, w));
  const navy = e.find((x) => x.method === 'navy');
  assert.ok(navy && navy.pct > 20 && navy.pct < 35, JSON.stringify(navy));
  const male = bodyFatEstimate(Object.assign({}, w, { sex: 'male' })).pct;
  assert.ok(bodyFatEstimate(w).pct > male, 'у женщин при тех же данных выше');
});

test('жир: мало данных и неправдоподобное', () => {
  assert.equal(bodyFatEstimate({ sex: 'male' }), null);
  assert.deepEqual(bodyFatEstimates({ sex: 'male', heightCm: 173, waistCm: 40, neckCm: 45 }), [], 'талия меньше шеи и RFM < 2');
  assert.equal(bodyFatEstimates({ sex: 'male', heightCm: 173, waistCm: 90 }).length, 1, 'только RFM');
  assert.throws(() => bodyFatEstimates({ sex: 'x' }), /unknown sex/);
});

test('отношения обхватов', () => {
  assert.deepEqual(bodyRatios({ waistCm: 86.5, heightCm: 173, hipsCm: 100 }), { waistToHeight: 0.5, waistToHip: 0.865 });
  assert.deepEqual(bodyRatios({}), { waistToHeight: null, waistToHip: null });
});
