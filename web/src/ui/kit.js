/* Строительные блоки экранов. Классы — из web/styles.css (дизайн-система v15–v16). */
import { html, useEffect, useState, useRef, goBack, lockScroll } from './core.js';
import { Icon } from './icons.js';
import { t } from '../i18n/index.js';

/* Экран с большим заголовком; back — путь «назад» (показывает кнопку); navRight — кнопка справа в строке «назад» */
export function Page({ title, icon, color, back, backLabel, right, navRight, children }) {
  return html`<div class="wrap page">
    ${back ? html`<div class="navbar"><button class="back" onClick=${() => goBack(back)}><${Icon} name="left"/>${backLabel || t('common.back')}</button>${navRight || null}</div>` : null}
    <div class="top">
      <h1>${icon ? html`<span class="tbadge" style=${'background:' + color}><${Icon} name=${icon}/></span>` : null}${title}</h1>
      ${right || null}
    </div>
    ${children}
  </div>`;
}

export function Card({ title, icon, color, children, cls }) {
  return html`<div class=${'card pad ' + (cls || '')}>
    ${title ? html`<h2 class="h2i" style=${'--cc:' + (color || 'var(--accent)')}>${icon ? html`<${Icon} name=${icon}/>` : null}<span>${title}</span></h2>` : null}
    ${children}
  </div>`;
}

/* Список строк в стиле настроек iOS */
export function List({ title, children, foot }) {
  return html`${title ? html`<div class="ltitle">${title}</div>` : null}
    <div class="list">${children}</div>
    ${foot ? html`<div class="lfoot">${foot}</div>` : null}`;
}

export function Row({ icon, color, label, sub, value, href, onClick, chevron, disabled, badge }) {
  const go = disabled ? null : (onClick || (href ? () => { location.hash = '#' + href; } : null));
  return html`<button class=${'lrow' + (disabled ? ' off' : '')} onClick=${go} disabled=${disabled} type="button">
    ${icon ? html`<span class="lico" style=${'--cc:' + (color || 'var(--accent)')}><${Icon} name=${icon}/></span>` : null}
    <span class="ltext"><span class="ll">${label}</span>${sub ? html`<span class="ls">${sub}</span>` : null}</span>
    ${badge ? html`<span class="lbadge">${badge}</span>` : null}
    ${value != null ? html`<span class="lv">${value}</span>` : null}
    ${(chevron !== false && (href || onClick)) ? html`<${Icon} name="right" cls="chev"/>` : null}
  </button>`;
}

/* Сегменты: options — [[значение, подпись], …] */
export function Segmented({ value, options, onChange, label }) {
  return html`<div class="segw">
    ${label ? html`<div class="lbl">${label}</div>` : null}
    <div class="pills" role="radiogroup">${options.map(([v, l]) => html`<button type="button" role="radio" aria-checked=${value === v} class=${'pill' + (value === v ? ' on' : '')} onClick=${() => value !== v && onChange(v)}>${l}</button>`)}</div>
  </div>`;
}

export function Toggle({ on, onChange, label, hint }) {
  return html`<div class="togrow">
    <div><b>${label}</b>${hint ? html`<div class="hint" style="margin:2px 0 0">${hint}</div>` : null}</div>
    <button type="button" role="switch" aria-checked=${!!on} aria-label=${label} class=${'sw' + (on ? ' on' : '')} onClick=${() => onChange(!on)}><i></i></button>
  </div>`;
}

export function Field({ label, hint, error, children }) {
  return html`<label class="fld">
    ${label ? html`<span class="lbl">${label}</span>` : null}
    ${children}
    ${error ? html`<span class="ferr">${error}</span>` : hint ? html`<span class="hint">${hint}</span>` : null}
  </label>`;
}

