/* Рецепты: список и редактор (ингредиенты, вложенные рецепты, шаги, время, вес готового, порции). */
import { html, useApp, useData, useState, useEffect, navigate, goBack } from '../../core.js';
import { Page, Card, Field, Sheet, Confirm, SearchBox } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { useEnergy, num, macroLine, per100Text, Spinner } from '../../food/parts.js';
import { searchLocal, searchOnline, saveOnlineFood, recipeSummary, loadBasic, basicCache, searchBasic, saveBasicFood, savedBasicIds } from '../../../services/foodsearch/index.js';
import { recipeTotals, recipePortion, recipePer100 } from '../../../domain/nutrition.js';
import { ProductSheet } from './add.js';

export function Recipes() {
  const { repos } = useApp();
  useData(['recipes', 'foodItems']);
  const energy = useEnergy();
  const list = repos.recipe.list((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
  return html`<${Page} title=${t('food.recipes')} back="/food" backLabel=${t('nav.food')}
      right=${html`<button class="small" onClick=${() => navigate('/food/recipe/new')}>${t('food.recipe.new')}</button>`}>
    ${list.length ? html`<div class="list">${list.map((r) => {
      const s = recipeSummary(repos, r);
      const perServing = recipePortion(r, s.totals, { servings: 1 });
      return html`<button class="lrow" onClick=${() => navigate('/food/recipe/' + r.id)}>
        <span class="ltext"><span class="ll">${r.name}</span>
          <span class="ls">${t('food.recipe.perServing', { k: energy.fmt(perServing.kcal || 0), u: energy.unit })} · ${t('food.recipe.servingsN', { count: r.servings || 1 })}</span></span>
        <${Icon} name="right" cls="chev"/></button>`;
    })}</div>` : html`<div class="card pad empty">${t('food.recipe.empty')}</div>`}
  <//>`;
}

function blank() { return { name: '', servings: '1', cookedWeight: '', prepMinutes: '', cookMinutes: '', ingredients: [], steps: '', sourceUrl: '' }; }
function fromDoc(r) {
  return { name: r.name, servings: String(r.servings || 1), cookedWeight: r.cookedWeight == null ? '' : String(r.cookedWeight), prepMinutes: r.prepMinutes == null ? '' : String(r.prepMinutes),
    cookMinutes: r.cookMinutes == null ? '' : String(r.cookMinutes), ingredients: r.ingredients.map((i) => Object.assign({}, i, { amount: i.amount == null ? '' : String(i.amount) })), steps: (r.steps || []).join('\n'), sourceUrl: r.sourceUrl || '' };
}

export function RecipeEditor({ route }) {
  const { repos } = useApp();
  useData(['recipes', 'foodItems']);
  const energy = useEnergy();
  const id = route.parts[2] === 'new' ? null : route.parts[2];
  const doc = id ? repos.recipe.get(id) : null;
  const [d, setD] = useState(null);
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState('');
  const [del, setDel] = useState(false);
  useEffect(() => { setD(doc ? fromDoc(doc) : blank()); }, [id]);
  if (!d) return null;
  if (id && !doc) return html`<${Page} title=${t('food.recipes')} back="/food/recipes"><div class="card pad">${t('food.editor.gone')}</div><//>`;
  const set = (patch) => setD(Object.assign({}, d, patch));

  const draft = {
    id: id || '__draft', name: d.name, servings: num(d.servings) || 1, cookedWeight: num(d.cookedWeight),
    ingredients: d.ingredients.map((i) => Object.assign({}, i, { amount: num(i.amount) || 0 }))
  };
  const resolve = (kind, rid) => (kind === 'recipe' ? repos.recipe.get(rid) : repos.food.get(rid));
  let totals, cycle = null;
  try { totals = recipeTotals(draft, resolve); } catch (e) { cycle = e.message; totals = { nutrients: {}, weight: 0, rawWeight: 0, missing: [] }; }
  const perServing = recipePortion(draft, totals, { servings: 1 });
  const per100 = recipePer100(totals);

  async function save() {
    setErr('');
    if (!d.name.trim()) { setErr(t('food.editor.needName')); return; }
    if (cycle) { setErr(t('food.recipe.cycle')); return; }
    const data = {
      name: d.name.trim(), servings: num(d.servings) || 1, cookedWeight: num(d.cookedWeight), prepMinutes: num(d.prepMinutes), cookMinutes: num(d.cookMinutes),
      ingredients: draft.ingredients.map((i) => ({ ref: i.ref, name: i.name, amount: i.amount, servingId: i.servingId || '', quantity: i.quantity ?? null })),
      steps: d.steps.split('\n').map((s) => s.trim()).filter(Boolean), sourceUrl: d.sourceUrl.trim()
    };
    try {
      if (doc) await repos.recipe.update(doc.id, data);
      else await repos.recipe.create(data);
      goBack('/food/recipes');
    } catch (e) { setErr(t('food.editor.invalid')); }
  }

  return html`<${Page} title=${doc ? doc.name : t('food.recipe.new')} back="/food/recipes" backLabel=${t('food.recipes')}>
    <${Card}>
      <${Field} label=${t('food.editor.name')}><input value=${d.name} placeholder=${t('food.recipe.namePh')} onInput=${(e) => set({ name: e.currentTarget.value })}/><//>
      <div class="grid2" style="margin-top:12px">
        <${Field} label=${t('food.recipe.servingsLabel')}><input inputmode="decimal" value=${d.servings} onInput=${(e) => set({ servings: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.recipe.cooked')} hint=${t('food.recipe.cookedHint', { g: fmtNum(totals.rawWeight) })}><input inputmode="decimal" value=${d.cookedWeight} onInput=${(e) => set({ cookedWeight: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.recipe.prep')}><input inputmode="numeric" value=${d.prepMinutes} onInput=${(e) => set({ prepMinutes: e.currentTarget.value })}/><//>
        <${Field} label=${t('food.recipe.cook')}><input inputmode="numeric" value=${d.cookMinutes} onInput=${(e) => set({ cookMinutes: e.currentTarget.value })}/><//>
      </div>
    <//>
    <${Card} title=${t('food.recipe.ingredients')} icon="food" color="var(--k-food)">
      ${d.ingredients.map((i, k) => html`<div class="row ingr">
        <span class="grow"><b>${i.name}</b>${i.ref && i.ref.kind === 'recipe' ? html` <span class="lbadge">${t('food.recipe.badge')}</span>` : null}${resolve(i.ref.kind, i.ref.id) ? null : html` <span class="lbadge">${t('food.recipe.missing')}</span>`}</span>
        <input class="gin" inputmode="decimal" value=${i.amount} aria-label=${t('food.grams')} onInput=${(e) => set({ ingredients: d.ingredients.map((x, j) => (j === k ? Object.assign({}, x, { amount: e.currentTarget.value }) : x)) })}/><span class="gu">${(() => { const f = i.ref.kind === 'food' ? repos.food.get(i.ref.id) : null; return f && f.base && f.base.unit === 'ml' ? t('unit.ml') : t('unit.g'); })()}</span>
        <button class="small icn danger" aria-label=${t('food.delete')} onClick=${() => set({ ingredients: d.ingredients.filter((x, j) => j !== k) })}><${Icon} name="close" size=${14}/></button>
      </div>`)}
      <button class="small" onClick=${() => setPick(true)}>${t('food.recipe.addIngredient')}</button>
    <//>
    <${Card} title=${t('food.recipe.totals')} icon="flame" color="var(--k-burn)">
      ${cycle ? html`<div class="banner warnb">${t('food.recipe.cycle')}</div>` : null}
      <div class="kv"><span>${t('food.recipe.total')}</span><span>${energy.fmt(totals.nutrients.kcal || 0)} ${energy.unit}</span></div>
      <div class="kv"><span>${t('food.recipe.oneServing')}</span><span>${energy.fmt(perServing.kcal || 0)} ${energy.unit}</span></div>
      <div class="hint" style="margin:-4px 0 6px">${macroLine(perServing)}</div>
      <div class="kv"><span>${t('food.per100')}</span><span>${per100Text(per100, energy)}</span></div>
      ${totals.missing.length ? html`<div class="hint warn">${t('food.recipe.missingList', { list: totals.missing.join(', ') })}</div>` : null}
    <//>
    <${Card} title=${t('food.recipe.steps')} icon="list" color="var(--k-plan)">
      <textarea rows="6" placeholder=${t('food.recipe.stepsPh')} value=${d.steps} onInput=${(e) => set({ steps: e.currentTarget.value })}></textarea>
      <div style="margin-top:10px"><${Field} label=${t('food.recipe.source')}><input type="url" value=${d.sourceUrl} onInput=${(e) => set({ sourceUrl: e.currentTarget.value })}/><//></div>
      <div class="soonrow" style="margin-top:10px"><span>${t('food.recipe.importUrl')}</span><span class="soon">${t('common.soon')}</span></div>
      <div class="hint">${t('food.recipe.importSoon')}</div>
    <//>
    ${err ? html`<div class="banner warnb">${err}</div>` : null}
    <button class="primary" style="width:100%" onClick=${save}>${t('common.save')}</button>
    ${doc ? html`<button class="danger" style="width:100%;margin-top:10px" onClick=${() => setDel(true)}>${t('food.editor.archive')}</button>` : null}
    ${del ? html`<${Confirm} text=${t('food.recipe.archiveConfirm')} yes=${t('food.editor.archive')} danger=${true} onNo=${() => setDel(false)} onYes=${async () => { setDel(false); await repos.recipe.update(doc.id, { archived: true }); goBack('/food/recipes'); }}/>` : null}
    <${IngredientPicker} open=${pick} exclude=${id} onClose=${() => setPick(false)} onPick=${(it) => { setPick(false); set({ ingredients: d.ingredients.concat([{ ref: it.ref, name: it.name, amount: String(Math.round((it.amount || 0) * 10) / 10), servingId: it.servingId, quantity: it.quantity }]) }); }}/>
  <//>`;
}

/* Выбор ингредиента: свои продукты, рецепты и Open Food Facts */
function IngredientPicker({ open, exclude, onClose, onPick }) {
  const { repos } = useApp();
  const energy = useEnergy();
  const [q, setQ] = useState('');
  const [item, setItem] = useState(null);
  const [online, setOnline] = useState({ busy: false, off: [], q: '', err: null });
  const [basicReady, setBasicReady] = useState(!!basicCache());
  useEffect(() => { if (!open) { setQ(''); setItem(null); setOnline({ busy: false, off: [], q: '', err: null }); } }, [open]);
  useEffect(() => { if (open && !basicReady) loadBasic().then(() => setBasicReady(true)).catch(() => {}); }, [open]);
  /* в интернете — по Enter или кнопке, как на экране добавления (лимит Open Food Facts) */
  async function searchNet() {
    const s = q.trim();
    if (s.length < 2) return;
    setOnline({ busy: true, off: [], q: s, err: null });
    const r = await searchOnline(repos, s, { usdaKey: '' });
    setOnline({ busy: false, off: r.off, q: s, err: r.errors.off });
  }
  if (!open) return null;
  if (item) return html`<${ProductSheet} item=${item} date=${null} pickOnly=${true} onClose=${() => setItem(null)} onLog=${onPick} onPlate=${onPick}/>`;
  const s = q.trim();
  const local = searchLocal(repos, q, { limit: 30 }).filter((x) => !(x.kind === 'recipe' && x.doc.id === exclude));
  const basic = s && basicReady ? searchBasic(s, { limit: 8, exclude: savedBasicIds(repos) }) : [];
  const row = (name, sub, onTap) => html`<button class="lrow rrow" onClick=${onTap}><span class="ltext"><span class="ll">${name}</span><span class="ls">${sub}</span></span><${Icon} name="plus" cls="radd"/></button>`;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.recipe.addIngredient')}>
    <${SearchBox} value=${q} onInput=${setQ} placeholder=${t('food.search.ph')} onEnter=${searchNet}/>
    <div class="list results">${local.map((x) => row(x.doc.name, x.kind === 'recipe' ? t('food.recipe.badge') : per100Text(x.doc.nutrients, energy), () => setItem(x)))}</div>
    ${basic.length ? html`<div class="ltitle">${t('food.basic.title')}</div><div class="list results">${basic.map((it) => row(it.n, per100Text(it.nu, energy) + ' · ' + (it.a ? '≈ ' : '') + t('food.src.basic'), async () => setItem({ kind: 'food', doc: await saveBasicFood(repos, it) })))}</div>` : null}
    ${s.length >= 2 && online.q !== s ? html`<button class="linkbtn" style="width:100%" onClick=${searchNet}>${t('food.net.find')}</button>` : null}
    ${online.q === s ? html`<div class="ltitle row">${t('food.online.off')}${online.busy ? html`<${Spinner}/>` : null}</div>
      ${online.err ? html`<div class="lfoot">${online.err.code === 'rate_limited' ? t('food.net.limit') : t('food.online.error')}</div>` : null}
      <div class="list results">${online.off.map((f) => row(f.name, (f.brand ? f.brand + ' · ' : '') + per100Text(f.nutrients, energy), async () => setItem({ kind: 'food', doc: await saveOnlineFood(repos, f) })))}</div>
      ${!online.busy ? html`<div class="lfoot">${t('food.net.attrib')}</div>` : null}` : null}
  <//>`;
}
