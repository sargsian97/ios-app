/* Расход энергии: адаптивная оценка по весу и питанию, статус, график, средние за период, настройки. */
import { html, useApp, useData, useState, todayYmd } from '../core.js';
import { Page, Card, Segmented, Toggle, Field } from '../kit.js';
import { t, fmtNum, fmtSigned, fmtDate } from '../../i18n/index.js';
import { DateChart } from '../chart.js';
import { useExpenditure } from '../food/expenditure.js';
import { periodAverages } from '../../domain/expenditure.js';
import { addDays, TDEE_FIRST_UPDATE_DAY, TDEE_HOLD_NO_WEIGHIN_DAYS, JOURNAL_DEFAULTS, journalWeightOn } from '../../domain/calc/index.js';
import { dayBudget } from '../food/budget.js';
import { NumIn } from '../train/inputs.js';

const STATUS = { initial: 'tdee.st.initial', ok: 'tdee.st.ok', hold: 'tdee.st.hold', fixed: 'tdee.st.fixed' };
const REASON = { no_weighin: 'tdee.r.no_weighin', few_intake_days: 'tdee.r.few_intake_days', short_window: 'tdee.r.short_window' };

export function Expenditure({ route }) {
  const app = useApp();
  const { repos } = app;
  useData(['dietProfile', 'expenditureSettings', 'scaleEntries', 'dayTargets']);
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
      ].concat(series.some((r) => r.status === 'hold') ? [{ key: 'hold', label: t('tdee.holdMark'), kind: 'squares', color: 'var(--muted)', points: series.filter((r) => r.status === 'hold').map((r) => ({ x: r.date, y: Math.round(r.tdee) })) }] : [])} digits=${0} unit=${t('unit.kcal')} ariaLabel=${t('tdee.chartAria')} empty=${t('body.chartEmpty')}/>
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
      <div style="margin-top:12px"><${Toggle} on=${dp.goalChangeCorrection} onChange=${(v) => repos.dietProfile.update({ goalChangeCorrection: v })} label=${t('tdee.goalCorrection')} hint=${t('tdee.goalCorrectionHint')}/></div>
      <div style="margin-top:12px"><${Toggle} on=${dp.athlete} onChange=${(v) => repos.dietProfile.update({ athlete: v })} label=${t('tdee.athlete')} hint=${t('tdee.athleteHint')}/></div>
      <div style="margin-top:14px"><${Segmented} label=${t('tdee.version')} value=${dp.tdeeVersion || 'v2'} onChange=${(v) => repos.dietProfile.update({ tdeeVersion: v, bmrVersion: v })} options=${[['v1', t('tdee.ver.v1')], ['v2', t('tdee.ver.v2')]]}/></div>
      <div style="margin-top:12px"><${Segmented} label=${t('tdee.trendVersion')} value=${dp.trendVersion || 'v3'} onChange=${(v) => repos.dietProfile.update({ trendVersion: v })} options=${[['v1', t('tdee.tver.v1')], ['v2', t('tdee.tver.v2')], ['v3', t('tdee.tver.v3')]]}/></div>
      <div class="hint">${t('tdee.versionHint')}</div>
    <//>
    <${JournalSettings} app=${app} today=${today} open=${route && route.query.s === 'journal'}/>
  <//>`;
}

/* Поля расчёта «по журналу» (expenditureSettings); пустое поле — значение по умолчанию */
const JK = 'tdee.journal.';
const JOURNAL_FIELDS = [['baseKcal', 'numeric', 0], ['trainKcal', 'numeric', 0], ['gymSteps', 'numeric', 0], ['kcalPer1000Steps', 'decimal', 1], ['corrPct', 'decimal', 1], ['offsetKcal', 'numeric', 0], ['proteinG', 'numeric', 0], ['fatG', 'numeric', 0], ['fiberG', 'numeric', 0], ['stepLenM', 'decimal', 2]];

export function JournalSettings({ app, today, open = false }) {
  const { repos } = app;
  const es = repos.expenditureSettings.get();
  const p = repos.profile.get();
  const weight = journalWeightOn(repos.scaleEntry.list(), today);
  const auto = { kcalPer1000Steps: fmtNum(JOURNAL_DEFAULTS.kcalPer1000StepsPerKg * weight, 1), stepLenM: fmtNum(JOURNAL_DEFAULTS.strideShare.walk * (p.heightCm || JOURNAL_DEFAULTS.height) / 100, 2) };
  const def = (k) => (auto[k] ? t('tdee.journal.auto', { v: auto[k] }) : String(JOURNAL_DEFAULTS[{ baseKcal: 'base', offsetKcal: 'offset', proteinG: 'protein', fatG: 'fat', fiberG: 'fiber' }[k] || k]));
  const active = dayBudget(app, today).source === 'journal';
  return html`<details class="card pad" open=${open}><summary class="h2i" style="--cc:var(--k-burn)"><span>${t('tdee.journal.title')}</span></summary>
    <p class="hint" style="margin:8px 0 10px">${t('tdee.journal.hint')} ${active ? t('tdee.journal.active') : t('tdee.journal.inactive')}</p>
    <div class="grid2">
      ${JOURNAL_FIELDS.map(([k, mode, digits]) => html`<label class="fld"><span class="lbl">${t(JK + k)}</span>
        <${NumIn} mode=${mode} digits=${digits} value=${es[k]} placeholder=${def(k)} label=${t(JK + k)} onCommit=${(v) => repos.expenditureSettings.update({ [k]: v })}/></label>`)}
    </div>
  </details>`;
}
