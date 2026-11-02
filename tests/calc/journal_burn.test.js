import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalConfig, journalWeightOn, cardioEstimate, strengthForDay, journalBurn, journalWeek, addDays, JOURNAL_DEFAULTS as D } from '../../web/src/domain/calc/index.js';
import { near } from './helpers.js';

test('журнал: настройки по умолчанию и из документа (новые и старые имена полей)', () => {
  const d = journalConfig(null);
  assert.deepEqual([d.base, d.trainKcal, d.gymSteps, d.protein, d.fat, d.fiber, d.kPer1000, d.stepLen], [2000, 500, 3000, 140, 60, 30, null, null]);
  const n = journalConfig({ baseKcal: 1900, kcalPer1000Steps: 30, offsetKcal: -300, proteinG: 150 });
  assert.deepEqual([n.base, n.kPer1000, n.offset, n.protein, n.fat], [1900, 30, -300, 150, 60]);
  const o = journalConfig({ base: '2100', kPer1000: '', offset: '-200', stepLen: 0.7 });
  assert.deepEqual([o.base, o.kPer1000, o.offset, o.stepLen], [2100, null, -200, 0.7], 'пустая строка журнала — как нет значения');
});

test('журнал: вес на дату — последнее взвешивание не позже даты, иначе 84', () => {
  const s = [{ date: '2026-10-01', weightKg: 85 }, { date: '2026-10-10', time: '08:00', weightKg: 84 }, { date: '2026-10-10', time: '20:00', weightKg: 83.5 }, { date: '2026-10-20', weightKg: 82 }];
  assert.equal(journalWeightOn(s, '2026-10-15'), 83.5);
  assert.equal(journalWeightOn(s, '2026-10-20'), 82);
  assert.equal(journalWeightOn(s, '2026-09-01'), D.weightKg);
  assert.equal(journalWeightOn([], '2026-10-15'), 84);
});

test('кардио: ACSM для ходьбы и бега, шаги по длине шага и с браслета, своя оценка, часы минус покой', () => {
  const walk = cardioEstimate({ type: 'treadmill', minutes: 60, speed: 5, incline: 0, inSteps: true }, { weightKg: 80, baseKcal: 2000, heightCm: 180 });
  const sp = 5 * 1000 / 60;
  near(walk.kcal, (0.1 * sp) * 80 * 5 / 1000 * 60, 1e-9);
  assert.equal(walk.src, 'acsm');
  assert.equal(walk.stepsSrc, 'stride');
  assert.equal(walk.steps, Math.round(5000 / (0.42 * 1.8)));
  const run = cardioEstimate({ type: 'outdoor', minutes: 30, km: 5 }, { weightKg: 80, baseKcal: 2000, heightCm: 180 });
  near(run.v, 10, 1e-9, 'скорость из дистанции и времени');
  near(run.kcal, (0.2 * 10000 / 60) * 80 * 5 / 1000 * 30, 1e-9);
  assert.equal(run.steps, Math.round(5000 / (0.6 * 1.8)));
  const incl = cardioEstimate({ type: 'treadmill', minutes: 30, speed: 5, incline: 10 }, { weightKg: 80, baseKcal: 2000, heightCm: 180 });
  assert.ok(incl.kcal > walk.kcal / 2, 'уклон добавляет');
  const band = cardioEstimate({ type: 'outdoor', minutes: 30, km: 3, steps: 4200, kcal: 150 }, { weightKg: 80, baseKcal: 2000, heightCm: 180 });
  assert.deepEqual([band.kcal, band.src, band.steps, band.stepsSrc], [150, 'user', 4200, 'band']);
  const watch = cardioEstimate({ type: 'bike', minutes: 40, kcalWatch: 300 }, { weightKg: 80, baseKcal: 2000, heightCm: 180 });
  near(watch.kcal, 300 - 2000 / 1440 * 40, 1e-9);
  assert.equal(watch.src, 'watch');
  assert.equal(watch.steps, 0, 'велотренажёр без шагов');
  assert.deepEqual([cardioEstimate({ type: 'other', minutes: 20 }, { weightKg: 80 }).kcal, cardioEstimate({ type: 'other', minutes: 20 }, { weightKg: 80 }).src], [0, 'none']);
  const custom = cardioEstimate({ type: 'outdoor', km: 1, minutes: 12 }, { weightKg: 80, heightCm: 180, stepLenM: 0.5 });
  assert.equal(custom.steps, 2000, 'своя длина шага');
});

