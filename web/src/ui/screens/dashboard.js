/* «Сегодня»: что сейчас (идущая тренировка или план на сегодня), четыре плитки-двери (осталось калорий,
   вес, шаги, расход), неделя одной карточкой, ссылки на энергобаланс и историю, напоминание о резервной копии. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../core.js';
import { Card, List, Row } from '../kit.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtFix, fmtDate } from '../../i18n/index.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { workoutsBetween, stepsOn, weekStart, addDays } from '../../data/journal.js';
import { useWeight } from './body/body.js';
import { dayTotals } from '../../domain/nutrition.js';
import { ImportCard, backupDue, lastBackupAt } from './backup.js';
import { CheckinBanner } from './checkin.js';
import { dayBudget } from '../food/budget.js';
import { forecastGoalDate } from '../../domain/calc/index.js';
import { wdShort, useCatalog, fmtClock } from '../train/catalog.js';
import { suggestPlan, planItems, sortLogs, workoutSummary } from '../../domain/workout.js';
import { activeProgram, programWeekMods } from '../../domain/training-program.js';
import { startWorkout, sortPlans } from './train/train.js';
import { useNow } from '../train/timer.js';
import { isArtifact, lsGet, lsSet } from '../../services/env.js';

const HIT_SHARE = 0.95; /* день «закрыт», когда съедено не меньше 95 % цели */
const SNOOZE_KEY = 'journal.backupSnoozeUntil';

function Tile({ icon, color, label, value, unit, sub, href, link }) {
  return html`<button class="dtile" style=${'--cc:' + color} onClick=${() => navigate(href)}>
    <span class="dt-h"><span class="hci"><${Icon} name=${icon}/></span><span class="dt-l">${label}</span><${Icon} name="right" cls="chev"/></span>
    <span class="dt-v"><b>${value}</b>${unit ? html`<small>${unit}</small>` : null}</span>
    ${sub || link ? html`<span class="dt-s">${sub}${sub && link ? ' · ' : ''}${link ? html`<span class="lnk">${link} ›</span>` : null}</span>` : null}
  </button>`;
}

