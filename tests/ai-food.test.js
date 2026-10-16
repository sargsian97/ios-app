import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePer100, parsePhoto, splitProtein, fillPrompt, aiErrorKey, aiFill } from '../web/src/services/ai-food.js';
import { createStore, memoryBackend } from '../web/src/data/store.js';

test('ИИ: разбор питательности, неправдоподобное отклоняется', () => {
  assert.deepEqual(parsePer100({ kcal: 559, p: 30.2, f: 49, c: 10.7, fib: 6, pa: 0, pv: 30.2 }), { kcal: 559, protein: 30.2, fat: 49, carbs: 10.7, fiber: 6, protein_animal: 0, protein_plant: 30.2 });
  assert.equal(parsePer100({ kcal: 2000, p: 1, f: 1, c: 1, fib: 0 }), null);
  assert.equal(parsePer100({ kcal: 100, p: -1, f: 1, c: 1, fib: 0 }), null);
  assert.equal(parsePer100(null), null);
  assert.equal(parsePer100({ kcal: 100, p: 10, f: 1, c: 1, fib: 0 }).protein_animal, undefined, 'без разбивки белка');
});

test('ИИ: разбивка белка в сумме равна белку', () => {
  assert.deepEqual(splitProtein(10, 3, 1), { protein_animal: 7.5, protein_plant: 2.5 });
  assert.deepEqual(splitProtein(10, 0, 0), {});
  assert.deepEqual(splitProtein(0, 1, 1), {});
});

test('ИИ: разбор фото — не больше 8, вес по умолчанию, плохие пропускаются', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ name: 'П' + i, grams: i === 0 ? 5000 : 100, kcal: 100, p: 5, f: 5, c: 5, fib: 1, src: i === 1 ? 'label' : 'x' }));
  items[2].kcal = 'много';
  const r = parsePhoto({ items, note: 'ок' });
  assert.equal(r.items.length, 7);
  assert.equal(r.items[0].grams, 100);
  assert.equal(r.items[1].src, 'label');
  assert.equal(r.items[2].src, 'estimate');
  assert.equal(r.note, 'ок');
  assert.deepEqual(parsePhoto(null), { items: [], note: '' });
});

test('ИИ: подсказка и ключи ошибок', () => {
  assert.match(fillPrompt('Гречка', 150), /«Гречка»\. Порция: 150 г/);
  assert.doesNotMatch(fillPrompt('Гречка', 0), /Порция/);
  assert.equal(aiErrorKey({ code: 'limit' }), 'ai.err.limit');
  assert.equal(aiErrorKey({ code: 'strange' }), 'ai.err.other');
  assert.equal(aiErrorKey(null), 'ai.err.other');
});

test('ИИ: без ключа запрос не уходит', async () => {
  const s = await createStore(memoryBackend());
  await assert.rejects(() => aiFill(s, 'Гречка', { today: '2026-10-16', now: '2026-10-16T10:00:00.000Z' }), (e) => e.code === 'no_key');
  await assert.rejects(() => aiFill(s, '  ', { today: '2026-10-16' }), (e) => e.code === 'no_name');
});
