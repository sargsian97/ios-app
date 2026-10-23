/* ИИ в артефакте claude.ai: возможность sample (запрос к Claude на аккаунте того, кто открыл
   журнал; ключ API не нужен). Обёртка даёт тот же интерфейс, что createSample(apiKey) из web/ai.js:
   json(prompt, { schema, images, modelTier, signal }) и limits(). Схема ответа дописывается
   в текст запроса, фото уменьшается и кодируется в JPEG в пределах limits().images.maxInputBytes,
   ошибки sample переводятся в коды приложения (ai.err.* в i18n). */
import { withSchema } from './ai-schemas.js';
import { claudeUse } from './env.js';

/* Коды sample, после которых ИИ в этом окне больше не работает */
export const HIDE_CODES = Object.freeze(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);
const BAD_REQUEST = ['invalid_request', 'prompt_too_large', 'transform_error', 'queue_overflow', 'tools_unavailable'];

function err(code, extra) { return Object.assign(new Error(code), { code }, extra || {}); }

/* Ошибка sample ({code, message, text?}) → Error с кодом приложения; исходный код — в sampleCode */
export function mapSampleError(e) {
  if (e && e.fromApp) return e;
  const c = e && typeof e === 'object' ? e.code : null;
  const extra = { sampleCode: c || null };
  if (e && typeof e.text === 'string') extra.text = e.text;
  let code;
  if (c === 'cancelled') code = 'cancelled';
  else if (HIDE_CODES.includes(c)) code = 'not_granted';
  else if (c === 'session_expired') code = 'session_expired';
  else if (c === 'images_unavailable') code = 'images_unavailable';
  else if (c === 'image_rejected') code = 'image_rejected';
  else if (c === 'rate_limited') code = 'rate_limited';
  else if (c === 'refused') code = 'refused';
  else if (c === 'invalid_json' || c === 'empty_completion') code = 'invalid_json';
  else if (BAD_REQUEST.includes(c)) code = 'bad_request';
  else if (e && e.name === 'AbortError') code = 'cancelled';
  else code = 'server'; /* upstream_error и неизвестные коды */
  return err(code, extra);
}

/* ---------- фото ---------- */

/* Ступени уменьшения: сначала как с ключом API (1568 px, JPEG 0.85), дальше меньше и сильнее сжатие */
export const IMAGE_STEPS = Object.freeze([
  { maxSide: 1568, quality: 0.85 },
  { maxSide: 1568, quality: 0.7 },
  { maxSide: 1200, quality: 0.7 },
  { maxSide: 1000, quality: 0.6 },
  { maxSide: 800, quality: 0.5 }
]);

/* Первый вариант encode(step), который влезает в maxBytes; иначе image_rejected */
export async function fitImage(encode, maxBytes, steps = IMAGE_STEPS, signal) {
  const cap = maxBytes > 0 ? maxBytes : Infinity;
  for (const step of steps) {
    if (signal && signal.aborted) throw err('cancelled', { fromApp: true });
    const b = await encode(step);
    if (b && b.size > 0 && b.size <= cap) return b;
  }
  throw err('image_rejected', { fromApp: true });
}

/* Размер после уменьшения по длинной стороне (не увеличиваем) */
export function scaledSize(w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

async function decode(file) {
  try {
    const b = await createImageBitmap(file);
    return { src: b, w: b.width, h: b.height };
  } catch (e) {
    const im = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), x = new Image();
      x.onload = () => { URL.revokeObjectURL(url); resolve(x); };
      x.onerror = () => { URL.revokeObjectURL(url); reject(err('image_rejected', { fromApp: true })); };
      x.src = url;
    });
    return { src: im, w: im.naturalWidth, h: im.naturalHeight };
  }
}

/* encode(step) для файла через canvas; картинка декодируется один раз */
function canvasEncoder(file) {
  let img = null;
  return async ({ maxSide, quality }) => {
    if (!img) img = await decode(file);
    const s = scaledSize(img.w, img.h, maxSide);
    const cv = document.createElement('canvas');
    cv.width = s.w; cv.height = s.h;
    cv.getContext('2d').drawImage(img.src, 0, 0, s.w, s.h);
    return new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', quality));
  };
}

