/* Свой продукт: название, бренд, штрихкод, этикетка (на 100 г / 100 мл / порцию), нутриенты,
   порции; заполнение через ИИ по названию или по фото этикетки. */
import { html, useApp, useData, useState, useEffect, useRef, goBack, todayYmd } from '../../core.js';
import { Page, Card, Field, Segmented, Confirm } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { num, Spinner } from '../../food/parts.js';
import { NUTRIENT_KEYS, NUTRIENT_UNITS, MACROS } from '../../../data/models/nutrients.js';
import { perServingTo100, kcalFromMacros } from '../../../domain/nutrition.js';
import { aiFill, aiPhoto, aiErrorKey, getClaudeKey } from '../../../services/ai-food.js';
import { nutrientLabel, unitLabel, periodLabel } from '../../food/labels.js';

const GROUPS = [['carbs', 'food.group.carbs'], ['fats', 'food.group.fats'], ['protein', 'food.group.protein'], ['vitamins', 'food.group.vitamins'], ['minerals', 'food.group.minerals'], ['other', 'food.group.other']];

function blank(query) {
  return { name: '', brand: '', barcode: query.barcode || '', format: 'per100g', servingG: '', n: {}, servings: [], density: '' };
}

function fromDoc(doc) {
  const n = {};
  Object.keys(doc.nutrients || {}).forEach((k) => { n[k] = String(doc.nutrients[k]); });
  return { name: doc.name, brand: doc.brand, barcode: doc.barcode, format: doc.base && doc.base.unit === 'ml' ? 'per100ml' : 'per100g', servingG: '', n,
    servings: (doc.servings || []).map((s) => ({ id: s.id, label: s.label, amount: s.amount == null ? '' : String(s.amount), unit: s.unit })), density: doc.density == null ? '' : String(doc.density) };
}

