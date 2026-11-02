/* Маленькая графика экранов (Liquid Glass Pro): дуга остатка, спарклайн, столбики, сегменты.
   Только отрисовка: цифры приходят готовыми из расчётов; цвета — CSS-переменные (liquid-glass-pro.css). */
import { html, useMemo } from './core.js';

let seq = 0;
function useUid(prefix) { return useMemo(() => prefix + (++seq).toString(36), []); }
const f1 = (n) => Math.round(n * 10) / 10;

/* Дуга на 270°: share 0…1 — заполнено; over — цвет перебора; children — подпись в центре */
export function Arc({ share = 0, over = false, size = 150, width = 13, label = '', children }) {
  const id = useUid('arc');
  const c = size / 2, r = f1(c - width / 2 - 5);
  const C = 2 * Math.PI * r, L = C * 0.75;
  const fill = f1(Math.max(0, Math.min(1, share || 0)) * L);
  const rot = 'rotate(135 ' + c + ' ' + c + ')';
  const dash = (n) => n + ' ' + f1(C);
  return html`<div class=${'arc' + (over ? ' over' : '')} style=${'width:' + size + 'px;height:' + size + 'px'} role="img" aria-label=${label}>
    <svg width=${size} height=${size} viewBox=${'0 0 ' + size + ' ' + size} aria-hidden="true">
      <defs>
        <linearGradient id=${id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="arc-s1"/><stop offset=".55" class="arc-s2"/><stop offset="1" class="arc-s3"/></linearGradient>
        <filter id=${id + 'g'} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <circle class="arc-tr" cx=${c} cy=${c} r=${r} fill="none" stroke-width=${width} stroke-linecap="round" stroke-dasharray=${dash(f1(L))} transform=${rot}/>
      ${fill > 0 ? html`<circle class="arc-glow" cx=${c} cy=${c} r=${r} fill="none" stroke=${'url(#' + id + ')'} stroke-width=${width} stroke-linecap="round" stroke-dasharray=${dash(fill)} transform=${rot} filter=${'url(#' + id + 'g)'} style=${'--len:' + fill}/>
      <circle class="arc-v" cx=${c} cy=${c} r=${r} fill="none" stroke=${'url(#' + id + ')'} stroke-width=${width} stroke-linecap="round" stroke-dasharray=${dash(fill)} transform=${rot} style=${'--len:' + fill}/>` : null}
    </svg>
    <div class="arc-c">${children}</div>
  </div>`;
}

/* Спарклайн: line — точки линии [{ x: 0…1, y }], dots — отдельные точки (взвешивания); последняя точка линии — с ободком */
export function Spark({ line = [], dots = [], w = 141, h = 34 }) {
  const id = useUid('sp');
  if (line.length < 2) return null;
  const ys = line.concat(dots).map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (x) => f1(3 + x * (w - 7)), Y = (y) => f1(4 + (1 - (y - lo) / span) * (h - 8));
  const d = line.map((p, i) => (i ? 'L' : 'M') + X(p.x) + ' ' + Y(p.y)).join('');
  const last = line[line.length - 1];
  return html`<svg class="spark" viewBox=${'0 0 ' + w + ' ' + h} aria-hidden="true">
    <defs><linearGradient id=${id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sp-a"/><stop offset="1" class="sp-b"/></linearGradient></defs>
    <path d=${d + 'L' + X(last.x) + ' ' + h + 'L' + X(line[0].x) + ' ' + h + 'Z'} fill=${'url(#' + id + ')'}/>
    <path class="sp-l" d=${d}/>
    ${dots.map((p) => html`<circle class="sp-d" cx=${X(p.x)} cy=${Y(p.y)} r="1.8"/>`)}
    <circle class="sp-e" cx=${X(last.x)} cy=${Y(last.y)} r="3.4"/>
  </svg>`;
}

/* Кольцо доли: share 0…1, в центре — подпись (проценты); цвет — --rc */
export function Ring({ share = 0, size = 58, width = 6, children }) {
  const c = size / 2, r = c - width / 2 - 1;
  const C = f1(2 * Math.PI * r);
  const v = f1(Math.max(0, Math.min(1, share || 0)) * C);
  return html`<span class="ring" style=${'width:' + size + 'px;height:' + size + 'px'}>
    <svg width=${size} height=${size} viewBox=${'0 0 ' + size + ' ' + size} aria-hidden="true">
      <circle class="rg-tr" cx=${c} cy=${c} r=${r} fill="none" stroke-width=${width}/>
      ${v > 0 ? html`<circle class="rg-v" cx=${c} cy=${c} r=${r} fill="none" stroke-width=${width} stroke-linecap="round" stroke-dasharray=${v + ' ' + C} transform=${'rotate(-90 ' + c + ' ' + c + ')'} style=${'--len:' + v}/>` : null}
    </svg>
    <span class="rg-c">${children}</span>
  </span>`;
}
