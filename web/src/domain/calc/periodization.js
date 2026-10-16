/* Неделя программы, периодизация и делоад (раздел 2.1): где мы в блоке и как меняются цели недели. */
import {
  PERIOD_LINEAR_REPS_PER_WEEK, PERIOD_LINEAR_MAX_SHIFT, PERIOD_UNDULATING_SHIFT, DELOAD_SET_FACTOR, DELOAD_RIR_ADD
} from './constants.js';
import { addDays, diffDays, weekdayOf, isDate } from './dates.js';

export const PERIODIZATIONS = Object.freeze(['none', 'linear', 'reverse', 'undulating']);
export const DELOADS = Object.freeze(['none', 'start', 'end']);

const monday = (d) => addDays(d, -weekdayOf(d));

/* Неделя программы на дату: { block, week, weeks, workWeek, workWeeks, deload, cycle, total } или null
   (дата раньше старта; повтор «один раз» — и блоки закончились: { finished: true }).
   Недели считаются с понедельника недели старта. week — номер недели в блоке с 0, workWeek — номер среди
   недель без делоада (для периодизации). Блоки без недель пропускаются; нет блоков — null. */
export function programWeek(program, date) {
  if (!program || !isDate(program.startDate) || !isDate(date)) return null;
  const blocks = (program.blocks || []).filter((b) => b && b.weeks > 0);
  if (!blocks.length) return null;
  const k = Math.floor(diffDays(monday(program.startDate), monday(date)) / 7);
  if (k < 0) return null;
  const total = blocks.reduce((n, b) => n + b.weeks, 0);
  if (program.repeat === 'once' && k >= total) return { finished: true, total };
  let w = k % total;
  let bi = 0;
  while (w >= blocks[bi].weeks) { w -= blocks[bi].weeks; bi++; }
  const weeks = blocks[bi].weeks;
  const dl = DELOADS.includes(program.deload) ? program.deload : 'none';
  const hasDeload = dl !== 'none' && weeks > 1;
  const deload = hasDeload && (dl === 'start' ? w === 0 : w === weeks - 1);
  const workWeek = hasDeload && dl === 'start' ? Math.max(0, w - 1) : w;
  return { block: bi, blockId: blocks[bi].id || '', week: w, weeks, workWeek, workWeeks: hasDeload ? weeks - 1 : weeks, deload, cycle: Math.floor(k / total), total };
}

/* Поправки недели: { repShift, rirAdd, setFactor, heavy } — повторы сдвигаются, RIR прибавляется, подходы умножаются.
   linear — повторов меньше на PERIOD_LINEAR_REPS_PER_WEEK за неделю (не больше PERIOD_LINEAR_MAX_SHIFT);
   reverse — наоборот, больше; undulating — тяжёлая (−) и лёгкая (+) недели по очереди; делоад важнее периодизации. */
export function weekModifiers({ periodization = 'none', workWeek = 0, deload = false } = {}) {
  if (!PERIODIZATIONS.includes(periodization)) throw new Error('unknown periodization: ' + periodization);
  if (!Number.isInteger(workWeek) || workWeek < 0) throw new Error('invalid week: ' + workWeek);
  if (deload) return { repShift: 0, rirAdd: DELOAD_RIR_ADD, setFactor: DELOAD_SET_FACTOR, heavy: null, deload: true };
  const lin = Math.min(workWeek * PERIOD_LINEAR_REPS_PER_WEEK, PERIOD_LINEAR_MAX_SHIFT);
  if (periodization === 'linear') return { repShift: -lin, rirAdd: 0, setFactor: 1, heavy: null, deload: false };
  if (periodization === 'reverse') return { repShift: lin, rirAdd: 0, setFactor: 1, heavy: null, deload: false };
  if (periodization === 'undulating') {
    const heavy = workWeek % 2 === 0;
    return { repShift: heavy ? -PERIOD_UNDULATING_SHIFT : PERIOD_UNDULATING_SHIFT, rirAdd: 0, setFactor: 1, heavy, deload: false };
  }
  return { repShift: 0, rirAdd: 0, setFactor: 1, heavy: null, deload: false };
}

/* Цели упражнения шаблона с поправками недели: повторы не меньше 1 (min ≤ max), подходы — округление вверх, не меньше 1,
   RIR не больше 10. Упражнения на время и без целей — только подходы. */
export function applyWeek(item, mods) {
  if (!item || !mods) return item;
  const o = Object.assign({}, item);
  if (o.sets != null) o.sets = Math.max(1, Math.ceil(o.sets * mods.setFactor - 1e-9));
  if (o.repMin != null || o.repMax != null) {
    if (o.repMin != null) o.repMin = Math.max(1, o.repMin + mods.repShift);
    if (o.repMax != null) o.repMax = Math.max(o.repMin != null ? o.repMin : 1, o.repMax + mods.repShift);
  }
  if (mods.rirAdd) o.rir = Math.min(10, (o.rir != null ? o.rir : 2) + mods.rirAdd);
  return o;
}
