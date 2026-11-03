/* Тело: тренд веса с графиком и прогнозом цели, замеры, процент жира и отношения, шаги, фото, цикл. */
import { html, useApp, useData, useState, useEffect, navigate, todayYmd, useMemo } from '../../core.js';
import { Page, Card } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../../i18n/index.js';
import { DateChart } from '../../chart.js';
import { toDisplay, unitKey } from '../../../domain/units.js';
import { trendWeight, weightRate, forecastGoalDate, bodyFatEstimate, bodyRatios, cycleSummary, ageOn } from '../../../domain/calc/index.js';
import { latestMeasure, seriesOf, lastDays, dailyScale } from '../../../domain/body.js';
import { addDays, stepsOn } from '../../../data/journal.js';
import { WeighSheet, MeasureSheet, GoalSheet } from './sheets.js';
import { PhotoThumbs } from './photos.js';
import { BODY_OUTLINE } from '../../train/muscle-map.js';
import { measureLabel, fatMethodLabel } from './labels.js';

const PERIODS = [[7, 'body.p.7'], [14, 'body.p.14'], [30, 'body.p.30'], [90, 'body.p.90'], [0, 'body.p.all']];
/* выноски силуэта (координаты макета 326 × 282): лента e = [cx, cy, rx, ry, поворот], линия к выноске, точка, сторона и высота выноски */
const BM_POINTS = [
  { k: 'neck', e: [163, 44, 9, 2.6], ln: 'M84 44H153', dot: [153, 44], side: 'l', top: 16 },
  { k: 'waist', e: [163, 109, 19, 3.6], ln: 'M84 109H143', dot: [143, 109], side: 'l', top: 82 },
  { k: 'hips', e: [163, 132, 23.5, 4], ln: 'M84 176H118L139 134', dot: [139, 133], side: 'l', top: 148 },
  { k: 'shoulders', e: [163, 56, 37, 4], ln: 'M241 56H200', dot: [200, 56], side: 'r', top: 28 },
  { k: 'bicepsL', e: [195, 80, 6.5, 2.4, -12], ln: 'M241 116H220L201 82', dot: [201, 81], side: 'r', top: 88 },
  { k: 'thighL', e: [176, 160, 10, 3], ln: 'M241 180H200L187 161', dot: [187, 160], side: 'r', top: 152 }
];

/* Тренд и взвешивания — для экрана и обзора */
/* Взвешивания и тренд; считается заново только когда меняются взвешивания или версия алгоритма */
export function useWeight() {
  const { repos, store } = useApp();
  const ver = store.version('scaleEntries');
  const version = repos.dietProfile.get().trendVersion || 'v3';
  return useMemo(() => {
    const scale = repos.scaleEntry.list();
    const trend = trendWeight(scale.map((s) => ({ date: s.date, weight: s.weightKg })), { version });
    return { scale, daily: dailyScale(scale), trend, last: trend[trend.length - 1] || null };
  }, [ver, version]);
}

