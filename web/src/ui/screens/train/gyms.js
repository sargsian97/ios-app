/* Залы: несколько профилей с иконками, шаблоны, инвентарь по категориям, блины (цвета, бамперные, кг и фунты),
   грифы, гантельный ряд, весовые стеки с микродовесками, зал по умолчанию, копия. */
import { html, useApp, useData, useState, useEffect, navigate, goBack } from '../../core.js';
import { Page, Card, Confirm, Field, Sheet, Segmented, Toggle, Soon } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { gymFromTemplate, EQUIPMENT_CATEGORIES, plateColor, defaultGym } from '../../../domain/gym.js';
import { uid } from '../../../data/ids.js';
import { NumIn, parseNum } from '../../train/inputs.js';
import { equipLabel, tplLabel, tplSub, eqCatLabel, barLabel, stackLabel } from '../../train/catalog.js';

export const GYM_ICONS = ['gym', 'house', 'garage', 'train', 'bolt', 'heart', 'target'];
const TEMPLATES = ['commercial', 'garage', 'home', 'full', 'custom'];
const PALETTE = ['#D7263D', '#1E5BD7', '#F2C230', '#2E9E44', '#F4F4F4', '#1C1C1E', '#B8BCC2', '#8E44AD'];

export function GymList() {
  const { repos } = useApp();
  useData(['gyms', 'workoutProfile']);
  const [pick, setPick] = useState(false);
  const gyms = repos.gym.list().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const def = defaultGym(gyms, repos.workoutProfile.get());
  async function create(tpl) {
    setPick(false);
    const g = await repos.gym.create(Object.assign(gymFromTemplate(tpl), { id: 'g-' + uid(), name: tplLabel(tpl) }));
    if (!def) await repos.workoutProfile.update({ defaultGymId: g.id });
    navigate('/train/gym/' + encodeURIComponent(g.id), { replace: true });
  }
  return html`<${Page} title=${t('gym.title')} icon="gym" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train/settings" backLabel=${t('train.settings')}
      right=${html`<button class="small icn" aria-label=${t('gym.new')} onClick=${() => setPick(true)}><${Icon} name="plus"/></button>`}>
    <div class="list">
      ${gyms.map((g) => html`<button class="lrow" type="button" onClick=${() => navigate('/train/gym/' + encodeURIComponent(g.id))}>
        <span class="lico" style="--cc:var(--k-str)"><${Icon} name=${g.icon || 'gym'}/></span>
        <span class="ltext"><span class="ll">${g.name}</span><span class="ls">${tplLabel(g.template)} · ${t('gym.eqCount', { count: (g.equipment || []).length })}</span></span>
        ${def && def.id === g.id ? html`<span class="lbadge">${t('gym.default')}</span>` : null}</button>`)}
      ${!gyms.length ? html`<div class="empty">${t('gym.none')}</div>` : null}
    </div>
    ${!gyms.length ? html`<button class="primary wk-add" onClick=${() => setPick(true)}><${Icon} name="plus"/>${t('gym.new')}</button>` : null}
    <p class="lfoot">${t('gym.foot')}</p>
    <${Sheet} open=${pick} onClose=${() => setPick(false)} title=${t('gym.pickTpl')}>
      <div class="list">${TEMPLATES.map((k) => html`<button class="lrow" type="button" onClick=${() => create(k)}>
        <span class="lico" style="--cc:var(--k-str)"><${Icon} name=${k === 'home' ? 'house' : k === 'garage' ? 'garage' : 'gym'}/></span>
        <span class="ltext"><span class="ll">${tplLabel(k)}</span><span class="ls">${tplSub(k)}</span></span></button>`)}</div>
    <//>
  <//>`;
}

/* Строка-список чисел через запятую */
const listText = (a) => (a || []).map((x) => fmtNum(x, 3)).join('; ');
const parseList = (s) => String(s || '').split(/[;\s]+/).map(parseNum).filter((x) => x != null && x > 0).sort((a, b) => a - b);

