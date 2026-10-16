/* Встроенный справочник упражнений (web/data/exercises.json) и инструкции к ним (web/data/exercise-guides.json).
   Файлы статичные, кэшируются service worker'ом; загружаются один раз за запуск. */
import { fromLibrary } from '../domain/exercises.js';

const URL_LIB = new URL('../../data/exercises.json', import.meta.url);
const URL_GUIDES = new URL('../../data/exercise-guides.json', import.meta.url);
let lib = null, libPromise = null, guidesPromise = null;

export function libraryCache() { return lib; }

export function loadLibrary(fetchFn = (u) => fetch(u)) {
  if (lib) return Promise.resolve(lib);
  if (!libPromise) {
    libPromise = fetchFn(URL_LIB).then((r) => { if (!r.ok) throw new Error('library ' + r.status); return r.json(); })
      .then((d) => { lib = Object.freeze((d.items || []).map(fromLibrary)); return lib; })
      .catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

/* Шаги инструкции на английском: { id: [строки] } */
export function loadGuides(fetchFn = (u) => fetch(u)) {
  if (!guidesPromise) {
    guidesPromise = fetchFn(URL_GUIDES).then((r) => { if (!r.ok) throw new Error('guides ' + r.status); return r.json(); })
      .then((d) => d.guides || {})
      .catch((e) => { guidesPromise = null; throw e; });
  }
  return guidesPromise;
}
