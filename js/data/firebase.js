// Облачный режим: Firebase Auth + Firestore с офлайн-кэшем.
// Записи не ждут ответа сервера: трата появляется сразу (из локального кэша)
// и уходит на сервер, когда появится сеть.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  increment,
  arrayUnion,
  getDoc,
  getDocs,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

import { startingTransaction, initialPlan, DEFAULT_SHOPS } from '../lib/budget.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I

function makeCode() {
  let s = '';
  const rnd = crypto.getRandomValues(new Uint32Array(6));
  for (const n of rnd) s += CODE_ALPHABET[n % CODE_ALPHABET.length];
  return s;
}

const toUser = (u) => (u ? { uid: u.uid, name: u.displayName || u.email?.split('@')[0] || 'Я', email: u.email } : null);

const ERRORS = {
  'auth/invalid-credential': 'Неверный email или пароль',
  'auth/wrong-password': 'Неверный пароль',
  'auth/user-not-found': 'Пользователь не найден',
  'auth/email-already-in-use': 'Этот email уже зарегистрирован, войдите',
  'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
  'auth/invalid-email': 'Неверный формат email',
  'auth/network-request-failed': 'Нет интернета',
  'auth/too-many-requests': 'Слишком много попыток, попробуйте позже',
};

function humanize(e) {
  return new Error(ERRORS[e?.code] || e?.message || 'Ошибка');
}

