/* Проверка тренировок в браузере (профиль iPhone): перенос журнала, тренировка по шаблону, таймер отдыха,
   выбор упражнения, RIR, завершение с итогами, история, справочник, своё упражнение, шаблоны, кардио, шаги.
   Запуск: node tests/e2e/train.e2e.mjs [light|dark]; снимки — в .e2e-shots/ (или OUT). */
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

const PORT = 8815 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => { errs.push('pageerror: ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); });
const shot = (name, full = true) => p.screenshot({ path: OUT + SC + '-tr-' + name + '.png', fullPage: full });
const wait = (ms = 350) => p.waitForTimeout(ms);
const checks = [];
const check = (name, ok, info) => checks.push({ name, ok: !!ok, info });
const go = async (hash) => { await p.goto('http://localhost:' + PORT + '/' + hash); await wait(900); };
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
await wait(1800);

/* перенос журнала */
const plans0 = await idbList('workoutPlans');
const logs0 = await idbList('workoutLogs');
check('шаблоны A/B/C перенесены', plans0.length === 3, plans0.map((x) => x.name));
check('тренировки журнала перенесены', logs0.length >= 1, logs0.length);
check('шаги перенесены', (await idbList('stepsEntries')).some((s) => s.steps === 8500));

/* вкладка */
await go('#/train');
check('вкладка: карточка «сегодня»', await p.locator('.wk-today').count() === 1);
check('вкладка: неделя и действия', await p.locator('.wk-actions .scbtn').count() === 8);
await shot('01-home');

/* тренировка по шаблону */
await p.getByRole('button', { name: 'Другая' }).click(); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'День A' }).click(); await wait(900);
check('открылась активная тренировка', (await p.evaluate(() => location.hash)) === '#/train/session');
const firstEx = p.locator('.wk-ex').first();
check('упражнение из шаблона', /Присед со штангой/.test(await firstEx.innerText()));
const warm = firstEx.locator('.wk-set.warm');
check('разминка добавлена автоматически', await warm.count() === 3, await warm.count());
const wph0 = await warm.evaluateAll((els) => els.map((e) => e.querySelector('input').getAttribute('placeholder')));
check('разминка без зала от рабочего веса умной прогрессии', wph0.length === 3, wph0);
console.log('разминка без зала:', wph0.join(' / '));
const work1 = firstEx.locator('.wk-set:not(.warm)').first();
const wIn = work1.locator('input').first();
check('вес из прошлого раза или шаблона — подсказкой', (await wIn.getAttribute('placeholder')) !== '', await wIn.getAttribute('placeholder'));
await work1.locator('input').nth(1).fill('10');
await work1.locator('.wk-chk').click(); await wait(500);
check('после подхода — таймер отдыха', await p.locator('.wk-rest').count() === 1);
let sess = (await idbList('workoutSessions'))[0];
check('подход записан с весом из подсказки', sess && sess.exercises[0].sets[3].done && sess.exercises[0].sets[3].reps === 10 && sess.exercises[0].sets[3].weight > 0, sess && sess.exercises[0].sets[3]);
await shot('02-session', false);
await p.locator('.wk-rest').getByRole('button', { name: 'Отдых на 15 секунд больше' }).click(); await wait(200);
sess = (await idbList('workoutSessions'))[0];
check('+15 с к отдыху', sess.rest && sess.rest.targetSec >= 165, sess.rest);
await p.locator('.wk-rest').getByRole('button', { name: 'Пропустить' }).click(); await wait(300);
check('отдых пропущен', await p.locator('.wk-rest').count() === 0);

/* RIR */
await work1.locator('.wk-rir').click(); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'Ещё 2 повтора' }).click(); await wait(300);
sess = (await idbList('workoutSessions'))[0];
check('RIR со шкалой', sess.exercises[0].sets[3].rir === 2);