export function Body({ route }) {
  const { repos, store } = useApp();
  useData(['scaleEntries', 'bodyEntries', 'profile', 'dietProfile', 'goals', 'stepsEntries', 'progressPhotos', 'periodEntries']);
  const today = todayYmd();
  const profile = repos.profile.get();
  const units = profile.units;
  const [period, setPeriod] = useState(30);
  const [metric, setMetric] = useState('weight');
  const [sheet, setSheet] = useState(null);
  /* ?open=weigh|measure открывает шторку и убирает параметр из адреса (работает и когда экран уже открыт) */
  useEffect(() => { const o = route.query.open; if (o === 'weigh' || o === 'measure') { setSheet({ kind: o }); navigate('/body', { replace: true }); } }, [route.query.open]);
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
    ? [{ key: 'scale', label: t('body.scale'), kind: 'dots', color: 'var(--c-scale)', points: scalePts }, { key: 'trend', label: t('body.trend'), kind: 'line', color: 'var(--t-body)', points: trendPts, glow: true, badge: true }]
    : [{ key: metric, label: measureLabel(metric), kind: 'line', color: 'var(--t-body)', points: metricPts, glow: true, badge: true }];
  const goalLine = metric === 'weight' && goal && goal.targetWeightKg ? { y: toDisplay('weight', goal.targetWeightKg, units), label: t('body.goalShort') } : null;

  /* силуэт с замерами: выноски слева и справа, лента на теле; изменение — с первого замера */
  const lastFull = bodyEntries.filter((e) => e.date <= today && e.measurements && Object.values(e.measurements).some((v) => v != null)).map((e) => e.date).sort().pop();
  const callout = (k) => {
    const v = latestMeasure(bodyEntries, k, today);
    const pts = seriesOf(bodyEntries, k).filter((p) => p.x <= today);
    const d = v && pts.length > 1 ? v.value - pts[0].y : null;
    return { k, v, d };
  };
  const BM = BM_POINTS.map((x) => Object.assign({}, x, callout(x.k)));
  const extra = ['chest', 'bodyFatPct'];

  return html`<${Page} title=${t('body.title')}
      right=${html`<button class="ghost hist" onClick=${() => navigate('/body/history')}>${t('body.history')}</button>`}>
    <div class="card whero">
      <div class="row wh-top">
        <div class="grow">
          <div class="rl">${t('body.trendWeight')}</div>
          <div class="wh-v"><b>${w.last ? dw(w.last.trend) : '—'}</b><small>${wu}</small></div>
          <div class="wh-s">${w.daily.length ? t('body.lastScale', { v: dw(w.daily[w.daily.length - 1].weightKg, 2), u: wu, d: fmtDate(w.daily[w.daily.length - 1].date) }) : t('body.noWeight')}</div>
        </div>
        <button class="primary small-cta" onClick=${() => setSheet({ kind: 'weigh' })}><${Icon} name="plus"/>${t('body.weighIn')}</button>
      </div>
      <div class="wstats">
        <div><b class=${change != null && goal && ((goal.type === 'lose' && change < 0) || (goal.type === 'gain' && change > 0)) ? 'dn' : ''}>${change == null ? '—' : (change > 0 ? '+' : change < 0 ? '−' : '') + fmtNum(Math.abs(change), 1)}</b><span>${t('body.changeFor', { p: t(PERIODS.find((x) => x[0] === period)[1]) })}</span></div>
        <div><b>${rate == null ? '—' : (rate > 0 ? '+' : rate < 0 ? '−' : '') + fmtNum(Math.abs(toDisplay('weight', rate, units)), 2)}</b><span>${t('body.perWeek', { u: wu })}</span></div>
        <div><button class="linkish" onClick=${() => setSheet({ kind: 'goal' })}><b class="gl">${goal && goal.targetWeightKg ? dw(goal.targetWeightKg) : '—'}</b><span>${t('body.goal')}</span></button></div>
      </div>
      ${forecast ? html`<div class="banner forecast">${forecast.reached ? t('body.reached') : forecast.date ? t('body.forecast', { d: fmtDate(forecast.date, 'full') }) : t('body.noForecast')}</div>` : html`<button class="linkbtn" onClick=${() => setSheet({ kind: 'goal' })}>${t('body.setGoal')}</button>`}
    </div>

    <div class="card bchart">
      <div class="pills" role="radiogroup">${PERIODS.map(([p, l]) => html`<button role="radio" aria-checked=${period === p} class=${'pill' + (period === p ? ' on' : '')} onClick=${() => setPeriod(p)}>${t(l)}</button>`)}</div>
      ${metric !== 'weight' ? html`<div class="row bc-h"><b class="grow ch-title">${measureLabel(metric)}</b>
        <button class="small" onClick=${() => setMetric('weight')}>${t('body.backToWeight')}</button></div>` : null}
      <${DateChart} series=${series} goal=${goalLine} digits=${1} unit=${metric === 'weight' ? wu : metric === 'bodyFatPct' ? '%' : lu}
        ariaLabel=${t('body.chartAria')} empty=${t('body.chartEmpty')}/>
    </div>

    <section class="card bmeas">
      <div class="row bm-h"><b class="grow">${t('body.measures')}</b><button class="small bm-add" onClick=${() => setSheet({ kind: 'measure' })}>${t('body.addMeasures')}</button></div>
      <div class="bm">
        <svg viewBox="0 0 326 282" aria-hidden="true">
          <defs><linearGradient id="bm-sil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bm-s1"/><stop offset="1" class="bm-s2"/></linearGradient>
            <filter id="bm-tape" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g transform="translate(95.5 4) scale(1.35)"><path class="bm-body" d=${BODY_OUTLINE.silhouette}/><path class="bm-body" d=${BODY_OUTLINE.head}/></g>
          ${BM.map((x) => html`<ellipse class=${x.v ? 'bm-tape on' : 'bm-tape'} cx=${x.e[0]} cy=${x.e[1]} rx=${x.e[2]} ry=${x.e[3]} transform=${x.e[4] ? 'rotate(' + x.e[4] + ' ' + x.e[0] + ' ' + x.e[1] + ')' : null} filter=${x.v ? 'url(#bm-tape)' : null}/>`)}
          ${BM.map((x) => html`<path class="bm-ln" d=${x.ln}/>`)}
          ${BM.filter((x) => x.v).map((x) => html`<circle class="bm-dot" cx=${x.dot[0]} cy=${x.dot[1]} r="2.2"/>`)}
        </svg>
        ${BM.map((x) => html`<button class=${'mtile bm-c' + (x.side === 'l' ? ' bm-l' : ' bm-r') + (metric === x.k ? ' on' : '')} style=${'top:' + (x.top / 282 * 100).toFixed(1) + '%'} onClick=${() => setMetric(metric === x.k ? 'weight' : x.k)}>
          <span class="mt-l">${measureLabel(x.k).replace(/\s*\(.*\)$/, '')}</span>
          <span class="mt-v"><b>${x.v ? dl(x.v.value) : '—'}</b>${x.v ? html`<small>${lu}</small>` : null}</span>
          ${x.v ? html`<span class=${'mt-d' + (x.d == null ? '' : x.d < 0 ? ' dn' : x.d > 0 ? ' up' : '')}>${x.d == null ? fmtDate(x.v.date) : t('body.sinceFirst', { v: (x.d > 0 ? '+' : x.d < 0 ? '−' : '±') + dl(Math.abs(x.d)) })}</span>` : null}
        </button>`)}
      </div>
      <div class="bm-more">${extra.map((k) => { const v = tileVal(k); const isFat = k === 'bodyFatPct';
        return html`<button class=${'chip' + (metric === k ? ' on' : '')} onClick=${() => setMetric(metric === k ? 'weight' : k)}>${measureLabel(k)}${v ? ' · ' + (isFat ? fmtNum(v.value, 1) + ' %' : dl(v.value) + ' ' + lu) : ''}</button>`; })}</div>
      <div class="bm-foot">${lastFull ? t('body.lastFull', { d: fmtDate(lastFull, 'dm') }) : t('body.noData')}</div>
    </section>

    <${Card} title=${t('body.fat')} icon="target" color="var(--k-body)">
      <div class="kv"><span>${t('body.fat.manual')}</span><span>${manualFat ? fmtNum(manualFat.value, 1) + ' % · ' + fmtDate(manualFat.date) : '—'}</span></div>
      <div class="kv"><span>${t('body.fat.estimate')}</span><span>${est ? '≈ ' + fmtNum(est.pct, 1) + ' %' : '—'}</span></div>
      ${est ? html`<div class="hint" style="margin:-4px 0 6px">${t('body.fat.methods', { list: est.methods.map((m) => fatMethodLabel(m.method) + ' ' + fmtNum(m.pct, 1)).join(' · ') })}</div>` : html`<div class="hint" style="margin:-4px 0 6px">${t('body.fat.need')}</div>`}
      <div class="kv"><span>${t('body.ratio.wh')}</span><span>${ratios.waistToHeight != null ? fmtNum(ratios.waistToHeight, 2) : '—'}</span></div>
      <div class="kv"><span>${t('body.ratio.whr')}</span><span>${ratios.waistToHip != null ? fmtNum(ratios.waistToHip, 2) : '—'}</span></div>
      <div class="hint">${t('body.ratio.hint')}</div>
    <//>

    <${StepsCard} today=${today} stepsToday=${stepsToday} steps7=${steps7} onSave=${(v) => saveSteps(repos, today, v)}/>

    <div class="card pad bphoto">
      <div class="row bp-h"><span class="bp-i"><${Icon} name="camera"/></span>
        <span class="ltext"><b>${t('body.photos')}</b><span class="ls">${t('body.photos.sub')}</span></span>
        <button class="ghost" aria-label=${t('body.photos.all')} onClick=${() => navigate('/body/photos')}><${Icon} name="right"/></button></div>
      <${PhotoThumbs} limit=${4}/>
    </div>

    ${showCycle ? html`<${Card} title=${t('body.cycle')} icon="heart" color="#FF2D55">
      ${cyc && cyc.known ? html`<div class="kv"><span>${t('body.cycle.day')}</span><span>${cyc.cycleDay}${cyc.inPeriod ? ' · ' + t('body.cycle.inPeriod') : ''}</span></div>
        <div class="kv"><span>${t('body.cycle.next')}</span><span>${fmtDate(cyc.nextStart)}</span></div>
        <div class="kv"><span>${t('body.cycle.avg')}</span><span>${t('body.cycle.days', { count: cyc.avgLength })}</span></div>`
      : html`<div class="hint" style="margin:0 0 8px">${t('body.cycle.empty')}</div>`}
      <button class="small" style="margin-top:10px" onClick=${() => navigate('/body/cycle')}>${t('body.cycle.open')}</button>
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
  const cur = v != null ? v : (stepsToday != null ? String(stepsToday) : '');
  const known = steps7.filter((x) => x != null);
  const avg = known.length ? Math.round(known.reduce((a, x) => a + x, 0) / known.length) : null;
  const mx = Math.max(1, ...steps7.map((x) => x || 0));
  return html`<div class="card pad bsteps">
    <h2 class="h2i" style="--cc:var(--k-steps)"><${Icon} name="steps"/><span class="grow">${t('body.steps')}</span>${avg != null ? html`<small>${t('body.steps.avg', { n: fmtNum(avg) })}</small>` : null}</h2>
    <label class="bs-in">
      <input inputmode="numeric" placeholder=${t('body.steps.ph')} value=${cur} aria-label=${t('body.steps.today')} onInput=${(e) => setV(e.currentTarget.value)}
        onBlur=${() => { if (v != null) { const n = Math.round(Number(String(v).replace(/\s/g, ''))); onSave(v.trim() === '' ? null : isFinite(n) && n >= 0 ? n : null); setV(null); } }}/>
      <span>${t('body.steps.today')}</span>
    </label>
    <div class="tw-chart bs-chart">
      <div class="nw-bars" role="img" aria-label=${t('body.steps.aria')}>${steps7.map((x, i) => html`<i class=${x ? 'hit' : i === 6 ? 'tod' : 'z'} style=${x ? 'height:' + Math.max(8, x / mx * 100).toFixed(1) + '%' : null}></i>`)}</div>
      <div class="nw-days7">${steps7.map((_, i) => html`<span class=${i === 6 ? 'on' : ''}>${Number(addDays(today, i - 6).slice(8))}</span>`)}</div>
    </div>
    <div class="hint">${t('body.steps.hint')}</div>
  </div>`;
}
