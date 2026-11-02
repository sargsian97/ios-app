/* Добавление еды: одно поле поиска (свои продукты, рецепты и история — сразу; Open Food Facts и USDA — после паузы),
   приём пищи и время чипами, «+» на строке записывает прошлую порцию сразу (с «Отменить»),
   карточка «КБЖУ на 100 г → граммы → записать», «тарелка» для нескольких продуктов,
   быстрое добавление, штрихкод, фото еды через ИИ. */
import { html, useApp, useData, useState, useEffect, useRef, navigate, goBack, todayYmd, takeKeyboard } from '../../core.js';
import { Sheet, Field, Toggle, SearchBox, Stepper } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { useEnergy, num, nowTime, per100Text, macroLine, amountText, Spinner, MEALS, MEAL_KEY } from '../../food/parts.js';
import { usePlate, plate } from '../../food/plate.js';
import { dayBudget } from '../../food/budget.js';
import { searchLocal, searchOnline, saveOnlineFood, recipeSummary, findBarcode, getUsdaKey } from '../../../services/foodsearch/index.js';
import { foodNutrients, servingAmount, recipePortion, dayTotals, recentItems, kcalFromMacros, hourlyGoTos, historyMatches, mealOf, mealDefaultTime, lastPortionOf, defaultPortion } from '../../../domain/nutrition.js';
import { addDays } from '../../../domain/calc/index.js';
import { scaleNutrients, roundNutrients } from '../../../data/models/nutrients.js';
import { uid } from '../../../data/ids.js';
import { aiPhoto, aiErrorKey, aiReady } from '../../../services/ai-food.js';
import { isArtifact } from '../../../services/env.js';
import { artifactAiStatus } from '../../../services/ai-sample.js';
import { Scanner } from './scanner.js';
import { nutrientLabel, unitLabel, sourceLabel, periodLabel } from '../../food/labels.js';
import { NUTRIENT_UNITS } from '../../../data/models/nutrients.js';
import { toast } from '../../toast.js';

const FILTERS = [['all', 'food.tab.all'], ['mine', 'food.tab.mine'], ['recipes', 'food.tab.recipes'], ['fav', 'food.tab.fav']];

/* Запись дневника из элемента тарелки */
function entryFrom(item, date, time, meal) {
  return { id: uid(), date, time, meal: meal || null, ref: item.ref, name: item.name, amount: item.amount ?? null, unit: item.unit === 'ml' ? 'ml' : 'g', servingId: item.servingId || '', quantity: item.quantity ?? null, nutrients: roundNutrients(item.nutrients, 2) };
}

/* Записать элементы в дневник; возвращает id записей (для «Отменить») */
export async function logItems({ repos, store }, items, date, time, { meal = null } = {}) {
  const now = new Date().toISOString();
  const entries = items.map((it) => entryFrom(it, date, it.time || time, it.meal || meal));
  const ops = entries.map((e) => repos.foodEntry.putOp(e));
  const touched = new Set();
  items.forEach((it) => {
    if (!it.ref || !it.ref.id || touched.has(it.ref.kind + it.ref.id)) return;
    touched.add(it.ref.kind + it.ref.id);
    const repo = it.ref.kind === 'recipe' ? repos.recipe : it.ref.kind === 'food' ? repos.food : null;
    const doc = repo && repo.get(it.ref.id);
    if (doc) ops.push(repo.putOp(Object.assign({}, doc, { lastUsedAt: now })));
  });
  await store.batch(ops);
  return entries.map((e) => e.id);
}

