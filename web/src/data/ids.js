/* Короткие уникальные id: время + случайная часть, сортируются по времени создания */
let last = 0, seq = 0;
export function uid(now = Date.now()) {
  if (now === last) seq++; else { last = now; seq = 0; }
  return now.toString(36) + seq.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
}
