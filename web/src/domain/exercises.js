/* Справочник упражнений: встроенная база (web/data/exercises.json, из free-exercise-db) + свои упражнения
   и перенесённые из журнала (коллекция exercises). Чистые функции: запись базы → упражнение, слияние,
   поиск с синонимами, фильтры, разбор русского названия для своих упражнений. */
import { MUSCLES } from '../data/models/workout.js';

/* Около 20 мышц, сгруппированных для фильтров и карточки */
export const MUSCLE_GROUPS = Object.freeze([
  ['chest', ['chest']],
  ['shoulders', ['front_delts', 'side_delts', 'rear_delts']],
  ['back', ['lats', 'upper_back', 'traps', 'lower_back']],
  ['arms', ['biceps', 'triceps', 'forearms']],
  ['core', ['abs', 'obliques']],
  ['legs', ['glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves']],
  ['neck', ['neck']]
]);

export function groupOf(muscle) {
  const g = MUSCLE_GROUPS.find(([, ms]) => ms.includes(muscle));
  return g ? g[0] : null;
}

/* Запись компактного формата базы → объект упражнения в форме модели Exercise */
export function fromLibrary(it) {
  return Object.freeze({
    id: it.id,
    name: it.n,
    nameEn: it.en || '',
    synonyms: it.s || [],
    type: it.t || 'compound',
    category: it.c || 'strength',
    level: it.lv || 'beginner',
    pattern: it.p || 'other',
    region: it.r || 'full',
    laterality: it.l || 'bilateral',
    primaryMuscles: it.pm || [],
    secondaryMuscles: it.sm || [],
    equipment: it.eq || [],
    metrics: it.m && it.m.length ? it.m : ['weight', 'reps'],
    perSide: it.l === 'unilateral',
    bodyweightShare: null,
    instructions: '',
    source: 'library',
    sourceId: String(it.id).replace(/^fe-/, ''),
    archived: false
  });
}

/* Встроенные + свои: запись в коллекции с тем же id заменяет встроенную (правка, архив) */
export function mergeCatalog(library, docs) {
  const byId = new Map();
  (library || []).forEach((e) => byId.set(e.id, e));
  (docs || []).forEach((d) => byId.set(d.id, d));
  return [...byId.values()];
}

