/* Тост внизу экрана: короткое сообщение с одним действием («Отменить»), сам исчезает. Один на всё приложение. */
import { html, useEffect, useState } from './core.js';
import { t } from '../i18n/index.js';

const subs = new Set();
let current = null, timer = null, seq = 0;
function emit() { subs.forEach((f) => { try { f(current); } catch (e) { /* подписчик */ } }); }

/* toast({ text, action: { label, run }, ms }) — показать; повторный вызов заменяет предыдущий */
export function toast({ text, action = null, ms = 5000 }) {
  current = { id: ++seq, text, action };
  clearTimeout(timer);
  timer = setTimeout(hideToast, ms);
  emit();
  return current.id;
}
export function hideToast() { clearTimeout(timer); current = null; emit(); }

export function ToastHost() {
  const [cur, setCur] = useState(current);
  useEffect(() => { subs.add(setCur); return () => subs.delete(setCur); }, []);
  if (!cur) return null;
  return html`<div class="toast" role="status" aria-live="polite">
    <span class="grow">${cur.text}</span>
    ${cur.action ? html`<button class="small" onClick=${() => { const a = cur.action; hideToast(); a.run(); }}>${cur.action.label}</button>` : null}
    <button class="small icn" aria-label=${t('common.close')} onClick=${hideToast}>×</button>
  </div>`;
}
