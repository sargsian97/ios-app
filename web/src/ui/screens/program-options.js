/* Варианты программы с пояснениями (значения — из констант расчётов). */
import { html } from '../core.js';
import { Icon } from '../icons.js';
import { t, fmtNum } from '../../i18n/index.js';
import { PROTEIN_G_PER_KG, DIET_TYPES, KETO_CARBS_MAX_G } from '../../domain/calc/constants.js';

export function Opt({ on, title, sub, onClick }) {
  return html`<button class=${'opt' + (on ? ' on' : '')} onClick=${onClick} role="radio" aria-checked=${!!on}>
    <span class="grow"><b>${title}</b>${sub ? html`<small>${sub}</small>` : null}</span>
    <span class="optck">${on ? html`<${Icon} name="check" size=${14}/>` : null}</span>
  </button>`;
}

const DIETS = [['balanced', 'ob.diet.balancedFull'], ['low_fat', 'ob.diet.lowFatFull'], ['low_carb', 'ob.diet.lowCarbFull'], ['keto', 'ob.diet.ketoFull']];
const PROTEIN = [['low', 'ob.protein.low'], ['moderate', 'ob.protein.moderateFull'], ['high', 'ob.protein.high'], ['very_high', 'ob.protein.veryHighFull']];

export function DietOptions({ value, onChange }) {
  return html`<div class="lbl" style="margin-top:14px">${t('ob.diet')}</div><div class="optlist">${DIETS.map(([k, l]) => html`<${Opt} on=${value === k} title=${t(l)}
    sub=${k === 'keto' ? t('ob.diet.ketoSub', { f: Math.round(DIET_TYPES.keto.fat * 100), c: KETO_CARBS_MAX_G }) : t('ob.diet.sub', { f: Math.round(DIET_TYPES[k].fat * 100) })} onClick=${() => onChange(k)}/>`)}</div>`;
}

export function ProteinOptions({ value, onChange }) {
  return html`<div class="lbl" style="margin-top:14px">${t('ob.protein')}</div><div class="optlist">${PROTEIN.map(([k, l]) => html`<${Opt} on=${value === k} title=${t(l)}
    sub=${t('ob.protein.sub', { g: fmtNum(PROTEIN_G_PER_KG.body[k], 1) })} onClick=${() => onChange(k)}/>`)}</div>`;
}
