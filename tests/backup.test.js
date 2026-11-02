import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup } from '../web/src/data/store.js';

test('parseBackup: читает файл журнала', () => {
  const d = parseBackup(JSON.stringify({ app: 'journal', format: 1, data: { body: { '2026-01-01': { weight: 80 } } } }));
  assert.equal(d.body['2026-01-01'].weight, 80);
});

test('parseBackup: понятные ошибки', () => {
  assert.throws(() => parseBackup('не json'), /не JSON/);
  assert.throws(() => parseBackup('{"app":"other"}'), /нет данных/);
});

test('напоминание о копии: нет копии, старше недели, свежая', async () => {
  const { backupDue } = await import('../web/src/ui/screens/backup.js');
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(backupDue(null, now), true);
  assert.equal(backupDue('мусор', now), true);
  assert.equal(backupDue('2026-10-20T12:00:00Z', now), true);
  assert.equal(backupDue('2026-10-26T12:00:00Z', now), true, 'ровно 7 дней — пора');
  assert.equal(backupDue('2026-10-27T12:00:00Z', now), false);
  assert.equal(backupDue('2026-10-20T12:00:00Z', now, 30), false);
});
