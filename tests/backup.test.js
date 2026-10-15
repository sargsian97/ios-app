import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup } from '../web/store.js';

test('parseBackup: читает файл журнала', () => {
  const d = parseBackup(JSON.stringify({ app: 'journal', format: 1, data: { body: { '2026-01-01': { weight: 80 } } } }));
  assert.equal(d.body['2026-01-01'].weight, 80);
});

test('parseBackup: понятные ошибки', () => {
  assert.throws(() => parseBackup('не json'), /не JSON/);
  assert.throws(() => parseBackup('{"app":"other"}'), /нет данных/);
});
