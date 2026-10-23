/* Список файлов для публикации журнала как Artifact на claude.ai:
   страница — artifact/index.html, остальное — файлы web/ по тем же путям.
   node scripts/artifact-files.mjs → JSON { "опубликованный/путь": "web/путь" } */
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
/* PWA-обвязка в артефакте не нужна: там нет service worker и установки на экран «Домой» */
const SKIP = new Set(['index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(path.relative(WEB, p));
  }
  return out;
}

const files = {};
walk(WEB).filter((f) => !SKIP.has(f)).sort().forEach((f) => { files[f] = 'web/' + f; });
process.stdout.write(JSON.stringify(files) + '\n');
