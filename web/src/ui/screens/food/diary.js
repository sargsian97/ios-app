/* Дневник питания: таймлайн по часам или по приёмам пищи, итог и цель дня, отметки дня,
   выделение записей (копировать, перенести, удалить), заметка, расход по журналу. */
import { html, useApp, useData, useLegacy, useState, useEffect, navigate, todayYmd } from '../../core.js';
import { Page, Card, Sheet, Confirm, Segmented, Toggle, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtSigned } from '../../../i18n/index.js';
import { DateNav, Ring, MacroStrip, EntryRow, useEnergy, num, nowTime, addDays, macroLine } from '../../food/parts.js';
import { dayBudget } from '../../food/budget.js';
import { dayTotals, timelineHours, mealOf, foodNutrients, servingAmount, copyEntries, moveEntries } from '../../../domain/nutrition.js';
import { uid } from '../../../data/ids.js';
import { formatClock } from '../../../domain/units.js';
import { CheckinBanner } from '../checkin.js';
import { scaleNutrients, roundNutrients } from '../../../data/models/nutrients.js';

const MEALS = [['b', 'food.meal.b', '#FFB800'], ['l', 'food.meal.l', '#FF7A1A'], ['d', 'food.meal.d', '#8A87FF'], ['s', 'food.meal.s', '#FF2D55']];