/* добавить упражнение из справочника */
await p.locator('.wk-add').click(); await wait(600);
await p.locator('.sheet input[type=search]').fill('становая');
await wait(400);
const firstHit = await p.locator('.sheet .results .wk-exrow').first().innerText();
check('поиск по синониму «становая»', /тяга/i.test(firstHit), firstHit.split('\n')[0]);
await shot('03-picker', false);
await p.locator('.sheet .results .wk-exrow').first().click(); await wait(500);
check('упражнение добавлено', await p.locator('.wk-ex').count() === 2);
const ex2 = p.locator('.wk-ex').nth(1);
await ex2.locator('.wk-set').first().locator('input').nth(0).fill('100');
await ex2.locator('.wk-set').first().locator('input').nth(1).fill('5');
await ex2.locator('.wk-chk').first().click(); await wait(300);

/* тип подхода */
await ex2.locator('.wk-sn').nth(1).click(); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'До отказа' }).click(); await wait(200);
await p.locator('.sheet .sh-top button').click(); await wait(400);
sess = (await idbList('workoutSessions'))[0];
check('тип подхода «до отказа»', sess.exercises[1].sets[1].type === 'failure');
await shot('04-session-full');

/* завершение */
await p.getByRole('button', { name: 'Завершить' }).first().click(); await wait(400);
check('предупреждение о невыполненных', /Не все подходы/.test(await p.locator('.modal').innerText()));
await p.locator('.modal .primary').click(); await wait(900);
check('после завершения — итог', /#\/train\/log\/.+\?done=1/.test(await p.evaluate(() => location.hash)));
check('итог: «сохранена»', await p.locator('.wk-saved').count() === 1);
const logs1 = await idbList('workoutLogs');
const mine = logs1.find((w) => w.source === 'app');
check('тренировка записана только с выполненными подходами', mine && mine.exercises.length === 2 && mine.exercises[0].sets.length === 1 && mine.durationSec >= 0, mine && mine.exercises.map((e) => e.sets.length));
check('активной тренировки больше нет', (await idbList('workoutSessions')).length === 0);
await shot('05-log');

/* правка истории */
await p.getByRole('button', { name: 'Изменить' }).click(); await wait(300);
await p.locator('.wk-editset').first().locator('input').nth(1).fill('12');
await p.getByRole('button', { name: 'Готово' }).click(); await wait(400);
check('правка подхода в истории', (await idbList('workoutLogs')).find((w) => w.id === mine.id).exercises[0].sets[0].reps === 12);

await go('#/train/history');
check('история: все тренировки', await p.locator('.list .lrow').count() >= logs1.length, logs1.length);
await shot('06-history');

/* справочник и карточка */
await go('#/train/library');
await wait(600);
await p.locator('input[type=search]').fill('жим лежа');
await wait(400);
check('справочник: «жим лежа» (ё = е)', /Жим/.test(await p.locator('.results .lrow').first().innerText()));
await p.locator('.wk-filter .chip', { hasText: 'Грудь' }).first().click(); await wait(300);
await p.locator('.pill', { hasText: 'Из базы' }).click(); await wait(300);
await shot('07-library', false);
await p.locator('.results .lrow').first().click(); await wait(900);
check('карточка: карта мышц', await p.locator('.mm svg .mm-p').count() > 0);
await p.locator('.wk-guide summary').click(); await wait(700);
check('карточка: инструкция из открытой базы', await p.locator('.wk-guide li').count() > 0);
await shot('08-card');

/* своё упражнение */
await go('#/train/exercise-edit/new');
await p.locator('.fld input').first().fill('Тяга Т-грифа узким хватом');
await p.locator('.fld input').first().blur(); await wait(200);
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(700);
const exs = await idbList('exercises');
const own = exs.find((e) => e.name === 'Тяга Т-грифа узким хватом');
check('своё упражнение с мышцами по названию', own && own.source === 'user' && own.primaryMuscles.includes('upper_back'), own && own.primaryMuscles);

/* шаблоны */
await go('#/train/plans');
check('шаблоны: 3 из журнала', await p.locator('.list .lrow').count() === 3);
await p.locator('.list .lrow').first().click(); await wait(700);
await p.locator('.wk-add').click(); await wait(500);
await p.locator('.sheet input[type=search]').fill('Т-грифа');
await wait(300);
await p.locator('.sheet .results .wk-exrow').first().click(); await wait(300);
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(600);
const planA = (await idbList('workoutPlans')).find((x) => x.legacyKey === 'A');
check('шаблон: упражнение добавлено', planA.sections[0].items.length === 2 && planA.sections[0].items[1].exerciseId === own.id);

/* кардио */
await go('#/train');
await p.getByRole('button', { name: 'Кардио' }).click(); await wait(500);
const cin = p.locator('.sheet .grid2 input');
await cin.nth(0).fill('30'); await cin.nth(1).fill('3,5');
await shot('09-cardio', false);
await p.locator('.sheet').getByRole('button', { name: 'Сохранить' }).click(); await wait(500);
const cardio = (await idbList('workoutLogs')).find((w) => w.exercises.some((e) => e.cardio && e.sets[0].distanceM === 3500));
check('кардио записано', cardio && cardio.exercises[0].sets[0].timeSec === 1800);

/* журнал видит тренировки и кардио */
const budget = await p.evaluate(async () => { const m = await import('/app.js'); const d = new Date(); const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return m.legacyBudget(ymd); });
check('расход журнала учитывает кардио и силовую', budget && budget.cardioOn && budget.lifted, budget && { cardioOn: budget.cardioOn, lifted: budget.lifted, train: budget.train });
await go('#/more/history');
check('история журнала открывается', await p.locator('#app').count() === 1);

/* шаги */
await go('#/more/body');
const steps = p.getByLabel('Сегодня');
if (await steps.count()) { await steps.first().fill('12345'); await steps.first().blur(); await wait(400); }
check('шаги пишутся в новую модель', (await idbList('stepsEntries')).some((s) => s.steps === 12345));

/* настройки */
await go('#/train/settings');
check('настройки тренировок', await p.locator('.wk-restrow').count() === 5);
await shot('10-settings');

/* залы: гаражный шаблон */
await go('#/train/gyms');
await p.locator('.wk-add').click(); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'Гаражный зал' }).click(); await wait(900);
check('редактор зала: блины из шаблона', await p.locator('.gy-row').count() === 6);
await p.locator('.fld input').first().fill('Мой гараж');
await p.getByRole('button', { name: 'Сохранить' }).click(); await wait(600);
const gyms = await idbList('gyms');
const wp = (await idbList('workoutProfile'))[0];
check('зал сохранён и стал залом по умолчанию', gyms.length === 1 && gyms[0].name === 'Мой гараж' && wp && wp.defaultGymId === gyms[0].id, { gyms: gyms.map((g) => g.name), def: wp && wp.defaultGymId });
await go('#/train/gym/' + gyms[0].id);
await shot('12-gym');

