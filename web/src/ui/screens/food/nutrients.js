/* Нутриенты: оценка полноты рациона, все нутриенты по группам относительно норм (минимум / цель / потолок),
   топ-3 источника по каждому. Период — день, неделя (с понедельника) или 30 дней, в среднем за день с записями. */
import { html, useApp, useData, useState, todayYmd } from '../../core.js';
import { Page, Segmented } from '../../kit.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { nutrientReport, completenessScore } from '../../../domain/nutrition.js';
import { NUTRIENT_UNITS } from '../../../data/models/nutrients.js';
import { addDays, weekStart } from '../../../data/legacy.js';
import { dayBudget } from '../../food/budget.js';
import { nutrientLabel, unitLabel } from '../../food/labels.js';

const GROUPS = [['macro', 'food.nut.macros'], ['carbs', 'food.group.carbs'], ['fats', 'food.group.fats'], ['protein', 'food.group.protein'], ['vitamins', 'food.group.vitamins'], ['minerals', 'food.group.minerals'], ['other', 'food.group.other']];
const groupOf = (k) => { const g = (NUTRIENT_UNITS[k] || {}).group; return g === 'energy' ? 'macro' : g || 'other'; };

export function Nutrients({ route }) {
  const app = useApp();
  const { repos, legacy } = app;
  useData(['foodEntries', 'microGoals', 'dayTargets']);
  const today = todayYmd();
  const date = route.query.d || today;
  const [period, setPeriod] = useState(route.query.p || 'day');
  const [open, setOpen] = useState(null);
  const from = period === 'day' ? date : period === 'week' ? weekStart(date) : addDays(date, -29);
  const to = period === 'week' ? (addDays(from, 6) > today ? today : addDays(from, 6)) : date;
  const entries = repos.foodEntry.between(from, to);
  const goals = {};
  repos.microGoal.list().forEach((g) => { goals[g.id] = g; });
  const b = dayBudget({ repos, legacy, date });
  ['kcal', 'protein', 'fat', 'carbs'].forEach((k) => { if (b && b[k]) goals[k] = { target: b[k] }; });
  const keys = Object.keys(NUTRIENT_UNITS).filter((k) => !['protein_animal', 'protein_plant'].includes(k));
  const rep = nutrientReport(entries, goals, keys);
  const score = completenessScore({ rows: rep.rows.filter((r) => groupOf(r.key) !== 'macro') });
  const fmtV = (v, k) => fmtNum(v, v < 10 ? 1 : 0) + ' ' + unitLabel(NUTRIENT_UNITS[k].unit);
  const title = period === 'day' ? fmtDate(date, 'long') : fmtDate(from) + ' – ' + fmtDate(to);
  return html`<${Page} title=${t('food.nut.title')} back=${'/food?d=' + date} backLabel=${t('nav.food')}>
    <${Segmented} value=${period} onChange=${setPeriod} options=${[['day', t('food.nut.day')], ['week', t('food.nut.week')], ['month', t('food.nut.month')]]}/>
    <div class="card pad nut-score">
      <div class="rl">${title}${period !== 'day' ? ' · ' + t('food.nut.avg', { count: entries.length ? rep.days : 0 }) : ''}</div>
      <div class="nut-big"><b>${score != null && entries.length ? score : '—'}</b><span>${t('food.nut.score')}</span></div>
      <div class="hint">${t('food.nut.scoreHint')}</div>
    </div>
    ${!entries.length ? html`<div class="card empty">${t('food.nut.empty')}</div>` : GROUPS.map(([g, label]) => {
      const rows = rep.rows.filter((r) => groupOf(r.key) === g && (r.value > 0 || r.target));
      if (!rows.length) return null;
      return html`<div class="ltitle">${t(label)}</div><div class="list">${rows.map((r) => {
        const scale = Math.max(r.max || 0, r.target || 0, r.value) * 1.05 || 1;
        return html`<button class="lrow nut-row" type="button" aria-expanded=${open === r.key} onClick=${() => setOpen(open === r.key ? null : r.key)}>
          <span class="ltext"><span class="ll">${nutrientLabel(r.key)}</span>
            <span class="nut-bar"><i class=${'s-' + r.status} style=${'width:' + Math.min(100, r.value / scale * 100) + '%'}></i>
              ${r.min ? html`<em style=${'left:' + (r.min / scale * 100) + '%'}></em>` : null}${r.target ? html`<em class="tg" style=${'left:' + (r.target / scale * 100) + '%'}></em>` : null}${r.max ? html`<em class="mx" style=${'left:' + (r.max / scale * 100) + '%'}></em>` : null}</span>
            ${open === r.key ? html`<span class="nut-top">${r.top.length ? r.top.map((x) => html`<span>${x.name} — ${fmtV(x.value, r.key)} · ${fmtNum(x.share * 100)} %</span>`) : t('food.nut.noTop')}</span>` : null}</span>
          <span class="lv">${fmtV(r.value, r.key)}${r.target ? html`<small>${t('food.nut.of', { v: fmtV(r.target, r.key) })}</small>` : null}</span>
        </button>`;
      })}</div>`;
    })}
    <p class="lfoot">${t('food.nut.foot')}</p>
  <//>`;
}
