/* Проверка раздела «Тело» в браузере (профиль iPhone): перенос взвешиваний и замеров журнала,
   тренд и график, взвешивание, замеры, цель и прогноз, процент жира, шаги, фото, цикл.
   Запуск: node tests/e2e/body.e2e.mjs [light|dark]; BACKUP — свой файл копии; снимки — в .e2e-shots/ (или OUT). */
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const BACKUP = process.env.BACKUP || new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PORT = 8785 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-body-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
const check = (name, ok, info) => checks.push({ name, ok: !!ok, info });
const go = async (hash) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(700); };
const idbList = (col) => p.evaluate((col) => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => r(g.result.filter((x) => x.col === col).map((x) => x.data)); };
}), col);

await go('');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load');
await wait(1500);
const scale = await idbList('scaleEntries');
check('взвешивания перенесены', scale.length > 0, scale.length);

/* профиль — для оценки жира */
await go('#/more/profile');
await p.getByRole('radio', { name: 'Мужской' }).click();
await p.fill('input[type=date]', '1996-05-20');
await p.locator('input[type=date]').dispatchEvent('change');
await p.locator('input[inputmode=decimal]').fill('178');
await wait(400);

await go('#/more/body');
await p.waitForSelector('.whero');
await shot('01-overview');
const hero = await p.locator('.whero').innerText();
check('вес по тренду показан', /\d+,\d/.test(hero), hero.replace(/\s+/g, ' ').slice(0, 120));
check('на графике тренд и точки', await p.locator('.chart polyline.ch-l').count() === 1 && await p.locator('.chart circle.ch-d').count() > 2);
check('легенда «Весы» и «Тренд»', /Весы[\s\S]*Тренд/.test(await p.locator('.legend-row').innerText()));

/* подсказка графика по наведению */
const box = await p.locator('.chart-box').boundingBox();
await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
await wait(200);
check('подсказка на графике', await p.locator('.ch-tip').count() === 1);
await shot('02-tooltip', false);

/* периоды */
await p.locator('.pills .pill', { hasText: 'Всё' }).click(); await wait(300);
await p.locator('.pills .pill', { hasText: '7 д' }).click(); await wait(300);

/* взвешивание */
await p.getByRole('button', { name: 'Взвеситься' }).click(); await wait(500);
await p.locator('.sheet .bigin').fill('79,4');
await p.locator('.sheet input[inputmode=decimal]').nth(1).fill('19,5');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
const s2 = await idbList('scaleEntries');
check('новое взвешивание сохранено', s2.some((x) => x.weightKg === 79.4 && x.bodyFatPct === 19.5));

/* замеры */
await p.getByRole('button', { name: '+ Замеры' }).click(); await wait(500);
await p.locator('.sheet .fld', { hasText: 'Талия' }).locator('input').fill('86');
await p.locator('.sheet .fld', { hasText: 'Шея' }).locator('input').fill('39');
await p.locator('.sheet .fld', { hasText: 'Бедро Л' }).locator('input').fill('61');
await shot('03-measures', false);
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
const be = await idbList('bodyEntries');
check('замеры сохранены', be.some((x) => x.measurements.waist === 86 && x.measurements.thighL === 61));
const fat = await p.locator('.card', { hasText: 'Процент жира' }).innerText();
check('оценка жира и талия/рост', /≈ \d/.test(fat) && /0,48/.test(fat), fat.replace(/\s+/g, ' ').slice(0, 200));

/* плитка → график замера */
await p.locator('.mtile', { hasText: 'Талия' }).click(); await wait(300);
check('график талии', /Талия/.test(await p.locator('.ch-title').innerText()));
await p.getByRole('button', { name: 'К весу' }).click(); await wait(200);

/* цель и прогноз */
await p.getByRole('button', { name: 'Задать цель по весу' }).click(); await wait(400);
await p.locator('.sheet .bigin').fill('75');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
check('цель сохранена', (await idbList('goals')).some((g) => g.targetWeightKg === 75 && g.status === 'active'));
check('прогноз или пояснение', await p.locator('.banner.forecast').count() === 1);
check('линия цели на графике', await p.locator('.ch-goal').count() === 1);

/* шаги → новая модель */
await p.locator('.card', { hasText: 'Шаги' }).locator('input').fill('11500');
await p.locator('.card', { hasText: 'Шаги' }).locator('input').blur();
await wait(500);
check('шаги записаны в stepsEntries', (await idbList('stepsEntries')).some((d) => d.steps === 11500));
await shot('04-after');

/* фото */
await go('#/more/body/photos');
await p.getByRole('button', { name: '+ Фото' }).click(); await wait(400);
const png = new URL('../../web/icons/icon-192.png', import.meta.url).pathname;
const fc2 = p.waitForEvent('filechooser');
await p.locator('.sheet button', { hasText: 'Галерея' }).click();
await (await fc2).setFiles(png);
await wait(1200);
check('фото сохранено', (await idbList('progressPhotos')).length === 1);
check('фото в галерее', await p.locator('.pcell img').count() === 1);
await shot('05-photos');

/* цикл (включаем показ для мужского профиля) */
await go('#/more/body/cycle');
await p.locator('.togrow .sw').click(); await wait(200);
await p.getByRole('button', { name: 'Месячные сегодня' }).click(); await wait(400);
check('отметка цикла', (await idbList('periodEntries')).length === 1);
await shot('06-cycle');

/* история и старый расход видят новый вес */
await go('#/more/body/history');
check('история: взвешивание 79,4', /79,4/.test(await p.locator('.wrap').innerText()));
/* расход журнала (запасная цель) считает шаги по весу из новой модели: ккал на 1000 шагов = 0,37 × вес */
const lb = await p.evaluate(async () => { const m = await import('/app.js'); const d = new Date(); return m.legacyBudget(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); });
check('расход журнала берёт вес и шаги из новой модели', lb && Math.abs(lb.k / 0.37 - 79.4) < 0.01 && lb.steps === 11500, lb && { k: lb.k, steps: lb.steps });

const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);
await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
