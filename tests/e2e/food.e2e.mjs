/* Проверка питания в браузере (профиль iPhone): перенос дневника журнала, таймлайн, добавление,
   тарелка, быстрое добавление, правка, копирование, отметки дня, свой продукт, рецепт, штрихкод.
   Запросы к Open Food Facts подменяются ответами из tests/fixtures.
   Запуск: node tests/e2e/food.e2e.mjs [light|dark]; снимки — в .e2e-shots/ (или OUT). */
import { serve } from './serve.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const BACKUP = new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const fx = (n) => readFileSync(new URL('../fixtures/' + n, import.meta.url), 'utf8');

const PORT = 8775 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU', timezoneId: 'Asia/Yerevan' });
await ctx.route('**/world.openfoodfacts.org/**', (route) => {
  const u = route.request().url();
  if (u.includes('/api/v2/product/4607001771562')) return route.fulfill({ contentType: 'application/json', body: fx('off-product.json') });
  if (u.includes('/api/v2/product/')) return route.fulfill({ contentType: 'application/json', body: '{"status":0}' });
  return route.fulfill({ contentType: 'application/json', body: fx('off-search.json') });
});
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-food-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
const check = (name, ok, info) => checks.push({ name, ok: !!ok, info });
const go = async (hash) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(600); };
const idb = (path) => p.evaluate((path) => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').get(path); g.onsuccess = () => r(g.result && g.result.data); };
}), path);
const idbList = (col) => p.evaluate((col) => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => r(g.result.filter((x) => x.col === col).map((x) => x.data)); };
}), col);

/* импорт копии журнала → миграция питания */
await go('');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load');
await wait(1500);
const meta = await idb('meta/schema');
check('схема 3 (питание перенесено)', meta && meta.version >= 3, meta);
check('записи дневника перенесены', (await idbList('foodEntries')).length === 2);

/* дневник за 14.10: приёмы пищи, шапка «осталось / съедено» */
await go('#/food?d=2026-10-14');
await p.waitForSelector('.meal');
await shot('01-meals');
const meals = await p.locator('.wrap').innerText();
check('приёмы пищи: овсянка в завтраке, грудка в обеде', /Завтрак[\s\S]*Овсянка[\s\S]*Обед[\s\S]*Куриная грудка/.test(meals), meals.replace(/\s+/g, ' ').slice(0, 200));
check('карточки всех четырёх приёмов', await p.locator('.meal .mh').count() === 4);
const banner = await p.locator('.fbanner').innerText();
check('итог дня 379 ккал в шапке', /379/.test(banner), banner.replace(/\s+/g, ' ').slice(0, 160));
await p.locator('.fbanner').click(); await wait(500);
check('«Разбор дня»: БЖУ и заметка', await p.locator('.sheet .mac').count() === 4 && await p.locator('.sheet textarea').count() === 1);
await shot('02-review', false);
await p.keyboard.press('Escape'); await wait(300);

/* «как в прошлый раз»: на 15.10 завтрак пуст — повторяем завтрак 14.10 */
await go('#/food?d=2026-10-15');
await p.locator('.meal', { hasText: 'Завтрак' }).locator('.madd', { hasText: 'Как в прошлый раз' }).click(); await wait(600);
check('«как в прошлый раз» скопировал завтрак', (await idbList('foodEntries')).some((e) => e.date === '2026-10-15' && e.name === 'Овсянка' && e.meal === 'b'));
await p.locator('.toast .small', { hasText: 'Отменить' }).click(); await wait(400);
check('«Отменить» убрал копию', !(await idbList('foodEntries')).some((e) => e.date === '2026-10-15' && e.name === 'Овсянка'));

