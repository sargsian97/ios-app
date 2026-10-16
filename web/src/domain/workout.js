/* Тренировка: сборка сессии из шаблона, предыдущие значения, цели подходов, отдых, переходы
   (суперсеты), завершение, итоги и рекорды, выбор тренировки на сегодня, кардио журнала.
   Чистые функции: время и id передаются параметрами. Веса — в кг, время — в секундах, дистанция — в метрах. */
import { e1rm, isWorkingSet, addDays, nextSetTarget, DEFAULT_TARGET_RIR, applyWeek } from './calc/index.js';
import { isCardio } from './exercises.js';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const pos = (v) => (num(v) != null && v > 0 ? v : null);

/* Упражнения шаблона по порядку секций */
export function planItems(plan) {
  return ((plan && plan.sections) || []).flatMap((s) => (s.items || []).map((it) => Object.assign({ sectionKind: s.kind || 'main' }, it)));
}

/* Тренировки по убыванию: дата, затем время окончания */
export function sortLogs(logs) {
  return (logs || []).slice().sort((a, b) => (b.date + (b.finishedAt || b.startedAt || '')).localeCompare(a.date + (a.finishedAt || a.startedAt || '')));
}

/* Упражнение с вариантами («чередуется»): берём следующий вариант после сделанного в прошлый раз */
export function pickAlternative(item, logs) {
  const alts = (item && item.alternatives) || [];
  if (alts.length < 2) return item ? item.exerciseId : null;
  for (const w of sortLogs(logs)) {
    for (const e of w.exercises || []) {
      const k = alts.indexOf(e.exerciseId);
      if (k >= 0 && (e.sets || []).some((s) => s.done)) return alts[(k + 1) % alts.length];
    }
  }
  return alts[0];
}

/* Последнее выполнение упражнения: { workoutId, date, sets } или null.
   programId — только тренировки этой программы; before — строго раньше этой даты. */
export function previousSets(logs, exerciseId, { programId = null, before = null, excludeId = null } = {}) {
  for (const w of sortLogs(logs)) {
    if (excludeId && w.id === excludeId) continue;
    if (before && w.date >= before) continue;
    if (programId && w.programId !== programId) continue;
    for (const e of w.exercises || []) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = (e.sets || []).filter((s) => s.done);
      if (sets.length) return { workoutId: w.id, date: w.date, sets };
    }
  }
  return null;
}

/* Цель подхода. Пока без прогрессии: повторить прошлый раз (тот же номер подхода), иначе вес и верх
   диапазона из шаблона. Точка расширения для умной прогрессии (этап 10, формулы — часть 2 спецификации). */
export function targetFor(item, prevSet) {
  const it = item || {};
  if (prevSet) return { weight: num(prevSet.weight), reps: num(prevSet.reps), rir: num(it.rir) != null ? it.rir : num(prevSet.rir), timeSec: num(prevSet.timeSec), distanceM: num(prevSet.distanceM), assist: num(prevSet.assist) };
  return { weight: num(it.weight), reps: num(it.repMax) != null ? it.repMax : num(it.repMin), rir: num(it.rir), timeSec: num(it.timeSec), distanceM: num(it.distanceM), assist: null };
}

/* Умная прогрессия (раздел 2.4): упражнение «вес × повторы», не кардио и не с помощью гравитрона */
export function progressable(exercise) {
  const ex = exercise || {};
  const m = ex.metrics || ['weight', 'reps'];
  return !isCardio(ex) && m.includes('weight') && m.includes('reps') && !m.includes('assist');
}

/* Диапазон повторов цели: [min, max]; задан только один край — диапазон из одного числа; нет — null */
export function repRangeOf(item) {
  const a = num(item && item.repMin), b = num(item && item.repMax);
  if ((a == null || a <= 0) && (b == null || b <= 0)) return null;
  const lo = Math.max(1, Math.round(a != null && a > 0 ? a : b));
  return [lo, Math.max(lo, Math.round(b != null && b > 0 ? b : lo))];
}

