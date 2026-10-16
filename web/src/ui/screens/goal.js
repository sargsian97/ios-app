/* Цель и программа: текущая цель с прогрессом и прогнозом, программа питания, цели на дни недели,
   пересчёт, ручные цели, история целей. Нормы микронутриентов — отдельный экран. */
import { html, useApp, useData, useState, useEffect, navigate, todayYmd } from '../core.js';
import { Page, Card, Sheet, Field, Segmented, List, Row } from '../kit.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../i18n/index.js';
import { toDisplay, fromDisplay, unitKey } from '../../domain/units.js';
import { planTargets, dayTargetDocs, targetDate, startingEstimate, microGoalDocs } from '../../domain/program.js';
import { GOAL_RATES, GOAL_RATE_DEFAULT, forecastGoalDate, microGoals, ageOn, NUTRIENTS } from '../../domain/calc/index.js';
import { useWeight } from './body/body.js';
import { warnLabel } from './onboarding.js';
import { DietOptions, ProteinOptions } from './program-options.js';
import { computeExpenditure, startTdeeFor } from '../food/expenditure.js';
import { nutrientLabel, unitLabel } from '../food/labels.js';

const WD = ['wd.0', 'wd.1', 'wd.2', 'wd.3', 'wd.4', 'wd.5', 'wd.6'];
const GOAL_T = { lose: 'goal.lose', maintain: 'goal.maintain', gain: 'goal.gain' };
const STYLE_T = { coached: 'ob.style.coached', collaborative: 'ob.style.collab', manual: 'ob.style.manual' };
const TDEE_T = { fixed: 'goal.tdee.fixed', adaptive: 'goal.tdee.adaptive', estimate: 'goal.tdee.estimate' };

/* Расход для расчёта целей: фиксированный → по данным (адаптивный) → стартовая оценка */
export function currentTdee(repos, trendKg, today, app) {
  const dp = repos.dietProfile.get();
  if (dp.tdeeMode === 'fixed' && dp.fixedTdee) return { tdee: dp.fixedTdee, source: 'fixed' };
  const ex = app ? computeExpenditure(app, today) : null;
  if (ex && ex.current && (ex.current.status === 'ok' || ex.current.status === 'hold')) return { tdee: Math.round(ex.current.tdee), source: 'adaptive', status: ex.current.status };
  const est = startTdeeFor(repos, trendKg, today);
  return est ? { tdee: est, source: 'estimate' } : null;
}

/* Действующие цели на 7 дней (последние по validFrom не позже даты) */
export function activeTargets(repos, date) {
  return Array.from({ length: 7 }, (_, wd) => repos.dayTarget.on(date, wd));
}

/* Записать новые цели на дни (с сегодняшнего дня) */
export async function writeTargets({ repos, store }, program, days, today) {
  await store.batch(dayTargetDocs(days, { programId: program.id, validFrom: today }).map((d) => repos.dayTarget.putOp(d)));
}

