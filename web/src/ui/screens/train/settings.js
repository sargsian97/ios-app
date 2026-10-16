/* Настройки тренировок: таймеры отдыха, звук, экран, переходы, предыдущие значения, вес тела. */
import { html, useApp, useData } from '../../core.js';
import { Page, Card, Toggle, Segmented, Row, List } from '../../kit.js';
import { t } from '../../../i18n/index.js';
import { NumIn } from '../../train/inputs.js';
import { fmtClock } from '../../train/catalog.js';

const RESTS = [['compound', 'train.set.rest.compound'], ['isolation', 'train.set.rest.isolation'], ['betweenSides', 'train.set.rest.sides'], ['afterWarmup', 'train.set.rest.warmup'], ['betweenExercises', 'train.set.rest.exercises']];

export function TrainSettings() {
  const { repos } = useApp();
  useData(['workoutProfile']);
  const p = repos.workoutProfile.get();
  const upd = (patch) => repos.workoutProfile.update(patch);
  return html`<${Page} title=${t('train.settings')} icon="gear" color="#8E8E93" back="/train" backLabel=${t('nav.train')}>
    <${Card} title=${t('train.set.rest.title')} icon="timer" color="var(--k-str)">
      ${RESTS.map(([k, l]) => html`<div class="kv wk-restrow"><span>${t(l)}</span><span class="row" style="gap:8px">
        <${NumIn} mode="numeric" cls="wk-sec" value=${p.rest[k]} label=${t(l)} onCommit=${(v) => { if (v != null && v >= 0 && v <= 3600) upd({ rest: Object.assign({}, p.rest, { [k]: Math.round(v) }) }); }}/>
        <small class="hint">${t('train.col.sec')} · ${fmtClock(p.rest[k])}</small></span></div>`)}
      <div class="hint">${t('train.set.rest.hint')}</div>
    <//>
    <${Card} title=${t('train.set.during')} icon="train" color="var(--k-str)" cls="wk-togs">
      <${Toggle} on=${p.sound} onChange=${(v) => upd({ sound: v })} label=${t('train.set.sound')} hint=${t('train.set.soundHint')}/>
      <${Toggle} on=${p.vibration} onChange=${(v) => upd({ vibration: v })} label=${t('train.set.vibration')} hint=${t('train.set.vibrationHint')}/>
      <${Toggle} on=${p.keepAwake} onChange=${(v) => upd({ keepAwake: v })} label=${t('train.set.awake')}/>
      <${Toggle} on=${p.autoAdvance} onChange=${(v) => upd({ autoAdvance: v })} label=${t('train.set.advance')} hint=${t('train.set.advanceHint')}/>
      <${Toggle} on=${p.hideDoneSets} onChange=${(v) => upd({ hideDoneSets: v })} label=${t('train.set.hideDone')}/>
      <${Toggle} on=${p.bodyweightFromTrend} onChange=${(v) => upd({ bodyweightFromTrend: v })} label=${t('train.set.bw')} hint=${t('train.set.bwHint')}/>
      <div style="margin-top:10px"><${Segmented} label=${t('train.set.prev')} value=${p.previousFrom} onChange=${(v) => upd({ previousFrom: v })} options=${[['any', t('train.set.prev.any')], ['program', t('train.set.prev.program')]]}/></div>
    <//>
    <${Card} title=${t('train.prog.title')} icon="up" color="var(--k-str)" cls="wk-togs">
      <${Toggle} on=${p.smartProgression} onChange=${(v) => upd({ smartProgression: v })} label=${t('train.prog.smart')} hint=${t('train.prog.smartHint')}/>
      <${Toggle} on=${p.autofill} onChange=${(v) => upd({ autofill: v })} label=${t('train.prog.autofill')} hint=${t('train.prog.autofillHint')}/>
      <${Toggle} on=${p.expandRepRange} onChange=${(v) => upd({ expandRepRange: v })} label=${t('train.prog.expand')} hint=${t('train.prog.expandHint')}/>
      <${Toggle} on=${p.preferPrevWeight} onChange=${(v) => upd({ preferPrevWeight: v })} label=${t('train.prog.prev')} hint=${t('train.prog.prevHint')}/>
    <//>
    <${Card} title=${t('train.wu.title')} icon="flame" color="#FF9500" cls="wk-togs">
      <${Toggle} on=${p.autoWarmup} onChange=${(v) => upd({ autoWarmup: v })} label=${t('train.wu.auto')} hint=${t('train.wu.autoHint')}/>
      <${Toggle} on=${p.warmupOnlyIfNotWorked} onChange=${(v) => upd({ warmupOnlyIfNotWorked: v })} label=${t('train.wu.onlyNew')} hint=${t('train.wu.onlyNewHint')}/>
      <${Toggle} on=${p.simplifyWarmupPlates} onChange=${(v) => upd({ simplifyWarmupPlates: v })} label=${t('train.wu.simple')} hint=${t('train.wu.simpleHint')}/>
      <div style="margin-top:10px"><${Segmented} label=${t('train.wu.scheme')} value=${['short', 'default', 'long'].includes(p.warmupScheme) ? p.warmupScheme : 'default'} onChange=${(v) => upd({ warmupScheme: v })} options=${[['short', t('train.load.sc.short')], ['default', t('train.load.sc.default')], ['long', t('train.load.sc.long')]]}/></div>
      <div class="hint">${t('train.wu.schemeHint')}</div>
    <//>
    <${List} title=${t('train.set.more')} foot=${t('train.set.bgNote')}>
      <${Row} icon="gym" color="var(--k-str)" label=${t('gym.title')} sub=${t('gym.rowSub')} href="/train/gyms"/>
      <${Row} icon="plate" color="#D7263D" label=${t('plates.title')} href="/train/plates"/>
      <${Row} icon="flame" color="#FF9500" label=${t('more.journalSettings')} sub=${t('more.journalSettings.sub')} href="/more/journal-settings"/>
    <//>
  <//>`;
}