/* Цель рабочего подхода index по умной прогрессии или null (нет диапазона, истории, упражнение не подходит).
   Сегодня уже есть выполненные рабочие подходы — считаем от последнего из них (он уже несёт усталость,
   добавляется только за подходы после него), иначе — от прошлого раза (history) с усталостью за index подходов.
   progression: { enabled, expandRange, preferPrevWeight, available, version }. */
export function smartTarget({ item, exercise, history = [], today = [], index = 0, progression = null }) {
  if (!progression || !progression.enabled || !progressable(exercise)) return null;
  const repRange = repRangeOf(item);
  if (!repRange) return null;
  const work = (xs) => (xs || []).filter((x) => x && x.type !== 'warmup' && isWorkingSet(x) && e1rm(x) > 0);
  const doneToday = (today || []).map((x, k) => ({ x, k })).filter(({ x }) => x && x.done && work([x]).length);
  const last = doneToday.length ? doneToday[doneToday.length - 1] : null;
  const sets = last ? [last.x] : work(history);
  if (!sets.length) return null;
  const rir = num(item.rir) != null ? item.rir : DEFAULT_TARGET_RIR;
  const r = nextSetTarget({
    sets, repRange, targetRir: rir, setIndex: last ? Math.max(0, index - last.k) : index,
    available: progression.available || undefined, expandRange: !!progression.expandRange,
    preferPrevWeight: !!progression.preferPrevWeight, version: progression.version || 'v1'
  });
  if (!r) return null;
  return { weight: r.weight, reps: r.reps, rir: r.rir, timeSec: null, distanceM: null, assist: null, expanded: !!r.expanded, reason: r.reason };
}

const withLoads = (progression, exercise) => (progression ? Object.assign({}, progression, { available: progression.loadsFor ? progression.loadsFor(exercise) : progression.available }) : null);

/* После выполненного подхода — пересчитать цели оставшихся рабочих подходов упражнения по сделанным сегодня.
   Подходы, в которые уже что-то введено (вес или повторы), не трогаем. */
export function retargetEntry(entry, { exercise, progression }) {
  if (!entry || !entry.target || !progression || !progression.enabled) return entry;
  const prog = withLoads(progression, exercise);
  const working = entry.sets.filter((x) => x.type !== 'warmup');
  let changed = false;
  const sets = entry.sets.map((x) => {
    if (x.done || x.type === 'warmup' || x.weight != null || x.reps != null) return x;
    const idx = working.indexOf(x);
    const tg = smartTarget({ item: entry.target, exercise, today: working, index: idx, progression: prog });
    if (!tg) return x;
    changed = true;
    return Object.assign({}, x, { target: tg });
  });
  return changed ? Object.assign({}, entry, { sets }) : entry;
}

export function blankSet(id, type, target, perSide) {
  return { id, type: type || 'normal', weight: null, assist: null, reps: null, partials: null, timeSec: null, distanceM: null, rir: null, side: 'both', perSide: !!perSide, done: false, doneAt: null, restSec: null, durSec: null, target };
}

/* Упражнение в сессии: подходы с целями по прошлому разу или шаблону */
export function exerciseEntry({ exercise, item = null, prev = null, newId, exerciseId, progression = null }) {
  const it = item || {};
  const ex = exercise || {};
  const cardio = isCardio(ex);
  const prevWorking = prev ? prev.sets.filter((s) => s.type !== 'warmup') : [];
  const n = Math.max(1, num(it.sets) || (prevWorking.length || (cardio ? 1 : 3)));
  const prog = item ? withLoads(progression, exercise) : null;
  const sets = [];
  for (let i = 0; i < n; i++) {
    const p = prevWorking.length ? prevWorking[Math.min(i, prevWorking.length - 1)] : null;
    let smart = smartTarget({ item: it, exercise, history: prevWorking, index: i, progression: prog });
    /* усталость только снижает: подход не тяжелее предыдущего (запасная «линейная прогрессия» её не учитывает) */
    const before = sets.length && sets[sets.length - 1].target;
    if (smart && before && before.reason && before.weight != null && smart.weight > before.weight) smart = Object.assign({}, before);
    sets.push(blankSet(newId(), it.setType, smart || targetFor(it, p), ex.perSide));
  }
  return {
    id: newId(),
    exerciseId: exerciseId || ex.id || it.exerciseId || null,
    name: ex.name || it.name || '',
    planItemId: it.id || '',
    group: it.group || '',
    groupKind: it.group ? (it.groupKind || 'superset') : null,
    target: item ? { sets: num(it.sets), repMin: num(it.repMin), repMax: num(it.repMax), timeSec: num(it.timeSec), rir: num(it.rir), weight: num(it.weight), restSec: num(it.restSec) } : null,
    sets,
    cardio: cardio ? { speedKmh: null, inclinePct: null, avgHr: null, maxHr: null, kcalWatch: null, kcal: null, rpe: null, steps: null, inSteps: true } : null,
    notes: it.notes || '',
    skipped: false
  };
}

