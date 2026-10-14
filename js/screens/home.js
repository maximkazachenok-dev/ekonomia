import { html } from '../lib/preact.js';
import { useApp, Money, ProgressBar, Icon } from '../ui/common.js';
import { dailyAllowance, envelopeProgress, savingsProgress } from '../lib/budget.js';
import { formatDay, pluralDays } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { TxRow } from './history.js';

function DailyCard({ env, hero }) {
  const { txs, today, period, family, openTx } = useApp();
  const d = dailyAllowance({ limit: env.limit, txs, envelopeId: env.id, today, period });
  const usedPct = d.todayLimit > 0 ? (d.spentToday / d.todayLimit) * 100 : 100;
  const pace = d.todayLimit - d.evenDaily;
  const cur = family.currency;

  let headline;
  if (d.remainingTotal <= 0 && d.spentToday === 0) headline = 'Бюджет до зарплаты исчерпан';
  else if (d.leftToday < 0) headline = `Перерасход за сегодня`;
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
        <dd><${Money} kop=${d.remainingTotal} /> <span class="muted">из ${formatMoney(env.limit, cur)}</span></dd>
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

function PeriodEnvelopes({ envelopes }) {
  const { txs, period, openTx } = useApp();
  if (!envelopes.length) return null;
  return html`<section class="card">
    <h2 class="card__title">Конверты до зарплаты</h2>
    <ul class="env-list">
      ${envelopes.map((e) => {
        const p = envelopeProgress({ limit: e.limit, txs, envelopeId: e.id, period });
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
              <span class="env-row__sub muted">потрачено <${Money} kop=${p.spent} /> из <${Money} kop=${e.limit} /></span>
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
