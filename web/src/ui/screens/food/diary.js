/* Дневник питания: липкая навигация по дням, итог «осталось / съедено» с полосой по приёмам и кольцами БЖУ,
   быстрые действия, приёмы пищи (или таймлайн по часам),
   «как в прошлый раз» для пустого приёма, свайп-удаление с «Отменить», выделение записей (копировать,
   перенести, удалить), шторка «Разбор дня» (цель, БЖУ, расход, неделя, отметки, заметка). */
import { html, useApp, useData, useState, useEffect, navigate, todayYmd, keyboardSoon } from '../../core.js';
import { Page, Sheet, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtSigned } from '../../../i18n/index.js';
import { DateNav, EntryRow, SwipeRow, useEnergy, num, nowTime, addDays, macroLine, MEALS, MEAL_KEY } from '../../food/parts.js';
import { dayBudget, journalWeekFor } from '../../food/budget.js';
import { dayTotals, timelineHours, mealOf, mealDefaultTime, lastMeal, foodNutrients, servingAmount, copyEntries, moveEntries, explodeRecipeEntry } from '../../../domain/nutrition.js';
import { uid } from '../../../data/ids.js';
import { formatClock } from '../../../domain/units.js';
import { CheckinBanner } from '../checkin.js';
import { scaleNutrients, roundNutrients } from '../../../data/models/nutrients.js';
import { toast } from '../../toast.js';
import { Ring } from '../../viz.js';

