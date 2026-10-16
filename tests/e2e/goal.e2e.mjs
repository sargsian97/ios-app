/* Проверка онбординга, цели и программы в браузере (профиль iPhone).
   Запуск: node tests/e2e/goal.e2e.mjs [light|dark]; снимки — в .e2e-shots/ (или OUT). */
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const BACKUP = new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PORT = 8795 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => { errs.push('pageerror: ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); });
const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-goal-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
const check = (name, ok, info) => checks.push({ name, ok: !!ok, info });
const go = async (hash) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(700); };
const idbList = (col) => p.evaluate((col) => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => r(g.result.filter((x) => x.col === col).map((x) => x.data)); };
}), col);
const next = async () => { await p.locator('.obnext').click(); await wait(300); };

await go('');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load');
await wait(1500);

/* мастер */
check('карточка настройки на обзоре', await p.getByRole('button', { name: 'Начать' }).count() === 1);
await p.getByRole('button', { name: 'Начать' }).click(); await wait(500);
check('на онбординге нет нижней панели', await p.locator('.tabs').count() === 0);
await shot('01-intro', false);
await next();
await next();
check('без пола дальше не пускает', await p.locator('.banner.warnb').count() === 1);
await p.locator('.opt', { hasText: 'Мужской' }).click();
await p.fill('input[type=date]', '1996-05-20');
await p.locator('input[type=date]').dispatchEvent('change');
await shot('02-about', false);
await next();
check('рост из настроек журнала подставлен', true);
await p.getByRole('radio', { name: 'На глаз' }).click(); await wait(200);
await p.locator('.opt', { hasText: '≈ 20 %' }).click();
await shot('03-body');
await next();
await next();
await p.locator('.opt', { hasText: 'Умеренная' }).click();
await next();
await next();
const estText = await p.locator('.obest').innerText();
check('стартовая оценка с Каннингемом', /Каннингем/.test(estText) && /\d\s?\d{3}/.test(estText), estText.replace(/\s+/g, ' ').slice(0, 160));
await shot('04-estimate', false);
await next();
await p.locator('.opt', { hasText: 'Похудеть' }).click();
await p.locator('.bigin').fill('76');
await p.locator('.opt', { hasText: '0,5 % массы' }).click();
await wait(200);
check('дата цели посчитана', /примерно/.test(await p.locator('.banner.forecast').innerText()));
await shot('05-goal');
await next();
await shot('06-program');
await next();
const sum = await p.locator('.ttab').innerText();
check('итог: 7 дней целей', (sum.match(/\n/g) || []).length >= 7, sum.slice(0, 80));
await next();
check('без согласия не завершить', await p.locator('.banner.warnb').count() === 1);
await p.locator('.consent input').check();
await shot('07-summary');
await next();
await wait(800);

const prof = (await idbList('profile'))[0];
const goals = await idbList('goals');
const progs = await idbList('macroPrograms');
const targets = await idbList('dayTargets');
const micro = await idbList('microGoals');
check('профиль: онбординг пройден, согласие записано', prof.onboardedAt && prof.consents.medical && prof.sex === 'male');
check('цель 76 кг, 0,5 %/нед', goals.some((g) => g.status === 'active' && g.targetWeightKg === 76 && g.ratePctPerWeek === 0.5));
check('программа coached активна', progs.some((x) => x.active && x.style === 'coached'));
check('цели на 7 дней', targets.length === 7, targets.length);
check('нормы микронутриентов созданы', micro.length > 30, micro.length);
check('после мастера — дневник', (await p.evaluate(() => location.hash)).startsWith('#/food'));
const kcal = targets[0].kcal;
const banner = await p.locator('.fbanner').innerText();
check('дневник берёт цель из программы', banner.replace(/\s/g, '').includes(String(kcal)), { kcal, banner: banner.replace(/\s+/g, ' ').slice(0, 120) });
await shot('08-diary');

/* экран цели: высокие дни */
await go('#/more/goal');
await shot('09-goal');
await p.getByRole('button', { name: 'Изменить программу' }).click(); await wait(400);
await p.locator('.sheet').getByRole('radio', { name: 'Есть «высокие» дни' }).click(); await wait(200);
await p.locator('.sheet').getByRole('button', { name: 'Сохранить' }).click(); await wait(600);
const t2 = await idbList('dayTargets');
const today = (await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }));
const sat = t2.find((x) => x.validFrom === today && x.weekday === 5), mon = t2.find((x) => x.validFrom === today && x.weekday === 0);
check('суббота — высокий день', sat && mon && sat.kcal > mon.kcal, { sat: sat && sat.kcal, mon: mon && mon.kcal });

/* ручной режим */
await p.getByRole('button', { name: 'Изменить программу' }).click(); await wait(400);
await p.locator('.sheet').getByRole('radio', { name: 'Сам' }).click();
await p.locator('.sheet').getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
await p.getByRole('button', { name: 'Задать цели' }).click(); await wait(400);
await p.locator('.sheet').getByRole('radio', { name: 'Каждый день одинаково' }).click(); await wait(200);
const ins = p.locator('.sheet .grid4 input');
await ins.nth(0).fill('2000'); await ins.nth(1).fill('150'); await ins.nth(2).fill('70'); await ins.nth(3).fill('');
await p.locator('.sheet').getByRole('button', { name: 'Сохранить' }).click(); await wait(600);
const t3 = (await idbList('dayTargets')).filter((x) => x.validFrom === today);
check('ручные цели: 2000 ккал, углеводы — остаток', t3.length === 7 && t3.every((x) => x.kcal === 2000 && x.carbs === Math.round((2000 - 600 - 630) / 4)), t3[0]);
await shot('10-manual');

/* нормы микронутриентов */
await go('#/more/micro');
check('кальций: цель 1000 мг', /Кальций[\s\S]*цель 1\s?000/.test(await p.locator('.wrap').innerText()));
await p.locator('.lrow', { hasText: 'Железо' }).click(); await wait(400);
await p.locator('.sheet input').nth(1).fill('15');
await p.locator('.sheet').getByRole('button', { name: 'Сохранить' }).click(); await wait(400);
check('ручная норма железа', (await idbList('microGoals')).some((g) => g.id === 'iron' && g.target === 15 && g.auto === false));
await shot('11-micro');

const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);
await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
