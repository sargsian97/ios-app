/* Обновляет список SHELL в web/sw.js по файлам из web/ (кроме sw.js, лицензий и заметок).
   Запуск: npm run shell. Версию (VERSION) меняй отдельно, при выпуске. */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
const SKIP = [/^sw\.js$/, /^\.nojekyll$/, /\.txt$/, /\.md$/];
const FIRST = ['./', 'index.html', 'styles.css', 'app.js', 'ai.js', 'manifest.webmanifest'];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(WEB, p)];
  });
}

const files = walk(WEB).filter((f) => !SKIP.some((r) => r.test(f)) && !FIRST.includes(f)).sort((a, b) => {
  const da = a.split('/').length, db = b.split('/').length;
  return a.split('/')[0].localeCompare(b.split('/')[0]) || da - db || a.localeCompare(b);
});
const list = FIRST.filter((f) => f === './' || files.includes(f) || statSync(join(WEB, f), { throwIfNoEntry: false })).concat(files);
const src = readFileSync(join(WEB, 'sw.js'), 'utf8');
const out = src.replace(/const SHELL = \[[\s\S]*?\];/, 'const SHELL = [\n' + list.map((f) => "  '" + f + "'").join(',\n') + '\n];');
writeFileSync(join(WEB, 'sw.js'), out);
console.log('SHELL: ' + list.length + ' файлов');
