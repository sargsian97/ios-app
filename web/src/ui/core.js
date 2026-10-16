/* Общее для экранов: Preact + htm, контекст приложения, подписки на данные, роутер. */
import { html, render, createContext, useContext, useEffect, useLayoutEffect, useState, useReducer, useRef, useMemo, useCallback, Fragment } from '../../vendor/preact-htm-10.29.8.mjs';
export { html, render, useContext, useEffect, useLayoutEffect, useState, useReducer, useRef, useMemo, useCallback, Fragment };

export const AppCtx = createContext(null);
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

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) return;
  if (replace) { history.replaceState(null, '', target); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  else { depth++; location.hash = target; }
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

/* Перерисовать компонент, когда меняются данные старого журнала (расход, шаги, тренировки) */
export function useLegacy() {
  const { legacy } = useApp();
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => legacy.listen(bump), []);
  return legacy;
}
