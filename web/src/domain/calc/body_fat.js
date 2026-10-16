/* Процент жира по формулам (медиана доступных оценок) и отношения обхватов.
   Формулы и коэффициенты — в constants.js (BODY_FAT). Ручной замер (весы, калипер) всегда важнее оценки. */
import { BODY_FAT } from './constants.js';
import { isNum, median, roundTo, checkSex } from './util.js';

function pos(x) { return isNum(x) && x > 0; }

/* Оценки: [{ method, pct }] по тем формулам, для которых хватает данных; неправдоподобные отброшены */
export function bodyFatEstimates({ sex, ageYears, weightKg, heightCm, waistCm, neckCm, hipsCm } = {}) {
  checkSex(sex);
  const C = BODY_FAT, male = sex === 'male', out = [];
  if (pos(weightKg) && pos(heightCm) && pos(ageYears)) {
    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    const d = C.deurenberg;
    out.push({ method: 'deurenberg', pct: d.bmi * bmi + d.age * ageYears + (male ? d.male : 0) + d.base });
    const c = C.cunBae, f = male ? 0 : 1;
    out.push({ method: 'cun_bae', pct: c.base + c.age * ageYears + c.female * f + c.bmi * bmi + c.bmi2 * bmi * bmi + c.bmiFemale * bmi * f + c.bmiAge * bmi * ageYears + c.bmi2Female * bmi * bmi * f + c.bmi2Age * bmi * bmi * ageYears });
  }
  if (pos(heightCm) && pos(waistCm)) out.push({ method: 'rfm', pct: (male ? C.rfm.male : C.rfm.female) - C.rfm.k * (heightCm / waistCm) });
  if (pos(heightCm) && pos(waistCm) && pos(neckCm)) {
    const n = C.navy;
    if (male && waistCm > neckCm) out.push({ method: 'navy', pct: n.num / (n.male.a - n.male.waistNeck * Math.log10(waistCm - neckCm) + n.male.height * Math.log10(heightCm)) - n.sub });
    if (!male && pos(hipsCm) && waistCm + hipsCm > neckCm) out.push({ method: 'navy', pct: n.num / (n.female.a - n.female.waistHipNeck * Math.log10(waistCm + hipsCm - neckCm) + n.female.height * Math.log10(heightCm)) - n.sub });
  }
  return out.filter((x) => isNum(x.pct) && x.pct >= C.validMin && x.pct <= C.validMax).map((x) => ({ method: x.method, pct: roundTo(x.pct, 1) }));
}

/* Итоговая оценка — медиана; null, если данных не хватает */
export function bodyFatEstimate(input) {
  const e = bodyFatEstimates(input);
  return e.length ? { pct: roundTo(median(e.map((x) => x.pct)), 1), methods: e } : null;
}

/* Отношения талия/рост и талия/бёдра; null, где нет данных */
export function bodyRatios({ waistCm, heightCm, hipsCm } = {}) {
  return {
    waistToHeight: pos(waistCm) && pos(heightCm) ? roundTo(waistCm / heightCm, 3) : null,
    waistToHip: pos(waistCm) && pos(hipsCm) ? roundTo(waistCm / hipsCm, 3) : null
  };
}
