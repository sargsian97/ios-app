/* Вкладка «Тренировка»: идущая тренировка, что делать сегодня (по расписанию шаблонов), быстрые действия,
   неделя, последние тренировки, запись кардио. С ?d=ГГГГ-ММ-ДД — тренировки за этот день. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../../core.js';
import { Page, Card, Sheet, Field, Toggle, List, Row } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { buildSession, suggestPlan, planItems, sortLogs, workoutSummary, cardioExerciseId, previousSets } from '../../../domain/workout.js';
import { addDays, weekStart, workoutsBetween } from '../../../data/journal.js';
import { toDisplay, fromDisplay, unitKey } from '../../../domain/units.js';
import { uid } from '../../../data/ids.js';
import { defaultGym, addWarmups, progressionFor } from '../../../domain/gym.js';
import { MuscleMap } from '../../train/muscle-map.js';
import { useCatalog, whyLabel, cardioTypeLabel, fmtClock, currentBodyweight, weightUnit, wdLabel, wdShort } from '../../train/catalog.js';
import { useNow } from '../../train/timer.js';
import { NumIn } from '../../train/inputs.js';
import { LogRow } from './history.js';
import { activeProgram, programWeekMods } from '../../../domain/training-program.js';

export async function startWorkout(app, { plan = null, date, catalog }) {
  const { repos } = app;
  const profile = repos.workoutProfile.get();
  const logs = repos.workout.list();
  const gym = defaultGym(repos.gym.list(), profile);
  const configs = {};
  repos.userExerciseConfig.list().forEach((c) => { configs[c.id] = c; });
  const program = plan && plan.programId ? repos.workoutProgram.get(plan.programId) : null;
  const wk = program ? programWeekMods(program, date) : null;
  let s = buildSession({ weekMods: wk && wk.mods, plan, catalog, logs, date, now: new Date().toISOString(), bodyweightKg: profile.bodyweightFromTrend ? currentBodyweight(repos) : null, previousFrom: profile.previousFrom, newId: uid, gymId: gym ? gym.id : null, progression: progressionFor(profile, gym, configs) });
  if (profile.autoWarmup) {
    s = addWarmups(s, { catalog, gym, configs, profile, newId: uid });
  }
  await repos.workoutSession.save(s);
  navigate('/train/session');
}

export function sortPlans(plans) {
  return plans.slice().sort((a, b) => (a.weekday == null ? 9 : a.weekday) - (b.weekday == null ? 9 : b.weekday) || a.name.localeCompare(b.name, 'ru'));
}

export function TrainHome({ route }) {
  const app = useApp();
  const { repos, store } = app;
  useData(['workoutSessions', 'workoutLogs', 'workoutPlans', 'workoutPrograms', 'scaleEntries', 'workoutProfile', 'profile', 'gyms']);
  const cat = useCatalog();
  const today = todayYmd();
  const date = route.query.d || today;
  const isToday = date === today;
  const units = repos.profile.get().units;
  const s = repos.workoutSession.get('current');
  const logs = repos.workout.list();
  const plans = sortPlans(repos.workoutPlan.list((p) => !p.archived));
  const prog = activeProgram(repos.workoutProgram.list());
  const progPlans = prog ? plans.filter((p) => p.programId === prog.id) : [];
  const sug = suggestPlan(progPlans.length ? progPlans : plans, logs, today);
  const pwk = prog ? programWeekMods(prog, today) : null;
  const [choose, setChoose] = useState(false);
  const [cardio, setCardio] = useState(false);
  const [pickId, setPickId] = useState(null);
  /* переключатель шаблонов в герое: шаблоны программы (или все), если их от 2 до 4 */
  const segPlans = (progPlans.length ? progPlans : plans);
  const showSeg = segPlans.length >= 2 && segPlans.length <= 4;
  const shownPlan = (pickId && plans.find((p) => p.id === pickId)) || (sug && sug.plan);
  const isSug = sug && shownPlan && shownPlan.id === sug.plan.id;
  const start = (plan) => (s ? navigate('/train/session') : startWorkout(app, { plan, date, catalog: cat.byId }));

  const ws = weekStart(today);
  const week = workoutsBetween(store, ws, addDays(ws, 6));
  const wsum = week.reduce((a, w) => { const x = workoutSummary(w); a.sets += x.sets; a.vol += x.volumeKg; return a; }, { sets: 0, vol: 0 });
  const perDay = Array.from({ length: 7 }, (_, i) => week.filter((w) => w.date === addDays(ws, i)).reduce((n, w) => n + workoutSummary(w).sets, 0));
  const dayMax = Math.max(1, ...perDay);
  const wEnd = addDays(ws, 6);
  const wRange = (ws.slice(0, 7) === wEnd.slice(0, 7) ? String(Number(ws.slice(8))) : fmtDate(ws, 'dm')) + ' – ' + fmtDate(wEnd, 'dm');
  const dayLogs = sortLogs(logs.filter((w) => w.date === date));
  const recent = sortLogs(logs).filter((w) => w.date !== date).slice(0, 3);
  /* тренировка за сегодня уже записана: она сверху, предложение плана — скромно, как «ещё одна» */
  const doneToday = isToday && dayLogs.length > 0;

  return html`<${Page} title=${isToday ? t('nav.train') : fmtDate(date, 'long')}
      back=${isToday ? null : '/train'} backLabel=${t('nav.train')}
      right=${html`<button class="ghost" aria-label=${t('train.settings')} onClick=${() => navigate('/train/settings')}><${Icon} name="gear"/></button>`}>
    ${s ? html`<${ActiveCard} s=${s}/>` : null}
    ${dayLogs.length ? html`<div class="ltitle">${isToday ? t('train.doneToday') : t('train.dayLogs')}</div><div class="list">${dayLogs.map((w) => html`<${LogRow} w=${w} byId=${cat.byId} units=${units}/>`)}</div>` : !isToday ? html`<div class="card empty">${t('train.dayEmpty')}</div>` : null}
    ${!s ? html`<div class="card thero wk-today">
      ${sug ? html`
        ${showSeg && !doneToday ? html`<div class="pills th-seg" role="radiogroup" aria-label=${t('train.choose')}>${segPlans.map((p) => html`<button type="button" role="radio" aria-checked=${shownPlan.id === p.id} class=${'pill' + (shownPlan.id === p.id ? ' on' : '')} onClick=${() => setPickId(p.id)}>${p.name}</button>`)}</div>` : null}
        <${PlanHero} plan=${shownPlan} byId=${cat.byId} logs=${logs} units=${units}
          label=${doneToday ? t('train.another') : isToday ? t('train.today') : t('train.forDay')}
          why=${isToday && !doneToday && isSug && (sug.why === 'missed' || sug.why === 'next') ? whyLabel(sug.why) + ' · ' + fmtDate(sug.date, 'dm') : null}
          prog=${prog && shownPlan.programId === prog.id && pwk && !pwk.finished ? html`<button class="wk-progline" onClick=${() => navigate('/train/programs')}>${prog.name} · ${t('prog.weekOf', { n: pwk.week + 1, total: pwk.weeks })}${pwk.deload ? ' · ' + t('prog.deload') : pwk.mods && pwk.mods.heavy != null ? ' · ' + t(pwk.mods.heavy ? 'prog.heavy' : 'prog.light') : ''}</button>` : null}
          brief=${doneToday}/>
        ${doneToday ? null : html`<${GymLine}/>`}
        <div class="tn-acts">
          <button class=${doneToday ? 'grow tn-alt' : 'primary grow'} disabled=${!cat.ready} onClick=${() => start(shownPlan)}>${doneToday ? null : html`<${Icon} name="play"/>`}${t('train.start')}</button>
          <button class="tn-alt" onClick=${() => setChoose(true)}>${t('train.other')}</button>
        </div>` : html`
        <div class="rl">${t('train.today')}</div>
        <p class="hint" style="margin:4px 0 12px">${t('train.noPlans')}</p>
        <div class="tn-acts"><button class="primary grow" disabled=${!cat.ready} onClick=${() => start(null)}>${t('train.empty')}</button><button class="tn-alt" onClick=${() => navigate('/train/plan/new')}>${t('train.plan.new')}</button></div>`}
    </div>` : null}

    <button class="wk-cardio" onClick=${() => setCardio(true)}><${Icon} name="heart"/>${t('train.act.cardioLog')}</button>
    <${List}>
      <${Row} icon="search" color="var(--k-str)" label=${t('train.act.library')} sub=${cat.ready ? t('train.menu.librarySub', { n: fmtNum(cat.list.length) }) : null} href="/train/library"/>
      <${Row} icon="bolt" color="var(--k-plan)" label=${t('train.menu.plans')} sub=${prog ? prog.name + ' · ' + t('train.menu.plansN', { count: plans.length }) : t('train.menu.plansN', { count: plans.length })} href="/train/programs"/>
      <${Row} icon="plate" color="#D7263D" label=${t('train.menu.gyms')} sub=${t('train.menu.gymsSub', { count: repos.gym.count() })} href="/train/gyms"/>
      <${Row} icon="target" color="var(--k-body)" label=${t('train.act.levels')} sub=${t('train.menu.levelsSub')} href="/train/levels"/>
    <//>

    ${isToday ? html`<section class="card tweek trw">
      <div class="tw-h"><b>${t('train.week')}</b><span>${wRange}</span></div>
      <div class="wk-weekn">
        <div><b>${week.length}</b><small>${t('train.week.workouts', { count: week.length })}</small></div>
        <div><b>${wsum.sets}</b><small>${t('train.week.sets', { count: wsum.sets })}</small></div>
        <div><b>${fmtNum(Math.round(toDisplay('weight', wsum.vol, units) / 100) / 10, 1)}</b><small>${t('train.week.tonnes', { u: weightUnit(units) })}</small></div>
      </div>
      <div class="tw-chart">
        <div class="nw-bars" role="img" aria-label=${t('train.week.aria')}>${perDay.map((n) => html`<i class=${n ? 'hit' : 'z'} style=${n ? 'height:' + Math.max(8, n / dayMax * 100).toFixed(1) + '%' : null}></i>`)}</div>
        <div class="nw-days7">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<span class=${addDays(ws, i) === today ? 'on' : ''}>${wdShort(i)}</span>`)}</div>
      </div>
    </section>` : null}

    ${isToday && recent.length ? html`<h3 class="th-h3">${t('train.recent')}</h3><div class="list">${recent.map((w) => html`<${LogRow} w=${w} byId=${cat.byId} units=${units}/>`)}
      <button class="lrow wl-all" onClick=${() => navigate('/train/history')}>${t('train.allHistory')}</button></div>` : null}
    ${!isToday && !s ? html`<button class="wk-more" disabled=${!cat.ready} onClick=${() => start(null)}>${t('train.logForDay')}</button>` : null}

    <${Sheet} open=${choose} onClose=${() => setChoose(false)} title=${t('train.choose')}>
      <div class="list">
        ${plans.map((p) => html`<button class="lrow" type="button" onClick=${() => { setChoose(false); start(p); }}>
          <span class="lico" style="--cc:var(--k-str)"><${Icon} name="list"/></span>
          <span class="ltext"><span class="ll">${p.name}</span><span class="ls">${p.weekday != null ? wdLabel(p.weekday) + ' · ' : ''}${t('train.plan.count', { count: planItems(p).length })}</span></span></button>`)}
        <button class="lrow" type="button" onClick=${() => { setChoose(false); start(null); }}>
          <span class="lico" style="--cc:#8E8E93"><${Icon} name="plus"/></span><span class="ltext"><span class="ll">${t('train.empty')}</span><span class="ls">${t('train.emptySub')}</span></span></button>
      </div>
    <//>
    <${CardioSheet} open=${cardio} date=${date} onClose=${() => setCardio(false)}/>
  <//>`;
}