/* Элемент тарелки для продукта или рецепта с порцией { servingId, quantity, amount } */
function portionItem(repos, kind, doc, portion) {
  if (kind === 'recipe') {
    const s = recipeSummary(repos, doc);
    const servings = portion.servingId === 'serving' || portion.amount == null;
    const v = servings ? (portion.quantity ?? 1) : portion.amount;
    const n = servings ? recipePortion(doc, s.totals, { servings: v }) : recipePortion(doc, s.totals, { grams: v });
    const amount = servings ? (s.totals.weight > 0 ? Math.round(s.totals.weight / (doc.servings || 1) * v) : null) : v;
    return { ref: { kind: 'recipe', id: doc.id }, name: doc.name, amount, servingId: servings ? 'serving' : '', quantity: servings ? v : null, nutrients: n };
  }
  const sid = portion.servingId && (doc.servings || []).some((s) => s.id === portion.servingId) ? portion.servingId : '';
  const amount = sid ? servingAmount(doc, sid, portion.quantity ?? 1) : (portion.amount || defaultPortion(doc).amount);
  return { ref: { kind: 'food', id: doc.id }, name: doc.name, amount, unit: doc.base && doc.base.unit === 'ml' ? 'ml' : 'g', servingId: sid, quantity: sid ? (portion.quantity ?? 1) : null, nutrients: foodNutrients(doc, amount) };
}

