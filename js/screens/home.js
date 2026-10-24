import { html } from '../lib/preact.js';
import { useApp, Money, ProgressBar, Icon } from '../ui/common.js';
import { dailyAllowance, envelopeProgress, savingsProgress, envelopeLimit, mandatoryEnvelopes, allocationsFromPrevious, periodStats } from '../lib/budget.js';
import { formatDay, pluralDays } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { TxRow } from './history.js';
import { VoiceCard } from '../ui/voice-card.js';

function DailyCard({ env, hero }) {
  const { txs, today, period, family, openTx, plan } = useApp();
  const limit = envelopeLimit(env, plan);
  const d = dailyAllowance({ limit, txs, envelopeId: env.id, today, period });
  const usedPct = d.todayLimit > 0 ? (d.spentToday / d.todayLimit) * 100 : 100;
  const pace = d.todayLimit - d.evenDaily;
  const cur = family.currency;
  // Главный конверт тратит свободные деньги («сколько можно потратить сегодня»), остальные — свои суммы
  const isMain = plan && env.id === plan.mainEnvelopeId;

  let headline;
  if (d.remainingTotal <= 0 && d.spentToday === 0) headline = 'Бюджет до зарплаты исчерпан';
  else if (d.leftToday < 0) headline = `Перерасход за сегодня`;
  else if (isMain) headline = d.spentToday === 0 ? 'Сегодня можно потратить' : 'Сегодня осталось';
  else if (d.spentToday === 0) headline = `Сегодня на «${env.name}» можно`;
  else headline = `Сегодня на «${env.name}» осталось`;

  return html`<section class=${`card daily daily--${d.status} ${hero ? 'daily--hero' : ''}`} style=${{ '--env': env.color }}>
    <button class="daily__tap" onClick=${() => openTx({ envelopeId: env.id })} aria-label=${`Добавить трату в «${env.name}»`}>
      <div class="daily__label"><span class="daily__icon">${env.icon}</span>${headline}</div>
      <div class="daily__amount"><${Money} kop=${d.leftToday < 0 ? d.leftToday : Math.max(0, d.leftToday)} big /></div>
      <div class="daily__sub">
        ${d.spentToday > 0
          ? html`потрачено <${Money} kop=${d.spentToday} /> из <${Money} kop=${Math.max(0, d.todayLimit)} /> на сегодня`
          : html`это лимит на сегодня`}
      </div>
      <${ProgressBar} percent=${usedPct} status=${d.status} />
    </button>
    <dl class="daily__stats">
      <div>
        <dt>Осталось до ${formatDay(period.end, { short: true })}</dt>
        <dd><${Money} kop=${d.remainingTotal} /> <span class="muted">из ${formatMoney(limit, cur)}</span></dd>
      </div>
      <div>
        <dt>${d.daysLeft === 1 ? 'Последний день' : pluralDays(d.daysLeft)}</dt>
        <dd>
          ${d.tomorrow !== null
            ? html`завтра ≈ <${Money} kop=${Math.max(0, d.tomorrow)} />`
            : html`завтра зарплата 🎉`}
        </dd>
      </div>
    </dl>
    ${hero &&
    d.evenDaily > 0 &&
    html`<p class=${`daily__pace ${pace >= 0 ? 'daily__pace--good' : 'daily__pace--bad'}`}>
      ${pace >= 0
        ? html`Идёте с запасом: на ${formatMoney(pace, cur)} в день больше плана (${formatMoney(d.evenDaily, cur)})`
        : html`Нужно притормозить: на ${formatMoney(-pace, cur)} в день меньше плана (${formatMoney(d.evenDaily, cur)})`}
    </p>`}
  </section>`;
}

// Распределение дохода: доход − распределено = свободно, и категории с суммами.
// Тап по категории — распределить или поправить сумму. Без дохода — приглашение его ввести.
function AllocationCard() {
  const { plan, prevPlan, envelopes, txs, period, family, openIncome, openAllocate, openEnvelope, repeatPrevious } = useApp();
  if (!plan) {
    return html`<button class="banner" onClick=${openIncome}>
      <span class="banner__icon">${Icon.plus}</span>
      <span><strong>Новый период: введите доход</strong><br /><span class="muted">Сумма разделится по дням до ${formatDay(period.end)}, затем распределите её по категориям</span></span>
      <span class="banner__chev">${Icon.chevron}</span>
    </button>`;
  }
  const cats = mandatoryEnvelopes(envelopes);
  const allocated = Object.values(plan.mandatory).reduce((s, v) => s + v, 0);
  const repeat = allocationsFromPrevious(plan, prevPlan, envelopes);
  const cur = family.currency;

  return html`<section class="card">
    <div class="card__title-row">
      <h2 class="card__title">Распределение дохода</h2>
      <button class="link-btn" onClick=${openIncome}>Доход: ${formatMoney(plan.income, cur)}</button>
    </div>
    <div class="plan-line">
      <span><${Money} kop=${plan.income} /> доход</span>
      <span class="muted">−</span>
      <span><${Money} kop=${allocated} /> распределено</span>
      <span class="muted">=</span>
      <span class=${plan.free < 0 ? 'neg' : 'pos'}><${Money} kop=${plan.free} /> свободно</span>
    </div>

    <ul class="env-list">
      ${cats.map((e) => {
        const amount = plan.mandatory[e.id] || 0;
        const p = e.kind !== 'savings' && amount > 0 ? envelopeProgress({ limit: amount, txs, envelopeId: e.id, period }) : null;
        return html`<li key=${e.id}>
          <button class="env-row" onClick=${() => openAllocate(e)} aria-label=${`Распределить на «${e.name}»`}>
            <span class="env-row__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
            <span class="env-row__main">
              <span class="env-row__top">
                <span class="env-row__name">${e.name}</span>
                ${amount > 0
                  ? html`<span class=${`env-row__left ${p ? `env-row__left--${p.status}` : ''}`}><${Money} kop=${amount} /></span>`
                  : html`<span class="alloc-cta">Распределить</span>`}
              </span>
              ${p && html`<${ProgressBar} percent=${p.percent} status=${p.status} thin />
                <span class="env-row__sub muted">${p.left < 0 ? html`перерасход <${Money} kop=${-p.left} />` : html`потрачено <${Money} kop=${p.spent} />, осталось <${Money} kop=${p.left} />`}</span>`}
              ${e.kind === 'savings' && amount > 0 && html`<span class="env-row__sub muted">отложено в копилку</span>`}
            </span>
          </button>
        </li>`;
      })}
    </ul>

    ${repeat.length > 0 &&
    html`<button class="btn btn--ghost btn--block" onClick=${repeatPrevious}>
      Как в прошлом месяце: ${formatMoney(repeat.reduce((s, a) => s + a.amount, 0), cur)}
    </button>`}
    <button class="link-btn" onClick=${() => openEnvelope({ kind: 'period' })}>+ Новая категория</button>
  </section>`;
}

