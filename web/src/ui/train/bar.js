/* Превью грифа: блины на сторону (вторая зеркальна) или на одну сторону, цвет и размер — по весу блина. */
import { html } from '../core.js';
import { t, fmtNum } from '../../i18n/index.js';

const W = 340, H = 120, MID = H / 2;

export function BarPreview({ items = [], mode = 'per_side', unit = '' }) {
  const thick = (p) => (p.bumper ? 13 : p.weight >= 10 ? 10 : p.weight >= 2.5 ? 7 : 5);
  const height = (p) => Math.min(104, 26 + 78 * Math.sqrt(Math.min(p.weight, 25) / 25));
  const two = mode === 'per_side';
  const grip = two ? 96 : 40;
  const collar = 8;
  const room = two ? (W - grip) / 2 - collar - 14 : W - grip - collar - 14;
  const need = items.reduce((a, p) => a + thick(p) + 1.5, 0);
  const k = need > room ? room / need : 1;
  const side = (dir) => {
    const x0 = two ? W / 2 + dir * (grip / 2 + collar) : grip + collar;
    let x = x0;
    return items.map((p, i) => {
      const w = thick(p) * k, h = height(p);
      const rx = dir > 0 ? x : x - w;
      x += dir * (w + 1.5 * k);
      return html`<rect key=${dir + ':' + i} x=${rx} y=${MID - h / 2} width=${w} height=${h} rx=${Math.min(2.5, w / 3)} fill=${p.color} class="bp-plate"/>`;
    });
  };
  const label = (two ? t('plates.aria.per') : t('plates.aria.one')) + ': ' + (items.length ? items.map((p) => fmtNum(p.label != null ? p.label : p.weight, 2) + (p.unit === 'lb' ? ' ' + t('unit.lb') : '')).join(', ') : t('plates.aria.empty'));
  return html`<svg class="bp" viewBox=${'0 0 ' + W + ' ' + H} role="img" aria-label=${label}>
    <rect x="4" y=${MID - 3} width=${W - 8} height="6" rx="3" class="bp-shaft"/>
    ${two ? html`<rect x=${W / 2 - grip / 2} y=${MID - 4} width=${grip} height="8" rx="3" class="bp-grip"/>
      <rect x=${W / 2 - grip / 2 - collar} y=${MID - 9} width=${collar - 2} height="18" rx="2" class="bp-collar"/>
      <rect x=${W / 2 + grip / 2 + 2} y=${MID - 9} width=${collar - 2} height="18" rx="2" class="bp-collar"/>`
      : html`<rect x=${grip} y=${MID - 9} width=${collar - 2} height="18" rx="2" class="bp-collar"/>`}
    ${side(1)}
    ${two ? side(-1) : null}
  </svg>`;
}
