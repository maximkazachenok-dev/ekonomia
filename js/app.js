import { html, render, useState, useEffect, useMemo, useCallback } from './lib/preact.js';
import { AppContext, Toasts, showToast, Icon } from './ui/common.js';
import { TxSheet } from './ui/tx-sheet.js';
import { EnvelopeSheet } from './ui/envelope-sheet.js';
import { SummarySheet } from './ui/summary-sheet.js';
import { StatsSheet } from './ui/stats-sheet.js';
import { IncomeSheet } from './ui/income-sheet.js';
import { AllocateSheet } from './ui/allocate-sheet.js';
import { PurchaseSheet } from './ui/purchase-sheet.js';
import { ShopSheet } from './ui/shop-sheet.js';
import { ShopsScreen } from './screens/shops.js';
import { HomeScreen } from './screens/home.js';
import { HistoryScreen } from './screens/history.js';
import { SavingsScreen } from './screens/savings.js';
import { SettingsScreen } from './screens/settings.js';
import { Onboarding } from './screens/onboarding.js';
import { LoginScreen } from './screens/login.js';
import { createBackend, balanceChangesFor } from './data/store.js';
import {
  getPeriod, previousPeriod, periodSummary, applyEnvelopeToPlan, mainDailyEnvelope, DEFAULT_SHOPS, shopName,
  newPlan, withIncome, allocate, allocationsFromPrevious,
} from './lib/budget.js';
import { todayISO, formatDay } from './lib/dates.js';
import { formatMoney } from './lib/money.js';

