// Первый запуск: создать семейный бюджет (3 шага) или вступить по коду.
// Шаги: день зарплаты → категории расходов → доход. Доход делится по дням; распределение — на главном экране.
import { html, useState } from '../lib/preact.js';
import { ENVELOPE_COLORS } from '../ui/common.js';
import { parseAmount, currencySymbol, formatMoney, CURRENCIES } from '../lib/money.js';
import { getPeriod, planPeriod } from '../lib/budget.js';
import { todayISO, formatDay, pluralDays, daysBetween } from '../lib/dates.js';

const TEMPLATES = [
  { key: 'savings', name: 'Накопление', icon: '🐷', kind: 'savings', on: true },
  { key: 'car', name: 'Обслуживание авто', icon: '🔧', kind: 'period', on: true },
  { key: 'beauty', name: 'Бьюти', icon: '💅', kind: 'period', on: true },
  { key: 'flat', name: 'Квартира', icon: '🏠', kind: 'period', on: true },
  { key: 'fuel', name: 'АЗС', icon: '⛽', kind: 'period', on: false },
  { key: 'haircut', name: 'Стрижка', icon: '💇', kind: 'period', on: false },
  { key: 'rest', name: 'Отдых', icon: '✈️', kind: 'period', on: false },
  { key: 'pharmacy', name: 'Аптека', icon: '💊', kind: 'period', on: false },
]

