/* Карта мышц: своя упрощённая схема тела спереди и сзади. Основные мышцы — ярко, вторичные — бледнее. */
import { html } from '../core.js';
import { t } from '../../i18n/index.js';
import { muscleLabel } from './catalog.js';

const E = (cx, cy, rx, ry) => ({ e: [cx, cy, rx, ry] });
const R = (x, y, w, h, r = 3) => ({ r: [x, y, w, h, r] });
const P = (d) => ({ p: d });
const mirror = (s) => (s.e ? E(100 - s.e[0], s.e[1], s.e[2], s.e[3]) : s.r ? R(100 - s.r[0] - s.r[2], s.r[1], s.r[2], s.r[3], s.r[4]) : s);

/* Нейтральные части: голова, кисти, колени, стопы */
const BASE = [E(50, 15, 9, 10.5), E(21, 96, 3.6, 5), E(79, 96, 3.6, 5), E(41, 134, 4.5, 4), E(59, 134, 4.5, 4), E(41, 182, 5, 3), E(59, 182, 5, 3)];

const pair = (s) => [s, mirror(s)];
const FRONT = {
  neck: [R(45, 25, 10, 7, 2)],
  traps: [P('M45 29 L37 34 L44 35 Z'), P('M55 29 L63 34 L56 35 Z')],
  front_delts: pair(E(32, 40, 6, 7)),
  side_delts: pair(E(25.5, 42, 3, 6.5)),
  chest: [P('M37 36 Q43 34 49 36 L49 51 Q42 54 36 49 Z'), P('M63 36 Q57 34 51 36 L51 51 Q58 54 64 49 Z')],
  biceps: pair(E(27, 58, 4.5, 9)),
  forearms: pair(E(23.5, 79, 3.8, 11)),
  abs: [R(43.5, 54, 13, 29, 4)],
  obliques: pair(R(36.5, 56, 6, 24, 3)),
  abductors: pair(E(35, 92, 3.8, 7)),
  adductors: pair(E(46.5, 105, 2.8, 11)),
  quads: pair(E(40.5, 113, 6.8, 18)),
  calves: pair(E(41, 155, 4.5, 15))
};
const BACK = {
  neck: [R(45, 25, 10, 6, 2)],
  traps: [P('M50 26 L36 35 L50 45 L64 35 Z')],
  rear_delts: pair(E(31.5, 41, 6, 6.5)),
  upper_back: [P('M41 45 L50 47 L59 45 L57 60 L43 60 Z')],
  lats: [P('M36.5 45 L41 47 L43 63 L44 73 L37.5 64 Z'), P('M63.5 45 L59 47 L57 63 L56 73 L62.5 64 Z')],
  triceps: pair(E(27, 58, 4.5, 9)),
  forearms: pair(E(23.5, 79, 3.8, 11)),
  lower_back: [R(43.5, 63, 13, 17, 4)],
  glutes: pair(E(43, 92, 7.5, 8)),
  hamstrings: pair(E(42, 117, 6.5, 16)),
  calves: pair(E(42, 152, 5.5, 13))
};

function shape(s, cls, key) {
  if (s.e) return html`<ellipse key=${key} class=${cls} cx=${s.e[0]} cy=${s.e[1]} rx=${s.e[2]} ry=${s.e[3]}/>`;
  if (s.r) return html`<rect key=${key} class=${cls} x=${s.r[0]} y=${s.r[1]} width=${s.r[2]} height=${s.r[3]} rx=${s.r[4]}/>`;
  return html`<path key=${key} class=${cls} d=${s.p}/>`;
}

function Figure({ map, dx, primary, secondary }) {
  return html`<g transform=${'translate(' + dx + ' 0)'}>
    ${BASE.map((s, i) => shape(s, 'mm-base', 'b' + i))}
    ${Object.keys(map).flatMap((m) => map[m].map((s, i) => shape(s, primary.includes(m) ? 'mm-p' : secondary.includes(m) ? 'mm-s' : 'mm-i', m + i)))}
  </g>`;
}

export function MuscleMap({ primary = [], secondary = [] }) {
  const sec = secondary.filter((m) => !primary.includes(m));
  const label = t('train.map.aria', { p: primary.map(muscleLabel).join(', ') || '—', s: sec.map(muscleLabel).join(', ') || '—' });
  return html`<figure class="mm">
    <svg viewBox="0 0 200 190" role="img" aria-label=${label}>
      <${Figure} map=${FRONT} dx=${0} primary=${primary} secondary=${sec}/>
      <${Figure} map=${BACK} dx=${100} primary=${primary} secondary=${sec}/>
    </svg>
    <figcaption><span><i class="mm-p"></i>${t('train.map.primary')}</span><span><i class="mm-s"></i>${t('train.map.secondary')}</span><span class="mm-fb">${t('train.map.front')} · ${t('train.map.back')}</span></figcaption>
  </figure>`;
}
