import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as planned from '../web/src/services/ai-planned.js';

test('отложенные ИИ-функции: есть интерфейс, вызов честно говорит «скоро»', async () => {
  for (const name of planned.PLANNED) {
    assert.equal(typeof planned[name], 'function', name);
    await assert.rejects(() => planned[name](), (e) => e.code === 'planned');
  }
});
