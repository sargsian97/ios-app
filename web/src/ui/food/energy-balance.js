/* Энергобаланс за 30 дней: съеденное столбиками против цели (пунктир) или расхода (линия). Показывается в «Расходе энергии». */
import { html, useApp, useData, useState } from '../core.js';
import { Card, Segmented } from '../kit.js';
import { t, fmtNum } from '../../i18n/index.js';
import { DateChart } from '../chart.js';
import { useExpenditure } from './expenditure.js';
import { dayBudget } from './budget.js';
import { dayTotals } from '../../domain/nutrition.js';
import { addDays } from '../../data/journal.js';

export function EnergyBalance({ today }) {
  const app = useApp();
  const { repos } = app;
  useData(['foodEntries', 'dayEntries', 'expenditureSettings', 'dayTargets', 'workoutLogs', 'stepsEntries', 'scaleEntries']);
  const ex = useExpenditure();
  const [mode, setMode] = useState('targets');
  const from = addDays(today, -29);
  const dates = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const intake = dates.map((d) => ({ x: d, y: dayTotals(repos.foodEntry.byDate(d), repos.dayEntry.get(d)).kcal || 0 })).filter((p) => p.y > 0);
  if (!intake.length) return null;
  const second = mode === 'targets'
    ? { key: 'target', label: t('dash.eb.target'), kind: 'dash', color: 'var(--k-plan)', points: dates.map((d) => ({ x: d, y: (dayBudget(app, d) || {}).kcal })).filter((p) => p.y > 0) }
    : { key: 'tdee', label: t('dash.eb.tdee'), kind: 'line', color: 'var(--k-burn)', points: ex ? ex.series.filter((r) => r.date >= from).map((r) => ({ x: r.date, y: Math.round(r.tdee) })) : [] };
  const avg = Math.round(intake.reduce((a, p) => a + p.y, 0) / intake.length);
  const avg2 = second.points.length ? Math.round(second.points.reduce((a, p) => a + p.y, 0) / second.points.length) : null;
  return html`<${Card} title=${t('dash.eb.title')} icon="flame" color="var(--k-burn)" cls="eb">
    <${Segmented} value=${mode} onChange=${setMode} options=${[['targets', t('dash.eb.vsTarget')], ['tdee', t('dash.eb.vsTdee')]]}/>
    <${DateChart} series=${[{ key: 'intake', label: t('dash.eb.intake'), kind: 'bars', color: 'var(--k-food)', points: intake }, second]} digits=${0} unit=${t('unit.kcal')} ariaLabel=${t('dash.eb.aria')}/>
    <div class="hint">${t('dash.eb.avg', { a: fmtNum(avg), b: avg2 != null ? fmtNum(avg2) : '—', what: mode === 'targets' ? t('dash.eb.target') : t('dash.eb.tdee') })}</div>
  <//>`;
}
