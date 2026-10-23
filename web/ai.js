/* Claude API для автозаполнения продуктов, распознавания фото и перевода.
   Ключ хранится только на этом телефоне и уходит напрямую в api.anthropic.com. */
import Anthropic from './vendor/anthropic-0.131.0.mjs';
import { SCHEMAS } from './src/services/ai-schemas.js';

const MODEL = 'claude-opus-5-5';
const MAX_SIDE = 1568;

function err(code, message) { const e = new Error(message || code); e.code = code; return e; }

function client(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120000 });
}

function mapError(e) {
  if (e && e.code) return e;
  if (e instanceof Anthropic.APIUserAbortError || (e && e.name === 'AbortError')) return err('cancelled');
  if (e instanceof Anthropic.AuthenticationError) return err('bad_key', 'Ключ Claude API не подходит.');
  if (e instanceof Anthropic.PermissionDeniedError) return err('not_granted', 'У ключа нет доступа.');
  if (e instanceof Anthropic.RateLimitError) return err('rate_limited');
  if (e instanceof Anthropic.BadRequestError) {
    const m = String((e && e.message) || '');
    if (/image/i.test(m)) return err('image_rejected', m);
    if (/credit|balance|billing/i.test(m)) return err('no_credit', m);
    return err('bad_request', m);
  }
  if (e instanceof Anthropic.APIConnectionError) return err('network');
  if (e instanceof Anthropic.APIError) return err('server', e.message);
  return err('unknown', (e && e.message) || String(e));
}

/* Уменьшаем фото до 1568 px по длинной стороне и кодируем в JPEG */
async function imageBlock(file) {
  let w, h, src;
  try {
    src = await createImageBitmap(file);
    w = src.width; h = src.height;
  } catch (e) {
    src = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(err('image_rejected')); };
      im.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  const data = cv.toDataURL('image/jpeg', 0.85).split(',')[1];
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
}

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) { /* ищем объект внутри */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* ниже */ } }
  throw err('invalid_json');
}

/* Объект с тем же интерфейсом, что window.claude.use('sample') в журнале */
export function createSample(apiKey) {
  const c = client(apiKey);
  return {
    async json(prompt, opts) {
      opts = opts || {};
      const content = [];
      try {
        if (opts.images) content.push(await imageBlock(opts.images));
      } catch (e) { throw e.code ? e : err('image_rejected'); }
      content.push({ type: 'text', text: prompt });
      const output_config = { effort: opts.modelTier === 'quick' ? 'low' : 'medium' };
      if (opts.schema && SCHEMAS[opts.schema]) output_config.format = { type: 'json_schema', schema: SCHEMAS[opts.schema] };
      let r;
      try {
        r = await c.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config,
          messages: [{ role: 'user', content }]
        }, { signal: opts.signal });
      } catch (e) { throw mapError(e); }
      if (r.stop_reason === 'refusal') throw err('refused');
      const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return parseJson(text);
    },
    limits() { return Promise.resolve({ images: { maxInputBytes: 0 } }); }
  };
}

/* Проверка ключа без расхода токенов */
export async function testKey(apiKey) {
  try { await client(apiKey).models.retrieve(MODEL); return { ok: true }; }
  catch (e) { const m = mapError(e); return { ok: false, code: m.code, message: m.message }; }
}
