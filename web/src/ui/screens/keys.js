/* Ключи внешних сервисов: Claude (фото еды и автозаполнение) и USDA FoodData Central (поиск продуктов).
   Хранятся только на этом телефоне и не попадают в резервную копию. */
import { html, useApp, useData, useState, useEffect, todayYmd } from '../core.js';
import { Card } from '../kit.js';
import { t } from '../../i18n/index.js';
import { getClaudeKey, setClaudeKey, testClaudeKey } from '../../services/ai-food.js';
import { getUsdaKey, setUsdaKey } from '../../services/foodsearch/index.js';
import { usageStatus } from '../../services/usage.js';
import { AI_LIMITS } from '../../config.js';
import { isArtifact } from '../../services/env.js';
import { getArtifactSample, artifactAiStatus, onArtifactAiStatus } from '../../services/ai-sample.js';

function usageLines(store) {
  return ['ai_photo', 'ai_fill'].map((f) => {
    const st = usageStatus(store, f, todayYmd());
    return t(f === 'ai_photo' ? 'keys.usage.photo' : 'keys.usage.fill', { d: st.used.day, dl: AI_LIMITS[f].day, m: st.used.month, ml: AI_LIMITS[f].month });
  });
}

/* Артефакт claude.ai: ключ не нужен, ИИ идёт через аккаунт Claude */
function ClaudeAccountCard() {
  const { store } = useApp();
  useData('usage');
  const [st, setSt] = useState(artifactAiStatus());
  useEffect(() => {
    const off = onArtifactAiStatus(() => setSt(artifactAiStatus()));
    getArtifactSample().then(() => setSt(artifactAiStatus()));
    return off;
  }, []);
  const text = st.status === 'ready' ? (st.photo ? t('keys.claude.st.ready') : t('keys.claude.st.readyNoPhoto'))
    : st.status === 'unavailable' ? t('keys.claude.st.unavailable') : st.status === 'denied' ? t('keys.claude.st.denied') : t('keys.claude.st.checking');
  return html`<${Card} title=${t('keys.claude.title')} icon="key" color="#D97757">
    <div class="hint" style="margin:0 0 12px">${t('keys.claude.artifact')}</div>
    <div class="hint io">${text}</div>
    <div class="hint">${usageLines(store).join(' · ')}</div>
  <//>`;
}

export function ClaudeKeyCard() {
  return isArtifact() ? html`<${ClaudeAccountCard}/>` : html`<${ClaudeKeyFormCard}/>`;
}

function ClaudeKeyFormCard() {
  const { store } = useApp();
  useData('usage');
  const [key, setKey] = useState('');
  const [has, setHas] = useState(!!getClaudeKey());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function check(k) {
    setBusy(true); setMsg(t('keys.claude.checking'));
    const r = await testClaudeKey(k);
    setBusy(false);
    if (r.ok) setMsg(t('keys.claude.ok'));
    else if (r.code === 'bad_key') { setClaudeKey(''); setHas(false); setMsg(t('keys.claude.bad')); }
    else if (r.code === 'network') setMsg(t('keys.claude.network'));
    else setMsg(t('keys.claude.fail', { e: r.message || r.code }));
  }
  function save() {
    const k = key.trim();
    if (!/^sk-ant-/.test(k)) { setMsg(t('keys.claude.format')); return; }
    setClaudeKey(k); setHas(true); setKey('');
    check(k);
  }
  const used = usageLines(store);
  return html`<${Card} title=${t('keys.claude.title')} icon="key" color="#D97757">
    <div class="hint" style="margin:0 0 12px">${t('keys.claude.text')}</div>
    ${has ? html`<div class="kv"><span>${t('keys.claude.saved')}</span><span>••••</span></div>
      <div class="grid2" style="margin-top:10px"><button disabled=${busy} onClick=${() => check(getClaudeKey())}>${t('keys.test')}</button><button class="danger" onClick=${() => { setClaudeKey(''); setHas(false); setMsg(t('keys.deleted')); }}>${t('keys.delete')}</button></div>`
    : html`<div class="row"><input type="password" autocomplete="off" placeholder="sk-ant-…" value=${key} onInput=${(e) => setKey(e.currentTarget.value)}/><button class="primary" onClick=${save}>${t('common.save')}</button></div>`}
    ${msg ? html`<div class="hint io">${msg}</div>` : null}
    <div class="hint">${used.join(' · ')}</div>
  <//>`;
}

export function UsdaKeyCard() {
  const [key, setKey] = useState('');
  const [has, setHas] = useState(!!getUsdaKey());
  const [msg, setMsg] = useState('');
  return html`<${Card} title=${t('keys.usda.title')} icon="search" color="#34C759">
    <div class="hint" style="margin:0 0 12px">${t('keys.usda.text')}</div>
    ${isArtifact() ? html`<div class="hint" style="margin:0 0 12px">${t('keys.usda.artifact')}</div>` : null}
    ${has ? html`<div class="kv"><span>${t('keys.usda.saved')}</span><span>••••</span></div>
      <button class="danger" style="width:100%;margin-top:10px" onClick=${() => { setUsdaKey(''); setHas(false); setMsg(t('keys.deleted')); }}>${t('keys.delete')}</button>`
    : html`<div class="row"><input type="password" autocomplete="off" placeholder=${t('keys.usda.ph')} value=${key} onInput=${(e) => setKey(e.currentTarget.value)}/><button class="primary" onClick=${() => { const k = key.trim(); if (k.length < 20) { setMsg(t('keys.usda.format')); return; } setUsdaKey(k); setHas(true); setKey(''); setMsg(t('keys.usda.ok')); }}>${t('common.save')}</button></div>`}
    ${msg ? html`<div class="hint io">${msg}</div>` : null}
  <//>`;
}
