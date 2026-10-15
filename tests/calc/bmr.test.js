import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, leanMass, bmrMifflin, bmrCunningham, bmr } from '../../web/src/domain/calc/bmr.js';
import { near } from './helpers.js';

const MAN = { sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 };
const WOMAN = { sex: 'female', weightKg: 60, heightCm: 165, ageYears: 25 };

test('ageOn: полные годы', () => {
  assert.equal(ageOn('1990-06-15', '2026-06-14'), 35);
  assert.equal(ageOn('1990-06-15', '2026-06-15'), 36);
  assert.equal(ageOn('1990-06-15', '2026-12-31'), 36);
  assert.equal(ageOn('2026-01-01', '2026-01-01'), 0);
});

test('ageOn: родился 29 февраля', () => {
  assert.equal(ageOn('2000-02-29', '2026-02-28'), 25);
  assert.equal(ageOn('2000-02-29', '2026-03-01'), 26);
  assert.equal(ageOn('2000-02-29', '2028-02-29'), 28);
});

test('ageOn: ошибки', () => {
  assert.throws(() => ageOn('2026-01-02', '2026-01-01'), /раньше/);
  assert.throws(() => ageOn('1990-02-30', '2026-01-01'), /invalid date/);
  assert.throws(() => ageOn('1990-01-01', null), /invalid date/);
});

test('leanMass: масса × (1 − % жира)', () => {
  near(leanMass(80, 20), 64);
  near(leanMass(80, 0), 80);
});

test('leanMass: % жира не задан — null, неверный — ошибка', () => {
  assert.equal(leanMass(80, null), null);
  assert.equal(leanMass(80, undefined), null);
  assert.equal(leanMass(80, NaN), null);
  assert.throws(() => leanMass(80, -1), /bodyFatPct/);
  assert.throws(() => leanMass(80, 100), /bodyFatPct/);
  assert.throws(() => leanMass(0, 20), /weightKg/);
  assert.throws(() => leanMass(NaN, 20), /weightKg/);
});

test('bmrMifflin: мужчина и женщина', () => {
  near(bmrMifflin(MAN), 800 + 1125 - 150 + 5);
  near(bmrMifflin(WOMAN), 600 + 1031.25 - 125 - 161);
  near(bmrMifflin({ ...MAN, ageYears: 0 }), 800 + 1125 + 5);
});

test('bmrMifflin: неверные данные — ошибка', () => {
  assert.throws(() => bmrMifflin({ ...MAN, sex: 'x' }), /unknown sex/);
  assert.throws(() => bmrMifflin({ ...MAN, weightKg: -80 }), /weightKg/);
  assert.throws(() => bmrMifflin({ ...MAN, heightCm: NaN }), /heightCm/);
  assert.throws(() => bmrMifflin({ ...MAN, ageYears: -1 }), /ageYears/);
  assert.throws(() => bmrMifflin(), /unknown sex/);
});

test('bmrCunningham: 500 + 22 × безжировая масса', () => {
  near(bmrCunningham({ leanMassKg: 64 }), 500 + 22 * 64);
  assert.throws(() => bmrCunningham({ leanMassKg: 0 }), /leanMassKg/);
  assert.throws(() => bmrCunningham({}), /leanMassKg/);
});

test('bmr auto: Каннингем при известном % жира, иначе Миффлин', () => {
  assert.deepEqual(bmr({ ...MAN, bodyFatPct: 20 }), { kcal: 500 + 22 * 64, method: 'cunningham' });
  assert.deepEqual(bmr(MAN), { kcal: 1780, method: 'mifflin' });
  assert.deepEqual(bmr({ ...MAN, bodyFatPct: null }), { kcal: 1780, method: 'mifflin' });
  assert.deepEqual(bmr({ leanMassKg: 60 }), { kcal: 500 + 22 * 60, method: 'cunningham' });
});

test('bmr: явный метод и ошибки', () => {
  assert.deepEqual(bmr({ ...MAN, bodyFatPct: 20 }, { method: 'mifflin' }), { kcal: 1780, method: 'mifflin' });
  assert.throws(() => bmr(MAN, { method: 'cunningham' }), /% жира/);
  assert.throws(() => bmr(MAN, { method: 'harris' }), /unknown method/);
  assert.throws(() => bmr({ ...MAN, bodyFatPct: 120 }), /bodyFatPct/);
});
