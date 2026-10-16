/* ИИ для питания через ключ Claude пользователя: автозаполнение продукта по названию и распознавание фото
   (тарелка или этикетка). Перед запросом проверяются лимиты (config.js), после — счётчик +1.
   Остальные ИИ-функции спецификации (описание текстом, рецепт по ссылке, скан стека) — пока заглушки. */
import { usageStatus, recordUseOp } from './usage.js';

const KEY_LS = 'journal.apiKey';
export function getClaudeKey() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
export function setClaudeKey(k) { try { if (k) localStorage.setItem(KEY_LS, k); else localStorage.removeItem(KEY_LS); } catch (e) { /* приватный режим */ } }

function err(code, extra) { return Object.assign(new Error(code), { code }, extra || {}); }

let cached = { key: null, sample: null };
async function sampleFor(key) {
  if (cached.key !== key) {
    const m = await import('../../ai.js');
    cached = { key, sample: m.createSample(key) };
  }
  return cached.sample;
}

export async function testClaudeKey(key) {
  const m = await import('../../ai.js');
  return m.testKey(key);
}

/* ---------- запросы ---------- */

export function fillPrompt(name, grams) {
  return 'Ты справочник по питательности продуктов. Дай значения на 100 г продукта по общеизвестным справочным данным (USDA, российские таблицы состава).\n'
    + 'Продукт: «' + name + '».' + (grams > 0 ? ' Порция: ' + grams + ' г.' : '') + '\n'
    + 'Если состояние не указано, считай продукт таким, каким его обычно едят или продают (орехи и семечки сухие). Если написано «варёный», «жареный», «запечённый» и т.п., учитывай это.\n'
    + 'pa — животный белок, pv — растительный белок на 100 г (pa+pv=p). Животный: мясо, птица, рыба, яйца, молочные продукты, сывороточный и казеиновый протеин. Растительный: крупы, бобовые, орехи, семена, хлеб, овощи, соя. Для смешанных блюд раздели по составу.\n'
    + 'Ответь ТОЛЬКО одним JSON-объектом без пояснений: {"kcal":число,"p":число,"f":число,"c":число,"fib":число,"pa":число,"pv":число,"note":"коротко, какое допущение сделал"}\n'
    + 'Все числа на 100 г: kcal в ккал, остальное в граммах.\n'
    + 'Пример: {"kcal":559,"p":30.2,"f":49,"c":10.7,"fib":6,"pa":0,"pv":30.2,"note":"семечки тыквенные сухие очищенные"}';
}

export const PHOTO_PROMPT = 'Ты помогаешь вести дневник питания. На фото еда или упаковка продукта.\n'
  + 'Задача: определить продукты на фото и оценить вес каждого в граммах (в том виде, как подано) и питательность.\n'
  + 'Правила:\n'
  + '- Если на фото таблица пищевой ценности с упаковки: возьми значения ТОЧНО с упаковки на 100 г (если есть только на порцию, пересчитай на 100 г), поставь "src":"label". Название — с упаковки. Вес — масса упаковки, если она видна, иначе 100.\n'
  + '- Иначе перечисли отдельные продукты или ингредиенты (не больше 8) и оцени вес по размеру порции, посуде и объёму. "src":"estimate".\n'
  + '- Питательность на 100 г бери по справочным данным (USDA, российские таблицы). pa — животный белок, pv — растительный белок на 100 г (pa+pv=p). Животный: мясо, птица, рыба, яйца, молочные продукты, сывороточный и казеиновый протеин. Растительный: крупы, бобовые, орехи, семена, хлеб, овощи, соя.\n'
  + 'Ответь ТОЛЬКО одним JSON-объектом без пояснений: {"items":[{"name":"название по-русски","grams":число,"kcal":число,"p":число,"f":число,"c":число,"fib":число,"pa":число,"pv":число,"src":"estimate или label","note":"коротко"}],"note":"общее замечание"}\n'
  + 'Числа kcal, p, f, c, fib, pa, pv — на 100 г продукта. grams — вес порции на фото. Если на фото нет еды, верни {"items":[],"note":"что на фото"}.\n'
  + 'Пример: {"items":[{"name":"Куриная грудка запечённая","grams":150,"kcal":165,"p":31,"f":3.6,"c":0,"fib":0,"pa":31,"pv":0,"src":"estimate","note":"кусок размером с ладонь"}],"note":"вес оценён по размеру тарелки"}';