/* Фото → Blob для sample. Если браузер не смог перекодировать, отдаём исходный файл, когда он подходит по типу и размеру */
export async function prepareImage(file, imageLimits, { signal, encoder = canvasEncoder } = {}) {
  const lim = imageLimits || {};
  const maxBytes = lim.maxInputBytes > 0 ? lim.maxInputBytes : Infinity;
  const types = Array.isArray(lim.mediaTypes) ? lim.mediaTypes : [];
  try {
    return await fitImage(encoder(file), maxBytes, IMAGE_STEPS, signal);
  } catch (e) {
    if (e && e.code === 'cancelled') throw e;
    const okType = !types.length || types.includes(file && file.type);
    if (file && okType && file.size > 0 && file.size <= maxBytes) return file;
    throw err('image_rejected', { fromApp: true });
  }
}

/* ---------- обёртка ---------- */

/* sample → объект с интерфейсом createSample(apiKey). onState({ denied?, photo? }) — сообщает о смене доступности */
export function wrapSample(sample, { prepare = prepareImage, onState = () => {} } = {}) {
  let limitsP = null;
  function limits() {
    if (!limitsP) {
      limitsP = (typeof sample.limits === 'function' ? Promise.resolve().then(() => sample.limits()) : Promise.resolve({}))
        .then((l) => l || {}, () => ({}));
    }
    return limitsP;
  }
  async function json(prompt, opts) {
    /* sample отклоняет неизвестные по типу значения (например signal: undefined) — оставляем только заданные */
    const o = {};
    Object.keys(opts || {}).forEach((k) => { if (opts[k] !== undefined) o[k] = opts[k]; });
    const schema = o.schema; delete o.schema;
    const file = o.images; delete o.images;
    if (o.signal && o.signal.aborted) throw err('cancelled', { fromApp: true });
    if (file) {
      const lim = await limits();
      if (!lim.images) { onState({ photo: false }); throw err('images_unavailable', { fromApp: true }); }
      o.images = await prepare(file, lim.images, { signal: o.signal });
    }
    try {
      return await sample.json(withSchema(prompt, schema), o);
    } catch (e) {
      const m = mapSampleError(e);
      if (m.code === 'not_granted') onState({ denied: true });
      if (m.code === 'images_unavailable') onState({ photo: false });
      throw m;
    }
  }
  return { json, limits, artifact: true };
}

/* ---------- доступность в этом окне ---------- */

/* status: idle → checking → ready | unavailable (нет sample) | denied (не разрешили); photo — можно ли слать фото */
const state = { status: 'idle', photo: false, adapter: null, promise: null };
const subs = new Set();
function emit() { subs.forEach((f) => { try { f(); } catch (e) { /* подписчик */ } }); }

export function artifactAiStatus() { return { status: state.status, photo: state.photo }; }
export function onArtifactAiStatus(cb) { subs.add(cb); return () => subs.delete(cb); }

/* Обёрнутый sample или null; один раз за запуск, ничего не спрашивает у пользователя */
export function getArtifactSample(g = globalThis) {
  if (state.promise) return state.promise;
  state.status = 'checking';
  state.promise = claudeUse('sample', g).then(async (s) => {
    if (typeof s !== 'function' || typeof s.json !== 'function') { state.status = 'unavailable'; state.photo = false; emit(); return null; }
    state.adapter = wrapSample(s, {
      onState: (x) => {
        if (x.denied) { state.status = 'denied'; state.photo = false; }
        if (x.photo === false) state.photo = false;
        emit();
      }
    });
    const lim = await state.adapter.limits();
    state.photo = !!lim.images;
    state.status = 'ready';
    emit();
    return state.adapter;
  });
  return state.promise;
}

/* Для тестов: забыть найденный sample */
export function resetArtifactSample() { state.status = 'idle'; state.photo = false; state.adapter = null; state.promise = null; }

/* Код ошибки → можно ли ещё пользоваться ИИ в этом окне (для старого журнала) */
export function isHideCode(code) { return code === 'not_granted' || HIDE_CODES.includes(code); }