export function Onboarding({ backend, user }) {
  const [mode, setMode] = useState(backend.mode === 'cloud' ? 'choose' : 'create');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [payday, setPayday] = useState(10);
  const [currency, setCurrency] = useState('BYN');
  const [items, setItems] = useState(TEMPLATES);
  const [income, setIncome] = useState('');
  const [spent, setSpent] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const today = todayISO();
  const period = getPeriod(today, payday);
  const midPeriod = today !== period.start;
  const daysLeft = daysBetween(today, period.end);
  const cur = currencySymbol(currency);

  const chosen = items.filter((t) => t.on);
  const incomeKop = parseAmount(income || '0');
  const spentKop = parseAmount(spent || '0');
  // Сразу после ввода дохода ничего не распределено: весь доход свободен
  const totals = planPeriod({ income: incomeKop || 0, mandatory: {}, days: period.days });
  const perDayLeft = Math.floor(Math.max(0, totals.free - (spentKop || 0)) / daysLeft);

  const finish = async () => {
    setBusy(true);
    setError('');
    // Главный конверт: свободные деньги на каждый день (магазины, бытовая химия, мелочи)
    const envelopes = [{ name: 'Покупки', icon: '🛒', color: ENVELOPE_COLORS[0], kind: 'daily', limit: Math.max(0, totals.free) }];
    // Начали вести учёт посреди периода: уже потраченное записываем первой строкой, иначе лимит завышен
    if (midPeriod && spentKop > 0) envelopes[0].initialSpent = { amount: spentKop, date: period.start };
    chosen.forEach((t, i) => {
      envelopes.push({
        name: t.name,
        icon: t.icon,
        color: ENVELOPE_COLORS[(i + 1) % ENVELOPE_COLORS.length],
        kind: t.kind,
        ...(t.kind === 'savings' ? { goal: 0 } : { limit: 0 }),
      });
    });
    try {
      await backend.createFamily(user, { name: 'Наш бюджет', currency, payday, envelopes, income: incomeKop, periodStart: period.start });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await backend.joinFamily(user, code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (mode === 'choose') {
    return html`<div class="onb">
      <div class="onb__logo">💰</div>
      <h1 class="onb__title">Привет, ${user.name}!</h1>
      <p class="onb__text">Вы первый в семье или вас пригласили?</p>
      <button class="btn btn--primary btn--block btn--lg" onClick=${() => setMode('create')}>Создать семейный бюджет</button>
      <button class="btn btn--ghost btn--block btn--lg" onClick=${() => setMode('join')}>У меня есть код приглашения</button>
      <button class="link-btn onb__logout" onClick=${() => backend.signOut()}>Выйти</button>
    </div>`;
  }

  if (mode === 'join') {
    return html`<form class="onb" onSubmit=${join}>
      <h1 class="onb__title">Код приглашения</h1>
      <p class="onb__text">Попросите код у того, кто создал бюджет: он в Настройках → Семья.</p>
      <input class="input input--code" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" />
      ${error && html`<p class="form-error">${error}</p>`}
      <button class="btn btn--primary btn--block btn--lg" disabled=${code.trim().length !== 6 || busy}>${busy ? 'Проверяем…' : 'Присоединиться'}</button>
      <button type="button" class="link-btn" onClick=${() => setMode('choose')}>Назад</button>
    </form>`;
  }

  return html`<div class="onb">
    <div class="onb__steps">${[1, 2, 3].map((s) => html`<span class=${`onb__dot ${s <= step ? 'onb__dot--on' : ''}`}></span>`)}</div>

    ${step === 1 &&
    html`<h1 class="onb__title">Когда приходит зарплата?</h1>
      <p class="onb__text">В этот день вы вносите доход, и бюджет считается до следующей зарплаты.</p>
      <div class="day-grid" role="radiogroup">
        ${Array.from({ length: 31 }, (_, i) => i + 1).map(
          (d) => html`<button type="button" role="radio" aria-checked=${payday === d} class=${`day-grid__d ${payday === d ? 'day-grid__d--on' : ''}`} onClick=${() => setPayday(d)}>${d}</button>`,
        )}
      </div>
      <p class="onb__hint">Текущий период: ${formatDay(period.start)} — ${formatDay(period.end)}</p>
      <label class="field field--row">
        <span class="field__label">Валюта</span>
        <select class="input input--select" value=${currency} onChange=${(e) => setCurrency(e.target.value)}>
          ${Object.keys(CURRENCIES).map((c) => html`<option value=${c}>${c} (${CURRENCIES[c].symbol})</option>`)}
        </select>
      </label>
      <button class="btn btn--primary btn--block btn--lg" onClick=${() => setStep(2)}>Дальше</button>
      ${backend.mode === 'cloud' && html`<button class="link-btn" onClick=${() => setMode('choose')}>Назад</button>`}`}

    ${step === 2 &&
    html`<h1 class="onb__title">Категории расходов</h1>
      <p class="onb__text">Отметьте, на что вы распределяете деньги после зарплаты. Суммы вы укажете потом на главном экране — каждый месяц заново или как в прошлом месяце.</p>
      <ul class="tpl-list">
        ${items.map(
          (t, i) => html`<li class=${`tpl ${t.on ? 'tpl--on' : ''}`}>
            <label class="tpl__check">
              <input type="checkbox" checked=${t.on} onChange=${(e) => setItems(items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <span class="tpl__icon">${t.icon}</span>
              <span>${t.name}${t.kind === 'savings' ? html`<small class="muted"> копилка</small>` : ''}</span>
            </label>
          </li>`,
        )}
      </ul>
      <p class="onb__hint">Свои категории можно добавить потом.</p>
      <button class="btn btn--primary btn--block btn--lg" onClick=${() => setStep(3)}>Дальше</button>
      <button class="link-btn" onClick=${() => setStep(1)}>Назад</button>`}

    ${step === 3 &&
    html`<h1 class="onb__title">Сколько денег пришло ${formatDay(period.start)}?</h1>
      <p class="onb__text">Общий доход семьи на период до ${formatDay(period.end)}.</p>
      <div class="input-money input-money--big">
        <input class="input" inputmode="decimal" value=${income} onInput=${(e) => setIncome(e.target.value)} placeholder="0" autofocus />
        <span>${cur}</span>
      </div>
      ${incomeKop > 0 &&
      html`<div class=${`plan-result ${totals.free < 0 ? 'plan-result--bad' : ''}`}>
        <div class="plan-result__row plan-result__row--total"><span>Свободно до ${formatDay(period.end)}</span><span>${formatMoney(totals.free, currency)}</span></div>
        ${!midPeriod && html`<p class="plan-result__note">≈ <strong>${formatMoney(totals.perDay, currency)}</strong> в день на ${pluralDays(period.days)}. После распределения по категориям сумма уменьшится.</p>`}
      </div>`}
      ${midPeriod &&
      incomeKop > 0 &&
      html`<label class="field">
          <span class="field__label">Сколько из свободных денег уже потрачено с ${formatDay(period.start)}?</span>
          <div class="input-money">
            <input class="input" inputmode="decimal" value=${spent} onInput=${(e) => setSpent(e.target.value)} placeholder="0" />
            <span>${cur}</span>
          </div>
        </label>
        <p class="onb__result">≈ <strong>${formatMoney(perDayLeft, currency)}</strong> в день на оставшиеся ${pluralDays(daysLeft)}</p>`}
      ${error && html`<p class="form-error">${error}</p>`}
      <button class="btn btn--primary btn--block btn--lg" disabled=${busy || !(incomeKop > 0) || Number.isNaN(spentKop)} onClick=${finish}>
        ${busy ? 'Создаём…' : 'Готово'}
      </button>
      <button class="link-btn" onClick=${() => setStep(2)}>Назад</button>`}
  </div>`;
}