/* Новая сессия: из шаблона (с выбором варианта упражнения) или пустая */
export function buildSession({ plan = null, catalog = {}, logs = [], date, now, bodyweightKg = null, programId = null, previousFrom = 'any', newId, name = '', gymId = null, progression = null, weekMods = null }) {
  /* weekMods — поправки недели программы (периодизация, делоад): applyWeek к целям каждого упражнения */
  const exercises = planItems(plan).map((raw) => {
    const it = weekMods ? applyWeek(raw, weekMods) : raw;
    const id = pickAlternative(it, logs);
    const ex = catalog[id] || null;
    const prev = previousSets(logs, id, { programId: previousFrom === 'program' ? (programId || (plan && plan.programId)) : null, before: null });
    const entry = exerciseEntry({ exercise: ex, item: it, prev, newId, exerciseId: id, progression });
    if (!ex && it.alternatives && it.alternatives.length > 1) entry.name = it.name;
    return entry;
  });
  return {
    id: 'current',
    date,
    planId: plan ? plan.id : null,
    programId: programId || (plan && plan.programId) || null,
    gymId: gymId || null,
    name: name || (plan ? plan.name : ''),
    startedAt: now,
    exercises,
    notes: '',
    bodyweightKg: pos(bodyweightKg),
    stats: { avgHr: null, maxHr: null, kcalWatch: null, kcal: null, steps: null },
    rest: null,
    cursor: exercises.length ? { ei: 0, si: 0 } : null,
    events: []
  };
}

/* Секунды отдыха после подхода */
export function restFor({ exercise, entry, config, profile, set, kind = 'set' }) {
  const r = (profile && profile.rest) || {};
  if (kind === 'none') return 0;
  if (kind === 'sides') return num(config && config.restBetweenSidesSec) != null ? config.restBetweenSidesSec : (num(r.betweenSides) || 0);
  if (set && set.type === 'warmup') return num(r.afterWarmup) || 0;
  if (kind === 'exercise') return num(r.betweenExercises) || 0;
  if (config && num(config.restSec) != null) return config.restSec;
  if (entry && entry.target && num(entry.target.restSec) != null) return entry.target.restSec;
  if (exercise && isCardio(exercise)) return 0;
  if (exercise && exercise.type === 'compound') return num(r.compound) || 0;
  return num(r.isolation) || 0;
}

const undone = (e, si) => !e.skipped && e.sets[si] && !e.sets[si].done;
const firstUndone = (e) => (e.skipped ? -1 : e.sets.findIndex((s) => !s.done));

/* Группа суперсета/круга: индексы упражнений с той же меткой, по порядку */
export function groupMembers(exercises, ei) {
  const g = exercises[ei] && exercises[ei].group;
  if (!g) return [ei];
  return exercises.map((e, i) => (e.group === g ? i : -1)).filter((i) => i >= 0);
}

/* Следующий подход после выполненного (ei, si).
   kind: 'superset' — дальше по кругу без отдыха; 'set' — следующий подход того же упражнения;
   'sides' — тот же подход на другую сторону; 'exercise' — следующее упражнение; null — всё сделано. */
