/* Маленькая схема для сущностей: нормализация (привести к типу, подставить значения
   по умолчанию) и проверка (вернуть список ошибок). Документы хранятся как обычный JSON:
   даты — 'YYYY-MM-DD', время — ISO-строки, числа — в метрических единицах. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function toNum(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function dflt(d) { return typeof d === 'function' ? d() : d; }

export function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/* Конструкторы полей. У каждого: normalize(v), validate(v) → строка-ошибка или null, def */
export const f = {
  string({ def = '', nullable = false, max = 2000 } = {}) {
    return {
      def: nullable && def === '' ? null : def,
      normalize(v) { if (v == null) return nullable ? null : dflt(def); return String(v).slice(0, max); },
      validate(v) { if (v == null) return nullable ? null : 'обязательное поле'; return typeof v === 'string' ? null : 'нужна строка'; }
    };
  },
  number({ def = null, nullable = true, min = -Infinity, max = Infinity, int = false } = {}) {
    return {
      def,
      normalize(v) {
        let n = toNum(v);
        if (n == null) return nullable ? null : dflt(def);
        if (int) n = Math.round(n);
        return n;
      },
      validate(v) {
        if (v == null) return nullable ? null : 'обязательное число';
        if (!isNum(v)) return 'нужно число';
        if (v < min) return 'меньше ' + min;
        if (v > max) return 'больше ' + max;
        if (int && !Number.isInteger(v)) return 'нужно целое';
        return null;
      }
    };
  },
  bool({ def = false } = {}) {
    return { def, normalize(v) { return v == null ? dflt(def) : v === true || v === 1 || v === 'true'; }, validate(v) { return typeof v === 'boolean' ? null : 'нужно да/нет'; } };
  },
  enum(values, { def, nullable = false } = {}) {
    const d = def !== undefined ? def : (nullable ? null : values[0]);
    return {
      def: d, values,
      normalize(v) { return values.includes(v) ? v : (v == null && nullable ? null : dflt(d)); },
      validate(v) { if (v == null) return nullable ? null : 'обязательное поле'; return values.includes(v) ? null : 'недопустимое значение'; }
    };
  },
  date({ nullable = true, def = null } = {}) {
    return {
      def,
      normalize(v) { return validDate(v) ? v : (nullable ? null : dflt(def)); },
      validate(v) { if (v == null) return nullable ? null : 'обязательная дата'; return validDate(v) ? null : 'дата в формате ГГГГ-ММ-ДД'; }
    };
  },
  time({ nullable = true, def = null } = {}) {
    return {
      def,
      normalize(v) { return typeof v === 'string' && TIME_RE.test(v) ? v : (nullable ? null : dflt(def)); },
      validate(v) { if (v == null) return nullable ? null : 'обязательное время'; return TIME_RE.test(v) ? null : 'время в формате ЧЧ:ММ'; }
    };
  },
  /* ISO-время (createdAt и т.п.) */
  timestamp({ nullable = true } = {}) {
    return {
      def: null,
      normalize(v) { return typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null; },
      validate(v) { if (v == null) return nullable ? null : 'обязательное время'; return isNaN(Date.parse(v)) ? 'неверное время' : null; }
    };
  },
  ref({ nullable = true } = {}) {
    return {
      def: null,
      normalize(v) { return v == null || v === '' ? null : String(v); },
      validate(v) { if (v == null) return nullable ? null : 'нужна ссылка'; return typeof v === 'string' ? null : 'нужна ссылка'; }
    };
  },
  array(item, { def = () => [], max = 5000 } = {}) {
    return {
      def,
      normalize(v) { return Array.isArray(v) ? v.slice(0, max).map((x) => item.normalize(x)) : dflt(def); },
      validate(v) {
        if (!Array.isArray(v)) return 'нужен список';
        for (let i = 0; i < v.length; i++) { const e = item.validate(v[i]); if (e) return '[' + i + '] ' + e; }
        return null;
      }
    };
  },
  shape(fields, { nullable = false } = {}) {
    const sh = {
      def: () => (nullable ? null : normalizeFields(fields, {})),
      normalize(v) { if (v == null || typeof v !== 'object') return nullable ? null : normalizeFields(fields, {}); return normalizeFields(fields, v); },
      validate(v) { if (v == null) return nullable ? null : 'обязательный объект'; const e = validateFields(fields, v); return e.length ? e[0] : null; }
    };
    return sh;
  },
  /* Словарь { ключ: значение одного типа } — например нутриенты */
  record(item, { def = () => ({}) } = {}) {
    return {
      def,
      normalize(v) {
        const o = {};
        if (v && typeof v === 'object') Object.keys(v).forEach((k) => { const x = item.normalize(v[k]); if (x != null) o[k] = x; });
        return o;
      },
      validate(v) {
        if (!v || typeof v !== 'object') return 'нужен объект';
        for (const k of Object.keys(v)) { const e = item.validate(v[k]); if (e) return k + ': ' + e; }
        return null;
      }
    };
  },
  /* Любое JSON-значение без проверки */
  any({ def = null } = {}) {
    return { def, normalize(v) { return v === undefined ? dflt(def) : v; }, validate() { return null; } };
  }
};

function normalizeFields(fields, raw) {
  const o = {};
  Object.keys(fields).forEach((k) => {
    const fl = fields[k];
    o[k] = raw[k] === undefined ? (fl.def === undefined ? null : (typeof fl.def === 'function' ? fl.def() : fl.def)) : fl.normalize(raw[k]);
    if (o[k] === undefined) o[k] = null;
  });
  return o;
}

function validateFields(fields, obj) {
  const errs = [];
  Object.keys(fields).forEach((k) => { const e = fields[k].validate(obj[k]); if (e) errs.push(k + ': ' + e); });
  return errs;
}

/* Описание сущности.
   Неизвестные поля сохраняются как есть (данные не теряются при смене версий). */
export function model({ name, collection, singleton = false, fields, check }) {
  const all = Object.assign({ id: f.ref({ nullable: false }), createdAt: f.timestamp(), updatedAt: f.timestamp() }, fields);
  return {
    name, collection, singleton, fields: all,
    defaults(extra = {}) { return normalizeFields(all, Object.assign({}, extra)); },
    normalize(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      return Object.assign({}, src, normalizeFields(all, src));
    },
    validate(obj) {
      const errs = validateFields(all, obj);
      if (check && !errs.length) { const e = check(obj); if (e) errs.push(...[].concat(e)); }
      return errs;
    }
  };
}

export class ValidationError extends Error {
  constructor(entity, errors) {
    super(entity + ': ' + errors.join('; '));
    this.name = 'ValidationError';
    this.entity = entity;
    this.errors = errors;
  }
}
