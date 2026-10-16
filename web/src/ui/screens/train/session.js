/* Активная тренировка: подходы (вес / помощь / повторы / время / дистанция, RIR, тип, сторона), предыдущие значения,
   суперсеты, замена / пропуск / добавление упражнения, заметки, таймер отдыха, общий таймер, завершение с рекордами. */
import { html, useApp, useData, useState, useEffect, useMemo, navigate, todayYmd } from '../../core.js';
import { Sheet, Confirm, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { completeSet, uncompleteSet, finishSession, findRecords, exerciseEntry, previousSets, targetFor, workoutSummary } from '../../../domain/workout.js';
import { isCardio } from '../../../domain/exercises.js';
import { toDisplay, fromDisplay, unitKey } from '../../../domain/units.js';
import { uid } from '../../../data/ids.js';
import { useCatalog, exName, fmtSet, fmtClock, setTypeShort, weightUnit } from '../../train/catalog.js';
import { plateLoadout, warmupSetsForEntry, workingWeightOf, availableInGym, loadKind } from '../../../domain/gym.js';
import { ExercisePicker } from '../../train/picker.js';
import { RestBar, useNow, unlockAudio, useWakeLock } from '../../train/timer.js';
import { NumIn, RirSheet, SetSheet } from '../../train/inputs.js';

const GROUPS = 'ABCDEFGH';

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

export function TrainSession() {
  const app = useApp();
  const { repos, store } = app;
  useData(['workoutSessions', 'workoutLogs', 'workoutProfile', 'exerciseConfigs', 'profile', 'gyms']);
  const cat = useCatalog();
  const s = repos.workoutSession.get('current');
  const profile = repos.workoutProfile.get();
  const units = repos.profile.get().units;
  const gym = s && s.gymId ? repos.gym.get(s.gymId) : null;
  const now = useNow(!!s, 1000);
  const [picker, setPicker] = useState(null); /* { mode: 'add' } | { mode: 'replace', ei } */
  const [rir, setRir] = useState(null); /* { ei, si } */
  const [setMenu, setSetMenu] = useState(null);
  const [exMenu, setExMenu] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ask, setAsk] = useState(null);
  const [notes, setNotes] = useState({});
  const [showDone, setShowDone] = useState({});
  useWakeLock(!!s && profile.keepAwake);

  const logs = repos.workout.list();
  const prevByEx = useMemo(() => {
    const m = {};
    if (s) s.exercises.forEach((e) => { if (e.exerciseId && !m[e.exerciseId]) m[e.exerciseId] = previousSets(logs, e.exerciseId, { programId: profile.previousFrom === 'program' ? s.programId : null }); });
    return m;
  }, [s && s.exercises.map((e) => e.exerciseId).join(','), store.version('workoutLogs')]);

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

  const get = () => repos.workoutSession.get('current');
  const save = (next) => repos.workoutSession.save(next);
  const upd = (fn) => { const cur = get(); if (cur) save(fn(cur)); };
  const updEx = (ei, fn) => upd((cur) => Object.assign({}, cur, { exercises: cur.exercises.map((e, i) => (i === ei ? fn(e) : e)) }));
  const updSet = (ei, si, patch) => updEx(ei, (e) => Object.assign({}, e, { sets: e.sets.map((x, j) => (j === si ? Object.assign({}, x, patch) : x)) }));
  const configs = {};
  repos.userExerciseConfig.list().forEach((c) => { configs[c.id] = c; });

  function toggleDone(ei, si) {
    unlockAudio();
    const cur = get();
    const set = cur.exercises[ei].sets[si];
    if (set.done) save(uncompleteSet(cur, ei, si));
    else save(completeSet(cur, ei, si, { now: new Date().toISOString(), catalog: cat.byId, configs, profile }));
  }

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
      /* пересчитать разминку по рабочему весу и залу: невыполненные разминочные заменяются; не вышло — пустой подход */
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
      const exs = cur.exercises.map((x, i) => (i === ei || i === ei + 1 ? Object.assign({}, x, { group: g, groupKind: x.groupKind || 'superset' }) : x));
      save(Object.assign({}, cur, { exercises: exs }));
      return;
    }
    if (act === 'unlink') {
      const g = e.group;
      let exs = cur.exercises.map((x, i) => (i === ei ? Object.assign({}, x, { group: '', groupKind: null }) : x));
      const left = exs.filter((x) => x.group === g);
      if (left.length === 1) exs = exs.map((x) => (x.group === g ? Object.assign({}, x, { group: '', groupKind: null }) : x));
      save(Object.assign({}, cur, { exercises: exs }));
    }
  }

  async function finish() {
    const cur = get();
    const nowIso = new Date().toISOString();
    const w = finishSession(cur, { now: nowIso });
    w.id = uid();
    w.records = findRecords(w, logs);
    await store.batch([repos.workout.putOp(w), repos.workoutSession.removeOp('current')]);
    navigate('/train/log/' + w.id + '?done=1', { replace: true });
  }

  function askFinish() {
    const cur = get();
    const done = cur.exercises.some((e) => e.sets.some((x) => x.done));
    if (!done) { setAsk({ text: t('train.finish.empty'), yes: t('train.discard'), danger: true, run: discard }); return; }
    const open = cur.exercises.some((e) => !e.skipped && e.sets.some((x) => !x.done));
    if (open) { setAsk({ text: t('train.finish.open'), yes: t('train.finish'), run: finish }); return; }
    finish();
  }

  async function discard() { await repos.workoutSession.remove('current'); navigate('/train', { replace: true }); }

  const total = s.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
  const done = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const elapsed = s.startedAt ? (now - Date.parse(s.startedAt)) / 1000 : 0;
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
      <button class="back" onClick=${() => navigate('/train')}><${Icon} name="left"/>${t('train.session.minimize')}</button>
      <div class="wk-clock" aria-label=${t('train.session.elapsed')}><${Icon} name="timer"/>${fmtClock(elapsed)}</div>
      <button class="small icn" aria-label=${t('train.session.menu')} onClick=${() => setMenuOpen(true)}><${Icon} name="more"/></button>
      <button class="small primary" onClick=${askFinish}>${t('train.finish')}</button>
    </div>
    <div class="top"><h1 class="wk-title">${s.name || t('train.session.untitled')}</h1></div>
    <div class="hint wk-sub">${gym ? gym.name + ' · ' : ''}${s.date !== todayYmd() ? fmtDate(s.date, 'long') + ' · ' : ''}${t('train.session.progress', { done, total })}${sum.volumeKg ? ' · ' + fmtNum(Math.round(toDisplay('weight', sum.volumeKg, units))) + ' ' + weightUnit(units) : ''}</div>
    <div class="bar wk-prog"><i style=${'width:' + (total ? Math.round(done / total * 100) : 0) + '%'}></i></div>

    ${s.exercises.map((e, ei) => html`<${ExerciseCard} key=${e.id} e=${e} ei=${ei} s=${s} ex=${cat.byId[e.exerciseId]} byId=${cat.byId} prev=${prevByEx[e.exerciseId]} units=${units} profile=${profile}
      showNote=${notes[e.id] || !!e.notes} showDone=${!!showDone[e.id]} onShowDone=${() => setShowDone(Object.assign({}, showDone, { [e.id]: true }))}
      onSet=${(si, patch) => updSet(ei, si, patch)} onDone=${(si) => toggleDone(ei, si)} onRir=${(si) => setRir({ ei, si })} onSetMenu=${(si) => setSetMenu({ ei, si })}
      onAddSet=${() => updEx(ei, (x) => { const last = x.sets[x.sets.length - 1]; return Object.assign({}, x, { sets: x.sets.concat([{ id: uid(), type: last && last.type !== 'warmup' ? last.type : 'normal', side: 'both', perSide: !!(last && last.perSide), done: false, target: last ? Object.assign({}, last.target || {}, last.done ? { weight: last.weight, reps: last.reps, timeSec: last.timeSec, distanceM: last.distanceM } : {}) : null }]) }); })}
      onMenu=${() => setExMenu(ei)} onEx=${(patch) => updEx(ei, (x) => Object.assign({}, x, patch))}/>`)}

    ${!s.exercises.length ? html`<div class="card empty">${t('train.session.empty')}</div>` : null}
    <button class="primary wk-add" onClick=${() => setPicker({ mode: 'add' })}><${Icon} name="plus"/>${t('train.ex.add')}</button>

    <div class="card pad">
      <${Field} label=${t('train.session.notes')}><textarea placeholder=${t('train.session.notesPh')} value=${s.notes} onInput=${(ev) => upd((c) => Object.assign({}, c, { notes: ev.currentTarget.value }))}></textarea><//>
      <details class="wk-stats"><summary>${t('train.stats.title')}</summary>
        <div class="grid2">
          ${[['avgHr', 'train.stats.avgHr', 'numeric'], ['maxHr', 'train.stats.maxHr', 'numeric'], ['kcalWatch', 'train.stats.kcalWatch', 'numeric'], ['kcal', 'train.stats.kcal', 'numeric'], ['steps', 'train.stats.steps', 'numeric']].map(([k, l, m]) => html`<label class="fld"><span class="lbl">${t(l)}</span>
            <${NumIn} mode=${m} value=${s.stats && s.stats[k]} onCommit=${(v) => upd((c) => Object.assign({}, c, { stats: Object.assign({}, c.stats, { [k]: v == null ? null : Math.round(v) }) }))} label=${t(l)}/></label>`)}
        </div>
        <div class="hint">${t('train.stats.hint')}</div>
      </details>
    </div>
    <div class="wk-bottom-space"></div>

    <${RestBar} rest=${s.rest} sound=${profile.sound} vibration=${profile.vibration} onChange=${(r) => upd((c) => Object.assign({}, c, { rest: r }))}/>

    <${ExercisePicker} open=${!!picker} onClose=${() => setPicker(null)} title=${picker && picker.mode === 'replace' ? t('train.ex.replace') : t('train.ex.add')}
      similarTo=${picker && picker.mode === 'replace' ? cat.byId[s.exercises[picker.ei] && s.exercises[picker.ei].exerciseId] : null} gym=${gym}
      onPick=${(ex) => (picker.mode === 'replace' ? replaceExercise(picker.ei, ex) : addExercise(ex))}/>
    <${RirSheet} open=${!!rirSet} value=${rirSet && rirSet.rir} target=${rirSet && rirSet.target && rirSet.target.rir} onClose=${() => setRir(null)}
      onPick=${(v) => { updSet(rir.ei, rir.si, { rir: v }); setRir(null); }}/>
    <${SetSheet} open=${!!menuSet} set=${menuSet} onClose=${() => setSetMenu(null)} onChange=${(patch) => updSet(setMenu.ei, setMenu.si, patch)}
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
      <${Field} label=${t('train.session.name')}><input value=${s.name} onInput=${(ev) => upd((c) => Object.assign({}, c, { name: ev.currentTarget.value }))}/><//>
      <${Field} label=${t('train.session.date')}><input type="date" value=${s.date} max=${todayYmd()} onChange=${(ev) => { const v = ev.currentTarget.value; if (v) upd((c) => Object.assign({}, c, { date: v })); }}/><//>
      <div class="lbl">${t('train.session.gym')}</div>
      <div class="wk-chips pick">${repos.gym.list().map((g) => html`<button class=${'chip' + (s.gymId === g.id ? ' on' : '')} onClick=${() => upd((c) => Object.assign({}, c, { gymId: g.id }))}>${g.name}</button>`)}
        <button class=${'chip' + (!s.gymId ? ' on' : '')} onClick=${() => upd((c) => Object.assign({}, c, { gymId: null }))}>${t('train.session.noGym')}</button></div>
      <div class="hint">${t('train.session.gymHint')}</div>
      <button class="danger" style="width:100%;margin-top:8px" onClick=${() => { setMenuOpen(false); setAsk({ text: t('train.discardAsk'), yes: t('train.discard'), danger: true, run: discard }); }}>${t('train.discard')}</button>
    <//>
    ${ask ? html`<${Confirm} text=${ask.text} yes=${ask.yes} danger=${ask.danger} onNo=${() => setAsk(null)} onYes=${() => { const a = ask; setAsk(null); a.run(); }}/>` : null}
  </div>`;
}

function ExerciseCard({ e, ei, s, ex, byId, prev, units, profile, showNote, showDone, onShowDone, onSet, onDone, onRir, onSetMenu, onAddSet, onMenu, onEx }) {
  const cardio = !!e.cardio || isCardio(ex);
  const { cols, rir } = columnsFor(ex, cardio);
  const bw = ex && (ex.equipment || []).includes('bodyweight');
  const grid = '34px ' + cols.map(() => 'minmax(0,1fr)').join(' ') + (rir ? ' 44px' : '') + ' 46px';
  const cur = s.cursor && s.cursor.ei === ei ? s.cursor.si : -1;
  const tg = e.target;
  const tgText = tg ? [tg.sets ? tg.sets + ' × ' : '', tg.repMin != null ? (tg.repMax != null && tg.repMax !== tg.repMin ? tg.repMin + '–' + tg.repMax : tg.repMin) : tg.timeSec ? fmtClock(tg.timeSec) : '', tg.rir != null ? ' · RIR ' + tg.rir : ''].join('') : '';
  const hideDone = profile.hideDoneSets && !showDone;
  const doneCount = e.sets.filter((x) => x.done).length;
  let workIdx = 0;
  const colLabel = (c) => c === 'weight' ? (bw ? t('train.col.extra', { u: weightUnit(units) }) : weightUnit(units)) : c === 'assist' ? t('train.col.assist') : c === 'reps' ? t('train.col.reps') : c === 'time' ? (cardio ? t('train.col.min') : t('train.col.sec')) : (cardio ? t(unitKey('distance', units)) : t('unit.m'));
  return html`<div class=${'card ex wk-ex' + (e.skipped ? ' skipped' : '') + (e.group ? ' grouped' : '')} id=${'wk-' + e.id}>
    <div class="wk-exh">
      <div class="grow">
        ${e.group ? html`<span class="wk-grp">${t(e.groupKind === 'circuit' ? 'train.group.circuit' : 'train.group.superset', { g: e.group })}</span>` : null}
        <div class="exn">${exName(e, byId)}</div>
        ${tgText ? html`<div class="tg">${t('train.target')}: ${tgText}</div>` : null}
      </div>
      <button class="small icn" aria-label=${t('train.ex.menu')} onClick=${onMenu}><${Icon} name="more"/></button>
    </div>
    ${prev ? html`<div class="wk-prev">${t('train.prev', { d: fmtDate(prev.date) })}: ${prev.sets.filter((x) => x.type !== 'warmup').map((x) => fmtSet(x, units, { cardio })).join(' · ')}</div>` : null}
    ${e.skipped ? html`<div class="hint">${t('train.ex.skipped')}</div>` : html`
    <div class="wk-cols" style=${'grid-template-columns:' + grid}><span>${t('train.col.set')}</span>${cols.map((c) => html`<span>${colLabel(c)}</span>`)}${rir ? html`<span>RIR</span>` : null}<span></span></div>
    ${hideDone && doneCount && doneCount < e.sets.length ? html`<button class="wk-donebtn" onClick=${onShowDone}>${t('train.doneSets', { count: doneCount })}</button>` : null}
    ${e.sets.map((x, si) => {
      const warm = x.type === 'warmup';
      if (!warm) workIdx++;
      if (hideDone && x.done && doneCount < e.sets.length) return null;
      const tgt = x.target || {};
      const label = x.type && x.type !== 'normal' ? setTypeShort(x.type) : String(workIdx);
      return html`<div class=${'wk-set' + (x.done ? ' done' : '') + (si === cur ? ' cur' : '') + (warm ? ' warm' : '')} style=${'grid-template-columns:' + grid}>
        <button class="wk-sn" aria-label=${t('train.set.aria', { n: si + 1 })} onClick=${() => onSetMenu(si)}>${label}${x.side === 'left' ? html`<small>${t('side.s.left')}</small>` : x.side === 'right' ? html`<small>${t('side.s.right')}</small>` : null}</button>
        ${cols.map((c) => c === 'weight' ? html`<${NumIn} value=${toDisplay('weight', x.weight, units)} placeholder=${tgt.weight != null ? fmtNum(Math.round(toDisplay('weight', tgt.weight, units) * 100) / 100, 2) : bw ? '+0' : ''} label=${weightUnit(units)} onCommit=${(v) => onSet(si, { weight: v == null ? null : Math.max(0, fromDisplay('weight', v, units)) })}/>`
          : c === 'assist' ? html`<${NumIn} value=${toDisplay('weight', x.assist, units)} placeholder=${tgt.assist != null ? fmtNum(toDisplay('weight', tgt.assist, units), 1) : ''} label=${t('train.col.assist')} onCommit=${(v) => onSet(si, { assist: v == null ? null : Math.max(0, fromDisplay('weight', v, units)) })}/>`
          : c === 'reps' ? html`<${NumIn} mode="numeric" value=${x.reps} placeholder=${tgt.reps != null ? String(tgt.reps) : ''} label=${t('train.col.reps')} onCommit=${(v) => onSet(si, { reps: v == null ? null : Math.max(0, Math.round(v)) })}/>`
          : c === 'time' ? (cardio
            ? html`<${NumIn} value=${x.timeSec != null ? x.timeSec / 60 : null} digits=${1} placeholder=${tgt.timeSec != null ? fmtNum(tgt.timeSec / 60, 1) : ''} label=${t('train.col.min')} onCommit=${(v) => onSet(si, { timeSec: v == null ? null : Math.round(Math.max(0, v) * 60) })}/>`
            : html`<${NumIn} mode="numeric" value=${x.timeSec} placeholder=${tgt.timeSec != null ? String(tgt.timeSec) : ''} label=${t('train.col.sec')} onCommit=${(v) => onSet(si, { timeSec: v == null ? null : Math.max(0, Math.round(v)) })}/>`)
          : (cardio
            ? html`<${NumIn} value=${x.distanceM != null ? toDisplay('distance', x.distanceM / 1000, units) : null} placeholder=${tgt.distanceM != null ? fmtNum(toDisplay('distance', tgt.distanceM / 1000, units), 2) : ''} label=${t(unitKey('distance', units))} onCommit=${(v) => onSet(si, { distanceM: v == null ? null : Math.round(fromDisplay('distance', v, units) * 1000) })}/>`
            : html`<${NumIn} mode="numeric" value=${x.distanceM} placeholder=${tgt.distanceM != null ? String(tgt.distanceM) : ''} label=${t('unit.m')} onCommit=${(v) => onSet(si, { distanceM: v == null ? null : Math.max(0, Math.round(v)) })}/>`))}
        ${rir ? html`<button class=${'wk-rir' + (x.rir == null ? ' ph' : '')} aria-label=${t('train.rir.title')} onClick=${() => onRir(si)}>${x.rir != null ? (x.rir >= 5 ? '5+' : fmtNum(x.rir)) : tgt.rir != null ? fmtNum(tgt.rir) : '—'}</button>` : null}
        <button class=${'chk wk-chk' + (x.done ? ' on' : '')} aria-label=${x.done ? t('train.set.undone') : t('train.set.done')} aria-pressed=${!!x.done} onClick=${() => onDone(si)}><${Icon} name="check"/></button>
      </div>`;
    })}
    ${cardio ? html`<${CardioFields} e=${e} onEx=${onEx}/>` : null}
    <div class="acts"><button class="small" onClick=${onAddSet}>${t('train.set.add')}</button></div>`}
    ${showNote ? html`<textarea class="wk-note" placeholder=${t('train.ex.notePh')} value=${e.notes} onInput=${(ev) => onEx({ notes: ev.currentTarget.value })}></textarea>` : null}
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
