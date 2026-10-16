/* Добавление еды: поиск (свои + Open Food Facts + USDA), избранное, история, «тарелка» из нескольких
   продуктов, карточка продукта с порцией, быстрое добавление, штрихкод, фото еды через ИИ. */
import { html, useApp, useData, useLegacy, useState, useEffect, useRef, navigate, goBack, todayYmd } from '../../core.js';
import { Sheet, Field, Toggle } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { useEnergy, num, nowTime, per100Text, macroLine, Spinner } from '../../food/parts.js';
import { usePlate, plate } from '../../food/plate.js';
import { dayBudget } from '../../food/budget.js';
import { searchLocal, searchOnline, saveOnlineFood, recipeSummary, findBarcode, getUsdaKey } from '../../../services/foodsearch/index.js';
import { foodNutrients, servingAmount, recipePortion, dayTotals, recentItems, kcalFromMacros, hourlyGoTos, historyMatches } from '../../../domain/nutrition.js';
import { addDays } from '../../../domain/calc/index.js';
import { scaleNutrients, roundNutrients } from '../../../data/models/nutrients.js';
import { aiPhoto, aiErrorKey, getClaudeKey } from '../../../services/ai-food.js';
import { Scanner } from './scanner.js';
import { nutrientLabel, unitLabel, sourceLabel, periodLabel } from '../../food/labels.js';
import { NUTRIENT_UNITS } from '../../../data/models/nutrients.js';

const TABS = [['all', 'food.tab.all'], ['fav', 'food.tab.fav'], ['history', 'food.tab.history'], ['mine', 'food.tab.mine'], ['recipes', 'food.tab.recipes']];

/* Запись дневника из элемента тарелки */
function entryFrom(item, date, time) {
  return { date, time, ref: item.ref, name: item.name, amount: item.amount ?? null, unit: item.unit === 'ml' ? 'ml' : 'g', servingId: item.servingId || '', quantity: item.quantity ?? null, nutrients: roundNutrients(item.nutrients, 2) };
}

export async function logItems({ repos, store }, items, date, time) {
  const now = new Date().toISOString();
  const ops = items.map((it) => repos.foodEntry.putOp(entryFrom(it, date, it.time || time)));
  const touched = new Set();
  items.forEach((it) => {
    if (!it.ref || !it.ref.id || touched.has(it.ref.kind + it.ref.id)) return;
    touched.add(it.ref.kind + it.ref.id);
    const repo = it.ref.kind === 'recipe' ? repos.recipe : it.ref.kind === 'food' ? repos.food : null;
    const doc = repo && repo.get(it.ref.id);
    if (doc) ops.push(repo.putOp(Object.assign({}, doc, { lastUsedAt: now })));
  });
  await store.batch(ops);
}

