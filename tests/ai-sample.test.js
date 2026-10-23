/* ИИ в артефакте claude.ai: обёртка над возможностью sample, подготовка фото, ошибки, лимиты */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSchema, SCHEMAS } from '../web/src/services/ai-schemas.js';
import { mapSampleError, fitImage, scaledSize, prepareImage, wrapSample, getArtifactSample, artifactAiStatus, resetArtifactSample, IMAGE_STEPS } from '../web/src/services/ai-sample.js';
import { aiFill, aiPhoto, aiErrorKey, AI_ERR_CODES, AI_ERR_ARTIFACT } from '../web/src/services/ai-food.js';
import { isArtifact, claudeUse, lsGet, lsSet } from '../web/src/services/env.js';
import { saveViaDownloads } from '../web/src/ui/screens/backup.js';
import { usageStatus } from '../web/src/services/usage.js';
import { createStore, memoryBackend } from '../web/src/data/store.js';
import { hasKey } from '../web/src/i18n/index.js';

const blob = (n, type = 'image/jpeg') => new Blob([new Uint8Array(n)], { type });

/* Поддельный sample: запоминает вызовы, отвечает answer или отклоняет reject */
function fakeSample({ answer = {}, reject = null, limits = { maxPromptBytes: 262144 } } = {}) {
  const calls = [];
  const f = async () => ({ text: '', truncated: false });
  f.json = async (input, opts) => { calls.push({ input, opts }); if (reject) throw reject; return answer; };
  f.limits = async () => limits;
  f.calls = calls;
  return f;
}

test('sample: схема ответа дописывается в запрос', () => {
  const p = withSchema('Дай JSON', 'nutrition');
  assert.ok(p.startsWith('Дай JSON\n\n'));
  assert.ok(p.includes(JSON.stringify(SCHEMAS.nutrition)));
  assert.equal(withSchema('Без схемы'), 'Без схемы');
  assert.equal(withSchema('Неизвестная', 'nope'), 'Неизвестная');
});

test('sample: коды ошибок → коды приложения', () => {
  const m = (code) => mapSampleError({ code, message: 'x' }).code;
  assert.equal(m('cancelled'), 'cancelled');
  ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].forEach((c) => assert.equal(m(c), 'not_granted'));
  assert.equal(m('session_expired'), 'session_expired');
  assert.equal(m('images_unavailable'), 'images_unavailable');
  assert.equal(m('image_rejected'), 'image_rejected');
  assert.equal(m('rate_limited'), 'rate_limited');
  assert.equal(m('refused'), 'refused');
  assert.equal(m('invalid_json'), 'invalid_json');
  assert.equal(m('empty_completion'), 'invalid_json');
  assert.equal(m('prompt_too_large'), 'bad_request');
  assert.equal(m('upstream_error'), 'server');
  assert.equal(m('что-то новое'), 'server');
  assert.equal(mapSampleError(null).code, 'server');
  const e = mapSampleError({ code: 'rate_limited', message: 'x', text: 'часть' });
  assert.ok(e instanceof Error);
  assert.equal(e.sampleCode, 'rate_limited');
  assert.equal(e.text, 'часть');
});

test('фото: размер по длинной стороне, не увеличиваем', () => {
  assert.deepEqual(scaledSize(4032, 3024, 1568), { w: 1568, h: 1176 });
  assert.deepEqual(scaledSize(800, 600, 1568), { w: 800, h: 600 });
  assert.deepEqual(scaledSize(0, 0, 1568), { w: 1, h: 1 });
});

test('фото: первый вариант, который влезает в maxInputBytes', async () => {
  const seen = [];
  const sizes = [5000, 3000, 900, 500, 100];
  const enc = async (step) => { seen.push(step); return blob(sizes[seen.length - 1]); };
  const b = await fitImage(enc, 1000);
  assert.equal(b.size, 900);
  assert.deepEqual(seen, IMAGE_STEPS.slice(0, 3));
  /* без лимита — первая ступень */
  assert.equal((await fitImage(async () => blob(5000), 0)).size, 5000);
  /* ничего не влезло */
  await assert.rejects(() => fitImage(async () => blob(5000), 10), (e) => e.code === 'image_rejected');
  /* toBlob вернул null */
  await assert.rejects(() => fitImage(async () => null, 10), (e) => e.code === 'image_rejected');
  /* остановили */
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => fitImage(async () => blob(1), 10, IMAGE_STEPS, ctl.signal), (e) => e.code === 'cancelled');
});

