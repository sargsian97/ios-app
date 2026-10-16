/* Дашборд: короткая сводка за сегодня. Полная настраиваемая версия — этап 11. */
import { html, useApp, useData, navigate, todayYmd } from '../core.js';
import { Page, Card } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../i18n/index.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { workoutsBetween, stepsOn, weekStart, addDays } from '../../data/legacy.js';
import { useWeight } from './body/body.js';
import { dayTotals } from '../../domain/nutrition.js';
import { ImportCard } from './backup.js';
import { CheckinBanner } from './checkin.js';

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
    <div class="hint dnote">${t('dash.note')}</div>
  <//>`;
}
