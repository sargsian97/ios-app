/* «Ещё»: профиль, разделы журнала, настройки, о приложении. */
import { html, useApp, useData, useState, useEffect, todayYmd } from '../core.js';
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
    <${List} title=${t('more.goals')}>
      <${Row} icon="target" color="#0A84FF" label=${t('goal.title')} sub=${t('more.goal.sub')} href="/more/goal"/>
      <${Row} icon="flame" color="#FF9500" label=${t('tdee.title')} sub=${t('more.tdee.sub')} href="/more/expenditure"/>
      <${Row} icon="flame" color="#FF6B2C" label=${t('more.journalSettings')} sub=${t('more.journalSettings.sub')} href="/more/expenditure?s=journal"/>
      <${Row} icon="heart" color="#FF2D55" label=${t('micro.title')} sub=${t('more.micro.sub')} href="/more/micro"/>
      <${Row} icon="cal" color="#0A84FF" label=${t('ci.title')} sub=${t('more.checkin.sub')} href="/more/checkin-settings"/>
    <//>
    <${List} title=${t('more.food')}>
      <${Row} icon="food" color="#FF3B30" label=${t('food.library')} sub=${t('more.library.sub')} href="/food/library"/>
      <${Row} icon="list" color="#FF9500" label=${t('food.recipes')} href="/food/recipes"/>
      <${Row} icon="gear" color="#FF7A6E" label=${t('food.settings')} sub=${t('more.foodSettings.sub')} href="/food/settings"/>
    <//>
    <${List} title=${t('more.train')}>
      <${Row} icon="list" color="#5856D6" label=${t('more.templates')} href="/more/templates"/>
      <${Row} icon="bolt" color="#8A87FF" label=${t('prog.title')} sub=${t('more.programs.sub')} href="/train/programs"/>
      <${Row} icon="gym" color="#D7263D" label=${t('more.gyms')} sub=${t('more.gyms.sub')} href="/train/gyms"/>
      <${Row} icon="gear" color="#7C7CFF" label=${t('train.settings')} href="/train/settings"/>
    <//>
    <${List} title=${t('more.journal')}>
      <${Row} icon="cal" color="#14B8A6" label=${t('more.history')} sub=${t('more.history.sub')} href="/more/history"/>
      <${Row} icon="list" color="#30B0C7" label=${t('food.days')} sub=${t('more.days.sub')} href="/food/days"/>
    <//>
    <${List} title=${t('more.settings')}>
      <${Row} icon="gear" color="#8E8E93" label=${t('settings.title')} sub=${t('more.settings.sub')} href="/more/settings"/>
      <${Row} icon="save" color="#14B8A6" label=${t('backup.title')} sub=${t('more.backup.sub')} href="/more/backup"/>
    <//>
    <${List} title=${t('more.about')}>
      <${Row} icon="info" color="#34C759" label=${t('about.title')} href="/more/about"/>
    <//>
  <//>`;
}

/* Сколько места занято на телефоне и защищено ли хранилище от очистки */
export function useStorageInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
        if (on) setInfo({ usage: est ? est.usage || 0 : null, quota: est ? est.quota || 0 : null, persisted });
      } catch (e) { if (on) setInfo({ usage: null, quota: null, persisted: null }); }
    })();
    return () => { on = false; };
  }, []);
  return info;
}
const mb = (b) => fmtNum(Math.round(b / 1048576 * 10) / 10, 1);

export function About() {
  const info = useStorageInfo();
  return html`<${Page} title=${t('about.title')} icon="info" color="linear-gradient(135deg,#5BE7DA,#14B8A6)" back="/more" backLabel=${t('nav.more')}>
    <div class="card pad">
      <p class="about-p">${t('about.text')}</p>
      <div class="kv"><span>${t('about.version')}</span><span>${APP_VERSION}</span></div>
      <div class="kv"><span>${t('about.storage')}</span><span>${info && info.usage != null ? t('about.storage.used', { u: mb(info.usage), q: mb(info.quota) }) : t('about.storage.v')}</span></div>
      ${info && info.persisted != null ? html`<div class="kv"><span>${t('about.persist')}</span><span>${info.persisted ? t('about.persist.yes') : t('about.persist.no')}</span></div>` : null}
    </div>
    <div class="ltitle">${t('about.sources')}</div>
    <div class="card pad">
      <div class="src"><b>Preact, htm</b><span>MIT, Apache 2.0</span></div>
      <div class="src"><b>Anthropic TypeScript SDK</b><span>MIT</span></div>
      <div class="src"><b>USDA FoodData Central (SR Legacy)</b><span>CC0</span></div>
      <div class="src"><b>Open Food Facts</b><span>ODbL</span></div>
      <div class="src"><b>free-exercise-db</b><span>Unlicense</span></div>
      <div class="hint">${t('about.sources.more')}</div>
    </div>
  <//>`;
}
