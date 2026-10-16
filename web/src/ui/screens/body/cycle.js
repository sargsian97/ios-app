/* Менструальный цикл: отметка дней месячных в календаре, сводка и прогноз. */
import { html, useApp, useData, useState, todayYmd } from '../../core.js';
import { Page, Card, Toggle } from '../../kit.js';
import { t, fmtDate } from '../../../i18n/index.js';
import { cycleSummary, periodRuns } from '../../../domain/calc/index.js';
import { addDays } from '../../../data/legacy.js';

export function Cycle() {
  const { repos } = useApp();
  useData(['periodEntries', 'dietProfile', 'profile']);
  const today = todayYmd();
  const [month, setMonth] = useState(today.slice(0, 7));
  const marks = repos.periodEntry.list((p) => p.kind === 'period');
  const set = new Map(marks.map((p) => [p.date, p]));
  const s = cycleSummary(marks.map((p) => p.date), today);
  const runs = periodRuns(marks.map((p) => p.date)).reverse().slice(0, 8);
  const toggle = (d) => (set.has(d) ? repos.periodEntry.remove(set.get(d).id) : repos.periodEntry.create({ date: d, kind: 'period' }));
  const [y, m] = month.split('-').map(Number);
  const first = month + '-01', dim = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: off }, () => null).concat(Array.from({ length: dim }, (_, i) => addDays(first, i)));
  const shift = (k) => { const d = new Date(y, m - 1 + k, 1); setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); };
  const predicted = s.known ? new Set(Array.from({ length: s.avgPeriod || 5 }, (_, i) => addDays(s.nextStart, i))) : new Set();
  const dp = repos.dietProfile.get();
  return html`<${Page} title=${t('body.cycle')} back="/more/body" backLabel=${t('body.title')}>
    <${Card}>
      ${s.known ? html`<div class="kv"><span>${t('body.cycle.day')}</span><span>${s.cycleDay}${s.inPeriod ? ' · ' + t('body.cycle.inPeriod') : ''}</span></div>
        <div class="kv"><span>${t('body.cycle.next')}</span><span>${fmtDate(s.nextStart, 'full')}</span></div>
        <div class="kv"><span>${t('body.cycle.avg')}</span><span>${t('body.cycle.days', { count: s.avgLength })}</span></div>` : html`<div class="hint" style="margin:0">${t('body.cycle.empty')}</div>`}
      <button class=${set.has(today) ? 'danger' : 'primary'} style="width:100%;margin-top:12px" onClick=${() => toggle(today)}>${set.has(today) ? t('body.cycle.unmarkToday') : t('body.cycle.markToday')}</button>
    <//>
    <div class="card pad">
      <div class="row" style="margin-bottom:10px"><button class="ghost" aria-label="‹" onClick=${() => shift(-1)}>‹</button><b class="grow" style="text-align:center;text-transform:capitalize">${fmtDate(first, 'month')}</b><button class="ghost" aria-label="›" onClick=${() => shift(1)}>›</button></div>
      <div class="cgrid">${cells.map((d) => d ? html`<button class=${'cc' + (set.has(d) ? ' on' : '') + (predicted.has(d) && !set.has(d) ? ' pred' : '') + (d === today ? ' today' : '')} disabled=${d > today} onClick=${() => toggle(d)}>${Number(d.slice(8))}</button>` : html`<span></span>`)}</div>
      <div class="hint">${t('body.cycle.hint')}</div>
    </div>
    ${runs.length ? html`<div class="ltitle">${t('body.cycle.history')}</div><div class="list">${runs.map((r) => html`<div class="lrow"><span class="ltext"><span class="ll">${fmtDate(r.start)} — ${fmtDate(r.end)}</span><span class="ls">${t('body.cycle.days', { count: r.days })}</span></span></div>`)}</div>` : null}
    ${repos.profile.get().sex !== 'female' ? html`<div class="card pad"><${Toggle} on=${dp.cycleTracking} onChange=${(v) => repos.dietProfile.update({ cycleTracking: v })} label=${t('body.cycle.show')}/></div>` : null}
  <//>`;
}
