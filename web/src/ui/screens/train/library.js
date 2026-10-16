/* Справочник упражнений: поиск с синонимами и фильтры, карточка (карта мышц, атрибуты, рекорды, история,
   инструкция), свои упражнения, правка встроенных, архив. */
import { html, useApp, useData, useState, useEffect, useMemo, navigate, goBack } from '../../core.js';
import { Page, Card, Confirm, Field, Segmented, Toggle } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { filterExercises, guessFromName, MUSCLE_GROUPS } from '../../../domain/exercises.js';
import { bests, sortLogs } from '../../../domain/workout.js';
import { MUSCLES, PATTERNS, METRICS, EX_TYPES, EQUIPMENT_KEYS } from '../../../data/models/workout.js';
import { uid } from '../../../data/ids.js';
import { loadGuides } from '../../../services/exercise-library.js';
import { useCatalog, muscleLabel, groupLabel, equipLabel, typeLabel, categoryLabel, patternLabel, regionLabel, lateralityLabel, levelLabel, metricLabel, fmtSet, recordLabel } from '../../train/catalog.js';
import { useExerciseSearch, SearchFilters, ExerciseRow } from '../../train/picker.js';
import { MuscleMap } from '../../train/muscle-map.js';
import { NumIn } from '../../train/inputs.js';
import { fmtRecord } from './history.js';
import { loadKind, defaultGym, availableLoads, barFor, stackFor } from '../../../domain/gym.js';
import { parseNum } from '../../train/inputs.js';
import { barLabel, stackLabel, weightUnit } from '../../train/catalog.js';
import { toDisplay, fromDisplay } from '../../../domain/units.js';

export function ExerciseLibrary() {
  const { repos } = useApp();
  useData(['workoutLogs']);
  const s = useExerciseSearch({ logs: repos.workout.list() });
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(80);
  const rows = source === 'archived' ? filterExercises(s.cat.list, { archived: 'only' }).filter((e) => !s.q || e.name.toLowerCase().includes(s.q.toLowerCase()))
    : source ? filterExercises(s.results, { source }) : s.results;
  return html`<${Page} title=${t('train.lib.title')} icon="search" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train" backLabel=${t('nav.train')}
      right=${html`<button class="small icn" aria-label=${t('train.lib.new')} onClick=${() => navigate('/train/exercise-edit/new')}><${Icon} name="plus"/></button>`}>
    <${SearchFilters} s=${s}/>
    <div class="pills" role="radiogroup">${[['', 'train.lib.all'], ['mine', 'train.lib.mineTab'], ['library', 'train.lib.builtIn'], ['archived', 'train.lib.archived']].map(([k, l]) => html`<button role="radio" aria-checked=${source === k} class=${'pill sm' + (source === k ? ' on' : '')} onClick=${() => setSource(k)}>${t(l)}</button>`)}</div>
    <div class="hint" style="margin:0 4px 8px">${s.cat.ready ? t('train.lib.count', { count: rows.length }) : t('train.lib.loading')}</div>
    <div class="list results">
      ${rows.slice(0, limit).map((e) => html`<${ExerciseRow} e=${e} onTap=${() => navigate('/train/exercise/' + encodeURIComponent(e.id))}/>`)}
      ${!rows.length && s.cat.ready ? html`<div class="empty">${t('train.lib.none')}</div>` : null}
    </div>
    ${rows.length > limit ? html`<button class="wk-more" onClick=${() => setLimit(limit + 200)}>${t('train.lib.more', { count: rows.length - limit })}</button>` : null}
    <p class="lfoot">${t('train.lib.source')}</p>
  <//>`;
}

/* Лучшие показатели и история упражнения по завершённым тренировкам */
function exerciseHistory(logs, id) {
  const rows = [];
  sortLogs(logs).forEach((w) => (w.exercises || []).forEach((e) => { if (e.exerciseId === id && e.sets.length) rows.push({ w, e }); }));
  const all = rows.flatMap((r) => r.e.sets);
  const b = bests(all);
  let vol = 0;
  rows.forEach((r) => { vol = Math.max(vol, bests(r.e.sets).volume); });
  b.volume = vol;
  return { rows, best: b };
}