export function FoodDiary({ route }) {
  const app = useApp();
  const { repos, store } = app;
  useData(['foodEntries', 'dayEntries', 'dietProfile', 'dayTargets', 'microGoals', 'profile', 'foodItems']);
  useData(['expenditureSettings', 'scaleEntries', 'workoutLogs', 'stepsEntries']);
  const energy = useEnergy();
  const date = route.query.d || todayYmd();
  const today = date === todayYmd();
  const setDate = (d) => navigate('/food?d=' + d, { replace: true });
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const [copyMove, setCopyMove] = useState(null);
  const [menu, setMenu] = useState(false);
  const [review, setReview] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => { setSel(new Set()); setSelecting(false); }, [date]);

  const dp = repos.dietProfile.get();
  const entries = repos.foodEntry.byDate(date);
  const all = repos.foodEntry.list();
  const day = repos.dayEntry.get(date);
  const totals = dayTotals(entries, day);
  const budget = dayBudget(app, date);
  const clock = repos.profile.get().units.clock;
  const fmtTime = (hm) => formatClock(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), clock);

  /* переход на добавление: приём и время предвыбраны; k=1 — поднять клавиатуру */
  const addAt = (meal, time) => { keyboardSoon(); navigate('/food/add?d=' + date + '&m=' + meal + (time ? '&t=' + time : '') + '&k=1'); };
  const addNow = () => { const time = today ? nowTime() : null; addAt(time ? mealOf({ time }) : 'l', time); };
  const saveDay = (patch) => repos.dayEntry.save(Object.assign({}, day || { id: date }, patch, { id: date }));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tap = (e) => (selecting ? toggle(e.id) : setEdit(e));
  const longPress = (e) => { if (!selecting) { setSelecting(true); setSel(new Set([e.id])); } };
  const chosen = entries.filter((e) => sel.has(e.id));

  /* удаление без вопросов: тост с «Отменить» возвращает записи как были */
  async function removeEntries(list) {
    const docs = list.map((e) => repos.foodEntry.get(e.id)).filter(Boolean);
    if (!docs.length) return;
    await store.batch(docs.map((d) => repos.foodEntry.removeOp(d.id)));
    setSel(new Set()); setSelecting(false); setEdit(null);
    toast({
      text: docs.length === 1 ? t('food.deletedOne', { name: docs[0].name || t('food.quick.name') }) : t('food.deletedMany', { count: docs.length }),
      action: { label: t('common.undo'), run: () => store.batch(docs.map((d) => repos.foodEntry.putOp(d))) }
    });
  }

  /* «как в прошлый раз»: копия записей того же приёма из последнего дня */
  async function repeatMeal(meal, lm) {
    const copies = copyEntries(lm.entries, [date], { newId: uid }).map((c) => Object.assign({}, c, { meal }));
    await store.batch(copies.map((c) => repos.foodEntry.putOp(c)));
    toast({ text: t('food.copyTitle', { count: copies.length }) + ' · ' + t(MEAL_KEY[meal]), action: { label: t('common.undo'), run: () => store.batch(copies.map((c) => repos.foodEntry.removeOp(c.id))) } });
  }

  const prev = repos.foodEntry.byDate(addDays(date, -1));
  async function copyYesterday() {
    const copies = copyEntries(prev, [date], { newId: uid });
    await store.batch(copies.map((c) => repos.foodEntry.putOp(c)));
  }

  const view = dp.diaryView === 'timeline' ? 'timeline' : 'classic';
  const rowProps = { energy, selecting, sel, onTap: tap, onLong: longPress, onDelete: (e) => removeEntries([e]) };

  /* быстрые действия из настроек питания (dietProfile.shortcuts): поиск, штрихкод, «Быстро» (свой продукт: ИИ по названию), фото;
     у «Быстро» сразу поле названия — клавиатуру поднимаем ещё в нажатии (iOS) */
  const quick = (open) => { if (open === 'quick') keyboardSoon(); const time = today ? nowTime() : null; navigate('/food/add?d=' + date + '&m=' + (time ? mealOf({ time }) : 'l') + (time ? '&t=' + time : '') + '&open=' + open); };
  const QA = { search: ['search', 'food.qa.search', addNow], scan: ['barcode', 'food.qa.scan', () => quick('scan')], quick: ['bolt', 'food.qa.quick', () => quick('quick')], photo: ['camera', 'food.qa.photo', () => quick('photo')] };
  const shortcuts = (dp.shortcuts || []).filter((k) => QA[k]);

  return html`<${Page} title=${t('nav.food')}
      right=${html`<div class="row" style="gap:10px">
        ${entries.length ? html`<button class="small" onClick=${() => { setSelecting(!selecting); setSel(new Set()); }}>${selecting ? t('common.done') : t('food.select')}</button>` : null}
        <button class="ghost" aria-label=${t('food.menu')} onClick=${() => setMenu(true)}><${Icon} name="more"/></button>
      </div>`}>
    <div class="fhead">
      <${DateNav} date=${date} onChange=${setDate}/>
    </div>
    <${Head} totals=${totals} budget=${budget} energy=${energy} day=${day} entries=${entries} big=${dp.banner === 'eaten' ? 'eaten' : 'left'} showOver=${!!dp.showOverages} onOpen=${() => setReview(true)}/>
    ${shortcuts.length ? html`<div class="qacts">${shortcuts.map((k) => html`<button class="qact" onClick=${QA[k][2]}><${Icon} name=${QA[k][0]}/>${t(QA[k][1])}</button>`)}</div>` : null}
    ${today ? html`<${CheckinBanner}/>` : null}

    ${!entries.length && day && day.fasting ? html`<div class="card empty">${t('food.empty.fasting')}</div>` : null}
    ${!entries.length && prev.length && !(day && day.fasting) ? html`<div class="card empty">${t('food.empty')}
      <div class="stack" style="margin-top:12px"><button onClick=${copyYesterday}>${t('food.copyYesterday', { count: prev.length })}</button></div></div>` : null}

    ${view === 'timeline'
      ? html`<${Timeline} entries=${entries} dp=${dp} fmtTime=${fmtTime} today=${today} onAdd=${(hh) => addAt(mealOf({ time: hh }), hh)} ...${rowProps}/>`
      : html`<${Meals} entries=${entries} all=${all} date=${date} today=${today} fmtTime=${fmtTime} onAdd=${addAt} onRepeat=${repeatMeal} ...${rowProps}/>`}

    ${!selecting ? html`<button class="fab primary" onClick=${addNow}><${Icon} name="plus"/>${t('food.addFab')}</button>` : null}
    ${selecting ? html`<div class="selbar">
      <span class="grow">${t('food.selected', { count: chosen.length })}</span>
      <button class="small" disabled=${!chosen.length} onClick=${() => setCopyMove({ mode: 'copy', list: chosen })}>${t('food.copy')}</button>
      <button class="small" disabled=${!chosen.length} onClick=${() => setCopyMove({ mode: 'move', list: chosen })}>${t('food.move')}</button>
      <button class="small danger" disabled=${!chosen.length} onClick=${() => removeEntries(chosen)}>${t('food.delete')}</button>
    </div>` : null}

    <${DayReview} open=${review} onClose=${() => setReview(false)} date=${date} app=${app} totals=${totals} budget=${budget} energy=${energy} day=${day} entries=${entries}
      showOver=${!!dp.showOverages} onSaveDay=${saveDay} onManual=${() => setManual(true)}/>
    <${EntrySheet} entry=${edit} onClose=${() => setEdit(null)} onDelete=${(e) => removeEntries([e])} onCopyMove=${(mode, e) => { setEdit(null); setCopyMove({ mode, list: [e] }); }}/>
    <${CopyMoveSheet} job=${copyMove} date=${date} onClose=${() => setCopyMove(null)} onDone=${() => { setCopyMove(null); setSel(new Set()); setSelecting(false); }}/>
    <${DayMenu} open=${menu} onClose=${() => setMenu(false)} date=${date} entries=${entries}
      onCopyDay=${() => { setMenu(false); setCopyMove({ mode: 'copy', list: entries }); }}
      onClear=${() => { setMenu(false); removeEntries(entries); }}
      onManual=${() => { setMenu(false); setManual(true); }}/>
    <${ManualSheet} open=${manual} onClose=${() => setManual(false)} day=${day} totals=${dayTotals(entries)} onSave=${(m) => { saveDay({ manualTotals: m }); setManual(false); }}/>
  <//>`;
}

