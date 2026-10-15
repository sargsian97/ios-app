/* Настройки приложения: тема, единицы, язык, аккаунт, данные. */
import { html, useApp, useData } from '../core.js';
import { Page, Card, Segmented, List, Row } from '../kit.js';
import { t } from '../../i18n/index.js';
import { DEFAULT_UNITS, IMPERIAL } from '../../domain/units.js';
import { BackupCard } from './backup.js';

export function Settings() {
  const { repos, sync } = useApp();
  useData('profile');
  const p = repos.profile.get();
  const u = p.units;
  const setU = (k, v) => repos.profile.update({ units: { ...u, [k]: v } });
  const same = (a) => Object.keys(a).every((k) => a[k] === u[k]);

  return html`<${Page} title=${t('settings.title')} icon="gear" color="linear-gradient(135deg,#A1A1AA,#636366)" back="/more" backLabel=${t('nav.more')}>
    <${Card} title=${t('settings.look')} icon="sun" color="var(--k-steps)">
      <${Segmented} value=${p.theme} onChange=${(v) => repos.profile.update({ theme: v })}
        options=${[['system', t('settings.theme.system')], ['light', t('settings.theme.light')], ['dark', t('settings.theme.dark')]]}/>
    <//>

    <${Card} title=${t('settings.units')} icon="ruler" color="var(--k-plan)">
      <div class="pills" style="margin:0 0 6px">
        <button class=${'pill' + (same(DEFAULT_UNITS) ? ' on' : '')} onClick=${() => repos.profile.update({ units: { ...DEFAULT_UNITS } })}>${t('settings.units.metric')}</button>
        <button class=${'pill' + (same(IMPERIAL) ? ' on' : '')} onClick=${() => repos.profile.update({ units: { ...IMPERIAL } })}>${t('settings.units.imperial')}</button>
      </div>
      <div class="ustack">
        <${Segmented} label=${t('settings.units.weight')} value=${u.weight} onChange=${(v) => setU('weight', v)} options=${[['kg', t('unit.kg')], ['lb', t('unit.lb')]]}/>
        <${Segmented} label=${t('settings.units.length')} value=${u.length} onChange=${(v) => setU('length', v)} options=${[['cm', t('unit.cm')], ['in', t('unit.in')]]}/>
        <${Segmented} label=${t('settings.units.energy')} value=${u.energy} onChange=${(v) => setU('energy', v)} options=${[['kcal', t('unit.kcal')], ['kj', t('unit.kj')]]}/>
        <${Segmented} label=${t('settings.units.distance')} value=${u.distance} onChange=${(v) => setU('distance', v)} options=${[['km', t('unit.km')], ['mi', t('unit.mi')]]}/>
        <${Segmented} label=${t('settings.units.clock')} value=${u.clock} onChange=${(v) => setU('clock', v)} options=${[['24h', t('settings.clock.24')], ['12h', t('settings.clock.12')]]}/>
      </div>
      <div class="hint">${t('settings.units.legacy')}</div>
    <//>

    <${List} title=${t('settings.lang')} foot=${t('settings.lang.hint')}>
      <${Row} icon="globe" color="#34C759" label=${t('settings.lang.ru')} value=${'✓'} chevron=${false}/>
    <//>

    <${List} title=${t('settings.account')} foot=${t('settings.account.local')}>
      <${Row} icon="cloud" color="#5AC8FA" label=${t('settings.account.mode')} value=${sync.id === 'local' ? t('settings.account.localShort') : sync.id} chevron=${false}/>
      <${Row} icon="user" color="#AF52DE" label=${t('settings.account.signin')} disabled=${true} badge=${t('common.soon')}/>
    <//>

    <${BackupCard}/>
  <//>`;
}