export function Dashboard() {
  const app = useApp();
  const { store, repos } = app;
  useData(['foodEntries', 'dayEntries', 'scaleEntries', 'dietProfile', 'workoutLogs', 'stepsEntries', 'profile', 'expenditureSettings', 'dayTargets', 'goals', 'workoutSessions', 'workoutPlans', 'workoutPrograms']);
  const today = todayYmd();
  const profile = repos.profile.get();
  const units = profile.units;
  const dp = repos.dietProfile.get();
  const tot = dayTotals(repos.foodEntry.byDate(today), repos.dayEntry.get(today));
  const budget = dayBudget(app, today);
  const target = budget.kcal || 0, eaten = tot.kcal || 0;
  const rawLeft = target - eaten, over = !!dp.showOverages && rawLeft < 0;
  const wt = useWeight();
  const wkAgo = wt.trend.filter((r) => r.date <= addDays(today, -7)).pop();
  const w = wt.last ? { weight: wt.last.trend, date: wt.last.date, change: wkAgo ? wt.last.trend - wkAgo.trend : null } : null;
  const steps = stepsOn(store, today), stepsY = stepsOn(store, addDays(today, -1));
  const energyUnit = t(unitKey('energy', units)), wu = t(unitKey('weight', units));
  const e = (kcal) => fmtNum(toDisplay('energy', kcal || 0, units));

  let wSub = null;
  if (w && w.change != null) {
    const ch = toDisplay('weight', w.change, units);
    wSub = t('dash.weight.change', { v: (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmtNum(Math.abs(ch), 1), u: wu });
  } else if (w) wSub = fmtDate(w.date);
  const b = budget.journal;
  const burn = b ? b.burned : target;
  const burnSub = b ? t('dash.burn.parts', { b: e(b.base), s: e(b.stepK), w: e(b.train + b.cardioNet) }) : budget.source === 'none' ? t('dash.burn.none') : t('dash.burn.program');

  return html`<div class="wrap page">
    <div class="top"><h1>${t('nav.dashboard')}</h1>
      <button class="small icn" aria-label=${t('more.history')} onClick=${() => navigate('/more/history')}><${Icon} name="cal" size=${18}/></button></div>
    <div class="hsub dsub">${fmtDate(today, 'long')}</div>
    <${ImportCard}/>
    <${BackupBanner} store=${store}/>
    <${CheckinBanner}/>
    ${!profile.onboardedAt ? html`<${Card} cls="welcome" title=${t('dash.setup.title')} icon="target" color="var(--k-plan)">
      <div class="hint" style="margin:0 0 12px">${t('dash.setup.text')}</div>
      <button class="primary" style="width:100%" onClick=${() => navigate('/onboarding')}>${t('dash.setup.go')}</button>
    <//>` : null}
    <${NowCard} today=${today}/>
    <div class="dgrid">
      <${Tile} icon="food" color="var(--k-food)" label=${target ? (over ? t('food.over') : t('food.left')) : t('dash.food')} value=${e(target ? Math.abs(over ? rawLeft : Math.max(0, rawLeft)) : eaten)} unit=${energyUnit}
        sub=${target ? t('dash.left.sub', { g: e(target), p: fmtNum(tot.protein || 0), pt: budget.protein ? fmtNum(budget.protein) : '—' }) : t('dash.food.empty')} href="/food"/>
      <${Tile} icon="scale" color="var(--k-body)" label=${t('dash.weight')} value=${w ? fmtFix(toDisplay('weight', w.weight, units), 1) : '—'}
        unit=${w ? wu : null} sub=${wSub || t('dash.weight.empty')} link=${t('dash.weigh')} href="/body?open=weigh"/>
      <${Tile} icon="steps" color="var(--k-steps)" label=${t('dash.steps')} value=${steps != null ? fmtNum(steps) : '—'}
        sub=${steps != null || stepsY != null ? (stepsY != null ? t('dash.steps.yesterday', { n: fmtNum(stepsY) }) : t('dash.steps.sub')) : t('dash.steps.empty')} href="/body"/>
      <${Tile} icon="flame" color="var(--k-burn)" label=${t('dash.burn')} value=${burn ? e(burn) : '—'} unit=${burn ? energyUnit : null} sub=${burnSub} href="/more/expenditure"/>
    </div>
    <${WeekCard} today=${today} wt=${wt} units=${units}/>
    <${List}>
      <${Row} icon="flame" color="var(--k-burn)" label=${t('dash.eb.title')} sub=${t('dash.eb.sub')} href="/more/expenditure"/>
      ${repos.macroProgram.active() ? html`<${Row} icon="target" color="var(--k-plan)" label=${t('ci.title')} sub=${t('dash.ci.sub')} href="/checkin"/>` : null}
      <${Row} icon="cal" color="#14B8A6" label=${t('more.history')} sub=${t('dash.history.sub')} href="/more/history"/>
    <//>
  </div>`;
}

/* ---------- что сейчас: идущая тренировка, план на сегодня или «сделано» ---------- */
function NowCard({ today }) {
  const app = useApp();
  const { repos } = app;
  const cat = useCatalog();
  const s = repos.workoutSession.get('current');
  const now = useNow(!!s, 1000);
  if (s) {
    const total = s.exercises.reduce((n, x) => n + (x.skipped ? 0 : x.sets.length), 0);
    const done = s.exercises.reduce((n, x) => n + x.sets.filter((y) => y.done).length, 0);
    return html`<button class="card pad wk-active" onClick=${() => navigate('/train/session')}>
      <div class="rl">${t('train.active')}</div>
      <div class="wk-today-h"><b>${s.name || t('train.session.untitled')}</b><span class="wk-clock"><${Icon} name="timer"/>${fmtClock((now - Date.parse(s.startedAt)) / 1000)}</span></div>
      <div class="hint">${t('train.session.progress', { done, total })}</div>
      <span class="primary wk-cont">${t('train.continue')}</span>
    </button>`;
  }
  const logs = repos.workout.list();
  const doneToday = sortLogs(logs.filter((x) => x.date === today));
  if (doneToday.length) {
    const sum = workoutSummary(doneToday[0]);
    return html`<button class="card pad wk-today" onClick=${() => navigate('/train')}>
      <div class="rl">${t('train.doneToday')}</div>
      <div class="wk-today-h"><b>${doneToday[0].name || t('train.session.untitled')}</b><span class="hint">${t('train.sum.sets', { count: sum.sets })}</span></div>
    </button>`;
  }
  const plans = sortPlans(repos.workoutPlan.list((p) => !p.archived));
  if (!plans.length) return null;
  const prog = activeProgram(repos.workoutProgram.list());
  const progPlans = prog ? plans.filter((p) => p.programId === prog.id) : [];
  const sug = suggestPlan(progPlans.length ? progPlans : plans, logs, today);
  if (!sug || sug.why === 'next') return null; /* сегодня не день тренировки — карточка не нужна */
  const pwk = prog && sug.plan.programId === prog.id ? programWeekMods(prog, today) : null;
  const items = planItems(sug.plan);
  const names = items.slice(0, 3).map((it) => (cat.byId[it.exerciseId] && !(it.alternatives && it.alternatives.length > 1) ? cat.byId[it.exerciseId].name : it.name)).filter(Boolean);
  const line = [pwk && !pwk.finished ? prog.name + ' · ' + t('prog.weekOf', { n: pwk.week + 1, total: pwk.weeks }) : null, names.join(', ') + (items.length > 3 ? ' +' + (items.length - 3) : '')].filter(Boolean).join(' · ');
  return html`<div class="card pad wk-today">
    <div class="rl">${sug.why === 'missed' ? t('dash.now.missed') : t('dash.now.plan')}</div>
    <div class="wk-today-h"><b>${sug.plan.name}</b></div>
    <div class="hint" style="margin:-4px 0 0">${line}</div>
    <div class="row">
      <button class="primary grow" disabled=${!cat.ready} onClick=${() => startWorkout(app, { plan: sug.plan, date: today, catalog: cat.byId })}>${t('train.start')}</button>
      <button onClick=${() => navigate('/train')}>${t('train.other')}</button>
    </div>
  </div>`;
}

/* ---------- неделя: калории по дням против цели, дни с белком, тренировки, тренд веса и срок цели ---------- */
function WeekCard({ today, wt, units }) {
  const app = useApp();
  const { repos, store } = app;
  const ws = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const rows = days.map((d) => {
    const tot = d <= today ? dayTotals(repos.foodEntry.byDate(d), repos.dayEntry.get(d)) : null;
    const b = dayBudget(app, d);
    return { d, kcal: tot ? tot.kcal || 0 : 0, protein: tot ? tot.protein || 0 : 0, tk: b.kcal || 0, tp: b.protein || 0 };
  });
  const fed = rows.filter((r) => r.kcal > 0);
  const workouts = workoutsBetween(store, ws, addDays(ws, 6)).length;
  const planned = repos.workoutPlan.list((p) => !p.archived && p.weekday != null).length;
  const g = repos.goal.active();
  let eta = null;
  if (g && g.type !== 'maintain' && g.targetWeightKg && wt.trend.length) {
    try { const f = forecastGoalDate(wt.trend, g.targetWeightKg); eta = f && (f.date || (typeof f === 'string' ? f : null)); } catch (e) { eta = null; }
  }
  const wkAgo = wt.trend.filter((r) => r.date <= addDays(today, -7)).pop();
  const dw = wt.last && wkAgo ? toDisplay('weight', wt.last.trend - wkAgo.trend, units) : null;
  const wu = t(unitKey('weight', units));
  if (!fed.length && !workouts) return null;
  const avg = fed.length ? Math.round(fed.reduce((a, r) => a + r.kcal, 0) / fed.length) : 0;
  const protDays = fed.filter((r) => r.tp && r.protein >= HIT_SHARE * r.tp).length;
  return html`<${Card} title=${t('dash.week.title')} icon="cal" color="var(--k-food)">
    <div class="wk-weekn">
      <div><b>${fmtNum(toDisplay('energy', avg, units))}</b><small>${t('dash.week.avg', { u: t(unitKey('energy', units)) })}</small></div>
      <div><b>${fed.some((r) => r.tp) ? protDays + ' / ' + fed.length : '—'}</b><small>${t('dash.week.protein')}</small></div>
      <div><b>${workouts}${planned ? ' / ' + planned : ''}</b><small>${t('dash.week.train')}</small></div>
    </div>
    <div class="nw-bars" style="--bc:var(--k-food)" role="img" aria-label=${t('dash.week.aria')}>${rows.map((r) => html`<i class=${r.tk && r.kcal >= HIT_SHARE * r.tk ? 'hit' : ''} style=${'height:' + (r.tk ? Math.min(1, r.kcal / r.tk) * 100 : r.kcal ? 60 : 0) + '%'}></i>`)}</div>
    <div class="nw-days7">${days.map((d, i) => html`<span class=${d === today ? 'on' : ''}>${wdShort(i)}</span>`)}</div>
    ${dw != null || eta || g ? html`<div class="hint">${[
      dw != null ? t('dash.week.trend', { v: (dw > 0 ? '+' : dw < 0 ? '−' : '') + fmtNum(Math.abs(dw), 1), u: wu }) : null,
      g && g.targetWeightKg && g.type !== 'maintain' ? t('dash.week.goal', { w: fmtFix(toDisplay('weight', g.targetWeightKg, units), 1), u: wu }) + (eta ? ' — ' + t('dash.week.eta', { d: fmtDate(eta, 'full') }) : '') : null
    ].filter(Boolean).join(' · ')}</div>` : null}
  <//>`;
}

/* ---------- напоминание о резервной копии: нет копии или старше недели; не в артефакте ---------- */
function BackupBanner({ store }) {
  const [snoozed, setSnoozed] = useState(() => Number(lsGet(SNOOZE_KEY) || 0) > Date.now());
  if (isArtifact() || snoozed || store.isEmpty()) return null;
  const last = lastBackupAt();
  if (!backupDue(last)) return null;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  return html`<div class="banner bk row">
    <span class="grow">${days == null ? t('dash.backup.none') : t('dash.backup.old', { count: days })}</span>
    <button class="small" onClick=${() => navigate('/more/backup')}>${t('dash.backup.go')}</button>
    <button class="small icn" aria-label=${t('dash.backup.later')} onClick=${() => { lsSet(SNOOZE_KEY, String(Date.now() + 7 * 86400000)); setSnoozed(true); }}>×</button>
  </div>`;
}
