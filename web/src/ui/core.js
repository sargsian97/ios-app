/* Общее для экранов: Preact + htm, контекст приложения, подписки на данные, роутер. */
import { html, render, createContext, useContext, useEffect, useLayoutEffect, useState, useReducer, useRef, useMemo, useCallback, Fragment } from '../../vendor/preact-htm-10.29.8.mjs';
export { html, render, useContext, useEffect, useLayoutEffect, useState, useReducer, useRef, useMemo, useCallback, Fragment };

export const AppCtx = createContext(null);

/* memo для функционального компонента: Preact вызывает его с this = экземпляр, поэтому можно задать shouldComponentUpdate.
   eq(prev, next) — равны ли пропсы; по умолчанию — поверхностное сравнение */
function shallowEq(a, b) {
  if (a === b) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}
export function memo(C, eq = shallowEq) {
  function Memo(props) {
    if (this && !this.shouldComponentUpdate) this.shouldComponentUpdate = (next) => !eq(this.props, next);
    return C(props);
  }
  Memo.displayName = 'memo(' + (C.displayName || C.name || '') + ')';
  return Memo;
}

/* Отложенные записи (debounce): перед уходом со страницы или сворачиванием всё сбрасывается в хранилище */
const flushers = new Set();
export function registerFlush(fn) { flushers.add(fn); return () => flushers.delete(fn); }
export function flushAll() { flushers.forEach((f) => { try { f(); } catch (e) { /* не мешаем остальным */ } }); }
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  window.addEventListener('pagehide', flushAll);
}
export function useApp() { return useContext(AppCtx); }

/* Перерисовать компонент, когда меняются указанные коллекции (null — любые) */
export function useData(cols) {
  const { store } = useApp();
  const [, bump] = useReducer((x) => x + 1, 0);
  const list = cols == null ? null : [].concat(cols);
  const key = list ? list.join(',') : '*';
  useEffect(() => store.subscribe(list, bump), [key]);
  return store;
}

/* ---------- роутер на hash: #/food, #/more/profile ---------- */
export function parseHash(h) {
  const raw = String(h || '').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const clean = '/' + (path || '').split('/').filter(Boolean).join('/');
  const query = {};
  if (qs) qs.split('&').forEach((kv) => { const [k, v] = kv.split('='); if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { path: clean, parts: clean.split('/').filter(Boolean), query };
}

let depth = 0; /* сколько переходов внутри приложения можно отменить кнопкой «Назад» */
/* прокрутка: при переходе вперёд — наверх, при «Назад» — туда, где были, при replace — не трогаем */
const scrollPos = new Map();
let navKind = 'pop';

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) return;
  scrollPos.set(location.hash, window.scrollY);
  navKind = replace ? 'replace' : 'push';
  if (replace) { history.replaceState(null, '', target); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  else { depth++; location.hash = target; }
}

/* Куда прокрутить после смены адреса: число или null (не трогать) */
export function takeScroll(hash) {
  const kind = navKind;
  navKind = 'pop';
  if (kind === 'push') return 0;
  if (kind === 'replace') return null;
  return scrollPos.get(hash) || 0;
}

/* Запрет прокрутки страницы под шторкой; со счётчиком, чтобы вложенные шторки не снимали его раньше времени */
let locks = 0;
export function lockScroll() {
  locks++;
  document.body.style.overflow = 'hidden';
  let done = false;
  return () => { if (done) return; done = true; if (--locks <= 0) { locks = 0; document.body.style.overflow = ''; } };
}

/* iOS поднимает клавиатуру только из обработчика касания: в жесте фокусируем временное поле,
   а после перехода на новый экран переносим фокус на настоящее (keyboardSoon → takeKeyboard) */
let ghost = null;
export function keyboardSoon() {
  if (typeof document === 'undefined') return;
  if (!ghost) {
    ghost = document.createElement('input');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('tabindex', '-1');
    ghost.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
  }
  document.body.appendChild(ghost);
  try { ghost.focus({ preventScroll: true }); } catch (e) { /* не поддерживается */ }
  setTimeout(() => { if (ghost && ghost.parentNode && document.activeElement === ghost) ghost.blur(); if (ghost && ghost.parentNode) ghost.remove(); }, 1500);
}
export function takeKeyboard(input) {
  if (!input) return;
  try { input.focus({ preventScroll: true }); } catch (e) { /* не поддерживается */ }
  if (ghost && ghost.parentNode) ghost.remove();
}

export function goBack(fallback = '/') {
  if (depth > 0) { depth--; history.back(); }
  else navigate(fallback, { replace: true });
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/* Сегодняшняя дата 'YYYY-MM-DD' по местному времени */
export function todayYmd(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