export function nextPointer(session, ei, si) {
  const ex = session.exercises || [];
  const cur = ex[ei];
  if (!cur) return null;
  const set = cur.sets[si];
  if (set && set.side === 'left' && cur.sets[si + 1] && cur.sets[si + 1].side === 'right' && !cur.sets[si + 1].done) return { ei, si: si + 1, kind: 'sides' };
  const members = groupMembers(ex, ei);
  if (members.length > 1) {
    const pos0 = members.indexOf(ei);
    for (let k = pos0 + 1; k < members.length; k++) if (undone(ex[members[k]], si)) return { ei: members[k], si, kind: 'superset' };
    for (const m of members) { const j = firstUndone(ex[m]); if (j >= 0) return { ei: m, si: j, kind: 'set' }; }
  } else {
    const j = firstUndone(cur);
    if (j >= 0) return { ei, si: j, kind: 'set' };
  }
  const order = ex.map((_, i) => i).filter((i) => !members.includes(i));
  const after = order.filter((i) => i > ei).concat(order.filter((i) => i < ei));
  for (const i of after) { const j = firstUndone(ex[i]); if (j >= 0) return { ei: i, si: j, kind: 'exercise' }; }
  return null;
}

/* Заполнить пустые поля подхода целью */
export function fillFromTarget(set) {
  const t = set.target || {};
  const o = Object.assign({}, set);
  ['weight', 'reps', 'timeSec', 'distanceM', 'assist'].forEach((k) => { if (o[k] == null && num(t[k]) != null) o[k] = t[k]; });
  if (o.rir == null && num(t.rir) != null) o.rir = t.rir;
  return o;
}

/* Отметить подход выполненным: заполнить из цели, засечь фактический отдых, передвинуть курсор, начать отдых */
export function completeSet(session, ei, si, { now, catalog = {}, configs = {}, profile = null, progression = null }) {
  const exs = session.exercises.map((e) => Object.assign({}, e, { sets: e.sets.slice() }));
  const entry = exs[ei];
  if (!entry || !entry.sets[si]) return session;
  const lastDone = exs.flatMap((e) => e.sets).filter((s) => s.done && s.doneAt).map((s) => Date.parse(s.doneAt)).sort((a, b) => b - a)[0];
  const t = Date.parse(now);
  const set = fillFromTarget(entry.sets[si]);
  set.done = true;
  set.doneAt = now;
  if (lastDone && t - lastDone < 3600e3) set.restSec = Math.round((t - lastDone) / 1000);
  entry.sets[si] = set;
  if (progression && set.type !== 'warmup') exs[ei] = retargetEntry(entry, { exercise: catalog[entry.exerciseId] || null, progression });
  const next = Object.assign({}, session, { exercises: exs });
  const np = nextPointer(next, ei, si);
  const exercise = catalog[entry.exerciseId] || null;
  const kind = !np ? 'none' : np.kind === 'superset' ? 'none' : np.kind;
  const sec = restFor({ exercise, entry, config: configs[entry.exerciseId], profile, set, kind });
  next.cursor = np ? { ei: np.ei, si: np.si } : null;
  next.rest = sec > 0 ? { startedAt: now, targetSec: sec, exerciseId: entry.exerciseId || '', kind } : null;
  return next;
}

/* Снять отметку выполнения (данные подхода остаются) */
export function uncompleteSet(session, ei, si) {
  const exs = session.exercises.map((e, i) => (i === ei ? Object.assign({}, e, { sets: e.sets.map((s, j) => (j === si ? Object.assign({}, s, { done: false, doneAt: null }) : s)) }) : e));
  return Object.assign({}, session, { exercises: exs, cursor: { ei, si } });
}

