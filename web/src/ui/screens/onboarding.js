/* Онбординг (спецификация, 1.1): о себе → тело → история веса → активность → тренировки →
   стартовая оценка расхода → цель → программа → итог с целями на дни и согласием. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../core.js';
import { Segmented, Field } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../i18n/index.js';
import { toDisplay, fromDisplay, unitKey } from '../../domain/units.js';
import { startingEstimate, targetDate, planTargets, dayTargetDocs, microGoalDocs } from '../../domain/program.js';
import { microGoals, GOAL_RATES, GOAL_RATE_DEFAULT, ageOn } from '../../domain/calc/index.js';
import { useWeight } from './body/body.js';
import { Opt, DietOptions, ProteinOptions } from './program-options.js';
import { validDate } from '../../data/schema.js';
const WARN = { floored: 'ob.warn.floored', limit_min: 'ob.warn.limit_min', limit_max: 'ob.warn.limit_max', protein_min: 'ob.warn.protein_min', protein_exceeds_kcal: 'ob.warn.protein_exceeds_kcal' };
const METHOD = { mifflin: 'ob.m.mifflin', cunningham: 'ob.m.cunningham', allometric: 'ob.m.allometric', bodycomp: 'ob.m.bodycomp', athlete: 'ob.m.athlete' };
const WHY = { mifflin: 'ob.estimate.whyM', cunningham: 'ob.estimate.whyC', allometric: 'ob.estimate.whyA', bodycomp: 'ob.estimate.whyB', athlete: 'ob.estimate.whyT' };
export function methodLabel(m) { return METHOD[m] ? t(METHOD[m]) : m; }
function methodWhy(m) { return WHY[m] ? t(WHY[m]) : ''; }
export function warnLabel(w) { return WARN[w] ? t(WARN[w]) : w; }

const STEPS = ['intro', 'about', 'body', 'history', 'activity', 'training', 'estimate', 'goal', 'program', 'summary'];
const FAT = {
  male: [[10, 'ob.fat.m1'], [15, 'ob.fat.m2'], [20, 'ob.fat.m3'], [25, 'ob.fat.m4'], [31, 'ob.fat.m5'], [37, 'ob.fat.m6']],
  female: [[17, 'ob.fat.f1'], [22, 'ob.fat.f2'], [27, 'ob.fat.f3'], [32, 'ob.fat.f4'], [37, 'ob.fat.f5'], [43, 'ob.fat.f6']]
};
const WD = ['wd.0', 'wd.1', 'wd.2', 'wd.3', 'wd.4', 'wd.5', 'wd.6'];


export function Onboarding() {
  const app = useApp();
  const { repos, store } = app;
  useData(['profile', 'dietProfile', 'scaleEntries', 'goals', 'macroPrograms']);
  const today = todayYmd();
  const profile = repos.profile.get(), dp = repos.dietProfile.get();
  const units = profile.units;
  const w = useWeight();
  const goal0 = repos.goal.active(), prog0 = repos.macroProgram.active();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [a, setA] = useState(() => ({
    sex: profile.sex, birthDate: profile.birthDate || '', height: profile.heightCm ? fmtNum(toDisplay('length', profile.heightCm, units), 1).replace(/\s/g, '') : '',
    weight: w.last ? fmtFix(toDisplay('weight', w.last.trend, units), 1).replace(/\s/g, '') : '',
    fatMode: dp.bodyFatPct != null ? 'exact' : 'unknown', fat: dp.bodyFatPct != null ? String(dp.bodyFatPct) : '',
    maxWeight: dp.maxWeightKg ? fmtNum(toDisplay('weight', dp.maxWeightKg, units), 1).replace(/\s/g, '') : '', recentTrend: dp.recentTrend || 'stable',
    activity: dp.activity || 'moderate', trainingPerWeek: dp.trainingPerWeek ?? 3, cardio: dp.cardioExperience || 'lt1', strength: dp.strengthExperience || '1to4', athlete: dp.athlete || 'amateur',
    goalType: goal0 ? goal0.type : 'lose', target: goal0 && goal0.targetWeightKg ? fmtNum(toDisplay('weight', goal0.targetWeightKg, units), 1).replace(/\s/g, '') : '',
    rate: goal0 && goal0.ratePctPerWeek ? goal0.ratePctPerWeek : GOAL_RATE_DEFAULT.lose, forecast: goal0 ? goal0.forecast : 'data',
    style: prog0 ? prog0.style : 'coached', dietType: prog0 ? prog0.dietType : 'balanced', proteinLevel: prog0 ? prog0.proteinLevel : 'high',
    distribution: prog0 ? prog0.distribution : 'even', highDays: prog0 ? prog0.highDays.slice() : [5, 6], floor: prog0 ? prog0.floor : 'standard',
    kcalMin: '', kcalMax: '', proteinMin: '', mKcal: '', mProtein: '', mFat: '', mCarbs: '', consent: !!(profile.consents && profile.consents.medical)
  }));
  const set = (patch) => { setErr(''); setA(Object.assign({}, a, patch)); };
  const wu = t(unitKey('weight', units)), lu = t(unitKey('length', units));
  const n = (v) => { if (v === '' || v == null) return null; const x = Number(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

  /* производные значения */
  const heightCm = fromDisplay('length', a.height, units);
  const weightKg = fromDisplay('weight', a.weight, units);
  const fatPct = a.fatMode === 'unknown' ? null : n(a.fat);
  const ageOk = validDate(a.birthDate) && a.birthDate <= today;
  const age = ageOk ? ageOn(a.birthDate, today) : null;
  let est = null;
  try { if (a.sex && ageOk && heightCm && weightKg) est = startingEstimate({ sex: a.sex, birthDate: a.birthDate, heightCm, weightKg, bodyFatPct: fatPct, activity: a.activity, today, version: repos.dietProfile.get().bmrVersion || 'v2', goalRatePct: a.goalType === 'lose' ? -(a.rate || 0) : a.goalType === 'gain' ? (a.rate || 0) : 0 }); } catch (e) { est = null; }
  const targetKg = a.goalType === 'maintain' ? (n(a.target) != null ? fromDisplay('weight', a.target, units) : weightKg) : fromDisplay('weight', a.target, units);
  const rate = a.goalType === 'maintain' ? 0 : a.rate;
  const goal = { type: a.goalType, ratePctPerWeek: rate };
  const program = { style: a.style, dietType: a.dietType, proteinLevel: a.proteinLevel, distribution: a.distribution, highDays: a.highDays, floor: a.floor, carbsAsRemainder: true,
    limits: { kcalMin: n(a.kcalMin), kcalMax: n(a.kcalMax), proteinMin: n(a.proteinMin) } };
  const manual = { sameEveryDay: true, days: [{ kcal: n(a.mKcal), protein: n(a.mProtein), fat: n(a.mFat), carbs: n(a.mCarbs) }] };
  let plan = null;
  try { if (est) plan = planTargets({ tdee: est.tdee, goal: Object.assign({ targetWeightKg: targetKg }, goal), weightKg, sex: a.sex, leanMassKg: est.leanMassKg, program, manual, version: repos.dietProfile.get().tdeeVersion || 'v2' }); } catch (e) { plan = null; }
  const tDate = a.goalType !== 'maintain' && targetKg ? targetDate({ startKg: weightKg, targetKg, ratePctPerWeek: rate, start: today }) : null;

  function validate() {
    const s = STEPS[step];
    if (s === 'about') {
      if (!a.sex) return t('ob.err.sex');
      if (!ageOk) return t('ob.err.birth');
      if (age < 18) return t('ob.err.adult');
      if (!(heightCm >= 120 && heightCm <= 250)) return t('ob.err.height');
    }
    if (s === 'body') {
      if (!(weightKg >= 30 && weightKg <= 300)) return t('ob.err.weight');
      if (a.fatMode !== 'unknown' && !(fatPct >= 3 && fatPct <= 60)) return t('ob.err.fat');
    }
    if (s === 'goal' && a.goalType !== 'maintain') {
      if (!(targetKg >= 30 && targetKg <= 300)) return t('ob.err.target');
      if (a.goalType === 'lose' && targetKg >= weightKg) return t('ob.err.loseTarget');
      if (a.goalType === 'gain' && targetKg <= weightKg) return t('ob.err.gainTarget');
    }
    if (s === 'program' && a.style === 'manual' && !(n(a.mKcal) > 0 || (n(a.mProtein) && n(a.mFat) && n(a.mCarbs)))) return t('ob.err.manual');
    if (s === 'summary' && !a.consent) return t('ob.err.consent');
    return '';
  }
  function next() { const e = validate(); if (e) { setErr(e); return; } if (step < STEPS.length - 1) { setStep(step + 1); window.scrollTo(0, 0); } else finish(); }
  function back() { if (step > 0) { setStep(step - 1); setErr(''); window.scrollTo(0, 0); } else navigate('/', { replace: true }); }

  async function finish() {
    const now = new Date().toISOString();
    const ops = [];
    ops.push(repos.profile.putOp({ sex: a.sex, birthDate: a.birthDate, heightCm: Math.round(heightCm * 10) / 10, onboardedAt: now, consents: { medical: now } }));
    ops.push(repos.dietProfile.putOp({ bodyFatPct: fatPct, maxWeightKg: fromDisplay('weight', a.maxWeight, units), recentTrend: a.recentTrend, activity: a.activity, trainingPerWeek: a.trainingPerWeek, cardioExperience: a.cardio, strengthExperience: a.strength, athlete: a.athlete }));
    const lastW = w.daily[w.daily.length - 1];
    if (!lastW || lastW.date !== today || Math.abs(lastW.weightKg - weightKg) > 0.05) {
      ops.push(repos.scaleEntry.putOp({ date: today, weightKg: Math.round(weightKg * 100) / 100, bodyFatPct: fatPct, source: 'manual' }));
    }
    repos.goal.list((g) => g.status === 'active').forEach((g) => ops.push(repos.goal.putOp(Object.assign({}, g, { status: 'archived' }))));
    ops.push(repos.goal.putOp({ type: a.goalType, startWeightKg: Math.round(weightKg * 10) / 10, targetWeightKg: targetKg ? Math.round(targetKg * 10) / 10 : null, ratePctPerWeek: rate, startDate: today, targetDate: tDate, forecast: a.forecast, status: 'active' }));
    repos.macroProgram.list((p) => p.active).forEach((p) => ops.push(repos.macroProgram.putOp(Object.assign({}, p, { active: false }))));
    const progOp = repos.macroProgram.putOp(Object.assign({}, program, { startDate: today, active: true, sameEveryDay: true }));
    ops.push(progOp);
    dayTargetDocs(plan.days, { programId: progOp.id, validFrom: today }).forEach((d) => ops.push(repos.dayTarget.putOp(d)));
    const existing = repos.microGoal.list().reduce((m, g) => { m[g.id] = g; return m; }, {});
    try { microGoalDocs(microGoals({ sex: a.sex, ageYears: age, kcal: plan.daily.kcal }), existing).forEach((g) => ops.push(repos.microGoal.putOp(g))); } catch (e) { /* без микронорм */ }
    await store.batch(ops);
    navigate('/food', { replace: true });
  }

  const s = STEPS[step];
  const ratesFor = a.goalType === 'gain' ? GOAL_RATES.gain : GOAL_RATES.lose;
  let body;
  if (s === 'intro') body = html`<div class="obhero"><div class="obicon"><${Icon} name="target" size=${40}/></div><h1>${t('ob.intro.title')}</h1><p>${t('ob.intro.text')}</p><p class="hint">${t('ob.intro.time')}</p></div>`;
  if (s === 'about') body = html`<h1>${t('ob.about.title')}</h1>
    <div class="optlist">${[['male', t('profile.sex.male')], ['female', t('profile.sex.female')]].map(([v, l]) => html`<${Opt} on=${a.sex === v} title=${l} onClick=${() => set({ sex: v })}/>`)}</div>
    <div class="grid2" style="margin-top:14px">
      <${Field} label=${t('profile.birth')} hint=${age != null ? t('profile.age', { count: age }) : null}><input type="date" value=${a.birthDate} max=${today} onChange=${(e) => set({ birthDate: e.currentTarget.value })}/><//>
      <${Field} label=${t('ob.height', { u: lu })}><input inputmode="decimal" value=${a.height} onInput=${(e) => set({ height: e.currentTarget.value })}/><//>
    </div>`;
  if (s === 'body') body = html`<h1>${t('ob.body.title')}</h1>
    <${Field} label=${t('ob.weight', { u: wu })} hint=${w.last ? t('ob.weight.trend') : null}><input class="bigin" inputmode="decimal" value=${a.weight} onInput=${(e) => set({ weight: e.currentTarget.value })}/><//>
    <div class="ltitle" style="margin-left:0">${t('ob.fat.title')}</div>
    <${Segmented} value=${a.fatMode} onChange=${(v) => set({ fatMode: v })} options=${[['unknown', t('ob.fat.unknown')], ['visual', t('ob.fat.visual')], ['exact', t('ob.fat.exact')]]}/>
    ${a.fatMode === 'visual' && a.sex ? html`<div class="optlist" style="margin-top:12px">${FAT[a.sex].map(([v, k]) => html`<${Opt} on=${n(a.fat) === v} title=${'≈ ' + v + ' %'} sub=${t(k)} onClick=${() => set({ fat: String(v) })}/>`)}</div>` : null}
    ${a.fatMode === 'exact' ? html`<div style="margin-top:12px"><${Field} label=${t('body.fatPct')}><input inputmode="decimal" value=${a.fat} onInput=${(e) => set({ fat: e.currentTarget.value })}/><//></div>` : null}
    <div class="hint">${t('ob.fat.hint')}</div>`;
  if (s === 'history') body = html`<h1>${t('ob.history.title')}</h1>
    <${Field} label=${t('ob.maxWeight', { u: wu })} hint=${t('ob.maxWeight.hint')}><input inputmode="decimal" value=${a.maxWeight} onInput=${(e) => set({ maxWeight: e.currentTarget.value })}/><//>
    <div class="ltitle" style="margin-left:0">${t('ob.recent')}</div>
    <div class="optlist">${[['losing', 'ob.recent.losing'], ['stable', 'ob.recent.stable'], ['gaining', 'ob.recent.gaining']].map(([v, k]) => html`<${Opt} on=${a.recentTrend === v} title=${t(k)} onClick=${() => set({ recentTrend: v })}/>`)}</div>`;
  if (s === 'activity') body = html`<h1>${t('ob.activity.title')}</h1><p class="hint">${t('ob.activity.text')}</p>
    <div class="optlist">${[['sedentary', 'ob.act.sedentary', 'ob.act.sedentary.sub'], ['moderate', 'ob.act.moderate', 'ob.act.moderate.sub'], ['very_active', 'ob.act.very', 'ob.act.very.sub']].map(([v, k, sub]) => html`<${Opt} on=${a.activity === v} title=${t(k)} sub=${t(sub)} onClick=${() => set({ activity: v })}/>`)}</div>`;
  if (s === 'training') body = html`<h1>${t('ob.training.title')}</h1>
    <div class="ltitle" style="margin-left:0">${t('ob.perWeek')}</div>
    <div class="stepper row"><button class="ghost" onClick=${() => set({ trainingPerWeek: Math.max(0, a.trainingPerWeek - 1) })}>−</button><b class="grow">${a.trainingPerWeek}</b><button class="ghost" onClick=${() => set({ trainingPerWeek: Math.min(14, a.trainingPerWeek + 1) })}>+</button></div>
    <${Segmented} label=${t('ob.cardioExp')} value=${a.cardio} onChange=${(v) => set({ cardio: v })} options=${[['lt1', t('ob.exp.lt1')], ['1to4', t('ob.exp.1to4')], ['gt4', t('ob.exp.gt4')]]}/>
    <${Segmented} label=${t('ob.strengthExp')} value=${a.strength} onChange=${(v) => set({ strength: v })} options=${[['lt1', t('ob.exp.lt1')], ['1to4', t('ob.exp.1to4')], ['gt4', t('ob.exp.gt4')]]}/>
    <${Segmented} label=${t('ob.athlete')} value=${a.athlete} onChange=${(v) => set({ athlete: v })} options=${[['amateur', t('ob.amateur')], ['pro', t('ob.pro')]]}/>`;
  if (s === 'estimate') body = html`<h1>${t('ob.estimate.title')}</h1>
    ${est ? html`<div class="card pad obest">
      <div class="rl">${t('ob.estimate.tdee')}</div><div class="wh-v"><b>${fmtNum(est.tdee)}</b><small>${t('unit.kcal')}</small></div>
      <div class="kv"><span>${t('ob.estimate.bmr', { m: methodLabel(est.bmr.method) })}</span><span>${fmtNum(est.bmr.kcal)}</span></div>
      <div class="kv"><span>${t('ob.estimate.factor')}</span><span>× ${fmtNum(est.factor, 2)}</span></div>
      <div class="hint">${methodWhy(est.bmr.method)}</div>
      <div class="hint">${t('ob.estimate.adapt')}</div>
    </div>` : html`<div class="banner warnb">${t('ob.estimate.need')}</div>`}`;
  if (s === 'goal') body = html`<h1>${t('ob.goal.title')}</h1>
    <div class="optlist">${[['lose', 'goal.lose'], ['maintain', 'goal.maintain'], ['gain', 'goal.gain']].map(([v, k]) => html`<${Opt} on=${a.goalType === v} title=${t(k)} onClick=${() => set({ goalType: v, rate: GOAL_RATE_DEFAULT[v] })}/>`)}</div>
    <div style="margin-top:14px"><${Field} label=${a.goalType === 'maintain' ? t('ob.goal.around', { u: wu }) : t('body.targetWeight', { u: wu })}><input class="bigin" inputmode="decimal" placeholder=${a.weight} value=${a.target} onInput=${(e) => set({ target: e.currentTarget.value })}/><//></div>
    ${a.goalType !== 'maintain' ? html`<div class="ltitle" style="margin-left:0">${t('ob.goal.rate')}</div>
      <div class="optlist">${ratesFor.map((r) => html`<${Opt} on=${a.rate === r} title=${t('ob.goal.ratePct', { r: fmtNum(r, 2) })} sub=${weightKg ? t('ob.goal.rateKg', { v: fmtNum(toDisplay('weight', weightKg * r / 100, units), 2), u: wu }) : ''} onClick=${() => set({ rate: r })}/>`)}</div>
      ${tDate ? html`<div class="banner forecast">${t('ob.goal.date', { d: fmtDate(tDate, 'full') })}</div>` : null}` : null}
    <${Segmented} label=${t('ob.goal.forecast')} value=${a.forecast} onChange=${(v) => set({ forecast: v })} options=${[['data', t('ob.fc.data')], ['goal', t('ob.fc.goal')], ['mixed', t('ob.fc.mixed')]]}/>`;
  if (s === 'program') body = html`<h1>${t('ob.program.title')}</h1>
    <div class="optlist">${[['coached', 'ob.style.coached', 'ob.style.coached.sub'], ['collaborative', 'ob.style.collab', 'ob.style.collab.sub'], ['manual', 'ob.style.manual', 'ob.style.manual.sub']].map(([v, k, sub]) => html`<${Opt} on=${a.style === v} title=${t(k)} sub=${t(sub)} onClick=${() => set({ style: v })}/>`)}</div>
    ${a.style !== 'manual' ? html`
      <${DietOptions} value=${a.dietType} onChange=${(v) => set({ dietType: v })}/>
      <${ProteinOptions} value=${a.proteinLevel} onChange=${(v) => set({ proteinLevel: v })}/>
      <${Segmented} label=${t('ob.distribution')} value=${a.distribution} onChange=${(v) => set({ distribution: v })} options=${[['even', t('ob.dist.even')], ['high_days', t('ob.dist.high')]]}/>
      ${a.distribution === 'high_days' ? html`<div class="chips" style="margin-top:10px">${WD.map((k, i) => html`<button class=${'chip' + (a.highDays.includes(i) ? ' on' : '')} onClick=${() => set({ highDays: a.highDays.includes(i) ? a.highDays.filter((x) => x !== i) : a.highDays.concat([i]).sort() })}>${t(k)}</button>`)}</div>` : null}
      <${Segmented} label=${t('ob.floor')} value=${a.floor} onChange=${(v) => set({ floor: v })} options=${[['standard', t('ob.floor.standard')], ['low', t('ob.floor.low')], ['ignore', t('ob.floor.ignore')]]}/>
      ${a.style === 'collaborative' ? html`<div class="grid3" style="margin-top:14px">
        <${Field} label=${t('ob.lim.kcalMin')}><input inputmode="numeric" value=${a.kcalMin} onInput=${(e) => set({ kcalMin: e.currentTarget.value })}/><//>
        <${Field} label=${t('ob.lim.kcalMax')}><input inputmode="numeric" value=${a.kcalMax} onInput=${(e) => set({ kcalMax: e.currentTarget.value })}/><//>
        <${Field} label=${t('ob.lim.proteinMin')}><input inputmode="numeric" value=${a.proteinMin} onInput=${(e) => set({ proteinMin: e.currentTarget.value })}/><//>
      </div>` : null}` : html`<div class="grid2" style="margin-top:14px">
        <${Field} label=${t('food.n.kcal')}><input inputmode="numeric" value=${a.mKcal} onInput=${(e) => set({ mKcal: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.n.protein')}><input inputmode="numeric" value=${a.mProtein} onInput=${(e) => set({ mProtein: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.n.fat')}><input inputmode="numeric" value=${a.mFat} onInput=${(e) => set({ mFat: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.n.carbs')}><input inputmode="numeric" value=${a.mCarbs} onInput=${(e) => set({ mCarbs: e.currentTarget.value })}/><//>
      </div><div class="hint">${t('ob.manual.hint')}</div>`}`;
  if (s === 'summary') body = html`<h1>${t('ob.summary.title')}</h1>
    ${plan ? html`<div class="card pad">
      <div class="rl">${t('ob.summary.kcal')}</div><div class="wh-v"><b>${fmtNum(plan.daily.kcal)}</b><small>${t('unit.kcal')}</small></div>
      <div class="hint" style="margin-top:2px">${t('ob.summary.vs', { t: fmtNum(est.tdee) })}</div>
      <table class="ttab"><thead><tr><th></th><th>${t('food.goal')}</th><th>${t('food.macro.p')}</th><th>${t('food.macro.f')}</th><th>${t('food.macro.c')}</th></tr></thead>
        <tbody>${plan.days.map((d) => html`<tr><td>${t(WD[d.weekday])}</td><td>${fmtNum(d.kcal)}</td><td>${fmtNum(d.protein)}</td><td>${fmtNum(d.fat)}</td><td>${fmtNum(d.carbs)}</td></tr>`)}</tbody></table>
      ${plan.warnings.map((wn) => html`<div class="hint warn">${warnLabel(wn)}</div>`)}
    </div>` : html`<div class="banner warnb">${t('ob.estimate.need')}</div>`}
    <div class="card pad disclaimer"><b>${t('ob.disclaimer.title')}</b><p>${t('ob.disclaimer.text')}</p>
      <label class="row consent"><input type="checkbox" checked=${a.consent} onChange=${(e) => set({ consent: e.currentTarget.checked })}/><span>${t('ob.disclaimer.agree')}</span></label></div>
    <div class="hint">${t('ob.summary.health')}</div>`;

  return html`<div class="wrap onboarding">
    <div class="obbar"><button class="back" onClick=${back}><${Icon} name="left"/>${step ? t('common.back') : t('common.cancel')}</button>
      <div class="obprog"><i style=${'width:' + ((step + 1) / STEPS.length * 100) + '%'}></i></div><span class="obn">${step + 1}/${STEPS.length}</span></div>
    ${body}
    ${err ? html`<div class="banner warnb" style="margin-top:12px">${err}</div>` : null}
    <button class="primary obnext" onClick=${next}>${step === STEPS.length - 1 ? t('ob.finish') : step === 0 ? t('ob.start') : t('ob.next')}</button>
  </div>`;
}
