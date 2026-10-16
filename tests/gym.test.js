import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gymFromTemplate, GYM_TEMPLATES, EQUIPMENT_CATEGORIES, platesKg, loadKind, barFor, stackFor, availableLoads, roundForGym,
  plateLoadout, loadoutFor, warmupPlan, workedMuscles, defaultGym, availableInGym, addWarmups, warmupSetsForEntry, workingWeightOf, KG_PER_LB
} from '../web/src/domain/gym.js';
import { EQUIPMENT_KEYS } from '../web/src/data/models/workout.js';
import { Gym } from '../web/src/data/models/workout.js';
import { similarExercises } from '../web/src/domain/exercises.js';

const SQ = { id: 'sq', equipment: ['barbell'], primaryMuscles: ['quads', 'glutes'], type: 'compound', pattern: 'squat' };
const DB = { id: 'db', equipment: ['dumbbell'], primaryMuscles: ['biceps'], type: 'isolation' };
const CABLE = { id: 'cb', equipment: ['cable'], primaryMuscles: ['triceps'], type: 'isolation' };
const EZ = { id: 'ez', equipment: ['ez_bar'], primaryMuscles: ['biceps'], type: 'isolation' };
const PU = { id: 'pu', equipment: ['bodyweight', 'pullup_bar'], primaryMuscles: ['lats'], type: 'compound' };

test('шаблоны залов: проходят проверку модели, оборудование из справочника', () => {
  Object.keys(GYM_TEMPLATES).forEach((k) => {
    const g = Gym.normalize(Object.assign({ id: 'x', name: k }, gymFromTemplate(k)));
    assert.deepEqual(Gym.validate(g), [], k);
    g.equipment.forEach((e) => assert.ok(EQUIPMENT_KEYS.includes(e), k + ' ' + e));
  });
  assert.equal(gymFromTemplate('nope').template, 'custom');
  assert.deepEqual(EQUIPMENT_CATEGORIES.flatMap(([, ks]) => ks).sort(), EQUIPMENT_KEYS.slice().sort(), 'каждый ключ в одной категории');
});

test('блины в фунтах переводятся в кг', () => {
  const p = platesKg({ plates: [{ weight: 45, unit: 'lb', count: 2 }, { weight: 20, unit: 'kg', count: 0 }] });
  assert.equal(p.length, 1);
  assert.equal(p[0].weight, Math.round(45 * KG_PER_LB * 1e4) / 1e4);
  assert.equal(p[0].label, 45);
});

test('снаряд упражнения, гриф и стек', () => {
  assert.equal(loadKind(SQ), 'barbell');
  assert.equal(loadKind(DB), 'dumbbell');
  assert.equal(loadKind(CABLE), 'stack');
  assert.equal(loadKind(PU), 'free');
  const g = gymFromTemplate('commercial');
  assert.equal(barFor(SQ, g, null).weight, 20);
  assert.equal(barFor(EZ, g, null).weight, 10, 'EZ-гриф для EZ-упражнения');
  assert.equal(barFor(SQ, g, { barId: 'women' }).weight, 15, 'свой гриф упражнения');
  assert.equal(barFor(SQ, { bars: [] }, null).weight, 20, 'без грифов — 20 кг');
  assert.equal(stackFor(CABLE, g, null).id, 'cable');
});

test('доступные веса: блины, гантели, стек с микродовеском, свои веса, без зала', () => {
  const g = gymFromTemplate('garage');
  const bar = availableLoads(SQ, g, null);
  assert.equal(bar[0], 20);
  assert.ok(bar.includes(22.5) && bar.includes(127.5));
  assert.equal(bar[bar.length - 1], 20 + 2 * (20 + 15 + 2 * 10 + 2 * 5 + 2 * 2.5 + 1.25), 'не тяжелее всех блинов');
  assert.deepEqual(availableLoads(DB, g, null).slice(0, 3), [2.5, 5, 7.5]);
  const c = gymFromTemplate('commercial');
  assert.deepEqual(availableLoads(CABLE, c, null).slice(0, 4), [5, 7.5, 10, 12.5], 'стек 5 кг + микродовесок 2,5');
  assert.deepEqual(availableLoads(SQ, g, { loads: [50, 40, 60] }), [40, 50, 60]);
  assert.equal(availableLoads(SQ, null, null), null);
  assert.equal(availableLoads(PU, g, null), null, 'свой вес — без ограничений');
  assert.deepEqual(availableLoads(SQ, { plates: [], bars: [{ id: 'b', weight: 15 }] }, null), [15], 'только гриф');
  const simple = availableLoads(SQ, g, null, { simplify: true });
  assert.ok(!simple.includes(22.5) && simple.includes(30), 'упрощённо — без мелких блинов');
});

test('округление до доступного веса', () => {
  const g = gymFromTemplate('garage');
  assert.equal(roundForGym(61.3, SQ, g, null), 62.5);
  assert.equal(roundForGym(61.3, SQ, g, null, 'down'), 60);
  assert.equal(roundForGym(10, SQ, g, null), 20, 'легче грифа — гриф');
  assert.equal(roundForGym(500, SQ, g, null), 162.5, 'тяжелее всех блинов — максимум');
  assert.equal(roundForGym(33, PU, g, null), 33);
  assert.equal(roundForGym(null, SQ, g, null), null);
});