export function FoodEditor({ route }) {
  const { repos, store } = useApp();
  useData(['foodItems']);
  const id = route.parts[2] || null;
  const doc = id ? repos.food.get(id) : null;
  const [d, setD] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [ai, setAi] = useState({ busy: false, msg: '' });
  const [del, setDel] = useState(false);
  const photo = useRef(null);
  useEffect(() => { setD(doc ? fromDoc(doc) : blank(route.query)); }, [id]);
  if (!d) return null;
  if (id && !doc) return html`<${Page} title=${t('food.editor.title')} back="/food/library"><div class="card pad">${t('food.editor.gone')}</div><//>`;

  const set = (patch) => setD(Object.assign({}, d, patch));
  const setN = (k, v) => set({ n: Object.assign({}, d.n, { [k]: v }) });
  const per = d.format === 'serving';
  const nums = {};
  Object.keys(d.n).forEach((k) => { const v = num(d.n[k]); if (v != null && v >= 0) nums[k] = v; });
  const kcalHint = nums.kcal == null && (nums.protein || nums.fat || nums.carbs) ? kcalFromMacros(nums) : null;

  async function save() {
    setErr('');
    if (!d.name.trim()) { setErr(t('food.editor.needName')); return; }
    const n = Object.assign({}, nums);
    if (n.kcal == null && kcalHint != null) n.kcal = kcalHint;
    if (n.kcal == null) { setErr(t('food.editor.needKcal')); return; }
    const servings = d.servings.map((s, i) => ({ id: s.id || 's' + i + Date.now().toString(36), label: s.label.trim(), amount: num(s.amount), unit: s.unit || 'g' })).filter((s) => s.label && s.amount > 0);
    let nutrients = n;
    if (per) {
      const g = num(d.servingG);
      if (!(g > 0)) { setErr(t('food.editor.needServing')); return; }
      nutrients = perServingTo100(n, g);
      if (!servings.some((s) => s.amount === g)) servings.unshift({ id: 'serving', label: t('food.editor.oneServing'), amount: g, unit: 'g' });
    }
    const data = { name: d.name.trim(), brand: d.brand.trim(), barcode: d.barcode.replace(/\D/g, ''), base: { amount: 100, unit: d.format === 'per100ml' ? 'ml' : 'g' }, nutrients, servings, density: num(d.density), labelFormat: per ? 'perServing' : 'per100' };
    try {
      if (doc) await repos.food.update(doc.id, data);
      else await repos.food.create(Object.assign({ source: 'user' }, data));
      goBack('/food/library');
    } catch (e) { setErr(t('food.editor.invalid')); }
  }

  async function fillByName() {
    setAi({ busy: true, msg: t('food.editor.aiBusy') });
    try {
      const r = await aiFill(store, d.name, { today: todayYmd(), now: new Date().toISOString() });
      const n = Object.assign({}, d.n);
      Object.keys(r.per100).forEach((k) => { n[k] = String(r.per100[k]); });
      setD(Object.assign({}, d, { n, format: d.format === 'serving' ? 'per100g' : d.format }));
      setAi({ busy: false, msg: t('food.editor.aiDone') + (r.note ? ' (' + r.note + ')' : '') });
    } catch (e) { setAi({ busy: false, msg: t(aiErrorKey(e), { period: e && e.period ? periodLabel(e.period) : '', limit: e && e.limit }) }); }
  }

  async function fillByPhoto(file) {
    if (!file) return;
    setAi({ busy: true, msg: t('food.photo.busy') });
    try {
      const r = await aiPhoto(store, file, { today: todayYmd(), now: new Date().toISOString() });
      const it = r.items.find((x) => x.src === 'label') || r.items[0];
      if (!it) { setAi({ busy: false, msg: t('food.photo.none') }); return; }
      const n = Object.assign({}, d.n);
      Object.keys(it.per100).forEach((k) => { n[k] = String(it.per100[k]); });
      setD(Object.assign({}, d, { n, name: d.name || it.name, format: d.format === 'serving' ? 'per100g' : d.format }));
      setAi({ busy: false, msg: t('food.editor.aiDone') });
    } catch (e) { setAi({ busy: false, msg: t(aiErrorKey(e), { period: e && e.period ? periodLabel(e.period) : '', limit: e && e.limit }) }); }
  }

  const nField = (k) => html`<${Field} label=${nutrientLabel(k) + ', ' + unitLabel(NUTRIENT_UNITS[k].unit)}>
    <input inputmode="decimal" value=${d.n[k] ?? ''} placeholder=${k === 'kcal' && kcalHint != null ? fmtNum(kcalHint) : ''} onInput=${(e) => setN(k, e.currentTarget.value)}/><//>`;
  const micro = NUTRIENT_KEYS.filter((k) => !MACROS.includes(k) && k !== 'fiber' && k !== 'protein_animal' && k !== 'protein_plant');

  return html`<${Page} title=${doc ? t('food.editor.edit') : t('food.editor.title')} back="/food/library" backLabel=${t('common.back')}>
    <${Card}>
      <${Field} label=${t('food.editor.name')}><input value=${d.name} placeholder=${t('food.editor.namePh')} onInput=${(e) => set({ name: e.currentTarget.value })}/><//>
      <div class="grid2" style="margin-top:12px">
        <${Field} label=${t('food.editor.brand')}><input value=${d.brand} onInput=${(e) => set({ brand: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.editor.barcode')}><input inputmode="numeric" value=${d.barcode} onInput=${(e) => set({ barcode: e.currentTarget.value })}/><//>
      </div>
    <//>
    <${Card} title=${t('food.editor.ai')} icon="bolt" color="#FF9500">
      ${getClaudeKey() ? html`<div class="grid2">
          <button disabled=${ai.busy || !d.name.trim()} onClick=${fillByName}>${t('food.editor.aiName')}</button>
          <button disabled=${ai.busy} onClick=${() => { photo.current.value = ''; photo.current.click(); }}>${t('food.editor.aiLabel')}</button>
        </div>
        <input ref=${photo} type="file" accept="image/*" hidden onChange=${(e) => fillByPhoto(e.currentTarget.files[0])}/>`
      : html`<div class="hint" style="margin:0">${t('food.photo.noKey')}</div>`}
      ${ai.msg ? html`<div class="hint io">${ai.busy ? html`<${Spinner}/> ` : null}${ai.msg}</div>` : null}
    <//>
    <${Card} title=${t('food.editor.label')} icon="list" color="var(--k-food)">
      <${Segmented} value=${d.format} onChange=${(v) => set({ format: v })} options=${[['per100g', t('food.editor.per100g')], ['per100ml', t('food.editor.per100ml')], ['serving', t('food.editor.perServing')]]}/>
      ${per ? html`<div style="margin-top:12px"><${Field} label=${t('food.editor.servingG')}><input inputmode="decimal" value=${d.servingG} onInput=${(e) => set({ servingG: e.currentTarget.value })}/><//></div>` : null}
      <div class="grid2" style="margin-top:14px">
        ${nField('kcal')}${nField('protein')}${nField('fat')}${nField('carbs')}${nField('fiber')}
      </div>
      <div class="grid2" style="margin-top:12px">${nField('protein_animal')}${nField('protein_plant')}</div>
      <div class="hint">${t('food.editor.proteinHint')}</div>
      <button class="linkbtn" onClick=${() => setMore(!more)}>${more ? t('food.lessNutrients') : t('food.editor.more')}</button>
      ${more ? GROUPS.map(([g, label]) => {
        const keys = micro.filter((k) => NUTRIENT_UNITS[k].group === g);
        return keys.length ? html`<div class="ltitle" style="margin-left:0">${t(label)}</div><div class="grid2">${keys.map(nField)}</div>` : null;
      }) : null}
    <//>
    <${Card} title=${t('food.editor.servings')} icon="food" color="var(--k-steps)">
      ${d.servings.map((s, i) => html`<div class="row" style="margin-bottom:8px">
        <input class="grow" placeholder=${t('food.editor.servingLabel')} value=${s.label} onInput=${(e) => set({ servings: d.servings.map((x, j) => (j === i ? Object.assign({}, x, { label: e.currentTarget.value }) : x)) })}/>
        <input style="width:90px" inputmode="decimal" placeholder=${d.format === 'per100ml' ? t('unit.ml') : t('unit.g')} value=${s.amount} onInput=${(e) => set({ servings: d.servings.map((x, j) => (j === i ? Object.assign({}, x, { amount: e.currentTarget.value }) : x)) })}/>
        <button class="small icn danger" aria-label=${t('food.delete')} onClick=${() => set({ servings: d.servings.filter((x, j) => j !== i) })}><${Icon} name="close" size=${14}/></button>
      </div>`)}
      <button class="small" onClick=${() => set({ servings: d.servings.concat([{ label: '', amount: '', unit: d.format === 'per100ml' ? 'ml' : 'g' }]) })}>${t('food.editor.addServing')}</button>
      <div class="hint">${t('food.editor.servingsHint')}</div>
      ${d.format === 'per100ml' ? html`<div style="margin-top:12px"><${Field} label=${t('food.editor.density')} hint=${t('food.editor.densityHint')}><input inputmode="decimal" value=${d.density} onInput=${(e) => set({ density: e.currentTarget.value })}/><//></div>` : null}
    <//>
    ${err ? html`<div class="banner warnb">${err}</div>` : null}
    <button class="primary" style="width:100%" onClick=${save}>${t('common.save')}</button>
    ${doc ? html`<button class="danger" style="width:100%;margin-top:10px" onClick=${() => setDel(true)}>${t('food.editor.archive')}</button>` : null}
    ${del ? html`<${Confirm} text=${t('food.editor.archiveConfirm')} yes=${t('food.editor.archive')} danger=${true} onNo=${() => setDel(false)} onYes=${async () => { setDel(false); await repos.food.update(doc.id, { archived: true }); goBack('/food/library'); }}/>` : null}
  <//>`;
}
