/* История: календарь месяца с отметками (еда, тренировка, взвешивание), сводка выбранного дня со ссылками,
   средние за 7 дней и за месяц, «Удалить день». Заменяет экран истории старого журнала. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../core.js';
import { Page, Card, Confirm } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtSigned, fmtDate } from '../../i18n/index.js';
import { addDays, workoutsBetween, stepsOn } from '../../data/journal.js';
import { dayTotals } from '../../domain/nutrition.js';
import { workoutSummary, sortLogs } from '../../domain/workout.js';
import { dayBudget, journalWeekFor, journalBurnFor } from '../food/budget.js';
import { useCatalog, exName, wdShort, weightUnit, fmtWeight } from '../train/catalog.js';
import { useEnergy } from '../food/parts.js';
import { toDisplay } from '../../domain/units.js';

const COLS = ['foodEntries', 'dayEntries', 'workoutLogs', 'scaleEntries', 'stepsEntries', 'expenditureSettings', 'dayTargets', 'profile'];
const monthOf = (ymd) => ymd.slice(0, 7);
const pad = (n) => String(n).padStart(2, '0');

function shiftMonth(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
}

export function History({ route }) {
  const app = useApp();
  const { repos, store } = app;
  useData(COLS);
  const cat = useCatalog();
  const energy = useEnergy();
  const today = todayYmd();
  const [sel, setSel] = useState(route.query.d || today);
  const [month, setMonth] = useState(monthOf(route.query.d || today));
  const [ask, setAsk] = useState(false);
  const units = repos.profile.get().units;
  const toE = (kcal) => toDisplay('energy', kcal || 0, units);

  /* отметки месяца */
  const [y, m] = month.split('-').map(Number);
  const first = month + '-01', dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), last = month + '-' + pad(dim);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const foodDays = new Set(repos.foodEntry.dates().filter((d) => d >= first && d <= last));
  const trainDays = new Set(workoutsBetween(store, first, last).map((w) => w.date));
  const weighDays = new Set(repos.scaleEntry.between(first, last).map((s) => s.date));

  /* выбранный день */
  const entries = repos.foodEntry.byDate(sel);
  const totals = dayTotals(entries, repos.dayEntry.get(sel));
  const logs = sortLogs(workoutsBetween(store, sel, sel));
  const weigh = repos.scaleEntry.byDate(sel).slice(-1)[0] || null;
  const steps = stepsOn(store, sel);
  const budget = dayBudget(app, sel);
  const burn = journalBurnFor(app, sel);
  const week = journalWeekFor(app, sel);

  /* месяц: дни с едой, средние, баланс к расходу по журналу */
  let mn = 0, mEat = 0, mBurn = 0;
  for (let d = first; d <= last && d <= today; d = addDays(d, 1)) {
    if (!foodDays.has(d)) continue;
    mn++; mEat += dayTotals(repos.foodEntry.byDate(d), repos.dayEntry.get(d)).kcal || 0; mBurn += journalBurnFor(app, d).burned;
  }

  async function deleteDay() {
    setAsk(false);
    await store.batch(['foodEntries', 'workoutLogs', 'stepsEntries'].flatMap((col) => store.list(col).filter((d) => d.date === sel).map((d) => ({ op: 'remove', col, id: d.id }))));
  }
  const pick = (d) => { setSel(d); navigate('/more/history?d=' + d, { replace: true }); };

  return html`<${Page} title=${t('hist.title')} icon="cal" color="linear-gradient(135deg,#5BE7DA,#14B8A6)" back="/more" backLabel=${t('nav.more')}>
    <div class="card pad hist-cal">
      <div class="calh">
        <div class="calt">${fmtDate(first, 'month')}</div>
        <div class="calnav">
          <button class="small" onClick=${() => { setMonth(monthOf(today)); pick(today); }}>${t('hist.today')}</button>
          <button class="small icn" aria-label=${t('hist.prevMonth')} onClick=${() => setMonth(shiftMonth(month, -1))}><${Icon} name="left"/></button>
          <button class="small icn" aria-label=${t('hist.nextMonth')} onClick=${() => setMonth(shiftMonth(month, 1))}><${Icon} name="right"/></button>
        </div>
      </div>
      <div class="cal2">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<div class=${'cw' + (i > 4 ? ' we' : '')}>${wdShort(i)}</div>`)}
        ${Array.from({ length: offset }, () => html`<div></div>`)}
        ${Array.from({ length: dim }, (_, i) => {
          const d = month + '-' + pad(i + 1);
          return html`<button type="button" class=${'cell' + (d > today ? ' fut' : '') + (d === today ? ' tod' : '') + (d === sel ? ' sel' : '')} aria-pressed=${d === sel} onClick=${() => pick(d)}>
            <span class="cc"><span class="cn">${i + 1}</span></span>
            <span class="cdots">${foodDays.has(d) ? html`<i class="d-food"></i>` : null}${trainDays.has(d) ? html`<i class="d-train"></i>` : null}${weighDays.has(d) ? html`<i class="d-weight"></i>` : null}</span>
          </button>`;
        })}
      </div>
      <div class="legend"><span><i class="d-food"></i>${t('hist.legend.food')}</span><span><i class="d-train"></i>${t('hist.legend.train')}</span><span><i class="d-weight"></i>${t('hist.legend.weight')}</span></div>
    </div>

    <div class="card pad hist-day">
      <div class="rl">${fmtDate(sel, 'full')}</div>
      <div class="list" style="margin-top:8px">
        <button class="lrow" type="button" onClick=${() => navigate('/food?d=' + sel)}>
          <span class="lico" style="--cc:var(--k-food)"><${Icon} name="food"/></span>
          <span class="ltext"><span class="ll">${t('hist.food')}</span><span class="ls">${entries.length ? t('hist.foodV', { kcal: energy.fmt(totals.kcal), entries: t('food.days.entries', { count: entries.length }) }) : t('hist.noFood')}</span></span>
          <${Icon} name="right" cls="chev"/></button>
        ${logs.length ? logs.map((w) => { const sum = workoutSummary(w); return html`<button class="lrow" type="button" onClick=${() => navigate('/train/log/' + w.id)}>
          <span class="lico" style="--cc:var(--k-str)"><${Icon} name="train"/></span>
          <span class="ltext"><span class="ll">${w.name || (w.exercises[0] ? exName(w.exercises[0], cat.byId) : t('train.session.untitled'))}</span><span class="ls">${t('train.sum.sets', { count: sum.sets })}${sum.volumeKg ? ' · ' + fmtWeight(sum.volumeKg, units, 0) + ' ' + weightUnit(units) : ''}</span></span>
          <${Icon} name="right" cls="chev"/></button>`; }) : html`<button class="lrow" type="button" onClick=${() => navigate('/train?d=' + sel)}>
          <span class="lico" style="--cc:var(--k-str)"><${Icon} name="train"/></span>
          <span class="ltext"><span class="ll">${t('hist.train')}</span><span class="ls">${t('hist.noTrain')}</span></span>
          <${Icon} name="right" cls="chev"/></button>`}
        <button class="lrow" type="button" onClick=${() => navigate('/more/body/history')}>
          <span class="lico" style="--cc:var(--k-body)"><${Icon} name="scale"/></span>
          <span class="ltext"><span class="ll">${t('hist.weight')}</span></span>
          <span class="lv">${weigh ? fmtWeight(weigh.weightKg, units) + ' ' + weightUnit(units) : '—'}</span>
          <${Icon} name="right" cls="chev"/></button>
        <button class="lrow" type="button" onClick=${() => navigate('/more/body')}>
          <span class="lico" style="--cc:var(--k-steps)"><${Icon} name="steps"/></span>
          <span class="ltext"><span class="ll">${t('hist.steps')}</span></span>
          <span class="lv">${steps != null ? fmtNum(steps) : '—'}</span>
          <${Icon} name="right" cls="chev"/></button>
      </div>
      <div class="kv" style="margin-top:10px"><span>${t('hist.target')} · ${t(budget.source === 'program' ? 'hist.src.program' : 'hist.src.journal')}</span><span>${budget.kcal ? energy.fmt(budget.kcal) + ' ' + energy.unit : '—'}</span></div>
      <div class="kv"><span>${t('hist.burned')}</span><span>${energy.fmt(burn.burned)} ${energy.unit}</span></div>
      ${entries.length ? html`<div class="kv tot"><span>${t('hist.balance')}</span><span>${fmtSigned(toE(totals.kcal) - toE(burn.burned))} ${energy.unit}</span></div>` : null}
      <div class="hint" style="margin-top:8px">${t('hist.week')}: ${week.n ? t('hist.weekV', { e: energy.fmt(week.eat), b: energy.fmt(week.bur), w: week.w1 != null ? fmtWeight(week.w1, units) + (week.w0 != null ? ' (' + fmtSigned(week.w1 - week.w0, 1) + ')' : '') : '—' }) : t('hist.weekNone')}</div>
      ${entries.length || logs.length || steps != null ? html`<button class="danger" style="width:100%;margin-top:12px" onClick=${() => setAsk(true)}>${t('hist.delete')}</button>` : null}
    </div>

    <${Card} title=${t('hist.month')} icon="cal" color="var(--k-cal)">
      <div class="hint">${mn ? t('hist.monthV', { n: mn, e: energy.fmt(mEat / mn), b: energy.fmt(mBurn / mn), bal: fmtSigned(toE(mEat / mn) - toE(mBurn / mn)) }) : t('hist.monthNone')}</div>
    <//>
    ${ask ? html`<${Confirm} text=${t('hist.deleteAsk', { d: fmtDate(sel, 'long') })} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(false)} onYes=${deleteDay}/>` : null}
  <//>`;
}