export function GoalScreen() {
  const app = useApp();
  const { repos } = app;
  useData(['goals', 'macroPrograms', 'dayTargets', 'scaleEntries', 'profile', 'dietProfile', 'tdee']);
  const today = todayYmd();
  const units = repos.profile.get().units;
  const wu = t(unitKey('weight', units));
  const w = useWeight();
  const goal = repos.goal.active();
  const program = repos.macroProgram.active();
  const targets = activeTargets(repos, today);
  const [sheet, setSheet] = useState(null);
  const [msg, setMsg] = useState('');
  const dw = (kg) => (kg == null ? '—' : fmtFix(toDisplay('weight', kg, units), 1));
  const tdee = currentTdee(repos, w.last && w.last.trend, today, app);

  if (!goal && !program) {
    return html`<${Page} title=${t('goal.title')} icon="target" color="linear-gradient(135deg,#5AB0FF,#0A84FF)" back="/more" backLabel=${t('nav.more')}>
      <div class="card pad welcome"><h2>${t('goal.none.title')}</h2><p class="hint">${t('goal.none.text')}</p>
        <button class="primary" style="width:100%" onClick=${() => navigate('/onboarding')}>${t('goal.none.go')}</button></div>
    <//>`;
  }

  /* прогресс к цели */
  let progress = null;
  if (goal && goal.startWeightKg && goal.targetWeightKg && w.last && goal.type !== 'maintain') {
    const total = goal.targetWeightKg - goal.startWeightKg, done = w.last.trend - goal.startWeightKg;
    progress = Math.max(0, Math.min(1, total ? done / total : 0));
  }
  const fc = goal && goal.targetWeightKg && w.trend.length && goal.type !== 'maintain' ? forecastGoalDate(w.trend, goal.targetWeightKg) : null;

  async function recompute() {
    setMsg('');
    if (!tdee) { setMsg(t('goal.err.noTdee')); return; }
    if (program.style === 'manual') { setSheet({ kind: 'manual' }); return; }
    const p = repos.profile.get();
    const plan = planTargets({ tdee: tdee.tdee, goal: { type: goal.type, ratePctPerWeek: goal.ratePctPerWeek || 0 }, weightKg: w.last.trend, sex: p.sex, program });
    await writeTargets(app, program, plan.days, today);
    setMsg(t('goal.recomputed', { k: fmtNum(plan.daily.kcal) }) + (plan.warnings.length ? ' ' + plan.warnings.map(warnLabel).join(' ') : ''));
  }

  return html`<${Page} title=${t('goal.title')} icon="target" color="linear-gradient(135deg,#5AB0FF,#0A84FF)" back="/more" backLabel=${t('nav.more')}>
    ${goal ? html`<${Card} title=${t('goal.current')} icon="target" color="var(--k-plan)">
      <div class="kv"><span>${t('goal.type')}</span><span>${t(GOAL_T[goal.type])}</span></div>
      <div class="kv"><span>${t('goal.weights')}</span><span>${dw(goal.startWeightKg)} → ${dw(goal.targetWeightKg)} ${wu}</span></div>
      ${goal.type !== 'maintain' ? html`<div class="kv"><span>${t('goal.rate')}</span><span>${fmtNum(goal.ratePctPerWeek || 0, 2)} % · ${goal.startWeightKg ? fmtNum(toDisplay('weight', goal.startWeightKg * (goal.ratePctPerWeek || 0) / 100, units), 2) + ' ' + wu : ''}</span></div>
        <div class="kv"><span>${t('goal.planDate')}</span><span>${goal.targetDate ? fmtDate(goal.targetDate, 'full') : '—'}</span></div>
        <div class="kv"><span>${t('goal.forecastDate')}</span><span>${fc ? fmtDate(fc, 'full') : '—'}</span></div>` : html`<div class="kv"><span>${t('goal.range')}</span><span>${goal.maintainMinKg ? dw(goal.maintainMinKg) + '–' + dw(goal.maintainMaxKg) + ' ' + wu : '—'}</span></div>`}
      ${progress != null ? html`<div class="bar gbar" style="margin-top:10px"><i style=${'width:' + (progress * 100).toFixed(1) + '%'}></i></div><div class="hint">${t('goal.progress', { p: Math.round(progress * 100), v: dw(w.last.trend), u: wu })}</div>` : null}
      <button class="small" style="margin-top:12px" onClick=${() => setSheet({ kind: 'goal' })}>${t('goal.edit')}</button>
    <//>` : null}

    ${program ? html`<${Card} title=${t('goal.program')} icon="food" color="var(--k-food)">
      <div class="kv"><span>${t('goal.style')}</span><span>${t(STYLE_T[program.style])}</span></div>
      ${program.style !== 'manual' ? html`<div class="kv"><span>${t('ob.diet')}</span><span>${t({ balanced: 'ob.diet.balancedFull', low_fat: 'ob.diet.lowFatFull', low_carb: 'ob.diet.lowCarbFull', keto: 'ob.diet.ketoFull' }[program.dietType])}</span></div>
        <div class="kv"><span>${t('ob.protein')}</span><span>${t({ low: 'ob.protein.low', moderate: 'ob.protein.moderateFull', high: 'ob.protein.high', very_high: 'ob.protein.veryHighFull' }[program.proteinLevel])}</span></div>
        <div class="kv"><span>${t('ob.distribution')}</span><span>${program.distribution === 'high_days' ? t('ob.dist.high') + ' · ' + program.highDays.map((d) => t(WD[d])).join(', ') : t('ob.dist.even')}</span></div>` : null}
      <div class="kv"><span>${t('goal.tdee')}</span><span>${tdee ? fmtNum(tdee.tdee) + ' ' + t('unit.kcal') + ' · ' + t(TDEE_T[tdee.source]) : '—'}</span></div>
      <table class="ttab"><thead><tr><th></th><th>${t('food.goal')}</th><th>${t('food.macro.p')}</th><th>${t('food.macro.f')}</th><th>${t('food.macro.c')}</th></tr></thead>
        <tbody>${targets.map((d, i) => html`<tr><td>${t(WD[i])}</td><td>${d ? fmtNum(d.kcal) : '—'}</td><td>${d ? fmtNum(d.protein) : '—'}</td><td>${d ? fmtNum(d.fat) : '—'}</td><td>${d ? fmtNum(d.carbs) : '—'}</td></tr>`)}</tbody></table>
      <div class="stack" style="margin-top:12px">
        <button onClick=${recompute}>${program.style === 'manual' ? t('goal.manualEdit') : t('goal.recompute')}</button>
        <button onClick=${() => setSheet({ kind: 'program' })}>${t('goal.programEdit')}</button>
      </div>
      ${msg ? html`<div class="hint io">${msg}</div>` : null}
      <div class="hint">${t('goal.programHint')}</div>
    <//>` : null}

    <${List} title=${t('goal.more')}>
      <${Row} icon="cal" color="#0A84FF" label=${t('ci.settings')} href="/more/checkin-settings"/>
      <${Row} icon="flame" color="#FF9500" label=${t('tdee.title')} href="/more/expenditure"/>
      <${Row} icon="list" color="#14B8A6" label=${t('micro.title')} href="/more/micro"/>
      <${Row} icon="target" color="#5856D6" label=${t('goal.redo')} href="/onboarding"/>
    <//>
    <${GoalHistory}/>

    <${GoalSheet} open=${sheet && sheet.kind === 'goal'} goal=${goal} trendKg=${w.last && w.last.trend} onClose=${() => setSheet(null)}/>
    <${ProgramSheet} open=${sheet && sheet.kind === 'program'} program=${program} goal=${goal} tdee=${tdee} trendKg=${w.last && w.last.trend} onClose=${() => setSheet(null)}/>
    <${ManualSheet} open=${sheet && sheet.kind === 'manual'} program=${program} targets=${targets} onClose=${() => setSheet(null)}/>
  <//>`;
}