export function ExerciseCard({ route }) {
  const { repos } = useApp();
  useData(['workoutLogs', 'exerciseConfigs', 'profile']);
  const cat = useCatalog();
  const units = repos.profile.get().units;
  const id = decodeURIComponent(route.parts[2] || '');
  const e = cat.byId[id];
  const [guide, setGuide] = useState(null);
  const [ask, setAsk] = useState(null);
  useEffect(() => { if (e && e.source === 'library') loadGuides().then((g) => setGuide(g[id] || [])).catch(() => setGuide([])); }, [id, !!e]);
  const logs = repos.workout.list();
  const h = useMemo(() => exerciseHistory(logs, id), [id, logs.length, repos.workout.list().map((w) => w.updatedAt).join()]);
  if (!e) return html`<${Page} title=${t('train.lib.title')} back="/train/library" backLabel=${t('train.lib.title')}><div class="card empty">${cat.ready ? t('train.ex.notFound') : t('train.lib.loading')}</div><//>`;
  const cfg = repos.userExerciseConfig.get(id);
  const saveCfg = (patch) => repos.userExerciseConfig.save(Object.assign({}, cfg || { id }, patch, { id }));
  const archive = async (v) => {
    const doc = repos.exercise.get(id);
    if (doc) await repos.exercise.update(id, { archived: v });
    else await repos.exercise.save(Object.assign({}, e, { archived: v }));
  };
  const own = e.source !== 'library';
  const used = h.rows.length > 0;
  const recs = [['e1rm', h.best.e1rm], ['weight', h.best.weight], ['reps', h.best.reps], ['volume', h.best.volume], ['timeSec', h.best.timeSec], ['distanceM', h.best.distanceM]].filter(([, v]) => v > 0);
  return html`<${Page} title=${e.name} back="/train/library" backLabel=${t('train.lib.title')}
      right=${html`<button class="small" onClick=${() => navigate('/train/exercise-edit/' + encodeURIComponent(id))}>${t('common.edit')}</button>`}>
    ${e.nameEn && e.nameEn !== e.name ? html`<div class="hint" style="margin:-6px 0 10px">${e.nameEn}</div>` : null}
    ${e.archived ? html`<div class="banner">${t('train.ex.archivedNote')}</div>` : null}
    <div class="card pad">
      <${MuscleMap} primary=${e.primaryMuscles} secondary=${e.secondaryMuscles}/>
      <div class="kv"><span>${t('train.ex.primary')}</span><span>${e.primaryMuscles.map(muscleLabel).join(', ') || '—'}</span></div>
      ${e.secondaryMuscles.length ? html`<div class="kv"><span>${t('train.ex.secondary')}</span><span>${e.secondaryMuscles.map(muscleLabel).join(', ')}</span></div>` : null}
      <div class="wk-chips">
        <span class="chip">${typeLabel(e.type)}</span>
        ${e.category && e.category !== 'strength' ? html`<span class="chip">${categoryLabel(e.category)}</span>` : null}
        <span class="chip">${patternLabel(e.pattern)}</span>
        <span class="chip">${regionLabel(e.region)}</span>
        <span class="chip">${lateralityLabel(e.laterality)}</span>
        ${e.level && e.source === 'library' ? html`<span class="chip">${levelLabel(e.level)}</span>` : null}
        ${(e.equipment || []).map((k) => html`<span class="chip eq">${equipLabel(k)}</span>`)}
      </div>
      ${(e.synonyms || []).length ? html`<div class="hint">${t('train.ex.synonyms')}: ${e.synonyms.join(', ')}</div>` : null}
    </div>

    <${Card} title=${t('train.ex.records')} icon="target" color="#FF9F0A">
      ${recs.length ? recs.map(([k, v]) => html`<div class="kv"><span>${recordLabel(k)}</span><span><b>${fmtRecord(k, v, units)}</b></span></div>`) : html`<div class="hint">${t('train.ex.noHistory')}</div>`}
    <//>
    ${h.rows.length ? html`<div class="ltitle">${t('train.ex.history')}</div><div class="list">${h.rows.slice(0, 12).map(({ w, e: x }) => html`<button class="lrow" type="button" onClick=${() => navigate('/train/log/' + w.id)}>
      <span class="ltext"><span class="ll">${fmtDate(w.date, 'long')}</span><span class="ls">${x.sets.filter((s) => s.type !== 'warmup').map((s) => fmtSet(s, units, { cardio: !!x.cardio })).join(' · ')}</span></span></button>`)}</div>` : null}

    <${Card} title=${t('train.ex.settings')} icon="gear" color="#8E8E93">
      <div class="grid2">
        <label class="fld"><span class="lbl">${t('train.ex.rest')}</span><${NumIn} mode="numeric" value=${cfg && cfg.restSec} placeholder=${t('train.ex.restAuto')} label=${t('train.ex.rest')} onCommit=${(v) => saveCfg({ restSec: v == null ? null : Math.max(0, Math.round(v)) })}/></label>
        <label class="fld"><span class="lbl">${t('train.ex.restSides')}</span><${NumIn} mode="numeric" value=${cfg && cfg.restBetweenSidesSec} placeholder=${t('train.ex.restAuto')} label=${t('train.ex.restSides')} onCommit=${(v) => saveCfg({ restBetweenSidesSec: v == null ? null : Math.max(0, Math.round(v)) })}/></label>
      </div>
      <${Field} label=${t('train.ex.myNotes')}><textarea value=${(cfg && cfg.notes) || ''} placeholder=${t('train.ex.myNotesPh')} onInput=${(ev) => saveCfg({ notes: ev.currentTarget.value })}></textarea><//>
    <//>
    <${LoadSettings} e=${e} cfg=${cfg} saveCfg=${saveCfg}/>

    ${e.instructions ? html`<${Card} title=${t('train.ex.howto')} icon="info" color="var(--k-plan)"><p class="about-p">${e.instructions}</p><//>` : null}
    ${e.source === 'library' ? html`<details class="card pad wk-guide"><summary>${t('train.ex.guide')}</summary>
      ${guide == null ? html`<div class="hint">${t('train.lib.loading')}</div>` : guide.length ? html`<ol lang="en">${guide.map((g) => html`<li>${g}</li>`)}</ol>` : html`<div class="hint">${t('train.ex.noGuide')}</div>`}
      <div class="hint">${t('train.ex.guideSource')}</div>
    </details>` : null}

    <div class="row" style="margin-bottom:12px">
      <button class="grow" onClick=${() => archive(!e.archived)}>${e.archived ? t('train.ex.unarchive') : t('train.ex.archive')}</button>
      ${own && !used ? html`<button class="danger" onClick=${() => setAsk(true)}>${t('common.delete')}</button>` : null}
    </div>
    ${ask ? html`<${Confirm} text=${t('train.ex.deleteForever', { name: e.name })} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(null)} onYes=${async () => { setAsk(null); await repos.exercise.remove(id); goBack('/train/library'); }}/>` : null}
  <//>`;
}