export function FoodAdd({ route }) {
  const app = useApp();
  const { repos } = app;
  useData(['foodItems', 'recipes', 'favorites', 'foodEntries']);
  const energy = useEnergy();
  const p = usePlate();
  const date = route.query.d || todayYmd();
  const [time, setTime] = useState(route.query.t || (date === todayYmd() ? nowTime() : '12:00'));
  const [tab, setTab] = useState(route.query.tab || 'all');
  const [q, setQ] = useState('');
  const [online, setOnline] = useState({ busy: false, off: [], usda: [], errors: {} });
  const [item, setItem] = useState(null);
  const [quick, setQuick] = useState(route.query.open === 'quick');
  const [photo, setPhoto] = useState(route.query.open === 'photo');
  const [scan, setScan] = useState(route.query.open === 'scan');
  const [plateOpen, setPlateOpen] = useState(false);
  const [msg, setMsg] = useState('');

  /* поиск в интернете с задержкой */
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3 || (tab !== 'all')) { setOnline({ busy: false, off: [], usda: [], errors: {} }); return; }
    const ctl = new AbortController();
    setOnline((o) => Object.assign({}, o, { busy: true }));
    const tm = setTimeout(async () => {
      const r = await searchOnline(repos, s, { signal: ctl.signal });
      if (!ctl.signal.aborted) setOnline(Object.assign({ busy: false }, r));
    }, 500);
    return () => { clearTimeout(tm); ctl.abort(); };
  }, [q, tab]);

  async function pickOnline(food) {
    const saved = await saveOnlineFood(repos, food);
    setItem({ kind: 'food', doc: saved });
  }

  async function onCode(code) {
    setScan(false);
    setMsg(t('food.scan.looking', { code }));
    try {
      const f = await findBarcode(repos, code);
      if (f) { setMsg(''); setItem({ kind: 'food', doc: f }); }
      else setMsg(t('food.scan.notFound', { code }));
      if (!f) setNotFound(code);
    } catch (e) { setMsg(t('food.scan.error')); }
  }
  const [notFound, setNotFound] = useState(null);

  async function logNow(items) {
    await logItems(app, items, date, time);
    plate.clear();
    navigate('/food?d=' + date, { replace: true });
  }

  /* выдача по вкладке */
  let rows = [];
  if (tab === 'history') {
    rows = recentItems(repos.foodEntry.list(), { limit: 40 }).filter((e) => !q.trim() || (e.name || '').toLowerCase().includes(q.trim().toLowerCase())).map((e) => ({ kind: 'history', entry: e }));
  } else if (tab === 'fav') {
    rows = repos.favorite.list().sort((a, b) => a.order - b.order).map((f) => {
      const doc = f.ref.kind === 'recipe' ? repos.recipe.get(f.ref.id) : repos.food.get(f.ref.id);
      return doc ? { kind: f.ref.kind, doc, fav: f } : null;
    }).filter(Boolean);
  } else {
    rows = searchLocal(repos, q, { limit: 60 }).filter((x) => tab === 'all' || (tab === 'recipes' ? x.kind === 'recipe' : x.kind === 'food'));
  }

  const speed = repos.dietProfile.get().loggerMode === 'speed';
  const goTos = tab === 'all' && !q.trim() ? hourlyGoTos(repos.foodEntry.list(), { time, today: date, addDays }) : [];
  const fromHistory = tab === 'all' && q.trim() ? historyMatches(repos.foodEntry.list(), q) : [];
  /* быстрый режим: история и продукты сразу на тарелку (порция — как в прошлый раз), иначе — карточка */
  function openRow(r) {
    if (r.kind === 'history') {
      const e = r.entry;
      const doc = e.ref.kind === 'food' ? repos.food.get(e.ref.id) : e.ref.kind === 'recipe' ? repos.recipe.get(e.ref.id) : null;
      if (speed) { plate.add({ ref: e.ref, name: e.name, amount: e.amount, unit: e.unit, servingId: e.servingId, quantity: e.quantity, nutrients: e.nutrients }); setMsg(t('food.speed.added', { name: e.name })); return; }
      if (doc) setItem({ kind: e.ref.kind, doc, preset: { amount: e.amount, servingId: e.servingId, quantity: e.quantity } });
      else setItem({ kind: 'quick', entry: e });
      return;
    }
    if (speed && r.kind === 'food') {
      const last = recentItems(repos.foodEntry.list().filter((x) => x.ref && x.ref.kind === 'food' && x.ref.id === r.doc.id), { limit: 1 })[0];
      const amount = last && last.amount ? last.amount : (r.doc.base && r.doc.base.amount) || 100;
      plate.add({ ref: { kind: 'food', id: r.doc.id }, name: r.doc.name, amount, unit: r.doc.base && r.doc.base.unit === 'ml' ? 'ml' : 'g', nutrients: foodNutrients(r.doc, amount) });
      setMsg(t('food.speed.added', { name: r.doc.name }));
      return;
    }
    setItem(r);
  }

  const shortcuts = [
    ['barcode', 'food.sc.scan', () => setScan(true)],
    ['bolt', 'food.sc.quick', () => setQuick(true)],
    ['camera', 'food.sc.photo', () => setPhoto(true)],
    ['plus', 'food.sc.new', () => navigate('/food/new-food')]
  ];

  return html`<div class="wrap page addpage">
    <div class="navbar"><button class="back" onClick=${() => goBack('/food?d=' + date)}><${Icon} name="left"/>${t('nav.food')}</button></div>
    <div class="top"><h1>${t('food.add.title')}</h1>
      <label class="timechip"><span>${fmtDate(date)}</span><input type="time" value=${time} aria-label=${t('food.time')} onInput=${(e) => setTime(e.currentTarget.value || time)}/></label>
    </div>
    <div class="searchbox">
      <${Icon} name="search"/>
      <input type="search" placeholder=${t('food.search.ph')} value=${q} onInput=${(e) => setQ(e.currentTarget.value)} enterkeyhint="search" autocomplete="off"/>
      ${q ? html`<button class="clr" aria-label=${t('common.clear')} onClick=${() => setQ('')}><${Icon} name="close" size=${14}/></button>` : null}
    </div>
    <div class="scgrid">${shortcuts.map(([icon, label, fn]) => html`<button class="scbtn" onClick=${fn}><${Icon} name=${icon}/><span>${t(label)}</span></button>`)}</div>
    <div class="soonrow"><span>${t('food.ai.text')}</span><span class="soon">${t('common.soon')}</span></div>
    <div class="pills tabs5">${TABS.map(([k, l]) => html`<button class=${'pill' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${t(l)}</button>`)}</div>
    ${msg ? html`<div class="banner">${msg}</div>` : null}

    ${goTos.length ? html`<div class="ltitle">${t('food.goTos')}</div><div class="list">${goTos.map((e) => html`<${ResultRow} r=${{ kind: 'history', entry: e }} energy=${energy} onTap=${() => openRow({ kind: 'history', entry: e })}/>`)}</div>` : null}
    ${fromHistory.length ? html`<div class="ltitle">${t('food.histBlock')}</div><div class="list">${fromHistory.map((e) => html`<${ResultRow} r=${{ kind: 'history', entry: e }} energy=${energy} onTap=${() => openRow({ kind: 'history', entry: e })}/>`)}</div>
      <div class="ltitle">${t('food.fromLibrary')}</div>` : null}
    <div class="list results">
      ${rows.length ? rows.map((r) => html`<${ResultRow} r=${r} energy=${energy} onTap=${() => openRow(r)}/>`) : html`<div class="empty">${tab === 'fav' ? t('food.fav.empty') : tab === 'history' ? t('food.history.empty') : q ? t('food.search.noneLocal') : t('food.search.start')}</div>`}
    </div>

    ${tab === 'all' && q.trim().length >= 3 ? html`<${OnlineResults} online=${online} energy=${energy} onPick=${pickOnline}/>` : null}

    ${p.items().length ? html`<button class="platebar" onClick=${() => setPlateOpen(true)}>
      <span class="pb-n">${p.items().length}</span>
      <span class="grow">${t('food.plate')} · ${energy.fmt(p.totals().kcal)} ${energy.unit}</span>
      <span class="pb-go">${t('food.plate.review')}</span>
    </button>` : null}

    <${ProductSheet} item=${item} date=${date} onClose=${() => setItem(null)} onLog=${(it) => { setItem(null); logNow([it]); }} onPlate=${(it) => { setItem(null); plate.add(it); }}/>
    <${QuickSheet} open=${quick} onClose=${() => setQuick(false)} onLog=${(it) => { setQuick(false); logNow([it]); }} onPlate=${(it) => { setQuick(false); plate.add(it); }}/>
    <${PhotoSheet} open=${photo} date=${date} onClose=${() => setPhoto(false)} onPlate=${(its) => { setPhoto(false); its.forEach((x) => plate.add(x)); }}/>
    <${PlateSheet} open=${plateOpen} date=${date} time=${time} energy=${energy} onClose=${() => setPlateOpen(false)} onLog=${() => { setPlateOpen(false); logNow(plate.items()); }}/>
    ${scan ? html`<${Scanner} onCode=${onCode} onClose=${() => setScan(false)}/>` : null}
    <${Sheet} open=${!!notFound} onClose=${() => setNotFound(null)} title=${t('food.scan.nfTitle')}>
      <p class="hint" style="margin:0 0 12px">${t('food.scan.nfText', { code: notFound })}</p>
      <div class="stack">
        <button class="primary" onClick=${() => { const c = notFound; setNotFound(null); navigate('/food/new-food?barcode=' + c); }}>${t('food.scan.create')}</button>
        <button onClick=${() => { setNotFound(null); setPhoto(true); }}>${t('food.scan.photoLabel')}</button>
      </div>
    <//>
  </div>`;
}