/* добавление из приёма «Ужин»: поиск своего продукта, карточка «на 100 г → граммы → записать» */
await go('#/food?d=2026-10-14');
await p.locator('.meal', { hasText: 'Ужин' }).locator('.madd', { hasText: 'Добавить' }).click();
await p.waitForSelector('.searchbox input');
check('приём и время из строки приёма', (await p.locator('.mealchip select').inputValue()) === 'd' && (await p.locator('.timechip input').inputValue()) === '19:00');
await shot('03-add-empty', false);
await p.fill('.searchbox input', 'овся');
await wait(900);
await shot('03-search');
await p.locator('.results .lrow', { hasText: 'Овсянка' }).first().locator('.rbody').click(); await wait(500);
check('карточка: КБЖУ на 100 г', /на 100 г/.test(await p.locator('.sheet .per100').innerText()));
await p.locator('.sheet .stepper2 input').fill('50');
await wait(200);
const pc = await p.locator('.pcard').innerText();
check('карточка: 50 г овсянки = 178 ккал', /178/.test(pc), pc.replace(/\s+/g, ' '));
await shot('04-product', false);
await p.locator('.sheet button.primary', { hasText: 'Записать в Ужин' }).click();
await wait(700);
check('вернулись в дневник с записью в ужине', /Ужин[\s\S]*Овсянка/.test(await p.locator('.wrap').innerText()));
const dinner = (await idbList('foodEntries')).find((e) => e.date === '2026-10-14' && e.time === '19:00');
check('у записи приём «ужин»', dinner && dinner.meal === 'd' && dinner.amount === 50, dinner);

/* «+» на строке: запись прошлой порции сразу, тост с «Отменить» */
await go('#/food/add?d=2026-10-14&m=s&t=16:30');
await p.locator('.lrow', { hasText: 'Овсянка' }).first().locator('.radd').click(); await wait(500);
check('«+» записал овсянку прошлой порцией (50 г) в перекус', (await idbList('foodEntries')).some((e) => e.date === '2026-10-14' && e.time === '16:30' && e.meal === 's' && e.amount === 50));
check('тост «Записано в Перекус»', /Записано в Перекус/.test(await p.locator('.toast').innerText()));
await shot('04b-quick-toast', false);
await p.locator('.toast .small', { hasText: 'Отменить' }).click(); await wait(400);
check('«Отменить» убрал запись', !(await idbList('foodEntries')).some((e) => e.date === '2026-10-14' && e.time === '16:30'));

/* свайп влево — удалить с «Отменить» */
await go('#/food?d=2026-10-14');
const row = p.locator('.meal', { hasText: 'Ужин' }).locator('.swipe').first();
await row.evaluate((el) => el.scrollIntoView({ block: 'center' })); await wait(300);
const box = await row.boundingBox();
await p.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(box.x + box.width - 30 - i * 25, box.y + box.height / 2);
await p.mouse.up(); await wait(500);
check('свайп удалил запись ужина', !(await idbList('foodEntries')).some((e) => e.date === '2026-10-14' && e.time === '19:00'));
check('тост «Удалено»', /Удалено/.test(await p.locator('.toast').innerText()));
await p.locator('.toast .small', { hasText: 'Отменить' }).click(); await wait(400);
check('«Отменить» вернул запись', (await idbList('foodEntries')).some((e) => e.date === '2026-10-14' && e.time === '19:00'));

/* вид «по часам» включается в настройках дневника */
await go('#/food/settings');
await p.getByRole('radio', { name: 'По часам' }).click(); await wait(300);
await go('#/food?d=2026-10-14');
await p.waitForSelector('.tl');
await shot('02b-timeline');
const tl = await p.locator('.tl').innerText();
check('таймлайн: овсянка в 08:00, грудка в 13:00, овсянка в 19:00', /08:00[\s\S]*Овсянка[\s\S]*13:00[\s\S]*Куриная грудка[\s\S]*19:00[\s\S]*Овсянка/.test(tl), tl.slice(0, 200));
await go('#/food/settings');
await p.getByRole('radio', { name: 'Приёмы пищи' }).click(); await wait(300);

