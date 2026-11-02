/* Кэш ответов поиска в интернете и счётчик запросов.
   Кэш — Cache API (как у сервис-воркера): ключ — адрес запроса, срок 7 дней, не больше 200 записей;
   без Cache API (тесты, приватный режим) — в памяти. Счётчик не даёт отправить больше N запросов в минуту. */

const CACHE_NAME = 'journal-search-v1';
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_ENTRIES = 200;
const memory = new Map();

async function openCache() {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null; } catch (e) { return null; }
}

/* JSON по адресу: из кэша, если не старше ttl, иначе через loader(url) с записью в кэш.
   Возвращает { data, cached }. Ошибку loader не кэширует. */
export async function cachedJson(url, loader, { ttlMs = TTL_MS, now = Date.now() } = {}) {
  const c = await openCache();
  if (c) {
    try {
      const hit = await c.match(url);
      if (hit) {
        const at = Number(hit.headers.get('x-cached-at') || 0);
        if (now - at < ttlMs) return { data: await hit.json(), cached: true };
        await c.delete(url);
      }
    } catch (e) { /* испорченная запись — перезапросим */ }
  } else {
    const m = memory.get(url);
    if (m && now - m.at < ttlMs) return { data: m.data, cached: true };
  }
  const data = await loader(url);
  if (c) {
    try {
      await c.put(url, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-cached-at': String(now) } }));
      const keys = await c.keys();
      if (keys.length > MAX_ENTRIES) await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => c.delete(k)));
    } catch (e) { /* нет места — живём без кэша */ }
  } else {
    memory.set(url, { at: now, data });
    if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
  }
  return { data, cached: false };
}

export function clearMemoryCache() { memory.clear(); }

/* Скользящее окно: allow(key) → true и запрос учитывается, false — лимит исчерпан */
export function makeBudget({ max = 8, windowMs = 60000 } = {}) {
  const windows = new Map();
  return {
    allow(key = 'off', now = Date.now()) {
      const list = (windows.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= max) { windows.set(key, list); return false; }
      list.push(now);
      windows.set(key, list);
      return true;
    },
    reset(key) { if (key) windows.delete(key); else windows.clear(); }
  };
}
export const offBudget = makeBudget({ max: 8, windowMs: 60000 });