function GoalHistory() {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const list = repos.goal.list((g) => g.status !== 'active').sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  if (!list.length) return null;
  return html`<${List} title=${t('goal.history')}>${list.map((g) => html`<${Row} label=${t(GOAL_T[g.type]) + (g.targetWeightKg ? ' · ' + fmtFix(toDisplay('weight', g.targetWeightKg, units), 1) + ' ' + t(unitKey('weight', units)) : '')} sub=${(g.startDate ? fmtDate(g.startDate, 'full') : '') + (g.status === 'done' ? ' · ' + t('goal.done') : '')}/>`)}<//>`;
}

/* Правка цели: тип, целевой вес, темп, стиль прогноза, коридор поддержания */
function GoalSheet({ open, goal, trendKg, onClose }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const wu = t(unitKey('weight', units));
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) { setD(null); return; }
    const g = goal || {};
    const f = (kg) => (kg ? fmtNum(toDisplay('weight', kg, units), 1).replace(/\s/g, '') : '');
    setErr('');
    setD({ type: g.type || 'lose', target: f(g.targetWeightKg), rate: g.ratePctPerWeek || GOAL_RATE_DEFAULT[g.type || 'lose'], forecast: g.forecast || 'data', min: f(g.maintainMinKg), max: f(g.maintainMaxKg) });
  }, [open]);
  if (!open || !d) return null;
  async function save() {
    const target = fromDisplay('weight', d.target, units) || (d.type === 'maintain' ? trendKg : null);
    if (!(target >= 30 && target <= 300)) { setErr(t('ob.err.target')); return; }
    const today = todayYmd(), start = trendKg || (goal && goal.startWeightKg);
    const data = { type: d.type, targetWeightKg: Math.round(target * 10) / 10, ratePctPerWeek: d.type === 'maintain' ? 0 : d.rate, forecast: d.forecast,
      maintainMinKg: d.type === 'maintain' ? fromDisplay('weight', d.min, units) : null, maintainMaxKg: d.type === 'maintain' ? fromDisplay('weight', d.max, units) : null,
      startWeightKg: start ? Math.round(start * 10) / 10 : null, startDate: today, status: 'active',
      targetDate: d.type === 'maintain' ? null : targetDate({ startKg: start, targetKg: target, ratePctPerWeek: d.rate, start: today }) };
    try {
      if (goal && goal.type === d.type) await repos.goal.update(goal.id, data);
      else { if (goal) await repos.goal.update(goal.id, { status: 'archived' }); await repos.goal.create(data); }
      onClose();
    } catch (e) { setErr(t('food.editor.invalid')); }
  }
  const rates = d.type === 'gain' ? GOAL_RATES.gain : GOAL_RATES.lose;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('goal.edit')}>
    <${Segmented} value=${d.type} onChange=${(v) => setD(Object.assign({}, d, { type: v, rate: GOAL_RATE_DEFAULT[v] }))} options=${[['lose', t('goal.lose')], ['maintain', t('goal.maintain')], ['gain', t('goal.gain')]]}/>
    <div style="margin-top:12px"><${Field} label=${t('body.targetWeight', { u: wu })} error=${err}><input class="bigin" inputmode="decimal" value=${d.target} onInput=${(e) => setD(Object.assign({}, d, { target: e.currentTarget.value }))}/><//></div>
    ${d.type !== 'maintain' ? html`<div class="chips" style="margin-top:12px">${rates.map((r) => html`<button class=${'chip' + (d.rate === r ? ' on' : '')} onClick=${() => setD(Object.assign({}, d, { rate: r }))}>${fmtNum(r, 2)} %</button>`)}</div>
      <div class="hint">${t('goal.rateHint')}</div>`
    : html`<div class="grid2" style="margin-top:12px"><${Field} label=${t('goal.rangeMin', { u: wu })}><input inputmode="decimal" value=${d.min} onInput=${(e) => setD(Object.assign({}, d, { min: e.currentTarget.value }))}/><//><${Field} label=${t('goal.rangeMax', { u: wu })}><input inputmode="decimal" value=${d.max} onInput=${(e) => setD(Object.assign({}, d, { max: e.currentTarget.value }))}/><//></div>`}
    <${Segmented} label=${t('ob.goal.forecast')} value=${d.forecast} onChange=${(v) => setD(Object.assign({}, d, { forecast: v }))} options=${[['data', t('ob.fc.data')], ['goal', t('ob.fc.goal')], ['mixed', t('ob.fc.mixed')]]}/>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
  <//>`;
}