export function FoodDiary({ route }) {
  const app = useApp();
  const { repos, store } = app;
  useData(['foodEntries', 'dayEntries', 'dietProfile', 'dayTargets', 'microGoals', 'profile', 'foodItems']);
  const legacy = useLegacy();
  const energy = useEnergy();
  const date = route.query.d || todayYmd();
  const setDate = (d) => navigate('/food?d=' + d, { replace: true });
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const [copyMove, setCopyMove] = useState(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [manual, setManual] = useState(false);
  useEffect(() => { setSel(new Set()); setSelecting(false); }, [date]);

  const dp = repos.dietProfile.get();
  const entries = repos.foodEntry.byDate(date);
  const day = repos.dayEntry.get(date);
  const totals = dayTotals(entries, day);
  const budget = dayBudget({ repos, legacy, date });
  const clock = repos.profile.get().units.clock;
  const fmtTime = (hm) => formatClock(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), clock);

  const addAt = (time) => navigate('/food/add?d=' + date + (time ? '&t=' + time : ''));
  const saveDay = (patch) => repos.dayEntry.save(Object.assign({}, day || { id: date }, patch, { id: date }));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tap = (e) => (selecting ? toggle(e.id) : setEdit(e));
  const chosen = entries.filter((e) => sel.has(e.id));

  async function removeEntries(list) {
    await store.batch(list.map((e) => repos.foodEntry.removeOp(e.id)));
    setSel(new Set()); setSelecting(false);
  }

  const prev = repos.foodEntry.byDate(addDays(date, -1));
  async function copyYesterday() {
    const copies = copyEntries(prev, [date], { newId: uid });
    await store.batch(copies.map((c) => repos.foodEntry.putOp(c)));
  }

  const view = dp.diaryView;
  const flags = html`<div class="dflags">
    <button class=${'chip' + (day && day.fasting ? ' on' : '')} onClick=${() => saveDay({ fasting: !(day && day.fasting) })}>${t('food.flag.fasting')}</button>
    <button class=${'chip' + (day && day.partial ? ' on' : '')} onClick=${() => saveDay({ partial: !(day && day.partial) })}>${t('food.flag.partial')}</button>
    ${totals.manual ? html`<button class="chip on" onClick=${() => setManual(true)}>${t('food.flag.manual')}</button>` : null}
  </div>`;

  return html`<${Page} title=${t('nav.food')} icon="food" color="linear-gradient(135deg,#FF7A6E,#FF2D55)"
      right=${html`<div class="row" style="gap:6px">
        ${entries.length ? html`<button class="small" onClick=${() => { setSelecting(!selecting); setSel(new Set()); }}>${selecting ? t('common.done') : t('food.select')}</button>` : null}
        <button class="small icn" aria-label=${t('food.menu')} onClick=${() => setMenu(true)}><${Icon} name="more" size=${18}/></button>
      </div>`}>
    <${DateNav} date=${date} onChange=${setDate}/>
    ${date === todayYmd() ? html`<${CheckinBanner}/>` : null}
    <${Banner} variant=${dp.banner} totals=${totals} budget=${budget} energy=${energy} flags=${flags}/>

    <div class="pills sub" style="margin:0 0 12px">
      <button class=${'pill' + (view === 'timeline' ? ' on' : '')} onClick=${() => repos.dietProfile.update({ diaryView: 'timeline' })}>${t('food.view.timeline')}</button>
      <button class=${'pill' + (view === 'classic' ? ' on' : '')} onClick=${() => repos.dietProfile.update({ diaryView: 'classic' })}>${t('food.view.classic')}</button>
    </div>

    ${!entries.length ? html`<div class="card empty">
      ${day && day.fasting ? t('food.empty.fasting') : t('food.empty')}
      <div class="stack" style="margin-top:12px">
        ${prev.length ? html`<button onClick=${copyYesterday}>${t('food.copyYesterday', { count: prev.length })}</button>` : null}
      </div>
    </div>` : null}

    ${view === 'timeline'
      ? html`<${Timeline} entries=${entries} dp=${dp} energy=${energy} fmtTime=${fmtTime} selecting=${selecting} sel=${sel} onTap=${tap} onAdd=${addAt} today=${date === todayYmd()}/>`
      : html`<${Classic} entries=${entries} energy=${energy} selecting=${selecting} sel=${sel} onTap=${tap} onAdd=${addAt}/>`}

    <${DayNote} day=${day} onSave=${(note) => saveDay({ note })}/>
    ${budget.source === 'journal' ? html`<${JournalBurn} b=${budget.journal} energy=${energy}/>` : null}
    <${MacroTargets} totals=${totals} budget=${budget}/>
    <${WeekCard} date=${date} legacy=${legacy} energy=${energy}/>

    ${!selecting ? html`<button class="fab primary" onClick=${() => addAt(date === todayYmd() ? nowTime() : null)}>${t('food.addFab')}</button>` : null}
    ${selecting ? html`<div class="selbar">
      <span class="grow">${t('food.selected', { count: chosen.length })}</span>
      <button class="small" disabled=${!chosen.length} onClick=${() => setCopyMove({ mode: 'copy', list: chosen })}>${t('food.copy')}</button>
      <button class="small" disabled=${!chosen.length} onClick=${() => setCopyMove({ mode: 'move', list: chosen })}>${t('food.move')}</button>
      <button class="small danger" disabled=${!chosen.length} onClick=${() => setConfirm({ text: t('food.confirmDelete', { count: chosen.length }), yes: t('food.delete'), go: () => removeEntries(chosen) })}>${t('food.delete')}</button>
    </div>` : null}

    <${EntrySheet} entry=${edit} onClose=${() => setEdit(null)} onCopyMove=${(mode, e) => { setEdit(null); setCopyMove({ mode, list: [e] }); }}/>
    <${CopyMoveSheet} job=${copyMove} date=${date} onClose=${() => setCopyMove(null)} onDone=${() => { setCopyMove(null); setSel(new Set()); setSelecting(false); }}/>
    <${DayMenu} open=${menu} onClose=${() => setMenu(false)} date=${date} entries=${entries}
      onCopyDay=${() => { setMenu(false); setCopyMove({ mode: 'copy', list: entries }); }}
      onClear=${() => { setMenu(false); setConfirm({ text: t('food.confirmClear', { count: entries.length }), yes: t('food.clear'), go: () => removeEntries(entries) }); }}
      onManual=${() => { setMenu(false); setManual(true); }}/>
    <${ManualSheet} open=${manual} onClose=${() => setManual(false)} day=${day} totals=${dayTotals(entries)} onSave=${(m) => { saveDay({ manualTotals: m }); setManual(false); }}/>
    ${confirm ? html`<${Confirm} text=${confirm.text} yes=${confirm.yes} danger=${true} onNo=${() => setConfirm(null)} onYes=${() => { const c = confirm; setConfirm(null); c.go(); }}/>` : null}
  <//>`;
}