test('фото: если перекодировать нельзя — исходный файл, когда он подходит', async () => {
  const broken = () => async () => { throw new Error('decode'); };
  const f = blob(500, 'image/png');
  assert.equal(await prepareImage(f, { maxInputBytes: 1000, mediaTypes: ['image/png'] }, { encoder: broken }), f);
  await assert.rejects(() => prepareImage(f, { maxInputBytes: 100, mediaTypes: ['image/png'] }, { encoder: broken }), (e) => e.code === 'image_rejected');
  await assert.rejects(() => prepareImage(blob(10, 'image/heic'), { maxInputBytes: 1000, mediaTypes: ['image/jpeg'] }, { encoder: broken }), (e) => e.code === 'image_rejected');
  /* кодировщик работает — берём его результат */
  const small = blob(50);
  assert.equal(await prepareImage(f, { maxInputBytes: 1000 }, { encoder: () => async () => small }), small);
});

test('обёртка: запрос со схемой, лишние опции не уходят в sample', async () => {
  const s = fakeSample({ answer: { kcal: 100 } });
  const w = wrapSample(s);
  const r = await w.json('Продукт', { schema: 'nutrition', modelTier: 'quick' });
  assert.deepEqual(r, { kcal: 100 });
  assert.equal(s.calls.length, 1);
  assert.ok(s.calls[0].input.includes('"kcal"'));
  assert.deepEqual(s.calls[0].opts, { modelTier: 'quick' });
  assert.equal(w.artifact, true);
});

test('обёртка: фото только если limits().images есть', async () => {
  const states = [];
  const s = fakeSample();
  const w = wrapSample(s, { onState: (x) => states.push(x), prepare: async () => { throw new Error('не должен вызываться'); } });
  await assert.rejects(() => w.json('Фото', { images: blob(10), schema: 'photo' }), (e) => e.code === 'images_unavailable');
  assert.equal(s.calls.length, 0);
  assert.deepEqual(states, [{ photo: false }]);

  const ready = blob(20);
  const s2 = fakeSample({ answer: { items: [] }, limits: { images: { maxCount: 1, maxInputBytes: 1234, mediaTypes: ['image/jpeg'] } } });
  let got = null;
  const w2 = wrapSample(s2, { prepare: async (file, lim) => { got = lim; return ready; } });
  await w2.json('Фото', { images: blob(10), modelTier: 'default' });
  assert.equal(got.maxInputBytes, 1234);
  assert.equal(s2.calls[0].opts.images, ready);
  assert.equal(s2.calls[0].opts.modelTier, 'default');
});

test('обёртка: отказ в доступе выключает ИИ, отмена до вызова ничего не шлёт', async () => {
  const states = [];
  const w = wrapSample(fakeSample({ reject: { code: 'sampling_disabled', message: 'off' } }), { onState: (x) => states.push(x) });
  await assert.rejects(() => w.json('x'), (e) => e.code === 'not_granted' && e.sampleCode === 'sampling_disabled');
  assert.deepEqual(states, [{ denied: true }]);
  const s = fakeSample();
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => wrapSample(s).json('x', { signal: ctl.signal }), (e) => e.code === 'cancelled');
  assert.equal(s.calls.length, 0);
  /* limits() отклонился — считаем, что фото нельзя */
  const bad = fakeSample(); bad.limits = async () => { throw new Error('x'); };
  assert.deepEqual(await wrapSample(bad).limits(), {});
});

test('доступность: sample есть / нет / нет window.claude', async () => {
  resetArtifactSample();
  const s = fakeSample({ limits: { images: { maxCount: 1, maxInputBytes: 5e6, mediaTypes: ['image/jpeg'] } } });
  const w = await getArtifactSample({ claude: { use: async (n) => (n === 'sample' ? s : null) } });
  assert.ok(w && w.artifact);
  assert.deepEqual(artifactAiStatus(), { status: 'ready', photo: true });
  /* отказ при вызове → denied */
  s.json = async () => { throw { code: 'not_granted', message: 'no' }; };
  await assert.rejects(() => w.json('x'), (e) => e.code === 'not_granted');
  assert.equal(artifactAiStatus().status, 'denied');

  resetArtifactSample();
  assert.equal(await getArtifactSample({ claude: { use: async () => null } }), null);
  assert.equal(artifactAiStatus().status, 'unavailable');
  resetArtifactSample();
  assert.equal(await getArtifactSample({}), null);
  resetArtifactSample();
  assert.equal(await getArtifactSample({ claude: { use: () => { throw new Error('x'); } } }), null);
  resetArtifactSample();
});