/* Программа: стиль, диета, белок, распределение, порог; сохранение пересчитывает цели */
function ProgramSheet({ open, program, goal, tdee, trendKg, onClose }) {
  const app = useApp();
  const { repos } = app;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (open && program) { setErr(''); setD({ style: program.style, dietType: program.dietType, proteinLevel: program.proteinLevel, distribution: program.distribution, highDays: program.highDays.slice(), floor: program.floor, kcalMin: program.limits.kcalMin ?? '', kcalMax: program.limits.kcalMax ?? '', proteinMin: program.limits.proteinMin ?? '' }); } if (!open) setD(null); }, [open]);
  if (!open || !d) return null;
  const n = (v) => (v === '' || v == null ? null : Number(v));
  async function save() {
    const patch = { style: d.style, dietType: d.dietType, proteinLevel: d.proteinLevel, distribution: d.distribution, highDays: d.highDays, floor: d.floor, limits: { kcalMin: n(d.kcalMin), kcalMax: n(d.kcalMax), proteinMin: n(d.proteinMin) } };
    const p = await repos.macroProgram.update(program.id, patch);
    if (p.style !== 'manual' && goal && tdee && trendKg) {
      const plan = planTargets({ tdee: tdee.tdee, goal: { type: goal.type, ratePctPerWeek: goal.ratePctPerWeek || 0 }, weightKg: trendKg, sex: repos.profile.get().sex, program: p });
      await writeTargets(app, p, plan.days, todayYmd());
    }
    onClose();
  }
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('goal.programEdit')}>
    <${Segmented} label=${t('goal.style')} value=${d.style} onChange=${(v) => setD(Object.assign({}, d, { style: v }))} options=${[['coached', t('ob.style.coached')], ['collaborative', t('ob.style.collab')], ['manual', t('ob.style.manual')]]}/>
    ${d.style !== 'manual' ? html`
      <${DietOptions} value=${d.dietType} onChange=${(v) => setD(Object.assign({}, d, { dietType: v }))}/>
      <${ProteinOptions} value=${d.proteinLevel} onChange=${(v) => setD(Object.assign({}, d, { proteinLevel: v }))}/>
      <${Segmented} label=${t('ob.distribution')} value=${d.distribution} onChange=${(v) => setD(Object.assign({}, d, { distribution: v }))} options=${[['even', t('ob.dist.even')], ['high_days', t('ob.dist.high')]]}/>
      ${d.distribution === 'high_days' ? html`<div class="chips" style="margin-top:10px">${WD.map((k, i) => html`<button class=${'chip' + (d.highDays.includes(i) ? ' on' : '')} onClick=${() => setD(Object.assign({}, d, { highDays: d.highDays.includes(i) ? d.highDays.filter((x) => x !== i) : d.highDays.concat([i]).sort() }))}>${t(k)}</button>`)}</div>` : null}
      <${Segmented} label=${t('ob.floor')} value=${d.floor} onChange=${(v) => setD(Object.assign({}, d, { floor: v }))} options=${[['standard', t('ob.floor.standard')], ['low', t('ob.floor.low')], ['ignore', t('ob.floor.ignore')]]}/>
      ${d.style === 'collaborative' ? html`<div class="grid3" style="margin-top:14px">
        <${Field} label=${t('ob.lim.kcalMin')}><input inputmode="numeric" value=${d.kcalMin} onInput=${(e) => setD(Object.assign({}, d, { kcalMin: e.currentTarget.value }))}/><//>
        <${Field} label=${t('ob.lim.kcalMax')}><input inputmode="numeric" value=${d.kcalMax} onInput=${(e) => setD(Object.assign({}, d, { kcalMax: e.currentTarget.value }))}/><//>
        <${Field} label=${t('ob.lim.proteinMin')}><input inputmode="numeric" value=${d.proteinMin} onInput=${(e) => setD(Object.assign({}, d, { proteinMin: e.currentTarget.value }))}/><//>
      </div>` : null}` : html`<div class="hint">${t('goal.manualNote')}</div>`}
    ${err ? html`<div class="banner warnb">${err}</div>` : null}
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
  <//>`;
}