/* Герой шаблона: название, сколько упражнений и подходов, карта мышц дня и нумерованный список с цифрами прошлого раза */
function PlanHero({ plan, byId, logs, units, label, why, prog, brief }) {
  const [all, setAll] = useState(false);
  const items = planItems(plan);
  const nameOf = (it) => (byId[it.exerciseId] && !(it.alternatives && it.alternatives.length > 1) ? byId[it.exerciseId].name : it.name);
  const prim = new Set(), sec = new Set();
  items.forEach((it) => { const x = byId[it.exerciseId]; if (x) { (x.primaryMuscles || []).forEach((m) => prim.add(m)); (x.secondaryMuscles || []).forEach((m) => sec.add(m)); } });
  const sets = items.reduce((n, it) => n + (it.sets || 0), 0);
  const row = (it, i) => {
    const prev = it.exerciseId ? previousSets(logs, it.exerciseId) : null;
    const best = prev ? prev.sets.reduce((b, x) => (x.weight != null && (b == null || x.weight > b.weight) ? x : b), null) : null;
    const scheme = it.sets ? it.sets + '×' + (it.repMin && it.repMax && it.repMin !== it.repMax ? it.repMin + '–' + it.repMax : (it.repMax || it.repMin || '')) : '';
    const was = best ? t('train.prev.was', { w: fmtNum(toDisplay('weight', best.weight, units), 1), u: weightUnit(units) }) : prev && prev.sets[0] && prev.sets[0].reps != null ? t('train.prev.wasReps', { r: prev.sets[0].reps }) : t('train.prev.first');
    return html`<div class="th-row"><span class="th-n">${i + 1}</span><span class="th-nm">${nameOf(it)}</span><span class="th-r">${scheme ? html`${scheme}<br/>` : null}${was}</span></div>`;
  };
  return html`<div class="tn-top">
      <div class="tn-txt">
        <span class="rl">${label}</span>
        ${prog}
        <h2 class="tn-name th-name">${plan.name}</h2>
        ${brief ? null : html`<span class="tn-sub"><span>${t('train.plan.count', { count: items.length })}</span>${sets ? html`<span>${t('train.sum.sets', { count: sets })}</span>` : null}</span>`}
        ${why ? html`<span class="tn-st"><i></i>${why}</span>` : null}
      </div>
      ${!brief && prim.size ? html`<div class="tn-map th-map"><${MuscleMap} primary=${[...prim]} secondary=${[...sec]}/></div>` : null}
    </div>
    ${brief || !items.length ? null : html`<div class="th-list">
      ${(all ? items : items.slice(0, 3)).map(row)}
      ${items.length > 3 && !all ? html`<button class="th-more" onClick=${() => setAll(true)}>${t('train.prev.moreN', { count: items.length - 3 })}<${Icon} name="right"/></button>` : null}
    </div>`}`;
}

