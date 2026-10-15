/* Строительные блоки экранов. Классы — из web/styles.css (дизайн-система v15–v16). */
import { html, useEffect, useState, goBack } from './core.js';
import { Icon } from './icons.js';
import { t } from '../i18n/index.js';

/* Экран с большим заголовком; back — путь «назад» (показывает кнопку) */
export function Page({ title, icon, color, back, backLabel, right, children }) {
  return html`<div class="wrap page">
    ${back ? html`<div class="navbar"><button class="back" onClick=${() => goBack(back)}><${Icon} name="left"/>${backLabel || t('common.back')}</button></div>` : null}
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

/* Нижняя шторка */
export function Sheet({ open, onClose, title, children }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    const tm = setTimeout(() => setShown(true), 450);
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; clearTimeout(tm); };
  }, [open]);
  if (!open) return null;
  return html`<div class=${'sheet-bg' + (shown ? '' : ' in')} onClick=${onClose}></div>
    <div class=${'sheet' + (shown ? '' : ' in')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="grab"></div>
      ${title ? html`<div class="sh-top row"><b class="grow">${title}</b><button class="small icn" aria-label=${t('common.close')} onClick=${onClose}><${Icon} name="close" size=${16}/></button></div>` : null}
      ${children}
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