/* Нижняя шторка: закрывается тапом по фону, Esc, крестиком и свайпом вниз за «ручку» или заголовок */
export function Sheet({ open, onClose, title, children }) {
  const [shown, setShown] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const unlock = lockScroll();
    const tm = setTimeout(() => setShown(true), 450);
    return () => { document.removeEventListener('keydown', k); unlock(); clearTimeout(tm); };
  }, [open]);
  if (!open) return null;
  /* перетаскивание: слушаем окно, без захвата указателя — иначе клик по кнопке в заголовке не доходит до кнопки */
  const onDown = (e) => {
    if (e.target.closest('button') || !ref.current) return;
    const el = ref.current;
    const d = { y: e.clientY, t: Date.now(), dy: 0 };
    el.style.transition = 'none';
    const move = (ev) => { d.dy = Math.max(0, ev.clientY - d.y); el.style.transform = 'translate(-50%,' + d.dy + 'px)'; };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      el.style.transition = ''; el.style.transform = '';
      if (d.dy > 100 || (d.dy > 40 && Date.now() - d.t < 300)) onClose();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const handle = { onPointerDown: onDown };
  return html`<div class=${'sheet-bg' + (shown ? '' : ' in')} onClick=${onClose}></div>
    <div ref=${ref} class=${'sheet' + (shown ? '' : ' in')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="grab-zone" ...${handle}><div class="grab"></div></div>
      ${title ? html`<div class="sh-top row" ...${handle}><b class="grow">${title}</b><button class="small icn" aria-label=${t('common.close')} onClick=${onClose}><${Icon} name="close" size=${16}/></button></div>` : null}
      ${children}
    </div>`;
}

/* Число с кнопками − / +: value — число или null; шаг и пределы; onChange(число|null) */
export function Stepper({ value, onChange, step = 1, min = 0, max = Infinity, digits = 1, unit = '', label, placeholder = '', mode = 'decimal', big = false, onEnter = null, inputRef = null }) {
  const [text, setText] = useState(null);
  const fmt = (v) => (v == null ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits).replace('.', ','));
  const parse = (s) => { const v = String(s || '').trim().replace(/\s/g, '').replace(',', '.'); if (v === '') return null; const n = Number(v); return isFinite(n) ? n : null; };
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v * 10 ** digits) / 10 ** digits));
  const bump = (d) => onChange(clamp((value == null ? (placeholder ? parse(placeholder) || 0 : 0) : value) + d));
  return html`<div class=${'stepper2' + (big ? ' big' : '')}>
    <button type="button" class="ghost" aria-label=${label ? label + ' −' : '−'} onClick=${() => bump(-step)}>−</button>
    <label class="st-field"><input ref=${inputRef} inputmode=${mode} enterkeyhint=${onEnter ? 'done' : 'next'} value=${text != null ? text : fmt(value)} placeholder=${placeholder} aria-label=${label}
      onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); e.currentTarget.blur(); onEnter(); } }}
      onFocus=${(e) => { setText(fmt(value)); setTimeout(() => { try { e.target.select(); } catch (x) { /* iOS */ } }, 0); }}
      onInput=${(e) => { setText(e.currentTarget.value); onChange(parse(e.currentTarget.value)); }}
      onBlur=${() => setText(null)}/>${unit ? html`<span>${unit}</span>` : null}</label>
    <button type="button" class="ghost" aria-label=${label ? label + ' +' : '+'} onClick=${() => bump(step)}>+</button>
  </div>`;
}

/* Поле поиска: иконка, очистка, слот справа (например, штрихкод) */
export function SearchBox({ value, onInput, placeholder, autoFocus = false, right = null, onClear = null, inputRef = null, cls = '', onEnter = null }) {
  return html`<div class=${'searchbox ' + cls}>
    <${Icon} name="search"/>
    <input ref=${inputRef} type="search" placeholder=${placeholder || ''} value=${value} onInput=${(e) => onInput(e.currentTarget.value)} enterkeyhint="search" autocomplete="off" autofocus=${autoFocus || null}
      onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); e.currentTarget.blur(); onEnter(e.currentTarget.value); } }}/>
    ${value ? html`<button class="clr" type="button" aria-label=${t('common.clear')} onClick=${() => (onClear ? onClear() : onInput(''))}><${Icon} name="close" size=${14}/></button>` : right}
  </div>`;
}

/* Окно подтверждения */
export function Confirm({ text, yes, onYes, onNo, danger }) {
  return html`<div class="modal in"><div class="box">
    <p>${text}</p>
    <div class="row"><button class="grow" onClick=${onNo}>${t('common.cancel')}</button><button class=${'grow ' + (danger ? 'danger' : 'primary')} onClick=${onYes}>${yes}</button></div>
  </div></div>`;
}

export function Soon({ children }) {
  return html`<span class="soon">${children || t('common.soon')}</span>`;
}