/* Ручные цели: одинаково каждый день или по дням недели */
function ManualSheet({ open, program, targets, onClose }) {
  const app = useApp();
  const [same, setSame] = useState(true);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!open) return;
    const r = targets.map((x) => ({ kcal: x ? String(x.kcal) : '', protein: x ? String(x.protein) : '', fat: x ? String(x.fat) : '', carbs: x ? String(x.carbs) : '' }));
    setRows(r);
    setSame(r.every((x) => JSON.stringify(x) === JSON.stringify(r[0])));
  }, [open]);
  if (!open || !program) return null;
  async function save() {
    const plan = planTargets({ program: { style: 'manual' }, manual: { sameEveryDay: same, days: rows } });
    await app.repos.macroProgram.update(program.id, { sameEveryDay: same });
    await writeTargets(app, program, plan.days, todayYmd());
    onClose();
  }
  const setRow = (i, k, v) => setRows(rows.map((x, j) => (j === i ? Object.assign({}, x, { [k]: v }) : x)));
  const shown = same ? rows.slice(0, 1) : rows;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('goal.manualEdit')}>
    <${Segmented} value=${same ? 'same' : 'days'} onChange=${(v) => setSame(v === 'same')} options=${[['same', t('goal.manual.same')], ['days', t('goal.manual.days')]]}/>
    ${shown.map((r, i) => html`<div class="ltitle" style="margin-left:0">${same ? t('goal.manual.every') : t(WD[i])}</div>
      <div class="grid4">${[['kcal', t('unit.kcal')], ['protein', t('food.macro.p')], ['fat', t('food.macro.f')], ['carbs', t('food.macro.c')]].map(([k, l]) => html`<${Field} label=${l}><input inputmode="numeric" value=${r[k]} onInput=${(e) => setRow(i, k, e.currentTarget.value)}/><//>`)}</div>
      ${(() => { const sum = Number(r.protein || 0) * 4 + Number(r.fat || 0) * 9 + Number(r.carbs || 0) * 4; return r.kcal && r.carbs && Math.abs(sum - Number(r.kcal)) > 30 ? html`<div class="hint warn">${t('goal.manual.mismatch', { k: fmtNum(sum) })}</div>` : null; })()}`)}
    <div class="hint">${t('ob.manual.hint')}</div>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
  <//>`;
}

/* ---------- нормы микронутриентов ---------- */
export function MicroGoals() {
  const { repos, store } = useApp();
  useData(['microGoals', 'profile', 'dayTargets']);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const p = repos.profile.get();
  const goals = repos.microGoal.list().reduce((m, g) => { m[g.id] = g; return m; }, {});
  async function regen(all) {
    setMsg('');
    if (!p.sex || !p.birthDate) { setMsg(t('micro.needProfile')); return; }
    const age = ageOn(p.birthDate, todayYmd());
    let docs;
    try { const dt = repos.dayTarget.on(todayYmd(), 0); docs = microGoalDocs(microGoals({ sex: p.sex, ageYears: age, kcal: dt ? dt.kcal : null }), all ? {} : goals); }
    catch (e) { setMsg(e.message); return; }
    await store.batch(docs.map((g) => repos.microGoal.putOp(g)));
    setMsg(t('micro.done'));
  }
  const groups = [['carbs', 'food.group.carbs'], ['fats', 'food.group.fats'], ['vitamins', 'food.group.vitamins'], ['minerals', 'food.group.minerals'], ['other', 'food.group.other']];
  const fmt = (v) => (v == null ? '—' : fmtNum(v, v < 10 ? 2 : 0));
  return html`<${Page} title=${t('micro.title')} back="/more/goal" backLabel=${t('goal.title')}>
    <div class="hint" style="margin:-6px 4px 12px">${t('micro.hint')}</div>
    <div class="grid2" style="margin-bottom:12px"><button class="small" onClick=${() => regen(false)}>${Object.keys(goals).length ? t('micro.update') : t('micro.create')}</button><button class="small" onClick=${() => regen(true)}>${t('micro.resetAll')}</button></div>
    ${msg ? html`<div class="banner">${msg}</div>` : null}
    ${groups.map(([g, label]) => html`<div class="ltitle">${t(label)}</div><div class="list">${NUTRIENTS.filter((x) => x.group === g).map((x) => {
      const v = goals[x.key];
      return html`<button class="lrow" onClick=${() => setEdit(x)}>
        <span class="ltext"><span class="ll">${nutrientLabel(x.key)}${v && v.auto === false ? ' ✎' : ''}</span>
          <span class="ls">${v ? t('micro.row', { min: fmt(v.min), target: fmt(v.target), max: fmt(v.max), u: unitLabel(x.unit) }) : t('micro.notSet')}</span></span></button>`;
    })}</div>`)}
    <${MicroSheet} item=${edit} goal=${edit && goals[edit.key]} onClose=${() => setEdit(null)}/>
  <//>`;
}

function MicroSheet({ item, goal, onClose }) {
  const { repos } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { if (item) setD({ min: goal && goal.min != null ? String(goal.min) : '', target: goal && goal.target != null ? String(goal.target) : '', max: goal && goal.max != null ? String(goal.max) : '' }); else setD(null); }, [item && item.key]);
  if (!item || !d) return null;
  const n = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));
  async function save() {
    await repos.microGoal.save({ id: item.key, min: n(d.min), target: n(d.target), max: n(d.max), unit: item.unit, auto: false });
    onClose();
  }
  return html`<${Sheet} open=${true} onClose=${onClose} title=${nutrientLabel(item.key)}>
    <div class="grid3">${[['min', t('micro.min')], ['target', t('micro.target')], ['max', t('micro.max')]].map(([k, l]) => html`<${Field} label=${l + ', ' + unitLabel(item.unit)}><input inputmode="decimal" value=${d[k]} onInput=${(e) => setD(Object.assign({}, d, { [k]: e.currentTarget.value }))}/><//>`)}</div>
    <div class="hint">${t('micro.editHint')}</div>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
  <//>`;
}
