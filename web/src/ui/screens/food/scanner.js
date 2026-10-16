/* Сканер штрихкода: камера с рамкой, распознавание кадров, ручной ввод номера, фото кода. */
import { html, useEffect, useRef, useState } from '../../core.js';
import { Icon } from '../../icons.js';
import { t } from '../../../i18n/index.js';
import { decodeImageData, decodeFile, validBarcode } from '../../../services/barcode.js';

export function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const file = useRef(null);
  const [state, setState] = useState('starting'); /* starting | scanning | denied | unsupported */
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let stream = null, stop = false, timer = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setState('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) { setState('denied'); return; }
      if (stop) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      const v = video.current;
      v.srcObject = stream;
      v.setAttribute('playsinline', '');
      try { await v.play(); } catch (e) { /* автозапуск видео без звука разрешён */ }
      setState('scanning');
      tick();
    }
    async function tick() {
      if (stop) return;
      const v = video.current;
      if (v && v.videoWidth) {
        /* центральная полоса кадра — там рамка */
        const w = Math.min(960, v.videoWidth), k = w / v.videoWidth;
        const h = Math.round(v.videoHeight * k * 0.5);
        canvas.width = w; canvas.height = h;
        ctx.drawImage(v, 0, v.videoHeight * 0.25, v.videoWidth, v.videoHeight * 0.5, 0, 0, w, h);
        try {
          const code = await decodeImageData(ctx.getImageData(0, 0, w, h));
          if (code && !stop) { stop = true; onCode(code); return; }
        } catch (e) { /* пробуем следующий кадр */ }
      }
      timer = setTimeout(tick, 180);
    }
    start();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((tr) => tr.stop()); };
  }, []);

  async function fromPhoto(f) {
    if (!f) return;
    setMsg(t('food.scan.reading'));
    try {
      const code = await decodeFile(f);
      if (code) onCode(code); else setMsg(t('food.scan.photoNone'));
    } catch (e) { setMsg(t('food.scan.photoNone')); }
  }

  function submit(e) {
    e.preventDefault();
    const c = manual.replace(/\D/g, '');
    if (c.length < 6) { setMsg(t('food.scan.short')); return; }
    if ([8, 12, 13].includes(c.length) && !validBarcode(c)) { setMsg(t('food.scan.checksum')); return; }
    onCode(c);
  }

  return html`<div class="scanner" role="dialog" aria-modal="true" aria-label=${t('food.scan.title')}>
    <video ref=${video} muted playsinline></video>
    <div class="sc-frame"><i></i></div>
    <div class="sc-top row">
      <b class="grow">${t('food.scan.title')}</b>
      <button class="small icn" aria-label=${t('common.close')} onClick=${onClose}><${Icon} name="close" size=${16}/></button>
    </div>
    <div class="sc-bottom">
      <div class="sc-msg">${msg || (state === 'scanning' ? t('food.scan.aim') : state === 'denied' ? t('food.scan.denied') : state === 'unsupported' ? t('food.scan.unsupported') : t('food.scan.starting'))}</div>
      <form class="row" onSubmit=${submit}>
        <input inputmode="numeric" placeholder=${t('food.scan.manual')} value=${manual} onInput=${(e) => setManual(e.currentTarget.value)} aria-label=${t('food.scan.manual')}/>
        <button class="primary" type="submit">${t('food.scan.find')}</button>
      </form>
      <input ref=${file} type="file" accept="image/*" hidden onChange=${(e) => fromPhoto(e.currentTarget.files[0])}/>
      <button class="linkbtn" onClick=${() => { file.current.value = ''; file.current.click(); }}>${t('food.scan.fromPhoto')}</button>
    </div>
  </div>`;
}
