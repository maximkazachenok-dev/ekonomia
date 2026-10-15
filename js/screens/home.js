import { html } from '../lib/preact.js';
import { useApp, Money, ProgressBar, Icon } from '../ui/common.js';
import { dailyAllowance, envelopeProgress, savingsProgress, envelopeLimit } from '../lib/budget.js';
import { formatDay, pluralDays } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { TxRow } from './history.js';

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

// Строка распределения: доход − обязательные = свободно. Без дохода — приглашение его ввести.
function PlanLine() {
  const { plan, openIncome, period } = useApp();
  if (!plan) {
    return html`<button class="banner" onClick=${openIncome}>
      <span class="banner__icon">${Icon.plus}</span>
      <span><strong>Новый период: введите доход</strong><br /><span class="muted">Приложение вычтет обязательные статьи и разделит остаток по дням до ${formatDay(period.end)}</span></span>
      <span class="banner__chev">${Icon.chevron}</span>
    </button>`;
  }
  const mandatoryTotal = Object.values(plan.mandatory).reduce((s, v) => s + v, 0);
  return html`<section class="card">
    <div class="card__title-row">
      <h2 class="card__title">Распределение дохода</h2>
      <button class="link-btn" onClick=${openIncome}>Изменить</button>
    </div>
    <div class="plan-line">
      <span><${Money} kop=${plan.income} /> доход</span>
      <span class="muted">−</span>
      <span><${Money} kop=${mandatoryTotal} /> обязательные</span>
      <span class="muted">=</span>
      <span class=${plan.free < 0 ? 'neg' : 'pos'}><${Money} kop=${plan.free} /> свободно</span>
    </div>
  </section>`;
}

function PeriodEnvelopes({ envelopes }) {
  const { txs, period, openTx, plan } = useApp();
  if (!envelopes.length) return null;
  return html`<section class="card">
    <h2 class="card__title">Обязательные статьи</h2>
    <ul class="env-list">
      ${envelopes.map((e) => {
        const limit = envelopeLimit(e, plan);
        const p = envelopeProgress({ limit, txs, envelopeId: e.id, period });
        return html`<li>
          <button class="env-row" onClick=${() => openTx({ envelopeId: e.id })} aria-label=${`Добавить трату в «${e.name}»`}>
            <span class="env-row__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
            <span class="env-row__main">
              <span class="env-row__top">
                <span class="env-row__name">${e.name}</span>
                <span class=${`env-row__left env-row__left--${p.status}`}>
                  ${p.left < 0 ? html`перерасход <${Money} kop=${-p.left} />` : html`<${Money} kop=${p.left} />`}
                </span>
              </span>
              <${ProgressBar} percent=${p.percent} status=${p.status} thin />
              <span class="env-row__sub muted">потрачено <${Money} kop=${p.spent} /> из <${Money} kop=${limit} /></span>
            </span>
          </button>
        </li>`;
      })}
    </ul>
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

export function HomeScreen() {
  const { envelopes, txs, period, family, summaryPending, openSummary, setTab, envById } = useApp();
  const active = envelopes.filter((e) => !e.archived);
  const daily = active.filter((e) => e.kind === 'daily');
  const periodEnvs = active.filter((e) => e.kind === 'period');
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
    <${PlanLine} />
    <${PeriodEnvelopes} envelopes=${periodEnvs} />
    <${SavingsCard} envelopes=${savings} />

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