/* ---------- итог дня: осталось / съедено крупно, полоса по приёмам пищи, кольца БЖУ; тап — «Разбор дня» ---------- */
function Head({ totals, budget, energy, day, entries, big, showOver, onOpen }) {
  const eaten = totals.kcal || 0, target = budget.kcal || 0;
  const rawLeft = target - eaten, over = showOver && rawLeft < 0, left = showOver ? rawLeft : Math.max(0, rawLeft);
  const showLeft = big === 'left' && target > 0;
  const flags = [day && day.fasting ? t('food.flag.fasting') : null, day && day.partial ? t('food.flag.partial') : null, totals.manual ? t('food.flag.manual') : null].filter(Boolean);
  const M = [['protein', 'food.macro.p', 'var(--m-p)'], ['fat', 'food.macro.f', 'var(--m-f)'], ['carbs', 'food.macro.c', 'var(--m-c)']];
  /* съедено по приёмам; при ручном итоге — одним куском */
  const parts = totals.manual ? (eaten ? [{ color: 'var(--k-food)', kcal: eaten }] : [])
    : MEALS.map(([m, , color]) => ({ color, kcal: dayTotals(entries.filter((e) => mealOf(e) === m)).kcal || 0 })).filter((x) => x.kcal > 0);
  const scale = Math.max(target, eaten) || 1;
  return html`<button class="card fbanner" onClick=${onOpen} aria-label=${t('food.review')}>
    <span class="fb-top">
      <span class="fs-txt">
        <span class="rl">${showLeft ? (over ? t('food.over') : t('food.left')) : t('food.eaten')}</span>
        <span class=${'fs-big' + (showLeft && over ? ' over' : '')}>${energy.fmt(showLeft ? Math.abs(left) : eaten)}<small>${energy.unit}</small></span>
      </span>
      <span class="lnk fb-more">${t('food.review')}<${Icon} name="right"/></span>
    </span>
    <span class="fb-bar">${parts.map((x) => html`<i style=${'width:' + (x.kcal / scale * 100).toFixed(1) + '%;--mc:' + x.color}></i>`)}</span>
    <span class="fb-leg">
      <span class="fb-dots">${totals.manual ? null : parts.map((x) => html`<span><i style=${'background:' + x.color}></i>${energy.fmt(x.kcal)}</span>`)}</span>
      <span class="fb-of">${showLeft ? html`<b>${energy.fmt(eaten)}</b> ${t('food.ofGoal', { g: energy.fmt(target) })}` : target ? t('food.ofGoal', { g: energy.fmt(target) }) : t('food.goalSrc.none')}</span>
    </span>
    ${flags.length ? html`<span class="fb-flags">${flags.join(' · ')}</span>` : null}
    <span class="fb-rings">${M.map(([k, label, color]) => {
      const v = totals[k] || 0, tg = budget[k] || 0;
      return html`<span class="fb-m" style=${'--rc:' + color}>
        <${Ring} share=${tg > 0 ? v / tg : 0}>${tg > 0 ? Math.round(v / tg * 100) + '%' : '—'}<//>
        <span class="fb-ml"><span>${t(label)}</span><b>${fmtNum(v)} <small>${tg ? '/ ' + fmtNum(tg) + ' ' : ''}${t('unit.g')}</small></b></span>
      </span>`;
    })}</span>
  </button>`;
}