/* поиск в интернете (подменённый Open Food Facts) и тарелка */
await go('#/food/add?d=2026-10-14&t=19:30');
await p.fill('.searchbox input', 'молоко');
await wait(1500);
await shot('05-online');
check('выдача Open Food Facts', await p.locator('.results .lrow', { hasText: 'Молоко 3,2%' }).count() > 0);
await p.locator('.results .lrow', { hasText: 'Молоко 3,2%' }).click(); await wait(500);
check('у молока порция 200 мл', await p.locator('.chip', { hasText: '200 мл' }).count() > 0);
await p.getByRole('button', { name: 'В тарелку' }).click(); await wait(300);
await p.locator('.srcs button', { hasText: 'Быстро' }).click(); await wait(400);
await p.locator('.sheet input').nth(1).fill('250');
await p.getByRole('button', { name: 'В тарелку' }).click(); await wait(300);
check('в тарелке 2 продукта', (await p.locator('.platebar .pb-n').innerText()).trim() === '2');
await p.locator('.platebar').click(); await wait(400);
await shot('06-plate', false);
await p.getByRole('button', { name: 'Записать всё' }).click(); await wait(800);
const day14 = (await idbList('foodEntries')).filter((e) => e.date === '2026-10-14');
check('тарелка записана (5 записей за день)', day14.length === 5, day14.map((e) => e.name + ' ' + e.time));
check('у записей с тарелки приём по времени (19:30 — ужин)', day14.filter((e) => e.time === '19:30').every((e) => e.meal === 'd'));
check('молоко сохранилось в свои продукты (OFF)', (await idbList('foodItems')).some((f) => f.source === 'off' && f.name === 'Молоко 3,2%'));

/* правка записи: граммы → калории */
await go('#/food?d=2026-10-14');
await p.locator('.erow', { hasText: 'Овсянка' }).first().click(); await wait(500);
await p.locator('.sheet input[inputmode=decimal]').first().fill('100');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
const oat = (await idbList('foodEntries')).find((e) => e.date === '2026-10-14' && e.time === '08:00');
check('правка: 60 → 100 г овсянки, калории пропорционально (≈357)', oat && Math.abs(oat.nutrients.kcal - 356.67) < 0.1 && oat.amount === 100, oat && oat.nutrients);

/* выделение и копирование на следующий день */
await p.getByRole('button', { name: 'Выбрать' }).click(); await wait(200);
await p.locator('.erow', { hasText: 'Куриная грудка' }).click();
await shot('07-select', false);
await p.locator('.selbar button', { hasText: 'Копировать' }).click(); await wait(400);
await p.locator('.sheet button.primary', { hasText: 'Копировать' }).click(); await wait(600);
check('скопировано на 15.10', (await idbList('foodEntries')).some((e) => e.date === '2026-10-15' && e.name === 'Куриная грудка'));

/* отметки дня и ручной итог */
await p.locator('.fbanner').click(); await wait(500);
await p.locator('.sheet .dflags .chip', { hasText: 'Неполный день' }).click(); await wait(300);
check('отметка «неполный день»', (await idb('dayEntries/2026-10-14') || {}).partial === true);
check('отметка видна в шапке', /Неполный день/.test(await p.locator('.fbanner').innerText()));
await p.keyboard.press('Escape'); await wait(300);
await p.getByRole('button', { name: 'Действия' }).click(); await wait(400);
await p.locator('.sheet .lrow', { hasText: 'Ручной итог' }).click(); await wait(400);
await p.locator('.sheet input').first().fill('2100');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(400);
check('ручной итог 2100 в баннере', /2\s?100/.test(await p.locator('.fbanner').innerText()));
await shot('08-flags');

/* свой продукт на порцию */
await go('#/food/new-food');
await p.locator('input').first().fill('Тестовый батончик');
await p.getByRole('radio', { name: 'На порцию' }).click();
await p.locator('.fld', { hasText: 'Порция по этикетке' }).locator('input').fill('40');
await p.locator('.fld', { hasText: 'Калории' }).locator('input').fill('200');
await p.locator('.fld', { hasText: 'Белки, г' }).first().locator('input').fill('10');
await shot('09-editor');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
const bar = (await idbList('foodItems')).find((f) => f.name === 'Тестовый батончик');
check('свой продукт: 200 ккал на 40 г → 500 на 100 г, порция 40 г', bar && bar.nutrients.kcal === 500 && bar.servings[0].amount === 40, bar && bar.nutrients);

