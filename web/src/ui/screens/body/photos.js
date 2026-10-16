/* Фото прогресса: спереди, сбоку, сзади; галерея по датам; сравнение «до / после».
   Снимки лежат в хранилище файлов на телефоне (в резервную копию не попадают). */
import { html, useApp, useData, useState, useEffect, useRef, todayYmd } from '../../core.js';
import { Page, Sheet, Segmented, Confirm, Field } from '../../kit.js';
import { Icon } from '../../icons.js';
import { t, fmtNum, fmtDate } from '../../../i18n/index.js';
import { uid } from '../../../data/ids.js';
import { poseLabel } from './labels.js';
import { toDisplay, unitKey } from '../../../domain/units.js';

/* Уменьшить фото до 1600 px по длинной стороне, JPEG */
export async function shrink(file, maxSide = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((resolve) => cv.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85));
}

export function BlobImg({ id, alt, cls, onClick }) {
  const { blobs } = useApp();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null, live = true;
    blobs.get(id).then((b) => { if (live && b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return html`<button class=${'bimg ' + (cls || '')} onClick=${onClick} aria-label=${alt}>${url ? html`<img src=${url} alt=${alt}/>` : html`<span class="bimg-ph"></span>`}</button>`;
}

export function PhotoThumbs({ limit = 4 }) {
  const { repos } = useApp();
  useData('progressPhotos');
  const list = repos.progressPhoto.list().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, limit);
  if (!list.length) return html`<div class="hint" style="margin:0">${t('body.photos.empty')}</div>`;
  return html`<div class="thumbs">${list.map((p) => html`<div class="thumb"><${BlobImg} id=${p.blobId} alt=${poseLabel(p.pose) + ' ' + fmtDate(p.date)}/><span>${fmtDate(p.date)}</span></div>`)}</div>`;
}

export function Photos() {
  const { repos, blobs } = useApp();
  useData(['progressPhotos', 'scaleEntries']);
  const [pose, setPose] = useState('all');
  const [add, setAdd] = useState(false);
  const [view, setView] = useState(null);
  const [compare, setCompare] = useState([]);
  const [comparing, setComparing] = useState(false);
  const units = repos.profile.get().units;
  const all = repos.progressPhoto.list().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const list = pose === 'all' ? all : all.filter((p) => p.pose === pose);
  const byDate = {};
  list.forEach((p) => { (byDate[p.date] = byDate[p.date] || []).push(p); });
  const pick = (p) => {
    if (!comparing) { setView(p); return; }
    setCompare((c) => (c.find((x) => x.id === p.id) ? c.filter((x) => x.id !== p.id) : c.concat([p]).slice(-2)));
  };
  return html`<${Page} title=${t('body.photos')} back="/more/body" backLabel=${t('body.title')}
      right=${html`<button class="small" onClick=${() => setAdd(true)}>${t('body.photos.add')}</button>`}>
    <${Segmented} value=${pose} onChange=${setPose} options=${[['all', t('body.pose.all')], ['front', t('body.pose.front')], ['side', t('body.pose.side')], ['back', t('body.pose.back')]]}/>
    <div class="row" style="justify-content:space-between;margin:12px 4px">
      <span class="hint" style="margin:0">${comparing ? t('body.photos.pickTwo', { n: compare.length }) : t('body.photos.count', { count: all.length })}</span>
      ${all.length > 1 ? html`<button class="small" onClick=${() => { setComparing(!comparing); setCompare([]); }}>${comparing ? t('common.cancel') : t('body.photos.compare')}</button>` : null}
    </div>
    ${comparing && compare.length === 2 ? html`<div class="card pad compare">
      ${compare.slice().sort((a, b) => a.date.localeCompare(b.date)).map((p) => html`<div><${BlobImg} id=${p.blobId} alt=${fmtDate(p.date)}/><b>${fmtDate(p.date)}</b>${p.weightKg ? html`<span>${fmtNum(toDisplay('weight', p.weightKg, units), 1)} ${t(unitKey('weight', units))}</span>` : null}</div>`)}
    </div>` : null}
    ${Object.keys(byDate).length ? Object.keys(byDate).map((d) => html`<div class="ltitle">${fmtDate(d, 'full')}</div>
      <div class="pgrid">${byDate[d].map((p) => html`<div class=${'pcell' + (compare.find((x) => x.id === p.id) ? ' sel' : '')}><${BlobImg} id=${p.blobId} alt=${poseLabel(p.pose)} onClick=${() => pick(p)}/><span>${poseLabel(p.pose)}</span></div>`)}</div>`)
      : html`<div class="card pad empty">${t('body.photos.empty')}</div>`}
    <${AddPhoto} open=${add} onClose=${() => setAdd(false)}/>
    <${ViewPhoto} photo=${view} onClose=${() => setView(null)} onDelete=${async (p) => { setView(null); await repos.progressPhoto.remove(p.id); await blobs.remove(p.blobId); }}/>
  <//>`;
}

function AddPhoto({ open, onClose }) {
  const { repos, blobs } = useApp();
  const [pose, setPose] = useState('front');
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const cam = useRef(null), gal = useRef(null);
  useEffect(() => { if (open) { setDate(todayYmd()); setMsg(''); } }, [open]);
  if (!open) return null;
  async function save(file) {
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const blob = await shrink(file);
      const id = 'ph-' + uid();
      await blobs.put(id, blob);
      const w = repos.scaleEntry.list((s) => s.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
      await repos.progressPhoto.create({ date, pose, blobId: id, weightKg: w ? w.weightKg : null });
      setBusy(false); onClose();
    } catch (e) { setBusy(false); setMsg(t('body.photos.failed')); }
  }
  const choose = (ref) => { ref.current.value = ''; ref.current.click(); };
  return html`<${Sheet} open=${true} onClose=${onClose} title=${t('body.photos.add')}>
    <${Segmented} value=${pose} onChange=${setPose} options=${[['front', t('body.pose.front')], ['side', t('body.pose.side')], ['back', t('body.pose.back')]]}/>
    <div style="margin-top:12px"><${Field} label=${t('body.date')}><input type="date" value=${date} max=${todayYmd()} onChange=${(e) => setDate(e.currentTarget.value || date)}/><//></div>
    <input ref=${cam} type="file" accept="image/*" capture="user" hidden onChange=${(e) => save(e.currentTarget.files[0])}/>
    <input ref=${gal} type="file" accept="image/*" hidden onChange=${(e) => save(e.currentTarget.files[0])}/>
    <div class="grid2" style="margin-top:14px">
      <button class="ib" disabled=${busy} onClick=${() => choose(cam)}><${Icon} name="camera"/>${t('food.photo.camera')}</button>
      <button class="ib" disabled=${busy} onClick=${() => choose(gal)}><${Icon} name="search"/>${t('food.photo.gallery')}</button>
    </div>
    <div class="hint">${msg || t('body.photos.privacy')}</div>
  <//>`;
}

function ViewPhoto({ photo, onClose, onDelete }) {
  const { repos } = useApp();
  const units = repos.profile.get().units;
  const [del, setDel] = useState(false);
  if (!photo) return null;
  return html`<${Sheet} open=${true} onClose=${onClose} title=${poseLabel(photo.pose) + ' · ' + fmtDate(photo.date)}>
    <${BlobImg} id=${photo.blobId} alt=${poseLabel(photo.pose)} cls="big"/>
    ${photo.weightKg ? html`<div class="hint">${t('body.photos.weight', { v: fmtNum(toDisplay('weight', photo.weightKg, units), 1), u: t(unitKey('weight', units)) })}</div>` : null}
    <button class="danger" style="width:100%;margin-top:12px" onClick=${() => setDel(true)}>${t('food.delete')}</button>
    ${del ? html`<${Confirm} text=${t('body.photos.confirmDelete')} yes=${t('food.delete')} danger=${true} onNo=${() => setDel(false)} onYes=${() => { setDel(false); onDelete(photo); }}/>` : null}
  <//>`;
}