/* ---------- по приёмам пищи: стеклянная карточка — точка цвета, время, сумма, строки, «Добавить» ---------- */
function Meals({ entries, all, date, today, energy, fmtTime, selecting, sel, onTap, onLong, onDelete, onAdd, onRepeat }) {
  return html`${MEALS.map(([m, label, color]) => {
    const list = entries.filter((e) => mealOf(e) === m);
    const sum = dayTotals(list);
    const lm = !list.length ? lastMeal(all, m, { before: date, addDays }) : null;
    const lmSum = lm ? dayTotals(lm.entries) : null;
    const time = list.map((e) => e.time).filter(Boolean).sort()[0];
    const add = () => onAdd(m, mealDefaultTime(m, today ? nowTime() : null));
    return html`<div class=${'card meal' + (list.length ? '' : ' mempty')}>
      <div class="mh row"><span class="mdot" style=${'background:' + color + ';color:' + color}></span><b>${t(label)}</b>
        ${time ? html`<span class="mtime">${fmtTime(time)}</span>` : null}
        ${list.length ? html`<span class="hs">${energy.fmt(sum.kcal)} <small>${energy.unit}</small></span>` : html`<span class="hs muted">${t('food.meal.empty')}</span>`}</div>
      ${list.length ? html`<div class="fm mline">${macroLine(sum)}</div>` : null}
      ${list.map((e) => html`<${SwipeRow} key=${e.id} disabled=${selecting} onDelete=${() => onDelete(e)} onLong=${() => onLong(e)}>
        <${EntryRow} e=${e} energy=${energy} selecting=${selecting} selected=${sel.has(e.id)} onTap=${() => onTap(e)}/>
      <//>`)}
      ${!list.length && lm ? html`<div class="mrep">
          <button class="madd" onClick=${() => onRepeat(m, lm)}><${Icon} name="repeat" size=${18}/>${t('food.lastTime', { k: energy.fmt(lmSum.kcal), u: energy.unit })}</button>
          <button class="mplus" aria-label=${t('food.addTo', { m: t(label) })} onClick=${add}><${Icon} name="plus"/></button>
        </div>`
      : html`<button class="madd" onClick=${add}><${Icon} name="plus" size=${18}/>${t('food.addEntry')}</button>`}
    </div>`;
  })}`;
}

/* ---------- таймлайн по часам ---------- */
function Timeline({ entries, dp, energy, fmtTime, selecting, sel, onTap, onLong, onDelete, onAdd, today }) {
  const hours = timelineHours(entries, dp.timeline);
  const nowH = new Date().getHours();
  return html`<div class="card tl">${hours.map(({ hour, entries: list }) => {
    const sum = dayTotals(list);
    const hh = String(hour).padStart(2, '0') + ':00';
    return html`<div class=${'tlh' + (list.length ? ' busy' : '') + (today && hour === nowH ? ' now' : '')}>
      <div class="tlh-top row">
        <span class="tlt">${fmtTime(hh)}</span>
        ${list.length ? html`<span class="tls grow">${energy.fmt(sum.kcal)} ${energy.unit} · ${macroLine(sum)}</span>` : html`<span class="grow"></span>`}
        <button class="tladd" aria-label=${t('food.addAt', { t: fmtTime(hh) })} onClick=${() => onAdd(hh)}><${Icon} name="plus" size=${16}/></button>
      </div>
      ${list.map((e) => html`<${SwipeRow} key=${e.id} disabled=${selecting} onDelete=${() => onDelete(e)} onLong=${() => onLong(e)}>
        <${EntryRow} e=${e} energy=${energy} selecting=${selecting} selected=${sel.has(e.id)} onTap=${() => onTap(e)}/>
      <//>`)}
    </div>`;
  })}</div>`;
}