/* рецепт из двух продуктов */
await go('#/food/recipe/new');
await p.locator('input').first().fill('Каша с молоком');
await p.getByRole('button', { name: '+ Ингредиент' }).click(); await wait(400);
await p.fill('.sheet .searchbox input', 'овся'); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'Овсянка' }).first().click(); await wait(400);
await p.locator('.sheet .stepper2 input').fill('60');
await p.locator('.sheet button.primary', { hasText: 'Добавить' }).click(); await wait(400);
await p.getByRole('button', { name: '+ Ингредиент' }).click(); await wait(400);
await p.fill('.sheet .searchbox input', 'молоко'); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'Молоко' }).first().click(); await wait(400);
await p.locator('.sheet .chip', { hasText: 'мл' }).first().click();
await p.locator('.sheet .stepper2 input').fill('200');
await p.locator('.sheet button.primary', { hasText: 'Добавить' }).click(); await wait(400);
await shot('10-recipe');
const rt = await p.locator('.card', { hasText: 'Пищевая ценность' }).innerText();
check('рецепт: 60 г овсянки + 200 мл молока = 330 ккал', /330/.test(rt), rt.replace(/\s+/g, ' ').slice(0, 120));
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
check('рецепт сохранён', (await idbList('recipes')).some((r) => r.name === 'Каша с молоком' && r.ingredients.length === 2));

/* штрихкод: ручной ввод → Open Food Facts → карточка */
await go('#/food/add?d=2026-10-16&open=scan');
await wait(500);
await p.locator('.scanner input[inputmode=numeric]').fill('4607001771562');
await p.locator('.scanner button[type=submit]').click();
await wait(1200);
check('штрихкод: найден творог из OFF', /Творог 5%/.test(await p.locator('.sheet').innerText()));
await shot('11-barcode', false);
await p.keyboard.press('Escape'); await wait(300);
await p.locator('.srcs button', { hasText: 'Штрихкод' }).click(); await wait(400);
await p.locator('.scanner input[inputmode=numeric]').fill('5901234123457');
await p.locator('.scanner button[type=submit]').click(); await wait(1000);
check('штрихкод: неизвестный код предлагает создать продукт', await p.getByRole('button', { name: 'Создать продукт с этим кодом' }).count() === 1);

/* быстрое добавление с алкоголем, перебор не показывается */
await go('#/food/add?d=2026-10-16');
await p.reload(); await wait(1500);
await p.locator('.srcs button', { hasText: 'Быстро' }).click(); await wait(500);
const qi = p.locator('.sheet .grid2 input');
await qi.nth(4).fill('140');
check('быстро: ккал из алкоголя (7 ккал/г)', (await qi.nth(0).getAttribute('placeholder')).replace(/\s/g, '') === '980');
await p.locator('.sheet button.primary').click(); await wait(800);
check('запись с алкоголем', (await idbList('foodEntries')).some((e) => e.nutrients.alcohol === 140 && e.nutrients.kcal === 980));
await go('#/food?d=2026-10-16');
check('перебор по умолчанию не показывается', await p.locator('.fbanner .over, .fbanner .rover').count() === 0);
await shot('11b-no-overage');

/* история показывает еду выбранного дня */
await go('#/more/history?d=2026-10-16');
await wait(600);
const hist = await p.locator('.hist-day').innerText();
check('история показывает питание дня', /ккал/.test(hist) && !/еда не записана/.test(hist), hist.slice(0, 120));
await shot('12-history');

/* нутриенты: оценка полноты и строки по группам (день с записями из копии, а не «сегодня») */
await go('#/food/nutrients?d=2026-10-16');
check('нутриенты: есть оценка полноты', await p.locator('.nut-big b').count() === 1);
check('нутриенты: строки нутриентов', await p.locator('.nut-row').count() >= 4);
await p.locator('.nut-row').first().click();
await wait(200);
await shot('12b-nutrients');

/* библиотека и настройки ключей */
await go('#/food/library');
check('мои продукты: есть батончик', await p.locator('.lrow', { hasText: 'Тестовый батончик' }).count() === 1);
await go('#/more/settings');
check('настройки: ключи Claude и USDA', await p.locator('.card', { hasText: 'USDA FoodData Central' }).count() === 1 && await p.locator('.card', { hasText: 'Claude' }).count() >= 1);
await shot('13-keys');

const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);
await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
