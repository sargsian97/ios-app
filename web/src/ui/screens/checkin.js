/* Еженедельный чек-ин (спецификация, 1.3): модули по ситуации — введение, взвешивание, неполные дни,
   голодание, перерыв, обновление программы с объяснением. Настройки: день недели и модули. */
import { html, useApp, useData, useState, useMemo, navigate, todayYmd } from '../core.js';
import { Card, Field, Toggle, Page, List } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtFix, fmtSigned, fmtDate } from '../../i18n/index.js';
import { toDisplay, fromDisplay, unitKey } from '../../domain/units.js';
import { checkinDue, checkinModules } from '../../domain/checkin.js';
import { buildDays } from '../../domain/expenditure.js';
import { planTargets } from '../../domain/program.js';
import { addDays, CHECKIN_PARTIAL_SHARE } from '../../domain/calc/index.js';
import { CHECKIN_MODULES } from '../../data/models/nutrition.js';
import { computeExpenditure } from '../food/expenditure.js';
import { activeTargets, writeTargets } from './goal.js';
import { useWeight } from './body/body.js';

const WD = ['wd.0', 'wd.1', 'wd.2', 'wd.3', 'wd.4', 'wd.5', 'wd.6'];
const MOD_T = { intro: 'ci.m.intro', weighin: 'ci.m.weighin', partial: 'ci.m.partial', fasting: 'ci.m.fasting', break: 'ci.m.break', program: 'ci.m.program', notices: 'ci.m.notices' };

export function checkinState(repos, today = todayYmd()) {
  const program = repos.macroProgram.active();
  const last = repos.checkIn.list().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const dp = repos.dietProfile.get();
  return Object.assign({ last, program }, checkinDue({ lastCheckin: last && last.date, programStart: program && program.startDate, weekday: dp.checkInWeekday, today }));
}

export function CheckinBanner() {
  const { repos } = useApp();
  useData(['checkIns', 'macroPrograms', 'dietProfile']);
  const s = checkinState(repos);
  if (!s.due) return null;
  return html`<div class="card pad cibanner">
    <div class="row"><span class="hci" style="--cc:var(--k-plan)"><${Icon} name="cal"/></span><b class="grow">${t('ci.banner.title')}</b></div>
    <div class="hint" style="margin:6px 0 10px">${t('ci.banner.text')}</div>
    <button class="primary" style="width:100%" onClick=${() => navigate('/checkin')}>${t('ci.banner.go')}</button>
  </div>`;
}

