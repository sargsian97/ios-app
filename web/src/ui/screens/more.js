/* «Ещё»: профиль, разделы журнала, настройки, о приложении. */
import { html, useApp, useData, todayYmd } from '../core.js';
import { Page, List, Row } from '../kit.js';
import { t, fmtNum } from '../../i18n/index.js';
import { cmToFtIn } from '../../domain/units.js';
import { ageOn } from './profile.js';
import { APP_VERSION } from '../../version.js';

function heightText(p) {
  if (!p.heightCm) return null;
  if (p.units.length === 'in') { const x = cmToFtIn(p.heightCm); return x.ft + ' ' + t('unit.ft') + ' ' + x.inch + ' ' + t('unit.in'); }
  return fmtNum(p.heightCm) + ' ' + t('unit.cm');
}

export function More() {
  const { repos } = useApp();
  useData('profile');
  const p = repos.profile.get();
  const age = ageOn(p.birthDate, todayYmd());
  const bits = [p.sex === 'male' ? t('profile.sex.male') : p.sex === 'female' ? t('profile.sex.female') : null, age != null ? t('profile.age', { count: age }) : null, heightText(p)].filter(Boolean);

  return html`<${Page} title=${t('nav.more')} icon="more" color="linear-gradient(135deg,#A1A1AA,#636366)">
    <${List}>
      <${Row} icon="user" color="#5856D6" label=${p.name || t('profile.title')} sub=${bits.length ? bits.join(' · ') : t('more.profile.empty')} href="/more/profile"/>
    <//>
    <${List}>
      <${Row} icon="target" color="#0A84FF" label=${t('goal.title')} sub=${t('more.goal.sub')} href="/more/goal"/>
      <${Row} icon="flame" color="#FF9500" label=${t('tdee.title')} sub=${t('more.tdee.sub')} href="/more/expenditure"/>
    <//>
    <${List} title=${t('more.journal')}>
      <${Row} icon="scale" color="#AF52DE" label=${t('more.body')} href="/more/body"/>
      <${Row} icon="cal" color="#14B8A6" label=${t('more.history')} href="/more/history"/>
      <${Row} icon="list" color="#007AFF" label=${t('more.templates')} href="/more/templates"/>
    <//>
    <${List} title=${t('more.settings')}>
      <${Row} icon="gear" color="#8E8E93" label=${t('settings.title')} sub=${t('more.settings.sub')} href="/more/settings"/>
      <${Row} icon="flame" color="#FF9500" label=${t('more.journalSettings')} sub=${t('more.journalSettings.sub')} href="/more/journal-settings"/>
    <//>
    <${List} title=${t('more.food')}>
      <${Row} icon="food" color="#FF3B30" label=${t('food.library')} href="/food/library"/>
      <${Row} icon="list" color="#FF9500" label=${t('food.recipes')} href="/food/recipes"/>
    <//>
    <${List} title=${t('more.about')}>
      <${Row} icon="info" color="#34C759" label=${t('about.title')} value=${APP_VERSION} href="/more/about"/>
    <//>
  <//>`;
}

export function About() {
  return html`<${Page} title=${t('about.title')} icon="info" color="linear-gradient(135deg,#5BE7DA,#14B8A6)" back="/more" backLabel=${t('nav.more')}>
    <div class="card pad">
      <p class="about-p">${t('about.text')}</p>
      <div class="kv"><span>${t('about.version')}</span><span>${APP_VERSION}</span></div>
      <div class="kv"><span>${t('about.storage')}</span><span>${t('about.storage.v')}</span></div>
    </div>
    <div class="ltitle">${t('about.sources')}</div>
    <div class="card pad">
      <div class="src"><b>Preact, htm</b><span>MIT, Apache 2.0</span></div>
      <div class="src"><b>Anthropic TypeScript SDK</b><span>MIT</span></div>
      <div class="hint">${t('about.sources.more')}</div>
    </div>
  <//>`;
}
