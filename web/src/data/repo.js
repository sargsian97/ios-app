/* Репозиторий сущности поверх хранилища: создать, прочитать, изменить, удалить.
   Документы нормализуются и проверяются при записи; читаются как есть (замороженные). */
import { ValidationError } from './schema.js';
import { uid } from './ids.js';

export function createRepo(store, model, { now = () => new Date().toISOString(), newId = uid } = {}) {
  const col = model.collection;

  function prepare(obj) {
    const doc = model.normalize(obj);
    const errs = model.validate(doc);
    if (errs.length) throw new ValidationError(model.name, errs);
    return doc;
  }

  const repo = {
    model,
    get(id) { return store.get(col, id); },
    list(filter) { const all = store.list(col); return filter ? all.filter(filter) : all; },
    count() { return store.ids(col).length; },
    async create(data = {}) {
      const t = now();
      const doc = prepare(Object.assign({}, data, { id: data.id || newId(), createdAt: data.createdAt || t, updatedAt: t }));
      if (store.get(col, doc.id)) throw new Error(model.name + ': id уже занят: ' + doc.id);
      await store.put(col, doc.id, doc);
      return doc;
    },
    async update(id, patch) {
      const cur = store.get(col, id);
      if (!cur) throw new Error(model.name + ': не найдено: ' + id);
      const doc = prepare(Object.assign({}, cur, patch, { id, createdAt: cur.createdAt, updatedAt: now() }));
      await store.put(col, id, doc);
      return doc;
    },
    /* Создать или заменить целиком */
    async save(data) {
      const t = now(), cur = data.id ? store.get(col, data.id) : null;
      const doc = prepare(Object.assign({}, data, { id: data.id || newId(), createdAt: (cur && cur.createdAt) || data.createdAt || t, updatedAt: t }));
      await store.put(col, doc.id, doc);
      return doc;
    },
    async remove(id) { await store.remove(col, id); },
    /* Операции для store.batch — чтобы записать несколько сущностей одной транзакцией */
    putOp(data) {
      const t = now(), cur = data.id ? store.get(col, data.id) : null;
      const doc = prepare(Object.assign({}, data, { id: data.id || newId(), createdAt: (cur && cur.createdAt) || data.createdAt || t, updatedAt: data.updatedAt || t }));
      return { op: 'put', col, id: doc.id, data: doc };
    },
    removeOp(id) { return { op: 'remove', col, id }; },
    subscribe(cb) { return store.subscribe(col, cb); }
  };
  return repo;
}

/* Единственный документ (профиль, настройки): id всегда 'me' */
export function createSingletonRepo(store, model, opts) {
  const base = createRepo(store, model, opts);
  const ID = 'me';
  return Object.assign({}, base, {
    get() { return store.get(model.collection, ID) || model.defaults({ id: ID }); },
    exists() { return !!store.get(model.collection, ID); },
    async update(patch) {
      const cur = store.get(model.collection, ID);
      if (!cur) return base.save(Object.assign(model.defaults({ id: ID }), patch, { id: ID }));
      return base.update(ID, patch);
    },
    putOp(patch) { return base.putOp(Object.assign({}, this.get(), patch, { id: ID })); }
  });
}
