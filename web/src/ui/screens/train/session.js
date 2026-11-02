/* Активная тренировка: подходы (вес / помощь / повторы / время / дистанция, RIR, тип, сторона), предыдущие значения,
   разминка одной строкой, панель −/+ над клавиатурой, суперсеты, замена / пропуск / добавление упражнения, заметки,
   таймер отдыха и «Начать подход», рекорды тостом, завершение со сводкой и обновлением шаблона.
   Правки сохраняются с задержкой 400 мс (и сразу при сворачивании/уходе), отметки подходов — сразу. */
import { html, useApp, useData, useState, useEffect, useMemo, useRef, useReducer, navigate, todayYmd, memo, registerFlush } from '../../core.js';
import { Sheet, Confirm, Field, Toggle } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { completeSet, uncompleteSet, completeWarmups, propagateEdit, planFromSession, finishSession, findRecords, exerciseEntry, previousSets, targetFor, workoutSummary } from '../../../domain/workout.js';
import { isCardio } from '../../../domain/exercises.js';
import { toDisplay, fromDisplay, unitKey } from '../../../domain/units.js';
import { uid } from '../../../data/ids.js';
import { useCatalog, exName, fmtSet, fmtClock, fmtDuration, setTypeShort, weightUnit, fmtWeight, recordLabel } from '../../train/catalog.js';
import { plateLoadout, warmupSetsForEntry, workingWeightOf, loadKind, progressionFor, availableLoads, nextLoad } from '../../../domain/gym.js';
import { ExercisePicker } from '../../train/picker.js';
import { RestBar, useNow, unlockAudio, useWakeLock } from '../../train/timer.js';
import { NumIn, RirSheet, SetSheet } from '../../train/inputs.js';
import { KeyBar } from '../../train/keybar.js';
import { StrengthKcalCard } from '../../train/zepp.js';
import { fmtRecord } from './history.js';
import { toast } from '../../toast.js';

const progReason = (r) => t(r === 'lightest_too_heavy' ? 'train.prog.r.heavy' : r === 'expanded_below_range' ? 'train.prog.r.below' : 'train.prog.r.above');
const GROUPS = 'ABCDEFGH';
const SAVE_DELAY = 400;

/* Колонки подхода по метрикам упражнения */
function columnsFor(ex, cardio) {
  const m = (ex && ex.metrics && ex.metrics.length) ? ex.metrics : ['weight', 'reps'];
  const cols = [];
  if (m.includes('assist')) cols.push('assist');
  if (m.includes('weight')) cols.push('weight');
  if (m.includes('reps')) cols.push('reps');
  if (m.includes('time')) cols.push('time');
  if (m.includes('distance')) cols.push('distance');
  if (!cols.length) cols.push('weight', 'reps');
  return { cols, rir: !cardio && cols.includes('reps') };
}

/* Время с начала тренировки — тикает отдельно, чтобы не перерисовывать все упражнения каждую секунду */
function Clock({ startedAt }) {
  const now = useNow(true, 1000);
  return html`<span class="wk-clock" aria-label=${t('train.session.elapsed')}><${Icon} name="timer"/>${fmtClock(startedAt ? (now - Date.parse(startedAt)) / 1000 : 0)}</span>`;
}

/* Перевести фокус на следующее поле ввода в строке подхода, иначе в следующей строке */
function focusNext(input) {
  const row = input.closest('.wk-set');
  if (!row) return;
  const inputs = [...row.querySelectorAll('input')];
  const i = inputs.indexOf(input);
  let next = inputs[i + 1];
  if (!next) { let r = row.nextElementSibling; while (r && !r.classList.contains('wk-set')) r = r.nextElementSibling; next = r && r.querySelector('input'); }
  if (next) next.focus(); else input.blur();
}

