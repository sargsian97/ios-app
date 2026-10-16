/* Программы тренировок: активная программа (неделя блока, периодизация, делоад, дни недели) и мастер генерации:
   цель, опыт, дни и время, зал, сплит, акценты на мышцы, исключения, периодизация и делоад →
   этапы сборки → предпросмотр с заменой упражнений → сохранение (прежняя активная программа уходит в архив). */
import { html, useApp, useData, useState, useEffect, navigate, todayYmd } from '../../core.js';
import { Page, Card, Segmented, Field, Confirm } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, hasKey, fmtNum } from '../../../i18n/index.js';
import { generateProgram, splitsFor, activeProgram, programWeekMods, plannedSets, GOALS, EXPERIENCE } from '../../../domain/training-program.js';
import { defaultGym, availableInGym } from '../../../domain/gym.js';
import { uid } from '../../../data/ids.js';
import { useCatalog, wdShort, wdLabel, muscleLabel } from '../../train/catalog.js';
import { ExercisePicker } from '../../train/picker.js';

const lab = (prefix) => (k) => (k != null && hasKey(prefix + k) ? t(prefix + k) : String(k == null ? '' : k));
export const splitLabel = lab('prog.split.');
export const dayTypeLabel = lab('prog.day.');
const goalLabel = lab('prog.goal.');
const expLabel = lab('prog.exp.');
const perLabel = lab('prog.per.');
const dlLabel = lab('prog.dl.');
const stageLabel = lab('prog.stage.');
const splitHint = lab('prog.splitHint.');
const perHint = lab('prog.perHint.');
const PRIORITY_MUSCLES = ['chest', 'lats', 'upper_back', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
const MINUTES = [30, 45, 60, 75, 90, 120];
const fmtReps = (it) => (it.timeSec != null && it.repMin == null ? it.timeSec + ' ' + t('train.col.sec') : it.repMin === it.repMax ? String(it.repMin) : it.repMin + '–' + it.repMax);

/* Названия шаблонов: тип дня, повторяющиеся — с буквой (Толкай A, Толкай B) */
function nameDays(plans) {
  const count = {};
  plans.forEach((p) => { count[p.type] = (count[p.type] || 0) + 1; });
  const seen = {};
  return plans.map((p) => {
    seen[p.type] = (seen[p.type] || 0) + 1;
    return Object.assign({}, p, { name: dayTypeLabel(p.type) + (count[p.type] > 1 ? ' ' + 'ABCDEF'[seen[p.type] - 1] : '') });
  });
}

export function ProgramList() {
  const { repos } = useApp();
  useData(['workoutPrograms', 'workoutPlans']);
  const [ask, setAsk] = useState(null);
  const today = todayYmd();
  const programs = repos.workoutProgram.list();
  const active = activeProgram(programs);
  const others = programs.filter((p) => p !== active).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const plansOf = (p) => repos.workoutPlan.list((x) => x.programId === p.id);
  async function setStatus(p, status) {
    if (status === 'active' && active) await archive(active);
    await repos.workoutProgram.update(p.id, status === 'active' ? { status, startDate: today } : { status });
    for (const pl of plansOf(p)) await repos.workoutPlan.update(pl.id, { archived: status !== 'active' });
  }
  async function archive(p) { await setStatus(p, 'archived'); }
  async function remove(p) {
    for (const pl of plansOf(p)) await repos.workoutPlan.remove(pl.id);
    await repos.workoutProgram.remove(p.id);
  }
  const wk = active ? programWeekMods(active, today) : null;
  return html`<${Page} title=${t('prog.title')} back="/train" backLabel=${t('nav.train')}
      right=${html`<button class="small icn" aria-label=${t('prog.new')} onClick=${() => navigate('/train/program/new')}><${Icon} name="plus"/></button>`}>
    ${active ? html`<div class="card pad prog-active">
      <div class="rl">${t('prog.active')}</div>
      <div class="prog-name">${active.name}</div>
      <div class="hint">${[goalLabel(active.goal), active.split ? splitLabel(active.split) : '', perLabel(active.periodization || 'none'), dlLabel(active.deload || 'none')].filter(Boolean).join(' · ')}</div>
      ${wk && !wk.finished ? html`<div class="prog-weeks" aria-label=${t('prog.weekOf', { n: wk.week + 1, total: wk.weeks })}>${Array.from({ length: wk.weeks }, (_, i) => html`<i class=${(i === wk.week ? 'cur ' : i < wk.week ? 'past ' : '') + ((active.deload === 'start' && i === 0) || (active.deload === 'end' && i === wk.weeks - 1) ? 'dl' : '')}></i>`)}</div>
        <div class="prog-wk">${t('prog.weekOf', { n: wk.week + 1, total: wk.weeks })}${wk.deload ? ' · ' + t('prog.deload') : wk.mods.heavy != null ? ' · ' + t(wk.mods.heavy ? 'prog.heavy' : 'prog.light') : ''}${wk.mods.repShift ? ' · ' + t('prog.repShift', { n: (wk.mods.repShift > 0 ? '+' : '−') + Math.abs(wk.mods.repShift) }) : ''}</div>`
        : wk && wk.finished ? html`<div class="prog-wk">${t('prog.finished')}</div>` : html`<div class="prog-wk">${t('prog.notStarted')}</div>`}
      <div class="list prog-days">${((active.blocks[0] || {}).days || []).map((d, i) => {
        const pl = d.planId ? repos.workoutPlan.get(d.planId) : null;
        return pl ? html`<button class="lrow" type="button" onClick=${() => navigate('/train/plan/' + encodeURIComponent(pl.id))}><span class="lico" style="--cc:var(--k-str)"><span class="wk-wd">${wdShort(i)}</span></span><span class="ltext"><span class="ll">${pl.name}</span><span class="ls">${(pl.sections[0] || { items: [] }).items.length} ${t('prog.exShort')}</span></span><${Icon} name="right"/></button>`
          : html`<div class="lrow rest"><span class="lico"><span class="wk-wd">${wdShort(i)}</span></span><span class="ltext"><span class="ls">${t('prog.rest')}</span></span></div>`;
      })}</div>
      <div class="row" style="margin-top:10px"><button class="grow" onClick=${() => archive(active)}>${t('prog.archive')}</button></div>
    </div>` : html`<div class="card pad empty prog-empty">
      <p>${t('prog.none')}</p>
      <button class="primary" onClick=${() => navigate('/train/program/new')}>${t('prog.create')}</button>
    </div>`}
    ${others.length ? html`<div class="ltitle">${t('prog.others')}</div><div class="list">${others.map((p) => html`<div class="lrow">
      <span class="ltext"><span class="ll">${p.name}</span><span class="ls">${[p.split ? splitLabel(p.split) : '', p.startDate || ''].filter(Boolean).join(' · ')}</span></span>
      <button class="small" onClick=${() => setStatus(p, 'active')}>${t('prog.activate')}</button>
      <button class="small danger icn" aria-label=${t('common.delete')} onClick=${() => setAsk(p)}><${Icon} name="trash"/></button>
    </div>`)}</div>` : null}
    <p class="lfoot">${t('prog.foot')}</p>
    ${ask ? html`<${Confirm} text=${t('prog.deleteAsk', { name: ask.name })} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(null)} onYes=${async () => { const p = ask; setAsk(null); await remove(p); }}/>` : null}
  <//>`;
}

