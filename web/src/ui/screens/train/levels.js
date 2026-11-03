/* Уровни: карта тела — сколько рабочих подходов в неделю в среднем получает каждая мышца
   (неделя / месяц / 3 месяца, вторичные мышцы — с коэффициентом), и какие упражнения дают этот объём. */
import { html, useApp, useData, useState, todayYmd } from '../../core.js';
import { Page, Segmented } from '../../kit.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { averagePerWeek, muscleContributors, volumeLevel, addDays } from '../../../domain/calc/index.js';
import { MUSCLES } from '../../../data/models/workout.js';
import { useCatalog, muscleLabel } from '../../train/catalog.js';
import { LevelMap } from '../../train/muscle-map.js';
import { isCardio } from '../../../domain/exercises.js';
import { VOLUME_LEVEL_SETS } from '../../../domain/calc/constants.js';
import { Icon } from '../../icons.js';

const PERIODS = [['week', 7, 'lv.week', 'lv.zero.week'], ['month', 30, 'lv.month', 'lv.zero.month'], ['q', 91, 'lv.q', 'lv.zero.q']];

export function Levels() {
  const { repos } = useApp();
  useData(['workoutLogs']);
  const cat = useCatalog();
  const [period, setPeriod] = useState('month');
  const [open, setOpen] = useState(null);
  const today = todayYmd();
  const days = PERIODS.find((p) => p[0] === period)[1];
  const from = addDays(today, -(days - 1));
  const info = {};
  Object.values(cat.byId || {}).forEach((e) => { if (!isCardio(e)) info[e.id] = { primary: e.primaryMuscles || [], secondary: e.secondaryMuscles || [] }; });
  const logs = repos.workout.list((w) => w.date >= from && w.date <= today);
  const avg = averagePerWeek(logs, info, { from, to: today });
  const levels = {};
  MUSCLES.forEach((m) => { levels[m] = volumeLevel((avg[m] || {}).sets || 0); });
  const rows = MUSCLES.map((m) => ({ m, sets: (avg[m] || {}).sets || 0 })).sort((a, b) => b.sets - a.sets || muscleLabel(a.m).localeCompare(muscleLabel(b.m), 'ru'));
  const exName = (id) => (cat.byId[id] ? cat.byId[id].name : id);
  const pick = (m) => { setOpen(m); const el = document.getElementById('lv-' + m); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const zeros = rows.filter((r) => !r.sets).map((r) => muscleLabel(r.m).toLowerCase());
  const top = VOLUME_LEVEL_SETS[VOLUME_LEVEL_SETS.length - 1];
  const OP = [0, 0.4, 0.7, 1, 1];
  return html`<${Page} title=${t('lv.title')} back="/train" backLabel=${t('nav.train')}>
    <div class="ex-sub">${t('lv.sub')}</div>
    <${Segmented} value=${period} onChange=${setPeriod} options=${PERIODS.map(([k, , l]) => [k, t(l)])}/>
    <section class="card lvhero">
      <div class="lv-h"><span class="rl">${fmtDate(from)} – ${fmtDate(today)}</span><span class="lv-chip">${logs.length} ${t('train.week.workouts', { count: logs.length })}</span></div>
      <${LevelMap} levels=${levels} onPick=${pick} label=${t('lv.aria')}/>
      <div class="lv-scale" aria-hidden="true">
        <div class="lv-sbar">${[0, 1, 2, 3, 4].map((l) => html`<i class=${l >= 3 ? 'glow' : ''} style=${'--o:' + OP[l] + (l === 4 ? ';--top:1' : '')}></i>`)}</div>
        <div class="lv-slab">${[t('lv.l0')].concat(VOLUME_LEVEL_SETS.map((n) => n + '+')).map((x) => html`<span>${x}</span>`)}</div>
      </div>
    </section>
    ${logs.length && zeros.length ? html`<div class="lvzero"><span class="lz-i"><${Icon} name="info"/></span><span class="lz-t"><b>${t(PERIODS.find((p) => p[0] === period)[3])}</b><span>${zeros.join(', ')}</span></span></div>` : null}
    <div class="ltitle">${t('lv.perWeek')}</div>
    <div class="list lvlist">${rows.map(({ m, sets }) => {
      const lv = levels[m];
      const isOpen = open === m;
      const contrib = isOpen ? muscleContributors(logs, info, m, { from, to: today }) : [];
      return html`<button class=${'lrow lv-row' + (sets ? '' : ' off')} id=${'lv-' + m} type="button" aria-expanded=${isOpen} onClick=${() => setOpen(isOpen ? null : m)}>
        <span class="ltext"><span class="ll">${muscleLabel(m)}</span>
          ${isOpen ? html`<span class="nut-top">${contrib.length ? contrib.slice(0, 6).map((c) => html`<span>${exName(c.exerciseId)} — ${fmtNum(c.sets, 1)}</span>`) : t('lv.none')}</span>` : null}</span>
        <span class="lv-bar" aria-hidden="true"><i class=${lv >= 3 ? 'glow' : ''} style=${'width:' + Math.min(100, sets / top * 100).toFixed(1) + '%;--o:' + OP[lv]}></i></span>
        <span class="lv"><b>${fmtNum(sets, 1)}</b></span>
      </button>`;
    })}</div>
    <p class="lfoot">${t('lv.foot')}</p>
  <//>`;
}