/* ---------- баннер «съедено / осталось» ---------- */
function Banner({ variant, totals, budget, energy, flags }) {
  const eaten = totals.kcal || 0, target = budget.kcal || 0, left = target - eaten;
  const targets = { protein: budget.protein, fat: budget.fat, carbs: budget.carbs, fiber: budget.fiber };
  let top;
  if (variant === 'eaten' || variant === 'left') {
    const v = variant === 'eaten' ? eaten : Math.abs(left);
    top = html`<div class="bigstat"><span class="rl">${variant === 'eaten' ? t('food.eaten') : left < 0 ? t('food.over') : t('food.left')}</span>
      <b class=${variant === 'left' && left < 0 ? 'over' : ''}>${energy.fmt(v)}</b><small>${energy.unit}${target ? ' · ' + t('food.ofGoal', { g: energy.fmt(target) }) : ''}</small></div>`;
  } else if (variant === 'progress') {
    const frac = target > 0 ? Math.min(1, eaten / target) : 0;
    top = html`<div class="bigstat"><span class="rl">${t('food.eaten')}</span><b>${energy.fmt(eaten)}</b><small>${target ? t('food.ofGoal', { g: energy.fmt(target) }) + ' ' + energy.unit : energy.unit}</small></div>
      <div class=${'bar fbar' + (left < 0 ? ' over' : '')}><i style=${'width:' + (frac * 100).toFixed(1) + '%'}></i></div>`;
  } else {
    top = html`${target ? html`<${Ring} eaten=${eaten} target=${target} energy=${energy}/>` : null}
      <div class="rstats">
        <div><b>${target ? energy.fmt(target) : '—'}</b><span>${t('food.goal')}</span></div>
        <div><b>${energy.fmt(eaten)}</b><span>${t('food.eaten')}</span></div>
        <div><b class=${left < 0 ? 'rover' : ''}>${target ? energy.fmt(Math.abs(left)) : '—'}</b><span>${left < 0 ? t('food.over') : t('food.left')}</span></div>
      </div>`;
  }
  return html`<div class="card pad fbanner">${top}<${MacroStrip} totals=${totals} targets=${targets}/>${flags}
    ${budget.source === 'none' ? html`<div class="hint">${t('food.noGoal')}</div>` : null}</div>`;
}

/* ---------- таймлайн ---------- */
function Timeline({ entries, dp, energy, fmtTime, selecting, sel, onTap, onAdd, today }) {
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
      ${list.map((e) => html`<${EntryRow} key=${e.id} e=${e} energy=${energy} selecting=${selecting} selected=${sel.has(e.id)} onTap=${() => onTap(e)}/>`)}
    </div>`;
  })}</div>`;
}

/* ---------- по приёмам пищи ---------- */
function Classic({ entries, energy, selecting, sel, onTap, onAdd }) {
  return html`${MEALS.map(([m, label, color]) => {
    const list = entries.filter((e) => mealOf(e) === m);
    const sum = dayTotals(list);
    const time = { b: '08:00', l: '13:00', d: '19:00', s: '16:00' }[m];
    return html`<div class="card pad">
      <div class="mt row"><b class="grow"><span class="mdot" style=${'background:' + color}></span>${t(label)}</b>
        <span class="hs">${energy.fmt(sum.kcal)} ${energy.unit}</span>
        <button class="tladd" aria-label=${t('food.addTo', { m: t(label) })} onClick=${() => onAdd(time)}><${Icon} name="plus" size=${16}/></button></div>
      ${list.length ? html`<div class="fm" style="margin:-2px 0 4px">${macroLine(sum)}</div>` : null}
      ${list.map((e) => html`<${EntryRow} key=${e.id} e=${e} energy=${energy} selecting=${selecting} selected=${sel.has(e.id)} onTap=${() => onTap(e)}/>`)}
    </div>`;
  })}`;
}