/* Зал для новой тренировки (по умолчанию) — со ссылкой на залы */
function GymLine() {
  const { repos } = useApp();
  useData(['gyms', 'workoutProfile']);
  const g = defaultGym(repos.gym.list(), repos.workoutProfile.get());
  return html`<button class="wk-gymline" onClick=${() => navigate(g ? '/train/gym/' + encodeURIComponent(g.id) : '/train/gyms')}>
    <${Icon} name=${g ? g.icon || 'gym' : 'gym'}/><span>${g ? t('train.gymLine', { name: g.name }) : t('train.gymNone')}</span><${Icon} name="right" cls="chev"/></button>`;
}

export function ActiveCard({ s }) {
  const now = useNow(true, 1000);
  const total = s.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
  const done = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const restLeft = s.rest ? s.rest.targetSec - (now - Date.parse(s.rest.startedAt)) / 1000 : null;
  return html`<button class="card pad wk-active" onClick=${() => navigate('/train/session')}>
    <div class="rl">${t('train.active')}</div>
    <div class="wk-today-h"><b>${s.name || t('train.session.untitled')}</b><span class="wk-clock"><${Icon} name="timer"/>${fmtClock((now - Date.parse(s.startedAt)) / 1000)}</span></div>
    <div class="hint">${t('train.session.progress', { done, total })}${restLeft != null ? ' · ' + (restLeft > 0 ? t('train.rest.left', { t: fmtClock(restLeft) }) : t('train.rest.over')) : ''}</div>
    <div class="bar"><i style=${'width:' + (total ? Math.round(done / total * 100) : 0) + '%'}></i></div>
    <span class="primary wk-cont">${t('train.continue')}</span>
  </button>`;
}