/* калькулятор блинов */
await go('#/train/plates?w=102.5');
const res = await p.locator('.pc-res').innerText();
check('калькулятор: 102,5 = гриф + 20 · 15 · 5 · 1,25 на сторону', /20 · 15 · 5 · 1,25/.test(res), res);
check('превью грифа: блины с двух сторон', await p.locator('.bp .bp-plate').count() === 8);
await p.locator('.pc-target input').fill('101'); await wait(300);
check('калькулятор: точно не собрать — ближайшие веса', /100.*102,5/.test(await p.locator('.banner.warnb').innerText()));
await shot('13-plates');

/* разминка по залу и раскладка блинов в подходе */
await go('#/train');
await p.getByRole('button', { name: 'Другая' }).click(); await wait(500);
await p.locator('.sheet .lrow', { hasText: 'День A' }).click(); await wait(900);
const ex1 = p.locator('.wk-ex').first();
const wph = await ex1.locator('.wk-set.warm').evaluateAll((els) => els.map((e) => e.querySelector('input').getAttribute('placeholder')));
check('разминка по блинам зала (упрощённо, шаг 10 кг) к 62,5 кг', wph.join('|') === '20|30|50', wph);
check('зал в заголовке тренировки', /Мой гараж/.test(await p.locator('.wk-sub').innerText()));
await ex1.locator('.wk-set:not(.warm) .wk-sn').first().click(); await wait(500);
check('в подходе — раскладка блинов', await p.locator('.sheet .bp .bp-plate').count() > 0);
await shot('14-set-plates', false);
await p.locator('.sheet .sh-top button').click(); await wait(300);
await p.locator('.wk-ex').first().locator('[aria-label="Действия с упражнением"]').click(); await wait(400);
await p.locator('.sheet .lrow', { hasText: 'Заменить упражнение' }).click(); await wait(700);
check('замена: похожие упражнения и фильтр зала', await p.locator('.sheet .ltitle', { hasText: 'Похожие' }).count() === 1 && await p.locator('.sheet .wk-onlygym').count() === 1);
await shot('15-replace', false);
await p.locator('.sheet .sh-top button').click(); await wait(300);

