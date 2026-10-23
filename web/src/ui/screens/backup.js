/* Резервная копия: сохранить в файл и восстановить из файла. */
import { html, useApp, useData, useState, todayYmd } from '../core.js';
import { Card, Confirm } from '../kit.js';
import { t } from '../../i18n/index.js';
import { parseBackup } from '../../data/store.js';
import { isArtifact, claudeUse, lsGet, lsSet, safeReload } from '../../services/env.js';

const WELCOME_KEY = 'journal.welcomeDone';
function friendly(msg) { return Object.assign(new Error(msg), { friendly: true }); }

/* Сохранение через возможность downloads артефакта claude.ai.
   { status: 'saved' | 'declined' | 'unavailable' | 'failed' } — никогда не бросает */
export async function saveViaDownloads(name, json, use = claudeUse) {
  const d = await use('downloads');
  if (!d || typeof d.save !== 'function') return { status: 'unavailable' };
  try {
    await d.save({ filename: name, data: json });
    return { status: 'saved' };
  } catch (e) {
    const c = e && e.code;
    if (c === 'declined') return { status: 'declined' };
    if (c === 'rate_limited') return { status: 'failed', code: c };
    if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(c)) return { status: 'unavailable', code: c };
    return { status: 'failed', code: c || 'unknown' };
  }
}

/* Имя сохранённого файла; null — пользователь отменил; бросает Error(понятное сообщение), если сохранить нельзя */
export async function exportBackup(store) {
  const json = JSON.stringify(store.exportAll(), null, 1);
  const name = 'journal-backup-' + todayYmd() + '.json';
  /* В артефакте ссылка-скачивание молча не срабатывает (песочница), поэтому сначала downloads */
  if (isArtifact()) {
    const r = await saveViaDownloads(name, json);
    if (r.status === 'saved') return name;
    if (r.status === 'declined') return null;
    if (r.status === 'failed') throw friendly(t('backup.downloadFailed'));
  }
  let file = null;
  try { file = new File([json], name, { type: 'application/json' }); } catch (e) { /* старый Safari */ }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return name;
  }
  function fallback() {
    try { return download(); } catch (e) { throw friendly(t('backup.downloadFailed')); }
  }
  let canShare = false;
  try { canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { /* нет Web Share */ }
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: t('backup.shareTitle') });
      return name;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      return fallback();
    }
  }
  return fallback();
}

function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json'; inp.hidden = true;
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
    try { inp.click(); } catch (e) { inp.remove(); resolve(null); }
  });
}

/* Общая логика восстановления: выбрать файл → подтвердить → заменить данные → миграции → перезапуск */
function useRestore() {
  const { store, afterImport } = useApp();
  const [ask, setAsk] = useState(null);
  const [msg, setMsg] = useState('');
  async function start() {
    setMsg('');
    const f = await pickFile();
    if (!f) return;
    let data;
    let text;
    try { text = await f.text(); } catch (e) { setMsg(t('backup.readFailed')); return; }
    try { data = parseBackup(text); } catch (e) { setMsg(e.message); return; }
    const c = store.counts(data);
    setAsk({ data, text: t('backup.confirm', { w: c.workouts, f: c.food, b: c.body, p: c.foods }) });
  }
  async function confirm() {
    const data = ask.data; setAsk(null);
    try {
      await store.importAll(data);
      await afterImport();
      lsSet(WELCOME_KEY, '1');
      setMsg(t('backup.done'));
      setTimeout(() => { if (!safeReload()) setMsg(t('backup.reloadManual')); }, 600);
    } catch (e) { setMsg(t('backup.failed', { e: (e && e.message) || String(e) })); }
  }
  const dialog = ask ? html`<${Confirm} text=${ask.text} yes=${t('backup.restore')} onYes=${confirm} onNo=${() => setAsk(null)}/>` : null;
  return { start, msg, dialog };
}

/* Карточка на дашборде при первом запуске, если данных ещё нет */
export function ImportCard() {
  const { store } = useApp();
  useData(['workouts', 'body', 'food', 'foods', 'templates', 'days', 'foodEntries', 'scaleEntries', 'workoutLogs']);
  const [skipped, setSkipped] = useState(lsGet(WELCOME_KEY) === '1');
  const r = useRestore();
  if (skipped || !store.isEmpty()) return null;
  return html`<${Card} cls="welcome" title=${t('backup.welcome.title')} icon="save" color="var(--k-plan)">
    <div class="hint" style="margin:0 0 12px">${t('backup.welcome.text')}</div>
    <div class="grid2">
      <button class="primary" onClick=${r.start}>${t('backup.pick')}</button>
      <button onClick=${() => { lsSet(WELCOME_KEY, '1'); setSkipped(true); }}>${t('backup.welcome.skip')}</button>
    </div>
    ${r.msg ? html`<div class="hint io">${r.msg}</div>` : null}
    ${r.dialog}
  <//>`;
}

/* Карточка в настройках */
export function BackupCard() {
  const { store } = useApp();
  useData(null);
  const r = useRestore();
  const [msg, setMsg] = useState('');
  const c = store.counts();
  async function save() {
    setMsg('');
    try { const name = await exportBackup(store); if (name) setMsg(isArtifact() ? t('backup.downloadSaved', { name }) : t('backup.saved', { name })); }
    catch (e) { setMsg(e && e.friendly ? e.message : t('backup.failed', { e: (e && e.message) || String(e) })); }
  }
  return html`<${Card} title=${t('backup.title')} icon="save" color="var(--k-cal)">
    <div class="hint" style="margin:0 0 12px">${t('backup.text')}</div>
    <div class="stack"><button onClick=${save}>${t('backup.save')}</button><button onClick=${r.start}>${t('backup.load')}</button></div>
    ${msg || r.msg ? html`<div class="hint io">${msg || r.msg}</div>` : null}
    <div class="hint">${t('backup.counts', { w: c.workouts, f: c.food, b: c.body, p: c.foods })}</div>
    ${r.dialog}
  <//>`;
}