export function Checkin() {
  const app = useApp();
  const { repos, store } = app;
  useData(['scaleEntries', 'foodEntries', 'dayEntries', 'macroPrograms', 'goals', 'dayTargets', 'checkInModules', 'profile']);
  const today = todayYmd();
  const units = repos.profile.get().units;
  const wu = t(unitKey('weight', units));
  const w = useWeight();
  const program = repos.macroProgram.active(), goal = repos.goal.active();
  const statuses = repos.moduleStatus.list().reduce((m, s) => { m[s.id] = s; return m; }, {});

  const plan = useMemo(() => {
    const days = buildDays({ foodEntries: repos.foodEntry.list(), dayEntries: repos.dayEntry.list(), from: addDays(today, -35), to: today });
    const enabled = {};
    CHECKIN_MODULES.forEach((id) => { enabled[id] = !statuses[id] || statuses[id].enabled !== false; });
    return Object.assign({ days }, checkinModules({ days, scaleEntries: repos.scaleEntry.list(), today, enabled, seenIntro: !!(statuses.intro && statuses.intro.seen), hasProgram: !!program }));
  }, []);
  const mods = plan.modules;
  const [step, setStep] = useState(0);
  const [weigh, setWeigh] = useState('');
  const [partial, setPartial] = useState(() => new Set((mods.find((m) => m.id === 'partial') || { dates: [] }).dates));
  const [fasting, setFasting] = useState(new Set());
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState(false);
  const kcalOf = (d) => (plan.days.find((x) => x.date === d) || { kcal: 0 }).kcal;

  /* обновление программы: считаем на текущих данных (после отметок пользователя данные пересчитаются при показе модуля) */
  const ex = computeExpenditure(app, today);
  const before = activeTargets(repos, today);
  let after = null, reason = null;
  const p = repos.profile.get();
  if (program && goal && w.last) {
    if (program.style === 'manual') reason = 'manual';
    else if (ex && ex.current && ex.current.status === 'hold') reason = 'hold';
    else if (ex && ex.current && ex.current.status === 'initial') reason = 'initial';
    else if (ex && ex.current) {
      try { after = planTargets({ tdee: Math.round(ex.current.tdee), goal: { type: goal.type, ratePctPerWeek: goal.ratePctPerWeek || 0 }, weightKg: w.last.trend, sex: p.sex, program }); } catch (e) { after = null; }
    }
  }
  const wkAgo = w.trend.filter((r) => r.date <= addDays(today, -7)).pop();
  const weekChange = w.last && wkAgo ? w.last.trend - wkAgo.trend : null;

  async function saveStep(m) {
    if (!m) return;
    if (m.id === 'weighin' && weigh) {
      const kg = fromDisplay('weight', weigh, units);
      if (kg >= 20 && kg <= 400) await repos.scaleEntry.create({ date: today, weightKg: Math.round(kg * 100) / 100, source: 'manual' });
    }
    if (m.id === 'partial') await store.batch(m.dates.map((d) => { const cur = repos.dayEntry.get(d); return repos.dayEntry.putOp(Object.assign({}, cur || { id: d }, { id: d, partial: partial.has(d) })); }));
    if (m.id === 'fasting' && fasting.size) await store.batch([...fasting].map((d) => { const cur = repos.dayEntry.get(d); return repos.dayEntry.putOp(Object.assign({}, cur || { id: d }, { id: d, fasting: true })); }));
  }

  async function finish() {
    setBusy(true);
    const now = new Date().toISOString();
    const ops = [];
    const applied = !!(after && apply);
    const prevCi = repos.checkIn.list().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    if (applied) await writeTargets(app, program, after.days, today);
    const sum = (arr) => (arr && arr.filter(Boolean).length ? Math.round(arr.filter(Boolean).reduce((a, d) => a + d.kcal, 0) / arr.filter(Boolean).length) : null);
    ops.push(repos.checkIn.putOp({
      date: today, weekStart: plan.from,
      modules: mods.map((m) => ({ id: m.id, status: 'done', decision: m.id === 'program' ? { applied, reason } : m.id === 'partial' ? [...partial] : m.id === 'fasting' ? [...fasting] : null })),
      tdeeBefore: prevCi ? prevCi.tdeeAfter : null, tdeeAfter: ex && ex.current ? Math.round(ex.current.tdee) : null,
      targetsBefore: { kcal: sum(before) }, targetsAfter: applied ? { kcal: after.daily.kcal } : { kcal: sum(before) }
    }));
    mods.forEach((m) => { const cur = statuses[m.id]; ops.push(repos.moduleStatus.putOp(Object.assign({}, cur || { id: m.id, enabled: true }, { id: m.id, seen: true, lastShownAt: now }))); });
    await store.batch(ops);
    navigate('/more/goal', { replace: true });
  }

  async function next() { await saveStep(mods[step]); if (step < mods.length) setStep(step + 1); window.scrollTo(0, 0); }

  const m = mods[step];
  let body;
  if (!mods.length) body = html`<h1>${t('ci.title')}</h1><p class="hint">${t('ci.nothing')}</p>`;
  else if (m.id === 'intro') body = html`<h1>${t('ci.intro.title')}</h1><p class="ob-p">${t('ci.intro.text')}</p><p class="hint">${t('ci.intro.text2')}</p>`;
  else if (m.id === 'weighin') body = html`<h1>${t('ci.weigh.title')}</h1>
    <div class="card pad">
      <div class="kv"><span>${t('ci.weigh.trend')}</span><span>${w.last ? fmtFix(toDisplay('weight', w.last.trend, units), 1) + ' ' + wu : '—'}</span></div>
      <div class="kv"><span>${t('ci.weigh.week')}</span><span>${weekChange == null ? '—' : (weekChange > 0 ? '+' : weekChange < 0 ? '−' : '') + fmtNum(Math.abs(toDisplay('weight', weekChange, units)), 2) + ' ' + wu}</span></div>
    </div>
    ${m.stale ? html`<p class="hint">${t('ci.weigh.stale')}</p><${Field} label=${t('body.weightIn', { u: wu })}><input class="bigin" inputmode="decimal" value=${weigh} onInput=${(e) => setWeigh(e.currentTarget.value)}/><//>` : html`<p class="hint">${t('ci.weigh.ok', { d: fmtDate(m.lastWeigh) })}</p>`}`;
  else if (m.id === 'partial') body = html`<h1>${t('ci.partial.title')}</h1><p class="hint">${t('ci.partial.text', { p: Math.round(CHECKIN_PARTIAL_SHARE * 100) })}</p>
    <div class="list">${m.dates.map((d) => html`<div class="lrow"><span class="ltext"><span class="ll">${fmtDate(d, 'long')}</span><span class="ls">${fmtNum(kcalOf(d))} ${t('unit.kcal')}</span></span>
      <button type="button" role="switch" aria-checked=${partial.has(d)} aria-label=${t('food.flag.partial')} class=${'sw' + (partial.has(d) ? ' on' : '')} onClick=${() => { const s = new Set(partial); if (s.has(d)) s.delete(d); else s.add(d); setPartial(s); }}><i></i></button></div>`)}</div>
    <div class="hint">${t('ci.partial.hint')}</div>`;
  else if (m.id === 'fasting') body = html`<h1>${t('ci.fasting.title')}</h1><p class="hint">${t('ci.fasting.text')}</p>
    <div class="list">${m.dates.map((d) => html`<div class="lrow"><span class="ltext"><span class="ll">${fmtDate(d, 'long')}</span><span class="ls">${fasting.has(d) ? t('ci.fasting.yes') : t('ci.fasting.no')}</span></span>
      <button type="button" role="switch" aria-checked=${fasting.has(d)} aria-label=${t('food.flag.fasting')} class=${'sw' + (fasting.has(d) ? ' on' : '')} onClick=${() => { const s = new Set(fasting); if (s.has(d)) s.delete(d); else s.add(d); setFasting(s); }}><i></i></button></div>`)}</div>`;
  else if (m.id === 'break') body = html`<h1>${t('ci.break.title')}</h1><p class="ob-p">${t('ci.break.text', { count: m.days })}</p>`;
  else if (m.id === 'program') body = html`<h1>${t('ci.program.title')}</h1>
    <div class="card pad">
      <div class="kv"><span>${t('ci.program.tdee')}</span><span>${ex && ex.current ? fmtNum(ex.current.tdee) + ' ' + t('unit.kcal') : '—'}</span></div>
      <div class="kv"><span>${t('ci.weigh.week')}</span><span>${weekChange == null ? '—' : (weekChange > 0 ? '+' : weekChange < 0 ? '−' : '') + fmtNum(Math.abs(toDisplay('weight', weekChange, units)), 2) + ' ' + wu}</span></div>
      ${goal ? html`<div class="kv"><span>${t('ci.program.goal')}</span><span>${goal.type === 'maintain' ? t('goal.maintain') : fmtNum(goal.ratePctPerWeek || 0, 2) + ' % / ' + t('ci.week')}</span></div>` : null}
      ${after ? html`<table class="ttab"><thead><tr><th></th><th>${t('ci.before')}</th><th>${t('ci.after')}</th><th>${t('food.macro.p')}</th><th>${t('food.macro.f')}</th><th>${t('food.macro.c')}</th></tr></thead>
        <tbody>${after.days.map((d, i) => html`<tr><td>${t(WD[i])}</td><td>${before[i] ? fmtNum(before[i].kcal) : '—'}</td><td><b>${fmtNum(d.kcal)}</b></td><td>${fmtNum(d.protein)}</td><td>${fmtNum(d.fat)}</td><td>${fmtNum(d.carbs)}</td></tr>`)}</tbody></table>
        <p class="hint">${explain(before, after, ex && ex.current ? Math.round(ex.current.tdee) : null, goal)}</p>` : html`<p class="hint">${reason ? t({ manual: 'ci.program.manual', hold: 'ci.program.hold', initial: 'ci.program.initial' }[reason]) : t('ci.program.noData')}</p>`}
    </div>
    ${after ? html`<${Toggle} on=${apply} onChange=${setApply} label=${t('ci.program.apply')} hint=${t('ci.program.applyHint')}/>` : null}`;

  const last = step >= mods.length - 1;
  return html`<div class="wrap onboarding">
    <div class="obbar"><button class="back" onClick=${() => (step ? setStep(step - 1) : navigate('/', { replace: true }))}><${Icon} name="left"/>${step ? t('common.back') : t('common.cancel')}</button>
      <div class="obprog"><i style=${'width:' + ((step + 1) / Math.max(1, mods.length) * 100) + '%'}></i></div>
      <span class="obn">${m ? t(MOD_T[m.id]) : ''}</span></div>
    ${body}
    <button class="primary obnext" disabled=${busy} onClick=${last || !mods.length ? async () => { await saveStep(m); await finish(); } : next}>${last || !mods.length ? t('ci.finish') : t('ob.next')}</button>
  </div>`;
}

