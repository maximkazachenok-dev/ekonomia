// Шторка «Доход на период»: в день зарплаты вносится общая сумма дохода.
// Сначала она вся свободна; распределение по категориям — отдельно, на главном экране.
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, Money } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';
import { planPeriod, mainDailyEnvelope, dailyAllowance } from '../lib/budget.js';
import { formatDay, pluralDays } from '../lib/dates.js';

export function IncomeSheet({ open, onClose }) {
  const { envelopes, plan, prevPlan, period, family, today, txs, saveIncome } = useApp();
  const main = mainDailyEnvelope(envelopes);
  const [income, setIncome] = useState('');

  useEffect(() => {
    if (open) setIncome(plan ? toInputString(plan.income) : '');
  }, [open]);

  if (!open) return null;

  const cur = currencySymbol(family.currency);
  const kop = parseAmount(income || '0');
  const valid = !Number.isNaN(kop) && kop > 0;
  // Если доход исправляют посреди периода, уже распределённое остаётся распределённым
  const allocated = plan ? Object.values(plan.mandatory).reduce((s, v) => s + v, 0) : 0;
  const totals = valid ? planPeriod({ income: kop, mandatory: plan?.mandatory || {}, days: period.days }) : null;
  const midPeriod = today !== period.start;
  const todayLimit = totals && main && midPeriod ? dailyAllowance({ limit: totals.free, txs, envelopeId: main.id, today, period }).todayLimit : null;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    saveIncome(kop);
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${plan ? 'Изменить доход' : 'Доход на период'}>
    <form class="form" onSubmit=${submit}>
      <p class="muted">${formatDay(period.start)} — ${formatDay(period.end)}</p>

      <label class="field">
        <span class="field__label">Сколько денег пришло (общий доход семьи)</span>
        <div class="input-money input-money--big">
          <input class="input" inputmode="decimal" value=${income} onInput=${(e) => setIncome(e.target.value)} placeholder="0" autofocus />
          <span>${cur}</span>
        </div>
        ${!plan && prevPlan?.income > 0 &&
        html`<button type="button" class="link-btn" onClick=${() => setIncome(toInputString(prevPlan.income))}>
          Как в прошлом месяце: ${formatMoney(prevPlan.income, family.currency)}
        </button>`}
      </label>

      ${totals &&
      html`<div class=${`plan-result ${totals.free < 0 ? 'plan-result--bad' : ''}`}>
        ${allocated > 0 &&
        html`<div class="plan-result__row"><span>Уже распределено</span><span>−<${Money} kop=${allocated} /></span></div>`}
        <div class="plan-result__row plan-result__row--total"><span>Свободно до ${formatDay(period.end, { short: true })}</span><${Money} kop=${totals.free} /></div>
        ${totals.free >= 0 &&
        html`<p class="plan-result__note">
          ≈ <strong>${formatMoney(totals.perDay, family.currency)}</strong> в день в среднем на ${pluralDays(period.days)}
          ${todayLimit !== null && html`<br />С учётом уже потраченного сегодня можно ≈ <strong>${formatMoney(Math.max(0, todayLimit), family.currency)}</strong>`}
        </p>`}
      </div>`}

      ${!plan && html`<p class="field__hint">Дальше распределите деньги по категориям на главном экране — свободная сумма и дневной лимит будут уменьшаться.</p>`}

      <button type="submit" class="btn btn--primary btn--block btn--lg" disabled=${!valid}>Сохранить</button>
    </form>
  <//>`;
}
