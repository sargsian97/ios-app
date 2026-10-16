/* Генератор программ, неделя программы, периодизация и делоад. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateProgram, splitsFor, scheduleDays, slotCandidates, buildDay, dayMinutes, plannedSets, SPLITS, SLOTS, DAY_TYPES } from '../web/src/domain/training-program.js';
import { programWeek, weekModifiers, applyWeek } from '../web/src/domain/calc/index.js';
import { fromLibrary } from '../web/src/domain/exercises.js';

const raw = JSON.parse(readFileSync(new URL('../web/data/exercises.json', import.meta.url)));
const catalog = {};
raw.items.forEach((it) => { const e = fromLibrary(it); catalog[e.id] = e; });
let n = 0;
const newId = () => String(++n);

test('все базовые упражнения слотов есть в справочнике, все слоты дней существуют', () => {
  for (const [k, s] of Object.entries(SLOTS)) for (const id of s.list) assert.ok(catalog[id], k + ': ' + id);
  for (const [k, d] of Object.entries(DAY_TYPES)) for (const s of d) assert.ok(SLOTS[s.replace('!', '')], k + ': ' + s);
  for (const [k, s] of Object.entries(SPLITS)) for (const d of s.days) s.types(d).forEach((t) => assert.ok(DAY_TYPES[t], k + ': ' + t));
});

test('сплиты под дни и расписание по неделе', () => {
  assert.equal(splitsFor(4)[0], 'upper_lower');
  assert.ok(splitsFor(4).includes('pphs') && splitsFor(4).includes('ppl_acc'));
  assert.deepEqual(splitsFor(6).slice(0, 1), ['ppl6']);
  assert.deepEqual(scheduleDays(3), [0, 2, 4]);
  assert.throws(() => scheduleDays(0));
});

test('программа: шаблоны по дням недели, цели по роли, блок с делоадом', () => {
  const { program, plans } = generateProgram({ catalog, days: 4, minutes: 75, goal: 'hypertrophy', newId, startDate: '2026-10-19' });
  assert.equal(program.split, 'upper_lower');
  assert.equal(plans.length, 4);
  assert.deepEqual(plans.map((p) => p.weekday), [0, 1, 3, 4]);
  assert.equal(program.blocks[0].days.filter((d) => d.kind === 'workout').length, 4);
  const first = plans[0].sections[0].items[0];
  assert.equal(first.exerciseId, 'fe-Barbell_Bench_Press_-_Medium_Grip');
  assert.deepEqual([first.repMin, first.repMax, first.sets, first.rir], [6, 10, 4, 2]);
  plans.forEach((p) => {
    const ids = p.sections[0].items.map((i) => i.exerciseId);
    assert.equal(new Set(ids).size, ids.length, 'без повторов в тренировке');
    assert.ok(ids.length >= 3);
  });
});

test('время: на 30 минут — меньше упражнений, но не меньше 3, основное остаётся', () => {
  const long = buildDay('legs', { catalog, minutes: 120, newId });
  const short = buildDay('legs', { catalog, minutes: 30, newId });
  assert.ok(short.length < long.length);
  assert.ok(short.length >= 3);
  assert.equal(short[0].exerciseId, long[0].exerciseId);
  const roles = (it) => ({ ...it, role: it.restSec === 150 ? 'main' : it.restSec === 105 ? 'secondary' : 'iso' });
  assert.ok(dayMinutes(long.map(roles)) <= 120);
});

test('домашний зал без штанги и тренажёров: только доступное', () => {
  const home = new Set(['dumbbell', 'bench', 'pullup_bar', 'bodyweight', 'other', 'band']);
  const isAvailable = (e) => (e.equipment || []).every((k) => home.has(k));
  const { plans } = generateProgram({ catalog, days: 3, minutes: 60, isAvailable, newId });
  const all = plans.flatMap((p) => p.sections[0].items.map((i) => catalog[i.exerciseId]));
  assert.ok(all.every(isAvailable));
  assert.equal(plans[0].sections[0].items[0].exerciseId, 'fe-Dumbbell_Squat', 'гоблет — с гирей, её нет');
});

test('исключения, опыт, акценты на мышцы', () => {
  const c = slotCandidates('bench', { catalog, exclude: ['fe-Barbell_Bench_Press_-_Medium_Grip'] });
  assert.equal(c[0].id, 'fe-Dumbbell_Bench_Press');
  assert.ok(slotCandidates('squat', { catalog, experience: 'beginner' }).every((e) => e.level !== 'expert'));
  const base = buildDay('upperA', { catalog, minutes: 180, newId });
  const more = buildDay('upperA', { catalog, minutes: 180, newId, priorities: { side_delts: 'more', biceps: 'less' } });
  const sets = (d, id) => d.find((i) => i.exerciseId === id).sets;
  assert.equal(sets(more, 'fe-Side_Lateral_Raise'), sets(base, 'fe-Side_Lateral_Raise') + 1);
  assert.equal(sets(more, 'fe-EZ-Bar_Curl'), sets(base, 'fe-EZ-Bar_Curl') - 1);
});

test('PPL ×2: второй день того же типа — другой вариант', () => {
  const { plans } = generateProgram({ catalog, days: 6, split: 'ppl6', minutes: 90, newId });
  assert.notEqual(plans[0].sections[0].items[0].exerciseId, plans[3].sections[0].items[0].exerciseId);
  const vol = plannedSets(plans, catalog);
  assert.ok(vol.chest > 10 && vol.quads > 10);
});

test('сила и новичок: малые повторы, RIR + 1; неверные параметры — ошибка', () => {
  const { plans } = generateProgram({ catalog, days: 3, goal: 'strength', experience: 'beginner', newId });
  const it = plans[0].sections[0].items[0];
  assert.deepEqual([it.repMin, it.repMax, it.rir], [3, 5, 3]);
  assert.throws(() => generateProgram({ catalog, days: 7 }));
  assert.throws(() => generateProgram({ catalog, days: 3, split: 'ppl6' }));
  assert.throws(() => generateProgram({ catalog, days: 3, goal: 'cardio' }));
});

test('неделя программы: блоки, делоад в конце и в начале, повтор', () => {
  const p = { startDate: '2026-10-21', blocks: [{ weeks: 5 }], deload: 'end', repeat: 'forever' };
  assert.equal(programWeek(p, '2026-10-18'), null, 'до старта');
  assert.deepEqual([programWeek(p, '2026-10-19').week, programWeek(p, '2026-10-19').deload], [0, false], 'неделя считается с понедельника');
  assert.equal(programWeek(p, '2026-11-16').deload, true);
  assert.equal(programWeek(p, '2026-11-16').workWeeks, 4);
  assert.deepEqual([programWeek(p, '2026-11-23').week, programWeek(p, '2026-11-23').cycle], [0, 1]);
  assert.deepEqual(programWeek(Object.assign({}, p, { repeat: 'once' }), '2026-11-23'), { finished: true, total: 5 });
  const s = programWeek(Object.assign({}, p, { deload: 'start' }), '2026-10-26');
  assert.deepEqual([s.week, s.workWeek, s.deload], [1, 0, false]);
  assert.equal(programWeek({ startDate: '2026-10-19', blocks: [] }, '2026-10-20'), null);
});

test('периодизация и делоад меняют цели недели', () => {
  const it = { sets: 4, repMin: 6, repMax: 10, rir: 2 };
  assert.deepEqual(applyWeek(it, weekModifiers({ periodization: 'linear', workWeek: 2 })), { sets: 4, repMin: 4, repMax: 8, rir: 2 });
  assert.equal(applyWeek(it, weekModifiers({ periodization: 'linear', workWeek: 9 })).repMin, 3, 'не больше 3 повторов сдвига');
  assert.equal(applyWeek(it, weekModifiers({ periodization: 'reverse', workWeek: 1 })).repMax, 11);
  assert.equal(applyWeek(it, weekModifiers({ periodization: 'undulating', workWeek: 0 })).repMin, 4);
  assert.equal(applyWeek(it, weekModifiers({ periodization: 'undulating', workWeek: 1 })).repMin, 8);
  assert.deepEqual(applyWeek(it, weekModifiers({ periodization: 'linear', workWeek: 3, deload: true })), { sets: 2, repMin: 6, repMax: 10, rir: 4 });
  assert.deepEqual(applyWeek({ sets: 3, repMin: 1, repMax: 2 }, weekModifiers({ periodization: 'linear', workWeek: 3 })), { sets: 3, repMin: 1, repMax: 1 });
  assert.deepEqual(applyWeek({ sets: 3, timeSec: 45 }, weekModifiers({ deload: true })), { sets: 2, timeSec: 45, rir: 4 });
  assert.throws(() => weekModifiers({ periodization: 'random' }));
});