function ResultRow({ r, energy, onTap }) {
  const { repos } = useApp();
  if (r.kind === 'history') {
    const e = r.entry;
    return html`<button class="lrow rrow" onClick=${onTap}>
      <span class="ltext"><span class="ll">${e.name || t('food.quick.name')}</span>
        <span class="ls">${e.amount ? fmtNum(e.amount) + ' ' + (e.unit === 'ml' ? t('unit.ml') : t('unit.g')) + ' · ' : ''}${energy.fmt(e.nutrients.kcal)} ${energy.unit} · ${fmtDate(e.date)}</span></span>
      <${Icon} name="plus" cls="radd"/></button>`;
  }
  const doc = r.doc;
  let sub;
  if (r.kind === 'recipe') {
    const s = recipeSummary(repos, doc);
    sub = t('food.recipe.badge') + ' · ' + per100Text(s.per100, energy) + ' ' + t('food.per100');
  } else {
    sub = (doc.brand ? doc.brand + ' · ' : '') + per100Text(doc.nutrients, energy) + ' ' + (doc.base && doc.base.unit === 'ml' ? t('food.per100ml') : t('food.per100'));
  }
  return html`<button class="lrow rrow" onClick=${onTap}>
    <span class="ltext"><span class="ll">${doc.name}</span><span class="ls">${sub}</span></span>
    ${doc.source && doc.source !== 'user' && doc.source !== 'legacy' ? html`<span class="lbadge">${sourceLabel(doc.source)}</span>` : null}
    <${Icon} name="plus" cls="radd"/></button>`;
}