export function TrainSession() {
  const app = useApp();
  const { repos, store } = app;
  useData(['workoutSessions', 'workoutLogs', 'workoutProfile', 'exerciseConfigs', 'profile', 'gyms']);
  const cat = useCatalog();
  const stored = repos.workoutSession.get('current');
  const profile = repos.workoutProfile.get();
  const units = repos.profile.get().units;
  const [picker, setPicker] = useState(null); /* { mode: 'add' } | { mode: 'replace', ei } */
  const [rir, setRir] = useState(null); /* { ei, si } */
  const [setMenu, setSetMenu] = useState(null);
  const [exMenu, setExMenu] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [ask, setAsk] = useState(null);
  const [notes, setNotes] = useState({});
  const [expanded, setExpanded] = useState({});
  const [, bump] = useReducer((x) => x + 1, 0);

  /* черновик: правки копятся здесь и пишутся в хранилище с задержкой; пока правки не записаны, хранилище не перекрывает черновик */
  const draft = useRef(null);
  const timer = useRef(null);
  if (!timer.current) draft.current = stored;
  const s = draft.current;
  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current); timer.current = null;
    if (draft.current && repos.workoutSession.get('current')) repos.workoutSession.save(draft.current);
  };
  useEffect(() => { const off = registerFlush(flush); return () => { off(); flush(); }; }, []);
  useWakeLock(!!s && profile.keepAwake);
  const gym = s && s.gymId ? repos.gym.get(s.gymId) : null;

  const logs = repos.workout.list();
  const prevByEx = useMemo(() => {
    const m = {};
    if (s) s.exercises.forEach((e) => { if (e.exerciseId && !m[e.exerciseId]) m[e.exerciseId] = previousSets(logs, e.exerciseId, { programId: profile.previousFrom === 'program' ? s.programId : null }); });
    return m;
  }, [s && s.exercises.map((e) => e.exerciseId).join(','), store.version('workoutLogs')]);
  const configs = useMemo(() => { const c = {}; repos.userExerciseConfig.list().forEach((x) => { c[x.id] = x; }); return c; }, [store.version('exerciseConfigs')]);

  /* автопрокрутка к текущему упражнению */
  const curKey = s && s.cursor ? s.cursor.ei + ':' + s.cursor.si : '';
  useEffect(() => {
    if (!s || !s.cursor || !profile.autoAdvance) return;
    const ex = s.exercises[s.cursor.ei];
    const el = ex && document.getElementById('wk-' + ex.id);
    if (el) { const r = el.getBoundingClientRect(); if (r.top < 60 || r.top > window.innerHeight * 0.55) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, [curKey]);

  if (!s) {
    return html`<div class="wrap page"><div class="card pad welcome"><h2>${t('train.session.none')}</h2><p class="hint">${t('train.session.noneText')}</p>
      <button class="primary" onClick=${() => navigate('/train', { replace: true })}>${t('nav.train')}</button></div></div>`;
  }

  const get = () => draft.current;
  /* сразу в хранилище (отметки подходов, таймер, структура) */
  const save = (next) => { clearTimeout(timer.current); timer.current = null; draft.current = next; repos.workoutSession.save(next); bump(); };
  /* с задержкой (ввод чисел и текста) */
  const updLater = (fn) => { draft.current = fn(draft.current); clearTimeout(timer.current); timer.current = setTimeout(flush, SAVE_DELAY); bump(); };
  const upd = (fn) => save(fn(get()));
  const updEx = (ei, fn) => upd((cur) => Object.assign({}, cur, { exercises: cur.exercises.map((e, i) => (i === ei ? fn(e) : e)) }));
  const updSet = (ei, si, patch) => updLater((cur) => Object.assign({}, cur, { exercises: cur.exercises.map((e, i) => {
    if (i !== ei) return e;
    const entry = Object.assign({}, e, { sets: e.sets.map((x, j) => (j === si ? Object.assign({}, x, patch) : x)) });
    return propagateEdit(entry, si, patch);
  }) }));

  const shownRecords = useRef(new Set());
  function toggleDone(ei, si) {
    unlockAudio();
    const cur = get();
    const set = cur.exercises[ei].sets[si];
    if (set.done) { save(uncompleteSet(cur, ei, si)); return; }
    const next = completeSet(cur, ei, si, { now: new Date().toISOString(), catalog: cat.byId, configs, profile, progression: profile.autofill ? progressionFor(profile, gym, configs) : null });
    save(next);
    /* рекорд прямо сейчас — тостом, без остановки */
    try {
      const entry = next.exercises[ei];
      if (entry.exerciseId && set.type !== 'warmup') {
        const w = Object.assign(finishSession(next, { now: new Date().toISOString() }), { id: 'live' });
        const fresh = findRecords(w, logs).filter((r) => r.exerciseId === entry.exerciseId && !shownRecords.current.has(r.exerciseId + ':' + r.kind));
        if (fresh.length) {
          fresh.forEach((r) => shownRecords.current.add(r.exerciseId + ':' + r.kind));
          const r = fresh.find((x) => x.kind === 'e1rm') || fresh[0];
          toast({ text: t('train.pr.toast', { ex: exName(entry, cat.byId), kind: recordLabel(r.kind), v: fmtRecord(r.kind, r.value, units) }), ms: 4000 });
        }
      }
    } catch (e) { /* рекорды — не повод падать */ }
  }
  const completeWarm = (ei) => { unlockAudio(); save(completeWarmups(get(), ei, { now: new Date().toISOString(), profile })); };

  function addExercise(ex) {
    setPicker(null);
    const prev = previousSets(logs, ex.id);
    const entry = exerciseEntry({ exercise: ex, prev, newId: uid });
    upd((cur) => {
      const exercises = cur.exercises.concat([entry]);
      const allDone = cur.exercises.every((e) => e.skipped || e.sets.every((x) => x.done));
      return Object.assign({}, cur, { exercises, cursor: allDone || !cur.cursor ? { ei: exercises.length - 1, si: 0 } : cur.cursor });
    });
  }

  function replaceExercise(ei, ex) {
    setPicker(null);
    const prev = previousSets(logs, ex.id);
    const working = prev ? prev.sets.filter((x) => x.type !== 'warmup') : [];
    updEx(ei, (e) => Object.assign({}, e, {
      exerciseId: ex.id, name: ex.name,
      cardio: isCardio(ex) ? (e.cardio || { inSteps: true }) : null,
      sets: e.sets.map((x, j) => (x.done ? x : Object.assign({}, x, { target: targetFor(e.target ? { repMin: e.target.repMin, repMax: e.target.repMax, rir: e.target.rir, timeSec: e.target.timeSec } : null, working.length ? working[Math.min(j, working.length - 1)] : null) })))
    }));
  }

  function exAction(ei, act) {
    setExMenu(null);
    const cur = get();
    const e = cur.exercises[ei];
    if (act === 'replace') { setPicker({ mode: 'replace', ei }); return; }
    if (act === 'note') { setNotes(Object.assign({}, notes, { [e.id]: true })); return; }
    if (act === 'warmup') {
      const ws = warmupSetsForEntry(cur, ei, { catalog: cat.byId, gym, configs, profile, newId: uid, force: true });
      updEx(ei, (x) => {
        const work = x.sets.filter((y) => y.type !== 'warmup');
        const doneWarm = x.sets.filter((y) => y.type === 'warmup' && y.done);
        const sets = ws.length ? doneWarm.concat(ws, work) : [{ id: uid(), type: 'warmup', side: 'both', done: false, target: null }].concat(x.sets);
        return Object.assign({}, x, { sets });
      });
      upd((c) => { const j = c.exercises[ei].sets.findIndex((y) => !y.done); return Object.assign({}, c, { cursor: j >= 0 ? { ei, si: j } : c.cursor }); });
      return;
    }
    if (act === 'plates') { navigate('/train/plates?w=' + (workingWeightOf(e) || '') + (gym ? '&gym=' + encodeURIComponent(gym.id) : '')); return; }
    if (act === 'skip') { updEx(ei, (x) => Object.assign({}, x, { skipped: !x.skipped })); return; }
    if (act === 'delete') { setAsk({ text: t('train.ex.deleteAsk', { name: exName(e, cat.byId) }), yes: t('common.delete'), danger: true, run: () => upd((c) => Object.assign({}, c, { exercises: c.exercises.filter((_, i) => i !== ei), cursor: null, rest: c.rest })) }); return; }
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? ei - 1 : ei + 1;
      if (j < 0 || j >= cur.exercises.length) return;
      const exs = cur.exercises.slice();
      [exs[ei], exs[j]] = [exs[j], exs[ei]];
      save(Object.assign({}, cur, { exercises: exs, cursor: null }));
      return;
    }
    if (act === 'link') {
      const next = cur.exercises[ei + 1];
      if (!next) return;
      const used = new Set(cur.exercises.map((x) => x.group).filter(Boolean));
      const g = e.group || next.group || [...GROUPS].find((c) => !used.has(c)) || 'Z';
      save(Object.assign({}, cur, { exercises: cur.exercises.map((x, i) => (i === ei || i === ei + 1 ? Object.assign({}, x, { group: g, groupKind: x.groupKind || 'superset' }) : x)) }));
      return;
    }
    if (act === 'unlink') {
      const g = e.group;
      let exs = cur.exercises.map((x, i) => (i === ei ? Object.assign({}, x, { group: '', groupKind: null }) : x));
      if (exs.filter((x) => x.group === g).length === 1) exs = exs.map((x) => (x.group === g ? Object.assign({}, x, { group: '', groupKind: null }) : x));
      save(Object.assign({}, cur, { exercises: exs }));
    }
  }

  async function finish({ updateComposition = false, updateWeights = false } = {}) {
    flush();
    const cur = get();
    const nowIso = new Date().toISOString();
    const w = finishSession(cur, { now: nowIso });
    w.id = uid();
    w.records = findRecords(w, logs);
    const ops = [repos.workout.putOp(w), repos.workoutSession.removeOp('current')];
    const plan = cur.planId ? repos.workoutPlan.get(cur.planId) : null;
    if (plan && (updateComposition || updateWeights)) ops.push(repos.workoutPlan.putOp(planFromSession(plan, cur, { composition: updateComposition, weights: updateWeights })));
    draft.current = null; clearTimeout(timer.current); timer.current = null;
    await store.batch(ops);
    navigate('/train/log/' + w.id + '?done=1', { replace: true });
  }
  function askFinish() {
    const cur = get();
    if (!cur.exercises.some((e) => e.sets.some((x) => x.done))) { setAsk({ text: t('train.finish.empty'), yes: t('train.discard'), danger: true, run: discard }); return; }
    setFinishOpen(true);
  }
  async function discard() { draft.current = null; clearTimeout(timer.current); timer.current = null; await repos.workoutSession.remove('current'); navigate('/train', { replace: true }); }

  /* стабильные обработчики для мемоизированных карточек */
  const actsRef = useRef(null);
  actsRef.current = { updSet, toggleDone, completeWarm, setRir, setSetMenu, setExMenu, updEx, upd, setExpanded, setNotes, gym, configs, profile, units, cat };
  const acts = useMemo(() => ({
    onSet: (ei, si, patch) => actsRef.current.updSet(ei, si, patch),
    onDone: (ei, si) => actsRef.current.toggleDone(ei, si),
    onWarmDone: (ei) => actsRef.current.completeWarm(ei),
    onRir: (ei, si) => actsRef.current.setRir({ ei, si }),
    onSetMenu: (ei, si) => actsRef.current.setSetMenu({ ei, si }),
    onMenu: (ei) => actsRef.current.setExMenu(ei),
    onEx: (ei, patch) => actsRef.current.updEx(ei, (x) => Object.assign({}, x, patch)),
    onNote: (ei, text) => { const a = actsRef.current; a.upd((c) => Object.assign({}, c, { exercises: c.exercises.map((e, i) => (i === ei ? Object.assign({}, e, { notes: text }) : e)) })); },
    onExpand: (id) => actsRef.current.setExpanded((m) => Object.assign({}, m, { [id]: !m[id] })),
    onAddSet: (ei) => actsRef.current.updEx(ei, (x) => { const last = x.sets[x.sets.length - 1]; return Object.assign({}, x, { sets: x.sets.concat([{ id: uid(), type: last && last.type !== 'warmup' ? last.type : 'normal', side: 'both', perSide: !!(last && last.perSide), done: false, target: last ? Object.assign({}, last.target || {}, last.done ? { weight: last.weight, reps: last.reps, timeSec: last.timeSec, distanceM: last.distanceM } : {}) : null }]) }); }),
    /* панель над клавиатурой: шаг веса по доступным весам зала, повторы по одному */
    barFor: (ei, si, kind) => {
      const a = actsRef.current;
      const cur = () => draft.current.exercises[ei];
      const ex = a.cat.byId[cur().exerciseId];
      const loads = kind === 'weight' ? availableLoads(ex, a.gym, configs[cur().exerciseId]) : null;
      const step = loads && loads.length > 1 ? null : 2.5;
      return {
        kind,
        step: step || null,
        stepLabel: kind === 'weight' ? (step ? fmtNum(step, 1) : t('train.keybar.gym')) : '1',
        onStep: (dir) => {
          const set = cur().sets[si], tg = set.target || {};
          if (kind === 'weight') { const w = set.weight != null ? set.weight : tg.weight != null ? tg.weight : 0; a.updSet(ei, si, { weight: nextLoad(w, loads, dir) }); }
          else { const r = set.reps != null ? set.reps : tg.reps != null ? tg.reps : 0; a.updSet(ei, si, { reps: Math.max(0, Math.round(r + dir)) }); }
        },
        onNext: () => { const el = document.activeElement; if (el && el.tagName === 'INPUT') focusNext(el); },
        onPlates: kind === 'weight' && ex && loadKind(ex) === 'barbell' ? () => a.setSetMenu({ ei, si }) : null
      };
    }
  }), []);

  const total = s.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
  const done = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const active = s.exercises.filter((e) => !e.skipped);
  const exPos = s.cursor ? active.indexOf(s.exercises[s.cursor.ei]) + 1 : active.length;
  const sum = workoutSummary({ exercises: s.exercises.map((e) => Object.assign({}, e, { sets: e.sets.filter((x) => x.done) })) });
  const rirSet = rir ? s.exercises[rir.ei] && s.exercises[rir.ei].sets[rir.si] : null;
  const menuSet = setMenu ? s.exercises[setMenu.ei] && s.exercises[setMenu.ei].sets[setMenu.si] : null;
  const exm = exMenu != null ? s.exercises[exMenu] : null;
  const exmIsBar = exm && loadKind(cat.byId[exm.exerciseId]) === 'barbell';
  function setLoadout(set, ei) {
    const e = s.exercises[ei], ex = cat.byId[e && e.exerciseId];
    const w = set.weight != null ? set.weight : set.target && set.target.weight;
    try { return plateLoadout(w, ex, gym, configs[e.exerciseId]); } catch (err) { return null; }
  }

  return html`<div class="wrap page wk-page">
    <div class="wk-head">
      <button class="back" onClick=${() => { flush(); navigate('/train'); }}><${Icon} name="left"/>${t('train.session.minimize')}</button>
      <div class="wk-headmid"><${Clock} startedAt=${s.startedAt}/><span class="wk-pos">${t('train.pos', { e: exPos || 1, n: active.length, s: Math.min(done + 1, total), t: total })}</span></div>
      <button class="small icn" aria-label=${t('train.session.menu')} onClick=${() => setMenuOpen(true)}><${Icon} name="more"/></button>
      <button class="small primary" onClick=${askFinish}>${t('train.finish')}</button>
    </div>
    <div class="top"><h1 class="wk-title">${s.name || t('train.session.untitled')}</h1></div>
    <div class="hint wk-sub">${gym ? gym.name + ' · ' : ''}${s.date !== todayYmd() ? fmtDate(s.date, 'long') + ' · ' : ''}${t('train.session.progress', { done, total })}${sum.volumeKg ? ' · ' + fmtNum(Math.round(toDisplay('weight', sum.volumeKg, units))) + ' ' + weightUnit(units) : ''}</div>
    <div class="bar wk-prog"><i style=${'width:' + (total ? Math.round(done / total * 100) : 0) + '%'}></i></div>

    ${s.exercises.map((e, ei) => html`<${ExerciseCard} key=${e.id} e=${e} ei=${ei} cur=${s.cursor && s.cursor.ei === ei ? s.cursor.si : -1} total=${s.exercises.length}
      ex=${cat.byId[e.exerciseId]} byId=${cat.byId} prev=${prevByEx[e.exerciseId]} units=${units} hideDone=${!!profile.hideDoneSets}
      showNote=${!!(notes[e.id] || e.notes)} expanded=${!!expanded[e.id]} acts=${acts}/>`)}

    ${!s.exercises.length ? html`<div class="card empty">${t('train.session.empty')}</div>` : null}
    <button class="primary wk-add" onClick=${() => setPicker({ mode: 'add' })}><${Icon} name="plus"/>${t('train.ex.add')}</button>

    <div class="card pad">
      <${Field} label=${t('train.session.notes')}><textarea placeholder=${t('train.session.notesPh')} value=${s.notes} onInput=${(ev) => updLater((c) => Object.assign({}, c, { notes: ev.currentTarget.value }))}></textarea><//>
    </div>
    ${s.exercises.some((e) => !e.cardio) ? html`<${StrengthKcalCard} log=${s} elapsedSec=${s.startedAt ? (Date.now() - Date.parse(s.startedAt)) / 1000 : null} onStats=${(stats) => upd((c) => Object.assign({}, c, { stats }))}/>` : null}
    <div class="wk-bottom-space"></div>

    <${RestBar} rest=${s.rest} work=${s.workStart} canStart=${!!s.cursor} sound=${profile.sound} vibration=${profile.vibration} onChange=${(r) => upd((c) => Object.assign({}, c, { rest: r }))}
      onStart=${() => { unlockAudio(); upd((c) => Object.assign({}, c, { rest: null, workStart: new Date().toISOString() })); }}/>
    <${KeyBar}/>

    <${ExercisePicker} open=${!!picker} onClose=${() => setPicker(null)} title=${picker && picker.mode === 'replace' ? t('train.ex.replace') : t('train.ex.add')}
      similarTo=${picker && picker.mode === 'replace' ? cat.byId[s.exercises[picker.ei] && s.exercises[picker.ei].exerciseId] : null} gym=${gym}
      onPick=${(ex) => (picker.mode === 'replace' ? replaceExercise(picker.ei, ex) : addExercise(ex))}/>
    <${RirSheet} open=${!!rirSet} value=${rirSet && rirSet.rir} target=${rirSet && rirSet.target && rirSet.target.rir} onClose=${() => setRir(null)}
      onPick=${(v) => { const r = rir; setRir(null); upd((c) => Object.assign({}, c, { exercises: c.exercises.map((e, i) => (i === r.ei ? Object.assign({}, e, { sets: e.sets.map((x, j) => (j === r.si ? Object.assign({}, x, { rir: v }) : x)) }) : e)) })); }}/>
    <${SetSheet} open=${!!menuSet} set=${menuSet} onClose=${() => setSetMenu(null)} onChange=${(patch) => { const m = setMenu; upd((c) => Object.assign({}, c, { exercises: c.exercises.map((e, i) => (i === m.ei ? Object.assign({}, e, { sets: e.sets.map((x, j) => (j === m.si ? Object.assign({}, x, patch) : x)) }) : e)) })); }}
      loadout=${menuSet ? setLoadout(menuSet, setMenu.ei) : null} units=${units}
      onDelete=${() => { const { ei, si } = setMenu; setSetMenu(null); updEx(ei, (x) => Object.assign({}, x, { sets: x.sets.filter((_, j) => j !== si) })); upd((c) => Object.assign({}, c, { cursor: null })); }}/>
    <${Sheet} open=${!!exm} onClose=${() => setExMenu(null)} title=${exm ? exName(exm, cat.byId) : ''}>
      ${exm ? html`<div class="list">
        ${[['replace', 'train.ex.replace', 'swap'], ['note', 'train.ex.note', 'list'], ['warmup', 'train.ex.warmup', 'flame'], exmIsBar ? ['plates', 'train.ex.plates', 'plate'] : null,
          exm.group ? ['unlink', 'train.ex.unlink', 'link'] : exMenu < s.exercises.length - 1 ? ['link', 'train.ex.link', 'link'] : null,
          exMenu > 0 ? ['up', 'train.ex.up', 'up'] : null, exMenu < s.exercises.length - 1 ? ['down', 'train.ex.down', 'down'] : null,
          ['skip', exm.skipped ? 'train.ex.unskip' : 'train.ex.skip', 'close'], ['delete', 'train.ex.delete', 'trash']].filter(Boolean).map(([a, l, ic]) => html`<button class=${'lrow' + (a === 'delete' ? ' dangerrow' : '')} type="button" onClick=${() => exAction(exMenu, a)}>
          <span class="lico" style=${'--cc:' + (a === 'delete' ? 'var(--warn)' : 'var(--k-str)')}><${Icon} name=${ic}/></span><span class="ltext"><span class="ll">${t(l)}</span></span></button>`)}
        ${exm.exerciseId ? html`<button class="lrow" type="button" onClick=${() => { setExMenu(null); navigate('/train/exercise/' + encodeURIComponent(exm.exerciseId)); }}><span class="lico" style="--cc:var(--k-plan)"><${Icon} name="info"/></span><span class="ltext"><span class="ll">${t('train.ex.card')}</span></span></button>` : null}
      </div>` : null}
    <//>
    <${Sheet} open=${menuOpen} onClose=${() => setMenuOpen(false)} title=${t('train.session.menu')}>
      <${Field} label=${t('train.session.name')}><input value=${s.name} onInput=${(ev) => updLater((c) => Object.assign({}, c, { name: ev.currentTarget.value }))}/><//>
      <${Field} label=${t('train.session.date')}><input type="date" value=${s.date} max=${todayYmd()} onChange=${(ev) => { const v = ev.currentTarget.value; if (v) upd((c) => Object.assign({}, c, { date: v })); }}/><//>
      <div class="lbl">${t('train.session.gym')}</div>
      <div class="wk-chips pick">${repos.gym.list().map((g) => html`<button class=${'chip' + (s.gymId === g.id ? ' on' : '')} onClick=${() => upd((c) => Object.assign({}, c, { gymId: g.id }))}>${g.name}</button>`)}
        <button class=${'chip' + (!s.gymId ? ' on' : '')} onClick=${() => upd((c) => Object.assign({}, c, { gymId: null }))}>${t('train.session.noGym')}</button></div>
      <div class="hint">${t('train.session.gymHint')}</div>
      <button class="danger" style="width:100%;margin-top:8px" onClick=${() => { setMenuOpen(false); setAsk({ text: t('train.discardAsk'), yes: t('train.discard'), danger: true, run: discard }); }}>${t('train.discard')}</button>
    <//>
    <${FinishSheet} open=${finishOpen} s=${s} logs=${logs} units=${units} byId=${cat.byId} plan=${s.planId ? repos.workoutPlan.get(s.planId) : null}
      onClose=${() => setFinishOpen(false)} onNotes=${(v) => updLater((c) => Object.assign({}, c, { notes: v }))} onFinish=${(o) => { setFinishOpen(false); finish(o); }}/>
    ${ask ? html`<${Confirm} text=${ask.text} yes=${ask.yes} danger=${ask.danger} onNo=${() => setAsk(null)} onYes=${() => { const a = ask; setAsk(null); a.run(); }}/>` : null}
  </div>`;
}

