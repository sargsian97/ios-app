/* Тело: тренд веса с графиком и прогнозом цели, замеры, процент жира и отношения, шаги, фото, цикл. */
import { html, useApp, useData, useLegacy, useState, navigate, todayYmd } from '../../core.js';
import { Page, Card } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../../i18n/index.js';
import { DateChart, MiniBars } from '../../chart.js';
import { toDisplay, unitKey } from '../../../domain/units.js';
import { trendWeight, weightRate, forecastGoalDate, bodyFatEstimate, bodyRatios, cycleSummary, ageOn } from '../../../domain/calc/index.js';
import { latestMeasure, seriesOf, lastDays, dailyScale } from '../../../domain/body.js';
import { addDays, stepsOn } from '../../../data/legacy.js';
import { WeighSheet, MeasureSheet, GoalSheet } from './sheets.js';
import { PhotoThumbs } from './photos.js';
import { measureLabel, fatMethodLabel } from './labels.js';

const PERIODS = [[7, 'body.p.7'], [14, 'body.p.14'], [30, 'body.p.30'], [90, 'body.p.90'], [0, 'body.p.all']];
const TILES = ['waist', 'hips', 'bodyFatPct', 'chest', 'thighL', 'bicepsL', 'neck', 'shoulders'];

/* Тренд и взвешивания — для экрана и обзора */
export function useWeight() {
  const { repos } = useApp();
  const dp = repos.dietProfile.get();
  const scale = repos.scaleEntry.list();
  const trend = trendWeight(scale.map((s) => ({ date: s.date, weight: s.weightKg })), { version: dp.trendVersion || 'v3' });
  return { scale, daily: dailyScale(scale), trend, last: trend[trend.length - 1] || null };
}