function OnlineResults({ online, energy, onPick }) {
  const block = (list, label, err) => html`<div class="ltitle row">${label}${online.busy ? html`<${Spinner}/>` : null}</div>
    ${err ? html`<div class="lfoot">${err.code === 'bad_key' ? t('food.online.badKey') : t('food.online.error')}</div>` : null}
    ${list.length ? html`<div class="list results">${list.map((f) => html`<button class="lrow rrow" onClick=${() => onPick(f)}>
      <span class="ltext"><span class="ll">${f.name}</span><span class="ls">${(f.brand ? f.brand + ' · ' : '') + per100Text(f.nutrients, energy)}</span></span>
      <${Icon} name="plus" cls="radd"/></button>`)}</div>` : (!online.busy && !err ? html`<div class="lfoot">${t('food.online.none')}</div>` : null)}`;
  return html`${block(online.off, t('food.online.off'), online.errors && online.errors.off)}
    ${getUsdaKey() ? block(online.usda, t('food.online.usda'), online.errors && online.errors.usda) : html`<div class="lfoot">${t('food.online.usdaNoKey')}</div>`}`;
}

/* ---------- карточка продукта ---------- */
export function ProductSheet({ item, date, onClose, onLog, onPlate, pickOnly }) {
  const { repos, store } = useApp();
  const legacy = useLegacy();
  const energy = useEnergy();
  const [servingId, setServingId] = useState('');
  const [qty, setQty] = useState('');
  const [mode, setMode] = useState('servings');
  const [more, setMore] = useState(false);
  useData(['favorites']);
  useEffect(() => {
    if (!item) return;
    const pr = item.preset || {};
    if (item.kind === 'recipe') { setMode(pr.servingId === 'serving' || pr.amount == null ? 'servings' : 'grams'); setQty(pr.servingId === 'serving' ? (pr.quantity ?? 1) : (pr.amount ?? 1)); setServingId(''); }
    else if (item.kind === 'food') {
      const doc = item.doc;
      const sid = pr.servingId && (doc.servings || []).some((s) => s.id === pr.servingId) ? pr.servingId : (!pr.amount && (doc.servings || [])[0] ? doc.servings[0].id : '');
      setServingId(sid); setQty(sid ? (pr.quantity ?? 1) : (pr.amount ?? 100));
    }
    setMore(false);
  }, [item]);
  if (!item) return null;

  if (item.kind === 'quick') {
    const e = item.entry;
    const it = { ref: { kind: 'quick', id: null }, name: e.name, nutrients: e.nutrients, amount: e.amount };
    return html`<${Sheet} open=${true} onClose=${onClose} title=${e.name || t('food.quick.name')}>
      <div class="prev">${energy.fmt(e.nutrients.kcal)} ${energy.unit} · ${macroLine(e.nutrients)}</div>
      <div class="grid2" style="margin-top:14px"><button onClick=${() => onPlate(it)}>${t('food.toPlate')}</button><button class="primary" onClick=${() => onLog(it)}>${t('food.logNow')}</button></div>
    <//>`;
  }

  const doc = item.doc;
  let amount, n, it;
  if (item.kind === 'recipe') {
    const s = recipeSummary(repos, doc);
    const v = num(qty) || 0;
    n = mode === 'grams' ? recipePortion(doc, s.totals, { grams: v }) : recipePortion(doc, s.totals, { servings: v });
    amount = mode === 'grams' ? v : (s.totals.weight > 0 ? Math.round(s.totals.weight / (doc.servings || 1) * v) : null);
    it = { ref: { kind: 'recipe', id: doc.id }, name: doc.name, amount, servingId: mode === 'servings' ? 'serving' : '', quantity: mode === 'servings' ? v : null, nutrients: n };
  } else {
    amount = servingAmount(doc, servingId, num(qty));
    n = foodNutrients(doc, amount);
    it = { ref: { kind: 'food', id: doc.id }, name: doc.name, amount, unit: doc.base && doc.base.unit === 'ml' ? 'ml' : 'g', servingId, quantity: servingId ? num(qty) : null, nutrients: n };
  }

  const fav = repos.favorite.list((f) => f.ref.id === doc.id && f.ref.kind === item.kind)[0];
  const toggleFav = () => (fav ? repos.favorite.remove(fav.id) : repos.favorite.create({ ref: { kind: item.kind, id: doc.id }, servingId, amount, order: repos.favorite.count() }));
  const budget = date ? dayBudget({ repos, legacy, date }) : { kcal: 0 };
  const eaten = date ? dayTotals(repos.foodEntry.byDate(date)).kcal || 0 : 0;
  const after = budget.kcal ? budget.kcal - eaten - (n.kcal || 0) : null;
  const unit = doc.base && doc.base.unit === 'ml' ? t('unit.ml') : t('unit.g');

  return html`<${Sheet} open=${true} onClose=${onClose} title=${doc.name}>
    ${doc.brand ? html`<div class="hint" style="margin:-8px 0 10px">${doc.brand}</div>` : null}
    ${item.kind === 'recipe' ? html`<div class="pills" style="margin:0 0 12px">
        <button class=${'pill' + (mode === 'servings' ? ' on' : '')} onClick=${() => { setMode('servings'); setQty(1); }}>${t('food.recipe.servings')}</button>
        <button class=${'pill' + (mode === 'grams' ? ' on' : '')} onClick=${() => { setMode('grams'); setQty(100); }}>${t('food.recipe.grams')}</button>
      </div>`
      : (doc.servings || []).length ? html`<div class="chips">
        <button class=${'chip' + (!servingId ? ' on' : '')} onClick=${() => { setServingId(''); setQty(amount || 100); }}>${unit}</button>
        ${(doc.servings || []).map((s) => html`<button class=${'chip' + (servingId === s.id ? ' on' : '')} onClick=${() => { setServingId(s.id); setQty(1); }}>${s.label}${s.amount ? ' · ' + fmtNum(s.amount) + ' ' + unit : ''}</button>`)}
      </div>` : null}
    <div class="qtyrow row">
      <button class="ghost" aria-label="−" onClick=${() => setQty(String(Math.max(0, (num(qty) || 0) - (servingId || item.kind === 'recipe' && mode === 'servings' ? 0.5 : 10))))}>−</button>
      <input class="bigin grow" inputmode="decimal" value=${qty} aria-label=${t('food.qty')} onInput=${(e) => setQty(e.currentTarget.value)}/>
      <button class="ghost" aria-label="+" onClick=${() => setQty(String((num(qty) || 0) + (servingId || item.kind === 'recipe' && mode === 'servings' ? 0.5 : 10)))}>+</button>
    </div>
    <div class="hint" style="text-align:center;margin-top:4px">${servingId ? '= ' + fmtNum(amount) + ' ' + unit : item.kind === 'recipe' && mode === 'servings' ? t('food.recipe.servingHint', { n: fmtNum(doc.servings) }) : unit}</div>
    <div class="pcard">
      <div class="pc-k"><b>${energy.fmt(n.kcal)}</b><small>${energy.unit}</small></div>
      <div class="pc-m">${macroLine(n)}${n.fiber != null ? ' · ' + t('food.fibShort', { v: fmtNum(n.fiber, 1) }) : ''}</div>
      ${after != null ? html`<div class=${'pc-b' + (after < 0 ? ' over' : '')}>${after < 0 ? t('food.after.over', { v: energy.fmt(-after) }) : t('food.after.left', { v: energy.fmt(after) })} ${energy.unit}</div>` : null}
    </div>
    <button class="linkbtn" onClick=${() => setMore(!more)}>${more ? t('food.lessNutrients') : t('food.moreNutrients')}</button>
    ${more ? html`<${NutrientTable} n=${n}/>` : null}
    <div class="grid2" style="margin-top:12px">
      ${pickOnly ? null : html`<button onClick=${() => onPlate(it)}>${t('food.toPlate')}</button>`}
      <button class="primary" style=${pickOnly ? 'grid-column:1/-1' : ''} onClick=${() => onLog(it)}>${pickOnly ? t('food.pick') : t('food.logNow')}</button>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:6px">
      <button class="linkbtn" onClick=${toggleFav}>${fav ? '★ ' + t('food.fav.remove') : '☆ ' + t('food.fav.add')}</button>
      <button class="linkbtn" onClick=${() => { onClose(); navigate(item.kind === 'recipe' ? '/food/recipe/' + doc.id : '/food/item/' + doc.id); }}>${t('food.edit')}</button>
    </div>
  <//>`;
}

