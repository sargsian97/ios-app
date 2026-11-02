/* Снимки экранов приложения для обзора дизайна (тема Liquid Glass уже в web/styles.css).
   Запуск: node design/liquid-glass/preview.mjs [light|dark] [glass|plain] [video]
   Снимки — в design/liquid-glass/shots/, видео — shots/demo-<тема>.webm. Данные — выдуманная копия tests/fixtures. */
import { serve } from '../../tests/e2e/serve.mjs';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const MODE = process.argv[3] || 'glass';
const VIDEO = process.argv[4] === 'video';
const HERE = new URL('./', import.meta.url).pathname;
const OUT = HERE + 'shots/';
const BACKUP = new URL('../../tests/fixtures/backup-sample.json', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PORT = 8790 + (SC === 'dark' ? 1 : 0) + (MODE === 'glass' ? 0 : 2) + (VIDEO ? 4 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const dev = devices['iPhone 13'];
const ctx = await browser.newContext({ ...dev, colorScheme: SC, locale: 'ru-RU', serviceWorkers: 'block',
  ...(VIDEO ? { deviceScaleFactor: 2, recordVideo: { dir: OUT + 'tmp-video/', size: { width: 780, height: 1688 } } } : {}) });
/* тема уже в web/styles.css; режим plain оставлен для совместимости имён снимков */
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const wait = (ms = 400) => p.waitForTimeout(ms);
const shot = async (name) => { if (!VIDEO) await p.screenshot({ path: OUT + MODE + '-' + SC + '-' + name + '.png', animations: 'disabled' }); };
const go = async (hash, ms = 1300) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(ms); };
const tab = async (name, ms = 1100) => { await p.locator('.tabs .tab', { hasText: name }).click(); await wait(ms); };

await go('');
await p.waitForSelector('.tabs');
/* импорт выдуманной копии; окно подтверждения — тоже экран дизайна */
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary'); await wait(700);
await shot('09-modal');
await p.click('.modal .primary');
await p.waitForLoadState('load'); await wait(1500);
await p.waitForSelector('.dgrid'); await wait(1200);
await shot('01-today');

if (VIDEO) {
  /* короткая демонстрация движения: линза вкладок, появление экранов, шторка, переключатель */
  for (const t of ['Питание', 'Тренировка', 'Тело', 'Ещё', 'Сегодня']) await tab(t, 1300);
  await p.mouse.wheel(0, 500); await wait(900); await p.mouse.wheel(0, -500); await wait(700);
  await tab('Тело', 1200);
  await go('#/more/body?open=weigh', 1600);
  await p.locator('.sheet-bg').click({ position: { x: 20, y: 20 } }); await wait(900);
  await tab('Питание', 1200);
  await p.locator('.fab').click(); await wait(1400);
  await p.locator('.back').first().click(); await wait(1000);
  await go('#/more/settings', 1200);
  const pills = p.locator('.pill');
  for (let i = 0; i < Math.min(3, await pills.count()); i++) { await pills.nth(i).click(); await wait(700); }
  await tab('Сегодня', 1500);
} else {
  await tab('Питание'); await shot('02-food');
  await p.mouse.wheel(0, 420); await wait(700); await shot('03-food-scroll');
  await tab('Тренировка'); await shot('04-train');
  await tab('Тело'); await shot('05-body');
  await tab('Ещё'); await shot('06-more');
  await go('#/more/settings'); await shot('07-settings');
  await go('#/more/body?open=weigh', 1600); await shot('08-sheet');
  await p.locator('.sheet-bg').click({ position: { x: 20, y: 20 } }); await wait(500);
  await tab('Питание'); await p.locator('.fab').click(); await wait(1200); await shot('10-food-add');
  /* активная тренировка с таймером отдыха */
  await go('#/train');
  await p.getByRole('button', { name: 'Другая' }).click(); await wait(800);
  await p.locator('.sheet .lrow', { hasText: 'День A' }).click(); await wait(1200);
  const work1 = p.locator('.wk-ex').first().locator('.wk-set:not(.warm)').first();
  await work1.locator('input').nth(1).fill('10');
  await work1.locator('.wk-chk').click(); await wait(1200);
  await shot('11-workout');
}

const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await ctx.close();
await browser.close();
srv.close();
if (VIDEO) {
  const dir = OUT + 'tmp-video/';
  const f = readdirSync(dir).find((x) => x.endsWith('.webm'));
  if (f) renameSync(dir + f, OUT + 'demo-' + SC + '.webm');
}
console.log(JSON.stringify({ scheme: SC, mode: MODE, video: VIDEO, horizontalOverflow: overflow, errors: errs }, null, 1));
process.exit(errs.length || overflow ? 1 : 0);
