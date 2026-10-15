// Итоги закрытого периода и перевод сэкономленного в копилку.
import { html, useState } from '../lib/preact.js';
import { BottomSheet, useApp, Money, showToast } from './common.js';
import { periodSummary } from '../lib/budget.js';
import { formatDay } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';

export function SummarySheet({ open, onClose }) {
  const app = useApp();
  const { envelopes, txs, prevPeriod, family, user, today, prevPlan } = app;
  const savings = envelopes.filter((e) => e.kind === 'savings' && !e.archived);
  const [target, setTarget] = useState(savings[0]?.id || '');
  if (!open) return null;

  const s = periodSummary({ envelopes, txs, period: prevPeriod, plan: prevPlan });
  const markDone = () => app.updateFamily({ [`summaryDone.${prevPeriod.start}`]: true });
  const maxSpent = Math.max(1, ...s.rows.map((r) => Math.max(r.limit, r.spent)));

  const transfer = () => {
    const env = envelopes.find((e) => e.id === target);
    app.addTx({
      amount: s.totalSaved,
      envelopeId: target,
      type: 'deposit',
      note: `Экономия за ${formatDay(prevPeriod.start, { short: true })} — ${formatDay(prevPeriod.end, { short: true })}`,
      date: today,
      createdBy: { uid: user.uid, name: user.name },
      createdAt: Date.now(),
    }, { silent: true });
    markDone();
    showToast(`Отложено ${formatMoney(s.totalSaved, family.currency)} в «${env.name}» 🎉`);
    onClose();
  };

  const close = () => {
    markDone();
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title="Итоги периода">
    <p class="muted summary__dates">${formatDay(prevPeriod.start)} — ${formatDay(prevPeriod.end)}</p>
    <div class=${`summary__hero ${s.totalSaved > 0 ? 'summary__hero--good' : ''}`}>
      ${s.totalSaved > 0
        ? html`<span>Сэкономлено</span><${Money} kop=${s.totalSaved} big />`
        : html`<span>Потрачено всё запланированное</span><${Money} kop=${s.totalSpent} big />`}
      <span class="muted">потрачено <${Money} kop=${s.totalSpent} /> из <${Money} kop=${s.totalLimit} /></span>
    </div>

    <ul class="summary__rows">
      ${s.rows.map(
        (r) => html`<li>
          <span class="summary__name"><span>${r.envelope.icon}</span>${r.envelope.name}</span>
          <span class="summary__bars">
            <span class="summary__bar summary__bar--limit" style=${{ width: `${(r.limit / maxSpent) * 100}%` }}></span>
            <span class=${`summary__bar ${r.saved < 0 ? 'summary__bar--over' : ''}`} style=${{ width: `${(r.spent / maxSpent) * 100}%`, background: r.saved < 0 ? undefined : r.envelope.color }}></span>
          </span>
          <span class=${`summary__val ${r.saved >= 0 ? 'pos' : 'neg'}`}>
            ${r.saved >= 0 ? '+' : '−'}<${Money} kop=${Math.abs(r.saved)} />
          </span>
        </li>`,
      )}
    </ul>

    ${s.totalSaved > 0 && savings.length > 0
      ? html`<div class="summary__transfer">
          <label class="field">
            <span class="field__label">Отложить сэкономленное в копилку</span>
            <select class="input input--select" value=${target} onChange=${(e) => setTarget(e.target.value)}>
              ${savings.map((e) => html`<option value=${e.id}>${e.icon} ${e.name}</option>`)}
            </select>
          </label>
          <button class="btn btn--primary btn--block" onClick=${transfer}>Отложить ${formatMoney(s.totalSaved, family.currency)}</button>
          <button class="btn btn--ghost btn--block" onClick=${close}>Не сейчас</button>
        </div>`
      : html`<button class="btn btn--primary btn--block" onClick=${close}>Понятно</button>`}
  <//>`;
}