/* Все нутриенты с подписями */
export function NutrientTable({ n }) {
  const keys = Object.keys(n).filter((k) => k !== 'kcal' && n[k] != null);
  if (!keys.length) return html`<div class="hint">${t('food.noMoreNutrients')}</div>`;
  return html`<div class="ntable">${keys.map((k) => html`<div class="kv"><span>${nutrientLabel(k)}</span><span>${fmtNum(n[k], 2)} ${unitLabel((NUTRIENT_UNITS[k] || {}).unit || '')}</span></div>`)}</div>`;
}

/* ---------- быстрое добавление ---------- */
function QuickSheet({ open, onClose, onLog, onPlate }) {
  const energy = useEnergy();
  const [d, setD] = useState({});
  useEffect(() => { if (open) setD({}); }, [open]);
  if (!open) return null;
  const set = (k, v) => setD(Object.assign({}, d, { [k]: v }));
  const n = {};
  ['protein', 'fat', 'carbs', 'alcohol'].forEach((k) => { if (num(d[k]) != null) n[k] = num(d[k]); });
  n.kcal = num(d.kcal) != null ? (energy.units.energy === 'kj' ? num(d.kcal) / 4.184 : num(d.kcal)) : kcalFromMacros(n);
  const it = { ref: { kind: 'quick', id: null }, name: (d.name || '').trim() || t('food.quick.name'), nutrients: n };
  const ok = n.kcal > 0;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.quick.title')}>
    <${Field} label=${t('food.quick.nameLabel')}><input value=${d.name || ''} placeholder=${t('food.quick.name')} onInput=${(e) => set('name', e.currentTarget.value)}/><//>
    <div class="grid2" style="margin-top:12px">
      <${Field} label=${energy.unit}><input inputmode="decimal" value=${d.kcal || ''} placeholder=${n.kcal ? fmtNum(n.kcal) : ''} onInput=${(e) => set('kcal', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.protein')}><input inputmode="decimal" value=${d.protein || ''} onInput=${(e) => set('protein', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.fat')}><input inputmode="decimal" value=${d.fat || ''} onInput=${(e) => set('fat', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.carbs')}><input inputmode="decimal" value=${d.carbs || ''} onInput=${(e) => set('carbs', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.alcohol')}><input inputmode="decimal" value=${d.alcohol || ''} onInput=${(e) => set('alcohol', e.currentTarget.value)}/><//>
    </div>
    <div class="hint">${t('food.quick.hint')}</div>
    <div class="grid2" style="margin-top:12px"><button disabled=${!ok} onClick=${() => onPlate(it)}>${t('food.toPlate')}</button><button class="primary" disabled=${!ok} onClick=${() => onLog(it)}>${t('food.logNow')}</button></div>
  <//>`;
}