/* Сводка перед сохранением: время, подходы, объём, рекорды, заметка, обновление шаблона */
function FinishSheet({ open, s, logs, units, byId, plan, onClose, onNotes, onFinish }) {
  const [comp, setComp] = useState(false);
  const [weights, setWeights] = useState(false);
  if (!open) return null;
  const now = new Date().toISOString();
  const w = Object.assign(finishSession(s, { now }), { id: 'live' });
  const records = findRecords(w, logs);
  const sum = workoutSummary(w);
  const openSets = s.exercises.some((e) => !e.skipped && e.sets.some((x) => !x.done));
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('train.finish.title')}>
    <div class="wk-tiles">
      <div><small>${t('train.sum.duration')}</small><b>${w.durationSec ? fmtDuration(w.durationSec) : '—'}</b></div>
      <div><small>${t('train.sum.setsT')}</small><b>${sum.sets}</b></div>
      <div><small>${t('train.sum.volume')}</small><b>${sum.volumeKg ? fmtNum(Math.round(toDisplay('weight', sum.volumeKg, units))) : '—'}</b><em>${sum.volumeKg ? weightUnit(units) : ''}</em></div>
    </div>
    ${records.length ? html`<div class="ltitle" style="margin-top:4px">${t('train.pr.title')}</div><div class="card pad" style="padding:6px 14px">
      ${records.map((r) => html`<div class="kv"><span>${exName({ exerciseId: r.exerciseId }, byId)} · ${recordLabel(r.kind)}</span><span><b>${fmtRecord(r.kind, r.value, units)}</b> <small class="hint">${t('train.pr.was', { v: fmtRecord(r.kind, r.prev, units) })}</small></span></div>`)}
    </div>` : null}
    ${openSets ? html`<div class="hint" style="margin:0 0 10px">${t('train.finish.openHint')}</div>` : null}
    <${Field} label=${t('train.session.notes')}><textarea placeholder=${t('train.session.notesPh')} value=${s.notes} onInput=${(ev) => onNotes(ev.currentTarget.value)}></textarea><//>
    ${plan ? html`<div class="ltitle">${t('train.finish.updPlan', { name: plan.name })}</div>
      <div class="wk-togs"><${Toggle} on=${comp} onChange=${setComp} label=${t('train.finish.updComp')}/><${Toggle} on=${weights} onChange=${setWeights} label=${t('train.finish.updWeights')}/></div>` : null}
    <button class="primary" style="width:100%;margin-top:14px" onClick=${() => onFinish({ updateComposition: comp, updateWeights: weights })}>${t('train.finish.save')}</button>
  <//>`;
}

