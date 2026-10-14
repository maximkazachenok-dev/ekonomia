import { html, render, useState, useEffect, useMemo, useCallback } from './lib/preact.js';
import { AppContext, Toasts, showToast, Icon } from './ui/common.js';
import { TxSheet } from './ui/tx-sheet.js';
import { EnvelopeSheet } from './ui/envelope-sheet.js';
import { SummarySheet } from './ui/summary-sheet.js';
import { HomeScreen } from './screens/home.js';
import { HistoryScreen } from './screens/history.js';
import { SavingsScreen } from './screens/savings.js';
import { SettingsScreen } from './screens/settings.js';
import { Onboarding } from './screens/onboarding.js';
import { LoginScreen } from './screens/login.js';
import { createBackend, balanceChangesFor } from './data/store.js';
import { getPeriod, previousPeriod, periodSummary } from './lib/budget.js';
import { todayISO } from './lib/dates.js';
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
  const [extraPeriods, setExtraPeriods] = useState(0);

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

  const envById = useMemo(() => Object.fromEntries((envelopes || []).map((e) => [e.id, e])), [envelopes]);

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
      p.then((id) =>
        showToast(`${formatMoney(tx.amount, family.currency)} · ${env.icon} ${env.name}`, {
          label: 'Отменить',
          run: () => backend.deleteTransaction(fid, id, balanceChangesFor(envById, tx, null)),
        }),
      ).catch((e) => showToast(e.message));
    },
    [fid, envById, family],
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

  if (!family || !envelopes || !txs) return html`<${Splash} />`;

  // Итоги прошлого периода показываем, если в нём были траты и итоги ещё не закрыты.
  const prevSummary = periodSummary({ envelopes, txs, period: prevPeriod });
  const summaryPending = !family.summaryDone?.[prevPeriod.start] && prevSummary.totalSpent > 0;

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
    openTx: setTxOpts,
    openEnvelope: setEnvEdit,
    openSummary: () => setSummaryOpen(true),
    summaryPending,
    addTx,
    updateTx,
    deleteTx,
    saveEnvelope: (env) => backend.saveEnvelope(fid, env).catch((e) => showToast(e.message)),
    updateFamily: (patch) => backend.updateFamily(fid, patch).catch((e) => showToast(e.message)),
  };

  const Screen = { home: HomeScreen, history: HistoryScreen, savings: SavingsScreen, settings: SettingsScreen }[tab];
  const hasSpendable = envelopes.some((e) => !e.archived && e.kind !== 'savings');

  return html`<${AppContext.Provider} value=${ctx}>
    <main class="app">
      <${Screen} />
    </main>

    ${(tab === 'home' || tab === 'history') &&
    hasSpendable &&
    html`<button class="fab" onClick=${() => setTxOpts({})} aria-label="Добавить трату">${Icon.plus}</button>`}

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
}