/* ---------- фото еды через ИИ ---------- */
function PhotoSheet({ open, date, onClose, onPlate }) {
  const app = useApp();
  const { repos, store } = app;
  const energy = useEnergy();
  const [st, setSt] = useState({ busy: false, rows: [], msg: '', note: '' });
  const [saveLabel, setSaveLabel] = useState(true);
  const ctl = useRef(null);
  const cam = useRef(null), gal = useRef(null);
  useEffect(() => { if (!open) { if (ctl.current) ctl.current.abort(); setSt({ busy: false, rows: [], msg: '', note: '' }); } }, [open]);
  if (!open) return null;
  const hasKey = !!getClaudeKey();

  async function analyze(file) {
    if (!file) return;
    if (ctl.current) ctl.current.abort();
    ctl.current = new AbortController();
    setSt({ busy: true, rows: [], msg: t('food.photo.busy'), note: '' });
    try {
      const r = await aiPhoto(store, file, { signal: ctl.current.signal, today: todayYmd(), now: new Date().toISOString() });
      setSt({ busy: false, rows: r.items.map((x, i) => Object.assign({ key: i, on: true }, x)), msg: r.items.length ? '' : t('food.photo.none'), note: r.note });
    } catch (e) {
      if (e && e.code === 'cancelled') { setSt({ busy: false, rows: [], msg: '', note: '' }); return; }
      setSt({ busy: false, rows: [], msg: t(aiErrorKey(e), { period: e && e.period ? periodLabel(e.period) : '', limit: e && e.limit }), note: '' });
    }
  }

  async function add() {
    const out = [];
    for (const r of st.rows.filter((x) => x.on)) {
      const grams = num(r.grams) || 0;
      const nutr = roundNutrients(scaleNutrients(r.per100, grams / 100), 2);
      if (r.src === 'label' && saveLabel) {
        const f = await repos.food.create({ name: r.name, source: 'ai', base: { amount: 100, unit: 'g' }, nutrients: r.per100 });
        out.push({ ref: { kind: 'food', id: f.id }, name: r.name, amount: grams, nutrients: nutr });
      } else out.push({ ref: { kind: 'quick', id: null }, name: r.name, amount: grams, nutrients: nutr });
    }
    onPlate(out);
  }

  const pick = (ref) => { const el = ref.current; if (el) { el.value = ''; el.click(); } };
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.photo.title')}>
    <input ref=${cam} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => analyze(e.currentTarget.files[0])}/>
    <input ref=${gal} type="file" accept="image/*" hidden onChange=${(e) => analyze(e.currentTarget.files[0])}/>
    ${!hasKey ? html`<div class="banner">${t('food.photo.noKey')}</div><button class="primary" style="width:100%" onClick=${() => { onClose(); navigate('/more/settings'); }}>${t('food.photo.toSettings')}</button>` : html`
      <div class="hint" style="margin:0 0 10px">${t('food.photo.hint')}</div>
      <div class="grid2"><button class="ib" disabled=${st.busy} onClick=${() => pick(cam)}><${Icon} name="camera"/>${t('food.photo.camera')}</button><button class="ib" disabled=${st.busy} onClick=${() => pick(gal)}><${Icon} name="search"/>${t('food.photo.gallery')}</button></div>`}
    ${st.msg ? html`<div class="prev" style="margin-top:12px">${st.busy ? html`<${Spinner}/> ` : null}${st.msg}</div>` : null}
    ${st.busy ? html`<button style="width:100%;margin-top:8px" onClick=${() => ctl.current && ctl.current.abort()}>${t('food.photo.stop')}</button>` : null}
    ${st.rows.length ? html`<div class="photorows">${st.rows.map((r, i) => {
      const k = (num(r.grams) || 0) / 100;
      return html`<div class="prow3 row">
        <button class=${'ck' + (r.on ? ' on' : '')} aria-label=${r.name} onClick=${() => setSt(Object.assign({}, st, { rows: st.rows.map((x, j) => (j === i ? Object.assign({}, x, { on: !x.on }) : x)) }))}>${r.on ? html`<${Icon} name="check" size=${14}/>` : null}</button>
        <span class="grow"><b>${r.name}</b><small>${r.src === 'label' ? t('food.photo.label') : t('food.photo.estimate')} · ${energy.fmt((r.per100.kcal || 0) * k)} ${energy.unit}</small></span>
        <input class="gin" inputmode="decimal" value=${r.grams} aria-label=${t('food.grams')} onInput=${(e) => setSt(Object.assign({}, st, { rows: st.rows.map((x, j) => (j === i ? Object.assign({}, x, { grams: e.currentTarget.value }) : x)) }))}/><span class="gu">${t('unit.g')}</span>
      </div>`;
    })}</div>
    ${st.note ? html`<div class="hint">${st.note}</div>` : null}
    ${st.rows.some((r) => r.src === 'label') ? html`<${Toggle} on=${saveLabel} onChange=${setSaveLabel} label=${t('food.photo.saveLabel')}/>` : null}
    <button class="primary" style="width:100%;margin-top:12px" onClick=${add}>${t('food.photo.add', { count: st.rows.filter((r) => r.on).length })}</button>` : null}
  <//>`;
}

