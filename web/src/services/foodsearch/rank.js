/* Переранжирование выдачи Open Food Facts на телефоне: местные продукты (Армения, Россия) с русским
   или армянским названием и полными данными — выше. Веса — наши эвристики интерфейса, не формулы питания. */
import { tokens, stemRu } from './match.js';

export const RANK_WEIGHTS = {
  nameRu: 30, nameHy: 15, soldAm: 25, soldRu: 20, allWords: 20, startsWith: 10, macros: 10, completeness: 5,
  noName: -40, kcalMismatch: -25
};
export const LOCAL_COUNTRIES = ['en:armenia', 'en:russia'];

/* Калории не сходятся с 4Б + 4У + 9Ж + 7·алкоголь (допуск 40 ккал или 20 %) */
export function kcalMismatch(n) {
  if (!n || n.kcal == null) return false;
  const atw = 4 * (n.protein || 0) + 4 * (n.carbs || 0) + 9 * (n.fat || 0) + 7 * (n.alcohol || 0);
  if (!(n.protein != null || n.fat != null || n.carbs != null)) return false;
  return Math.abs(n.kcal - atw) > Math.max(40, 0.2 * n.kcal);
}

/* f — продукт из offToFood с полем meta { nameRu, nameHy, countries, completeness, scans }; q — запрос */
export function scoreOff(f, q, W = RANK_WEIGHTS) {
  const m = f.meta || {};
  let s = 0;
  if (m.nameRu) s += W.nameRu;
  if (m.nameHy) s += W.nameHy;
  const countries = m.countries || [];
  if (countries.includes('en:armenia')) s += W.soldAm;
  if (countries.includes('en:russia')) s += W.soldRu;
  const words = tokens(q).map(stemRu);
  const nameWords = tokens(f.name).map(stemRu);
  if (words.length && words.every((w) => nameWords.some((n) => n.startsWith(w) || w.startsWith(n)))) s += W.allWords;
  if (words.length && nameWords[0] && nameWords[0].startsWith(words[0])) s += W.startsWith;
  const n = f.nutrients || {};
  if (n.protein != null && n.fat != null && n.carbs != null) s += W.macros;
  if (m.completeness) s += W.completeness * Math.min(1, m.completeness);
  if (!m.nameRu && !m.nameHy && !m.nameEn) s += W.noName;
  if (kcalMismatch(n)) s += W.kcalMismatch;
  return s;
}

export function rankOff(list, q, W = RANK_WEIGHTS) {
  return list.map((f) => Object.assign({}, f, { score: scoreOff(f, q, W), check: kcalMismatch(f.nutrients) }))
    .sort((a, b) => b.score - a.score || ((b.meta && b.meta.scans) || 0) - ((a.meta && a.meta.scans) || 0));
}
