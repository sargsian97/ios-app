/* Общие детали экранов питания: даты, числа, кольцо калорий, строки записей, бюджет дня. */
import { html, useApp, todayYmd } from '../core.js';
import { Icon } from '../icons.js';
import { t, fmtNum, fmtDate } from '../../i18n/index.js';
import { toDisplay, unitKey } from '../../domain/units.js';
import { addDays } from '../../data/legacy.js';

export { addDays };

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
  return html`<div class="dnav row">
    <button class="ghost" aria-label=${t('food.prevDay')} onClick=${() => onChange(addDays(date, -1))}>‹</button>
    <div class="dmid grow">
      <input type="date" value=${date} aria-label=${t('food.pickDate')} onChange=${(e) => e.currentTarget.value && onChange(e.currentTarget.value)}/>
      <div class="hsub">${dayLabel(date)}</div>
    </div>
    <button class="ghost" aria-label=${t('food.nextDay')} onClick=${() => onChange(addDays(date, 1))}>›</button>
  </div>`;
}

/* Кольцо: съедено из цели */
export function Ring({ eaten, target, energy }) {
  const left = target - eaten, over = left < 0;
  const frac = target > 0 ? Math.min(1, eaten / target) : 0;
  const pct = target > 0 ? Math.round(eaten / target * 100) : 0;
  const RC = 2 * Math.PI * 88;
  return html`<div class="ring">
    <svg viewBox="0 0 220 220" width="100%" role="img" aria-label=${t('food.ring.aria', { e: energy.fmt(eaten), g: energy.fmt(target) })}>
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3B30"/><stop offset="1" stop-color="#FF7A70"/></linearGradient></defs>
      <circle class="rtrack" cx="110" cy="110" r="88"/>
      ${frac > 0 ? html`<circle class=${'rarc' + (over ? ' over' : '')} cx="110" cy="110" r="88" stroke-dasharray=${(RC * frac).toFixed(1) + ' ' + RC.toFixed(1)} transform="rotate(-90 110 110)"/>` : null}
    </svg>
    <div class="rc">
      <div class="rl">${over ? t('food.over') : t('food.left')}</div>
      <div class=${'rn' + (over ? ' over' : '')}>${energy.fmt(Math.abs(left))}</div>
      <div class="ru">${energy.unit}</div>
      <div class="rp">${t('food.pctOfGoal', { p: pct })}</div>
    </div>
  </div>`;
}

/* Плитки БЖУ и клетчатки: значение и цель */
export function MacroStrip({ totals, targets }) {
  const M = [['m1', 'protein', 'food.macro.p'], ['m2', 'fat', 'food.macro.f'], ['m3', 'carbs', 'food.macro.c'], ['m4', 'fiber', 'food.macro.fib']];
  return html`<div class="mstrip">${M.map(([cls, k, label]) => html`<div class=${cls}>
    <b>${fmtNum(totals[k] || 0)}</b><span>${t(label)}</span>${targets && targets[k] ? html`<em>${t('food.ofTarget', { v: fmtNum(targets[k]) })}</em>` : null}
  </div>`)}</div>`;
}

/* Короткая строка БЖУ записи */
export function macroLine(n) {
  return t('food.macroLine', { p: fmtNum(n.protein || 0, 1), f: fmtNum(n.fat || 0, 1), c: fmtNum(n.carbs || 0, 1) });
}

export function EntryRow({ e, energy, selecting, selected, onTap }) {
  const n = e.nutrients || {};
  return html`<button class=${'fe row erow' + (selected ? ' sel' : '')} onClick=${onTap}>
    ${selecting ? html`<span class=${'ck' + (selected ? ' on' : '')}>${selected ? html`<${Icon} name="check" size=${14}/>` : null}</span>` : null}
    <span class="grow etext">
      <span class="fn">${e.name || t('food.quick.name')}${e.amount ? html` <small>· ${fmtNum(e.amount)} ${e.unit === 'ml' ? t('unit.ml') : t('unit.g')}</small>` : null}</span>
      <span class="fm">${macroLine(n)}</span>
    </span>
    <span class="fk">${energy.fmt(n.kcal)}</span>
  </button>`;
}

/* Нутриенты на 100 г / порцию для строки поиска */
export function per100Text(n, energy) {
  return energy.fmt(n.kcal) + ' ' + energy.unit + ' · ' + macroLine(n);
}

export function Spinner() { return html`<span class="spin" aria-hidden="true"></span>`; }
