/* Шторки тела: взвешивание, замеры за день, цель по весу. */
import { html, useApp, useState, useEffect, todayYmd } from '../../core.js';
import { Sheet, Field, Segmented, Confirm } from '../../kit.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { toDisplay, fromDisplay, unitKey } from '../../../domain/units.js';
import { MEASUREMENTS } from '../../../data/models/body.js';
import { latestMeasure } from '../../../domain/body.js';
import { measureLabel } from './labels.js';

function num(v) { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

/* Взвешивание: новое или правка (entry) */
export function WeighSheet({ open, entry, onClose }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (!open) { setD(null); return; }
    setErr('');
    setD(entry ? { date: entry.date, time: entry.time || '', w: fmtNum(toDisplay('weight', entry.weightKg, units), 2).replace(/\s/g, ''), fat: entry.bodyFatPct == null ? '' : String(entry.bodyFatPct) }
      : { date: todayYmd(), time: nowHM(), w: '', fat: '' });
  }, [open, entry && entry.id]);
  if (!open || !d) return null;
  async function save() {
    const kg = fromDisplay('weight', d.w, units);
    if (!(kg >= 20 && kg <= 400)) { setErr(t('body.err.weight')); return; }
    const fat = num(d.fat);
    if (fat != null && !(fat >= 2 && fat <= 70)) { setErr(t('body.err.fat')); return; }
    const data = { date: d.date, time: d.time || null, weightKg: Math.round(kg * 100) / 100, bodyFatPct: fat, source: entry ? entry.source : 'manual' };
    if (entry) await repos.scaleEntry.update(entry.id, data); else await repos.scaleEntry.create(data);
    onClose();
  }
  return html`<${Sheet} open=${true} onClose=${onClose} title=${entry ? t('body.weighEdit') : t('body.weighIn')}>
    <${Field} label=${t('body.weightIn', { u: t(unitKey('weight', units)) })} error=${err}>
      <input class="bigin" inputmode="decimal" value=${d.w} placeholder="0,0" onInput=${(e) => setD(Object.assign({}, d, { w: e.currentTarget.value }))}/>
    <//>
    <div class="grid2" style="margin-top:12px">
      <${Field} label=${t('body.date')}><input type="date" value=${d.date} max=${todayYmd()} onChange=${(e) => setD(Object.assign({}, d, { date: e.currentTarget.value || d.date }))}/><//>
      <${Field} label=${t('body.time')}><input type="time" value=${d.time} onInput=${(e) => setD(Object.assign({}, d, { time: e.currentTarget.value }))}/><//>
    </div>
    <div style="margin-top:12px"><${Field} label=${t('body.fatPct')} hint=${t('body.fatPctHint')}><input inputmode="decimal" value=${d.fat} onInput=${(e) => setD(Object.assign({}, d, { fat: e.currentTarget.value }))}/><//></div>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
    ${entry ? html`<button class="danger" style="width:100%;margin-top:8px" onClick=${() => setDel(true)}>${t('food.delete')}</button>` : null}
    ${del ? html`<${Confirm} text=${t('body.confirmDeleteWeigh')} yes=${t('food.delete')} danger=${true} onNo=${() => setDel(false)} onYes=${async () => { setDel(false); await repos.scaleEntry.remove(entry.id); onClose(); }}/>` : null}
  <//>`;
}

