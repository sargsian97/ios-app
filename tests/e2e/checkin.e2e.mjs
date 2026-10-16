/* Проверка адаптивного расхода и еженедельного чек-ина в браузере (профиль iPhone).
   Данные — сгенерированная копия (формат 2): 3 недели питания и взвешиваний, программа, неполный день, пропуск.
   Запуск: node tests/e2e/checkin.e2e.mjs [light|dark]; снимки — в .e2e-shots/ (или OUT). */
import { serve } from './serve.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/* ---------- данные относительно сегодняшнего дня ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d); };
const today = day(0);
const now = new Date().toISOString();
const data = {
  meta: { schema: { version: 4 } },
  profile: { me: { id: 'me', sex: 'male', birthDate: '1990-03-10', heightCm: 180, units: { weight: 'kg', length: 'cm', energy: 'kcal', distance: 'km', clock: '24h' }, theme: 'system', lang: 'ru', consents: { medical: now }, onboardedAt: now, createdAt: now, updatedAt: now } },
  dietProfile: { me: { id: 'me', activity: 'moderate', checkInWeekday: (new Date().getDay() + 6) % 7, createdAt: now, updatedAt: now } },
  goals: { g1: { id: 'g1', type: 'lose', startWeightKg: 88, targetWeightKg: 80, ratePctPerWeek: 0.5, startDate: day(-21), status: 'active', forecast: 'data', createdAt: now, updatedAt: now } },
  macroPrograms: { p1: { id: 'p1', style: 'coached', dietType: 'balanced', proteinLevel: 'high', distribution: 'even', highDays: [], floor: 'standard', carbsAsRemainder: true, limits: {}, startDate: day(-14), active: true, createdAt: now, updatedAt: now } },
  dayTargets: {}, foodEntries: {}, scaleEntries: {}
};
for (let wd = 0; wd < 7; wd++) data.dayTargets[day(-14) + '_' + wd] = { id: day(-14) + '_' + wd, programId: 'p1', validFrom: day(-14), weekday: wd, kcal: 2300, protein: 176, fat: 70, carbs: 240, createdAt: now, updatedAt: now };
for (let k = -21; k <= -1; k++) {
  const d = day(k);
  data.scaleEntries['s' + k] = { id: 's' + k, date: d, time: '08:00', weightKg: Math.round((88 + k * -0.09 * -1 + k * 0.0) * 100) / 100, source: 'manual', createdAt: now, updatedAt: now };
  if (k === -3) continue; /* пропуск */
  const kcal = k === -5 ? 500 : 2300; /* неполный день */
  data.foodEntries['f' + k] = { id: 'f' + k, date: d, time: '13:00', ref: { kind: 'quick', id: null }, name: 'Еда', nutrients: { kcal, protein: 150, fat: 70, carbs: 230 }, createdAt: now, updatedAt: now };
}
/* вес падает на ~0,09 кг/день при 2300 ккал — расход по данным должен выйти выше 2300 */
Object.values(data.scaleEntries).forEach((s, i) => { s.weightKg = Math.round((88 - 0.09 * i) * 100) / 100; });
const file = OUT + 'checkin-backup.json';
writeFileSync(file, JSON.stringify({ app: 'journal', format: 2, schema: 4, exportedAt: now, data }));

const PORT = 8805 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => { errs.push('pageerror: ' + e.message); console.log('PAGEERROR', e.message); });
const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-ci-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
const check = (name, ok, info) => checks.push({ name, ok: !!ok, info });
const go = async (hash) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(800); };
const idbList = (col) => p.evaluate((col) => new Promise((r) => {
  const q = indexedDB.open('journal');
  q.onsuccess = () => { const g = q.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => r(g.result.filter((x) => x.col === col).map((x) => x.data)); };
}), col);

await go('');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(file);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load');
await wait(1800);

check('баннер чек-ина на обзоре', await p.locator('.cibanner').count() === 1);
await shot('01-dashboard', false);

/* расход */
await go('#/more/expenditure');
const hero = await p.locator('.whero').innerText();
check('расход по данным', /Оценка по данным/.test(hero), hero.replace(/\s+/g, ' ').slice(0, 120));
const tdee = Number((hero.match(/(\d[\d\s]*)\s*ккал/) || [])[1].replace(/\s/g, ''));
check('расход выше 2300 при снижении веса', tdee > 2300, tdee);
check('график: точки еды и линия расхода', await p.locator('.chart polyline.ch-l').count() === 1 && await p.locator('.chart circle.ch-d').count() > 5);
await shot('02-expenditure');

/* снимок расхода за сегодня */
await wait(1800);
check('снимок расхода за сегодня сохранён', (await idbList('tdee')).some((x) => x.date === today && x.status === 'ok'));

/* чек-ин */
await go('#/checkin');
check('на чек-ине нет нижней панели', await p.locator('.tabs').count() === 0);
check('введение', /Как работает чек-ин/.test(await p.locator('h1').innerText()));
await p.locator('.obnext').click(); await wait(300);
check('взвешивание', /Вес за неделю/.test(await p.locator('h1').innerText()));
await shot('03-weigh', false);
await p.locator('.obnext').click(); await wait(300);
check('неполные дни: найден день с 500 ккал', /неполные/.test(await p.locator('h1').innerText()) && /500/.test(await p.locator('.list').innerText()));
await shot('04-partial', false);
await p.locator('.obnext').click(); await wait(400);
check('дни без записей', /Дни без записей/.test(await p.locator('h1').innerText()));
await p.locator('.list .sw').first().click(); await wait(200);
await p.locator('.obnext').click(); await wait(400);
check('обновление программы с таблицей', /Новая неделя/.test(await p.locator('h1').innerText()) && await p.locator('.ttab tbody tr').count() === 7);
await shot('05-program');
await p.locator('.obnext').click(); await wait(800);

const cis = await idbList('checkIns');
const des = await idbList('dayEntries');
const dts = await idbList('dayTargets');
check('чек-ин записан', cis.length === 1, cis);
check('неполный день отмечен', des.some((d) => d.id === day(-5) && d.partial));
check('голодание отмечено', des.some((d) => d.id === day(-3) && d.fasting));
check('новые цели с сегодняшнего дня', dts.filter((d) => d.validFrom === today).length === 7);
check('введение больше не покажется', (await idbList('checkInModules')).some((m) => m.id === 'intro' && m.seen));
check('после чек-ина — экран цели', (await p.evaluate(() => location.hash)) === '#/more/goal');
await go('');
check('баннер чек-ина исчез', await p.locator('.cibanner').count() === 0);

await go('#/more/checkin-settings');
check('настройки чек-ина: история', /расход/.test(await p.locator('.wrap').innerText()));
await shot('06-settings');

const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);
await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
