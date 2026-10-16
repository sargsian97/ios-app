import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromLibrary, mergeCatalog, searchExercises, filterExercises, guessFromName, usageCounts, groupOf, MUSCLE_GROUPS } from '../web/src/domain/exercises.js';
import { MUSCLES, EQUIPMENT_KEYS, PATTERNS, EX_TYPES, EX_CATEGORIES, METRICS } from '../web/src/data/models/workout.js';
import { Exercise } from '../web/src/data/models/workout.js';
import { buildItem } from '../scripts/build-exercises.mjs';

const LIB = JSON.parse(readFileSync(new URL('../web/data/exercises.json', import.meta.url)));

test('справочник: источник и лицензия, все значения из наших списков', () => {
  assert.equal(LIB.source, 'free-exercise-db');
  assert.equal(LIB.license, 'Unlicense');
  assert.ok(LIB.items.length > 800);
  const ids = new Set();
  LIB.items.forEach((it) => {
    assert.ok(!ids.has(it.id), 'id уникальны: ' + it.id);
    ids.add(it.id);
    assert.ok(it.n && it.en, it.id);
    assert.ok(EX_TYPES.includes(it.t), it.id + ' t');
    assert.ok(PATTERNS.includes(it.p), it.id + ' p');
    assert.ok(EX_CATEGORIES.includes(it.c), it.id + ' c');
    it.pm.concat(it.sm).forEach((m) => assert.ok(MUSCLES.includes(m), it.id + ' ' + m));
    it.eq.forEach((e) => assert.ok(EQUIPMENT_KEYS.includes(e), it.id + ' ' + e));
    it.m.forEach((m) => assert.ok(METRICS.includes(m), it.id + ' ' + m));
  });
});

test('справочник: запись базы проходит проверку модели Exercise', () => {
  const bad = LIB.items.map(fromLibrary).filter((e) => Exercise.validate(Exercise.normalize(e)).length);
  assert.deepEqual(bad.map((e) => e.id), []);
});