const CARDIO_TYPES = ['treadmill', 'outdoor', 'elliptical', 'bike', 'stepper', 'rower', 'other'];

/* Быстрая запись кардио: отдельная тренировка с одним кардио-упражнением */
export function CardioSheet({ open, date, onClose }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const [d, setD] = useState({ type: 'treadmill', inSteps: true });
  if (!open) return null;
  const set = (k, v) => setD(Object.assign({}, d, { [k]: v }));
  const ok = (d.min > 0) || (d.km > 0);
  async function save() {
    const exId = cardioExerciseId(d.type, d.speed);
    if (exId === 'cardio-other' && !repos.exercise.get('cardio-other')) await repos.exercise.save({ id: 'cardio-other', name: t('cardio.t.other'), type: 'cardio', category: 'cardio', pattern: 'cardio', metrics: ['time', 'distance'], source: 'user' });
    const kmMetric = d.km > 0 ? fromDisplay('distance', d.km, units) : null;
    await repos.workout.create({
      id: uid(), date, name: t('cardio.title'), finishedAt: new Date().toISOString(), durationSec: d.min > 0 ? Math.round(d.min * 60) : null, source: 'app',
      exercises: [{ id: uid(), exerciseId: exId, name: cardioTypeLabel(d.type), sets: [{ id: uid(), type: 'normal', timeSec: d.min > 0 ? Math.round(d.min * 60) : null, distanceM: kmMetric ? Math.round(kmMetric * 1000) : null, done: true }],
        cardio: { speedKmh: d.speed ?? null, inclinePct: d.incline ?? null, avgHr: d.avgHr ?? null, maxHr: d.maxHr ?? null, kcalWatch: d.kcalWatch ?? null, kcal: d.kcal ?? null, steps: d.steps ?? null, inSteps: d.inSteps !== false }, notes: d.note || '' }]
    });
    setD({ type: 'treadmill', inSteps: true });
    onClose();
  }
  const F = [['min', 'cardio.min', 1], ['km', unitKey('distance', units) === 'unit.mi' ? 'cardio.mi' : 'cardio.km', 2], ['speed', 'cardio.speed', 1], ['incline', 'cardio.incline', 1], ['avgHr', 'cardio.avgHr', 0], ['maxHr', 'cardio.maxHr', 0], ['kcalWatch', 'cardio.kcalWatch', 0], ['kcal', 'cardio.kcal', 0], ['steps', 'cardio.steps', 0]];
  return html`<${Sheet} open=${open} onClose=${onClose} title=${t('cardio.title')}>
    <div class="wk-chips pick" role="radiogroup">${CARDIO_TYPES.map((k) => html`<button role="radio" aria-checked=${d.type === k} class=${'chip' + (d.type === k ? ' on' : '')} onClick=${() => set('type', k)}>${cardioTypeLabel(k)}</button>`)}</div>
    <div class="grid2" style="margin-top:10px">
      ${F.map(([k, l, dg]) => html`<label class="fld"><span class="lbl">${t(l)}</span><${NumIn} mode=${dg ? 'decimal' : 'numeric'} digits=${dg} value=${d[k] ?? null} label=${t(l)} onCommit=${(v) => set(k, v)}/></label>`)}
    </div>
    <div class="wk-togs"><${Toggle} on=${d.inSteps !== false} onChange=${(v) => set('inSteps', v)} label=${t('cardio.inSteps')} hint=${t('cardio.inStepsHint')}/></div>
    <${Field} label=${t('train.ex.note')}><input value=${d.note || ''} onInput=${(e) => set('note', e.currentTarget.value)}/><//>
    <button class="primary" style="width:100%" disabled=${!ok} onClick=${save}>${t('common.save')}</button>
    <div class="hint">${fmtDate(date, 'long')}</div>
  <//>`;
}