test('артефакт: автозаполнение через sample без ключа, счётчик лимитов растёт', async () => {
  const store = await createStore(memoryBackend());
  const s = fakeSample({ answer: { kcal: 343, p: 13, f: 3.4, c: 72, fib: 10, pa: 0, pv: 13, note: 'сухая' } });
  const w = wrapSample(s);
  const opts = { today: '2026-10-16', now: '2026-10-16T10:00:00.000Z', artifact: true, getSample: async () => w };
  const r = await aiFill(store, 'Гречка', opts);
  assert.equal(r.per100.kcal, 343);
  assert.equal(r.note, 'сухая');
  assert.ok(s.calls[0].input.includes('Гречка') && s.calls[0].input.includes('JSON Schema'));
  assert.equal(s.calls[0].opts.modelTier, 'quick');
  assert.equal(usageStatus(store, 'ai_fill', '2026-10-16').used.day, 1);
  /* лимит исчерпан — запрос не уходит */
  const limits = { ai_fill: { day: 1, week: 0, month: 0 } };
  await assert.rejects(() => aiFill(store, 'Рис', Object.assign({ limits }, opts)), (e) => e.code === 'limit' && e.period === 'day');
  assert.equal(s.calls.length, 1);
  /* sample недоступен */
  await assert.rejects(() => aiFill(store, 'Рис', Object.assign({}, opts, { getSample: async () => null })), (e) => e.code === 'unavailable');
  /* ошибка sample не увеличивает счётчик */
  const bad = wrapSample(fakeSample({ reject: { code: 'rate_limited', message: 'x' } }));
  await assert.rejects(() => aiFill(store, 'Рис', Object.assign({}, opts, { getSample: async () => bad })), (e) => e.code === 'rate_limited');
  assert.equal(usageStatus(store, 'ai_fill', '2026-10-16').used.day, 1);
});

test('артефакт: фото через sample, разбор прежним парсером', async () => {
  const store = await createStore(memoryBackend());
  const s = fakeSample({
    answer: { items: [{ name: 'Яблоко', grams: 180, kcal: 52, p: 0.3, f: 0.2, c: 14, fib: 2.4, pa: 0, pv: 0.3, src: 'estimate', note: '' }, { name: '', kcal: 1 }], note: 'ок' },
    limits: { images: { maxCount: 1, maxInputBytes: 1e6, mediaTypes: ['image/jpeg'] } }
  });
  const w = wrapSample(s, { prepare: async () => blob(10) });
  const r = await aiPhoto(store, blob(100), { today: '2026-10-16', now: '2026-10-16T10:00:00.000Z', artifact: true, getSample: async () => w });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].grams, 180);
  assert.equal(usageStatus(store, 'ai_photo', '2026-10-16').used.day, 1);
});

test('артефакт: свои сообщения об ошибках, все ключи есть в каталоге', () => {
  assert.equal(aiErrorKey({ code: 'not_granted' }, true), 'ai.err.artifact.not_granted');
  assert.equal(aiErrorKey({ code: 'not_granted' }, false), 'ai.err.not_granted');
  assert.equal(aiErrorKey({ code: 'limit' }, true), 'ai.err.artifact.limit');
  assert.equal(aiErrorKey({ code: 'session_expired' }, true), 'ai.err.session_expired');
  assert.equal(aiErrorKey({ code: 'server' }, true), 'ai.err.other');
  const keys = AI_ERR_CODES.map((c) => 'ai.err.' + c).concat(AI_ERR_ARTIFACT.map((c) => 'ai.err.artifact.' + c));
  assert.deepEqual(keys.filter((k) => !hasKey(k)), []);
});

test('среда: флаг артефакта, window.claude и localStorage без падений', async () => {
  assert.equal(isArtifact({}), false);
  assert.equal(isArtifact({ JOURNAL_ARTIFACT: true }), true);
  assert.equal(await claudeUse('sample', {}), null);
  assert.equal(await claudeUse('sample', { claude: { use: async () => { throw new Error('x'); } } }), null);
  const d = { save() {} };
  assert.equal(await claudeUse('downloads', { claude: { use: async () => d } }), d);
  /* в Node localStorage нет — обёртки не бросают */
  assert.equal(lsGet('x'), null);
  assert.equal(typeof lsSet('x', '1'), 'boolean');
});

test('резервная копия: сохранение через downloads артефакта', async () => {
  const saved = [];
  const ok = await saveViaDownloads('a.json', '{}', async () => ({ save: async (r) => { saved.push(r); return { status: 'saved' }; } }));
  assert.deepEqual(ok, { status: 'saved' });
  assert.deepEqual(saved, [{ filename: 'a.json', data: '{}' }]);
  assert.equal((await saveViaDownloads('a.json', '{}', async () => null)).status, 'unavailable');
  const rej = (code) => saveViaDownloads('a.json', '{}', async () => ({ save: async () => { throw { code, message: 'x' }; } }));
  assert.equal((await rej('declined')).status, 'declined');
  assert.equal((await rej('unavailable')).status, 'unavailable');
  assert.equal((await rej('capability_removed')).status, 'unavailable');
  assert.equal((await rej('too_large')).status, 'failed');
  assert.equal((await rej('rate_limited')).status, 'failed');
});