/* ---------- «Разбор дня» ---------- */
const GOAL_SRC = { program: 'food.goalSrc.program', journal: 'food.goalSrc.journal', none: 'food.goalSrc.none' };
function DayReview({ open, onClose, date, app, totals, budget, energy, day, entries, showOver, onSaveDay, onManual }) {
  if (!open) return null;
  const eaten = totals.kcal || 0, target = budget.kcal || 0;
  const rawLeft = target - eaten, over = showOver && rawLeft < 0, left = showOver ? rawLeft : Math.max(0, rawLeft);
  const src = GOAL_SRC[budget.source === 'journal' ? 'journal' : budget.source === 'none' || !target ? 'none' : 'program'];
  const ws = journalWeekFor(app, date);
  const b = budget.source === 'journal' ? budget.journal : null;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.review')}>
    <div class="kv"><span>${t('food.goal')}<small>${t(src)}</small></span><span>${target ? energy.fmt(target) + ' ' + energy.unit : '—'}</span></div>
    <div class="kv"><span>${t('food.eaten')}</span><span>${energy.fmt(eaten)} ${energy.unit}</span></div>
    ${target ? html`<div class="kv tot"><span>${over ? t('food.over') : t('food.left')}</span><span class=${over ? 'rover' : ''}>${energy.fmt(Math.abs(left))} ${energy.unit}</span></div>` : null}
    <div class="dflags">
      <button class=${'chip' + (day && day.fasting ? ' on' : '')} onClick=${() => onSaveDay({ fasting: !(day && day.fasting) })}>${t('food.flag.fasting')}</button>
      <button class=${'chip' + (day && day.partial ? ' on' : '')} onClick=${() => onSaveDay({ partial: !(day && day.partial) })}>${t('food.flag.partial')}</button>
      <button class=${'chip' + (totals.manual ? ' on' : '')} onClick=${onManual}>${t('food.flag.manual')}</button>
    </div>
    ${budget.source === 'none' ? html`<div class="hint">${t('food.noGoal')}</div>` : null}

    <div class="ltitle">${t('food.macros.title')}</div>
    <${MacroRows} totals=${totals} budget=${budget}/>

    ${b ? html`<div class="ltitle">${t('food.burn.title')}</div><${BurnRows} b=${b} energy=${energy}/>` : null}
    ${ws && ws.n >= 2 ? html`<div class="ltitle">${t('food.week.title', { n: ws.n })}</div><${WeekRows} ws=${ws} energy=${energy}/>` : null}

    <div class="ltitle">${t('food.note')}</div>
    <${DayNote} day=${day} onSave=${(note) => onSaveDay({ note })}/>
    <button class="linkbtn" style="width:100%" onClick=${() => { onClose(); navigate('/food/nutrients?d=' + date); }}>${t('food.review.nutrients')} ›</button>
    ${!entries.length ? null : html`<div class="hint" style="text-align:center">${t('food.sheet.swipe')}</div>`}
  <//>`;
}

function MacroRows({ totals, budget }) {
  const pa = totals.protein_animal || 0, pv = totals.protein_plant || 0, p = totals.protein || 0;
  const row = (label, v, target, mode) => {
    const frac = target > 0 ? Math.min(1, v / target) : 0;
    const bad = target > 0 && (mode === 'max' ? v > target * 1.1 : false);
    return html`<div class="mac"><div class="mh row"><span class="grow">${label}</span><span>${fmtNum(v)}${target ? ' / ' + fmtNum(target) : ''} ${t('unit.g')}</span></div>
      <div class=${'bar mbar' + (bad ? ' over' : '')}><i style=${'width:' + (frac * 100).toFixed(1) + '%'}></i></div></div>`;
  };
  return html`${row(t('food.macro.protein'), p, budget.protein, 'min')}
    ${pa + pv > 0 ? html`<div class="psplit"><span class="pa" style=${'flex:' + pa}></span><span class="pv" style=${'flex:' + pv}></span></div>
      <div class="hint" style="margin-top:4px">${t('food.protein.split', { a: fmtNum(pa), v: fmtNum(pv) })}</div>` : null}
    ${row(t('food.macro.fat'), totals.fat || 0, budget.fat, 'max')}
    ${row(t('food.macro.carbs'), totals.carbs || 0, budget.carbs, 'max')}
    ${row(t('food.macro.fiber'), totals.fiber || 0, budget.fiber, 'min')}
    <div class="hint">${budget.source === 'journal' ? t('food.macros.hintJournal') : t('food.macros.hint')}</div>`;
}