test('силовая за день: проекция журнала → оценка; планка по имени в старых записях', () => {
  const w = { exercises: [{ name: 'Жим лёжа', sets: [{ r: 10, done: true }, { r: 10, done: true }, { r: 9, done: true }] }, { name: 'Планка', sets: [{ r: 60, done: true }] }], durationMin: 40, avgHr: '', kcalWatch: 400 };
  const r = strengthForDay(w, { weightKg: 80, age: 30, base: 2000 });
  assert.equal(r.done, 4);
  assert.equal(r.work, 54 + 54 + 51 + 70, 'жим 10/10/9 повторов, планка — 60 с + 10');
  assert.equal(r.watch, 400);
  const w2 = { exercises: [{ name: 'Планка', sets: [{ r: null, t: 45, done: true }] }], durationMin: 10 };
  assert.equal(strengthForDay(w2, { weightKg: 80 }), null, 'один подход — мало');
  assert.equal(strengthForDay(null, {}), null);
});

test('расход дня: база, шаги, кардио, силовая, поправка и сдвиг цели', () => {
  const s = { baseKcal: 2000, kcalPer1000Steps: null, corrPct: 0, offsetKcal: -300 };
  const plain = journalBurn({ settings: s, day: { steps: 10000 }, weightKg: 80 });
  near(plain.k, 0.37 * 80, 1e-9);
  near(plain.stepK, 10 * 0.37 * 80, 1e-9);
  near(plain.burned, 2000 + 296, 1e-9);
  near(plain.goal, 2000 + 296 - 300, 1e-9);
  assert.deepEqual([plain.lifted, plain.train, plain.gymSteps, plain.hasSteps, plain.protein, plain.fat, plain.fiber], [false, 0, 0, true, 140, 60, 30]);
  const noSteps = journalBurn({ settings: s, day: {}, weightKg: 80 });
  assert.deepEqual([noSteps.hasSteps, noSteps.stepK], [false, 0]);
  const lifted = journalBurn({ settings: s, day: { steps: 10000, lifted: true }, weightKg: 80 });
  assert.deepEqual([lifted.train, lifted.trainTimer, lifted.gymSteps], [500, false, 3000], 'без данных — trainKcal по умолчанию, шаги в зале вычтены');
  near(lifted.stepK, 7 * 0.37 * 80, 1e-9);
  const est = journalBurn({ settings: s, day: { steps: 2000, lifted: true }, strength: { kcal: 320 }, weightKg: 80 });
  assert.deepEqual([est.train, est.trainTimer, est.stepK], [320, true, 0], 'шагов меньше, чем в зале — ноль, не минус');
  const cardio = journalBurn({ settings: Object.assign({}, s, { corrPct: -10 }), day: { steps: 8000, cardioOn: true, cardio: [{ type: 'treadmill', minutes: 30, speed: 5, inSteps: true }] }, weightKg: 80, heightCm: 180 });
  assert.ok(cardio.cardioNet > 0 && cardio.cardioSteps > 0 && cardio.cardioSteps <= 8000);
  near(cardio.burned, cardio.raw * 0.9, 1e-9);
  near(cardio.burned - cardio.raw, -cardio.raw * 0.1, 1e-9);
  assert.throws(() => journalBurn({ settings: s }, { version: 'v9' }), /версия/);
});

test('неделя: средние по дням с едой и средний вес за две недели', () => {
  const days = [];
  for (let i = 0; i < 14; i++) days.push({ date: addDays('2026-10-20', -i), eaten: i === 2 ? null : 2000 + i, burned: 2500 });
  const weights = [{ date: '2026-10-20', weightKg: 80 }, { date: '2026-10-18', weightKg: 81 }, { date: '2026-10-10', weightKg: 83 }, { date: '2026-10-01', weightKg: 90 }];
  const w = journalWeek({ end: '2026-10-20', days, weights, addDays });
  assert.equal(w.n, 6);
  near(w.eat, (2000 + 2001 + 2003 + 2004 + 2005 + 2006) / 6, 1e-9);
  assert.equal(w.bur, 2500);
  assert.equal(w.w1, 80.5);
  assert.equal(w.w0, 83);
  assert.deepEqual(journalWeek({ end: '2026-10-20', addDays }), { n: 0, eat: 0, bur: 0, w1: null, w0: null });
});
