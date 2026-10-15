/* Офлайн-кэш должен знать про каждый файл приложения, иначе на телефоне без сети он не загрузится. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
const SKIP = [/^sw\.js$/, /^\.nojekyll$/, /\.txt$/, /\.md$/];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(WEB, p)];
  });
}

function shell() {
  const src = readFileSync(join(WEB, 'sw.js'), 'utf8');
  const m = src.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, 'в sw.js нет списка SHELL');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('каждый файл web/ есть в SHELL', () => {
  const list = shell();
  const missing = walk(WEB).filter((f) => !SKIP.some((r) => r.test(f)) && !list.includes(f));
  assert.deepEqual(missing, [], 'добавь в SHELL в web/sw.js');
});

test('в SHELL нет несуществующих файлов', () => {
  const files = new Set(walk(WEB));
  const extra = shell().filter((f) => f !== './' && !files.has(f));
  assert.deepEqual(extra, []);
});

test('VERSION задан', () => {
  const src = readFileSync(join(WEB, 'sw.js'), 'utf8');
  assert.match(src, /const VERSION = '\d{4}-\d{2}-\d{2}\.\d+';/);
});

test('VERSION в sw.js совпадает с APP_VERSION', async () => {
  const src = readFileSync(join(WEB, 'sw.js'), 'utf8');
  const v = src.match(/const VERSION = '([^']+)'/)[1];
  const { APP_VERSION } = await import('../web/src/version.js');
  assert.equal(APP_VERSION, v);
});