export function FoodAdd({ route }) {
  const app = useApp();
  const { repos, store } = app;
  useData(['foodItems', 'recipes', 'favorites', 'foodEntries']);
  const energy = useEnergy();
  const p = usePlate();
  const date = route.query.d || todayYmd();
  const today = date === todayYmd();
  const now = today ? nowTime() : null;
  const meal0 = route.query.m && MEAL_KEY[route.query.m] ? route.query.m : mealOf({ time: route.query.t || now || '12:00' });
  const [meal, setMeal] = useState(meal0);
  const [time, setTime] = useState(route.query.t || mealDefaultTime(meal0, now));
  const [filter, setFilter] = useState(route.query.tab === 'history' ? 'history' : 'all');
  const [q, setQ] = useState('');
  const [online, setOnline] = useState({ busy: false, off: [], usda: [], errors: {} });
  const [item, setItem] = useState(null);
  const [quick, setQuick] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [scan, setScan] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [notFound, setNotFound] = useState(null);
  const inputRef = useRef(null);
  /* k=1 — пришли с кнопки: поднимаем клавиатуру (на iOS это работает только через keyboardSoon в жесте) */
  useEffect(() => { if (route.query.k) takeKeyboard(inputRef.current); }, []);
  /* ?open=quick|photo|scan и ?tab= применяются и когда экран уже открыт, потом убираются из адреса */
  useEffect(() => {
    const o = route.query.open;
    if (o === 'quick') setQuick(true); else if (o === 'photo') setPhoto(true); else if (o === 'scan') setScan(true);
    if (route.query.tab) setFilter(route.query.tab === 'history' ? 'history' : 'all');
    if (o || route.query.tab) navigate('/food/add?d=' + date + '&m=' + meal + (route.query.t ? '&t=' + route.query.t : ''), { replace: true });
  }, [route.query.open, route.query.tab]);

  /* поиск в интернете с задержкой */
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3 || filter !== 'all') { setOnline({ busy: false, off: [], usda: [], errors: {} }); return; }
    const ctl = new AbortController();
    setOnline((o) => Object.assign({}, o, { busy: true }));
    const tm = setTimeout(async () => {
      const r = await searchOnline(repos, s, { signal: ctl.signal });
      if (!ctl.signal.aborted) setOnline(Object.assign({ busy: false }, r));
    }, 500);
    return () => { clearTimeout(tm); ctl.abort(); };
  }, [q, filter]);

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
      else { setMsg(t('food.scan.notFound', { code })); setNotFound(code); }
    } catch (e) { setMsg(isArtifact() ? t('food.scan.errorArtifact') : t('food.scan.error')); }
  }

  async function logNow(items) {
    await logItems(app, items, date, time, { meal });
    plate.clear();
    navigate('/food?d=' + date, { replace: true });
  }

  const all = repos.foodEntry.list();
  /* элемент тарелки для строки выдачи: прошлая порция (или по умолчанию) */
  function itemFor(r) {
    if (r.kind === 'history') {
      const e = r.entry;
      const doc = e.ref && e.ref.kind === 'food' ? repos.food.get(e.ref.id) : e.ref && e.ref.kind === 'recipe' ? repos.recipe.get(e.ref.id) : null;
      if (doc) return portionItem(repos, e.ref.kind, doc, { servingId: e.servingId, quantity: e.quantity, amount: e.amount });
      return { ref: e.ref, name: e.name, amount: e.amount, unit: e.unit, servingId: e.servingId, quantity: e.quantity, nutrients: e.nutrients };
    }
    const last = lastPortionOf(all, { ref: { kind: r.kind, id: r.doc.id } });
    const portion = last && (last.amount || last.servingId) ? last : (r.kind === 'recipe' ? { servingId: 'serving', quantity: 1 } : defaultPortion(r.doc));
    return portionItem(repos, r.kind, r.doc, portion);
  }
  /* «+» на строке: записать сразу, остаться на экране, предложить отменить */
  async function quickLog(r) {
    const it = itemFor(r);
    if (!it || !it.nutrients) return;
    const ids = await logItems(app, [it], date, time, { meal });
    toast({
      text: t('food.logged', { m: t(MEAL_KEY[meal]), name: it.name, k: energy.fmt(it.nutrients.kcal), u: energy.unit }),
      action: { label: t('common.undo'), run: () => store.batch(ids.map((id) => repos.foodEntry.removeOp(id))) }
    });
    setQ('');
  }
  function openRow(r) {
    if (r.kind === 'history') {
      const e = r.entry;
      const doc = e.ref && e.ref.kind === 'food' ? repos.food.get(e.ref.id) : e.ref && e.ref.kind === 'recipe' ? repos.recipe.get(e.ref.id) : null;
      if (doc) setItem({ kind: e.ref.kind, doc, preset: { amount: e.amount, servingId: e.servingId, quantity: e.quantity } });
      else setItem({ kind: 'quick', entry: e });
      return;
    }
    setItem(r);
  }

  /* выдача */
  const s = q.trim();
  const key = (e) => (e.ref && e.ref.id ? e.ref.kind + ':' + e.ref.id : 'name:' + (e.name || '').toLowerCase());
  let blocks = [];
  if (filter === 'history') {
    const list = recentItems(all, { limit: 40 }).filter((e) => !s || (e.name || '').toLowerCase().includes(s.toLowerCase()));
    blocks = [{ title: t('food.tab.history'), rows: list.map((e) => ({ kind: 'history', entry: e })), empty: t('food.history.empty') }];
  } else if (filter === 'fav') {
    const rows = repos.favorite.list().sort((a, b) => a.order - b.order).map((f) => {
      const doc = f.ref.kind === 'recipe' ? repos.recipe.get(f.ref.id) : repos.food.get(f.ref.id);
      return doc && (!s || doc.name.toLowerCase().includes(s.toLowerCase())) ? { kind: f.ref.kind, doc } : null;
    }).filter(Boolean);
    blocks = [{ title: t('food.tab.fav'), rows, empty: t('food.fav.empty') }];
  } else if (!s) {
    const goTos = hourlyGoTos(all, { time, today: date, addDays });
    const seen = new Set(goTos.map(key));
    const recent = recentItems(all, { limit: 30 }).filter((e) => !seen.has(key(e))).slice(0, 15);
    blocks = [
      goTos.length ? { title: t('food.goTos'), rows: goTos.map((e) => ({ kind: 'history', entry: e })) } : null,
      { title: t('food.recent'), rows: recent.map((e) => ({ kind: 'history', entry: e })), empty: t('food.search.start') }
    ].filter(Boolean);
  } else {
    const hist = filter === 'all' ? historyMatches(all, s, { limit: 3 }) : [];
    const rows = searchLocal(repos, s, { limit: 60 }).filter((x) => filter === 'all' || (filter === 'recipes' ? x.kind === 'recipe' : x.kind === 'food'));
    blocks = [
      hist.length ? { title: t('food.histBlock'), rows: hist.map((e) => ({ kind: 'history', entry: e })) } : null,
      { title: hist.length ? t('food.fromLibrary') : null, rows, empty: t('food.search.noneLocal'), results: true }
    ].filter(Boolean);
  }

  return html`<div class="wrap page addpage">
    <div class="navbar">
      <button class="back" onClick=${() => goBack('/food?d=' + date)}><${Icon} name="left"/>${t('nav.food')}</button>
      <div class="addmeta">
        <label class="mealchip"><span>${t(MEAL_KEY[meal])}</span><${Icon} name="down" size=${14}/>
          <select value=${meal} aria-label=${t('food.meal')} onChange=${(e) => { const m = e.currentTarget.value; setMeal(m); setTime(mealDefaultTime(m, now)); }}>${MEALS.map(([m, label]) => html`<option value=${m}>${t(label)}</option>`)}</select></label>
        <label class="timechip"><input type="time" value=${time} aria-label=${t('food.time')} onInput=${(e) => setTime(e.currentTarget.value || time)}/></label>
      </div>
    </div>
    <h1>${t('food.add.title')}</h1>
    <${SearchBox} value=${q} onInput=${(v) => { setQ(v); if (filter === 'history') setFilter('all'); }} placeholder=${t('food.search.ph')} inputRef=${inputRef}
      right=${html`<button class="sbar" type="button" aria-label=${t('food.sc.scan')} onClick=${() => setScan(true)}><${Icon} name="barcode"/></button>`}/>
    ${s ? html`<div class="pills sub">${FILTERS.map(([k, l]) => html`<button class=${'pill' + (filter === k ? ' on' : '')} onClick=${() => setFilter(k)}>${t(l)}</button>`)}</div>` : null}
    ${msg ? html`<div class="banner">${msg}</div>` : null}

    ${blocks.map((b) => html`${b.title ? html`<div class="ltitle">${b.title}</div>` : null}
      <div class=${'list' + (b.results ? ' results' : '')}>
        ${b.rows.length ? b.rows.map((r) => html`<${ResultRow} r=${r} energy=${energy} onTap=${() => openRow(r)} onQuick=${() => quickLog(r)}/>`) : html`<div class="empty">${b.empty || ''}</div>`}
      </div>`)}

    ${filter === 'all' && s.length >= 3 ? html`<${OnlineResults} online=${online} energy=${energy} onPick=${pickOnline}/>` : null}

    <div class="srcs">
      <button onClick=${() => setScan(true)}>${t('food.sc.scan')}</button>
      <button onClick=${() => setQuick(true)}>${t('food.sc.quick')}</button>
      <button onClick=${() => setPhoto(true)}>${t('food.sc.photo')}</button>
      <button onClick=${() => navigate('/food/new-food')}>${t('food.sc.new')}</button>
    </div>
    <div class="hint" style="text-align:center">${t('food.addHint')}</div>

    ${p.items().length ? html`<button class="platebar" onClick=${() => setPlateOpen(true)}>
      <span class="pb-n">${p.items().length}</span>
      <span class="grow">${t('food.plate')} · ${energy.fmt(p.totals().kcal)} ${energy.unit}</span>
      <span class="pb-go">${t('food.plate.review')}</span>
    </button>` : null}

    <${ProductSheet} item=${item} date=${date} meal=${meal} onClose=${() => setItem(null)} onLog=${(it) => { setItem(null); logNow([it]); }} onPlate=${(it) => { setItem(null); plate.add(it); }}/>
    <${QuickSheet} open=${quick} meal=${meal} onClose=${() => setQuick(false)} onLog=${(it) => { setQuick(false); logNow([it]); }} onPlate=${(it) => { setQuick(false); plate.add(it); }}/>
    <${PhotoSheet} open=${photo} date=${date} onClose=${() => setPhoto(false)} onPlate=${(its) => { setPhoto(false); its.forEach((x) => plate.add(x)); }}/>
    <${PlateSheet} open=${plateOpen} date=${date} time=${time} meal=${meal} energy=${energy} onClose=${() => setPlateOpen(false)} onLog=${() => { setPlateOpen(false); logNow(plate.items()); }}/>
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

/* Строка выдачи: тело — карточка с граммами, «+» — записать прошлую порцию сразу */
function ResultRow({ r, energy, onTap, onQuick }) {
  const { repos } = useApp();
  let name, sub, badge = null;
  if (r.kind === 'history') {
    const e = r.entry;
    name = e.name || t('food.quick.name');
    sub = (e.amount ? amountText(e) + ' · ' : '') + energy.fmt(e.nutrients.kcal) + ' ' + energy.unit + ' · ' + macroLine(e.nutrients);
    if (e.ref && e.ref.kind === 'recipe') badge = t('food.recipe.badge');
  } else {
    const doc = r.doc;
    name = doc.name;
    if (r.kind === 'recipe') {
      const s = recipeSummary(repos, doc);
      sub = s.per100.kcal != null ? per100Text(s.per100, energy) + ' ' + t('food.per100') : t('food.recipe.servingsN', { count: doc.servings || 1 });
      badge = t('food.recipe.badge');
    } else {
      sub = (doc.brand ? doc.brand + ' · ' : '') + per100Text(doc.nutrients, energy) + ' ' + (doc.base && doc.base.unit === 'ml' ? t('food.per100ml') : t('food.per100'));
      if (doc.source && doc.source !== 'user' && doc.source !== 'legacy') badge = sourceLabel(doc.source);
    }
  }
  return html`<div class="lrow rrow">
    <button class="rbody" onClick=${onTap}><span class="ll">${name}${badge ? html` <span class="lbadge">${badge}</span>` : null}</span><span class="ls">${sub}</span></button>
    <button class="radd" aria-label=${t('food.quickLog', { name })} onClick=${onQuick}><${Icon} name="plus"/></button>
  </div>`;
}

function OnlineResults({ online, energy, onPick }) {
  const block = (list, label, err) => html`<div class="ltitle row">${label}${online.busy ? html`<${Spinner}/>` : null}</div>
    ${err ? html`<div class="lfoot">${err.code === 'bad_key' ? t('food.online.badKey') : isArtifact() ? t('food.online.errorArtifact') : t('food.online.error')}</div>` : null}
    ${list.length ? html`<div class="list results">${list.map((f) => html`<div class="lrow rrow"><button class="rbody" onClick=${() => onPick(f)}>
      <span class="ll">${f.name}</span><span class="ls">${(f.brand ? f.brand + ' · ' : '') + per100Text(f.nutrients, energy)}</span></button></div>`)}</div>` : (!online.busy && !err ? html`<div class="lfoot">${t('food.online.none')}</div>` : null)}`;
  return html`${block(online.off, t('food.online.off'), online.errors && online.errors.off)}
    ${getUsdaKey() ? block(online.usda, t('food.online.usda'), online.errors && online.errors.usda) : html`<div class="lfoot">${t('food.online.usdaNoKey')}</div>`}`;
}

/* ---------- карточка продукта: КБЖУ на 100 г → граммы → записать ---------- */
const PRESETS = [50, 100, 150, 200, 250];

export function ProductSheet({ item, date, meal, onClose, onLog, onPlate, pickOnly }) {
  const app = useApp();
  const { repos } = app;
  useData(['expenditureSettings', 'dayTargets', 'favorites']);
  const energy = useEnergy();
  const [servingId, setServingId] = useState('');
  const [qty, setQty] = useState(null);
  const [mode, setMode] = useState('servings');
  const [more, setMore] = useState(false);
  const last = item && item.kind !== 'quick' ? lastPortionOf(repos.foodEntry.list(), { ref: { kind: item.kind, id: item.doc.id } }) : null;
  useEffect(() => {
    if (!item) return;
    if (item.kind === 'quick') { setQty(item.entry.amount || null); setMore(false); return; }
    const doc = item.doc;
    const pr = item.preset && (item.preset.amount || item.preset.servingId) ? item.preset : (last && (last.amount || last.servingId) ? last : null);
    if (item.kind === 'recipe') {
      const servings = !pr || pr.servingId === 'serving' || pr.amount == null;
      setMode(servings ? 'servings' : 'grams'); setQty(servings ? (pr && pr.quantity != null ? pr.quantity : 1) : pr.amount); setServingId('');
    } else {
      const d = pr || defaultPortion(doc);
      const sid = d.servingId && (doc.servings || []).some((s) => s.id === d.servingId) ? d.servingId : '';
      setServingId(sid); setQty(sid ? (d.quantity ?? 1) : (d.amount || 100));
    }
    setMore(false);
  }, [item]);
  if (!item) return null;
  const mealLabel = meal ? t(MEAL_KEY[meal]) : '';
  const logLabel = pickOnly ? t('food.pick') : meal ? t('food.logTo', { m: mealLabel }) : t('food.logNow');

  if (item.kind === 'quick') {
    const e = item.entry;
    const scaled = e.amount > 0 && qty > 0 && qty !== e.amount ? roundNutrients(scaleNutrients(e.nutrients, qty / e.amount), 2) : e.nutrients;
    const it = { ref: { kind: 'quick', id: null }, name: e.name, nutrients: scaled, amount: e.amount ? qty : null, unit: e.unit };
    return html`<${Sheet} open=${true} onClose=${onClose} title=${e.name || t('food.quick.name')}>
      ${e.amount ? html`<${Stepper} big=${true} value=${qty} onChange=${setQty} step=${10} digits=${0} unit=${e.unit === 'ml' ? t('unit.ml') : t('unit.g')} label=${t('food.grams')} onEnter=${() => onLog(it)}/>` : null}
      <div class="pcard"><div class="pc-k"><b>${energy.fmt(scaled.kcal)}</b><small>${energy.unit}</small></div><div class="pc-m">${macroLine(scaled)}</div></div>
      <button class="primary" style="width:100%;margin-top:12px" onClick=${() => onLog(it)}>${logLabel}</button>
      ${pickOnly ? null : html`<div class="linkrow"><button class="linkbtn" onClick=${() => onPlate(it)}>${t('food.toPlate')}</button></div>`}
    <//>`;
  }

  const doc = item.doc;
  const v = qty == null ? 0 : qty;
  let it, per100, unit;
  if (item.kind === 'recipe') {
    const s = recipeSummary(repos, doc);
    it = portionItem(repos, 'recipe', doc, mode === 'grams' ? { servingId: '', amount: v } : { servingId: 'serving', quantity: v });
    per100 = s.per100.kcal != null ? s.per100 : recipePortion(doc, s.totals, { servings: 1 });
    unit = mode === 'grams' ? t('unit.g') : t('food.recipe.servings').toLowerCase();
  } else {
    it = portionItem(repos, 'food', doc, servingId ? { servingId, quantity: v } : { servingId: '', amount: v });
    per100 = doc.nutrients;
    unit = doc.base && doc.base.unit === 'ml' ? t('unit.ml') : t('unit.g');
  }
  const n = it.nutrients;
  const grams = item.kind === 'food' && !servingId || item.kind === 'recipe' && mode === 'grams';
  const fav = repos.favorite.list((f) => f.ref.id === doc.id && f.ref.kind === item.kind)[0];
  const toggleFav = () => (fav ? repos.favorite.remove(fav.id) : repos.favorite.create({ ref: { kind: item.kind, id: doc.id }, servingId, amount: it.amount, order: repos.favorite.count() }));
  const budget = date ? dayBudget(app, date) : { kcal: 0 };
  const eaten = date ? dayTotals(repos.foodEntry.byDate(date)).kcal || 0 : 0;
  const after = budget.kcal ? budget.kcal - eaten - (n.kcal || 0) : null;
  const lastAmount = last && grams && (item.kind === 'food' ? !last.servingId && last.amount : last.servingId !== 'serving' && last.amount) ? last.amount : null;
  const presets = grams ? [lastAmount ? ['last', lastAmount] : null].concat(PRESETS.filter((x) => x !== lastAmount).map((x) => [String(x), x])).filter(Boolean) : [];
  const per100Label = item.kind === 'recipe' && per100 !== null && recipeSummary(repos, doc).per100.kcal == null ? t('food.recipe.oneServing') : (doc.base && doc.base.unit === 'ml' ? t('food.per100ml') : t('food.per100'));
  const src = doc.source && doc.source !== 'user' && doc.source !== 'legacy' ? sourceLabel(doc.source) : null;

  return html`<${Sheet} open=${true} onClose=${onClose} title=${doc.name}>
    ${doc.brand || src ? html`<div class="hint" style="margin:-8px 0 10px">${[doc.brand, src].filter(Boolean).join(' · ')}</div>` : null}
    <div class="per100"><span>${per100Label}</span><span><b>${energy.fmt(per100.kcal)}</b> ${energy.unit}</span>
      <span>${t('food.macro.p').slice(0, 1)} <b>${fmtNum(per100.protein || 0, 1)}</b></span><span>${t('food.macro.f').slice(0, 1)} <b>${fmtNum(per100.fat || 0, 1)}</b></span><span>${t('food.macro.c').slice(0, 1)} <b>${fmtNum(per100.carbs || 0, 1)}</b></span></div>
    ${item.kind === 'recipe' ? html`<div class="pills" style="margin:0 0 12px">
        <button class=${'pill' + (mode === 'servings' ? ' on' : '')} onClick=${() => { setMode('servings'); setQty(1); }}>${t('food.recipe.servings')}</button>
        <button class=${'pill' + (mode === 'grams' ? ' on' : '')} onClick=${() => { setMode('grams'); setQty(100); }}>${t('food.recipe.grams')}</button>
      </div>`
      : (doc.servings || []).length ? html`<div class="chips">
        <button class=${'chip' + (!servingId ? ' on' : '')} onClick=${() => { setServingId(''); setQty(it.amount || 100); }}>${unit}</button>
        ${(doc.servings || []).map((s) => html`<button class=${'chip' + (servingId === s.id ? ' on' : '')} onClick=${() => { setServingId(s.id); setQty(1); }}>${s.label}${s.amount ? ' · ' + fmtNum(s.amount) + ' ' + unit : ''}</button>`)}
      </div>` : null}
    <${Stepper} big=${true} value=${qty} onChange=${setQty} step=${grams ? 10 : 0.5} min=${0} digits=${grams ? 0 : 1} unit=${grams ? unit : ''} label=${grams ? t('food.grams') : t('food.qty')} onEnter=${() => onLog(it)}/>
    ${!grams ? html`<div class="hint" style="text-align:center;margin-top:4px">${servingId ? '= ' + fmtNum(it.amount) + ' ' + unit : t('food.recipe.servingHint', { n: fmtNum(doc.servings) })}</div>` : null}
    ${presets.length ? html`<div class="presets">${presets.map(([k, val]) => html`<button class=${'chip' + (qty === val ? ' on' : '')} onClick=${() => setQty(val)}>${k === 'last' ? t('food.preset.last', { v: fmtNum(val) }) : fmtNum(val)}</button>`)}</div>` : null}
    <div class="pcard">
      <div class="pc-k"><b>${energy.fmt(n.kcal)}</b><small>${energy.unit}</small></div>
      <div class="pc-m">${macroLine(n)}${n.fiber != null ? ' · ' + t('food.fibShort', { v: fmtNum(n.fiber, 1) }) : ''}</div>
      ${after != null ? html`<div class=${'pc-b' + (after < 0 ? ' over' : '')}>${after < 0 ? t('food.after.over', { v: energy.fmt(-after) }) : t('food.after.left', { v: energy.fmt(after) })} ${energy.unit}</div>` : null}
    </div>
    <button class="primary" style="width:100%;margin-top:12px" onClick=${() => onLog(it)}>${logLabel}</button>
    <div class="linkrow">
      ${pickOnly ? null : html`<button class="linkbtn" onClick=${() => onPlate(it)}>${t('food.toPlate')}</button>`}
      <button class="linkbtn" onClick=${toggleFav}>${fav ? '★ ' + t('food.fav.remove') : '☆ ' + t('food.fav.add')}</button>
      <button class="linkbtn" onClick=${() => setMore(!more)}>${more ? t('food.lessNutrients') : t('food.moreNutrients')}</button>
      <button class="linkbtn" onClick=${() => { onClose(); navigate(item.kind === 'recipe' ? '/food/recipe/' + doc.id : '/food/item/' + doc.id); }}>${t('food.edit')}</button>
    </div>
    ${more ? html`<${NutrientTable} n=${n}/>` : null}
  <//>`;
}