/* ---------- разбор ответов ---------- */

/* Белок по источникам: доли pa:pv, в сумме — весь белок */
export function splitProtein(p, pa, pv) {
  pa = Number(pa); pv = Number(pv);
  if (!(isFinite(pa) && isFinite(pv) && pa >= 0 && pv >= 0 && pa + pv > 0 && p > 0)) return {};
  const a = Math.round(pa / (pa + pv) * p * 100) / 100;
  return { protein_animal: a, protein_plant: Math.round((p - a) * 100) / 100 };
}

/* Нутриенты на 100 г из ответа модели; null — если значения неправдоподобны */
export function parsePer100(r) {
  if (!r) return null;
  const v = { kcal: Number(r.kcal), protein: Number(r.p), fat: Number(r.f), carbs: Number(r.c), fiber: Number(r.fib) };
  const ok = Object.values(v).every((x) => isFinite(x) && x >= 0) && v.kcal <= 950 && v.protein <= 100 && v.fat <= 100 && v.carbs <= 100 && v.fiber <= 100;
  if (!ok) return null;
  return Object.assign(v, splitProtein(v.protein, r.pa, r.pv));
}

export function parsePhoto(r) {
  const items = (r && Array.isArray(r.items) ? r.items : []).slice(0, 8).map((it) => {
    const name = String((it && it.name) || '').trim();
    const per100 = parsePer100(it);
    if (!name || !per100) return null;
    let g = Number(it.grams);
    if (!(g > 0 && g <= 3000)) g = 100;
    return { name, grams: Math.round(g), per100, src: it.src === 'label' ? 'label' : 'estimate', note: String(it.note || '') };
  }).filter(Boolean);
  return { items, note: String((r && r.note) || '') };
}

/* ---------- вызовы с лимитами ---------- */

async function run(store, feature, { today, now, limits }, call) {
  const key = getClaudeKey();
  if (!key) throw err('no_key');
  const st = usageStatus(store, feature, today, limits);
  if (!st.allowed) throw err('limit', { period: st.blockedBy, limit: st.limit[st.blockedBy] });
  const sample = await sampleFor(key);
  const res = await call(sample);
  await store.batch([recordUseOp(store, feature, today, now)]);
  return res;
}

/* Питательность продукта по названию: { per100, note } */
export async function aiFill(store, name, { grams, signal, today, now, limits } = {}) {
  const n = String(name || '').trim();
  if (!n) throw err('no_name');
  return run(store, 'ai_fill', { today, now, limits }, async (sample) => {
    const r = await sample.json(fillPrompt(n, Number(grams) || 0), { modelTier: 'quick', signal, schema: 'nutrition' });
    const per100 = parsePer100(r);
    if (!per100) throw err('unsure');
    return { per100, note: String((r && r.note) || '') };
  });
}

/* Продукты на фото: { items: [{ name, grams, per100, src, note }], note } */
export async function aiPhoto(store, file, { signal, today, now, limits } = {}) {
  if (!file) throw err('no_file');
  return run(store, 'ai_photo', { today, now, limits }, async (sample) => {
    const r = await sample.json(PHOTO_PROMPT, { images: file, modelTier: 'default', signal, schema: 'photo' });
    return parsePhoto(r);
  });
}

/* Ключ сообщения об ошибке для t() */
export function aiErrorKey(e) {
  const c = e && e.code;
  const known = ['no_key', 'limit', 'cancelled', 'bad_key', 'no_credit', 'network', 'rate_limited', 'invalid_json', 'image_rejected', 'refused', 'not_granted', 'unsure', 'no_name'];
  return 'ai.err.' + (known.includes(c) ? c : 'other');
}