/* Мульти-выбор чипами */
function Chips({ values, options, label, onChange }) {
  return html`<div class="wk-chips pick">${options.map(([k, l]) => html`<button type="button" role="checkbox" aria-checked=${values.includes(k)} class=${'chip' + (values.includes(k) ? ' on' : '')}
    onClick=${() => onChange(values.includes(k) ? values.filter((x) => x !== k) : values.concat([k]))}>${l}</button>`)}</div>`;
}

export function ExerciseEditor({ route }) {
  const { repos } = useApp();
  const cat = useCatalog();
  const id = decodeURIComponent(route.parts[2] || 'new');
  const isNew = id === 'new';
  const base = isNew ? null : cat.byId[id];
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (d) return;
    if (isNew) setD(Object.assign(guessFromName(route.query.name || ''), { name: route.query.name || '', synonymsText: '', instructions: '' }));
    else if (base) setD(Object.assign({}, base, { synonymsText: (base.synonyms || []).join(', ') }));
  }, [base, isNew]);
  if (!d) return html`<${Page} title=${t('train.ex.edit')} back="/train/library" backLabel=${t('train.lib.title')}><div class="card empty">${t('train.lib.loading')}</div><//>`;
  const set = (patch) => setD(Object.assign({}, d, patch));
  const muscleOpts = MUSCLE_GROUPS.flatMap(([, ms]) => ms).map((m) => [m, muscleLabel(m)]);
  async function save() {
    const name = (d.name || '').trim();
    if (!name) { setErr(t('train.ex.needName')); return; }
    if (!d.metrics.length) { setErr(t('train.ex.needMetric')); return; }
    const doc = Object.assign({}, d, { name, synonyms: d.synonymsText.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30), secondaryMuscles: d.secondaryMuscles.filter((m) => !d.primaryMuscles.includes(m)) });
    delete doc.synonymsText;
    if (isNew) { const saved = await repos.exercise.create(Object.assign(doc, { id: 'u-' + uid(), source: 'user' })); navigate('/train/exercise/' + encodeURIComponent(saved.id), { replace: true }); return; }
    await repos.exercise.save(Object.assign(doc, { id }));
    goBack('/train/exercise/' + encodeURIComponent(id));
  }
  const isOverride = !isNew && base && base.source === 'library' && repos.exercise.get(id);
  return html`<${Page} title=${isNew ? t('train.lib.new') : t('train.ex.edit')} back=${isNew ? '/train/library' : '/train/exercise/' + encodeURIComponent(id)} backLabel=${t('common.back')}
      right=${html`<button class="small primary" onClick=${save}>${t('common.save')}</button>`}>
    ${err ? html`<div class="banner warnb">${err}</div>` : null}
    ${!isNew && base && base.source === 'library' ? html`<div class="hint" style="margin:0 4px 10px">${t('train.ex.libEditNote')}</div>` : null}
    <div class="card pad">
      <${Field} label=${t('train.ex.name')}><input value=${d.name} onInput=${(e) => set({ name: e.currentTarget.value })} onBlur=${() => { if (isNew && !d.primaryMuscles.length && d.name.trim()) { const g = guessFromName(d.name); set(Object.assign({}, g, { name: d.name, synonymsText: d.synonymsText, instructions: d.instructions })); } }}/><//>
      <${Field} label=${t('train.ex.synonyms')} hint=${t('train.ex.synonymsHint')}><input value=${d.synonymsText} onInput=${(e) => set({ synonymsText: e.currentTarget.value })}/><//>
      <${Segmented} label=${t('train.ex.type')} value=${d.type} onChange=${(v) => set({ type: v })} options=${EX_TYPES.map((k) => [k, typeLabel(k)])}/>
      <label class="fld"><span class="lbl">${t('train.ex.pattern')}</span><select value=${d.pattern} onChange=${(e) => set({ pattern: e.currentTarget.value })}>${PATTERNS.map((k) => html`<option value=${k}>${patternLabel(k)}</option>`)}</select></label>
      <${Segmented} label=${t('train.ex.region')} value=${d.region} onChange=${(v) => set({ region: v })} options=${['upper', 'lower', 'core', 'full'].map((k) => [k, regionLabel(k)])}/>
      <${Segmented} label=${t('train.ex.laterality')} value=${d.laterality} onChange=${(v) => set({ laterality: v, perSide: v === 'unilateral' ? true : d.perSide })} options=${['bilateral', 'unilateral', 'alternating'].map((k) => [k, lateralityLabel(k)])}/>
    </div>
    <div class="card pad">
      <div class="lbl">${t('train.ex.primary')}</div>
      <${Chips} values=${d.primaryMuscles} options=${muscleOpts} onChange=${(v) => set({ primaryMuscles: v })}/>
      <div class="lbl" style="margin-top:10px">${t('train.ex.secondary')}</div>
      <${Chips} values=${d.secondaryMuscles} options=${muscleOpts.filter(([m]) => !d.primaryMuscles.includes(m))} onChange=${(v) => set({ secondaryMuscles: v })}/>
      <${MuscleMap} primary=${d.primaryMuscles} secondary=${d.secondaryMuscles}/>
    </div>
    <div class="card pad">
      <div class="lbl">${t('train.ex.equipment')}</div>
      <${Chips} values=${d.equipment} options=${EQUIPMENT_KEYS.map((k) => [k, equipLabel(k)])} onChange=${(v) => set({ equipment: v })}/>
      <div class="lbl" style="margin-top:10px">${t('train.ex.metrics')}</div>
      <${Chips} values=${d.metrics} options=${METRICS.map((k) => [k, metricLabel(k)])} onChange=${(v) => set({ metrics: v })}/>
      <div style="margin-top:10px"><${Toggle} on=${d.perSide} onChange=${(v) => set({ perSide: v })} label=${t('train.ex.perSide')} hint=${t('train.ex.perSideHint')}/></div>
      <${Field} label=${t('train.ex.howto')}><textarea value=${d.instructions} placeholder=${t('train.ex.howtoPh')} onInput=${(e) => set({ instructions: e.currentTarget.value })}></textarea><//>
    </div>
    ${isOverride ? html`<button style="width:100%;margin-bottom:12px" onClick=${async () => { await repos.exercise.remove(id); goBack('/train/exercise/' + encodeURIComponent(id)); }}>${t('train.ex.reset')}</button>` : null}
  <//>`;
}

