/* История тренировок: список по месяцам, карточка тренировки с итогами и рекордами, правка и удаление. */
import { html, useApp, useData, useState, navigate, goBack, todayYmd } from '../../core.js';
import { Page, Card, Confirm, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { sortLogs, workoutSummary, findRecords, cardioPace, legacyCardioType } from '../../../domain/workout.js';
import { toDisplay, fromDisplay, unitKey } from '../../../domain/units.js';
import { useCatalog, exName, fmtSet, fmtDuration, recordLabel, weightUnit, fmtWeight, setTypeShort, cardioTypeLabel } from '../../train/catalog.js';
import { NumIn } from '../../train/inputs.js';
import { startWorkout } from './train.js';

/* Строка тренировки в списке */
export function LogRow({ w, byId, units }) {
  const sum = workoutSummary(w);
  const cardio = (w.exercises || []).length && w.exercises.every((e) => e.cardio);
  const parts = [];
  if (w.durationSec) parts.push(fmtDuration(w.durationSec));
  if (cardio) {
    if (sum.distanceM) parts.push(fmtNum(Math.round(toDisplay('distance', sum.distanceM / 1000, units) * 100) / 100, 2) + ' ' + t(unitKey('distance', units)));
  } else {
    parts.push(t('train.sum.sets', { count: sum.sets }));
    if (sum.volumeKg) parts.push(fmtNum(Math.round(toDisplay('weight', sum.volumeKg, units))) + ' ' + weightUnit(units));
  }
  const name = w.name || (w.exercises[0] ? exName(w.exercises[0], byId) : t('train.session.untitled'));
  return html`<button class="lrow" type="button" onClick=${() => navigate('/train/log/' + w.id)}>
    <span class="lico" style=${'--cc:' + (cardio ? 'var(--k-steps)' : 'var(--k-str)')}><${Icon} name=${cardio ? 'heart' : 'train'}/></span>
    <span class="ltext"><span class="ll">${name}</span><span class="ls">${fmtDate(w.date, 'long')} · ${parts.join(' · ')}</span></span>
    ${(w.records || []).length ? html`<span class="lbadge wk-pr">${t('train.pr.badge', { n: w.records.length })}</span>` : null}
  </button>`;
}

export function WorkoutHistory() {
  const { repos } = useApp();
  useData(['workoutLogs', 'profile']);
  const cat = useCatalog();
  const units = repos.profile.get().units;
  const logs = sortLogs(repos.workout.list());
  const months = [];
  logs.forEach((w) => { const m = w.date.slice(0, 7); let g = months[months.length - 1]; if (!g || g.m !== m) months.push(g = { m, items: [] }); g.items.push(w); });
  return html`<${Page} title=${t('train.history')} icon="cal" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train" backLabel=${t('nav.train')}>
    ${!logs.length ? html`<div class="card empty">${t('train.history.empty')}</div>` : null}
    ${months.map((g) => html`<div class="ltitle">${fmtDate(g.m + '-01', 'month')} · ${t('train.week.workouts', { count: g.items.length })}</div>
      <div class="list">${g.items.map((w) => html`<${LogRow} w=${w} byId=${cat.byId} units=${units}/>`)}</div>`)}
  <//>`;
}

export function WorkoutLog({ route }) {
  const app = useApp();
  const { repos } = app;
  useData(['workoutLogs', 'profile', 'workoutSessions']);
  const cat = useCatalog();
  const units = repos.profile.get().units;
  const id = decodeURIComponent(route.parts[2] || '');
  const w = repos.workout.get(id);
  const [edit, setEdit] = useState(false);
  const [ask, setAsk] = useState(null);
  if (!w) return html`<${Page} title=${t('train.history')} back="/train/history" backLabel=${t('train.history')}><div class="card empty">${t('train.log.none')}</div><//>`;
  const sum = workoutSummary(w);
  const upd = (patch) => repos.workout.update(w.id, patch);
  const updEx = (ei, fn) => upd({ exercises: w.exercises.map((e, i) => (i === ei ? fn(e) : e)) });
  const updSet = (ei, si, patch) => updEx(ei, (e) => Object.assign({}, e, { sets: e.sets.map((x, j) => (j === si ? Object.assign({}, x, patch) : x)) }));
  function finishEdit() {
    const cur = repos.workout.get(w.id);
    const exercises = cur.exercises.filter((e) => e.sets.length);
    const next = Object.assign({}, cur, { exercises });
    upd({ exercises, records: findRecords(next, repos.workout.list()) });
    setEdit(false);
  }
  function repeat() {
    const plan = { id: null, name: w.name, programId: w.programId, sections: [{ id: 'm', kind: 'main', items: w.exercises.map((e) => ({ id: '', exerciseId: e.exerciseId, name: e.name, sets: e.sets.filter((x) => x.type !== 'warmup').length || 1, group: e.group, groupKind: e.groupKind })) }] };
    if (repos.workoutSession.get('current')) { navigate('/train/session'); return; }
    startWorkout(app, { plan, date: todayYmd(), catalog: cat.byId });
  }
  const done = route.query.done === '1';
  return html`<${Page} title=${w.name || t('train.session.untitled')} icon="train" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train/history" backLabel=${t('train.history')}
      right=${html`<button class="small" onClick=${() => (edit ? finishEdit() : setEdit(true))}>${edit ? t('common.done') : t('common.edit')}</button>`}>
    ${done ? html`<div class="banner ok wk-saved"><${Icon} name="check"/>${t('train.log.saved')}</div>` : null}
    <div class="hint" style="margin:-6px 0 10px">${fmtDate(w.date, 'long')}${w.source === 'legacy' ? ' · ' + t('train.log.legacy') : ''}</div>
    <div class="wk-tiles">
      <div><small>${t('train.sum.duration')}</small><b>${w.durationSec ? fmtDuration(w.durationSec) : '—'}</b></div>
      <div><small>${t('train.sum.setsT')}</small><b>${sum.sets}</b></div>
      <div><small>${t('train.sum.volume')}</small><b>${sum.volumeKg ? fmtNum(Math.round(toDisplay('weight', sum.volumeKg, units))) : '—'}</b><em>${sum.volumeKg ? weightUnit(units) : ''}</em></div>
    </div>
    ${(w.records || []).length ? html`<${Card} title=${t('train.pr.title')} icon="target" color="#FF9F0A">
      ${w.records.map((r) => html`<div class="kv"><span>${exName({ exerciseId: r.exerciseId }, cat.byId)} · ${recordLabel(r.kind)}</span><span><b>${fmtRecord(r.kind, r.value, units)}</b> <small class="hint">${t('train.pr.was', { v: fmtRecord(r.kind, r.prev, units) })}</small></span></div>`)}
    <//>` : null}

    ${w.exercises.map((e, ei) => html`<div class="card pad wk-logex">
      <div class="wk-exh"><button class="exn linkish grow" onClick=${() => e.exerciseId && navigate('/train/exercise/' + encodeURIComponent(e.exerciseId))}>${e.group ? html`<span class="wk-grp">${e.group}</span> ` : null}${exName(e, cat.byId)}</button>
        ${edit ? html`<button class="small danger" onClick=${() => upd({ exercises: w.exercises.filter((_, i) => i !== ei) })}>${t('common.delete')}</button>` : null}</div>
      ${e.sets.map((x, si) => edit ? html`<div class="wk-editset">
          <span class="wk-sn">${x.type && x.type !== 'normal' ? setTypeShort(x.type) : si + 1}</span>
          ${e.cardio ? html`
            <${NumIn} value=${x.timeSec != null ? x.timeSec / 60 : null} digits=${1} label=${t('train.col.min')} placeholder=${t('train.col.min')} onCommit=${(v) => updSet(ei, si, { timeSec: v == null ? null : Math.round(v * 60) })}/>
            <${NumIn} value=${x.distanceM != null ? toDisplay('distance', x.distanceM / 1000, units) : null} label=${t(unitKey('distance', units))} placeholder=${t(unitKey('distance', units))} onCommit=${(v) => updSet(ei, si, { distanceM: v == null ? null : Math.round(fromDisplay('distance', v, units) * 1000) })}/>` : html`
            <${NumIn} value=${toDisplay('weight', x.weight, units)} label=${weightUnit(units)} placeholder=${weightUnit(units)} onCommit=${(v) => updSet(ei, si, { weight: v == null ? null : fromDisplay('weight', v, units) })}/>
            ${x.timeSec != null && x.reps == null ? html`<${NumIn} mode="numeric" value=${x.timeSec} label=${t('train.col.sec')} placeholder=${t('train.col.sec')} onCommit=${(v) => updSet(ei, si, { timeSec: v == null ? null : Math.round(v) })}/>`
              : html`<${NumIn} mode="numeric" value=${x.reps} label=${t('train.col.reps')} placeholder=${t('train.col.reps')} onCommit=${(v) => updSet(ei, si, { reps: v == null ? null : Math.round(v) })}/>`}
            <${NumIn} value=${x.rir} label="RIR" placeholder="RIR" onCommit=${(v) => updSet(ei, si, { rir: v })}/>`}
          <button class="small icn danger" aria-label=${t('train.set.delete')} onClick=${() => updEx(ei, (ex) => Object.assign({}, ex, { sets: ex.sets.filter((_, j) => j !== si) }))}><${Icon} name="close" size=${14}/></button>
        </div>` : html`<div class="wk-logset"><span class="wk-sn">${x.type && x.type !== 'normal' ? setTypeShort(x.type) : si + 1}</span><span>${fmtSet(x, units, { cardio: !!e.cardio })}</span>${x.rir != null ? html`<span class="hint">RIR ${fmtNum(x.rir)}</span>` : null}</div>`)}
      ${e.cardio ? html`<div class="hint">${cardioLine(e, units)}</div>` : null}
      ${e.notes ? html`<div class="hint">${e.notes}</div>` : null}
    </div>`)}

    ${edit ? html`<div class="card pad">
      <${Field} label=${t('train.session.name')}><input value=${w.name} onInput=${(ev) => upd({ name: ev.currentTarget.value })}/><//>
      <${Field} label=${t('train.session.date')}><input type="date" value=${w.date} onChange=${(ev) => { const v = ev.currentTarget.value; if (v) upd({ date: v }); }}/><//>
      <div class="grid2">
        <label class="fld"><span class="lbl">${t('train.sum.durationMin')}</span><${NumIn} mode="numeric" value=${w.durationSec != null ? Math.round(w.durationSec / 60) : null} label=${t('train.sum.durationMin')} onCommit=${(v) => upd({ durationSec: v == null ? null : Math.round(v * 60) })}/></label>
        ${[['avgHr', 'train.stats.avgHr'], ['kcalWatch', 'train.stats.kcalWatch'], ['kcal', 'train.stats.kcal'], ['steps', 'train.stats.steps']].map(([k, l]) => html`<label class="fld"><span class="lbl">${t(l)}</span><${NumIn} mode="numeric" value=${w.stats && w.stats[k]} label=${t(l)} onCommit=${(v) => upd({ stats: Object.assign({}, w.stats, { [k]: v == null ? null : Math.round(v) }) })}/></label>`)}
      </div>
      <${Field} label=${t('train.session.notes')}><textarea value=${w.notes} onInput=${(ev) => upd({ notes: ev.currentTarget.value })}></textarea><//>
      <button class="danger" style="width:100%" onClick=${() => setAsk(true)}>${t('train.log.delete')}</button>
    </div>` : html`
      ${w.notes ? html`<${Card} title=${t('train.session.notes')} icon="list" color="#8E8E93"><p class="about-p">${w.notes}</p><//>` : null}
      ${statsLine(w) ? html`<div class="hint" style="margin:0 4px 12px">${statsLine(w)}</div>` : null}
      <button class="wk-more" onClick=${repeat}>${t('train.log.repeat')}</button>`}
    ${ask ? html`<${Confirm} text=${t('train.log.deleteAsk')} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(null)} onYes=${async () => { setAsk(null); await repos.workout.remove(w.id); goBack('/train/history'); }}/>` : null}
  <//>`;
}

export function fmtRecord(kind, v, units) {
  if (v == null) return '—';
  if (kind === 'e1rm' || kind === 'weight') return fmtWeight(v, units) + ' ' + weightUnit(units);
  if (kind === 'volume') return fmtNum(Math.round(toDisplay('weight', v, units))) + ' ' + weightUnit(units);
  if (kind === 'timeSec') return fmtDuration(v) === '—' ? fmtNum(v) + ' ' + t('train.col.sec') : fmtDuration(v);
  if (kind === 'distanceM') return fmtNum(Math.round(toDisplay('distance', v / 1000, units) * 100) / 100, 2) + ' ' + t(unitKey('distance', units));
  return fmtNum(v);
}

function cardioLine(e, units) {
  const c = e.cardio || {}, s = e.sets[0] || {};
  const p = cardioPace(s, c);
  const parts = [cardioTypeLabel(legacyCardioType(e.exerciseId))];
  if (p.speedKmh) parts.push(fmtNum(Math.round(toDisplay('distance', p.speedKmh, units) * 10) / 10, 1) + ' ' + t('cardio.perHour', { u: t(unitKey('distance', units)) }));
  if (c.inclinePct != null) parts.push(t('cardio.inclineV', { v: fmtNum(c.inclinePct, 1) }));
  if (c.avgHr) parts.push(t('cardio.hrV', { v: c.avgHr }));
  if (c.kcalWatch) parts.push(t('cardio.kcalV', { v: fmtNum(c.kcalWatch) }));
  if (c.steps) parts.push(t('cardio.stepsV', { v: fmtNum(c.steps) }));
  return parts.join(' · ');
}

function statsLine(w) {
  const st = w.stats || {}, parts = [];
  if (st.avgHr) parts.push(t('cardio.hrV', { v: st.avgHr }));
  if (st.kcalWatch) parts.push(t('cardio.kcalV', { v: fmtNum(st.kcalWatch) }));
  if (st.kcal) parts.push(t('train.stats.kcalV', { v: fmtNum(st.kcal) }));
  if (st.steps) parts.push(t('cardio.stepsV', { v: fmtNum(st.steps) }));
  return parts.join(' · ');
}
