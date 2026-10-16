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

const PERIODS = [['week', 7, 'lv.week'], ['month', 30, 'lv.month'], ['q', 91, 'lv.q']];

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
  return html`<${Page} title=${t('lv.title')} back="/train" backLabel=${t('nav.train')}>
    <${Segmented} value=${period} onChange=${setPeriod} options=${PERIODS.map(([k, , l]) => [k, t(l)])}/>
    <div class="card pad">
      <div class="rl">${fmtDate(from)} – ${fmtDate(today)} · ${t('lv.workouts', { count: logs.length })}</div>
      <${LevelMap} levels=${levels} onPick=${pick} label=${t('lv.aria')}/>
    </div>
    <div class="ltitle">${t('lv.perWeek')}</div>
    <div class="list">${rows.map(({ m, sets }) => {
      const lv = levels[m];
      const isOpen = open === m;
      const contrib = isOpen ? muscleContributors(logs, info, m, { from, to: today }) : [];
      return html`<button class="lrow lv-row" id=${'lv-' + m} type="button" aria-expanded=${isOpen} onClick=${() => setOpen(isOpen ? null : m)}>
        <span class="ltext"><span class="ll">${muscleLabel(m)}<span class="lv-dots" aria-hidden="true">${[1, 2, 3, 4].map((k) => html`<i class=${k <= lv ? 'on' : ''}></i>`)}</span></span>
          ${isOpen ? html`<span class="nut-top">${contrib.length ? contrib.slice(0, 6).map((c) => html`<span>${exName(c.exerciseId)} — ${fmtNum(c.sets, 1)}</span>`) : t('lv.none')}</span>` : null}</span>
        <span class="lv"><b>${fmtNum(sets, 1)}</b></span>
      </button>`;
    })}</div>
    <p class="lfoot">${t('lv.foot')}</p>
  <//>`;
}
