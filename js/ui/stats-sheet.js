// Статистика по месяцам: сколько удалось сэкономить за всё время и траты по периодам.
// Траты за всё время загружаются один раз при открытии (в приложении — только два последних периода).
import { html, useState, useEffect, useMemo } from '../lib/preact.js';
import { BottomSheet, useApp, Money } from './common.js';
import { periodsSince, periodStats, statsTotals, shopTotals, shopName } from '../lib/budget.js';
import { formatDay } from '../lib/dates.js';

function PeriodDetails({ s }) {
  const { shopById } = useApp();
  const shops = Object.entries(s.shops).sort((a, b) => b[1].spent - a[1].spent);
  return html`<div class="stats__details">
    <ul class="stats__cats">
      ${s.rows.map(
        (r) => html`<li key=${r.envelope.id}>
          <span class="summary__name"><span>${r.envelope.icon}</span>${r.envelope.name}</span>
          <span>
            <span class=${r.limit !== null && r.spent > r.limit ? 'neg' : ''}><${Money} kop=${r.spent} /></span>${r.limit !== null ? html`<span class="muted"> из <${Money} kop=${r.limit} /></span>` : ''}
          </span>
        </li>`,
      )}
    </ul>
    ${shops.length > 0 &&
    html`<p class="stats__sub muted">По магазинам</p>
      <ul class="stats__cats">
        ${shops.map(
          ([id, t]) => html`<li key=${id}>
            <span class="summary__name"><span>${shopById[id]?.icon || '🏪'}</span>${shopName(shopById[id])}</span>
            <${Money} kop=${t.spent} />
          </li>`,
        )}
      </ul>`}
  </div>`;
}

export function StatsSheet({ open, onClose }) {
  const { backend, fid, envelopes, txs, periods, period, family, today } = useApp();
  const [allTxs, setAllTxs] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openStart, setOpenStart] = useState(null);

  useEffect(() => {
    if (!open) return;
    setAllTxs(null);
    setFailed(false);
    setOpenStart(null);
    backend
      .fetchAllTransactions(fid)
      .then(setAllTxs)
      .catch(() => {
        // Нет связи: считаем по тому, что уже загружено
        setFailed(true);
        setAllTxs(txs);
      });
  }, [open]);

  const stats = useMemo(() => {
    if (!allTxs) return null;
    const dates = [...allTxs.map((t) => t.date), ...Object.keys(periods)];
    const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : period.start;
    return periodsSince(first, period, family.payday || 10).map((p) => ({
      ...periodStats({ envelopes, txs: allTxs, period: p, plan: periods[p.start] || null }),
      shops: shopTotals(allTxs, p.start, p.end),
    }));
  }, [allTxs, envelopes, periods, period]);

  if (!open) return null;
  if (!stats) {
    return html`<${BottomSheet} open=${true} onClose=${onClose} title="Статистика">
      <p class="empty">Считаю…</p>
    <//>`;
  }

  const totals = statsTotals(stats, today);
  const scale = Math.max(1, ...stats.map((s) => Math.max(s.totalSpent, s.totalLimit || 0)));

  return html`<${BottomSheet} open=${true} onClose=${onClose} title="Статистика">
    ${totals.plannedCount > 0
      ? html`<div class=${`summary__hero ${totals.saved > 0 ? 'summary__hero--good' : ''}`}>
          <span>${totals.saved >= 0 ? 'Сэкономлено за всё время' : 'Перерасход за всё время'}</span>
          <${Money} kop=${Math.abs(totals.saved)} big />
          <span class="muted">с ${formatDay(totals.since)} · в среднем тратите <${Money} kop=${totals.avgSpent} /> за месяц</span>
        </div>`
      : html`<div class="summary__hero">
          <span>Первые итоги — ${formatDay(period.end)}</span>
          <span class="muted">Экономия считается за прошедшие месяцы, в которых был введён доход</span>
        </div>`}
    ${failed && html`<p class="notice">Нет связи: показаны только последние два периода.</p>`}

    <ul class="stats__list">
      ${stats.map((s) => {
        const current = s.period.start === period.start;
        const isOpen = openStart === s.period.start;
        const over = s.left !== null && s.left < 0;
        return html`<li key=${s.period.start}>
          <button class="stats__row" onClick=${() => setOpenStart(isOpen ? null : s.period.start)} aria-expanded=${isOpen}>
            <span class="stats__top">
              <span class="stats__name">${formatDay(s.period.start, { short: true })} — ${formatDay(s.period.end, { short: true })}</span>
              <span class="stats__spent"><${Money} kop=${s.totalSpent} /></span>
              <span class=${`stats__val ${current || s.left === null ? 'muted' : over ? 'neg' : 'pos'}`}>
                ${current ? 'идёт' : s.left === null ? 'без дохода' : html`${over ? '−' : '+'}<${Money} kop=${Math.abs(s.left)} />`}
              </span>
            </span>
            <span class="summary__bars">
              ${s.totalLimit !== null && html`<span class="summary__bar summary__bar--limit" style=${{ width: `${(Math.max(0, s.totalLimit) / scale) * 100}%` }}></span>`}
              <span class=${`summary__bar ${over ? 'summary__bar--over' : 'stats__bar'}`} style=${{ width: `${(s.totalSpent / scale) * 100}%` }}></span>
            </span>
          </button>
          ${isOpen && (s.rows.length ? html`<${PeriodDetails} s=${s} />` : html`<p class="stats__sub muted">Трат не было</p>`)}
        </li>`;
      })}
    </ul>
    <p class="field__hint">Полоса — потрачено, пунктир — сколько было запланировано. «+» — осталось от плана, «−» — перерасход. Нажмите на месяц, чтобы увидеть категории и магазины.</p>
  <//>`;
}
