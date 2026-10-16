/* Шаблоны тренировок: список, редактор (упражнения с целями: подходы, повторы или время, вес, RIR, отдых,
   суперсеты, варианты), день недели, запуск. Полный конструктор программ — этап 9. */
import { html, useApp, useData, useState, useEffect, navigate, goBack, todayYmd } from '../../core.js';
import { Page, Confirm, Field, Sheet } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t } from '../../../i18n/index.js';
import { planItems } from '../../../domain/workout.js';
import { toDisplay, fromDisplay } from '../../../domain/units.js';
import { uid } from '../../../data/ids.js';
import { useCatalog, wdLabel, wdShort, weightUnit, fmtClock } from '../../train/catalog.js';
import { ExercisePicker } from '../../train/picker.js';
import { NumIn } from '../../train/inputs.js';
import { startWorkout, sortPlans } from './train.js';

const GROUPS = 'ABCDEFGH';

export function PlanList({ route }) {
  const fromMore = !!route && route.path.startsWith('/more');
  const { repos } = useApp();
  useData(['workoutPlans']);
  const cat = useCatalog();
  const [archived, setArchived] = useState(false);
  const plans = sortPlans(repos.workoutPlan.list((p) => !!p.archived === archived));
  return html`<${Page} title=${t('train.plans')} icon="list" color="linear-gradient(135deg,#5AC8FA,#007AFF)" back=${fromMore ? '/more' : '/train'} backLabel=${fromMore ? t('nav.more') : t('nav.train')}
      right=${html`<button class="small icn" aria-label=${t('train.plan.new')} onClick=${() => navigate('/train/plan/new')}><${Icon} name="plus"/></button>`}>
    <div class="pills" role="radiogroup">${[[false, 'train.plan.active'], [true, 'train.lib.archived']].map(([v, l]) => html`<button role="radio" aria-checked=${archived === v} class=${'pill sm' + (archived === v ? ' on' : '')} onClick=${() => setArchived(v)}>${t(l)}</button>`)}</div>
    <div class="list">
      ${plans.map((p) => html`<button class="lrow" type="button" onClick=${() => navigate('/train/plan/' + encodeURIComponent(p.id))}>
        <span class="lico" style="--cc:var(--k-str)"><span class="wk-wd">${p.weekday != null ? wdShort(p.weekday) : '—'}</span></span>
        <span class="ltext"><span class="ll">${p.name}</span><span class="ls">${planItems(p).slice(0, 4).map((it) => (cat.byId[it.exerciseId] && !(it.alternatives || []).length ? cat.byId[it.exerciseId].name : it.name)).join(' · ')}</span></span>
        <span class="lv">${planItems(p).length}</span></button>`)}
      ${!plans.length ? html`<div class="empty">${archived ? t('train.plan.noArchived') : t('train.plan.none')}</div>` : null}
    </div>
    <p class="lfoot">${t('train.plan.foot')}</p>
  <//>`;
}

function newItem(ex) {
  return { id: 'i' + uid(), exerciseId: ex.id, name: ex.name, sets: 3, repMin: (ex.metrics || []).includes('reps') ? 8 : null, repMax: (ex.metrics || []).includes('reps') ? 12 : null, timeSec: (ex.metrics || []).includes('time') && !(ex.metrics || []).includes('reps') ? 60 : null, rir: null, weight: null, restSec: null, group: '', groupKind: null, notes: '', alternatives: [] };
}