function SavingsCard({ envelopes }) {
  const { setTab } = useApp();
  if (!envelopes.length) return null;
  return html`<section class="card">
    <h2 class="card__title">Копилки</h2>
    <ul class="env-list">
      ${envelopes.map((e) => {
        const s = savingsProgress(e);
        return html`<li>
          <button class="env-row" onClick=${() => setTab('savings')}>
            <span class="env-row__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
            <span class="env-row__main">
              <span class="env-row__top">
                <span class="env-row__name">${e.name}</span>
                <span class="env-row__left"><${Money} kop=${s.balance} /></span>
              </span>
              ${s.goal > 0 &&
              html`<${ProgressBar} percent=${s.percent} status="save" thin />
                <span class="env-row__sub muted">${s.percent}% от цели <${Money} kop=${s.goal} /></span>`}
            </span>
          </button>
        </li>`;
      })}
    </ul>
  </section>`;
}

// Вход в статистику; подпись — итог прошлого месяца, если в нём был введён доход.
function StatsBanner() {
  const { envelopes, txs, prevPeriod, prevPlan, openStats } = useApp();
  const prev = prevPlan ? periodStats({ envelopes, txs, period: prevPeriod, plan: prevPlan }) : null;
  return html`<button class="banner" onClick=${openStats}>
    <span class="banner__icon">${Icon.chart}</span>
    <span><strong>Статистика по месяцам</strong><br /><span class="muted">
      ${prev && prev.totalSpent > 0
        ? prev.left >= 0
          ? html`В прошлом месяце сэкономлено <${Money} kop=${prev.left} />`
          : html`В прошлом месяце перерасход <${Money} kop=${-prev.left} />`
        : 'Сколько тратите и сколько удаётся сэкономить'}
    </span></span>
    <span class="banner__chev">${Icon.chevron}</span>
  </button>`;
}

export function HomeScreen() {
  const { envelopes, txs, period, family, summaryPending, openSummary, setTab, envById, plan } = useApp();
  const active = envelopes.filter((e) => !e.archived);
  const daily = active.filter((e) => e.kind === 'daily');
  // Пока доход не введён или ещё ничего не распределено — блок распределения выше голосового ввода
  const allocFirst = !plan || Object.keys(plan.mandatory).length === 0;
  const savings = active.filter((e) => e.kind === 'savings');
  const recent = txs.filter((t) => envById[t.envelopeId]).slice(0, 5);

  return html`<div class="screen">
    <header class="screen__head">
      <div>
        <p class="eyebrow">${family.name}</p>
        <h1 class="screen__title">${formatDay(period.start, { short: true })} — ${formatDay(period.end, { short: true })}</h1>
      </div>
    </header>

    ${summaryPending &&
    html`<button class="banner" onClick=${openSummary}>
      <span class="banner__icon">${Icon.trophy}</span>
      <span><strong>Итоги прошлого периода готовы</strong><br /><span class="muted">Посмотрите, сколько удалось сэкономить</span></span>
      <span class="banner__chev">${Icon.chevron}</span>
    </button>`}

    ${daily.map((e, i) => html`<${DailyCard} key=${e.id} env=${e} hero=${i === 0} />`)}
    ${allocFirst && html`<${AllocationCard} />`}
    ${daily.length > 0 && html`<${VoiceCard} />`}
    ${!allocFirst && html`<${AllocationCard} />`}
    <${SavingsCard} envelopes=${savings} />
    <${StatsBanner} />

    ${recent.length > 0 &&
    html`<section class="card">
      <div class="card__title-row">
        <h2 class="card__title">Последние записи</h2>
        <button class="link-btn" onClick=${() => setTab('history')}>Все</button>
      </div>
      <ul class="tx-list">${recent.map((t) => html`<${TxRow} key=${t.id} tx=${t} showDate />`)}</ul>
    </section>`}
  </div>`;
}