test('справочник: русские названия уникальны', () => {
  const names = LIB.items.filter((it) => it.ru !== false).map((it) => it.n.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test('сборка: мышцы базы → наши, плечи делятся на дельты', () => {
  const press = buildItem({ id: 'X', name: 'Dumbbell Shoulder Press', mechanic: 'compound', force: 'push', equipment: 'dumbbell', category: 'strength', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'] });
  assert.deepEqual([press.pm, press.sm, press.t, press.r], [['front_delts'], ['triceps'], 'compound', 'upper']);
  const lat = buildItem({ id: 'Y', name: 'Side Lateral Raise', mechanic: 'isolation', equipment: 'dumbbell', category: 'strength', primaryMuscles: ['shoulders'], secondaryMuscles: [] });
  assert.deepEqual(lat.pm, ['side_delts']);
  const rear = buildItem({ id: 'Z', name: 'Cable Rear Delt Fly', mechanic: 'isolation', equipment: 'cable', category: 'strength', primaryMuscles: ['shoulders'], secondaryMuscles: [] });
  assert.deepEqual(rear.pm, ['rear_delts']);
  const run = buildItem({ id: 'R', name: 'Running, Treadmill', equipment: 'machine', category: 'cardio', primaryMuscles: ['quadriceps'], secondaryMuscles: [] });
  assert.deepEqual([run.t, run.m, run.p], ['cardio', ['time', 'distance'], 'cardio']);
  const ru = buildItem({ id: 'Q', name: 'Barbell Squat', mechanic: 'compound', equipment: 'barbell', category: 'strength', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'] }, { n: 'Присед со штангой', s: ['Присед'], p: 'squat', l: 'bilateral' });
  assert.deepEqual([ru.n, ru.s, ru.p, ru.ru], ['Присед со штангой', ['присед'], 'squat', undefined]);
});

const CAT = mergeCatalog([
  fromLibrary({ id: 'fe-1', n: 'Жим лёжа', en: 'Barbell Bench Press', s: ['жим штанги'], t: 'compound', c: 'strength', pm: ['chest'], sm: ['triceps'], eq: ['barbell', 'bench'], m: ['weight', 'reps'] }),
  fromLibrary({ id: 'fe-2', n: 'Становая тяга', en: 'Barbell Deadlift', s: ['становая'], t: 'compound', c: 'powerlifting', pm: ['hamstrings', 'glutes'], sm: ['lower_back'], eq: ['barbell'], m: ['weight', 'reps'] }),
  fromLibrary({ id: 'fe-3', n: 'Французский жим', en: 'EZ-Bar Skullcrusher', s: ['скулкрашер'], t: 'isolation', c: 'strength', pm: ['triceps'], sm: [], eq: ['ez_bar'], m: ['weight', 'reps'] })
], [
  { id: 'my', name: 'Жим в тренажёре на наклоне', synonyms: [], type: 'compound', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: ['machine'], source: 'user', archived: false },
  { id: 'fe-3', name: 'Французский жим', nameEn: 'EZ-Bar Skullcrusher', synonyms: ['скулкрашер'], type: 'isolation', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['ez_bar'], source: 'library', archived: true }
]);

test('поиск: по началу слов, синонимам, английскому; свои выше', () => {
  assert.deepEqual(searchExercises(CAT, 'жим').map((e) => e.id).slice(0, 2), ['my', 'fe-1']);
  assert.deepEqual(searchExercises(CAT, 'становая').map((e) => e.id), ['fe-2']);
  assert.deepEqual(searchExercises(CAT, 'deadlift').map((e) => e.id), ['fe-2']);
  assert.deepEqual(searchExercises(CAT, 'скул').map((e) => e.id), ['fe-3']);
  assert.deepEqual(searchExercises(CAT, 'жим лежа').map((e) => e.id), ['fe-1'], 'ё = е, все слова');
  assert.deepEqual(searchExercises(CAT, 'тяга', { usage: { 'fe-2': 3 } }).map((e) => e.id), ['fe-2']);
  assert.equal(searchExercises(CAT, '').length, 4);
  assert.equal(searchExercises(CAT, 'zzz').length, 0);
});

test('фильтры: группа мышц, вторичные, оборудование, источник, архив', () => {
  assert.deepEqual(filterExercises(CAT, { group: 'chest' }).map((e) => e.id).sort(), ['fe-1', 'my']);
  assert.deepEqual(filterExercises(CAT, { muscle: 'triceps' }).map((e) => e.id), [], 'архив скрыт');
  assert.deepEqual(filterExercises(CAT, { muscle: 'triceps', secondary: true }).map((e) => e.id), ['fe-1']);
  assert.deepEqual(filterExercises(CAT, { equipment: 'barbell' }).map((e) => e.id).sort(), ['fe-1', 'fe-2']);
  assert.deepEqual(filterExercises(CAT, { source: 'mine' }).map((e) => e.id), ['my']);
  assert.deepEqual(filterExercises(CAT, { archived: 'only' }).map((e) => e.id), ['fe-3']);
  assert.equal(groupOf('rear_delts'), 'shoulders');
  assert.deepEqual(MUSCLE_GROUPS.flatMap(([, m]) => m).sort(), MUSCLES.slice().sort(), 'каждая мышца в одной группе');
});

test('разбор русского названия для своих упражнений', () => {
  const g = (n) => guessFromName(n);
  assert.deepEqual(g('Присед со штангой').primaryMuscles, ['quads', 'glutes']);
  assert.deepEqual(g('Присед со штангой').equipment, ['barbell']);
  assert.deepEqual(g('Обратная бабочка').primaryMuscles, ['rear_delts']);
  assert.deepEqual(g('Бабочка (грудь)').primaryMuscles, ['chest']);
  assert.deepEqual(g('Трицепс на блоке (каждая рука)').primaryMuscles, ['triceps']);
  assert.equal(g('Трицепс на блоке (каждая рука)').perSide, true);
  assert.deepEqual(g('Планка').metrics, ['time']);
  assert.equal(g('Верхний блок, узкий хват').pattern, 'pull_vertical');
  assert.equal(g('Тяга с упором грудью').pattern, 'pull_horizontal');
  assert.equal(g('Жим на наклоне (тренажёр, на руку)').pattern, 'push_horizontal');
  assert.deepEqual(g('Махи в кроссовере (средняя дельта)').primaryMuscles, ['side_delts']);
  assert.equal(g('Беговая дорожка').type, 'cardio');
  assert.equal(g('Что-то своё').pattern, 'other');
});

test('частота упражнений по истории', () => {
  assert.deepEqual(usageCounts([{ exercises: [{ exerciseId: 'a' }, { exerciseId: 'b' }] }, { exercises: [{ exerciseId: 'a' }] }]), { a: 2, b: 1 });
});