/* Карточка упражнения: сделанное схлопывается в строку, разминка — одна строка, подходы — сетка с полями */
const ExerciseCard = memo(ExerciseCardView, (a, b) => a.ei === b.ei && a.cur === b.cur && a.units === b.units && a.hideDone === b.hideDone && a.showNote === b.showNote && a.expanded === b.expanded
  && a.ex === b.ex && a.total === b.total && a.acts === b.acts && a.prev === b.prev && JSON.stringify(a.e) === JSON.stringify(b.e));

function ExerciseCardView({ e, ei, cur, ex, byId, prev, units, hideDone, showNote, expanded, acts }) {
  const cardio = !!e.cardio || isCardio(ex);
  const { cols, rir } = columnsFor(ex, cardio);
  const bw = ex && (ex.equipment || []).includes('bodyweight');
  const [warmOpen, setWarmOpen] = useState(false);
  const grid = '34px ' + cols.map(() => 'minmax(0,1fr)').join(' ') + (rir ? ' 44px' : '') + ' 46px';
  const tg = e.target;
  const tgText = tg ? [tg.sets ? tg.sets + ' × ' : '', tg.repMin != null ? (tg.repMax != null && tg.repMax !== tg.repMin ? tg.repMin + '–' + tg.repMax : tg.repMin) : tg.timeSec ? fmtClock(tg.timeSec) : '', tg.rir != null ? ' · RIR ' + tg.rir : ''].join('') : '';
  const working = e.sets.filter((x) => x.type !== 'warmup');
  const warm = e.sets.filter((x) => x.type === 'warmup');
  const allDone = !e.skipped && e.sets.length > 0 && e.sets.every((x) => x.done);
  const doneCount = e.sets.filter((x) => x.done).length;
  const name = exName(e, byId);

  /* сделано целиком — одна строка; тап разворачивает */
  if (allDone && !expanded) {
    const same = working.length && working.every((x) => fmtSet(x, units, { cardio }) === fmtSet(working[0], units, { cardio }));
    const line = working.length ? (same ? t('train.doneLine', { n: working.length, s: fmtSet(working[0], units, { cardio }) }) : working.map((x) => fmtSet(x, units, { cardio })).join(' · ')) : t('train.warmup.done');
    return html`<button class="card wk-ex done" id=${'wk-' + e.id} type="button" onClick=${() => acts.onExpand(e.id)} aria-expanded="false">
      <span class="wk-ok"><${Icon} name="check"/></span><b class="grow">${name}</b><span>${line}</span>
    </button>`;
  }

  let workIdx = 0;
  const colLabel = (c) => c === 'weight' ? (bw ? t('train.col.extra', { u: weightUnit(units) }) : weightUnit(units)) : c === 'assist' ? t('train.col.assist') : c === 'reps' ? t('train.col.reps') : c === 'time' ? (cardio ? t('train.col.min') : t('train.col.sec')) : (cardio ? t(unitKey('distance', units)) : t('unit.m'));
  const warmDone = warm.length && warm.every((x) => x.done);
  const warmText = warm.map((x) => { const tgt = x.target || {}; const w = x.weight != null ? x.weight : tgt.weight, r = x.reps != null ? x.reps : tgt.reps; return (w != null ? fmtWeight(w, units, 2) : '—') + '×' + (r != null ? r : '—'); }).join(' · ');
  const setRow = (x, si) => {
    const isWarm = x.type === 'warmup';
    if (!isWarm) workIdx++;
    if (hideDone && x.done && doneCount < e.sets.length && !isWarm) return null;
    const tgt = x.target || {};
    const label = x.type && x.type !== 'normal' ? setTypeShort(x.type) : String(workIdx);
    return html`<div class=${'wk-set' + (x.done ? ' done' : '') + (si === cur ? ' cur' : '') + (isWarm ? ' warm' : '')} style=${'grid-template-columns:' + grid}>
      <button class="wk-sn" aria-label=${t('train.set.aria', { n: si + 1 })} onClick=${() => acts.onSetMenu(ei, si)}>${label}${x.side === 'left' ? html`<small>${t('side.s.left')}</small>` : x.side === 'right' ? html`<small>${t('side.s.right')}</small>` : null}</button>
      ${cols.map((c) => c === 'weight' ? html`<${NumIn} value=${toDisplay('weight', x.weight, units)} placeholder=${tgt.weight != null ? fmtNum(Math.round(toDisplay('weight', tgt.weight, units) * 100) / 100, 2) : bw ? '+0' : ''} label=${weightUnit(units)} bar=${acts.barFor(ei, si, 'weight')} onCommit=${(v) => acts.onSet(ei, si, { weight: v == null ? null : Math.max(0, fromDisplay('weight', v, units)) })}/>`
        : c === 'assist' ? html`<${NumIn} value=${toDisplay('weight', x.assist, units)} placeholder=${tgt.assist != null ? fmtNum(toDisplay('weight', tgt.assist, units), 1) : ''} label=${t('train.col.assist')} bar=${acts.barFor(ei, si, 'other')} onCommit=${(v) => acts.onSet(ei, si, { assist: v == null ? null : Math.max(0, fromDisplay('weight', v, units)) })}/>`
        : c === 'reps' ? html`<${NumIn} mode="numeric" value=${x.reps} placeholder=${tgt.reps != null ? String(tgt.reps) : ''} label=${t('train.col.reps')} bar=${acts.barFor(ei, si, 'reps')} onCommit=${(v) => acts.onSet(ei, si, { reps: v == null ? null : Math.max(0, Math.round(v)) })}/>`
        : c === 'time' ? (cardio
          ? html`<${NumIn} value=${x.timeSec != null ? x.timeSec / 60 : null} digits=${1} placeholder=${tgt.timeSec != null ? fmtNum(tgt.timeSec / 60, 1) : ''} label=${t('train.col.min')} bar=${acts.barFor(ei, si, 'other')} onCommit=${(v) => acts.onSet(ei, si, { timeSec: v == null ? null : Math.round(Math.max(0, v) * 60) })}/>`
          : html`<${NumIn} mode="numeric" value=${x.timeSec} placeholder=${tgt.timeSec != null ? String(tgt.timeSec) : ''} label=${t('train.col.sec')} bar=${acts.barFor(ei, si, 'other')} onCommit=${(v) => acts.onSet(ei, si, { timeSec: v == null ? null : Math.max(0, Math.round(v)) })}/>`)
        : (cardio
          ? html`<${NumIn} value=${x.distanceM != null ? toDisplay('distance', x.distanceM / 1000, units) : null} placeholder=${tgt.distanceM != null ? fmtNum(toDisplay('distance', tgt.distanceM / 1000, units), 2) : ''} label=${t(unitKey('distance', units))} bar=${acts.barFor(ei, si, 'other')} onCommit=${(v) => acts.onSet(ei, si, { distanceM: v == null ? null : Math.round(fromDisplay('distance', v, units) * 1000) })}/>`
          : html`<${NumIn} mode="numeric" value=${x.distanceM} placeholder=${tgt.distanceM != null ? String(tgt.distanceM) : ''} label=${t('unit.m')} bar=${acts.barFor(ei, si, 'other')} onCommit=${(v) => acts.onSet(ei, si, { distanceM: v == null ? null : Math.max(0, Math.round(v)) })}/>`))}
      ${rir ? html`<button class=${'wk-rir' + (x.rir == null ? ' ph' : '')} aria-label=${t('train.rir.title')} onClick=${() => acts.onRir(ei, si)}>${x.rir != null ? (x.rir >= 5 ? '5+' : fmtNum(x.rir)) : tgt.rir != null ? fmtNum(tgt.rir) : '—'}</button>` : null}
      <button class=${'chk wk-chk' + (x.done ? ' on' : '')} aria-label=${x.done ? t('train.set.undone') : t('train.set.done')} aria-pressed=${!!x.done} onClick=${() => acts.onDone(ei, si)}><${Icon} name="check"/></button>
    </div>`;
  };

  return html`<div class=${'card ex wk-ex' + (e.skipped ? ' skipped' : '') + (e.group ? ' grouped' : '')} id=${'wk-' + e.id}>
    <div class="wk-exh">
      <div class="grow">
        ${e.group ? html`<span class="wk-grp">${t(e.groupKind === 'circuit' ? 'train.group.circuit' : 'train.group.superset', { g: e.group })}</span>` : null}
        <div class="exn">${name}</div>
        ${tgText ? html`<div class="tg">${t('train.target')}: ${tgText}</div>` : null}
      </div>
      ${allDone ? html`<button class="small icn" aria-label=${t('train.ex.collapse')} onClick=${() => acts.onExpand(e.id)}><${Icon} name="up"/></button>` : null}
      <button class="small icn" aria-label=${t('train.ex.menu')} onClick=${() => acts.onMenu(ei)}><${Icon} name="more"/></button>
    </div>
    ${!e.skipped && e.exerciseId && e.sets.some((x) => !x.done && x.target && x.target.expanded) ? html`<div class="wk-fix" role="note"><span class="wand" aria-hidden="true"></span>
      <span class="grow">${t('train.prog.fixText', { reason: progReason((e.sets.find((x) => !x.done && x.target && x.target.expanded).target || {}).reason) })}</span>
      <button class="small" onClick=${() => navigate('/train/exercise/' + encodeURIComponent(e.exerciseId))}>${t('train.prog.fix')}</button></div>` : null}
    ${prev ? html`<div class="wk-prev">${t('train.prev', { d: fmtDate(prev.date) })}: ${prev.sets.filter((x) => x.type !== 'warmup').map((x) => fmtSet(x, units, { cardio })).join(' · ')}</div>` : null}
    ${e.skipped ? html`<div class="hint">${t('train.ex.skipped')}</div>` : html`
    ${warm.length && !warmOpen ? html`<div class=${'wk-warm' + (warmDone ? ' done' : '')}>
      <b>${t('settype.s.warmup')}</b>
      <button class="t" type="button" aria-expanded="false" onClick=${() => setWarmOpen(true)}>${t('train.warmup.row')}: ${warmText}</button>
      <button class="ok" type="button" aria-label=${warmDone ? t('train.warmup.done') : t('train.warmup.mark')} aria-pressed=${!!warmDone} onClick=${() => (warmDone ? setWarmOpen(true) : acts.onWarmDone(ei))}><${Icon} name="check"/></button>
    </div>` : null}
    <div class="wk-cols" style=${'grid-template-columns:' + grid}><span>${t('train.col.set')}</span>${cols.map((c) => html`<span>${colLabel(c)}</span>`)}${rir ? html`<span>RIR</span>` : null}<span></span></div>
    ${e.sets.map((x, si) => (x.type === 'warmup' && !warmOpen ? null : setRow(x, si)))}
    ${cardio ? html`<${CardioFields} e=${e} onEx=${(patch) => acts.onEx(ei, patch)}/>` : null}
    <div class="acts"><button class="small" onClick=${() => acts.onAddSet(ei)}>${t('train.set.add')}</button>${warmOpen ? html`<button class="small" onClick=${() => setWarmOpen(false)}>${t('train.warmup.collapse')}</button>` : null}</div>`}
    ${showNote ? html`<textarea class="wk-note" placeholder=${t('train.ex.notePh')} value=${e.notes} onInput=${(ev) => acts.onNote(ei, ev.currentTarget.value)}></textarea>` : null}
  </div>`;
}

