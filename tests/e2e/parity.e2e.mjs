/* Временная проверка (до удаления web/app.js): новый расчёт расхода «по журналу» совпадает со старым на 30 днях копии.
   Запуск: node tests/e2e/parity.e2e.mjs */
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
async function loadPlaywright() { try { return await import('playwright'); } catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); } }
const { chromium, devices } = await loadPlaywright();
const BACKUP = process.env.BACKUP || new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.e2e-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 8825;
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.addInitScript(() => { window.JOURNAL_DEBUG = true; });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto('http://localhost:' + PORT + '/');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load');
await p.waitForTimeout(2500);
const r = await p.evaluate(async () => {
  const legacy = await import('/app.js');
  const { dayBudget } = await import('/src/ui/food/budget.js');
  const ctx = window.__ctx;
  const dates = ctx.store.list('foodEntries').map((e) => e.date).concat(ctx.store.list('workoutLogs').map((w) => w.date)).sort();
  const last = dates[dates.length - 1];
  const out = [];
  const addDays = (ymd, k) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10); };
  /* до первой записи старый журнал всё ещё считает силовую по расписанию пн/ср/пт — такие дни не сравниваем */
  for (let i = 0; i < 30; i++) {
    const d = addDays(last, -i);
    if (d < dates[0]) break;
    const a = legacy.legacyBudget(d), b = dayBudget(ctx, d);
    out.push({ d, legacy: a && { goal: a.goal, burned: a.burned, train: a.train, stepK: a.stepK, cardioNet: a.cardioNet, lifted: a.lifted }, now: b.source === 'journal' ? { goal: b.journal.goal, burned: b.journal.burned, train: b.journal.train, stepK: b.journal.stepK, cardioNet: b.journal.cardioNet, lifted: b.journal.lifted } : { source: b.source } });
  }
  return out;
});
const bad = r.filter((x) => !x.legacy || x.now.source || Math.abs(x.legacy.goal - x.now.goal) > 0.5 || Math.abs(x.legacy.train - x.now.train) > 0.5 || Math.abs(x.legacy.stepK - x.now.stepK) > 0.5 || Math.abs(x.legacy.cardioNet - x.now.cardioNet) > 0.5);
await browser.close();
srv.close();
console.log(JSON.stringify({ days: r.length, mismatches: bad, sample: r.slice(0, 3), errs }, null, 1));
process.exit(bad.length || errs.length ? 1 : 0);