/* Пояснение: из чего сложились новые калории и чем отличаются от прежних */
function explain(before, after, tdee, goal) {
  const k = after.daily.kcal;
  const parts = [];
  if (tdee) {
    const gap = tdee - k;
    if (goal && goal.type === 'maintain' || Math.abs(gap) < 20) parts.push(t('ci.program.fMaintain', { t: fmtNum(tdee), k: fmtNum(k) }));
    else parts.push(gap > 0 ? t('ci.program.fDeficit', { t: fmtNum(tdee), d: fmtNum(gap), k: fmtNum(k) }) : t('ci.program.fSurplus', { t: fmtNum(tdee), d: fmtNum(-gap), k: fmtNum(k) }));
  }
  if (after.daily.floored) parts.push(t('ob.warn.floored'));
  const b = before.filter(Boolean);
  if (b.length) {
    const avgB = Math.round(b.reduce((a, d) => a + d.kcal, 0) / b.length);
    parts.push(Math.abs(k - avgB) < 20 ? t('ci.program.same') : t('ci.program.vsBefore', { d: fmtSigned(k - avgB) }));
  }
  return parts.join(' ');
}

export function CheckinSettings() {
  const { repos, store } = useApp();
  useData(['dietProfile', 'checkInModules', 'checkIns', 'macroPrograms']);
  const dp = repos.dietProfile.get();
  const st = repos.moduleStatus.list().reduce((m, s) => { m[s.id] = s; return m; }, {});
  const s = checkinState(repos);
  const setMod = (id, on) => repos.moduleStatus.save(Object.assign({}, st[id] || { id }, { id, enabled: on }));
  const history = repos.checkIn.list().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return html`<${Page} title=${t('ci.settings')} back="/more/goal" backLabel=${t('goal.title')}>
    <${Card} title=${t('ci.day')} icon="cal" color="var(--k-plan)">
      <div class="chips">${WD.map((k, i) => html`<button class=${'chip' + (dp.checkInWeekday === i ? ' on' : '')} onClick=${() => repos.dietProfile.update({ checkInWeekday: i })}>${t(k)}</button>`)}</div>
      <div class="hint">${s.next ? t('ci.next', { d: fmtDate(s.next, 'long') }) : t('ci.noProgram')}</div>
      ${s.program ? html`<button class="small" style="margin-top:10px" onClick=${() => navigate('/checkin')}>${t('ci.now')}</button>` : null}
    <//>
    <${Card} title=${t('ci.modules')} icon="list" color="#14B8A6">
      ${CHECKIN_MODULES.filter((id) => id !== 'notices').map((id) => html`<div style="margin-bottom:12px"><${Toggle} on=${!st[id] || st[id].enabled !== false} onChange=${(v) => setMod(id, v)} label=${t(MOD_T[id])}/></div>`)}
    <//>
    ${history.length ? html`<${List} title=${t('ci.history')}>${history.map((c) => html`<div class="lrow"><span class="ltext"><span class="ll">${fmtDate(c.date, 'full')}</span>
      <span class="ls">${c.tdeeAfter ? t('ci.hist.tdee', { k: fmtNum(c.tdeeAfter) }) : ''}${c.targetsAfter && c.targetsAfter.kcal ? ' · ' + t('ci.hist.kcal', { k: fmtNum(c.targetsAfter.kcal) }) : ''}</span></span></div>`)}<//>` : null}
  <//>`;
}
