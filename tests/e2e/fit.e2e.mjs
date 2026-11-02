/* Надписи помещаются: обходит экраны на ширине 375 и 390 px и ищет
   - текст, который вылезает из своего блока или за край экрана;
   - текст, обрезанный многоточием (отдельно: это бывает задумано для длинных названий);
   - короткие подписи в кнопках, чипах и вкладках, переехавшие на вторую строку.
   Запуск: node tests/e2e/fit.e2e.mjs [light|dark]. Данные — выдуманная копия tests/fixtures. */
import { serve } from './serve.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch (e) { return import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}
const { chromium, devices } = await loadPlaywright();
const SC = process.argv[2] || 'light';
const BACKUP = process.env.BACKUP || new URL('../fixtures/backup-sample.json', import.meta.url).pathname;
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : ['/', '/food', '/food/add', '/food/days', '/food/library', '/food/new-food', '/food/nutrients', '/food/recipes', '/food/settings',
  '/train', '/train/gyms', '/train/history', '/train/levels', '/train/library', '/train/plans', '/train/plates', '/train/program/new', '/train/programs', '/train/settings',
  '/body', '/body/cycle', '/body/history', '/body/photos', '/body?open=weigh',
  '/more', '/more/about', '/more/backup', '/more/checkin-settings', '/more/expenditure', '/more/goal', '/more/history', '/more/micro', '/more/profile', '/more/settings', '/more/templates',
  '/checkin', '/onboarding'];
const WIDTHS = (process.env.WIDTHS || '375,390').split(',').map(Number);

const PORT = 8770 + (SC === 'dark' ? 1 : 0);
const srv = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: SC, locale: 'ru-RU', serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const wait = (ms) => p.waitForTimeout(ms);

await p.goto('http://localhost:' + PORT + '/');
await p.waitForSelector('.tabs');
const fc = p.waitForEvent('filechooser');
await p.getByRole('button', { name: 'Выбрать файл' }).click();
await (await fc).setFiles(BACKUP);
await p.waitForSelector('.modal .primary');
await p.click('.modal .primary');
await p.waitForLoadState('load'); await wait(1500);

function audit() {
  const out = [];
  const W = innerWidth;
  const name = (el) => {
    const c = (e) => e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : '');
    return (el.parentElement ? c(el.parentElement) + ' > ' : '') + c(el);
  };
  /* внутри горизонтальной ленты (чипы фильтра) уход за край — это прокрутка, не ошибка */
  const inScroller = (el) => { for (let e = el.parentElement; e; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll('#root *')) {
    if (el.closest('svg') || /^(INPUT|SELECT|TEXTAREA|IMG|VIDEO|OPTION|SCRIPT|STYLE)$/.test(el.tagName)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 70);
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push({ kind: cs.textOverflow === 'ellipsis' ? 'многоточие' : 'вылезает', el: name(el), text, by: el.scrollWidth - el.clientWidth });
      continue;
    }
    let lines = new Set();
    for (const n of own) {
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        if (!q.width) continue;
        lines.add(Math.round(q.top));
        if (q.right > W + 0.5 || q.left < -0.5) { if (!inScroller(el)) out.push({ kind: 'за экраном', el: name(el), text }); }
        else if (q.right > r.right + 1.5 || q.left < r.left - 1.5) out.push({ kind: 'вылезает', el: name(el), text, by: Math.round(Math.max(q.right - r.right, r.left - q.left)) });
      }
    }
    /* подзаголовки плиток и строк (.dt-s, .ls) переносятся по задумке; проверяются подписи элементов управления и названия строк */
    const ctl = el.closest('button, .chip, .pill, .tab, .lbadge, .status, .tstatus, .mealchip, .soon, .wk-mine, .dt-l, .lv, .hs, .ll');
    if (el.matches('.dt-s, .ls, .ls *, .dt-s *')) lines = new Set();
    if (ctl && lines.size > 1 && text.length <= 32) out.push({ kind: 'перенос', el: name(el), text });
    if (cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 2 && !/(auto|scroll)/.test(cs.overflowY)) out.push({ kind: 'обрезано снизу', el: name(el), text });
  }
  /* плавающее (position: fixed) внутри предка с размытием, transform или filter прилипает к предку, а не к экрану */
  for (const el of document.querySelectorAll('#root *')) {
    if (getComputedStyle(el).position !== 'fixed') continue;
    for (let a = el.parentElement; a && a.id !== 'root'; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.backdropFilter !== 'none' || s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none' || s.transform !== 'none' || s.filter !== 'none') {
        out.push({ kind: 'ловушка fixed', el: name(el) + ' в ' + name(a), text: '' }); break;
      }
    }
  }
  return out;
}

const found = new Map();
for (const w of WIDTHS) {
  await p.setViewportSize({ width: w, height: 760 });
  for (const route of ROUTES) {
    await p.goto('http://localhost:' + PORT + '/#' + route);
    await wait(900);
    /* длинные экраны — всё равно проверяется весь документ, прокрутка не нужна */
    for (const f of await p.evaluate(audit)) {
      const key = f.kind + '|' + f.el + '|' + f.text;
      if (!found.has(key)) found.set(key, { ...f, where: [] });
      found.get(key).where.push(w + ' ' + route);
    }
  }
}
await browser.close();
srv.close();
const list = [...found.values()];
const hard = list.filter((f) => f.kind !== 'многоточие');
for (const f of list) console.log(`[${f.kind}] ${f.text} — ${f.el}${f.by ? ' (+' + f.by + 'px)' : ''} — ${[...new Set(f.where)].slice(0, 3).join(', ')}${f.where.length > 3 ? ' …' : ''}`);
console.log(JSON.stringify({ scheme: SC, problems: hard.length, ellipsis: list.length - hard.length, errors: errs }));
process.exit(hard.length || errs.length ? 1 : 0);
