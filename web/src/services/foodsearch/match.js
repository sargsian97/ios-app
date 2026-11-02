/* Офлайн-подбор продуктов по названию: русский (ё = е, лёгкое отбрасывание окончаний), армянский (և = եւ),
   латиница (транслитерация обеих сторон к общему виду), опечатки на один символ — в последнюю очередь.
   Чистые функции; используются встроенной таблицей базовых продуктов и своими продуктами. */

const RU_SUFFIXES = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ах', 'ях', 'ов', 'ев', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ом', 'ем', 'ую', 'юю', 'ам', 'ям', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь'];
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };

/* Нижний регистр, ё → е, армянская лигатура, без знаков препинания; проценты и запятые в числах остаются словами */
export function normalize(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/և/g, 'եւ').replace(/[՝՛՞։«»"'’()\[\]{}!?;:/\\|]+/g, ' ')
    .replace(/,(?!\d)/g, ' ').replace(/(^|[^\d]),/g, '$1 ').replace(/[\s_·—–-]+/g, ' ').trim();
}

export function tokens(s) { return normalize(s).split(' ').filter(Boolean); }

/* Лёгкое отбрасывание русского окончания у слов от 4 букв; основа не короче 3 букв */
export function stemRu(w) {
  if (!/^[а-я]+$/.test(w) || w.length < 4) return w;
  for (const suf of RU_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

/* Кириллица → латиница, затем общее «огрубление» латиницы, чтобы matsun = macun = matsoun */
export function translit(w) {
  return [...w].map((c) => (TRANSLIT[c] != null ? TRANSLIT[c] : c)).join('');
}
export function latLoose(w) {
  return w.replace(/sch/g, 'sh').replace(/kh/g, 'h').replace(/ts/g, 'c').replace(/zh/g, 'j').replace(/ou/g, 'u').replace(/yu/g, 'u').replace(/ya/g, 'a').replace(/iy|yi|ij/g, 'i').replace(/y/g, 'i').replace(/w/g, 'v').replace(/x/g, 'ks').replace(/(.)\1/g, '$1');
}

/* Расстояние Дамерау — Левенштейна с потолком 1 (достаточно для опечатки) */
export function nearOne(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; /* замена */
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); /* перестановка */
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i); /* вставка / удаление */
}

/* Ключи поиска для записи: { name: [слова названия], syn: [слова синонимов], other: [армянские и латинские слова] };
   у каждого слова — сырой вид, основа и латинская форма */
function wordKey(w) { return { w, st: stemRu(w), lat: latLoose(/[а-я]/.test(w) ? translit(w) : w) }; }
export function prepare({ name, syn = [], other = [] }) {
  return {
    full: normalize(name),
    name: tokens(name).map(wordKey),
    syn: syn.flatMap((s) => tokens(s)).map(wordKey),
    other: other.flatMap((s) => tokens(s)).map(wordKey)
  };
}

const latin = (w) => /^[a-z0-9.,%]+$/.test(w);
/* Насколько слово запроса q подходит слову ключа k: 3 — начало слова, 2 — по основе, 1 — опечатка, 0 — нет */
function wordScore(q, k) {
  if (latin(q.w)) {
    if (k.lat.startsWith(q.lat) || (k.w.startsWith(q.w))) return 3;
    if (q.w.length >= 5 && nearOne(q.lat, k.lat)) return 1;
    return 0;
  }
  if (k.w.startsWith(q.w)) return 3;
  if (q.st.length >= 3 && (k.st.startsWith(q.st) || (k.st.length >= 4 && q.st.startsWith(k.st)))) return 2;
  if (q.w.length >= 5 && k.w.length >= 4 && nearOne(q.st, k.st)) return 1;
  return 0;
}

/* Оценка записи по запросу: 0 — не подходит. Каждое слово запроса должно найтись (в названии, синонимах или
   армянских/латинских формах); очки — за точность, первое слово названия и совпадение начала всего названия. */
export function score(prepared, queryWords) {
  if (!queryWords.length) return 0;
  let total = 0;
  for (const q of queryWords) {
    let best = 0;
    prepared.name.forEach((k, i) => { const s = wordScore(q, k); if (s) best = Math.max(best, s * 20 + (i === 0 ? 10 : 0)); });
    if (best < 60) prepared.syn.forEach((k) => { const s = wordScore(q, k); if (s) best = Math.max(best, s * 15); });
    if (best < 45) prepared.other.forEach((k) => { const s = wordScore(q, k); if (s) best = Math.max(best, s * 13); });
    if (!best) return 0;
    total += best;
  }
  const q = queryWords.map((x) => x.w).join(' ');
  if (prepared.full.startsWith(q)) total += 25;
  else if (prepared.full.includes(q)) total += 10;
  return total;
}

export function queryWords(q) { return tokens(q).map(wordKey); }

/* Подбор по списку: entries — [{ key: prepare(...), ...любые поля }]; возвращает записи с score по убыванию */
export function rank(entries, q, { limit = 20 } = {}) {
  const words = queryWords(q);
  if (!words.length) return [];
  return entries.map((e) => ({ e, s: score(e.key, words) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.key.full.length - b.e.key.full.length || a.e.key.full.localeCompare(b.e.key.full))
    .slice(0, limit).map((x) => Object.assign({ score: x.s }, x.e));
}
