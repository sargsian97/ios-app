/* Дашборд: короткая сводка за сегодня. Полная настраиваемая версия — этап 11. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../core.js';
import { Page, Card } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../i18n/index.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { workoutsBetween, stepsOn, weekStart, addDays } from '../../data/legacy.js';
import { useWeight } from './body/body.js';
import { dayTotals } from '../../domain/nutrition.js';
import { ImportCard } from './backup.js';
import { CheckinBanner } from './checkin.js';
import { DateChart } from '../chart.js';
import { useExpenditure } from '../food/expenditure.js';
import { dayBudget } from '../food/budget.js';
import { forecastGoalDate } from '../../domain/calc/index.js';
import { Segmented } from '../kit.js';
import { wdShort } from '../train/catalog.js';

function Tile({ icon, color, label, value, unit, sub, href }) {
  return html`<button class="dtile" style=${'--cc:' + color} onClick=${() => navigate(href)}>
    <span class="dt-h"><span class="hci"><${Icon} name=${icon}/></span><span class="dt-l">${label}</span><${Icon} name="right" cls="chev"/></span>
    <span class="dt-v"><b>${value}</b>${unit ? html`<small>${unit}</small>` : null}</span>
    ${sub ? html`<span class="dt-s">${sub}</span>` : null}
  </button>`;
}

export function Dashboard() {
  const { store, repos } = useApp();
  useData(['foodEntries', 'dayEntries', 'scaleEntries', 'dietProfile', 'workoutLogs', 'stepsEntries', 'profile']);
  const today = todayYmd();
  const profile = repos.profile.get();
  const units = profile.units;
  const dayEntries = repos.foodEntry.byDate(today);
  const tot = dayTotals(dayEntries, repos.dayEntry.get(today));
  const food = { kcal: tot.kcal || 0, p: tot.protein || 0, f: tot.fat || 0, c: tot.carbs || 0, count: dayEntries.length };
  const wt = useWeight();
  const wkAgo = wt.trend.filter((r) => r.date <= addDays(today, -7)).pop();
  const w = wt.last ? { weight: wt.last.trend, date: wt.last.date, change: wkAgo ? wt.last.trend - wkAgo.trend : null } : null;
  const ws = weekStart(today);
  const trainings = workoutsBetween(store, ws, addDays(ws, 6)).length;
  const steps = stepsOn(store, today);
  const energy = toDisplay('energy', food.kcal, units);

  let wSub = null;
  if (w && w.change != null) {
    const ch = toDisplay('weight', w.change, units);
    wSub = t('dash.weight.change', { v: (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmtNum(Math.abs(ch), 1), u: t(unitKey('weight', units)) });
  } else if (w) wSub = fmtDate(w.date);

  return html`<${Page} title=${t('dash.title')} icon="home" color="linear-gradient(135deg,#5AB0FF,#0A84FF)">
    <div class="hsub dsub">${fmtDate(today, 'long')}</div>
    <${ImportCard}/>
    <${CheckinBanner}/>
    ${!profile.onboardedAt ? html`<${Card} cls="welcome" title=${t('dash.setup.title')} icon="target" color="var(--k-plan)">
      <div class="hint" style="margin:0 0 12px">${t('dash.setup.text')}</div>
      <button class="primary" style="width:100%" onClick=${() => navigate('/onboarding')}>${t('dash.setup.go')}</button>
    <//>` : null}
    <div class="dgrid">
      <${Tile} icon="food" color="var(--k-food)" label=${t('dash.food')} value=${fmtNum(energy)} unit=${t(unitKey('energy', units))}
        sub=${food.count ? t('dash.food.sub', { p: fmtNum(food.p), f: fmtNum(food.f), c: fmtNum(food.c) }) : t('dash.food.empty')} href="/food"/>
      <${Tile} icon="scale" color="var(--k-body)" label=${t('dash.weight')} value=${w ? fmtFix(toDisplay('weight', w.weight, units), 1) : '—'}
        unit=${w ? t(unitKey('weight', units)) : null} sub=${wSub || t('dash.weight.empty')} href="/more/body"/>
      <${Tile} icon="train" color="var(--k-str)" label=${t('dash.train')} value=${fmtNum(trainings)}
        sub=${t('dash.train.sub', { count: trainings })} href="/train"/>
      <${Tile} icon="steps" color="var(--k-steps)" label=${t('dash.steps')} value=${steps != null ? fmtNum(steps) : '—'}
        sub=${steps != null ? t('dash.steps.sub') : t('dash.steps.empty')} href="/more/body"/>
    </div>
    <${GoalEta} trend=${wt.trend} units=${units}/>
    <${NutritionWeek} today=${today}/>
    <${EnergyBalance} today=${today}/>
    <div class="hint dnote">${t('dash.note')}</div>
  <//>`;
}

/* Дата достижения цели по темпу тренда */
function GoalEta({ trend, units }) {
  const { repos } = useApp();
  useData(['goals']);
  const g = repos.goal.active();
  if (!g || g.type === 'maintain' || !g.targetWeightKg || !trend.length) return null;
  let f = null;
  try { f = forecastGoalDate(trend, g.targetWeightKg); } catch (e) { f = null; }
  const date = f && (f.date || (typeof f === 'string' ? f : null));
  return html`<button class="card pad eta" onClick=${() => navigate('/more/goal')}>
    <span class="rl">${t('dash.eta.title')}</span>
    <b>${date ? fmtDate(date, 'full') : '—'}</b>
    <span class="hint">${date ? t('dash.eta.sub', { w: fmtFix(toDisplay('weight', g.targetWeightKg, units), 1), u: t(unitKey('weight', units)) }) : t('dash.eta.none')}</span>
  </button>`;
}