export function Body({ route }) {
  const { repos, store } = useApp();
  useData(['scaleEntries', 'bodyEntries', 'profile', 'dietProfile', 'goals', 'stepsEntries', 'progressPhotos', 'periodEntries']);
  useLegacy();
  const today = todayYmd();
  const profile = repos.profile.get();
  const units = profile.units;
  const [period, setPeriod] = useState(30);
  const [metric, setMetric] = useState('weight');
  const [sheet, setSheet] = useState(route.query.open === 'weigh' ? { kind: 'weigh' } : route.query.open === 'measure' ? { kind: 'measure' } : null);
  const w = useWeight();
  const goal = repos.goal.active();
  const bodyEntries = repos.bodyEntry.list();
  const wu = t(unitKey('weight', units)), lu = t(unitKey('length', units));
  const dw = (kg, d = 1) => (kg == null ? '—' : fmtFix(toDisplay('weight', kg, units), d));
  const dl = (cm, d = 1) => (cm == null ? '—' : fmtNum(toDisplay('length', cm, units), d));

  /* вес */
  const end = w.last ? w.last.date : today;
  const trendPts = lastDays(w.trend.map((r) => ({ x: r.date, y: toDisplay('weight', r.trend, units) })), period, end, addDays);
  const scalePts = lastDays(w.daily.map((s) => ({ x: s.date, y: toDisplay('weight', s.weightKg, units) })), period, end, addDays);
  const rate = w.trend.length ? weightRate(w.trend) : null;
  const change = trendPts.length > 1 ? trendPts[trendPts.length - 1].y - trendPts[0].y : null;
  let forecast = null;
  if (goal && goal.targetWeightKg && w.trend.length) {
    const reached = goal.type === 'lose' ? w.last.trend <= goal.targetWeightKg : goal.type === 'gain' ? w.last.trend >= goal.targetWeightKg : false;
    forecast = reached ? { reached: true } : { date: forecastGoalDate(w.trend, goal.targetWeightKg) };
  }

  /* замеры */
  const tileVal = (k) => (k === 'bodyFatPct' ? latestMeasure(bodyEntries.concat(w.scale.filter((s) => s.bodyFatPct != null).map((s) => ({ date: s.date, bodyFatPct: s.bodyFatPct }))), k, today) : latestMeasure(bodyEntries, k, today));
  const metricPts = metric === 'weight' ? null : lastDays(seriesOf(metric === 'bodyFatPct' ? bodyEntries.concat(w.scale.map((s) => ({ date: s.date, bodyFatPct: s.bodyFatPct }))) : bodyEntries, metric).map((p) => ({ x: p.x, y: metric === 'bodyFatPct' ? p.y : toDisplay('length', p.y, units) })), period, today, addDays);

  /* жир и отношения */
  const age = profile.birthDate ? ageOn(profile.birthDate, today) : null;
  const waist = latestMeasure(bodyEntries, 'waist', today), neck = latestMeasure(bodyEntries, 'neck', today), hips = latestMeasure(bodyEntries, 'hips', today);
  const est = profile.sex && profile.heightCm ? bodyFatEstimate({ sex: profile.sex, ageYears: age, weightKg: w.last && w.last.trend, heightCm: profile.heightCm, waistCm: waist && waist.value, neckCm: neck && neck.value, hipsCm: hips && hips.value }) : null;
  const manualFat = tileVal('bodyFatPct');
  const ratios = bodyRatios({ waistCm: waist && waist.value, heightCm: profile.heightCm, hipsCm: hips && hips.value });

  /* шаги (журнал) */
  const steps7 = Array.from({ length: 7 }, (_, i) => stepsOn(store, addDays(today, i - 6)));
  const stepsToday = stepsOn(store, today);

  /* цикл */
  const showCycle = profile.sex === 'female' || repos.dietProfile.get().cycleTracking;
  const cyc = showCycle ? cycleSummary(repos.periodEntry.list((p) => p.kind === 'period').map((p) => p.date), today) : null;

  const series = metric === 'weight'
    ? [{ key: 'scale', label: t('body.scale'), kind: 'dots', color: 'var(--c-scale)', points: scalePts }, { key: 'trend', label: t('body.trend'), kind: 'line', color: 'var(--k-body)', points: trendPts }]
    : [{ key: metric, label: measureLabel(metric), kind: 'line', color: 'var(--k-body)', points: metricPts }];
  const goalLine = metric === 'weight' && goal && goal.targetWeightKg ? { y: toDisplay('weight', goal.targetWeightKg, units), label: t('body.goalShort') } : null;

  return html`<${Page} title=${t('body.title')} icon="scale" color="linear-gradient(135deg,#DA7DF3,#AF52DE)" back="/more" backLabel=${t('nav.more')}
      right=${html`<button class="small" onClick=${() => navigate('/more/body/history')}>${t('body.history')}</button>`}>
    <div class="card pad whero">
      <div class="row wh-top">
        <div class="grow">
          <div class="rl">${t('body.trendWeight')}</div>
          <div class="wh-v"><b>${w.last ? dw(w.last.trend) : '—'}</b><small>${wu}</small></div>
          <div class="hint" style="margin-top:2px">${w.daily.length ? t('body.lastScale', { v: dw(w.daily[w.daily.length - 1].weightKg, 2), u: wu, d: fmtDate(w.daily[w.daily.length - 1].date) }) : t('body.noWeight')}</div>
        </div>
        <button class="primary small-cta" onClick=${() => setSheet({ kind: 'weigh' })}>${t('body.weighIn')}</button>
      </div>
      <div class="wstats">
        <div><b>${change == null ? '—' : (change > 0 ? '+' : change < 0 ? '−' : '') + fmtNum(Math.abs(change), 1)}</b><span>${t('body.changeFor', { p: t(PERIODS.find((x) => x[0] === period)[1]) })}</span></div>
        <div><b>${rate == null ? '—' : (rate > 0 ? '+' : rate < 0 ? '−' : '') + fmtNum(Math.abs(toDisplay('weight', rate, units)), 2)}</b><span>${t('body.perWeek', { u: wu })}</span></div>
        <div><button class="linkish" onClick=${() => setSheet({ kind: 'goal' })}><b>${goal && goal.targetWeightKg ? dw(goal.targetWeightKg) : '—'}</b><span>${t('body.goal')}</span></button></div>
      </div>
      ${forecast ? html`<div class="banner forecast">${forecast.reached ? t('body.reached') : forecast.date ? t('body.forecast', { d: fmtDate(forecast.date, 'full') }) : t('body.noForecast')}</div>` : html`<button class="linkbtn" onClick=${() => setSheet({ kind: 'goal' })}>${t('body.setGoal')}</button>`}
    </div>

    <div class="pills" style="margin:0 0 10px">${PERIODS.map(([p, l]) => html`<button class=${'pill' + (period === p ? ' on' : '')} onClick=${() => setPeriod(p)}>${t(l)}</button>`)}</div>
    <div class="card pad">
      <div class="row" style="margin-bottom:6px"><b class="grow ch-title">${metric === 'weight' ? t('body.weight') : measureLabel(metric)}</b>
        ${metric !== 'weight' ? html`<button class="small" onClick=${() => setMetric('weight')}>${t('body.backToWeight')}</button>` : null}</div>
      <${DateChart} series=${series} goal=${goalLine} digits=${1} unit=${metric === 'weight' ? wu : metric === 'bodyFatPct' ? '%' : lu}
        ariaLabel=${t('body.chartAria')} empty=${t('body.chartEmpty')}/>
    </div>

    <div class="row" style="justify-content:space-between;margin:4px 4px 8px"><b class="sect">${t('body.measures')}</b><button class="small" onClick=${() => setSheet({ kind: 'measure' })}>${t('body.addMeasures')}</button></div>
    <div class="mtiles">${TILES.map((k) => {
      const v = tileVal(k);
      const d = v && v.prev ? v.value - v.prev.value : null;
      const isFat = k === 'bodyFatPct';
      return html`<button class=${'mtile' + (metric === k ? ' on' : '')} onClick=${() => setMetric(metric === k ? 'weight' : k)}>
        <span class="mt-l">${measureLabel(k)}</span>
        <span class="mt-v"><b>${v ? (isFat ? fmtNum(v.value, 1) : dl(v.value)) : '—'}</b><small>${v ? (isFat ? '%' : lu) : ''}</small></span>
        <span class=${'mt-d' + (d == null ? '' : d < 0 ? ' dn' : d > 0 ? ' up' : '')}>${v ? (d == null ? fmtDate(v.date) : (d > 0 ? '+' : d < 0 ? '−' : '±') + (isFat ? fmtNum(Math.abs(d), 1) : dl(Math.abs(d)))) : t('body.noData')}</span>
      </button>`;
    })}</div>

    <${Card} title=${t('body.fat')} icon="target" color="var(--k-body)">
      <div class="kv"><span>${t('body.fat.manual')}</span><span>${manualFat ? fmtNum(manualFat.value, 1) + ' % · ' + fmtDate(manualFat.date) : '—'}</span></div>
      <div class="kv"><span>${t('body.fat.estimate')}</span><span>${est ? '≈ ' + fmtNum(est.pct, 1) + ' %' : '—'}</span></div>
      ${est ? html`<div class="hint" style="margin:-4px 0 6px">${t('body.fat.methods', { list: est.methods.map((m) => fatMethodLabel(m.method) + ' ' + fmtNum(m.pct, 1)).join(' · ') })}</div>` : html`<div class="hint" style="margin:-4px 0 6px">${t('body.fat.need')}</div>`}
      <div class="kv"><span>${t('body.ratio.wh')}</span><span>${ratios.waistToHeight != null ? fmtNum(ratios.waistToHeight, 2) : '—'}</span></div>
      <div class="kv"><span>${t('body.ratio.whr')}</span><span>${ratios.waistToHip != null ? fmtNum(ratios.waistToHip, 2) : '—'}</span></div>
      <div class="hint">${t('body.ratio.hint')}</div>
    <//>

    <${StepsCard} today=${today} stepsToday=${stepsToday} steps7=${steps7} onSave=${(v) => saveSteps(repos, today, v)}/>

    <${Card} title=${t('body.photos')} icon="camera" color="#FF9500">
      <${PhotoThumbs} limit=${4}/>
      <button class="small" style="margin-top:10px" onClick=${() => navigate('/more/body/photos')}>${t('body.photos.all')}</button>
    <//>

    ${showCycle ? html`<${Card} title=${t('body.cycle')} icon="heart" color="#FF2D55">
      ${cyc && cyc.known ? html`<div class="kv"><span>${t('body.cycle.day')}</span><span>${cyc.cycleDay}${cyc.inPeriod ? ' · ' + t('body.cycle.inPeriod') : ''}</span></div>
        <div class="kv"><span>${t('body.cycle.next')}</span><span>${fmtDate(cyc.nextStart)}</span></div>
        <div class="kv"><span>${t('body.cycle.avg')}</span><span>${t('body.cycle.days', { count: cyc.avgLength })}</span></div>`
      : html`<div class="hint" style="margin:0 0 8px">${t('body.cycle.empty')}</div>`}
      <button class="small" style="margin-top:10px" onClick=${() => navigate('/more/body/cycle')}>${t('body.cycle.open')}</button>
    <//>` : null}

    <${WeighSheet} open=${sheet && sheet.kind === 'weigh'} entry=${sheet && sheet.entry} onClose=${() => setSheet(null)}/>
    <${MeasureSheet} open=${sheet && sheet.kind === 'measure'} date=${(sheet && sheet.date) || today} onClose=${() => setSheet(null)}/>
    <${GoalSheet} open=${sheet && sheet.kind === 'goal'} trendKg=${w.last && w.last.trend} onClose=${() => setSheet(null)}/>
  <//>`;
}