export function PlanEditor({ route }) {
  const app = useApp();
  const { repos } = app;
  useData(['workoutPlans', 'profile', 'workoutSessions']);
  const cat = useCatalog();
  const units = repos.profile.get().units;
  const id = decodeURIComponent(route.parts[2] || 'new');
  const isNew = id === 'new';
  const doc = isNew ? null : repos.workoutPlan.get(id);
  const [d, setD] = useState(null);
  const [picker, setPicker] = useState(null);
  const [ask, setAsk] = useState(null);
  const [open, setOpen] = useState(null);
  const [forId, setForId] = useState(null);
  useEffect(() => {
    if (d && forId === id) return;
    if (isNew) { setD({ name: '', weekday: null, sections: [{ id: 'main', name: '', kind: 'main', items: [] }], notes: '' }); setForId(id); }
    else if (doc) { setD(JSON.parse(JSON.stringify(doc))); setForId(id); }
  }, [doc, id]);
  if (!d || forId !== id) return html`<${Page} title=${t('train.plans')} back="/train/plans" backLabel=${t('train.plans')}><div class="card empty">${isNew ? '' : t('train.plan.notFound')}</div><//>`;
  const items = d.sections[0] ? d.sections[0].items : [];
  const setItems = (next) => setD(Object.assign({}, d, { sections: [Object.assign({}, d.sections[0] || { id: 'main', kind: 'main', name: '' }, { items: next })].concat(d.sections.slice(1)) }));
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? Object.assign({}, x, patch) : x)));
  const dirty = isNew || JSON.stringify(doc) !== JSON.stringify(d);
  async function save(andGo = true) {
    const data = Object.assign({}, d, { name: d.name.trim() || t('train.plan.untitled') });
    const saved = isNew ? await repos.workoutPlan.create(Object.assign(data, { id: 'p-' + uid() })) : await repos.workoutPlan.save(Object.assign(data, { id }));
    if (andGo) goBack('/train/plans');
    return saved;
  }
  async function startNow() {
    const saved = dirty ? await save(false) : doc;
    if (repos.workoutSession.get('current')) { navigate('/train/session'); return; }
    startWorkout(app, { plan: saved, date: todayYmd(), catalog: cat.byId });
  }
  function pick(ex) {
    if (picker.mode === 'add') setItems(items.concat([newItem(ex)]));
    else setItem(picker.i, { exerciseId: ex.id, name: ex.name, alternatives: [] });
    setPicker(null);
  }
  const move = (i, k) => { const j = i + k; if (j < 0 || j >= items.length) return; const n = items.slice(); [n[i], n[j]] = [n[j], n[i]]; setItems(n); };
  const link = (i) => {
    if (i === 0) return;
    const prev = items[i - 1], cur = items[i];
    if (cur.group && cur.group === prev.group) { setItem(i, { group: '', groupKind: null }); return; }
    const used = new Set(items.map((x) => x.group).filter(Boolean));
    const g = prev.group || [...GROUPS].find((c) => !used.has(c)) || 'Z';
    setItems(items.map((x, j) => (j === i - 1 || j === i ? Object.assign({}, x, { group: g, groupKind: 'superset' }) : x)));
  };
  return html`<${Page} title=${isNew ? t('train.plan.new') : (d.name || t('train.plan.untitled'))} back="/train/plans" backLabel=${t('train.plans')}
      right=${html`<button class="small primary" disabled=${!dirty} onClick=${() => save()}>${t('common.save')}</button>`}>
    <div class="card pad">
      <${Field} label=${t('train.plan.name')}><input value=${d.name} placeholder=${t('train.plan.namePh')} onInput=${(e) => setD(Object.assign({}, d, { name: e.currentTarget.value }))}/><//>
      <div class="lbl">${t('train.plan.weekday')}</div>
      <div class="pills wk-wds" role="radiogroup">${[null, 0, 1, 2, 3, 4, 5, 6].map((w) => html`<button role="radio" aria-checked=${d.weekday === w} class=${'pill sm' + (d.weekday === w ? ' on' : '')} onClick=${() => setD(Object.assign({}, d, { weekday: w }))}>${w == null ? t('train.plan.noDay') : wdShort(w)}</button>`)}</div>
    </div>
    ${items.map((it, i) => {
      const ex = cat.byId[it.exerciseId];
      const alts = (it.alternatives || []).filter(Boolean);
      const timed = it.timeSec != null && it.repMin == null && it.repMax == null;
      const linked = i > 0 && it.group && it.group === items[i - 1].group;
      return html`<div class=${'card pad wk-pitem' + (it.group ? ' grouped' : '')}>
        <div class="wk-exh">
          <span class="pidx">${i + 1}</span>
          <button class="grow linkish exn" onClick=${() => setPicker({ mode: 'replace', i })}>${alts.length > 1 ? it.name : (ex ? ex.name : it.name)}</button>
          <button class="small icn" aria-label=${t('train.plan.more')} onClick=${() => setOpen(open === i ? null : i)}><${Icon} name="more"/></button>
        </div>
        ${it.group ? html`<span class="wk-grp">${t('train.group.superset', { g: it.group })}</span>` : null}
        ${alts.length > 1 ? html`<div class="hint">${t('train.plan.alts', { list: alts.map((a) => (cat.byId[a] ? cat.byId[a].name : a)).join(' / ') })}</div>` : null}
        <div class="wk-pnums">
          <label><span>${t('train.plan.sets')}</span><${NumIn} mode="numeric" value=${it.sets} label=${t('train.plan.sets')} onCommit=${(v) => setItem(i, { sets: v == null ? null : Math.max(1, Math.round(v)) })}/></label>
          ${timed ? html`<label class="w2"><span>${t('train.col.sec')}</span><${NumIn} mode="numeric" value=${it.timeSec} label=${t('train.col.sec')} onCommit=${(v) => setItem(i, { timeSec: v == null ? null : Math.round(v) })}/></label>`
            : html`<label><span>${t('train.plan.repMin')}</span><${NumIn} mode="numeric" value=${it.repMin} label=${t('train.plan.repMin')} onCommit=${(v) => setItem(i, { repMin: v == null ? null : Math.round(v) })}/></label>
              <label><span>${t('train.plan.repMax')}</span><${NumIn} mode="numeric" value=${it.repMax} label=${t('train.plan.repMax')} onCommit=${(v) => setItem(i, { repMax: v == null ? null : Math.round(v) })}/></label>`}
          <label><span>${weightUnit(units)}</span><${NumIn} value=${toDisplay('weight', it.weight, units)} placeholder="—" label=${weightUnit(units)} onCommit=${(v) => setItem(i, { weight: v == null ? null : fromDisplay('weight', v, units) })}/></label>
          <label><span>RIR</span><${NumIn} value=${it.rir} placeholder="—" label="RIR" onCommit=${(v) => setItem(i, { rir: v == null ? null : Math.max(0, Math.min(10, v)) })}/></label>
        </div>
        ${open === i ? html`<div class="wk-pmore">
          <div class="grid2">
            <label class="fld"><span class="lbl">${t('train.plan.rest')}</span><${NumIn} mode="numeric" value=${it.restSec} placeholder=${t('train.ex.restAuto')} label=${t('train.plan.rest')} onCommit=${(v) => setItem(i, { restSec: v == null ? null : Math.round(v) })}/></label>
            <label class="fld"><span class="lbl">${t('train.plan.byTime')}</span><button class=${'sw' + (timed ? ' on' : '')} role="switch" aria-checked=${timed} aria-label=${t('train.plan.byTime')} onClick=${() => setItem(i, timed ? { timeSec: null, repMin: 8, repMax: 12 } : { timeSec: 60, repMin: null, repMax: null })}><i></i></button></label>
          </div>
          <${Field} label=${t('train.plan.note')}><input value=${it.notes} onInput=${(e) => setItem(i, { notes: e.currentTarget.value })}/><//>
          <div class="acts">
            ${i > 0 ? html`<button class="small" onClick=${() => link(i)}>${linked ? t('train.ex.unlink') : t('train.plan.linkPrev')}</button>` : null}
            <button class="small icn" aria-label=${t('train.ex.up')} disabled=${i === 0} onClick=${() => move(i, -1)}>↑</button>
            <button class="small icn" aria-label=${t('train.ex.down')} disabled=${i === items.length - 1} onClick=${() => move(i, 1)}>↓</button>
            ${alts.length > 1 ? html`<button class="small" onClick=${() => setItem(i, { alternatives: [], name: ex ? ex.name : it.name })}>${t('train.plan.noAlts')}</button>` : null}
            <button class="small danger" onClick=${() => { setItems(items.filter((_, j) => j !== i)); setOpen(null); }}>${t('common.delete')}</button>
          </div>
        </div>` : null}
      </div>`;
    })}
    ${!items.length ? html`<div class="card empty">${t('train.plan.empty')}</div>` : null}
    <button class="primary wk-add" onClick=${() => setPicker({ mode: 'add' })}><${Icon} name="plus"/>${t('train.ex.add')}</button>
    ${items.length ? html`<button class="wk-more" onClick=${startNow}>${t('train.plan.start')}</button>` : null}
    ${!isNew ? html`<div class="row" style="margin-bottom:12px">
      <button class="grow" onClick=${async () => { await repos.workoutPlan.update(id, { archived: !doc.archived }); goBack('/train/plans'); }}>${doc.archived ? t('train.ex.unarchive') : t('train.ex.archive')}</button>
      <button class="grow" onClick=${async () => { const copy = await repos.workoutPlan.create(Object.assign({}, d, { id: 'p-' + uid(), name: d.name + ' ' + t('train.plan.copy'), legacyKey: '', weekday: null })); navigate('/train/plan/' + copy.id, { replace: true }); }}>${t('train.plan.duplicate')}</button>
      <button class="danger" onClick=${() => setAsk(true)}>${t('common.delete')}</button>
    </div>` : null}
    <${ExercisePicker} open=${!!picker} onClose=${() => setPicker(null)} onPick=${pick}/>
    ${ask ? html`<${Confirm} text=${t('train.plan.deleteAsk')} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(null)} onYes=${async () => { setAsk(null); await repos.workoutPlan.remove(id); goBack('/train/plans'); }}/>` : null}
  <//>`;
}
