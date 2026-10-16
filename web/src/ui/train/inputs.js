/* Поля ввода тренировки: число с запятой (текст хранится, пока поле в фокусе), шкала RIR, настройки подхода. */
import { html, useState } from '../core.js';
import { Sheet } from '../kit.js';
import { t, fmtNum } from '../../i18n/index.js';
import { SET_TYPES } from '../../data/models/workout.js';
import { setTypeLabel } from './catalog.js';

export function parseNum(s) {
  const v = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/* Число: value — число или null; onCommit(число|null) на каждый ввод */
export function NumIn({ value, onCommit, placeholder, mode = 'decimal', label, digits = 2, cls }) {
  const [text, setText] = useState(null);
  const shown = text != null ? text : value == null ? '' : fmtNum(Math.round(value * 10 ** digits) / 10 ** digits, digits).replace(/\s/g, '');
  return html`<input class=${cls || ''} inputmode=${mode} value=${shown} placeholder=${placeholder == null ? '' : placeholder} aria-label=${label}
    onFocus=${(e) => { setText(shown); setTimeout(() => { try { e.target.select(); } catch (x) { /* iOS */ } }, 0); }}
    onInput=${(e) => { const v = e.currentTarget.value; setText(v); onCommit(parseNum(v)); }}
    onBlur=${() => setText(null)}/>`;
}

const RIR = [[0, 'train.rir.0'], [1, 'train.rir.1'], [2, 'train.rir.2'], [3, 'train.rir.3'], [4, 'train.rir.4'], [5, 'train.rir.5']];

/* Шкала RIR: сколько повторов осталось в запасе */
export function RirSheet({ open, value, target, onPick, onClose }) {
  return html`<${Sheet} open=${open} onClose=${onClose} title=${t('train.rir.title')}>
    <p class="hint" style="margin:0 0 10px">${t('train.rir.hint')}</p>
    <div class="list">${RIR.map(([v, k]) => html`<button class=${'lrow' + (value === v ? ' sel' : '')} type="button" onClick=${() => onPick(v)}>
      <span class="wk-rirn">${v === 5 ? '5+' : v}</span><span class="ltext"><span class="ll">${t(k)}</span>${target === v ? html`<span class="ls">${t('train.rir.target')}</span>` : null}</span>
      ${value === v ? html`<span class="lv">✓</span>` : null}</button>`)}</div>
    <button style="width:100%;margin-top:10px" onClick=${() => onPick(null)}>${t('train.rir.clear')}</button>
  <//>`;
}

/* Настройки подхода: тип, сторона, частичные повторы, удаление */
export function SetSheet({ open, set, onChange, onDelete, onClose }) {
  if (!open || !set) return null;
  return html`<${Sheet} open=${open} onClose=${onClose} title=${t('train.set.title')}>
    <div class="ltitle">${t('train.set.type')}</div>
    <div class="list">${SET_TYPES.map((k) => html`<button class=${'lrow' + (set.type === k ? ' sel' : '')} type="button" onClick=${() => onChange({ type: k })}>
      <span class="ltext"><span class="ll">${setTypeLabel(k)}</span></span>${set.type === k ? html`<span class="lv">✓</span>` : null}</button>`)}</div>
    <div class="ltitle">${t('train.set.side')}</div>
    <div class="pills" role="radiogroup">${['both', 'left', 'right'].map((k) => html`<button role="radio" aria-checked=${(set.side || 'both') === k} class=${'pill' + ((set.side || 'both') === k ? ' on' : '')} onClick=${() => onChange({ side: k })}>${k === 'both' ? t('side.both') : k === 'left' ? t('side.left') : t('side.right')}</button>`)}</div>
    <div class="grid2" style="margin-top:12px">
      <label class="fld"><span class="lbl">${t('train.set.partials')}</span><${NumIn} mode="numeric" value=${set.partials} onCommit=${(v) => onChange({ partials: v == null ? null : Math.max(0, Math.round(v)) })} label=${t('train.set.partials')}/></label>
      <label class="fld"><span class="lbl">${t('train.set.perSide')}</span><button class=${'sw' + (set.perSide ? ' on' : '')} role="switch" aria-checked=${!!set.perSide} aria-label=${t('train.set.perSide')} onClick=${() => onChange({ perSide: !set.perSide })}><i></i></button></label>
    </div>
    <button class="danger" style="width:100%;margin-top:14px" onClick=${onDelete}>${t('train.set.delete')}</button>
  <//>`;
}
