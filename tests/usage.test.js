import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../web/src/data/store.js';
import { usageStatus, recordUseOp, periodKeys } from '../web/src/services/usage.js';

const LIM = { ai_photo: { day: 2, week: 3, month: 0 } };

test('periodKeys: неделя с понедельника', () => {
  assert.deepEqual(periodKeys('2026-10-18'), { day: '2026-10-18', week: '2026-10-12', month: '2026-10' });
  assert.equal(periodKeys('2026-10-12').week, '2026-10-12');
  assert.equal(periodKeys('2026-11-01').week, '2026-10-26');
});

test('лимиты: день, затем неделя; новый день сбрасывает дневной счётчик', async () => {
  const s = await createStore(memoryBackend());
  const use = (d) => s.batch([recordUseOp(s, 'ai_photo', d, d + 'T10:00:00.000Z')]);
  assert.equal(usageStatus(s, 'ai_photo', '2026-10-12', LIM).allowed, true);
  await use('2026-10-12'); await use('2026-10-12');
  let st = usageStatus(s, 'ai_photo', '2026-10-12', LIM);
  assert.equal(st.allowed, false);
  assert.equal(st.blockedBy, 'day');
  st = usageStatus(s, 'ai_photo', '2026-10-13', LIM);
  assert.equal(st.allowed, true);
  assert.equal(st.used.week, 2);
  await use('2026-10-13');
  st = usageStatus(s, 'ai_photo', '2026-10-14', LIM);
  assert.equal(st.blockedBy, 'week');
  assert.equal(usageStatus(s, 'ai_photo', '2026-10-19', LIM).allowed, true, 'новая неделя');
  assert.equal(usageStatus(s, 'ai_photo', '2026-10-19', LIM).used.month, 3, 'месяц без лимита (0), но считается');
});

test('неизвестная функция — ошибка', async () => {
  const s = await createStore(memoryBackend());
  assert.throws(() => usageStatus(s, 'nope', '2026-10-12', LIM), /unknown/);
});