/* расход по настройкам журнала */
function BurnRows({ b, energy }) {
  const act = b.stepK + b.cardioNet + b.train;
  return html`<div class="kv"><span>${t('food.burn.bmr')}</span><span>${energy.fmt(b.base)}</span></div>
    <div class="kv"><span>${t('food.burn.activity')}</span><span>${energy.fmt(act)}</span></div>
    <div class="hint" style="margin:-4px 0 6px">${t('food.burn.parts', { s: energy.fmt(b.stepK), c: energy.fmt(b.cardioNet), w: energy.fmt(b.train) })}</div>
    ${b.corr ? html`<div class="kv"><span>${t('food.burn.corr', { p: (b.corr > 0 ? '+' : '') + b.corr })}</span><span>${energy.fmt(b.burned - b.raw)}</span></div>` : null}
    <div class="kv tot"><span>${t('food.burn.total')}</span><span>${energy.fmt(b.burned)} ${energy.unit}</span></div>
    ${b.offset ? html`<div class="kv"><span>${t('food.burn.goal', { o: (b.offset > 0 ? '+' : '') + b.offset })}</span><span>${energy.fmt(b.goal)} ${energy.unit}</span></div>` : null}
    ${b.hasSteps ? null : html`<div class="hint warn">${t('food.burn.noSteps')}</div>`}
    <div class="hint">${t('food.burn.hint')}</div>`;
}

function WeekRows({ ws, energy }) {
  const diff = ws.eat - ws.bur;
  return html`<div class="kv"><span>${t('food.week.eat')}</span><span>${energy.fmt(ws.eat)} ${energy.unit}</span></div>
    <div class="kv"><span>${t('food.week.burn')}</span><span>${energy.fmt(ws.bur)} ${energy.unit}</span></div>
    <div class="kv tot"><span>${t('food.week.balance')}</span><span>${fmtSigned(diff)} ${energy.unit}</span></div>
    ${ws.w1 != null && ws.w0 != null ? html`<div class="kv"><span>${t('food.week.weight')}</span><span>${fmtNum(ws.w0, 1)} → ${fmtNum(ws.w1, 1)}</span></div>` : null}`;
}

/* ---------- заметка к дню ---------- */
function DayNote({ day, onSave }) {
  const [v, setV] = useState(null);
  const cur = v != null ? v : (day && day.note) || '';
  return html`<textarea placeholder=${t('food.note.ph')} value=${cur} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${() => { if (v != null && v !== ((day && day.note) || '')) onSave(v); setV(null); }}></textarea>`;
}

