/* Линейный график по датам: точки (взвешивания) и линии (тренд), линия цели, перекрестие с подсказкой.
   Одна ось Y. Подписи — цветом текста, серии — цветом метки. Подсказка дублирует то, что есть в списке. */
import { html, useState, useRef, useMemo } from './core.js';
import { fmtNum, fmtDate } from '../i18n/index.js';

const W = 340, H = 190, M = { l: 38, r: 34, t: 10, b: 22 };

function dn(ymd) { const [y, m, d] = ymd.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }

/* «Круглые» деления оси */
function ticks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return { list: out, step };
}

/* series: [{ key, label, kind: 'dots' | 'line', color, points: [{ x: 'YYYY-MM-DD', y }] }] */
export function DateChart({ series, goal, digits = 1, unit = '', ariaLabel, empty }) {
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  const all = series.flatMap((s) => s.points);

  const geo = useMemo(() => {
    if (!all.length) return null;
    const xs = all.map((p) => dn(p.x));
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 3; x1 += 3; }
    const ys = all.map((p) => p.y).concat(goal && goal.y != null ? [goal.y] : []);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max((y1 - y0) * 0.12, 0.5);
    y0 -= pad; y1 += pad;
    const tk = ticks(y0, y1);
    y0 = Math.min(y0, tk.list[0]); y1 = Math.max(y1, tk.list[tk.list.length - 1]);
    const X = (d) => M.l + (dn(d) - x0) / (x1 - x0) * (W - M.l - M.r);
    const Y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
    const dates = [...new Set(all.map((p) => p.x))].sort();
    return { X, Y, tk, x0, x1, dates };
  }, [JSON.stringify(series), goal && goal.y]);

  if (!geo) return html`<div class="chart-empty">${empty || ''}</div>`;
  const { X, Y, tk, dates } = geo;

  function onMove(e) {
    const r = box.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    let best = null, bd = Infinity;
    dates.forEach((d) => { const dd = Math.abs(X(d) - px); if (dd < bd) { bd = dd; best = d; } });
    setHover(best);
  }

  const xLabels = [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]].filter((d, i, a) => a.indexOf(d) === i);
  const lines = series.filter((s) => s.kind === 'line' && s.points.length);
  const hv = hover ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hover) })).filter((x) => x.p) : [];
  const hx = hover ? X(hover) : 0;

  return html`<div class="chart">
    ${series.length > 1 ? html`<div class="legend-row">${series.map((s) => html`<span class="ch-lg"><i class=${s.kind === 'line' ? 'ch-kl' : 'ch-kd'} style=${'--sc:' + s.color}></i>${s.label}</span>`)}</div>` : null}
    <div class="chart-box" ref=${box} onPointerMove=${onMove} onPointerDown=${onMove} onPointerLeave=${() => setHover(null)}>
      <svg viewBox=${'0 0 ' + W + ' ' + H} width="100%" role="img" aria-label=${ariaLabel || ''}>
        ${tk.list.map((v) => html`<g><line class="ch-g" x1=${M.l} x2=${W - M.r} y1=${Y(v)} y2=${Y(v)}/><text class="ch-t" x=${M.l - 6} y=${Y(v) + 4} text-anchor="end">${fmtNum(v, tk.step < 1 ? 1 : 0)}</text></g>`)}
        ${xLabels.map((d, i) => html`<text class="ch-t" x=${X(d)} y=${H - 6} text-anchor=${i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>${fmtDate(d)}</text>`)}
        ${goal && goal.y != null ? html`<g><line class="ch-goal" x1=${M.l} x2=${W - M.r} y1=${Y(goal.y)} y2=${Y(goal.y)}/><text class="ch-t ch-gl" x=${W - M.r + 4} y=${Y(goal.y) + 4}>${goal.label}</text></g>` : null}
        ${lines.map((s) => html`<polyline class="ch-l" style=${'stroke:' + s.color} points=${s.points.map((p) => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}/>`)}
        ${series.filter((s) => s.kind === 'dots').map((s) => s.points.map((p) => html`<circle class="ch-d" cx=${X(p.x)} cy=${Y(p.y)} r="4" style=${'fill:' + s.color}/>`))}
        ${lines.map((s) => { const p = s.points[s.points.length - 1]; return html`<g><circle class="ch-d" cx=${X(p.x)} cy=${Y(p.y)} r="4.5" style=${'fill:' + s.color}/><text class="ch-t ch-end" x=${X(p.x) + 7} y=${Y(p.y) + 4}>${fmtNum(p.y, digits)}</text></g>`; })}
        ${hover ? html`<line class="ch-x" x1=${hx} x2=${hx} y1=${M.t} y2=${H - M.b}/>` : null}
      </svg>
      ${hover && hv.length ? html`<div class="ch-tip" style=${'left:' + Math.min(78, Math.max(4, hx / W * 100 - 18)) + '%'}>
        <div class="ch-td">${fmtDate(hover, 'long')}</div>
        ${hv.map(({ s, p }) => html`<div class="ch-tr"><i class=${s.kind === 'line' ? 'ch-kl' : 'ch-kd'} style=${'--sc:' + s.color}></i><b>${fmtNum(p.y, digits)}</b> ${unit} <span>${s.label}</span></div>`)}
      </div>` : null}
    </div>
  </div>`;
}

/* Маленькие столбики за последние дни (шаги) */
export function MiniBars({ values, color, labels }) {
  const mx = Math.max(1, ...values.map((v) => v || 0));
  return html`<div class="minibars">${values.map((v, i) => html`<div class="mb"><i style=${'height:' + Math.max(3, (v || 0) / mx * 100) + '%;background:' + (v ? color : 'var(--line)')}></i>${labels ? html`<span>${labels[i]}</span>` : null}</div>`)}</div>`;
}