/* ---------- тарелка ---------- */
function PlateSheet({ open, date, time, energy, onClose, onLog }) {
  const p = usePlate();
  if (!open) return null;
  const items = p.items();
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.plate.title', { count: items.length })}>
    ${items.map((x) => html`<div class="prow3 row">
      <span class="grow"><b>${x.name}</b><small>${x.amount ? fmtNum(x.amount) + ' ' + (x.unit === 'ml' ? t('unit.ml') : t('unit.g')) + ' · ' : ''}${energy.fmt(x.nutrients.kcal)} ${energy.unit} · ${macroLine(x.nutrients)}</small></span>
      <button class="small icn danger" aria-label=${t('food.delete')} onClick=${() => p.remove(x.key)}><${Icon} name="close" size=${14}/></button>
    </div>`)}
    <div class="kv tot" style="margin-top:6px"><span>${t('food.plate.total')}</span><span>${energy.fmt(p.totals().kcal)} ${energy.unit}</span></div>
    <div class="hint">${t('food.plate.when', { d: fmtDate(date), t: time })}</div>
    <div class="grid2" style="margin-top:12px"><button onClick=${() => { p.clear(); onClose(); }}>${t('food.plate.clear')}</button><button class="primary" disabled=${!items.length} onClick=${onLog}>${t('food.plate.log')}</button></div>
  <//>`;
}
