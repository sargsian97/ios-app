/* Калькулятор блинов: вес → блины на сторону (или на одну сторону) по блинам зала, превью грифа,
   выбор грифа, смещение веса, ближайшие собираемые веса. */
import { html, useApp, useData, useState, navigate } from '../../core.js';
import { Page, Card, Segmented, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum } from '../../../i18n/index.js';
import { gymFromTemplate, platesKg, loadoutFor, defaultGym } from '../../../domain/gym.js';
import { achievableLoads } from '../../../domain/calc/index.js';
import { toDisplay, fromDisplay } from '../../../domain/units.js';
import { NumIn } from '../../train/inputs.js';
import { BarPreview } from '../../train/bar.js';
import { weightUnit, barLabel } from '../../train/catalog.js';

const NO_BAR = { id: 'none', name: 'none', weight: 0 };

export function PlateCalculator({ route }) {
  const { repos } = useApp();
  useData(['gyms', 'workoutProfile', 'profile']);
  const units = repos.profile.get().units;
  const gyms = repos.gym.list().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const prof = repos.workoutProfile.get();
  const [gymId, setGymId] = useState(route.query.gym || (defaultGym(gyms, prof) || {}).id || '');
  const gym = repos.gym.get(gymId) || Object.assign({ id: '', name: t('plates.typical') }, gymFromTemplate('commercial'));
  const bars = (gym.bars || []).concat([NO_BAR]);
  const [barId, setBarId] = useState(route.query.bar || (bars[0] && bars[0].id));
  const [mode, setMode] = useState('per_side');
  const [offset, setOffset] = useState(0);
  const q = Number(route.query.w);
  const [target, setTarget] = useState(isFinite(q) && q > 0 ? q : 60);
  const bar = bars.find((b) => b.id === barId) || bars[0];
  const base = bar.weight + (offset || 0);
  const plates = platesKg(gym);
  let r = null, loads = [];
  try { r = loadoutFor({ target, barWeight: base, plates, mode }); } catch (e) { r = null; }
  try { loads = plates.length ? achievableLoads({ barWeight: base, plates, mode, max: Math.max(target * 1.5, base + 50) }) : [base]; } catch (e) { loads = []; }
  const up = loads.find((w) => w > target + 1e-6);
  const w = (kg) => fmtNum(Math.round(toDisplay('weight', kg, units) * 100) / 100, 2);
  const u = weightUnit(units);
  const step = units && units.weight === 'lb' ? fromDisplay('weight', 5, units) : 2.5;
  const mixed = plates.some((p) => p.unit === 'lb');
  const plateText = (p) => fmtNum(p.label, 2) + (mixed ? ' ' + (p.unit === 'lb' ? t('unit.lb') : t('unit.kg')) : '');

  return html`<${Page} title=${t('plates.title')} icon="plate" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/train" backLabel=${t('nav.train')}>
    <div class="card pad pc-main">
      <div class="pc-row">
        <button class="small icn" aria-label=${t('plates.minus')} onClick=${() => setTarget(Math.max(0, Math.round((target - step) * 1000) / 1000))}>−</button>
        <label class="pc-target"><${NumIn} cls="bigin" value=${toDisplay('weight', target, units)} label=${t('plates.target')} onCommit=${(v) => { if (v != null && v >= 0) setTarget(fromDisplay('weight', v, units)); }}/><span>${u}</span></label>
        <button class="small icn" aria-label=${t('plates.plus')} onClick=${() => setTarget(Math.round((target + step) * 1000) / 1000)}>+</button>
      </div>
      <${BarPreview} items=${r && !r.belowBar ? r.items : []} mode=${mode}/>
      ${!r ? null : r.belowBar ? html`<div class="banner">${t('plates.belowBar', { w: w(base), u })}</div>` : html`
        <div class="pc-res">${r.items.length ? html`<b>${mode === 'per_side' ? t('plates.perSide') : t('plates.oneSide')}:</b> ${r.items.map(plateText).join(' · ')}${mixed ? '' : ' ' + t('unit.kg')}` : html`<b>${t('plates.barOnly')}</b>`}</div>
        <div class="kv"><span>${t('plates.total')}</span><span><b>${w(r.total)} ${u}</b></span></div>
        ${!r.exact ? html`<div class="banner warnb">${t('plates.notExact', { lo: w(r.total), hi: up != null ? w(up) : '—', u })}</div>` : null}`}
    </div>
    <${Card} title=${t('plates.setup')} icon="gear" color="#8E8E93">
      ${gyms.length ? html`<div class="lbl">${t('plates.gym')}</div>
        <div class="wk-chips pick">${gyms.map((g) => html`<button class=${'chip' + (g.id === gym.id ? ' on' : '')} onClick=${() => { setGymId(g.id); setBarId((g.bars[0] || NO_BAR).id); }}>${g.name}</button>`)}</div>`
        : html`<p class="hint">${t('plates.noGym')}</p>`}
      <div class="lbl">${t('plates.bar')}</div>
      <div class="wk-chips pick">${bars.map((b) => html`<button class=${'chip' + (b.id === bar.id ? ' on' : '')} onClick=${() => setBarId(b.id)}>${b.id === 'none' ? t('plates.noBar') : barLabel(b.name) + ' · ' + w(b.weight)}</button>`)}</div>
      <${Segmented} label=${t('plates.mode')} value=${mode} onChange=${setMode} options=${[['per_side', t('plates.mode.per')], ['one_side', t('plates.mode.one')]]}/>
      <${Field} label=${t('plates.offset')} hint=${t('plates.offsetHint')}><${NumIn} value=${offset ? toDisplay('weight', offset, units) : null} placeholder="0" label=${t('plates.offset')} onCommit=${(v) => setOffset(v == null ? 0 : fromDisplay('weight', v, units))}/><//>
      <div class="hint">${plates.length ? t('plates.have', { list: plates.map((p) => plateText(p) + ' × ' + p.count).join(', ') }) : t('plates.noPlates')}</div>
      <button class="wk-more" onClick=${() => navigate(gym.id ? '/train/gym/' + encodeURIComponent(gym.id) : '/train/gyms')}><${Icon} name="gym"/> ${gym.id ? t('plates.editGym') : t('plates.makeGym')}</button>
    <//>
  <//>`;
}
