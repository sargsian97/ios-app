/* «Сегодня»: питание (дуга остатка, съедено / цель / расход, БЖУ), что сейчас (идущая тренировка или план с картой мышц),
   четыре плитки-двери (вес, шаги, расход, тренировки недели), неделя одной карточкой, ссылки на энергобаланс и историю,
   напоминание о резервной копии. */
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
import { suggestPlan, planItems, sortLogs, workoutSummary, previousSets } from '../../domain/workout.js';
import { activeProgram, programWeekMods } from '../../domain/training-program.js';
import { startWorkout, sortPlans } from './train/train.js';
import { useNow } from '../train/timer.js';
import { isArtifact, lsGet, lsSet } from '../../services/env.js';
import { Arc, Spark } from '../viz.js';
import { MuscleMap } from '../train/muscle-map.js';

const HIT_SHARE = 0.95; /* день «закрыт», когда съедено не меньше 95 % цели */
const SNOOZE_KEY = 'journal.backupSnoozeUntil';

/* Плитка-дверь: значение, маленький график (viz) и подпись; цвет подписи — --tc */
function Tile({ icon, color, tc, label, value, unit, sub, href, link, viz }) {
  return html`<button class="dtile" style=${'--cc:' + color + ';--tc:' + tc} onClick=${() => navigate(href)}>
    <span class="dt-h"><${Icon} name=${icon} cls="dt-i"/><span class="dt-l">${label}</span></span>
    <span class="dt-v"><b>${value}</b>${unit ? html`<small>${unit}</small>` : null}</span>
    ${viz ? html`<span class="dt-viz">${viz}</span>` : null}
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
  const over = !!dp.showOverages && target - eaten < 0;
  const wt = useWeight();
  const wkAgo = wt.trend.filter((r) => r.date <= addDays(today, -7)).pop();
  const w = wt.last ? { weight: wt.last.trend, date: wt.last.date, change: wkAgo ? wt.last.trend - wkAgo.trend : null } : null;
  const energyUnit = t(unitKey('energy', units)), wu = t(unitKey('weight', units));
  const e = (kcal) => fmtNum(toDisplay('energy', kcal || 0, units));
  const dw = (kg) => fmtFix(toDisplay('weight', kg, units), 1);

  /* вес: тренд и взвешивания за 14 дней до последнего взвешивания, подпись — до цели или изменение за неделю */
  const from = addDays(wt.last ? wt.last.date : today, -13);
  const dayX = (d) => Math.round((Date.parse(d) - Date.parse(from)) / 86400000) / 13;
  const line = wt.trend.filter((r) => r.date >= from).map((r) => ({ x: dayX(r.date), y: r.trend }));
  const dots = wt.daily.filter((r) => r.date >= from).map((r) => ({ x: dayX(r.date), y: r.weightKg }));
  const g = repos.goal.active();
  let wSub = null;
  if (w && g && g.targetWeightKg && g.type !== 'maintain') {
    const rest = g.type === 'gain' ? g.targetWeightKg - w.weight : w.weight - g.targetWeightKg;
    wSub = rest > 0.05 ? t('dash.weight.goal', { w: dw(g.targetWeightKg), u: wu, d: dw(rest) }) : t('dash.weight.goalOnly', { w: dw(g.targetWeightKg), u: wu });
  } else if (w && w.change != null) {
    const ch = toDisplay('weight', w.change, units);
    wSub = t('dash.weight.change', { v: (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmtNum(Math.abs(ch), 1), u: wu });
  } else if (w) wSub = fmtDate(w.date);
  const weighedToday = wt.daily.some((r) => r.date === today);

  /* шаги: 7 дней до сегодня; если сегодня ещё нет — показываем вчера */
  const sDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const sVals = sDays.map((d) => stepsOn(store, d));
  const showY = sVals[6] == null && sVals[5] != null;
  const shown = showY ? 5 : 6;
  const sMax = Math.max(1, ...sVals.map((v) => v || 0));
  const stepsSub = sVals[6] != null ? (sVals[5] != null ? t('dash.steps.yesterday', { n: fmtNum(sVals[5]) }) : t('dash.steps.sub')) : showY ? t('dash.steps.yday') : t('dash.steps.empty');

  /* расход: база, шаги и тренировки */
  const b = budget.journal;
  const burn = b ? b.burned : target;
  const burnSub = b ? t('dash.burn.parts', { b: e(b.base), s: e(b.stepK), w: e(b.train + b.cardioNet) }) : budget.source === 'none' ? t('dash.burn.none') : t('dash.burn.program');
  const parts = b ? [['var(--k-burn)', b.base], ['var(--c-steps)', b.stepK], ['var(--k-str)', b.train + b.cardioNet]] : null;

  /* тренировки недели: сделано из запланированных, объём */
  const ws = weekStart(today);
  const week = workoutsBetween(store, ws, addDays(ws, 6));
  const planned = repos.workoutPlan.list((p) => !p.archived && p.weekday != null).length;
  const vol = week.reduce((a, x) => a + workoutSummary(x).volumeKg, 0);
  const caps = Math.max(planned, week.length);

  return html`<div class="wrap page">
    <div class="dhead">
      <div class="dh-t"><span class="dh-date">${fmtDate(today, 'long')}</span><h1>${t('nav.dashboard')}</h1></div>
      <button class="ghost" aria-label=${t('more.history')} onClick=${() => navigate('/more/history')}><${Icon} name="cal"/></button>
    </div>
    <${ImportCard}/>
    <${BackupBanner} store=${store}/>
    <${CheckinBanner}/>
    ${!profile.onboardedAt ? html`<${Card} cls="welcome" title=${t('dash.setup.title')} icon="target" color="var(--k-plan)">
      <div class="hint" style="margin:0 0 12px">${t('dash.setup.text')}</div>
      <button class="primary" style="width:100%" onClick=${() => navigate('/onboarding')}>${t('dash.setup.go')}</button>
    <//>` : null}
    <section class="card tfood">
      <div class="tc-h"><span class="hci" style="--cc:var(--k-food)"><${Icon} name="food"/></span><b>${t('nav.food')}</b>
        <button class="tc-link" onClick=${() => navigate('/food')}>${t('dash.food.diary')}<${Icon} name="right"/></button></div>
      <div class="tf-main">
        <${Arc} share=${target ? eaten / target : 0} over=${over} label=${t('dash.ring.aria', { e: e(eaten), g: target ? e(target) : '—', u: energyUnit })}>
          <b class="arc-n">${e(target ? Math.abs(over ? target - eaten : Math.max(0, target - eaten)) : eaten)}</b>
          <span class="arc-l">${t(!target ? 'dash.ring.eaten' : over ? 'dash.ring.over' : 'dash.ring.left', { u: energyUnit })}</span>
        <//>
        <div class="tf-side">
          <div><span>${t('food.eaten')}</span><b>${e(eaten)}</b></div>
          <div><span>${t('dash.target')}</span><b>${target ? e(target) : '—'}</b></div>
          <div><span>${t('dash.burn')}</span><b>${burn ? e(burn) : '—'}</b></div>
        </div>
      </div>
      <div class="tf-macs">${[['protein', 'food.macro.protein', '--m-p'], ['fat', 'food.macro.fat', '--m-f'], ['carbs', 'food.macro.carbs', '--m-c']].map(([k, lk, c]) => {
        const v = tot[k] || 0, goal = budget[k];
        return html`<div class="tf-m" style=${'--mc:var(' + c + ')'}><span>${t(lk)}</span>
          <b>${fmtNum(v)} <small>${goal ? '/ ' + fmtNum(goal) + ' ' : ''}${t('unit.g')}</small></b>
          <i><em style=${'width:' + (goal ? Math.min(100, v / goal * 100) : 0) + '%'}></em></i></div>`;
      })}</div>
    </section>
    <${NowCard} today=${today}/>
    <div class="dgrid">
      <${Tile} icon="scale" color="var(--k-body)" tc="var(--t-body)" label=${t('dash.weight')} value=${w ? dw(w.weight) : '—'}
        unit=${w ? wu : null} sub=${wSub || t('dash.weight.empty')} link=${weighedToday ? null : t('dash.weigh')} href="/body?open=weigh"
        viz=${line.length > 1 ? html`<${Spark} line=${line} dots=${dots}/>` : null}/>
      <${Tile} icon="steps" color="var(--k-steps)" tc="var(--t-steps)" label=${t('dash.steps')} value=${sVals[shown] != null ? fmtNum(sVals[shown]) : '—'}
        sub=${stepsSub} href="/body"
        viz=${sVals.some((v) => v != null) ? html`<span class="dt-steps">${sVals.map((v, i) => html`<i class=${i === shown && v != null ? 'cur' : v ? '' : i === 6 ? 'tod' : 'z'} style=${v ? 'height:' + Math.max(8, Math.round(v / sMax * 100)) + '%' : null}></i>`)}</span>` : null}/>
      <${Tile} icon="flame" color="var(--k-burn)" tc="var(--t-burn)" label=${t('dash.burn')} value=${burn ? e(burn) : '—'} unit=${burn ? energyUnit : null} sub=${burnSub} href="/more/expenditure"
        viz=${parts ? html`<span class="dt-seg">${parts.map(([c, v]) => html`<i class=${v > 0 ? '' : 'z'} style=${'--c:' + c + ';flex-grow:' + Math.max(0, Math.round(v || 0))}></i>`)}</span>` : null}/>
      <${Tile} icon="train" color="var(--k-str)" tc="var(--t-str)" label=${t('dash.week.title')} value=${planned ? t('dash.wk.of', { n: week.length, m: planned }) : String(week.length)}
        sub=${t('dash.wk.n', { count: planned || week.length }) + (vol ? ' · ' + fmtNum(toDisplay('weight', vol, units)) + ' ' + wu : '')} href="/train"
        viz=${caps ? html`<span class="dt-caps">${Array.from({ length: caps }, (_, i) => html`<i class=${i < week.length ? 'on' : ''}></i>`)}</span>` : null}/>
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
  const nameOf = (it) => (cat.byId[it.exerciseId] && !(it.alternatives && it.alternatives.length > 1) ? cat.byId[it.exerciseId].name : it.name);
  const prim = new Set(), sec = new Set();
  items.forEach((it) => { const x = cat.byId[it.exerciseId]; if (x) { (x.primaryMuscles || []).forEach((m) => prim.add(m)); (x.secondaryMuscles || []).forEach((m) => sec.add(m)); } });
  const sets = items.reduce((n, it) => n + (it.sets || 0), 0);
  const units = repos.profile.get().units;
  const chip = (it) => {
    const prev = it.exerciseId ? previousSets(logs, it.exerciseId) : null;
    const best = prev ? prev.sets.reduce((b, x) => (x.weight != null && (b == null || x.weight > b.weight) ? x : b), null) : null;
    const scheme = it.sets ? it.sets + '×' + (it.repMin && it.repMax && it.repMin !== it.repMax ? it.repMin + '–' + it.repMax : (it.repMax || it.repMin || '')) : '';
    const tail = best ? fmtNum(toDisplay('weight', best.weight, units), 1) + ' ' + t(unitKey('weight', units)) : scheme.replace(/×$/, '');
    return [nameOf(it), tail].filter(Boolean).join(' · ');
  };
  return html`<div class="card tnext wk-today">
    <div class="tn-top">
      <div class="tn-txt">
        <span class="rl">${sug.why === 'missed' ? t('dash.now.next') : t('dash.now.today')}</span>
        <h2 class="tn-name">${sug.plan.name}</h2>
        <span class="tn-sub"><span>${t('train.plan.count', { count: items.length })}</span>${sets ? html`<span>${t('train.sum.sets', { count: sets })}</span>` : null}
          ${pwk && !pwk.finished ? html`<span>${prog.name} · ${t('prog.weekOf', { n: pwk.week + 1, total: pwk.weeks })}</span>` : null}</span>
        ${sug.why === 'missed' ? html`<span class="tn-st"><i></i>${t('dash.now.missedOn', { d: fmtDate(sug.date, 'dm') })}</span>` : null}
      </div>
      ${prim.size ? html`<div class="tn-map"><${MuscleMap} primary=${[...prim]} secondary=${[...sec]}/></div>` : null}
    </div>
    ${items.length ? html`<div class="tn-chips">${items.slice(0, 3).map((it) => html`<span>${chip(it)}</span>`)}${items.length > 3 ? html`<span class="more">${t('dash.now.more', { count: items.length - 3 })}</span>` : null}</div>` : null}
    <div class="tn-acts">
      <button class="primary grow" disabled=${!cat.ready} onClick=${() => startWorkout(app, { plan: sug.plan, date: today, catalog: cat.byId })}><${Icon} name="play"/>${t('train.start')}</button>
      <button class="tn-alt" onClick=${() => navigate('/train')}>${t('train.other')}</button>
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
  /* шкала столбиков: цель недели ниже верха, перебор виден выше линии цели */
  const tMax = Math.max(0, ...rows.map((r) => r.tk));
  const scale = Math.max(tMax * 1.25, ...rows.map((r) => r.kcal)) || 1;
  const eu = t(unitKey('energy', units));
  const end = addDays(ws, 6);
  const range = (ws.slice(0, 7) === end.slice(0, 7) ? String(Number(ws.slice(8))) : fmtDate(ws, 'dm')) + ' – ' + fmtDate(end, 'dm');
  return html`<section class="card pad tweek">
    <div class="tw-h"><b>${t('dash.week.title')}</b><span>${range}</span></div>
    <div class="wk-weekn">
      <div><b>${fmtNum(toDisplay('energy', avg, units))}</b><small>${t('dash.week.avg', { u: eu })}</small></div>
      <div><b>${fed.some((r) => r.tp) ? protDays + ' / ' + fed.length : '—'}</b><small>${t('dash.week.protein')}</small></div>
      <div><b>${dw != null ? (dw > 0 ? '+' : dw < 0 ? '−' : '') + fmtNum(Math.abs(dw), 1) : '—'}</b><small>${t('dash.week.trendKg', { u: wu })}</small></div>
    </div>
    <div class="tw-chart">
      ${tMax ? html`<div class="tw-goal" style=${'bottom:' + (28 + tMax / scale * 84).toFixed(1) + 'px'}><span>${t('dash.week.goalLine', { v: fmtNum(toDisplay('energy', tMax, units)) })}</span></div>` : null}
      <div class="nw-bars" role="img" aria-label=${t('dash.week.aria')}>${rows.map((r) => html`<i class=${(r.d === today ? 'tod' : r.tk && r.kcal >= HIT_SHARE * r.tk ? 'hit' : '') + (r.kcal ? '' : ' z')} style=${r.kcal ? 'height:' + Math.max(6, r.kcal / scale * 100).toFixed(1) + '%' : null}></i>`)}</div>
      <div class="nw-days7">${days.map((d, i) => html`<span class=${d === today ? 'on' : ''}>${wdShort(i)}</span>`)}</div>
    </div>
    ${g && g.targetWeightKg && g.type !== 'maintain' ? html`<div class="hint">${t('dash.week.goal', { w: fmtFix(toDisplay('weight', g.targetWeightKg, units), 1), u: wu }) + (eta ? ' — ' + t('dash.week.eta', { d: fmtDate(eta, 'full') }) : '')}</div>` : null}
  </section>`;
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
