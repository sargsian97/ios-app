/* Проверка в браузере с профилем iPhone: оболочка, вкладки, профиль, настройки, импорт копии.
   Запуск: node tests/e2e/shell.e2e.mjs [light|dark]
   Переменные: BACKUP — свой файл копии (по умолчанию выдуманный tests/fixtures/backup-sample.json),
   OUT — папка для снимков экрана. */
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}

const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const BACKUP = process.env.BACKUP || new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PORT = 8765 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
function check(name, ok, info) { checks.push({ name, ok: !!ok, info }); }

await p.goto('http://localhost:' + PORT + '/');
await p.waitForSelector('.tabs');
await wait(500);
await shot('01-welcome');
check('первый запуск: карточка переноса данных', await p.locator('.welcome').count() > 0);

/* импорт копии */
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await shot('02-confirm', false);
await p.click('.modal .primary');
await p.waitForLoadState('load');
await wait(1500);
await p.waitForSelector('.dgrid');
await shot('03-dashboard');
check('после импорта карточки переноса нет', await p.locator('.welcome:has-text("Перенести")').count() === 0);
const meta = await p.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').get('meta/schema'); g.onsuccess = () => r(g.result && g.result.data); };
}));
check('схема данных обновлена', meta && meta.version >= 2, meta);

/* вкладки */
const tabs = [['Питание', '04-food', '.wrap h1'], ['Тренировка', '05-train', '.wrap h1'], ['Ещё', '06-more', '.list']];
for (const [name, file, sel] of tabs) {
  await p.locator('.tabs .tab', { hasText: name }).click();
  await p.waitForSelector(sel); await wait();
  await shot(file);
}
await p.locator('.tabs .tab', { hasText: 'Тренировка' }).click(); await wait();
check('Тренировка: экран журнала внутри оболочки', await p.locator('.legacy-host #app .card').count() > 0);

/* разделы «Ещё» */
const sub = [['Тело и замеры', '07-body'], ['История', '08-history'], ['Шаблоны тренировок', '09-templates'], ['Расход, нормы и ключ Claude', '10-journal-settings'], ['О приложении', '11-about']];
for (const [name, file] of sub) {
  await p.locator('.tabs .tab', { hasText: 'Ещё' }).click(); await wait(200);
  await p.locator('.lrow', { hasText: name }).first().click(); await wait();
  await shot(file);
  check('«Назад» есть: ' + name, await p.locator('.back').count() > 0);
  await p.locator('.back').first().click(); await wait(200);
  check('«Назад» вернул в «Ещё»: ' + name, (await p.evaluate(() => location.hash)) === '#/more');
}

/* профиль */
await p.locator('.lrow').first().click(); await wait();
await p.getByRole('radio', { name: 'Мужской' }).click();
await p.fill('input[type=date]', '1996-05-20');
await p.locator('input[type=date]').dispatchEvent('change');
await p.locator('input[inputmode=decimal]').fill('178');
await wait(500);
await shot('12-profile');
const prof = await p.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').get('profile/me'); g.onsuccess = () => r(g.result && g.result.data); };
}));
check('профиль сохранён', prof && prof.sex === 'male' && prof.birthDate === '1996-05-20' && prof.heightCm === 178, prof);

/* настройки: тема и единицы */
await p.goto('http://localhost:' + PORT + '/#/more/settings'); await wait(600);
await p.getByRole('radio', { name: 'Тёмная' }).click(); await wait(200);
check('тема тёмная применилась', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await p.getByRole('button', { name: 'Имперские' }).click(); await wait(300);
await shot('13-settings');
await p.locator('.tabs .tab', { hasText: 'Обзор' }).click(); await wait(400);
const dashText = await p.locator('.dgrid').innerText();
check('обзор в имперских единицах', /фунт/.test(dashText), dashText.replace(/\s+/g, ' ').slice(0, 120));
await shot('14-dashboard-imperial');
await p.goto('http://localhost:' + PORT + '/#/more/settings'); await wait(500);
await p.getByRole('button', { name: 'Метрические' }).click();
await p.getByRole('radio', { name: 'Авто' }).click(); await wait(200);
check('тема снова системная', (await p.evaluate(() => document.documentElement.dataset.theme)) === undefined);

/* «+» */
await p.locator('.tabs .tab.plus').click(); await wait(600);
await shot('15-plus', false);
await p.locator('.pbtn', { hasText: 'Еда' }).click(); await wait(600);
check('«+ → Еда» открывает поиск еды', await p.locator('.searchbox').count() > 0 && (await p.evaluate(() => location.hash)).startsWith('#/food/add'));
await shot('16-food-add', false);

/* после перезагрузки: офлайн-кэш и данные */
await p.reload(); await wait(1200);
const sw = await p.evaluate(() => (navigator.serviceWorker.controller ? 'controlled' : 'not controlled'));
check('service worker управляет страницей', sw === 'controlled', sw);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);

await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
