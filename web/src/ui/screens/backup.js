/* Резервная копия: сохранить в файл и восстановить из файла. */
import { html, useApp, useData, useState, todayYmd } from '../core.js';
import { Card, Confirm } from '../kit.js';
import { t } from '../../i18n/index.js';
import { parseBackup } from '../../data/store.js';

const WELCOME_KEY = 'journal.welcomeDone';
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } }

export function exportBackup(store) {
  const json = JSON.stringify(store.exportAll(), null, 1);
  const name = 'journal-backup-' + todayYmd() + '.json';
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
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: t('backup.shareTitle') }).then(() => name, (e) => {
      if (e && e.name === 'AbortError') return null;
      return download();
    });
  }
  return Promise.resolve(download());
}

function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json'; inp.hidden = true;
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
    inp.click();
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
    try { data = parseBackup(await f.text()); } catch (e) { setMsg(e.message); return; }
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
      setTimeout(() => location.reload(), 600);
    } catch (e) { setMsg(t('backup.failed', { e: (e && e.message) || String(e) })); }
  }
  const dialog = ask ? html`<${Confirm} text=${ask.text} yes=${t('backup.restore')} onYes=${confirm} onNo=${() => setAsk(null)}/>` : null;
  return { start, msg, dialog };
}

/* Карточка на дашборде при первом запуске, если данных ещё нет */
export function ImportCard() {
  const { store } = useApp();
  useData(['workouts', 'body', 'food', 'foods', 'templates', 'days']);
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
    try { const name = await exportBackup(store); if (name) setMsg(t('backup.saved', { name })); }
    catch (e) { setMsg(t('backup.failed', { e: (e && e.message) || String(e) })); }
  }
  return html`<${Card} title=${t('backup.title')} icon="save" color="var(--k-cal)">
    <div class="hint" style="margin:0 0 12px">${t('backup.text')}</div>
    <div class="stack"><button onClick=${save}>${t('backup.save')}</button><button onClick=${r.start}>${t('backup.load')}</button></div>
    ${msg || r.msg ? html`<div class="hint io">${msg || r.msg}</div>` : null}
    <div class="hint">${t('backup.counts', { w: c.workouts, f: c.food, b: c.body, p: c.foods })}</div>
    ${r.dialog}
  <//>`;
}
