/* Сборка встроенного справочника упражнений из открытой базы free-exercise-db (Unlicense, общественное достояние).
   Запуск: node scripts/build-exercises.mjs [путь к exercises.json]
   Без пути файл скачивается с GitHub. Русские названия, синонимы, паттерн и латеральность — наши, из scripts/exercises/ru.json.
   Результат: web/data/exercises.json (справочник) и web/data/exercise-guides.json (инструкции на английском, грузятся по запросу). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const SRC_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const ROOT = new URL('../', import.meta.url).pathname;
const RU = ROOT + 'scripts/exercises/ru.json';
const OUT = ROOT + 'web/data/';

const PATTERNS = ['squat', 'hinge', 'lunge', 'push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'isolation', 'carry', 'core', 'cardio', 'other'];
const LATERALITY = ['bilateral', 'unilateral', 'alternating'];

/* Мышцы базы → наши группы. Плечи делим на переднюю, среднюю и заднюю дельту по названию упражнения. */
const MUSCLE = {
  abdominals: 'abs', abductors: 'abductors', adductors: 'adductors', biceps: 'biceps', calves: 'calves', chest: 'chest',
  forearms: 'forearms', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats', 'lower back': 'lower_back',
  'middle back': 'upper_back', neck: 'neck', quadriceps: 'quads', traps: 'traps', triceps: 'triceps'
};
function shoulderPart(name) {
  if (/rear|reverse fl|back fl|face pull|pull apart|external rotation|internal rotation|bent over.*(lateral|raise|side)|bent-over.*(lateral|raise)/i.test(name)) return 'rear_delts';
  if (/lateral|upright|deltoid raise|scaption|iron cross|y-raise|side raise/i.test(name)) return 'side_delts';
  return 'front_delts';
}
function muscle(m, name) {
  if (m === 'shoulders') return shoulderPart(name);
  if (m === 'abdominals' && /oblique|side bend|russian twist|wood ?chop|windmill|side plank|side jackknife/i.test(name)) return 'obliques';
  return MUSCLE[m] || null;
}
const uniq = (a) => [...new Set(a.filter(Boolean))];

/* Оборудование: из базы плюс уточнения по названию */
const EQUIP = { barbell: 'barbell', dumbbell: 'dumbbell', kettlebells: 'kettlebell', cable: 'cable', machine: 'machine', 'body only': 'bodyweight', bands: 'band', 'medicine ball': 'medicine_ball', 'exercise ball': 'exercise_ball', 'foam roll': 'foam_roll', 'e-z curl bar': 'ez_bar', other: 'other' };
function equipment(x) {
  const out = [];
  if (/smith/i.test(x.name)) out.push('smith');
  else if (x.equipment && EQUIP[x.equipment]) out.push(EQUIP[x.equipment]);
  if (/pull-?ups?|chin-?ups?|hanging/i.test(x.name) && !/band|machine|lat pull/i.test(x.name)) out.push('pullup_bar');
  if (/\bdips?\b/i.test(x.name) && !/bench dip|machine/i.test(x.name)) out.push('dip_bars');
  if (/bench press|incline|decline|bench/i.test(x.name) && /barbell|dumbbell|smith/i.test(x.name + ' ' + (x.equipment || ''))) out.push('bench');
  return uniq(out);
}