/* ---------- заметка к дню ---------- */
function DayNote({ day, onSave }) {
  const [v, setV] = useState(null);
  const cur = v != null ? v : (day && day.note) || '';
  return html`<${Card} title=${t('food.note')} icon="list" color="var(--k-plan)">
    <textarea placeholder=${t('food.note.ph')} value=${cur} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${() => { if (v != null && v !== ((day && day.note) || '')) onSave(v); setV(null); }}></textarea>
  <//>`;
}

/* ---------- расход по настройкам журнала ---------- */
function JournalBurn({ b, energy }) {
  const act = b.stepK + b.cardioNet + b.train;
  return html`<${Card} title=${t('food.burn.title')} icon="flame" color="var(--k-burn)">
    <div class="kv"><span>${t('food.burn.bmr')}</span><span>${energy.fmt(b.base)}</span></div>
    <div class="kv"><span>${t('food.burn.activity')}</span><span>${energy.fmt(act)}</span></div>
    <div class="hint" style="margin:-4px 0 6px">${t('food.burn.parts', { s: energy.fmt(b.stepK), c: energy.fmt(b.cardioNet), w: energy.fmt(b.train) })}</div>
    ${b.corr ? html`<div class="kv"><span>${t('food.burn.corr', { p: (b.corr > 0 ? '+' : '') + b.corr })}</span><span>${energy.fmt(b.burned - b.raw)}</span></div>` : null}
    <div class="kv tot"><span>${t('food.burn.total')}</span><span>${energy.fmt(b.burned)} ${energy.unit}</span></div>
    ${b.offset ? html`<div class="kv"><span>${t('food.burn.goal', { o: (b.offset > 0 ? '+' : '') + b.offset })}</span><span>${energy.fmt(b.goal)} ${energy.unit}</span></div>` : null}
    ${b.hasSteps ? null : html`<div class="hint warn">${t('food.burn.noSteps')}</div>`}
    <div class="hint">${t('food.burn.hint')}</div>
  <//>`;
}

/* ---------- БЖУ и клетчатка с целями ---------- */
function MacroTargets({ totals, budget }) {
  const pa = totals.protein_animal || 0, pv = totals.protein_plant || 0, p = totals.protein || 0;
  const row = (label, v, target, mode) => {
    const frac = target > 0 ? Math.min(1, v / target) : 0;
    const bad = target > 0 && (mode === 'max' ? v > target * 1.1 : false);
    return html`<div class="mac"><div class="mh row"><span class="grow">${label}</span><span>${fmtNum(v)}${target ? ' / ' + fmtNum(target) : ''} ${t('unit.g')}</span></div>
      <div class=${'bar mbar' + (bad ? ' over' : '')}><i style=${'width:' + (frac * 100).toFixed(1) + '%'}></i></div></div>`;
  };
  return html`<${Card} title=${t('food.macros.title')} icon="food" color="var(--k-food)">
    ${row(t('food.macro.protein'), p, budget.protein, 'min')}
    ${pa + pv > 0 ? html`<div class="psplit"><span class="pa" style=${'flex:' + pa}></span><span class="pv" style=${'flex:' + pv}></span></div>
      <div class="hint" style="margin-top:4px">${t('food.protein.split', { a: fmtNum(pa), v: fmtNum(pv) })}</div>` : null}
    ${row(t('food.macro.fat'), totals.fat || 0, budget.fat, 'max')}
    ${row(t('food.macro.carbs'), totals.carbs || 0, budget.carbs, 'max')}
    ${row(t('food.macro.fiber'), totals.fiber || 0, budget.fiber, 'min')}
    <div class="hint">${budget.source === 'journal' ? t('food.macros.hintJournal') : t('food.macros.hint')}</div>
  <//>`;
}

