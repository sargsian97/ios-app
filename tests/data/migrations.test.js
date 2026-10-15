import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../web/src/data/store.js';
import { migrate, schemaVersion, SCHEMA_VERSION } from '../../web/src/data/migrations.js';

test('миграции: пустое хранилище доходит до последней версии', async () => {
  const s = await createStore(memoryBackend());
  assert.equal(schemaVersion(s), 1);
  const r = await migrate(s, { now: '2026-10-16T00:00:00.000Z' });
  assert.equal(r.from, 1);
  assert.equal(r.to, SCHEMA_VERSION);
  assert.equal(schemaVersion(s), SCHEMA_VERSION);
  assert.equal(s.get('profile', 'me').theme, 'system');
  assert.equal(s.get('meta', 'schema').history.length, r.applied.length);
});

test('миграции: повторный запуск ничего не меняет', async () => {
  const s = await createStore(memoryBackend());
  await migrate(s);
  const r = await migrate(s);
  assert.deepEqual(r.applied, []);
});

test('миграция 2: рост берётся из настроек журнала, старые записи на месте', async () => {
  const s = await createStore(memoryBackend({ settings: { main: { height: 181, lang: 'ru' } }, body: { '2026-01-01': { weight: 80 } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, 181);
  assert.equal(s.get('settings', 'main').height, 181);
  assert.equal(s.get('body', '2026-01-01').weight, 80);
});

test('миграция 2: неправдоподобный рост не переносится', async () => {
  const s = await createStore(memoryBackend({ settings: { main: { height: 17 } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, null);
});

test('миграция 2: существующий профиль не перезаписывается', async () => {
  const s = await createStore(memoryBackend({ profile: { me: { id: 'me', sex: 'female', theme: 'dark' } } }));
  await migrate(s);
  assert.equal(s.get('profile', 'me').sex, 'female');
  assert.equal(s.get('profile', 'me').theme, 'dark');
});

test('миграции: старая копия после импорта снова мигрирует', async () => {
  const s = await createStore(memoryBackend());
  await migrate(s);
  await s.importAll({ settings: { main: { height: 170 } } });
  assert.equal(schemaVersion(s), 1);
  await migrate(s);
  assert.equal(s.get('profile', 'me').heightCm, 170);
});