/* Веса и разминка упражнения: гриф или стек зала, свои веса вместо зала, режим и схема разминки */
function LoadSettings({ e, cfg, saveCfg }) {
  const { repos } = useApp();
  useData(['gyms', 'workoutProfile', 'profile']);
  const units = repos.profile.get().units;
  const gym = defaultGym(repos.gym.list(), repos.workoutProfile.get());
  const kind = loadKind(e);
  const c = cfg || {};
  const [loadsText, setLoadsText] = useState(null);
  const loads = c.loads || [];
  const avail = availableLoads(e, gym, c);
  const fmtW = (kg) => fmtNum(Math.round(toDisplay('weight', kg, units) * 100) / 100, 2);
  const preview = avail && avail.length ? avail.slice(0, 8).map(fmtW).join(' · ') + (avail.length > 8 ? ' … ' + fmtW(avail[avail.length - 1]) : '') + ' ' + weightUnit(units) : t('train.load.any');
  if (e.type === 'cardio') return null;
  return html`<${Card} title=${t('train.load.title')} icon="plate" color="var(--k-str)">
    ${gym ? html`<div class="hint" style="margin-top:0">${t('train.load.gym', { name: gym.name })}</div>` : html`<div class="hint" style="margin-top:0">${t('train.load.noGym')}</div>`}
    ${gym && kind === 'barbell' && (gym.bars || []).length ? html`<div class="lbl">${t('train.load.bar')}</div>
      <div class="wk-chips pick">${gym.bars.map((b) => html`<button class=${'chip' + (barFor(e, gym, c).id === b.id ? ' on' : '')} onClick=${() => saveCfg({ barId: b.id })}>${barLabel(b.name)} · ${fmtW(b.weight)}</button>`)}</div>` : null}
    ${gym && kind === 'stack' && (gym.stacks || []).length ? html`<div class="lbl">${t('train.load.stack')}</div>
      <div class="wk-chips pick">${gym.stacks.map((st) => html`<button class=${'chip' + ((stackFor(e, gym, c) || {}).id === st.id ? ' on' : '')} onClick=${() => saveCfg({ stackId: st.id })}>${stackLabel(st.name)}</button>`)}</div>` : null}
    <${Field} label=${t('train.load.own')} hint=${t('train.load.ownHint')}>
      <input inputmode="decimal" value=${loadsText != null ? loadsText : loads.map((x) => fmtW(x)).join('; ')} placeholder=${t('train.load.ownPh')}
        onInput=${(ev) => setLoadsText(ev.currentTarget.value)}
        onBlur=${() => { if (loadsText == null) return; const list = loadsText.split(/[;\s]+/).map(parseNum).filter((x) => x != null && x >= 0).map((x) => Math.round(fromDisplay('weight', x, units) * 1e4) / 1e4); saveCfg({ loads: [...new Set(list)].sort((a, b) => a - b) }); setLoadsText(null); }}/><//>
    <div class="hint">${t('train.load.available')}: ${preview}</div>
    <${Segmented} label=${t('train.load.warmup')} value=${c.warmup || 'auto'} onChange=${(v) => saveCfg({ warmup: v })} options=${[['auto', t('train.load.wu.auto')], ['always', t('train.load.wu.always')], ['never', t('train.load.wu.never')]]}/>
    <div style="margin-top:10px"><${Segmented} label=${t('train.load.scheme')} value=${c.warmupScheme || ''} onChange=${(v) => saveCfg({ warmupScheme: v })} options=${[['', t('train.load.sc.def')], ['short', t('train.load.sc.short')], ['default', t('train.load.sc.default')], ['long', t('train.load.sc.long')]]}/></div>
  <//>`;
}