test('раскладка блинов: минимум блинов, цвета, остаток, ниже грифа', () => {
  const g = gymFromTemplate('commercial');
  const r = plateLoadout(102.5, SQ, g, null);
  assert.deepEqual(r.items.map((i) => i.weight), [25, 15, 1.25]);
  assert.ok(r.exact);
  assert.ok(r.items[0].color);
  const odd = plateLoadout(101, SQ, g, null);
  assert.equal(odd.total, 100);
  assert.equal(odd.remainder, 1);
  assert.equal(plateLoadout(15, SQ, g, null).belowBar, true);
  assert.equal(plateLoadout(60, DB, g, null), null, 'не штанга');
  const one = loadoutFor({ target: 45, barWeight: 0, plates: platesKg(g), mode: 'one_side' });
  assert.deepEqual(one.items.map((i) => i.weight), [25, 20]);
  assert.equal(plateLoadout(62.5, SQ, g, null, { offsetKg: 2.5 }).items.reduce((a, i) => a + i.weight, 0), 20, 'смещение веса прибавляется к грифу');
});

test('разминка: по залу, схема упражнения, «никогда», мала нагрузка, мышцы уже работали', () => {
  const g = gymFromTemplate('commercial');
  const prof = { warmupScheme: 'default', warmupOnlyIfNotWorked: true, simplifyWarmupPlates: true };
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof }).map((w) => [w.weight, w.reps]), [[40, 8], [60, 5], [80, 3]]);
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof, config: { warmupScheme: 'short' } }).map((w) => w.weight), [50, 70]);
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof, config: { warmup: 'never' } }), []);
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: 25, gym: g, profile: prof }), [], 'лёгкий рабочий вес');
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof, worked: ['quads', 'glutes'] }), [], 'мышцы уже работали');
  assert.equal(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof, worked: ['quads', 'glutes'], config: { warmup: 'always' } }).length, 3);
  assert.equal(warmupPlan({ exercise: SQ, workingWeight: 100, gym: g, profile: prof, worked: ['quads', 'glutes'], force: true }).length, 3, 'вручную — всегда');
  assert.deepEqual(warmupPlan({ exercise: SQ, workingWeight: null, gym: g, profile: prof }), []);
  const simple = warmupPlan({ exercise: SQ, workingWeight: 72.5, gym: g, profile: prof }).map((w) => w.weight);
  assert.ok(simple.every((w) => (w - 20) % 10 === 0), 'упрощённые блины: шаг 10 кг на грифе ' + simple);
});

test('разминка в новой сессии: только для первой нагрузки на мышцы', () => {
  const cat = { sq: SQ, lp: { id: 'lp', equipment: ['machine'], primaryMuscles: ['quads'], type: 'compound' }, db: DB };
  let n = 0;
  const newId = () => 'w' + (++n);
  const set = (w) => ({ id: 's', type: 'normal', target: { weight: w }, done: false });
  const s = { exercises: [{ exerciseId: 'sq', sets: [set(100), set(100)] }, { exerciseId: 'lp', sets: [set(120)] }, { exerciseId: 'db', sets: [set(15)] }] };
  const g = gymFromTemplate('commercial');
  const out = addWarmups(s, { catalog: cat, gym: g, configs: {}, profile: { warmupOnlyIfNotWorked: true }, newId });
  assert.equal(out.exercises[0].sets.filter((x) => x.type === 'warmup').length, 3);
  assert.equal(out.exercises[1].sets.length, 1, 'квадрицепс уже работал');
  assert.equal(out.exercises[2].sets.length, 1, '15 кг — без разминки');
  assert.deepEqual(out.cursor, { ei: 0, si: 0 });
  assert.deepEqual(out.exercises[0].sets[0].target.weight, 40);
  assert.equal(workingWeightOf(out.exercises[0]), 100);
  assert.deepEqual(workedMuscles(s, 2, cat, { planned: true }).sort(), ['glutes', 'quads']);
  assert.deepEqual(workedMuscles(s, 2, cat), [], 'без выполненных подходов — ничего не работало');
  assert.equal(warmupSetsForEntry(s, 1, { catalog: cat, gym: g, profile: {}, newId, force: true }).length > 0, true);
});

test('зал по умолчанию и доступность упражнения', () => {
  const a = { id: 'a' }, b = { id: 'b', isDefault: true };
  assert.equal(defaultGym([a, b], {}).id, 'b');
  assert.equal(defaultGym([a, b], { defaultGymId: 'a' }).id, 'a');
  assert.equal(defaultGym([], {}), null);
  const home = gymFromTemplate('home');
  assert.equal(availableInGym(SQ, home), false);
  assert.equal(availableInGym(PU, home), true);
  assert.equal(availableInGym(SQ, null), true);
});

test('похожие упражнения для замены: общие мышцы, паттерн, фильтр зала', () => {
  const list = [SQ, { id: 'fs', name: 'Фронтальный присед', equipment: ['barbell'], primaryMuscles: ['quads'], pattern: 'squat', type: 'compound' },
    { id: 'lp', name: 'Жим ногами', equipment: ['machine'], primaryMuscles: ['quads', 'glutes'], pattern: 'squat', type: 'compound' },
    { id: 'gs', name: 'Гоблет-присед', equipment: ['dumbbell'], primaryMuscles: ['quads'], pattern: 'squat', type: 'compound' },
    DB];
  const sim = similarExercises(SQ, list);
  assert.deepEqual(sim.map((e) => e.id), ['lp', 'gs', 'fs'], 'при равных баллах — по алфавиту');
  const home = gymFromTemplate('home');
  assert.deepEqual(similarExercises(SQ, list, { available: (e) => availableInGym(e, home) }).map((e) => e.id), ['gs']);
  assert.deepEqual(similarExercises(null, list), []);
});