export function GymEditor({ route }) {
  const { repos } = useApp();
  useData(['gyms', 'workoutProfile']);
  const id = decodeURIComponent(route.parts[2] || '');
  const doc = repos.gym.get(id);
  const [d, setD] = useState(null);
  const [forId, setForId] = useState(null);
  const [ask, setAsk] = useState(false);
  const [dbList, setDbList] = useState(null);
  useEffect(() => { if (doc && forId !== id) { setD(JSON.parse(JSON.stringify(doc))); setForId(id); setDbList(null); } }, [doc, id]);
  if (!doc) return html`<${Page} title=${t('gym.title')} back="/train/gyms" backLabel=${t('gym.title')}><div class="card empty">${t('gym.notFound')}</div><//>`;
  if (!d || forId !== id) return null;
  const prof = repos.workoutProfile.get();
  const isDef = (defaultGym(repos.gym.list(), prof) || {}).id === id;
  const set = (patch) => setD(Object.assign({}, d, patch));
  const setRow = (key, i, patch) => set({ [key]: d[key].map((x, j) => (j === i ? Object.assign({}, x, patch) : x)) });
  const delRow = (key, i) => set({ [key]: d[key].filter((_, j) => j !== i) });
  const dirty = JSON.stringify(doc) !== JSON.stringify(d);
  const save = async () => { await repos.gym.save(Object.assign({}, d, { id, name: d.name.trim() || tplLabel(d.template) })); };
  const dbMode = (d.dumbbells.list || []).length || dbList != null ? 'list' : 'range';
  return html`<${Page} title=${d.name || t('gym.title')} icon=${d.icon || 'gym'} color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train/gyms" backLabel=${t('gym.title')}
      right=${html`<button class="small primary" disabled=${!dirty} onClick=${async () => { await save(); goBack('/train/gyms'); }}>${t('common.save')}</button>`}>
    <div class="card pad">
      <${Field} label=${t('gym.name')}><input value=${d.name} onInput=${(e) => set({ name: e.currentTarget.value })}/><//>
      <div class="lbl">${t('gym.icon')}</div>
      <div class="gy-icons" role="radiogroup">${GYM_ICONS.map((k) => html`<button role="radio" aria-checked=${d.icon === k} aria-label=${k} class=${'gy-ic' + (d.icon === k ? ' on' : '')} onClick=${() => set({ icon: k })}><${Icon} name=${k}/></button>`)}</div>
      <div style="margin-top:10px"><${Toggle} on=${isDef} onChange=${(v) => repos.workoutProfile.update({ defaultGymId: v ? id : null })} label=${t('gym.isDefault')} hint=${t('gym.isDefaultHint')}/></div>
    </div>

    <${Card} title=${t('gym.inventory')} icon="list" color="var(--k-str)">
      ${EQUIPMENT_CATEGORIES.map(([cat, keys]) => html`<div class="lbl">${eqCatLabel(cat)}</div>
        <div class="wk-chips pick">${keys.map((k) => html`<button role="checkbox" aria-checked=${d.equipment.includes(k)} class=${'chip' + (d.equipment.includes(k) ? ' on' : '')}
          onClick=${() => set({ equipment: d.equipment.includes(k) ? d.equipment.filter((x) => x !== k) : d.equipment.concat([k]) })}>${equipLabel(k)}</button>`)}</div>`)}
    <//>

    <${Card} title=${t('gym.plates')} icon="plate" color="#D7263D">
      <div class="gy-cols"><span></span><span>${t('gym.weight')}</span><span>${t('gym.unit')}</span><span>${t('gym.count')}</span><span></span><span></span></div>
      ${d.plates.map((p, i) => html`<div class="gy-row">
        <button class="gy-sw" style=${'background:' + (p.color || plateColor(p.weight))} aria-label=${t('gym.color')} onClick=${() => setRow('plates', i, { color: PALETTE[(PALETTE.indexOf(p.color) + 1) % PALETTE.length] })}></button>
        <${NumIn} value=${p.weight} label=${t('gym.weight')} onCommit=${(v) => setRow('plates', i, { weight: v == null ? 0 : v, color: p.color || plateColor(v) })}/>
        <button class="small" onClick=${() => setRow('plates', i, { unit: p.unit === 'lb' ? 'kg' : 'lb' })}>${p.unit === 'lb' ? t('unit.lb') : t('unit.kg')}</button>
        <${NumIn} mode="numeric" value=${p.count} label=${t('gym.count')} onCommit=${(v) => setRow('plates', i, { count: v == null ? 0 : Math.max(0, Math.round(v)) })}/>
        <button class=${'chip gy-bump' + (p.bumper ? ' on' : '')} aria-pressed=${!!p.bumper} title=${t('gym.bumper')} onClick=${() => setRow('plates', i, { bumper: !p.bumper })}>${t('gym.bumperShort')}</button>
        <button class="small icn danger" aria-label=${t('common.delete')} onClick=${() => delRow('plates', i)}><${Icon} name="close" size=${14}/></button>
      </div>`)}
      <button class="small" onClick=${() => set({ plates: d.plates.concat([{ weight: 5, unit: 'kg', count: 2, color: plateColor(5), bumper: false }]) })}>${t('gym.addPlate')}</button>
      <div class="hint">${t('gym.platesHint')}</div>
    <//>

    <${Card} title=${t('gym.bars')} icon="train" color="#8E8E93">
      ${d.bars.map((b, i) => html`<div class="gy-row2">
        <input value=${barLabel(b.name)} aria-label=${t('gym.barName')} onInput=${(e) => setRow('bars', i, { name: e.currentTarget.value })}/>
        <${NumIn} value=${b.weight} label=${t('gym.weight')} onCommit=${(v) => setRow('bars', i, { weight: v == null ? 0 : v })}/>
        <button class="small icn danger" aria-label=${t('common.delete')} onClick=${() => delRow('bars', i)}><${Icon} name="close" size=${14}/></button>
      </div>`)}
      <button class="small" onClick=${() => set({ bars: d.bars.concat([{ id: 'b' + uid(), name: t('gym.newBar'), weight: 20 }]) })}>${t('gym.addBar')}</button>
    <//>

    <${Card} title=${t('gym.dumbbells')} icon="train" color="var(--k-str)">
      <${Segmented} value=${dbMode} onChange=${(v) => { if (v === 'list') setDbList(listText(d.dumbbells.list)); else { setDbList(null); set({ dumbbells: Object.assign({}, d.dumbbells, { list: [] }) }); } }} options=${[['range', t('gym.db.range')], ['list', t('gym.db.list')]]}/>
      ${dbMode === 'range' ? html`<div class="grid3" style="margin-top:10px">
        ${[['min', 'gym.min'], ['max', 'gym.max'], ['step', 'gym.step']].map(([k, l]) => html`<label class="fld"><span class="lbl">${t(l)}</span><${NumIn} value=${d.dumbbells[k]} label=${t(l)} onCommit=${(v) => set({ dumbbells: Object.assign({}, d.dumbbells, { [k]: v }) })}/></label>`)}
      </div>` : html`<${Field} label=${t('gym.db.listLabel')} hint=${t('gym.listHint')}><input inputmode="decimal" value=${dbList != null ? dbList : listText(d.dumbbells.list)} onInput=${(e) => { setDbList(e.currentTarget.value); set({ dumbbells: Object.assign({}, d.dumbbells, { list: parseList(e.currentTarget.value) }) }); }}/><//>`}
    <//>

    <${Card} title=${t('gym.stacks')} icon="list" color="#30B0C7">
      ${d.stacks.map((s, i) => html`<div class="gy-stack">
        <div class="gy-row2"><input value=${stackLabel(s.name)} aria-label=${t('gym.stackName')} onInput=${(e) => setRow('stacks', i, { name: e.currentTarget.value })}/>
          <button class="small icn danger" aria-label=${t('common.delete')} onClick=${() => delRow('stacks', i)}><${Icon} name="close" size=${14}/></button></div>
        <div class="grid3">${[['min', 'gym.min'], ['max', 'gym.max'], ['step', 'gym.step']].map(([k, l]) => html`<label class="fld"><span class="lbl">${t(l)}</span><${NumIn} value=${s[k]} label=${t(l)} onCommit=${(v) => setRow('stacks', i, { [k]: v })}/></label>`)}</div>
        <${Field} label=${t('gym.micro')} hint=${t('gym.listHint')}><input inputmode="decimal" value=${listText(s.micro)} onChange=${(e) => setRow('stacks', i, { micro: parseList(e.currentTarget.value) })}/><//>
      </div>`)}
      <button class="small" onClick=${() => set({ stacks: d.stacks.concat([{ id: 's' + uid(), name: t('gym.newStack'), min: 5, max: 100, step: 5, micro: [] }]) })}>${t('gym.addStack')}</button>
      <div class="soonrow"><span>${t('gym.scan')}</span><${Soon}/></div>
    <//>

    <div class="row" style="margin-bottom:12px">
      <button class="grow" onClick=${async () => { if (dirty) await save(); const copy = await repos.gym.create(Object.assign({}, d, { id: 'g-' + uid(), name: d.name + ' ' + t('train.plan.copy'), isDefault: false })); navigate('/train/gym/' + encodeURIComponent(copy.id), { replace: true }); }}>${t('gym.duplicate')}</button>
      <button class="danger" onClick=${() => setAsk(true)}>${t('common.delete')}</button>
    </div>
    ${ask ? html`<${Confirm} text=${t('gym.deleteAsk', { name: d.name })} yes=${t('common.delete')} danger=${true} onNo=${() => setAsk(false)} onYes=${async () => { setAsk(false); await repos.gym.remove(id); if (isDef) await repos.workoutProfile.update({ defaultGymId: null }); goBack('/train/gyms'); }}/>` : null}
  <//>`;
}