const cur = (await idbList('workoutSessions')).find((x) => x.id === 'current');
const tg = cur ? cur.exercises.map((e) => e.sets.filter((x) => x.type !== 'warmup').map((x) => x.target && (x.target.weight + '×' + x.target.reps + ':' + x.target.reason))) : null;
console.log('цели прогрессии:', JSON.stringify(tg));

/* уровни */
await go('#/train/levels');
check('уровни: карта и 20 мышц', await p.locator('.mm-lv svg').count() === 1 && await p.locator('.lv-row').count() === 20);
await p.locator('.lv-row').first().click(); await wait(300);
check('уровни: вклад упражнений', await p.locator('.lv-row[aria-expanded="true"] .nut-top span').count() >= 1);
await shot('16-levels');

/* программа: мастер → этапы → предпросмотр → сохранение */
await go('#/train/programs');
check('программы: пусто, есть кнопка', await p.locator('.prog-empty').count() === 1);
await p.locator('.prog-empty button').click(); await wait(600);
await p.locator('.segw', { hasText: 'Дней в неделю' }).getByRole('radio', { name: '4' }).click(); await wait(200);
check('мастер: сплиты под 4 дня', await p.locator('.prog-splits .lrow').count() === 4, await p.locator('.prog-splits .lrow').count());
await p.locator('.prog-focus .chip', { hasText: 'Бицепс' }).click();
await shot('17-gen-form');
await p.getByRole('button', { name: 'Собрать программу' }).click(); await wait(300);
check('этапы сборки', await p.locator('.prog-stage').count() === 6);
await wait(1800);
check('предпросмотр: 4 дня', await p.locator('.prog-day').count() === 4, await p.locator('.prog-day').count());
await shot('18-gen-preview');
await p.getByRole('button', { name: 'Сохранить и начать' }).click(); await wait(800);
const progs = await idbList('workoutPrograms');
const pplans = (await idbList('workoutPlans')).filter((x) => x.programId && progs[0] && x.programId === progs[0].id);
check('программа сохранена: активна, 4 шаблона по дням', progs.length === 1 && progs[0].status === 'active' && progs[0].split === 'upper_lower' && pplans.length === 4 && pplans.every((x) => x.weekday != null), { n: progs.length, plans: pplans.length });
check('экран программы: неделя и 7 дней', await p.locator('.prog-weeks i').count() === 5 && await p.locator('.prog-days .lrow').count() === 7);
await shot('19-program');
await go('#/train/session');
await p.locator('.wk-head [aria-label="Тренировка"]').click(); await wait(400);
await p.locator('.sheet button.danger', { hasText: 'Отменить тренировку' }).click(); await wait(300);
await p.locator('.modal .danger').click(); await wait(900);
const todayTxt = await p.locator('.wk-today').innerText();
check('вкладка: тренировка из программы с неделей', await p.locator('.wk-progline').count() === 1 && /Неделя 1 из 5/.test(todayTxt), todayTxt);
await shot('20-home-program');


await go('#/train');
await shot('11-home-after');
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('нет горизонтальной прокрутки', !overflow);
check('нет ошибок в консоли', errs.length === 0, errs);
await browser.close();
srv.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ scheme: SC, passed: checks.length - failed.length, failed }, null, 1));
process.exit(failed.length ? 1 : 0);
