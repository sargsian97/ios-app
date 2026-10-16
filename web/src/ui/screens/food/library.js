/* Мои продукты, избранное, настройки дневника и данные по дням. */
import { html, useApp, useData, useState, navigate, todayYmd } from '../../core.js';
import { Page, Card, List, Row, Segmented, Toggle, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { useEnergy, per100Text, addDays } from '../../food/parts.js';
import { sourceLabel } from '../../food/labels.js';
import { dayTotals } from '../../../domain/nutrition.js';

export function FoodLibrary() {
  const { repos } = useApp();
  useData(['foodItems', 'favorites', 'recipes']);
  const energy = useEnergy();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('mine');
  const s = q.trim().toLowerCase();
  let list;
  if (tab === 'fav') {
    list = repos.favorite.list().sort((a, b) => a.order - b.order).map((f) => ({ fav: f, doc: f.ref.kind === 'recipe' ? repos.recipe.get(f.ref.id) : repos.food.get(f.ref.id), kind: f.ref.kind })).filter((x) => x.doc);
  } else {
    list = repos.food.list((f) => !f.archived && (tab === 'mine' ? ['user', 'legacy', 'ai'].includes(f.source) : ['off', 'usda'].includes(f.source)))
      .sort((a, b) => a.name.localeCompare(b.name)).map((doc) => ({ doc, kind: 'food' }));
  }
  if (s) list = list.filter((x) => (x.doc.name + ' ' + (x.doc.brand || '')).toLowerCase().includes(s));
  return html`<${Page} title=${t('food.library')} back="/food" backLabel=${t('nav.food')}
      right=${html`<button class="small" onClick=${() => navigate('/food/new-food')}>${t('food.sc.new')}</button>`}>
    <${Segmented} value=${tab} onChange=${setTab} options=${[['mine', t('food.lib.mine')], ['saved', t('food.lib.saved')], ['fav', t('food.tab.fav')]]}/>
    <div class="searchbox" style="margin-top:12px"><${Icon} name="search"/><input type="search" placeholder=${t('food.lib.search')} value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div>
    ${list.length ? html`<div class="list results">${list.map((x) => html`<button class="lrow rrow" onClick=${() => navigate(x.kind === 'recipe' ? '/food/recipe/' + x.doc.id : '/food/item/' + x.doc.id)}>
      <span class="ltext"><span class="ll">${x.fav ? '★ ' : ''}${x.doc.name}</span><span class="ls">${x.kind === 'recipe' ? t('food.recipe.badge') : (x.doc.brand ? x.doc.brand + ' · ' : '') + per100Text(x.doc.nutrients, energy)}</span></span>
      ${x.doc.source && !['user', 'legacy'].includes(x.doc.source) ? html`<span class="lbadge">${sourceLabel(x.doc.source)}</span>` : null}
      <${Icon} name="right" cls="chev"/></button>`)}</div>` : html`<div class="card pad empty">${t('food.lib.empty')}</div>`}
    <div class="hint" style="margin:0 6px">${t('food.lib.hint')}</div>
  <//>`;
}

export function FoodSettings() {
  const { repos } = useApp();
  useData('dietProfile');
  const dp = repos.dietProfile.get();
  const tl = dp.timeline;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const setTl = (patch) => repos.dietProfile.update({ timeline: Object.assign({}, tl, patch) });
  return html`<${Page} title=${t('food.settings')} back="/food" backLabel=${t('nav.food')}>
    <${Card} title=${t('food.set.view')} icon="list" color="var(--k-plan)">
      <${Segmented} value=${dp.diaryView} onChange=${(v) => repos.dietProfile.update({ diaryView: v })} options=${[['timeline', t('food.view.timeline')], ['classic', t('food.view.classic')]]}/>
      <div class="grid2" style="margin-top:14px">
        <${Field} label=${t('food.set.from')}><select value=${tl.startHour} onChange=${(e) => setTl({ startHour: Number(e.currentTarget.value) })}>${hours.map((h) => html`<option value=${h}>${String(h).padStart(2, '0')}:00</option>`)}</select><//>
        <${Field} label=${t('food.set.to')}><select value=${tl.endHour} onChange=${(e) => setTl({ endHour: Number(e.currentTarget.value) })}>${hours.map((h) => html`<option value=${h}>${String(h).padStart(2, '0')}:00</option>`)}</select><//>
      </div>
      <div style="margin-top:14px"><${Toggle} on=${tl.hideEmpty} onChange=${(v) => setTl({ hideEmpty: v })} label=${t('food.set.hideEmpty')} hint=${t('food.set.hideEmptyHint')}/></div>
    <//>
    <${Card} title=${t('food.set.banner')} icon="target" color="var(--k-food)">
      <${Segmented} value=${dp.banner} onChange=${(v) => repos.dietProfile.update({ banner: v })} options=${[['eaten_left', t('food.set.b.ring')], ['eaten', t('food.set.b.eaten')], ['left', t('food.set.b.left')], ['progress', t('food.set.b.bar')]]}/>
      <div style="margin-top:12px"><${Toggle} on=${dp.showOverages} onChange=${(v) => repos.dietProfile.update({ showOverages: v })} label=${t('food.set.overages')} hint=${t('food.set.overagesHint')}/></div>
    <//>
    <${Card} title=${t('food.set.logger')} icon="bolt" color="#FFCC00">
      <${Segmented} value=${dp.loggerMode} onChange=${(v) => repos.dietProfile.update({ loggerMode: v })} options=${[['context', t('food.set.l.context')], ['speed', t('food.set.l.speed')]]}/>
      <div class="hint">${t('food.set.loggerHint')}</div>
    <//>
  <//>`;
}

export function FoodDays() {
  const { repos } = useApp();
  useData(['foodEntries', 'dayEntries']);
  const energy = useEnergy();
  const today = todayYmd();
  const days = Array.from({ length: 60 }, (_, i) => addDays(today, -i));
  const save = (date, patch) => { const d = repos.dayEntry.get(date); return repos.dayEntry.save(Object.assign({}, d || { id: date }, patch, { id: date })); };
  return html`<${Page} title=${t('food.days')} back="/food" backLabel=${t('nav.food')}>
    <div class="hint" style="margin:-6px 4px 12px">${t('food.days.hint')}</div>
    <div class="list">${days.map((date) => {
      const es = repos.foodEntry.byDate(date), d = repos.dayEntry.get(date);
      const tot = dayTotals(es, d);
      return html`<div class="lrow dayrow">
        <button class="ltext linkish" onClick=${() => navigate('/food?d=' + date)}><span class="ll">${fmtDate(date, 'long')}</span>
          <span class="ls">${es.length ? energy.fmt(tot.kcal) + ' ' + energy.unit + ' · ' + t('food.days.entries', { count: es.length }) : t('food.days.none')}</span></button>
        <button class=${'chip' + (d && d.fasting ? ' on' : '')} onClick=${() => save(date, { fasting: !(d && d.fasting) })}>${t('food.flag.fastingShort')}</button>
        <button class=${'chip' + (d && d.partial ? ' on' : '')} onClick=${() => save(date, { partial: !(d && d.partial) })}>${t('food.flag.partialShort')}</button>
      </div>`;
    })}</div>
  <//>`;
}
