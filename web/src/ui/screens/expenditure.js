/* Расход энергии: адаптивная оценка по весу и питанию, статус, график, средние за период, настройки. */
import { html, useApp, useData, useState, todayYmd } from '../core.js';
import { Page, Card, Segmented, Toggle, Field } from '../kit.js';
import { t, fmtNum, fmtSigned, fmtDate } from '../../i18n/index.js';
import { DateChart } from '../chart.js';
import { useExpenditure } from '../food/expenditure.js';
import { periodAverages } from '../../domain/expenditure.js';
import { addDays, TDEE_FIRST_UPDATE_DAY, TDEE_HOLD_NO_WEIGHIN_DAYS } from '../../domain/calc/index.js';

const STATUS = { initial: 'tdee.st.initial', ok: 'tdee.st.ok', hold: 'tdee.st.hold', fixed: 'tdee.st.fixed' };
const REASON = { no_weighin: 'tdee.r.no_weighin', few_intake_days: 'tdee.r.few_intake_days', short_window: 'tdee.r.short_window' };

export function Expenditure() {
  const { repos } = useApp();
  useData(['dietProfile']);
  const ex = useExpenditure();
  const dp = repos.dietProfile.get();
  const today = todayYmd();
  const [period, setPeriod] = useState(30);
  const [fixed, setFixed] = useState(null);

  const from = addDays(today, -(period - 1));
  const series = ex ? ex.series.filter((r) => r.date >= from) : [];
  const intake = ex ? ex.balance.filter((r) => r.date >= from) : [];
  const avg7 = ex ? periodAverages(ex.balance, { from: addDays(today, -7), to: addDays(today, -1) }) : null;
  const avgP = ex ? periodAverages(ex.balance, { from, to: today }) : null;
  const cur = ex && ex.current;

  return html`<${Page} title=${t('tdee.title')} icon="flame" color="linear-gradient(135deg,#FFB340,#FF9500)" back="/more" backLabel=${t('nav.more')}>
    ${!ex ? html`<div class="card pad welcome"><h2>${t('tdee.none.title')}</h2><p class="hint">${t('tdee.none.text')}</p></div>` : html`
    <div class="card pad whero">
      <div class="rl">${t('tdee.current')}</div>
      <div class="wh-v"><b>${fmtNum(cur.tdee)}</b><small>${t('unit.kcal')}</small></div>
      <div class=${'tstatus st-' + cur.status}>${t(STATUS[cur.status])}${cur.reason && REASON[cur.reason] ? ' · ' + t(REASON[cur.reason], { n: TDEE_HOLD_NO_WEIGHIN_DAYS }) : ''}</div>
      <div class="hint">${cur.status === 'initial' ? t('tdee.initialHint', { n: TDEE_FIRST_UPDATE_DAY }) : t('tdee.since', { d: fmtDate(ex.start, 'full'), s: fmtNum(ex.startTdee || cur.tdee) })}</div>
    </div>
    <div class="pills" style="margin:0 0 10px">${[[14, 'body.p.14'], [30, 'body.p.30'], [90, 'body.p.90']].map(([p, l]) => html`<button class=${'pill' + (period === p ? ' on' : '')} onClick=${() => setPeriod(p)}>${t(l)}</button>`)}</div>
    <div class="card pad">
      <${DateChart} series=${[
        { key: 'intake', label: t('tdee.intake'), kind: 'dots', color: 'var(--k-food)', points: intake.map((r) => ({ x: r.date, y: r.intake })) },
        { key: 'tdee', label: t('tdee.series'), kind: 'line', color: 'var(--k-burn)', points: series.map((r) => ({ x: r.date, y: Math.round(r.tdee) })) }
      ]} digits=${0} unit=${t('unit.kcal')} ariaLabel=${t('tdee.chartAria')} empty=${t('body.chartEmpty')}/>
    </div>
    <${Card} title=${t('tdee.balance')} icon="cal" color="var(--k-cal)">
      ${[[t('tdee.week'), avg7], [t('tdee.period'), avgP]].map(([label, a]) => html`<div class="ltitle" style="margin:6px 0 4px">${label}</div>
        ${a && a.days ? html`<div class="kv"><span>${t('tdee.avgIntake')}</span><span>${fmtNum(a.intake)} ${t('unit.kcal')}</span></div>
          <div class="kv"><span>${t('tdee.avgTdee')}</span><span>${fmtNum(a.tdee)} ${t('unit.kcal')}</span></div>
          <div class="kv tot"><span>${t('tdee.avgBalance')}</span><span>${fmtSigned(a.balance)} ${t('unit.kcal')}</span></div>
          <div class="hint" style="margin:-2px 0 6px">${t('tdee.daysCounted', { count: a.days })}</div>` : html`<div class="hint">${t('tdee.noDays')}</div>`}`)}
    <//>`}
    <${Card} title=${t('tdee.how')} icon="info" color="var(--k-plan)">
      <p class="about-p">${t('tdee.howText')}</p>
      <div class="hint">${t('tdee.howRules')}</div>
    <//>
    <${Card} title=${t('tdee.settings')} icon="gear" color="#8E8E93">
      <${Segmented} value=${dp.tdeeMode} onChange=${(v) => repos.dietProfile.update({ tdeeMode: v })} options=${[['adaptive', t('tdee.mode.adaptive')], ['fixed', t('tdee.mode.fixed')]]}/>
      ${dp.tdeeMode === 'fixed' ? html`<div style="margin-top:12px"><${Field} label=${t('tdee.fixedValue')}>
        <input inputmode="numeric" value=${fixed ?? (dp.fixedTdee || '')} onInput=${(e) => setFixed(e.currentTarget.value)} onBlur=${() => { if (fixed != null) { const n = Math.round(Number(fixed)); if (n >= 500 && n <= 10000) repos.dietProfile.update({ fixedTdee: n }); setFixed(null); } }}/><//></div>` : null}
      <div style="margin-top:14px"><${Toggle} on=${dp.stepsBoost} onChange=${(v) => repos.dietProfile.update({ stepsBoost: v })} label=${t('tdee.stepsBoost')} hint=${t('tdee.part2')}/></div>
      <div style="margin-top:12px"><${Toggle} on=${dp.goalChangeCorrection} onChange=${(v) => repos.dietProfile.update({ goalChangeCorrection: v })} label=${t('tdee.goalCorrection')} hint=${t('tdee.part2')}/></div>
    <//>
  <//>`;
}
