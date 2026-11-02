/* Доска снимков: node design/liquid-glass/board.mjs [light|dark] [glass|plain] [scale]
   Собирает shots/<mode>-<тема>-*.png в одну картинку shots/board-<mode>-<тема>.jpg */
import { readdirSync, readFileSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const MODE = process.argv[3] || 'glass';
const SCALE = Number(process.argv[4]) || 2;
const OUT = new URL('./shots/', import.meta.url).pathname;
const NAMES = { '01-today': 'Сегодня', '02-food': 'Питание', '03-food-scroll': 'Питание · прокрутка', '04-train': 'Тренировка', '05-body': 'Тело', '06-more': 'Ещё',
  '07-settings': 'Настройки', '08-sheet': 'Шторка', '09-modal': 'Окно', '10-food-add': 'Добавить еду', '11-workout': 'Тренировка идёт' };
/* compare: «как сейчас» над «Liquid Glass» для главных экранов */
const CMP = ['01-today', '02-food', '04-train', '05-body', '08-sheet', '11-workout'];
const files = MODE === 'compare'
  ? [...CMP.map((k) => 'plain-' + SC + '-' + k + '.png'), ...CMP.map((k) => 'glass-' + SC + '-' + k + '.png')]
  : readdirSync(OUT).filter((f) => f.startsWith(MODE + '-' + SC + '-') && f.endsWith('.png')).sort();
const dark = SC === 'dark';
const cells = files.map((f) => {
  const key = f.replace(/^(plain|glass)-(light|dark)-/, '').slice(0, -4);
  const pre = MODE === 'compare' ? (f.startsWith('plain') ? 'Сейчас · ' : 'Liquid Glass · ') : '';
  const b64 = readFileSync(OUT + f).toString('base64');
  return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${pre}${NAMES[key] || key}</figcaption></figure>`;
}).join('');
const page = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:36px 40px 40px;background:${dark ? '#0b0b10' : '#e9ebf2'};font:600 15px -apple-system,system-ui,sans-serif;color:${dark ? '#f2f2f7' : '#1c1c1e'}}
h1{margin:0 0 24px;font-size:26px;letter-spacing:-.3px}h1 small{font-weight:500;opacity:.6;margin-left:10px;font-size:16px}
.g{display:grid;grid-template-columns:repeat(6,260px);gap:28px 22px}
figure{margin:0}img{width:260px;display:block;border-radius:34px;box-shadow:0 0 0 6px ${dark ? '#222228' : '#fff'},0 18px 40px rgba(0,0,0,.25)}
figcaption{margin-top:14px;text-align:center}</style>
<h1>${MODE === 'compare' ? 'Было → стало' : 'Liquid Glass'} — ${dark ? 'тёмная тема' : 'светлая тема'}<small>${MODE === 'glass' ? 'новый дизайн' : MODE === 'compare' ? 'сверху — как сейчас, снизу — новый дизайн' : 'как сейчас'}</small></h1><div class="g">${cells}</div>`;
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: SCALE });
await p.setContent(page);
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'board-' + MODE + '-' + SC + '.jpg', fullPage: true, type: 'jpeg', quality: 86 });
await browser.close();
console.log('board-' + MODE + '-' + SC + '.jpg', files.length);
