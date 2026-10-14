// Локальный режим: всё в localStorage этого устройства, без входа и синхронизации.
import { startingTransaction as startingTx } from '../lib/budget.js';

const KEY = 'ekonomia:v1';
const LOCAL_USER = { uid: 'local', name: 'Я', email: null };

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

let db = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Не удалось сохранить данные', e);
  }
  for (const fn of listeners) fn();
}

function watch(select, cb) {
  const fn = () => cb(select());
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function applyBalances(changes = []) {
  for (const { envelopeId, delta } of changes) {
    const env = db.envelopes?.[envelopeId];
    if (env) env.balance = (env.balance || 0) + delta;
  }
}

export const localBackend = {
  mode: 'local',

  onAuth(cb) {
    cb(LOCAL_USER);
    return () => {};
  },
  async signIn() {},
  async signUp() {},
  async resetPassword() {},
  async signOut() {},

  watchProfile(uid, cb) {
    return watch(() => (db.family ? { familyId: db.family.id } : null), cb);
  },

  async createFamily(user, { envelopes, ...family }) {
    const id = 'local';
    db = {
      family: { id, ...family, members: [user.uid], memberNames: { [user.uid]: user.name }, summaryDone: {} },
      envelopes: {},
      transactions: {},
    };
    envelopes.forEach(({ initialSpent, ...e }, i) => {
      const eid = newId();
      db.envelopes[eid] = { id: eid, order: i, archived: false, balance: 0, ...e };
      if (initialSpent) {
        const tid = newId();
        db.transactions[tid] = { id: tid, ...startingTx(user, eid, initialSpent) };
      }
    });
    save();
    return id;
  },

  async joinFamily() {
    throw new Error('Вступить в семью можно только после подключения Firebase (см. README.md).');
  },

  watchFamily(fid, cb) {
    return watch(() => db.family || null, cb);
  },

  watchEnvelopes(fid, cb) {
    return watch(() => Object.values(db.envelopes || {}).sort((a, b) => a.order - b.order), cb);
  },

  watchTransactions(fid, since, cb) {
    return watch(
      () =>
        Object.values(db.transactions || {})
          .filter((t) => t.date >= since)
          .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
      cb,
    );
  },

  async fetchAllTransactions() {
    return Object.values(db.transactions || {}).sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  // Поддерживаем пути вида 'summaryDone.2026-10-10', как в Firestore
  async updateFamily(fid, patch) {
    const family = { ...db.family };
    for (const [key, value] of Object.entries(patch)) {
      const [head, ...rest] = key.split('.');
      if (rest.length) family[head] = { ...family[head], [rest.join('.')]: value };
      else family[key] = value;
    }
    db.family = family;
    save();
  },

  async saveEnvelope(fid, env) {
    const id = env.id || newId();
    db.envelopes[id] = { balance: 0, archived: false, ...db.envelopes[id], ...env, id };
    save();
    return id;
  },

  async addTransaction(fid, tx, balanceChanges) {
    const id = newId();
    db.transactions[id] = { ...tx, id };
    applyBalances(balanceChanges);
    save();
    return id;
  },

  async updateTransaction(fid, id, patch, balanceChanges) {
    db.transactions[id] = { ...db.transactions[id], ...patch };
    applyBalances(balanceChanges);
    save();
  },

  async deleteTransaction(fid, id, balanceChanges) {
    delete db.transactions[id];
    applyBalances(balanceChanges);
    save();
  },

  // Для переноса в облако и резервной копии
  exportAll() {
    return JSON.parse(JSON.stringify(db));
  },
  importAll(data) {
    db = data;
    save();
  },
};
