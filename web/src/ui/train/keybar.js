/* Панель над клавиатурой в тренировке: шаг веса −/+, повторы −/+, «Далее» к следующему полю, «Готово».
   Поле регистрируется при фокусе (NumIn), панель держится над клавиатурой по visualViewport.
   Кнопки не отбирают фокус у поля (preventDefault на pointerdown). */
import { html, useEffect, useState } from '../core.js';
import { t, fmtNum } from '../../i18n/index.js';

let active = null;
const subs = new Set();
let blurTimer = null;
function emit() { subs.forEach((f) => f(active)); }

/* field: { input, kind: 'weight' | 'reps' | 'other', step, stepLabel, onStep(dir), onNext } */
export function setActiveField(field) { clearTimeout(blurTimer); active = field; emit(); }
export function clearActiveField(input) {
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => { if (!active || active.input === input) { active = null; emit(); } }, 120);
}

function useActiveField() {
  const [f, setF] = useState(active);
  useEffect(() => { subs.add(setF); return () => subs.delete(setF); }, []);
  return f;
}

/* Сдвиг панели над экранной клавиатурой (iOS не меняет layout viewport) */
function useKeyboardInset(on) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!on || !window.visualViewport) { setInset(0); return; }
    const vv = window.visualViewport;
    const upd = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    upd();
    vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd);
    return () => { vv.removeEventListener('resize', upd); vv.removeEventListener('scroll', upd); };
  }, [on]);
  return inset;
}

export function KeyBar() {
  const f = useActiveField();
  const inset = useKeyboardInset(!!f);
  if (!f) return null;
  const hold = { onPointerDown: (e) => e.preventDefault(), onMouseDown: (e) => e.preventDefault() };
  const stepLabel = f.kind === 'weight' ? (f.stepLabel || fmtNum(f.step || 2.5, 2)) : '1';
  return html`<div class="keybar" style=${'bottom:' + inset + 'px'} role="toolbar" aria-label=${t('train.keybar')}>
    ${f.kind === 'weight' || f.kind === 'reps' ? html`
      <button type="button" ...${hold} onClick=${() => f.onStep(-1)}>−${stepLabel}</button>
      <button type="button" ...${hold} onClick=${() => f.onStep(1)}>+${stepLabel}</button>` : null}
    ${f.onPlates ? html`<button type="button" ...${hold} onClick=${f.onPlates}>${t('train.ex.plates')}</button>` : null}
    <span class="grow"></span>
    ${f.onNext ? html`<button type="button" class="go" ...${hold} onClick=${f.onNext}>${t('train.keybar.next')}</button>` : null}
    <button type="button" class="done" ...${hold} onClick=${() => { try { f.input.blur(); } catch (e) { /* уже нет */ } }}>${t('common.done')}</button>
  </div>`;
}