const NW = [['kcal', 'dash.nw.kcal', 'var(--k-food)'], ['protein', 'dash.nw.protein', 'var(--m-p)'], ['fat', 'dash.nw.fat', 'var(--m-f)'], ['carbs', 'dash.nw.carbs', 'var(--m-c)']];
const HIT_SHARE = 0.95; /* столбик «закрашен», когда съедено не меньше 95 % цели дня */

/* Неделя: калории и БЖУ по дням против цели; столбик становится плотным, когда цель дня достигнута */
function NutritionWeek({ today }) {
  const app = useApp();
  const { repos, legacy } = app;
  const ws = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const rows = days.map((d) => ({ d, tot: d <= today ? dayTotals(repos.foodEntry.byDate(d), repos.dayEntry.get(d)) : null, b: dayBudget({ repos, legacy, date: d }) }));
  if (!rows.some((r) => r.tot && r.tot.kcal)) return null;
  return html`<${Card} title=${t('dash.nw.title')} icon="cal" color="var(--k-food)">
    ${NW.map(([k, label, color]) => {
      const vals = rows.map((r) => ({ v: r.tot ? r.tot[k] || 0 : 0, tg: r.b && r.b[k] ? r.b[k] : 0 }));
      const sum = vals.reduce((a, x) => a + x.v, 0), tsum = rows.filter((r) => r.d <= today).reduce((a, r, i) => a + vals[i].tg, 0);
      return html`<div class="nw-row" role="img" aria-label=${t(label) + ': ' + fmtNum(sum) + (tsum ? ' / ' + fmtNum(tsum) : '')}>
        <span>${t(label)}<small>${fmtNum(sum)}${tsum ? ' / ' + fmtNum(tsum) : ''}</small></span>
        <div class="nw-bars" style=${'--bc:' + color}>${vals.map((x) => html`<i class=${x.tg && x.v >= HIT_SHARE * x.tg ? 'hit' : ''} style=${'height:' + (x.tg ? Math.min(1, x.v / x.tg) * 100 : x.v ? 60 : 0) + '%'}></i>`)}</div>
      </div>`;
    })}
    <div class="nw-days"><span></span><div>${days.map((d, i) => html`<span>${d === today ? html`<b>${wdShort(i)}</b>` : wdShort(i)}</span>`)}</div></div>
  <//>`;
}

/* Энергобаланс за 30 дней: съеденное столбиками против цели (пунктир) или расхода (линия) */
function EnergyBalance({ today }) {
  const app = useApp();
  const { repos, legacy } = app;
  const ex = useExpenditure();
  const [mode, setMode] = useState('targets');
  const from = addDays(today, -29);
  const dates = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const intake = dates.map((d) => ({ x: d, y: dayTotals(repos.foodEntry.byDate(d), repos.dayEntry.get(d)).kcal || 0 })).filter((p) => p.y > 0);
  if (!intake.length) return null;
  const second = mode === 'targets'
    ? { key: 'target', label: t('dash.eb.target'), kind: 'dash', color: 'var(--k-plan)', points: dates.map((d) => ({ x: d, y: (dayBudget({ repos, legacy, date: d }) || {}).kcal })).filter((p) => p.y > 0) }
    : { key: 'tdee', label: t('dash.eb.tdee'), kind: 'line', color: 'var(--k-burn)', points: ex ? ex.series.filter((r) => r.date >= from).map((r) => ({ x: r.date, y: Math.round(r.tdee) })) : [] };
  const avg = Math.round(intake.reduce((a, p) => a + p.y, 0) / intake.length);
  const avg2 = second.points.length ? Math.round(second.points.reduce((a, p) => a + p.y, 0) / second.points.length) : null;
  return html`<${Card} title=${t('dash.eb.title')} icon="flame" color="var(--k-burn)">
    <${Segmented} value=${mode} onChange=${setMode} options=${[['targets', t('dash.eb.vsTarget')], ['tdee', t('dash.eb.vsTdee')]]}/>
    <${DateChart} series=${[{ key: 'intake', label: t('dash.eb.intake'), kind: 'bars', color: 'var(--k-food)', points: intake }, second]} digits=${0} unit=${t('unit.kcal')} ariaLabel=${t('dash.eb.aria')}/>
    <div class="hint">${t('dash.eb.avg', { a: fmtNum(avg), b: avg2 != null ? fmtNum(avg2) : '—', what: mode === 'targets' ? t('dash.eb.target') : t('dash.eb.tdee') })}</div>
  <//>`;
}