// Дата «сегодня» обновляется при возврате в приложение и после полуночи.
function useToday() {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const tick = () => setToday(todayISO());
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

const TABS = [
  { id: 'home', label: 'Главная', icon: Icon.home },
  { id: 'shops', label: 'Магазины', icon: Icon.bag },
  { id: 'history', label: 'История', icon: Icon.list },
  { id: 'savings', label: 'Копилки', icon: Icon.piggy },
  { id: 'settings', label: 'Настройки', icon: Icon.settings },
];

function Splash() {
  return html`<div class="splash"><div class="onb__logo">💰</div></div>`;
}

function Budget({ backend, user, fid }) {
  const today = useToday();
  const [family, setFamily] = useState(null);
  const [envelopes, setEnvelopes] = useState(null);
  const [txs, setTxs] = useState(null);
  const [tab, setTab] = useState('home');
  const [txOpts, setTxOpts] = useState(null);
  const [envEdit, setEnvEdit] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [allocEnv, setAllocEnv] = useState(null);
  const [extraPeriods, setExtraPeriods] = useState(0);
  const [periods, setPeriods] = useState(null);
  const [shops, setShops] = useState(null);
  const [purchaseOpts, setPurchaseOpts] = useState(null);
  const [shopEdit, setShopEdit] = useState(null);
  const [openShopId, setOpenShopId] = useState(null);

  const payday = family?.payday || 10;
  const period = useMemo(() => getPeriod(today, payday), [today, payday]);
  const prevPeriod = useMemo(() => previousPeriod(period, payday), [period, payday]);
  // Грузим текущий и прошлый период; «Показать раньше» в истории добавляет ещё по одному.
  const since = useMemo(() => {
    let p = prevPeriod;
    for (let i = 0; i < extraPeriods; i++) p = previousPeriod(p, payday);
    return p.start;
  }, [prevPeriod, extraPeriods, payday]);

  useEffect(() => backend.watchFamily(fid, setFamily), [fid]);
  useEffect(() => backend.watchEnvelopes(fid, setEnvelopes), [fid]);
  useEffect(() => backend.watchTransactions(fid, since, setTxs), [fid, since]);
  useEffect(() => backend.watchPeriods(fid, setPeriods), [fid]);
  useEffect(() => backend.watchShops(fid, setShops), [fid]);

  // Разделы «Другое» и «Бытовая химия и гигиена» есть в каждом бюджете (в том числе созданном до их появления)
  useEffect(() => {
    if (shops && DEFAULT_SHOPS.some((d) => !shops.find((s) => s.id === d.id))) backend.ensureDefaultShops(fid);
  }, [shops === null]);

  const envById = useMemo(() => Object.fromEntries((envelopes || []).map((e) => [e.id, e])), [envelopes]);
  const shopById = useMemo(() => Object.fromEntries((shops || []).map((s) => [s.id, s])), [shops]);

  // Покупку с разделом правим в шторке покупки (там позиции), остальное — в обычной шторке траты
  const openTx = useCallback((opts) => (opts?.tx?.shopId ? setPurchaseOpts({ tx: opts.tx }) : setTxOpts(opts)), []);

  // Ярлык «Добавить трату» (долгое нажатие на иконку) открывает ввод сразу
  const ready = Boolean(family && envelopes && txs);
  useEffect(() => {
    if (!ready || !new URLSearchParams(location.search).has('add')) return;
    history.replaceState(null, '', location.pathname);
    setTxOpts({});
  }, [ready]);

  const addTx = useCallback(
    (tx, { silent = false } = {}) => {
      const p = backend.addTransaction(fid, tx, balanceChangesFor(envById, null, tx));
      if (silent) return;
      const env = envById[tx.envelopeId];
      const shop = tx.shopId && shopById[tx.shopId];
      const where = shop ? `${shop.icon || '🏪'} ${shopName(shop)}` : `${env.icon} ${env.name}`;
      p.then((id) =>
        showToast(`${formatMoney(tx.amount, family.currency)} · ${where}`, {
          label: 'Отменить',
          run: () => backend.deleteTransaction(fid, id, balanceChangesFor(envById, tx, null)),
        }),
      ).catch((e) => showToast(e.message));
    },
    [fid, envById, shopById, family],
  );

  const updateTx = useCallback(
    (old, patch) => {
      backend.updateTransaction(fid, old.id, patch, balanceChangesFor(envById, old, { ...old, ...patch })).catch((e) => showToast(e.message));
    },
    [fid, envById],
  );

  const deleteTx = useCallback(
    (tx) => {
      backend.deleteTransaction(fid, tx.id, balanceChangesFor(envById, tx, null)).catch((e) => showToast(e.message));
      const { id, pending, ...data } = tx;
      showToast('Запись удалена', { label: 'Вернуть', run: () => addTx(data, { silent: true }) });
    },
    [fid, envById, addTx],
  );

  if (!family || !envelopes || !txs || !periods || !shops) return html`<${Splash} />`;

  // План текущего и прошлого периода (доход и обязательные статьи). Пока дохода нет — null.
  const plan = periods[period.start] || null;
  const prevPlan = periods[prevPeriod.start] || null;

  // Итоги прошлого периода показываем, если в нём были траты и итоги ещё не закрыты.
  const prevSummary = periodSummary({ envelopes, txs, period: prevPeriod, plan: prevPlan });
  const summaryPending = !family.summaryDone?.[prevPeriod.start] && prevSummary.totalSpent > 0;

  const savePlan = (newPlan, envelopeUpdates) =>
    backend
      .savePeriod(fid, period.start, { ...newPlan, updatedBy: { uid: user.uid, name: user.name }, updatedAt: Date.now() }, envelopeUpdates)
      .catch((e) => showToast(e.message));

  // Доход внесли или исправили. Новый период начинается с нуля: весь доход свободен.
  const saveIncome = (income) => {
    const next = plan ? withIncome(plan, income) : newPlan({ income, envelopes });
    const main = mainDailyEnvelope(envelopes);
    savePlan(next, main ? [{ id: main.id, limit: Math.max(0, next.free) }] : []);
  };

  // Распределение на копилку сразу пополняет её: один взнос на период, правка суммы правит его же.
  const savingsDeposit = async (env, amount, currentTxId) => {
    const existing = currentTxId && txs.find((t) => t.id === currentTxId);
    if (amount > 0 && existing) {
      updateTx(existing, { amount });
      return existing.id;
    }
    if (amount > 0) {
      const tx = {
        envelopeId: env.id,
        type: 'deposit',
        amount,
        note: `Распределение дохода ${formatDay(period.start, { short: true })} — ${formatDay(period.end, { short: true })}`,
        date: today,
        createdBy: { uid: user.uid, name: user.name },
        createdAt: Date.now(),
      };
      return backend.addTransaction(fid, tx, balanceChangesFor(envById, null, tx));
    }
    if (existing) backend.deleteTransaction(fid, existing.id, balanceChangesFor(envById, existing, null));
    return null;
  };

  // Распределить сумму на категорию (0 — убрать). Свободные деньги и дневной лимит уменьшаются сразу.
  const allocateTo = async (env, amount) => {
    let next = allocate(plan, env.id, amount);
    if (env.kind === 'savings') {
      const id = await savingsDeposit(env, amount, plan.savingsTx?.[env.id]).catch((e) => showToast(e.message));
      const savingsTx = { ...(plan.savingsTx || {}) };
      if (id) savingsTx[env.id] = id;
      else delete savingsTx[env.id];
      next = { ...next, savingsTx };
    }
    savePlan(next);
  };

  // «Как в прошлом месяце»: те же суммы на ещё не распределённые категории.
  const repeatPrevious = async () => {
    const list = allocationsFromPrevious(plan, prevPlan, envelopes);
    let next = plan;
    const savingsTx = { ...(plan.savingsTx || {}) };
    for (const { envelope, amount } of list) {
      next = allocate(next, envelope.id, amount);
      if (envelope.kind === 'savings') {
        const id = await savingsDeposit(envelope, amount, null).catch((e) => showToast(e.message));
        if (id) savingsTx[envelope.id] = id;
      }
    }
    savePlan({ ...next, savingsTx });
    showToast(`Распределено как в прошлом месяце: ${formatMoney(list.reduce((s, a) => s + a.amount, 0), family.currency)}`);
  };

  // Категорию скрыли посреди периода — её распределение вернуть в свободные деньги.
  const saveEnvelope = async (env) => {
    const id = await backend.saveEnvelope(fid, env).catch((e) => showToast(e.message));
    if (plan && id) {
      const full = { ...envById[id], ...env, id };
      const next = applyEnvelopeToPlan(plan, full);
      if (next !== plan && JSON.stringify(next) !== JSON.stringify(plan)) savePlan(next);
    }
    return id;
  };

  const ctx = {
    backend,
    fid,
    user,
    family,
    envelopes,
    envById,
    txs,
    today,
    period,
    prevPeriod,
    since,
    loadEarlier: () => setExtraPeriods((n) => n + 1),
    setTab,
    openTx,
    openEnvelope: setEnvEdit,
    shops,
    shopById,
    openShopId,
    setOpenShopId,
    openPurchase: setPurchaseOpts,
    openShopEdit: setShopEdit,
    saveShop: (shop) => backend.saveShop(fid, shop).catch((e) => showToast(e.message)),
    openSummary: () => setSummaryOpen(true),
    openStats: () => setStatsOpen(true),
    periods,
    summaryPending,
    plan,
    prevPlan,
    openIncome: () => setIncomeOpen(true),
    savePlan,
    saveIncome,
    allocateTo,
    repeatPrevious,
    openAllocate: setAllocEnv,
    addTx,
    updateTx,
    deleteTx,
    saveEnvelope,
    updateFamily: (patch) => backend.updateFamily(fid, patch).catch((e) => showToast(e.message)),
  };

  const Screen = { home: HomeScreen, shops: ShopsScreen, history: HistoryScreen, savings: SavingsScreen, settings: SettingsScreen }[tab];
  const hasSpendable = envelopes.some((e) => !e.archived && e.kind !== 'savings');

  return html`<${AppContext.Provider} value=${ctx}>
    <main class="app">
      <${Screen} />
    </main>

    ${(tab === 'home' || tab === 'history') &&
    hasSpendable &&
    html`<button class="fab" onClick=${() => setTxOpts({})} aria-label="Добавить трату">${Icon.plus}</button>`}
    ${tab === 'shops' &&
    mainDailyEnvelope(envelopes) &&
    html`<button class="fab" onClick=${() => setPurchaseOpts({ shopId: openShopId || 'other' })} aria-label="Добавить покупку">${Icon.plus}</button>`}

    <nav class="tabbar">
      ${TABS.map(
        (t) => html`<button class=${`tabbar__btn ${tab === t.id ? 'tabbar__btn--active' : ''}`} onClick=${() => { setTab(t.id); window.scrollTo(0, 0); }} aria-current=${tab === t.id ? 'page' : undefined}>
          ${t.icon}<span>${t.label}</span>
        </button>`,
      )}
    </nav>

    <${TxSheet} opts=${txOpts} onClose=${() => setTxOpts(null)} />
    <${EnvelopeSheet} env=${envEdit} onClose=${() => setEnvEdit(null)} />
    <${SummarySheet} open=${summaryOpen} onClose=${() => setSummaryOpen(false)} />
    <${StatsSheet} open=${statsOpen} onClose=${() => setStatsOpen(false)} />
    <${IncomeSheet} open=${incomeOpen} onClose=${() => setIncomeOpen(false)} />
    <${AllocateSheet} env=${allocEnv} onClose=${() => setAllocEnv(null)} />
    <${PurchaseSheet} opts=${purchaseOpts} onClose=${() => setPurchaseOpts(null)} />
    <${ShopSheet} shop=${shopEdit} onClose=${() => setShopEdit(null)} />
  <//>`;
}

function App() {
  const [backend, setBackend] = useState(null);
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    createBackend()
      .then((b) => {
        b.setErrorHandler?.((e) => showToast(e.message));
        setBackend(b);
      })
      .catch((e) => {
        console.error(e);
        showToast('Не удалось загрузить приложение. Проверьте интернет.');
      });
  }, []);

  useEffect(() => backend?.onAuth(setUser), [backend]);

  useEffect(() => {
    setProfile(undefined);
    if (!user) return;
    return backend.watchProfile(user.uid, setProfile);
  }, [user?.uid]);

  let content;
  if (!backend || user === undefined) content = html`<${Splash} />`;
  else if (!user) content = html`<${LoginScreen} backend=${backend} />`;
  else if (profile === undefined) content = html`<${Splash} />`;
  else if (!profile?.familyId) content = html`<${Onboarding} backend=${backend} user=${user} />`;
  else content = html`<${Budget} key=${profile.familyId} backend=${backend} user=${user} fid=${profile.familyId} />`;

  return html`${content}<${Toasts} />`;
}

window.__appStarted = true;
render(html`<${App} />`, document.getElementById('root'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));

  // Приложение с экрана «Домой» возвращается из фона без перезагрузки, и браузер сам не проверяет
  // обновления. Проверяем при каждом возврате; новая версия включается перезапуском.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let updateReady = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return; // первая установка — обновлять нечего
    updateReady = true;
    if (document.visibilityState === 'hidden') location.reload();
    else showToast('Вышла новая версия приложения', { label: 'Обновить', run: () => location.reload() });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (updateReady) location.reload();
    else navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  });
}