/* Замеры за день: обхваты, % жира, заметка */
export function MeasureSheet({ open, date, onClose }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (!open) { setD(null); return; }
    const cur = repos.bodyEntry.get(date);
    const m = {};
    MEASUREMENTS.forEach((k) => { const v = cur && cur.measurements[k]; m[k] = v == null ? '' : fmtNum(toDisplay('length', v, units), 1).replace(/\s/g, ''); });
    setErr('');
    setD({ date, m, fat: cur && cur.bodyFatPct != null ? String(cur.bodyFatPct) : '', note: (cur && cur.note) || '', exists: !!cur });
  }, [open, date]);
  if (!open || !d) return null;
  const all = repos.bodyEntry.list();
  const ph = (k) => { const v = latestMeasure(all.filter((e) => e.date < d.date), k, d.date); return v ? fmtNum(toDisplay('length', v.value, units), 1) : ''; };
  async function save() {
    const m = {};
    for (const k of MEASUREMENTS) {
      const v = num(d.m[k]);
      if (v == null) continue;
      const cm = fromDisplay('length', v, units);
      if (!(cm >= 1 && cm <= 400)) { setErr(t('body.err.measure', { m: measureLabel(k) })); return; }
      m[k] = Math.round(cm * 10) / 10;
    }
    const fat = num(d.fat);
    if (fat != null && !(fat >= 2 && fat <= 70)) { setErr(t('body.err.fat')); return; }
    if (!Object.keys(m).length && fat == null && !d.note.trim()) { setErr(t('body.err.empty')); return; }
    await repos.bodyEntry.save({ id: d.date, date: d.date, measurements: m, bodyFatPct: fat, note: d.note.trim(), source: 'manual' });
    onClose();
  }
  const setM = (k, v) => setD(Object.assign({}, d, { m: Object.assign({}, d.m, { [k]: v }) }));
  const lu = t(unitKey('length', units));
  const field = (k) => html`<${Field} label=${measureLabel(k) + ', ' + lu}><input inputmode="decimal" placeholder=${ph(k)} value=${d.m[k]} onInput=${(e) => setM(k, e.currentTarget.value)}/><//>`;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('body.measuresFor')}>
    <${Field} label=${t('body.date')}><input type="date" value=${d.date} max=${todayYmd()} onChange=${(e) => setD(Object.assign({}, d, { date: e.currentTarget.value || d.date }))}/><//>
    <div class="grid2" style="margin-top:12px">${['neck', 'shoulders', 'chest', 'waist', 'hips'].map(field)}<${Field} label=${t('body.fatPct')}><input inputmode="decimal" value=${d.fat} onInput=${(e) => setD(Object.assign({}, d, { fat: e.currentTarget.value }))}/><//></div>
    <div class="ltitle" style="margin-left:0">${t('body.limbs')}</div>
    <div class="grid2">${['bicepsL', 'bicepsR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'calfL', 'calfR'].map(field)}</div>
    <div style="margin-top:12px"><${Field} label=${t('body.note')}><input value=${d.note} placeholder=${t('body.note.ph')} onInput=${(e) => setD(Object.assign({}, d, { note: e.currentTarget.value }))}/><//></div>
    <div class="hint">${t('body.measureHint')}</div>
    ${err ? html`<div class="banner warnb" style="margin-top:10px">${err}</div>` : null}
    <button class="primary" style="width:100%;margin-top:12px" onClick=${save}>${t('common.save')}</button>
    ${d.exists ? html`<button class="danger" style="width:100%;margin-top:8px" onClick=${() => setDel(true)}>${t('body.deleteMeasures')}</button>` : null}
    ${del ? html`<${Confirm} text=${t('body.confirmDeleteMeasures')} yes=${t('food.delete')} danger=${true} onNo=${() => setDel(false)} onYes=${async () => { setDel(false); await repos.bodyEntry.remove(d.date); onClose(); }}/>` : null}
  <//>`;
}

/* Цель по весу (подробная цель с темпом и программой — этап 5) */
export function GoalSheet({ open, trendKg, onClose }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) { setD(null); return; }
    const g = repos.goal.active();
    setErr('');
    setD({ type: g ? g.type : 'lose', target: g && g.targetWeightKg ? fmtNum(toDisplay('weight', g.targetWeightKg, units), 1).replace(/\s/g, '') : '' });
  }, [open]);
  if (!open || !d) return null;
  async function save() {
    const kg = d.type === 'maintain' && !d.target ? trendKg : fromDisplay('weight', d.target, units);
    if (!(kg >= 20 && kg <= 400)) { setErr(t('body.err.weight')); return; }
    const cur = repos.goal.active();
    const data = { type: d.type, targetWeightKg: Math.round(kg * 10) / 10, startWeightKg: trendKg ? Math.round(trendKg * 10) / 10 : null, startDate: todayYmd(), status: 'active' };
    if (cur) await repos.goal.update(cur.id, data); else await repos.goal.create(data);
    onClose();
  }
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('body.goalTitle')}>
    <${Segmented} value=${d.type} onChange=${(v) => setD(Object.assign({}, d, { type: v }))} options=${[['lose', t('goal.lose')], ['maintain', t('goal.maintain')], ['gain', t('goal.gain')]]}/>
    <div style="margin-top:12px"><${Field} label=${t('body.targetWeight', { u: t(unitKey('weight', units)) })} error=${err}>
      <input class="bigin" inputmode="decimal" value=${d.target} placeholder=${trendKg ? fmtNum(toDisplay('weight', trendKg, units), 1) : ''} onInput=${(e) => setD(Object.assign({}, d, { target: e.currentTarget.value }))}/>
    <//></div>
    <div class="hint">${t('body.goalHint')}</div>
    <button class="primary" style="width:100%;margin-top:14px" onClick=${save}>${t('common.save')}</button>
  <//>`;
}