/* Все нутриенты с подписями */
export function NutrientTable({ n }) {
  const keys = Object.keys(n).filter((k) => k !== 'kcal' && n[k] != null);
  if (!keys.length) return html`<div class="hint">${t('food.noMoreNutrients')}</div>`;
  return html`<div class="ntable">${keys.map((k) => html`<div class="kv"><span>${nutrientLabel(k)}</span><span>${fmtNum(n[k], 2)} ${unitLabel((NUTRIENT_UNITS[k] || {}).unit || '')}</span></div>`)}</div>`;
}

/* ---------- быстрое добавление ---------- */
function QuickSheet({ open, meal, onClose, onLog, onPlate }) {
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
    <button class="primary" style="width:100%;margin-top:12px" disabled=${!ok} onClick=${() => onLog(it)}>${meal ? t('food.logTo', { m: t(MEAL_KEY[meal]) }) : t('food.logNow')}</button>
    <div class="linkrow"><button class="linkbtn" disabled=${!ok} onClick=${() => onPlate(it)}>${t('food.toPlate')}</button></div>
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
  const hasKey = aiReady();
  const artifact = isArtifact();
  const noPhoto = artifact && artifactAiStatus().status === 'ready' && !artifactAiStatus().photo;

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
    ${!hasKey && artifact ? html`<div class="banner">${t('ai.artifact.unavailable')}</div>`
    : noPhoto ? html`<div class="banner">${t('ai.err.images_unavailable')}</div>`
    : !hasKey ? html`<div class="banner">${t('food.photo.noKey')}</div><button class="primary" style="width:100%" onClick=${() => { onClose(); navigate('/more/settings'); }}>${t('food.photo.toSettings')}</button>` : html`
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
function PlateSheet({ open, date, time, meal, energy, onClose, onLog }) {
  const p = usePlate();
  if (!open) return null;
  const items = p.items();
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.plate.title', { count: items.length })}>
    ${items.map((x) => html`<div class="prow3 row">
      <span class="grow"><b>${x.name}</b><small>${x.amount ? amountText(x) + ' · ' : ''}${energy.fmt(x.nutrients.kcal)} ${energy.unit} · ${macroLine(x.nutrients)}</small></span>
      <button class="small icn danger" aria-label=${t('food.delete')} onClick=${() => p.remove(x.key)}><${Icon} name="close" size=${14}/></button>
    </div>`)}
    <div class="kv tot" style="margin-top:6px"><span>${t('food.plate.total')}</span><span>${energy.fmt(p.totals().kcal)} ${energy.unit}</span></div>
    <div class="hint">${t('food.plate.when', { d: t(MEAL_KEY[meal]), t: time })}</div>
    <div class="grid2" style="margin-top:12px"><button onClick=${() => { p.clear(); onClose(); }}>${t('food.plate.clear')}</button><button class="primary" disabled=${!items.length} onClick=${onLog}>${t('food.plate.log')}</button></div>
  <//>`;
}