function Pills({ value, options, onChange, label }) {
  return html`<${Segmented} label=${label} value=${value} onChange=${onChange} options=${options}/>`;
}

export function ProgramGenerator() {
  const app = useApp();
  const { repos } = app;
  useData(['gyms', 'workoutProfile', 'workoutPrograms']);
  const cat = useCatalog();
  const profile = repos.workoutProfile.get();
  const gyms = repos.gym.list();
  const [o, setO] = useState(() => ({ goal: 'hypertrophy', experience: 'intermediate', days: 3, minutes: 60, split: 'full_body', periodization: 'linear', deload: 'end', weeks: 5, priorities: {}, exclude: [], gymId: (defaultGym(gyms, profile) || {}).id || null }));
  const [step, setStep] = useState('form');
  const [stage, setStage] = useState(0);
  const [res, setRes] = useState(null);
  const [name, setName] = useState('');
  const [picker, setPicker] = useState(null);
  const set = (patch) => setO(Object.assign({}, o, patch));
  const splits = splitsFor(o.days);
  useEffect(() => {
    if (step !== 'build') return undefined;
    if (stage >= 6) { setStep('preview'); return undefined; }
    const id = setTimeout(() => setStage(stage + 1), 220);
    return () => clearTimeout(id);
  }, [step, stage]);
  const gym = o.gymId ? repos.gym.get(o.gymId) : null;

  function build() {
    const r = generateProgram(Object.assign({}, o, { catalog: cat.byId, isAvailable: (e) => availableInGym(e, gym), newId: uid, startDate: todayYmd() }));
    r.plans = nameDays(r.plans);
    setRes(r);
    setName(splitLabel(r.program.split) + ' · ' + goalLabel(o.goal).toLowerCase());
    setStage(0);
    setStep('build');
  }
  function replaceItem(ex) {
    const { pi, ii } = picker;
    setPicker(null);
    const plans = res.plans.map((p, i) => (i !== pi ? p : Object.assign({}, p, { sections: [Object.assign({}, p.sections[0], { items: p.sections[0].items.map((it, j) => (j === ii ? Object.assign({}, it, { exerciseId: ex.id, name: ex.name }) : it)) })] })));
    setRes(Object.assign({}, res, { plans }));
  }
  async function save() {
    const today = todayYmd();
    const prev = activeProgram(repos.workoutProgram.list());
    if (prev) {
      await repos.workoutProgram.update(prev.id, { status: 'archived' });
      for (const pl of repos.workoutPlan.list((x) => x.programId === prev.id)) await repos.workoutPlan.update(pl.id, { archived: true });
    }
    const program = Object.assign({}, res.program, { name: name.trim() || splitLabel(res.program.split), startDate: today });
    await repos.workoutProgram.create(program);
    for (const p of res.plans) { const { type, ...plan } = p; await repos.workoutPlan.create(plan); }
    navigate('/train/programs', { replace: true });
  }
  const cyclePriority = (m) => {
    const cur = o.priorities[m];
    const next = cur == null ? 'more' : cur === 'more' ? 'less' : null;
    const p = Object.assign({}, o.priorities);
    if (next) p[m] = next; else delete p[m];
    set({ priorities: p });
  };

  if (step === 'build') {
    return html`<${Page} title=${t('prog.building')} back="/train/programs" backLabel=${t('prog.title')}>
      <div class="card pad prog-stages">${['equipment', 'experience', 'priorities', 'split', 'exercises', 'time'].map((k, i) => html`<div class=${'prog-stage' + (i < stage ? ' done' : i === stage ? ' cur' : '')}><span class="dot">${i < stage ? html`<${Icon} name="check"/>` : null}</span>${stageLabel(k)}</div>`)}</div>
    <//>`;
  }

  if (step === 'preview' && res) {
    const vol = plannedSets(res.plans, cat.byId);
    const top = Object.entries(vol).sort((a, b) => b[1] - a[1]);
    return html`<${Page} title=${t('prog.preview')} back="/train/programs" backLabel=${t('prog.title')}>
      <div class="card pad">
        <${Field} label=${t('prog.name')}><input value=${name} onInput=${(e) => setName(e.currentTarget.value)}/><//>
        <div class="hint">${[splitLabel(res.program.split), t('prog.daysN', { count: o.days }), t('prog.minN', { n: o.minutes }), perLabel(o.periodization), dlLabel(o.deload), t('prog.weeksN', { count: o.weeks })].join(' · ')}</div>
      </div>
      ${res.plans.map((p, pi) => html`<div class="card pad prog-day">
        <div class="prog-dh"><span class="wk-wd">${wdShort(p.weekday)}</span><b>${p.name}</b><span class="hint">${wdLabel(p.weekday)}</span></div>
        ${p.sections[0].items.map((it, ii) => html`<button class="prog-it" type="button" onClick=${() => setPicker({ pi, ii })}>
          <span class="grow">${(cat.byId[it.exerciseId] || it).name}</span><span class="hint">${it.sets} × ${fmtReps(it)}${it.rir != null ? ' · RIR ' + it.rir : ''}</span></button>`)}
        ${!p.sections[0].items.length ? html`<div class="hint">${t('prog.noExercises')}</div>` : null}
      </div>`)}
      <div class="card pad"><div class="rl">${t('prog.volume')}</div>
        <div class="prog-vol">${top.slice(0, 12).map(([m, v]) => html`<span><b>${fmtNum(v, 1)}</b> ${muscleLabel(m)}</span>`)}</div>
      </div>
      <button class="primary wk-add" onClick=${save}>${t('prog.save')}</button>
      <button class="wk-more" onClick=${() => setStep('form')}>${t('prog.back')}</button>
      <${ExercisePicker} open=${!!picker} onClose=${() => setPicker(null)} onPick=${replaceItem} gym=${gym}/>
    <//>`;
  }

  return html`<${Page} title=${t('prog.new')} back="/train/programs" backLabel=${t('prog.title')}>
    <${Card} title=${t('prog.goalTitle')} icon="target" color="var(--k-str)">
      <${Pills} value=${o.goal} onChange=${(v) => set({ goal: v })} options=${GOALS.map((g) => [g, goalLabel(g)])}/>
      <div style="margin-top:10px"><${Pills} label=${t('prog.expTitle')} value=${o.experience} onChange=${(v) => set({ experience: v })} options=${EXPERIENCE.map((g) => [g, expLabel(g)])}/></div>
    <//>
    <${Card} title=${t('prog.schedule')} icon="cal" color="var(--k-str)">
      <${Pills} label=${t('prog.days')} value=${o.days} onChange=${(v) => set({ days: v, split: splitsFor(v)[0] })} options=${[2, 3, 4, 5, 6].map((d) => [d, String(d)])}/>
      <div style="margin-top:10px"><${Pills} label=${t('prog.minutes')} value=${o.minutes} onChange=${(v) => set({ minutes: v })} options=${MINUTES.map((m) => [m, String(m)])}/></div>
      ${gyms.length ? html`<div class="lbl" style="margin-top:10px">${t('prog.gym')}</div>
        <div class="wk-chips pick">${gyms.map((g) => html`<button class=${'chip' + (o.gymId === g.id ? ' on' : '')} onClick=${() => set({ gymId: g.id })}>${g.name}</button>`)}<button class=${'chip' + (!o.gymId ? ' on' : '')} onClick=${() => set({ gymId: null })}>${t('prog.anyGym')}</button></div>` : html`<div class="hint">${t('prog.noGym')}</div>`}
    <//>
    <${Card} title=${t('prog.splitTitle')} icon="list" color="var(--k-str)">
      <div class="list prog-splits" role="radiogroup">${splits.map((k) => html`<button class=${'lrow' + (o.split === k ? ' on' : '')} role="radio" aria-checked=${o.split === k} type="button" onClick=${() => set({ split: k })}>
        <span class="ltext"><span class="ll">${splitLabel(k)}</span><span class="ls">${splitHint(k)}</span></span>${o.split === k ? html`<${Icon} name="check"/>` : null}</button>`)}</div>
    <//>
    <${Card} title=${t('prog.focus')} icon="up" color="var(--k-str)">
      <div class="wk-chips pick prog-focus">${PRIORITY_MUSCLES.map((m) => html`<button class=${'chip' + (o.priorities[m] === 'more' ? ' on' : o.priorities[m] === 'less' ? ' less' : '')} onClick=${() => cyclePriority(m)}>${o.priorities[m] === 'more' ? '+ ' : o.priorities[m] === 'less' ? '− ' : ''}${muscleLabel(m)}</button>`)}</div>
      <div class="hint">${t('prog.focusHint')}</div>
      <div class="lbl" style="margin-top:10px">${t('prog.exclude')}</div>
      <div class="wk-chips">${o.exclude.map((id) => html`<button class="chip on" aria-label=${t('prog.unexclude')} onClick=${() => set({ exclude: o.exclude.filter((x) => x !== id) })}>${(cat.byId[id] || { name: id }).name} ×</button>`)}<button class="chip" onClick=${() => setPicker({ exclude: true })}>+ ${t('prog.addExclude')}</button></div>
    <//>
    <${Card} title=${t('prog.periodTitle')} icon="timer" color="var(--k-str)">
      <${Pills} value=${o.periodization} onChange=${(v) => set({ periodization: v })} options=${['none', 'linear', 'reverse', 'undulating'].map((k) => [k, perLabel(k)])}/>
      <div class="hint">${perHint(o.periodization)}</div>
      <div style="margin-top:10px"><${Pills} label=${t('prog.deloadTitle')} value=${o.deload} onChange=${(v) => set({ deload: v })} options=${['none', 'start', 'end'].map((k) => [k, dlLabel(k)])}/></div>
      <div style="margin-top:10px"><${Pills} label=${t('prog.weeks')} value=${o.weeks} onChange=${(v) => set({ weeks: v })} options=${[4, 5, 6, 8].map((w) => [w, String(w)])}/></div>
    <//>
    <button class="primary wk-add" disabled=${!cat.ready} onClick=${build}>${t('prog.build')}</button>
    <p class="lfoot">${t('prog.genFoot')}</p>
    <${ExercisePicker} open=${!!picker && picker.exclude} onClose=${() => setPicker(null)} onPick=${(ex) => { setPicker(null); if (!o.exclude.includes(ex.id)) set({ exclude: o.exclude.concat([ex.id]) }); }}/>
  <//>`;
}
