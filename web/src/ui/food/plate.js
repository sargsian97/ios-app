/* «Тарелка»: несколько продуктов, которые записываются в дневник разом.
   Живёт в памяти, пока открыт экран добавления (и между его подэкранами). */
import { useEffect, useReducer } from '../core.js';
import { addNutrients, roundNutrients } from '../../data/models/nutrients.js';

let items = [];
const subs = new Set();
let seq = 0;
function emit() { subs.forEach((f) => f()); }

export const plate = {
  items: () => items,
  add(item) { items = items.concat([Object.assign({ key: 'p' + (++seq) }, item)]); emit(); },
  update(key, patch) { items = items.map((x) => (x.key === key ? Object.assign({}, x, patch) : x)); emit(); },
  remove(key) { items = items.filter((x) => x.key !== key); emit(); },
  clear() { items = []; emit(); },
  totals() { let n = {}; items.forEach((x) => { n = addNutrients(n, x.nutrients); }); return roundNutrients(n, 1); }
};

export function usePlate() {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(bump); return () => subs.delete(bump); }, []);
  return plate;
}