/* ---------- правка записи ---------- */
function EntrySheet({ entry, onClose, onDelete, onCopyMove }) {
  const { repos, store } = useApp();
  const [d, setD] = useState(null);
  /* разложить рецепт: запись заменяется продуктами в той же доле, время то же */
  async function explode() {
    const resolve = (k, id) => (k === 'recipe' ? repos.recipe.get(id) : repos.food.get(id));
    let parts = [];
    try { parts = explodeRecipeEntry(entry, resolve); } catch (e) { parts = []; }
    if (!parts.length) return;
    await store.batch(parts.map((p) => repos.foodEntry.putOp({ date: entry.date, time: entry.time, meal: entry.meal || null, ref: p.ref, name: p.name, amount: p.amount, unit: p.unit, nutrients: p.nutrients })).concat([repos.foodEntry.removeOp(entry.id)]));
    onClose();
  }
  useEffect(() => {
    if (!entry) { setD(null); return; }
    const food = entry.ref && entry.ref.kind === 'food' ? repos.food.get(entry.ref.id) : null;
    const serving = entry.servingId && food && (food.servings || []).some((s) => s.id === entry.servingId) ? entry.servingId : '';
    setD({ time: entry.time, meal: mealOf(entry), servingId: serving, qty: serving ? (entry.quantity ?? 1) : (entry.amount ?? ''), name: entry.name, n: Object.assign({}, entry.nutrients), food, touched: false });
  }, [entry && entry.id]);
  if (!entry || !d) return null;
  const food = d.food;
  const amount = food ? servingAmount(food, d.servingId, num(d.qty)) : num(d.qty);
  /* без продукта: при смене веса нутриенты меняются пропорционально, пока их не правили руками */
  const n = food ? foodNutrients(food, amount)
    : (!d.touched && entry.amount > 0 && amount > 0 && amount !== entry.amount ? roundNutrients(scaleNutrients(entry.nutrients, amount / entry.amount), 2) : d.n);
  async function save() {
    const patch = { time: d.time || entry.time, meal: d.meal, name: d.name, nutrients: n, amount: amount || null, servingId: food ? d.servingId : '', quantity: food && d.servingId ? num(d.qty) : null };
    await repos.foodEntry.update(entry.id, patch);
    onClose();
  }
  const setN = (k, v) => setD(Object.assign({}, d, { touched: true, n: Object.assign({}, n, { [k]: num(v) == null ? undefined : num(v) }) }));
  return html`<${Sheet} open=${true} onClose=${onClose} title=${entry.name || t('food.quick.name')}>
    <div class="grid2">
      <${Field} label=${t('food.meal')}><select value=${d.meal} onChange=${(e) => setD(Object.assign({}, d, { meal: e.currentTarget.value }))}>${MEALS.map(([m, label]) => html`<option value=${m}>${t(label)}</option>`)}</select><//>
      <${Field} label=${t('food.time')}><input type="time" value=${d.time} onInput=${(e) => setD(Object.assign({}, d, { time: e.currentTarget.value }))}/><//>
    </div>
    <div style="margin-top:12px">
      <${Field} label=${food && d.servingId ? t('food.qty') : t('food.grams')}><input inputmode="decimal" value=${d.qty} onInput=${(e) => setD(Object.assign({}, d, { qty: e.currentTarget.value }))}/><//>
    </div>
    ${food && (food.servings || []).length ? html`<div class="chips" style="margin-top:10px">
      <button class=${'chip' + (!d.servingId ? ' on' : '')} onClick=${() => setD(Object.assign({}, d, { servingId: '', qty: amount || '' }))}>${t('unit.g')}</button>
      ${food.servings.map((s) => html`<button class=${'chip' + (d.servingId === s.id ? ' on' : '')} onClick=${() => setD(Object.assign({}, d, { servingId: s.id, qty: 1 }))}>${s.label}</button>`)}
    </div>` : null}
    ${food ? html`<div class="prev">${fmtNum(n.kcal)} ${t('unit.kcal')} · ${macroLine(n)}</div>` : html`<div class="grid2" style="margin-top:12px">
      <${Field} label=${t('food.n.kcal')}><input inputmode="decimal" value=${n.kcal ?? ''} onInput=${(e) => setN('kcal', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.protein')}><input inputmode="decimal" value=${n.protein ?? ''} onInput=${(e) => setN('protein', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.fat')}><input inputmode="decimal" value=${n.fat ?? ''} onInput=${(e) => setN('fat', e.currentTarget.value)}/><//>
      <${Field} label=${t('food.n.carbs')}><input inputmode="decimal" value=${n.carbs ?? ''} onInput=${(e) => setN('carbs', e.currentTarget.value)}/><//>
    </div>`}
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
    <div class="grid3" style="margin-top:8px">
      <button class="small" onClick=${() => onCopyMove('copy', entry)}>${t('food.copy')}</button>
      <button class="small" onClick=${() => onCopyMove('move', entry)}>${t('food.move')}</button>
      <button class="small danger" onClick=${() => onDelete(entry)}>${t('food.delete')}</button>
    </div>
    ${food ? html`<button class="linkbtn" onClick=${() => { onClose(); navigate('/food/item/' + food.id); }}>${t('food.openFood')}</button>` : null}
    ${entry.ref && entry.ref.kind === 'recipe' ? html`<button class="linkbtn" onClick=${explode}>${t('food.explode')}</button>` : null}
  <//>`;
}