/* ---------- неделя ---------- */
function WeekCard({ date, legacy, energy }) {
  const ws = legacy.weekStats(date);
  if (!ws || ws.n < 2) return null;
  const diff = ws.eat - ws.bur;
  return html`<${Card} title=${t('food.week.title', { n: ws.n })} icon="cal" color="var(--k-cal)">
    <div class="kv"><span>${t('food.week.eat')}</span><span>${energy.fmt(ws.eat)} ${energy.unit}</span></div>
    <div class="kv"><span>${t('food.week.burn')}</span><span>${energy.fmt(ws.bur)} ${energy.unit}</span></div>
    <div class="kv tot"><span>${t('food.week.balance')}</span><span>${fmtSigned(diff)} ${energy.unit}</span></div>
    ${ws.w1 != null && ws.w0 != null ? html`<div class="kv"><span>${t('food.week.weight')}</span><span>${fmtNum(ws.w0, 1)} → ${fmtNum(ws.w1, 1)}</span></div>` : null}
  <//>`;
}

/* ---------- правка записи ---------- */
function EntrySheet({ entry, onClose, onCopyMove }) {
  const { repos } = useApp();
  const [d, setD] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!entry) { setD(null); return; }
    const food = entry.ref && entry.ref.kind === 'food' ? repos.food.get(entry.ref.id) : null;
    const serving = entry.servingId && food && (food.servings || []).some((s) => s.id === entry.servingId) ? entry.servingId : '';
    setD({ time: entry.time, servingId: serving, qty: serving ? (entry.quantity ?? 1) : (entry.amount ?? ''), name: entry.name, n: Object.assign({}, entry.nutrients), food, touched: false });
  }, [entry && entry.id]);
  if (!entry || !d) return null;
  const food = d.food;
  const amount = food ? servingAmount(food, d.servingId, num(d.qty)) : num(d.qty);
  /* без продукта: при смене веса нутриенты меняются пропорционально, пока их не правили руками */
  const n = food ? foodNutrients(food, amount)
    : (!d.touched && entry.amount > 0 && amount > 0 && amount !== entry.amount ? roundNutrients(scaleNutrients(entry.nutrients, amount / entry.amount), 2) : d.n);
  async function save() {
    const patch = { time: d.time || entry.time, name: d.name, nutrients: n, amount: amount || null, servingId: food ? d.servingId : '', quantity: food && d.servingId ? num(d.qty) : null };
    await repos.foodEntry.update(entry.id, patch);
    onClose();
  }
  const setN = (k, v) => setD(Object.assign({}, d, { touched: true, n: Object.assign({}, n, { [k]: num(v) == null ? undefined : num(v) }) }));
  return html`<${Sheet} open=${true} onClose=${onClose} title=${entry.name || t('food.quick.name')}>
    <div class="grid2">
      <${Field} label=${t('food.time')}><input type="time" value=${d.time} onInput=${(e) => setD(Object.assign({}, d, { time: e.currentTarget.value }))}/><//>
      ${food ? html`<${Field} label=${d.servingId ? t('food.qty') : t('food.grams')}>
        <input inputmode="decimal" value=${d.qty} onInput=${(e) => setD(Object.assign({}, d, { qty: e.currentTarget.value }))}/><//>` : html`<${Field} label=${t('food.grams')}>
        <input inputmode="decimal" value=${d.qty} onInput=${(e) => setD(Object.assign({}, d, { qty: e.currentTarget.value }))}/><//>`}
    </div>
    ${food && (food.servings || []).length ? html`<div class="chips">
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
      <button class="small danger" onClick=${() => setConfirmDel(true)}>${t('food.delete')}</button>
    </div>
    ${food ? html`<button class="linkbtn" onClick=${() => { onClose(); navigate('/food/item/' + food.id); }}>${t('food.openFood')}</button>` : null}
    ${confirmDel ? html`<${Confirm} text=${t('food.confirmDelete', { count: 1 })} yes=${t('food.delete')} danger=${true} onNo=${() => setConfirmDel(false)} onYes=${async () => { setConfirmDel(false); await repos.foodEntry.remove(entry.id); onClose(); }}/>` : null}
  <//>`;
}

/* ---------- копировать / перенести ---------- */
function CopyMoveSheet({ job, date, onClose, onDone }) {
  const { repos, store } = useApp();
  const [dates, setDates] = useState([]);
  const [time, setTime] = useState('');
  const [extra, setExtra] = useState('');
  useEffect(() => { if (job) { setDates([job.mode === 'copy' ? addDays(date, 1) : date]); setTime(''); setExtra(''); } }, [job]);
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
