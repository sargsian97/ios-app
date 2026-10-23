/* Среда запуска: обычное приложение (PWA на телефоне) или артефакт claude.ai —
   страница в песочнице (iframe) без service worker, со строгой CSP. Страница артефакта
   ставит window.JOURNAL_ARTIFACT = true до загрузки src/main.js. */

export function isArtifact(g = globalThis) {
  try { return !!(g && g.JOURNAL_ARTIFACT); } catch (e) { return false; }
}

/* Возможность артефакта (window.claude.use(name)) или null, если её нет; никогда не бросает */
export function claudeUse(name, g = globalThis) {
  try {
    const c = g && g.claude;
    if (!c || typeof c.use !== 'function') return Promise.resolve(null);
    return Promise.resolve(c.use(name)).then((x) => x || null, () => null);
  } catch (e) { return Promise.resolve(null); }
}

/* localStorage в песочнице или приватном режиме может бросать — всегда через эти обёртки */
export function lsGet(k) { try { return globalThis.localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { globalThis.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
export function lsRemove(k) { try { globalThis.localStorage.removeItem(k); return true; } catch (e) { return false; } }

/* Перезагрузка страницы; false — если среда её не дала (тогда просим перезагрузить вручную) */
export function safeReload() {
  try { globalThis.location.reload(); return true; } catch (e) { return false; }
}