/* Кардио: скорость, наклон, пульс, калории с часов, шаги */
function CardioFields({ e, onEx }) {
  const c = e.cardio || {};
  const set = (k, v) => onEx({ cardio: Object.assign({ inSteps: true }, c, { [k]: v }) });
  const F = [['speedKmh', 'cardio.speed', 1], ['inclinePct', 'cardio.incline', 1], ['avgHr', 'cardio.avgHr', 0], ['kcalWatch', 'cardio.kcalWatch', 0], ['steps', 'cardio.steps', 0]];
  return html`<div class="grid2 wk-cardio">
    ${F.map(([k, l, d]) => html`<label class="fld"><span class="lbl">${t(l)}</span><${NumIn} mode=${d ? 'decimal' : 'numeric'} digits=${d} value=${c[k]} label=${t(l)} onCommit=${(v) => set(k, v == null ? null : d ? v : Math.round(v))}/></label>`)}
    <label class="fld"><span class="lbl">${t('cardio.inSteps')}</span><button class=${'sw' + (c.inSteps !== false ? ' on' : '')} role="switch" aria-checked=${c.inSteps !== false} aria-label=${t('cardio.inSteps')} onClick=${() => set('inSteps', c.inSteps === false)}><i></i></button></label>
  </div>`;
}
