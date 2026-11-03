/* Таймеры тренировки: тик раз в секунду, звук и вибрация в конце отдыха, «не гасить экран».
   Фоновые уведомления в PWA на iPhone недоступны: таймер считается по времени начала и верно
   показывает остаток, когда приложение снова открыто. */
import { html, useState, useEffect, useRef } from '../core.js';
import { t } from '../../i18n/index.js';
import { Ring } from '../viz.js';
import { Icon } from '../icons.js';
import { fmtClock } from './catalog.js';

/* Текущее время, обновляется раз в секунду, пока active */
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    const vis = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [active, ms]);
  return now;
}

let audio = null;
/* Звук можно включить только после касания экрана — вызываем при отметке подхода */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* без звука */ }
}

export function beep() {
  try {
    if (!audio) return;
    const t0 = audio.currentTime;
    [0, 0.25, 0.5].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g); g.connect(audio.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  } catch (e) { /* без звука */ }
}

export function vibrate() { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* нет вибрации */ } }

/* Не гасить экран, пока идёт тренировка (Screen Wake Lock; где не поддерживается — ничего не делает) */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock = null, alive = true;
    const req = () => { try { if (document.visibilityState === 'visible' && !lock) navigator.wakeLock.request('screen').then((l) => { if (!alive) { l.release(); return; } lock = l; l.addEventListener('release', () => { lock = null; }); }).catch(() => {}); } catch (e) { /* песочница или нет поддержки */ } };
    req();
    const vis = () => req();
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); if (lock) { try { lock.release().catch(() => {}); } catch (e) { /* уже снят */ } } };
  }, [on]);
}

/* Плавающая панель отдыха (стекло): кольцо отдыха, остаток крупно, что дальше, +15 / −15 с, «Пропустить» и «Начать подход»;
   по окончании — звук и вибрация. work — время нажатия «Начать подход»: тогда вместо отдыха идёт таймер подхода;
   canStart/onStart — кнопка «Начать подход»; next — подпись следующего подхода («70 кг × 12»). */
export function RestBar({ rest, work = null, canStart = false, next = null, sound, vibration, onChange, onStart = null }) {
  const now = useNow(!!rest || !!work, 500);
  const fired = useRef(null);
  const elapsed = rest ? (now - Date.parse(rest.startedAt)) / 1000 : 0;
  const left = rest ? rest.targetSec - elapsed : 0;
  const over = !!rest && left <= 0;
  useEffect(() => {
    if (!over || fired.current === rest.startedAt) return;
    fired.current = rest.startedAt;
    if (elapsed - rest.targetSec < 5) { if (sound) beep(); if (vibration) vibrate(); } /* не пищим, если отдых кончился, пока приложение было свёрнуто */
  }, [over, rest && rest.startedAt]);
  const startBtn = onStart ? html`<button class="primary wr-go" onClick=${onStart}>${t('train.rest.start')}</button>` : null;
  if (!rest && work) {
    const w = Math.max(0, (now - Date.parse(work)) / 1000);
    return html`<div class="wk-rest work" role="timer"><div class="wr-top">
      <div class="wk-rest-t"><small>${t('train.rest.work')} · ${t('train.rest.workHint')}</small><b>${fmtClock(w)}</b></div>
    </div></div>`;
  }
  if (!rest) {
    if (!canStart || !startBtn) return null;
    return html`<div class="wk-rest ready"><div class="wr-top">
      <div class="wk-rest-t"><small>${t('train.rest.ready')}</small>${next ? html`<b class="wr-sm">${next}</b>` : null}</div>${startBtn}
    </div></div>`;
  }
  const share = Math.max(0, Math.min(1, elapsed / Math.max(1, rest.targetSec)));
  const adj = (d) => onChange(Object.assign({}, rest, { targetSec: Math.max(5, Math.round(rest.targetSec + d)) }));
  return html`<div class=${'wk-rest' + (over ? ' over' : '')} role="timer" aria-live="polite">
    <div class="wr-top">
      <span class="wr-ring"><${Ring} share=${share} size=${64} width=${6}><${Icon} name="timer"/><//></span>
      <div class="wk-rest-t"><small>${over ? t('train.rest.over') : t('train.rest.title')}</small><b>${over ? '+' + fmtClock(-left) : fmtClock(left)}</b>${next ? html`<small class="wr-next">${t('train.rest.next', { s: next })}</small>` : null}</div>
      <div class="wr-adj">
        <button class="small" onClick=${() => adj(15)} aria-label=${t('train.rest.plus')}>${t('train.rest.plusShort')}</button>
        <button class="small" onClick=${() => adj(-15)} aria-label=${t('train.rest.minus')}>${t('train.rest.minusShort')}</button>
      </div>
    </div>
    <div class="wr-acts">
      <button class="wr-skip" onClick=${() => onChange(null)}>${over ? t('common.done') : t('train.rest.skip')}</button>
      ${startBtn}
    </div>
  </div>`;
}