/* ---------- копировать / перенести ---------- */
function CopyMoveSheet({ job, date, onClose, onDone }) {
  const { repos, store } = useApp();
  const [dates, setDates] = useState([]);
  const [time, setTime] = useState('');
  useEffect(() => { if (job) { setDates([job.mode === 'copy' ? addDays(date, 1) : date]); setTime(''); } }, [job]);
  if (!job) return null;
  const copy = job.mode === 'copy';
  async function go() {
    const ds = dates.filter(Boolean);
    if (!ds.length) return;
    const ops = copy
      ? copyEntries(job.list, ds, { time: time || null, newId: uid }).map((e) => repos.foodEntry.putOp(e))
      : moveEntries(job.list, ds[0], { time: time || null }).map((e) => repos.foodEntry.putOp(e));
    await store.batch(ops);
    onDone();
  }
  return html`<${Sheet} open=${true} onClose=${onClose} title=${copy ? t('food.copyTitle', { count: job.list.length }) : t('food.moveTitle', { count: job.list.length })}>
    ${dates.map((d, i) => html`<div class="row" style="margin-bottom:8px">
      <input type="date" value=${d} onChange=${(e) => setDates(dates.map((x, j) => (j === i ? e.currentTarget.value : x)))}/>
      ${copy && dates.length > 1 ? html`<button class="small icn danger" aria-label=${t('food.delete')} onClick=${() => setDates(dates.filter((x, j) => j !== i))}><${Icon} name="close" size=${14}/></button>` : null}
    </div>`)}
    ${copy ? html`<button class="small" onClick=${() => setDates(dates.concat([addDays(dates[dates.length - 1] || date, 1)]))}>${t('food.addDate')}</button>` : null}
    <${Field} label=${t('food.timeOptional')} hint=${t('food.timeKeep')}><input type="time" value=${time} onInput=${(e) => setTime(e.currentTarget.value)}/><//>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${go}>${copy ? t('food.copy') : t('food.move')}</button>
  <//>`;
}

/* ---------- меню дня ---------- */
function DayMenu({ open, onClose, date, entries, onCopyDay, onClear, onManual }) {
  const go = (p) => { onClose(); navigate(p); };
  return html`<${Sheet} open=${open} onClose=${onClose} title=${t('food.menu')}>
    <div class="list menu">
      ${entries.length ? html`<button class="lrow" onClick=${onCopyDay}><span class="ll">${t('food.copyDay')}</span></button>` : null}
      <button class="lrow" onClick=${() => go('/food/add?d=' + date + '&tab=history')}><span class="ll">${t('food.fromHistory')}</span></button>
      <button class="lrow" onClick=${onManual}><span class="ll">${t('food.manualTotals')}</span></button>
      ${entries.length ? html`<button class="lrow" onClick=${onClear}><span class="ll danger-t">${t('food.clearDay')}</span></button>` : null}
    </div>
    <div class="list menu">
      <button class="lrow" onClick=${() => go('/food/library')}><span class="ll">${t('food.library')}</span></button>
      <button class="lrow" onClick=${() => go('/food/recipes')}><span class="ll">${t('food.recipes')}</span></button>
      <button class="lrow" onClick=${() => go('/food/nutrients?d=' + date)}><span class="ll">${t('food.nut.title')}</span></button>
      <button class="lrow" onClick=${() => go('/food/days')}><span class="ll">${t('food.days')}</span></button>
      <button class="lrow" onClick=${() => go('/food/settings')}><span class="ll">${t('food.settings')}</span></button>
    </div>
  <//>`;
}

/* ---------- ручной итог дня ---------- */
function ManualSheet({ open, onClose, day, totals, onSave }) {
  const [m, setM] = useState({});
  useEffect(() => { if (open) setM(Object.assign({}, (day && day.manualTotals) || {})); }, [open]);
  if (!open) return null;
  const set = (k, v) => setM(Object.assign({}, m, { [k]: num(v) == null ? undefined : num(v) }));
  const clean = () => { const o = {}; Object.keys(m).forEach((k) => { if (m[k] != null) o[k] = m[k]; }); return Object.keys(o).length ? o : null; };
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('food.manualTotals')}>
    <div class="hint" style="margin:0 0 10px">${t('food.manual.hint', { k: fmtNum(totals.kcal || 0) })}</div>
    <div class="grid2">
      ${[['kcal', t('food.n.kcal')], ['protein', t('food.n.protein')], ['fat', t('food.n.fat')], ['carbs', t('food.n.carbs')]].map(([k, label]) => html`<${Field} label=${label}><input inputmode="decimal" placeholder=${fmtNum(totals[k] || 0)} value=${m[k] ?? ''} onInput=${(e) => set(k, e.currentTarget.value)}/><//>`)}
    </div>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${() => onSave(clean())}>${t('common.save')}</button>
    ${day && day.manualTotals ? html`<button class="small danger" style="width:100%;margin-top:8px" onClick=${() => onSave(null)}>${t('food.manual.reset')}</button>` : null}
  <//>`;
}