export function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'ru';
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  // Firebase сообщает «вход проверен» один раз. Запоминаем, что сообщение уже было, и новым подписчикам
  // отдаём состояние сразу — иначе подписавшийся чуть позже навсегда остаётся на заставке.
  const authListeners = new Set();
  let authKnown = false;
  const emitAuth = () => {
    authKnown = true;
    authListeners.forEach((cb) => cb(toUser(auth.currentUser)));
  };
  onAuthStateChanged(auth, emitAuth);

  const fam = (fid, ...path) => doc(db, 'families', fid, ...path);
  const famCol = (fid, name) => collection(db, 'families', fid, name);

  function applyBalances(batch, fid, changes = []) {
    for (const { envelopeId, delta } of changes) {
      if (delta) batch.update(fam(fid, 'envelopes', envelopeId), { balance: increment(delta) });
    }
  }

  // Ошибки фоновых записей показываем через этот колбэк (ставит App).
  let onError = (e) => console.error(e);
  const commit = (batch) => {
    batch.commit().catch((e) => onError(humanize(e)));
  };

  return {
    mode: 'cloud',
    setErrorHandler(fn) {
      onError = fn;
    },

    onAuth(cb) {
      authListeners.add(cb);
      if (authKnown) cb(toUser(auth.currentUser));
      return () => authListeners.delete(cb);
    },

    async signIn(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw humanize(e);
      }
    },

    async signUp(email, password, name) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        emitAuth(); // имя появилось после создания — обновим подписчиков
      } catch (e) {
        throw humanize(e);
      }
    },

    async resetPassword(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        throw humanize(e);
      }
    },

    async signOut() {
      await signOut(auth);
    },

    watchProfile(uid, cb) {
      return onSnapshot(
        doc(db, 'users', uid),
        (snap) => cb(snap.exists() ? snap.data() : null),
        (e) => onError(humanize(e)),
      );
    },

    async createFamily(user, { envelopes, income, periodStart, ...family }) {
      const fref = doc(collection(db, 'families'));
      const fid = fref.id;
      const code = makeCode();
      const batch = writeBatch(db);
      batch.set(fref, {
        ...family,
        members: [user.uid],
        memberNames: { [user.uid]: user.name },
        inviteCode: code,
        summaryDone: {},
        createdAt: Date.now(),
      });
      batch.set(doc(db, 'invites', code), { familyId: fid });
      const created = envelopes.map(({ initialSpent, ...e }, i) => {
        const eref = doc(famCol(fid, 'envelopes'));
        if (initialSpent) batch.set(doc(famCol(fid, 'transactions')), startingTransaction(user, eref.id, initialSpent));
        return { ref: eref, data: { order: i, archived: false, balance: 0, ...e, id: eref.id } };
      });
      if (income != null && periodStart) {
        const plan = initialPlan(user, income, created.map((c) => c.data));
        batch.set(fam(fid, 'periods', periodStart), plan);
        const main = created.find((c) => c.data.id === plan.mainEnvelopeId);
        if (main) main.data.limit = plan.free;
      }
      for (const { ref, data } of created) {
        const { id, ...rest } = data;
        batch.set(ref, rest);
      }
      batch.set(doc(db, 'users', user.uid), { familyId: fid });
      await batch.commit();
      return fid;
    },

    async joinFamily(user, rawCode) {
      const code = rawCode.trim().toUpperCase();
      let inv;
      try {
        inv = await getDoc(doc(db, 'invites', code));
      } catch (e) {
        throw new Error('Не удалось проверить код. Нужен интернет.');
      }
      if (!inv.exists()) throw new Error('Код не найден. Проверьте его у того, кто создал семью.');
      const fid = inv.data().familyId;
      const batch = writeBatch(db);
      batch.update(doc(db, 'families', fid), {
        members: arrayUnion(user.uid),
        [`memberNames.${user.uid}`]: user.name,
      });
      batch.set(doc(db, 'users', user.uid), { familyId: fid });
      try {
        await batch.commit();
      } catch (e) {
        throw humanize(e);
      }
      return fid;
    },

    watchFamily(fid, cb) {
      return onSnapshot(fam(fid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => onError(humanize(e)));
    },

    watchEnvelopes(fid, cb) {
      return onSnapshot(
        famCol(fid, 'envelopes'),
        (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)),
        (e) => onError(humanize(e)),
      );
    },

    watchTransactions(fid, since, cb) {
      const q = query(famCol(fid, 'transactions'), where('date', '>=', since), orderBy('date', 'desc'));
      return onSnapshot(
        q,
        (s) =>
          cb(
            s.docs
              .map((d) => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites }))
              .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
          ),
        (e) => onError(humanize(e)),
      );
    },

    // Разделы покупок (магазины и категории)
    watchShops(fid, cb) {
      return onSnapshot(
        famCol(fid, 'shops'),
        (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)),
        (e) => onError(humanize(e)),
      );
    },

    async saveShop(fid, shop) {
      const { id, ...data } = shop;
      const ref = id ? fam(fid, 'shops', id) : doc(famCol(fid, 'shops'));
      const batch = writeBatch(db);
      if (id) batch.update(ref, data);
      else batch.set(ref, { archived: false, ...data });
      commit(batch);
      return ref.id;
    },

    // Разделы по умолчанию. Слияние без поля name: переименование и «скрыт» владельца не затираются,
    // даже если оба телефона запишут это одновременно.
    async ensureDefaultShops(fid) {
      const batch = writeBatch(db);
      for (const { id, ...s } of DEFAULT_SHOPS) batch.set(fam(fid, 'shops', id), s, { merge: true });
      commit(batch);
    },

    // Планы периодов (доход и обязательные статьи): { 'YYYY-MM-DD начала': план }
    watchPeriods(fid, cb) {
      return onSnapshot(
        famCol(fid, 'periods'),
        (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))),
        (e) => onError(humanize(e)),
      );
    },

    async savePeriod(fid, start, plan, envelopeUpdates = []) {
      const batch = writeBatch(db);
      batch.set(fam(fid, 'periods', start), plan);
      for (const { id, ...patch } of envelopeUpdates) batch.update(fam(fid, 'envelopes', id), patch);
      commit(batch);
    },

    async fetchAllTransactions(fid) {
      const s = await getDocs(query(famCol(fid, 'transactions'), orderBy('date', 'desc')));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async updateFamily(fid, patch) {
      updateDoc(fam(fid), patch).catch((e) => onError(humanize(e)));
    },

    async saveEnvelope(fid, env) {
      const { id, ...data } = env;
      const ref = id ? fam(fid, 'envelopes', id) : doc(famCol(fid, 'envelopes'));
      const batch = writeBatch(db);
      if (id) batch.update(ref, data);
      else batch.set(ref, { balance: 0, archived: false, ...data });
      commit(batch);
      return ref.id;
    },

    async addTransaction(fid, tx, balanceChanges) {
      const ref = doc(famCol(fid, 'transactions'));
      const batch = writeBatch(db);
      batch.set(ref, tx);
      applyBalances(batch, fid, balanceChanges);
      commit(batch);
      return ref.id;
    },

    async updateTransaction(fid, id, patch, balanceChanges) {
      const batch = writeBatch(db);
      batch.update(fam(fid, 'transactions', id), patch);
      applyBalances(batch, fid, balanceChanges);
      commit(batch);
    },

    async deleteTransaction(fid, id, balanceChanges) {
      const batch = writeBatch(db);
      batch.delete(fam(fid, 'transactions', id));
      applyBalances(batch, fid, balanceChanges);
      commit(batch);
    },
  };
}