/* Завершённая тренировка из сессии: только выполненные подходы, пустые упражнения убираем */
export function finishSession(session, { now, records = [] }) {
  const exercises = (session.exercises || []).map((e) => Object.assign({}, e, { sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
  const started = Date.parse(session.startedAt);
  const dur = isFinite(started) ? Math.max(0, Math.round((Date.parse(now) - started) / 1000)) : null;
  return {
    id: session.logId || null,
    date: session.date,
    planId: session.planId || null,
    programId: session.programId || null,
    gymId: session.gymId || null,
    name: session.name || '',
    startedAt: session.startedAt || null,
    finishedAt: now,
    durationSec: dur,
    exercises,
    notes: session.notes || '',
    bodyweightKg: session.bodyweightKg || null,
    stats: session.stats || {},
    records,
    source: 'app'
  };
}

/* Объём подхода: вес × повторы; в упражнениях с весом тела — плюс доля веса тела */
export function setVolume(s, { bodyweightKg = null, bodyweightShare = 0 } = {}) {
  const reps = pos(s.reps);
  if (!reps) return 0;
  const bw = pos(bodyweightKg) && bodyweightShare > 0 ? bodyweightKg * bodyweightShare : 0;
  const load = (pos(s.weight) || 0) + bw - (pos(s.assist) || 0);
  return load > 0 ? load * reps : 0;
}

/* Итоги: рабочие подходы, повторы, объём (кг), время и дистанция кардио, длительность */
export function workoutSummary(w) {
  const o = { exercises: 0, sets: 0, reps: 0, volumeKg: 0, timeSec: 0, distanceM: 0, durationSec: num(w && w.durationSec) || 0 };
  ((w && w.exercises) || []).forEach((e) => {
    const done = (e.sets || []).filter((s) => s.done !== false);
    if (!done.length) return;
    o.exercises++;
    done.forEach((s) => {
      if (s.type !== 'warmup') o.sets++;
      o.reps += pos(s.reps) || 0;
      if (s.type !== 'warmup') o.volumeKg += (pos(s.weight) || 0) * (pos(s.reps) || 0);
      o.timeSec += pos(s.timeSec) || 0;
      o.distanceM += pos(s.distanceM) || 0;
    });
  });
  o.volumeKg = Math.round(o.volumeKg);
  return o;
}

/* Лучшие показатели упражнения в наборе подходов */
export function bests(sets) {
  const b = { e1rm: 0, weight: 0, reps: 0, volume: 0, timeSec: 0, distanceM: 0 };
  (sets || []).filter(isWorkingSet).forEach((s) => {
    b.e1rm = Math.max(b.e1rm, e1rm({ weight: s.weight, reps: s.reps, rir: s.rir }));
    if (pos(s.reps)) b.weight = Math.max(b.weight, pos(s.weight) || 0);
    if (!pos(s.weight)) b.reps = Math.max(b.reps, pos(s.reps) || 0);
    b.volume += (pos(s.weight) || 0) * (pos(s.reps) || 0);
    b.timeSec = Math.max(b.timeSec, pos(s.timeSec) || 0);
    b.distanceM = Math.max(b.distanceM, pos(s.distanceM) || 0);
  });
  return b;
}

const RECORD_KINDS = ['e1rm', 'weight', 'reps', 'volume', 'timeSec', 'distanceM'];

/* Рекорды тренировки относительно более ранних (по дате и времени). Первое выполнение — не рекорд. */
export function findRecords(workout, history) {
  const key = (w) => w.date + (w.finishedAt || w.startedAt || '');
  const k0 = key(workout);
  const earlier = (history || []).filter((w) => w.id !== workout.id && key(w) < k0);
  const out = [];
  (workout.exercises || []).forEach((e) => {
    if (!e.exerciseId) return;
    const prevSets = earlier.flatMap((w) => (w.exercises || []).filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => x.sets || []));
    if (!prevSets.filter(isWorkingSet).length) return;
    const now = bests(e.sets), was = bests(prevSets);
    let prevVolume = 0;
    earlier.forEach((w) => (w.exercises || []).forEach((x) => { if (x.exerciseId === e.exerciseId) prevVolume = Math.max(prevVolume, bests(x.sets).volume); }));
    was.volume = prevVolume;
    RECORD_KINDS.forEach((k) => {
      if (now[k] > 0 && now[k] > was[k] + 1e-9 && (k !== 'reps' || !now.weight)) out.push({ exerciseId: e.exerciseId, kind: k, value: Math.round(now[k] * 100) / 100, prev: Math.round(was[k] * 100) / 100 });
    });
  });
  /* e1RM и максимальный вес часто растут вместе — оставляем оба, но объём показываем только без них */
  return out.filter((r) => r.kind !== 'volume' || !out.some((x) => x.exerciseId === r.exerciseId && (x.kind === 'e1rm' || x.kind === 'weight')));
}

/* День недели даты: 0 — понедельник … 6 — воскресенье */
export function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/* Какую тренировку предложить на дату: по расписанию сегодня → пропущенная за неделю → следующая.
   Без расписания — следующий шаблон после последнего сделанного. { plan, why: today|missed|next|cycle, date } */
export function suggestPlan(plans, logs, today) {
  const list = (plans || []).filter((p) => !p.archived);
  if (!list.length) return null;
  const scheduled = list.filter((p) => p.weekday != null);
  const done = (logs || []).filter((w) => w.planId);
  const start = (logs || []).reduce((m, w) => (m && m < w.date ? m : w.date), null);
  if (scheduled.length) {
    const wd = weekdayOf(today);
    const todays = scheduled.find((p) => p.weekday === wd);
    if (todays) return { plan: todays, why: 'today', date: today };
    for (let i = 7; i >= 1; i--) {
      const d0 = addDays(today, -i);
      const p = scheduled.find((x) => x.weekday === weekdayOf(d0));
      if (!p || !start || d0 < start) continue;
      if (!done.some((w) => w.planId === p.id && w.date >= d0 && w.date < today)) return { plan: p, why: 'missed', date: d0 };
    }
    for (let i = 1; i <= 7; i++) {
      const d1 = addDays(today, i);
      const p = scheduled.find((x) => x.weekday === weekdayOf(d1));
      if (p) return { plan: p, why: 'next', date: d1 };
    }
  }
  const last = sortLogs(done).find((w) => list.some((p) => p.id === w.planId));
  if (!last) return { plan: list[0], why: 'cycle', date: today };
  const k = list.findIndex((p) => p.id === last.planId);
  return { plan: list[(k + 1) % list.length], why: 'cycle', date: today };
}

/* Кардио журнала: тип ↔ упражнение справочника */
export const CARDIO_LEGACY = Object.freeze({
  treadmill_walk: 'fe-Walking_Treadmill',
  treadmill_run: 'fe-Running_Treadmill',
  elliptical: 'fe-Elliptical_Trainer',
  bike: 'fe-Bicycling_Stationary',
  stepper: 'fe-Stairmaster',
  rower: 'fe-Rowing_Stationary',
  outdoor: 'fe-Trail_Running_Walking'
});
const WALK_MAX_KMH = 6.4; /* граница ходьбы и бега, как в расчёте журнала */

export function cardioExerciseId(type, speedKmh) {
  if (type === 'treadmill') return pos(speedKmh) && speedKmh > WALK_MAX_KMH ? CARDIO_LEGACY.treadmill_run : CARDIO_LEGACY.treadmill_walk;
  return CARDIO_LEGACY[type] || 'cardio-other';
}

export function legacyCardioType(exerciseId) {
  if (exerciseId === CARDIO_LEGACY.treadmill_walk || exerciseId === CARDIO_LEGACY.treadmill_run || exerciseId === 'fe-Jogging_Treadmill') return 'treadmill';
  if (exerciseId === 'fe-Recumbent_Bike') return 'bike';
  if (exerciseId === 'fe-Step_Mill') return 'stepper';
  if (exerciseId === 'fe-Bicycling') return 'outdoor';
  const k = Object.keys(CARDIO_LEGACY).find((x) => CARDIO_LEGACY[x] === exerciseId);
  return k || 'other';
}

/* Подход-кардио: минуты и км ↔ секунды и метры, скорость — если не задана, из дистанции и времени */
export function cardioPace(set, cardio) {
  const min = pos(set && set.timeSec) ? set.timeSec / 60 : 0;
  const km = pos(set && set.distanceM) ? set.distanceM / 1000 : 0;
  let v = pos(cardio && cardio.speedKmh) || 0;
  if (!v && km > 0 && min > 0) v = km / (min / 60);
  return { min, km: km || (v > 0 && min > 0 ? v * min / 60 : 0), speedKmh: v };
}
