/* Выбор упражнения: поиск с синонимами, фильтр по группе мышц и оборудованию, создание своего по названию. */
import { html, useApp, useState, useMemo } from '../core.js';
import { Sheet } from '../kit.js';
import { Icon } from '../icons.js';
import { t } from '../../i18n/index.js';
import { searchExercises, filterExercises, usageCounts, guessFromName, MUSCLE_GROUPS } from '../../domain/exercises.js';
import { uid } from '../../data/ids.js';
import { useCatalog, groupLabel, muscleLabel, equipLabel } from './catalog.js';

/* Строка упражнения в списке */
export function ExerciseRow({ e, onTap, right }) {
  const ms = (e.primaryMuscles || []).slice(0, 2).map(muscleLabel).join(', ');
  const eq = (e.equipment || []).filter((x) => x !== 'other').slice(0, 1).map(equipLabel)[0];
  return html`<button class="lrow wk-exrow" type="button" onClick=${onTap}>
    <span class="ltext"><span class="ll">${e.name}${e.source !== 'library' ? html` <span class="wk-mine">${t('train.lib.mine')}</span>` : null}</span>
      <span class="ls">${[ms, eq].filter(Boolean).join(' · ') || (e.nameEn || '')}</span></span>
    ${right || null}
  </button>`;
}

/* Поиск + фильтры, общий для справочника и выбора */
export function useExerciseSearch({ logs }) {
  const cat = useCatalog();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const usage = useMemo(() => usageCounts(logs || []), [logs]);
  const results = useMemo(() => searchExercises(filterExercises(cat.list, { group: group || null, equipment: equipment || null }), q, { usage }), [cat.list, q, group, equipment, usage]);
  return { cat, q, setQ, group, setGroup, equipment, setEquipment, results };
}

export function SearchFilters({ s }) {
  return html`<div class="searchbox">
      <${Icon} name="search"/>
      <input type="search" placeholder=${t('train.lib.searchPh')} value=${s.q} onInput=${(e) => s.setQ(e.currentTarget.value)} enterkeyhint="search" autocomplete="off" aria-label=${t('train.lib.searchPh')}/>
      ${s.q ? html`<button class="clr" aria-label=${t('common.clear')} onClick=${() => s.setQ('')}><${Icon} name="close" size=${14}/></button>` : null}
    </div>
    <div class="wk-filter" role="radiogroup" aria-label=${t('train.lib.muscles')}>
      <button class=${'chip' + (!s.group ? ' on' : '')} role="radio" aria-checked=${!s.group} onClick=${() => s.setGroup('')}>${t('train.lib.all')}</button>
      ${MUSCLE_GROUPS.map(([g]) => html`<button class=${'chip' + (s.group === g ? ' on' : '')} role="radio" aria-checked=${s.group === g} onClick=${() => s.setGroup(s.group === g ? '' : g)}>${groupLabel(g)}</button>`)}
    </div>
    <div class="wk-filter" role="radiogroup" aria-label=${t('train.lib.equipment')}>
      ${['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'kettlebell', 'bodyweight', 'band'].map((k) => html`<button class=${'chip eqf' + (s.equipment === k ? ' on' : '')} role="radio" aria-checked=${s.equipment === k} onClick=${() => s.setEquipment(s.equipment === k ? '' : k)}>${equipLabel(k)}</button>`)}
    </div>`;
}

/* Создать своё упражнение по названию (атрибуты — подсказка по словам названия) */
export async function createExercise(repos, name) {
  const g = guessFromName(name);
  return repos.exercise.create(Object.assign(g, { id: 'u-' + uid(), name: name.trim(), source: 'user' }));
}

export function ExercisePicker({ open, onClose, onPick, title }) {
  const { repos } = useApp();
  const s = useExerciseSearch({ logs: open ? repos.workout.list() : [] });
  const [limit, setLimit] = useState(60);
  if (!open) return null;
  const q = s.q.trim();
  const exact = q && s.results.some((e) => e.name.toLowerCase() === q.toLowerCase());
  return html`<${Sheet} open=${open} onClose=${onClose} title=${title || t('train.pick.title')}>
    <div class="wk-picker">
      <${SearchFilters} s=${s}/>
      <div class="list results">
        ${q && !exact ? html`<button class="lrow" type="button" onClick=${async () => onPick(await createExercise(repos, q))}>
          <span class="lico" style="--cc:var(--k-str)"><${Icon} name="plus"/></span>
          <span class="ltext"><span class="ll">${t('train.pick.create', { name: q })}</span><span class="ls">${t('train.pick.createSub')}</span></span></button>` : null}
        ${s.results.slice(0, limit).map((e) => html`<${ExerciseRow} e=${e} onTap=${() => onPick(e)}/>`)}
        ${!s.results.length ? html`<div class="empty">${s.cat.ready ? t('train.lib.none') : t('train.lib.loading')}</div>` : null}
      </div>
      ${s.results.length > limit ? html`<button class="wk-more" onClick=${() => setLimit(limit + 100)}>${t('train.lib.more', { count: s.results.length - limit })}</button>` : null}
    </div>
  <//>`;
}
