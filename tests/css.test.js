/* Стили — один слой: каждый класс из экранов есть в styles.css, каждый класс в styles.css где-то используется,
   без !important (кроме reduced-motion) и без лишних блоков :root. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
const cssRaw = readFileSync(join(WEB, 'styles.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, ''); /* без комментариев */
const SRC = join(WEB, 'src');
function walk(dir) { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; }); }

/* классы из разметки: статические class="…", cls="…", className = '…' и первая строка в class=${'…' + …} */
function usedClasses() {
  const used = new Set();
  walk(SRC).forEach((f) => {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b(?:class|cls)="([^"$]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
    for (const m of s.matchAll(/className = '([^']+)'/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
    for (const m of s.matchAll(/\b(?:class|cls)=\$\{\s*'([^']*)'/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
    for (const m of s.matchAll(/\b(?:class|cls)=\$\{[^}]*?\?\s*'([^']*)'\s*:\s*'([^']*)'/g)) [m[1], m[2]].forEach((x) => x.split(/\s+/).forEach((c) => c && used.add(c)));
  });
  return used;
}
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]));
/* классы, которые собираются из частей в коде */
const DYNAMIC_PREFIXES = ['mm-', 'st-', 's-', 'd-', 'ch-k', 'm'];
/* классы, которые ставит не разметка экранов: index.html, main.js (#write-error), SVG из chart/muscle-map, стороны подхода */
const EXTRA_USED = ['warnb', 'status', 'err', 'no-tabs', 'on', 'off', 'in', 'over', 'hit', 'sel', 'cur', 'done', 'warm', 'past', 'fut', 'tod', 'busy', 'now', 'dash', 'ph', 'pred', 'today', 'rest', 'eq', 'eqf', 'less', 'skipped', 'grouped', 'up', 'dn', 'dl'];

test('css: каждый класс из экранов описан в styles.css', () => {
  const missing = [...usedClasses()].filter((c) => !cssClasses.has(c) && !DYNAMIC_PREFIXES.some((p) => c.startsWith(p)) && !/^[a-z]$/.test(c));
  assert.deepEqual(missing.sort(), []);
});

test('css: в styles.css нет классов, которые нигде не используются', () => {
  const used = usedClasses();
  EXTRA_USED.forEach((c) => used.add(c));
  const unused = [...cssClasses].filter((c) => !used.has(c) && !DYNAMIC_PREFIXES.some((p) => c.startsWith(p)));
  assert.deepEqual(unused.sort(), []);
});

test('css: !important только для reduced-motion, не больше 3 блоков :root с токенами', () => {
  const noMotion = css.replace(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\n\}/g, '');
  const bad = noMotion.split('\n').filter((l) => l.includes('!important'));
  assert.deepEqual(bad, []);
  const roots = css.match(/^:root(?:\[[^\]]*\]|:not\([^)]*\))?\s*\{/gm) || [];
  assert.ok(roots.length <= 3, 'блоков :root: ' + roots.length);
});