/* Шаги за день: одна запись на дату; пусто — удалить */
export function saveSteps(repos, date, steps) {
  if (steps == null) return repos.stepsEntry.get(date) ? repos.stepsEntry.remove(date) : null;
  const cur = repos.stepsEntry.get(date);
  return repos.stepsEntry.save(Object.assign({}, cur || { id: date, date, source: 'manual' }, { steps }));
}

function StepsCard({ today, stepsToday, steps7, onSave }) {
  const [v, setV] = useState(null);
  const labels = steps7.map((_, i) => fmtDate(addDays(today, i - 6)).split(' ')[0]);
  const cur = v != null ? v : (stepsToday != null ? String(stepsToday) : '');
  return html`<${Card} title=${t('body.steps')} icon="steps" color="var(--k-steps)">
    <div class="row">
      <input inputmode="numeric" placeholder=${t('body.steps.ph')} value=${cur} aria-label=${t('body.steps.today')} onInput=${(e) => setV(e.currentTarget.value)}
        onBlur=${() => { if (v != null) { const n = Math.round(Number(String(v).replace(/\s/g, ''))); onSave(v.trim() === '' ? null : isFinite(n) && n >= 0 ? n : null); setV(null); } }}/>
      <span class="hint" style="margin:0;white-space:nowrap">${t('body.steps.today')}</span>
    </div>
    <${MiniBars} values=${steps7} color="var(--k-steps)" labels=${labels}/>
    <div class="hint">${t('body.steps.hint')}</div>
  <//>`;
}
