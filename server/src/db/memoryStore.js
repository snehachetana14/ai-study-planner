// In-memory store with optional JSON-file persistence.
// Used automatically when MONGODB_URI is empty, so the app runs with zero setup.
// Same interface as mongoStore: find, findOne, insert, update, upsert, remove.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const COLLECTIONS = ['users', 'courses', 'assignments', 'schedules', 'attendance', 'notifications'];

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const matches = (doc, filter = {}) => Object.entries(filter).every(([k, v]) => doc[k] === v);

function createMemoryStore({ file = null } = {}) {
  let data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

  if (file && fs.existsSync(file)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
      data = { ...data, ...loaded };
    } catch (err) {
      console.warn(`[store] Could not read ${file}, starting empty: ${err.message}`);
    }
  }

  let timer = null;
  function persist() {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 50);
    if (timer.unref) timer.unref();
  }
  function flush() {
    if (!file) return;
    clearTimeout(timer);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  function collection(name) {
    return {
      async find(filter) {
        return data[name].filter((d) => matches(d, filter)).map(clone);
      },
      async findOne(filter) {
        return clone(data[name].find((d) => matches(d, filter)) || null);
      },
      async insert(doc) {
        const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...clone(doc) };
        if (name === 'users' && data.users.some((u) => u.email === record.email)) {
          const err = new Error('duplicate key: email');
          err.code = 11000;
          throw err;
        }
        data[name].push(record);
        persist();
        return clone(record);
      },
      async update(filter, patch) {
        const doc = data[name].find((d) => matches(d, filter));
        if (!doc) return null;
        Object.assign(doc, clone(patch));
        persist();
        return clone(doc);
      },
      async upsert(filter, patch) {
        const existing = data[name].find((d) => matches(d, filter));
        if (existing) return this.update(filter, patch);
        return this.insert({ ...filter, ...patch });
      },
      async remove(filter) {
        const before = data[name].length;
        data[name] = data[name].filter((d) => !matches(d, filter));
        const removed = before - data[name].length;
        if (removed) persist();
        return removed;
      },
    };
  }

  const store = { kind: file ? 'file' : 'memory', flush, close: async () => flush() };
  for (const name of COLLECTIONS) store[name] = collection(name);
  return store;
}

module.exports = { createMemoryStore };