function region(primary, category) {
  if (category === 'cardio') return 'full';
  const up = ['chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'biceps', 'triceps', 'forearms', 'neck'];
  const low = ['glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves', 'lower_back'];
  const core = ['abs', 'obliques'];
  const u = primary.some((m) => up.includes(m)), l = primary.some((m) => low.includes(m)), c = primary.some((m) => core.includes(m));
  if (u && l) return 'full';
  if (u) return 'upper';
  if (l) return 'lower';
  if (c) return 'core';
  return 'full';
}

function category(c) { return c === 'olympic weightlifting' ? 'olympic' : c; }

function type(x, primary, pattern) {
  if (x.category === 'cardio') return 'cardio';
  if (pattern === 'core' || (primary.length && primary.every((m) => m === 'abs' || m === 'obliques'))) return 'core';
  return x.mechanic === 'compound' ? 'compound' : 'isolation';
}

function metrics(x, t) {
  if (t === 'cardio') return ['time', 'distance'];
  if (x.category === 'stretching') return ['time'];
  if (/plank|hold|wall sit|isometric|hang\b|dead hang/i.test(x.name) && x.force === 'static') return ['time'];
  if (/assisted/i.test(x.name) && /machine|leverage|band/i.test(x.name + ' ' + (x.equipment || ''))) return ['assist', 'reps'];
  if (/sprint|carry|walk|drag|push(?!-?up)|yoke|farmer/i.test(x.name) && x.category === 'strongman') return ['weight', 'distance'];
  if (x.equipment === 'body only' && t === 'core') return ['reps'];
  return ['weight', 'reps']; /* для упражнений с весом тела «вес» — дополнительное отягощение */
}

/* Паттерн по умолчанию, если в ru.json нет: грубое правило по силе и мышцам */
function guessPattern(x, primary) {
  if (x.category === 'cardio') return 'cardio';
  if (x.category === 'stretching') return 'other';
  if (primary.every((m) => m === 'abs' || m === 'obliques')) return 'core';
  if (x.mechanic === 'isolation') return 'isolation';
  if (primary.includes('quads')) return /lunge|split/i.test(x.name) ? 'lunge' : 'squat';
  if (primary.some((m) => m === 'hamstrings' || m === 'lower_back' || m === 'glutes')) return 'hinge';
  if (primary.includes('lats')) return /row/i.test(x.name) ? 'pull_horizontal' : 'pull_vertical';
  if (primary.includes('upper_back')) return 'pull_horizontal';
  if (primary.includes('chest')) return 'push_horizontal';
  if (primary.some((m) => m.endsWith('_delts'))) return x.force === 'pull' ? 'pull_horizontal' : 'push_vertical';
  return 'other';
}
function guessLaterality(name) {
  if (/alternat/i.test(name)) return 'alternating';
  if (/one[- ]arm|single[- ]arm|one[- ]leg|single[- ]leg|unilateral|one-legged|pistol|split squat|step-?up/i.test(name)) return 'unilateral';
  return 'bilateral';
}

async function loadSource(path) {
  if (path) return JSON.parse(readFileSync(path, 'utf8'));
  const r = await fetch(SRC_URL);
  if (!r.ok) throw new Error('Не удалось скачать базу: ' + r.status);
  return r.json();
}

export function buildItem(x, ru) {
  const primary = uniq((x.primaryMuscles || []).map((m) => muscle(m, x.name)));
  const secondary = uniq((x.secondaryMuscles || []).map((m) => muscle(m, x.name))).filter((m) => !primary.includes(m));
  const r = ru || {};
  const pattern = PATTERNS.includes(r.p) ? r.p : guessPattern(x, primary);
  const lat = LATERALITY.includes(r.l) ? r.l : guessLaterality(x.name);
  const t = type(x, primary, pattern);
  const item = {
    id: 'fe-' + x.id,
    n: (r.n || x.name).trim(),
    en: x.name.trim(),
    s: uniq((r.s || []).map((s) => String(s).trim().toLowerCase())).slice(0, 4),
    t, p: pattern, r: region(primary, x.category), l: lat,
    pm: primary, sm: secondary,
    eq: equipment(x),
    c: category(x.category),
    lv: x.level || 'beginner',
    m: metrics(x, t)
  };
  if (!r.n) item.ru = false; /* названия на русском ещё нет */
  return item;
}

async function main() {
  const src = await loadSource(process.argv[2]);
  const ru = existsSync(RU) ? JSON.parse(readFileSync(RU, 'utf8')) : {};
  const items = src.slice().sort((a, b) => a.id.localeCompare(b.id)).map((x) => buildItem(x, ru[x.id]));
  const guides = {};
  src.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach((x) => { if ((x.instructions || []).length) guides['fe-' + x.id] = x.instructions.map((s) => s.trim()); });
  mkdirSync(OUT, { recursive: true });
  const meta = { source: 'free-exercise-db', url: 'https://github.com/yuhonas/free-exercise-db', license: 'Unlicense', version: 1 };
  writeFileSync(OUT + 'exercises.json', JSON.stringify(Object.assign({}, meta, { items })) + '\n');
  writeFileSync(OUT + 'exercise-guides.json', JSON.stringify(Object.assign({}, meta, { lang: 'en', guides })) + '\n');
  const noRu = items.filter((i) => i.ru === false).length;
  console.log('Упражнений: ' + items.length + (noRu ? ', без русского названия: ' + noRu : ''));
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
