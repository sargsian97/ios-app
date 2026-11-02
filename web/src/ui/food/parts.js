/* Общие детали экранов питания: даты, числа, строки записей, свайп-строка, бюджет дня. */
import { html, useApp, useRef, todayYmd } from '../core.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtDate } from '../../i18n/index.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { addDays } from '../../data/journal.js';

export { addDays };

export const MEALS = [['b', 'food.meal.b', '#FFC800'], ['l', 'food.meal.l', '#FF8A00'], ['d', 'food.meal.d', '#C77DFF'], ['s', 'food.meal.s', '#FF375F']];
export const MEAL_KEY = { b: 'food.meal.b', l: 'food.meal.l', d: 'food.meal.d', s: 'food.meal.s' };

/* Энергия в единицах пользователя */
export function useEnergy() {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  return {
    units,
    unit: t(unitKey('energy', units)),
    fmt: (kcal) => fmtNum(toDisplay('energy', kcal || 0, units))
  };
}

export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return isFinite(n) ? n : null;
}

export function nowTime(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0');
}

/* Подпись дня: «Сегодня», «Вчера», «Завтра» или день недели */
export function dayLabel(date) {
  const today = todayYmd();
  if (date === today) return t('food.today');
  if (date === addDays(today, -1)) return t('food.yesterday');
  if (date === addDays(today, 1)) return t('food.tomorrow');
  return fmtDate(date, 'long');
}

export function DateNav({ date, onChange }) {
  const sub = dayLabel(date), long = fmtDate(date, 'long');
  return html`<div class="dnav row">
    <button class="ghost" aria-label=${t('food.prevDay')} onClick=${() => onChange(addDays(date, -1))}><${Icon} name="left"/></button>
    <label class="dmid grow">
      <span class="dm-d">${long}</span>${sub !== long ? html`<span class="hsub">${sub}</span>` : null}
      <input type="date" value=${date} aria-label=${t('food.pickDate')} onChange=${(e) => e.currentTarget.value && onChange(e.currentTarget.value)}/>
    </label>
    <button class="ghost" aria-label=${t('food.nextDay')} onClick=${() => onChange(addDays(date, 1))}><${Icon} name="right"/></button>
  </div>`;
}

/* Короткая строка БЖУ записи */
export function macroLine(n) {
  return t('food.macroLine', { p: fmtNum(n.protein || 0, 1), f: fmtNum(n.fat || 0, 1), c: fmtNum(n.carbs || 0, 1) });
}

export function amountText(e) {
  if (!e.amount) return '';
  return fmtNum(e.amount) + ' ' + (e.unit === 'ml' ? t('unit.ml') : t('unit.g'));
}

export function EntryRow({ e, energy, selecting, selected, onTap }) {
  const n = e.nutrients || {};
  return html`<button class=${'fe row erow' + (selected ? ' sel' : '')} onClick=${onTap}>
    ${selecting ? html`<span class=${'ck' + (selected ? ' on' : '')}>${selected ? html`<${Icon} name="check" size=${14}/>` : null}</span>` : null}
    <span class="grow etext">
      <span class="fn">${e.name || t('food.quick.name')}</span>
      <span class="fm">${e.amount ? amountText(e) + ' · ' : ''}${macroLine(n)}</span>
    </span>
    <span class="fk">${energy.fmt(n.kcal)}</span>
  </button>`;
}

/* Строка с жестами: свайп влево — onDelete, долгое нажатие — onLong; обычный тап проходит к содержимому.
   Пока идёт жест, клик по содержимому гасится. */
export function SwipeRow({ onDelete, onLong, disabled = false, children }) {
  const el = useRef(null);
  const st = useRef(null);
  const swallow = useRef(false);
  const reset = () => { if (el.current) { el.current.style.transition = ''; el.current.style.transform = ''; } };
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const s = { x: e.clientX, y: e.clientY, dx: 0, mode: null, timer: null };
    if (onLong) s.timer = setTimeout(() => { s.mode = 'long'; swallow.current = true; onLong(); }, 500);
    st.current = s;
  };
  const move = (e) => {
    const s = st.current;
    if (!s || s.mode === 'long' || s.mode === 'scroll') return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      clearTimeout(s.timer);
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
      if (s.mode === 'swipe' && el.current) el.current.style.transition = 'none';
    }
    if (s.mode === 'swipe') {
      s.dx = Math.min(0, dx);
      if (el.current) el.current.style.transform = 'translateX(' + s.dx + 'px)';
    }
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.mode === 'swipe') {
      swallow.current = true;
      if (s.dx < -80 && onDelete) {
        if (el.current) { el.current.style.transition = 'transform .15s ease-in'; el.current.style.transform = 'translateX(-110%)'; }
        setTimeout(() => { reset(); onDelete(); }, 150);
      } else reset();
    }
    setTimeout(() => { swallow.current = false; }, 50);
  };
  const click = (e) => { if (swallow.current) { e.stopPropagation(); e.preventDefault(); } };
  return html`<div class="swipe" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onClickCapture=${click} onContextMenu=${(e) => { if (onLong) e.preventDefault(); }}>
    ${onDelete ? html`<div class="swipe-del" aria-hidden="true">${t('food.delete')}</div>` : null}
    <div class="swipe-in" ref=${el}>${children}</div>
  </div>`;
}

/* Нутриенты на 100 г / порцию для строки поиска */
export function per100Text(n, energy) {
  return energy.fmt(n.kcal) + ' ' + energy.unit + ' · ' + macroLine(n);
}

export function Spinner() { return html`<span class="spin" aria-hidden="true"></span>`; }