export function normText(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/* Сколько раз упражнение встречалось в тренировках: { exerciseId: n } */
export function usageCounts(logs) {
  const out = {};
  (logs || []).forEach((w) => (w.exercises || []).forEach((e) => { if (e.exerciseId) out[e.exerciseId] = (out[e.exerciseId] || 0) + 1; }));
  return out;
}

const isMine = (e) => e.source === 'user' || e.source === 'legacy';

/* Поиск: каждое слово запроса — начало слова в названии, синонимах или английском названии.
   Сортировка: совпадение с началом названия, затем по названию, синонимам; свои и частые — выше. */
export function searchExercises(list, query, { usage = {}, limit = 0 } = {}) {
  const q = normText(query);
  const words = q ? q.split(' ') : [];
  const scored = [];
  (list || []).forEach((e) => {
    let score = (usage[e.id] || 0) * 2 + (isMine(e) ? 3 : 0);
    if (words.length) {
      const name = normText(e.name), syn = (e.synonyms || []).map(normText).join(' '), en = normText(e.nameEn);
      const fields = [[name, 30], [syn, 15], [en, 8]];
      let ok = true;
      for (const w of words) {
        let best = 0;
        for (const [text, weight] of fields) {
          if (!text) continue;
          if ((' ' + text).includes(' ' + w)) best = Math.max(best, weight);
          else if (w.length >= 4 && text.includes(w)) best = Math.max(best, weight / 3);
        }
        if (!best) { ok = false; break; }
        score += best;
      }
      if (!ok) return;
      if (name.startsWith(q)) score += 40;
      if (name === q) score += 60;
    }
    scored.push([score, e]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'ru'));
  const out = scored.map((x) => x[1]);
  return limit ? out.slice(0, limit) : out;
}

/* Фильтры: группа мышц или мышца (по основным; secondary: true — и по вторичным), оборудование,
   тип, категория, источник ('mine' | 'library'), архив (по умолчанию скрыт) */
export function filterExercises(list, { group, muscle, secondary = false, equipment, type, category, source, archived = false } = {}) {
  const groupMuscles = group ? (MUSCLE_GROUPS.find(([g]) => g === group) || [null, []])[1] : null;
  return (list || []).filter((e) => {
    if (!archived && e.archived) return false;
    if (archived === 'only' && !e.archived) return false;
    const ms = secondary ? (e.primaryMuscles || []).concat(e.secondaryMuscles || []) : (e.primaryMuscles || []);
    if (muscle && !ms.includes(muscle)) return false;
    if (groupMuscles && !ms.some((m) => groupMuscles.includes(m))) return false;
    if (equipment && !(e.equipment || []).includes(equipment)) return false;
    if (type && e.type !== type) return false;
    if (category && e.category !== category) return false;
    if (source === 'mine' && !isMine(e)) return false;
    if (source === 'library' && e.source !== 'library') return false;
    return true;
  });
}

/* Атрибуты по русскому названию — для своих упражнений и перенесённых из журнала.
   Только подсказка: пользователь правит мышцы и тип в редакторе. */
const RULES = [
  [/кардио|дорожк|\bбег\b|ходьб|велотренаж|велосипед|эллипс|степпер|гребн/, { type: 'cardio', pattern: 'cardio', metrics: ['time', 'distance'], primaryMuscles: [], region: 'full' }],
  [/планк|plank/, { type: 'core', pattern: 'core', metrics: ['time'], primaryMuscles: ['abs'], secondaryMuscles: ['obliques'], region: 'core' }],
  [/гиперэкстенз|hyperext/, { type: 'compound', pattern: 'hinge', primaryMuscles: ['lower_back'], secondaryMuscles: ['glutes', 'hamstrings'], region: 'lower' }],
  [/румынск|станов|мертв|deadlift/, { type: 'compound', pattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back'], region: 'lower' }],
  [/ягодичн|hip thrust|тяга бедром/, { type: 'compound', pattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], region: 'lower' }],
  [/сгибани[ея] ног|leg curl/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['hamstrings'], region: 'lower' }],
  [/разгибани[ея] ног|leg extension/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['quads'], region: 'lower' }],
  [/выпад|болгарск|lunge/, { type: 'compound', pattern: 'lunge', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], region: 'lower' }],
  [/присед|жим ног|гакк|squat|leg press/, { type: 'compound', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'hamstrings'], region: 'lower' }],
  [/икр|на носки|calf/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['calves'], region: 'lower' }],
  [/обратн\S* бабочк|задн\S* дельт|reverse fl|rear delt|face pull/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back'], region: 'upper' }],
  [/бабочк|сведени|разводк|\bfly|flye|пек.?дек/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], region: 'upper' }],
  [/мах|средн\S* дельт|lateral raise/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['side_delts'], region: 'upper' }],
  [/трицепс|француз|разгибани[ея] рук|triceps|pushdown/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['triceps'], region: 'upper' }],
  [/бицепс|молот|сгибани[ея] рук|curl/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], region: 'upper' }],
  [/брусь|\bdips?\b/, { type: 'compound', pattern: 'push_horizontal', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], region: 'upper' }],
  [/отжиман|push.?up/, { type: 'compound', pattern: 'push_horizontal', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], region: 'upper' }],
  [/жим.*(стоя|сидя|над голов|плеч|армейск)|shoulder press|military/, { type: 'compound', pattern: 'push_vertical', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps', 'side_delts'], region: 'upper' }],
  [/жим|bench|chest press/, { type: 'compound', pattern: 'push_horizontal', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], region: 'upper' }],
  [/подтягиван|верхн\S* блок|тяга сверху|pull.?up|pulldown|chin/, { type: 'compound', pattern: 'pull_vertical', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back'], region: 'upper' }],
  [/шраг|shrug/, { type: 'isolation', pattern: 'isolation', primaryMuscles: ['traps'], region: 'upper' }],
  [/тяга|\brow\b/, { type: 'compound', pattern: 'pull_horizontal', primaryMuscles: ['upper_back', 'lats'], secondaryMuscles: ['biceps', 'rear_delts'], region: 'upper' }],
  [/скручиван|пресс|подъ[её]м ног|crunch|sit.?up/, { type: 'core', pattern: 'core', primaryMuscles: ['abs'], region: 'core' }]
];
const EQUIP_RULES = [
  [/смит|smith/, 'smith'], [/тренаж|machine/, 'machine'], [/блок|кроссовер|cable/, 'cable'], [/гантел|dumbbell/, 'dumbbell'],
  [/штанг|barbell/, 'barbell'], [/гир[яиейю]|kettlebell/, 'kettlebell'], [/резин|band/, 'band'], [/ez|изогнут/, 'ez_bar']
];

export function guessFromName(name) {
  const s = String(name || '').toLowerCase().replace(/ё/g, 'е');
  const out = { type: 'compound', pattern: 'other', primaryMuscles: [], secondaryMuscles: [], metrics: ['weight', 'reps'], laterality: 'bilateral', perSide: false, equipment: [], region: 'full' };
  const rule = RULES.find(([re]) => re.test(s));
  if (rule) Object.assign(out, rule[1]);
  const eq = EQUIP_RULES.filter(([re]) => re.test(s)).map(([, k]) => k);
  if (eq.length) out.equipment = eq;
  else if (/отжиман|подтягиван|брусь|планк|гиперэкстенз|скручиван/.test(s)) out.equipment = ['bodyweight'];
  if (/кажд\S* рук|на руку|одной рук|одной ног|кажд\S* ног|на ногу/.test(s)) { out.laterality = 'unilateral'; out.perSide = true; }
  out.primaryMuscles = out.primaryMuscles.filter((m) => MUSCLES.includes(m));
  out.secondaryMuscles = (out.secondaryMuscles || []).filter((m) => MUSCLES.includes(m));
  return out;
}

/* Мышцы упражнения одной строкой для подписей: основные, затем вторичные */
export function musclesOf(e) {
  return { primary: (e && e.primaryMuscles) || [], secondary: ((e && e.secondaryMuscles) || []).filter((m) => !((e && e.primaryMuscles) || []).includes(m)) };
}

export function hasMetric(e, m) { return !!e && (e.metrics || []).includes(m); }
export function isCardio(e) { return !!e && (e.type === 'cardio' || e.category === 'cardio'); }
