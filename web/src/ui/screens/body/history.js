/* История тела: взвешивания и замеры по дням, правка и удаление. */
import { html, useApp, useData, useState } from '../../core.js';
import { Page } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { toDisplay, unitKey } from '../../../domain/units.js';
import { WeighSheet, MeasureSheet } from './sheets.js';
import { measureLabel } from './labels.js';

export function BodyHistory() {
  const { repos } = useApp();
  useData(['scaleEntries', 'bodyEntries', 'profile']);
  const units = repos.profile.get().units;
  const [limit, setLimit] = useState(40);
  const [sheet, setSheet] = useState(null);
  const days = {};
  repos.scaleEntry.list().forEach((s) => { (days[s.date] = days[s.date] || { scale: [], body: null }).scale.push(s); });
  repos.bodyEntry.list().forEach((b) => { (days[b.date] = days[b.date] || { scale: [], body: null }).body = b; });
  const dates = Object.keys(days).sort().reverse();
  const wu = t(unitKey('weight', units)), lu = t(unitKey('length', units));
  return html`<${Page} title=${t('body.history')} back="/more/body" backLabel=${t('body.title')}>
    ${dates.length ? dates.slice(0, limit).map((d) => {
      const x = days[d];
      return html`<div class="ltitle">${fmtDate(d, 'full')}</div><div class="list">
        ${x.scale.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((s) => html`<button class="lrow" onClick=${() => setSheet({ kind: 'weigh', entry: s })}>
          <span class="lico" style="--cc:var(--k-body)"><${Icon} name="scale"/></span>
          <span class="ltext"><span class="ll">${fmtNum(toDisplay('weight', s.weightKg, units), 2)} ${wu}</span><span class="ls">${[s.time, s.bodyFatPct != null ? fmtNum(s.bodyFatPct, 1) + ' %' : null, s.source === 'legacy' ? t('food.src.legacy') : null].filter(Boolean).join(' · ') || t('body.weighing')}</span></span>
          <${Icon} name="right" cls="chev"/></button>`)}
        ${x.body ? html`<button class="lrow" onClick=${() => setSheet({ kind: 'measure', date: d })}>
          <span class="lico" style="--cc:#14B8A6"><${Icon} name="ruler"/></span>
          <span class="ltext"><span class="ll">${t('body.measures')}</span><span class="ls">${Object.keys(x.body.measurements).filter((k) => x.body.measurements[k] != null).map((k) => measureLabel(k) + ' ' + fmtNum(toDisplay('length', x.body.measurements[k], units), 1)).concat(x.body.bodyFatPct != null ? [t('body.m.bodyFatPct') + ' ' + fmtNum(x.body.bodyFatPct, 1) + ' %'] : []).join(' · ')} ${lu}</span></span>
          <${Icon} name="right" cls="chev"/></button>` : null}
      </div>`;
    }) : html`<div class="card pad empty">${t('body.noWeight')}</div>`}
    ${dates.length > limit ? html`<button style="width:100%" onClick=${() => setLimit(limit + 40)}>${t('body.more')}</button>` : null}
    <${WeighSheet} open=${sheet && sheet.kind === 'weigh'} entry=${sheet && sheet.entry} onClose=${() => setSheet(null)}/>
    <${MeasureSheet} open=${sheet && sheet.kind === 'measure'} date=${sheet && sheet.date} onClose=${() => setSheet(null)}/>
  <//>`;
}
