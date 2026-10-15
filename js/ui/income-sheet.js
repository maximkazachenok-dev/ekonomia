// Шторка «Доход на период»: доход минус обязательные статьи = свободные деньги, которые делятся по дням.
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, Money } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';
import { buildPlan, planPeriod, mandatoryEnvelopes, mandatoryAmount, mainDailyEnvelope, dailyAllowance } from '../lib/budget.js';
import { formatDay, pluralDays } from '../lib/dates.js';

export function IncomeSheet({ open, onClose }) {
  const { envelopes, plan, prevPlan, period, family, today, txs, savePlan } = useApp();
  const items = mandatoryEnvelopes(envelopes);
  const main = mainDailyEnvelope(envelopes);
  const [income, setIncome] = useState('');
  const [amounts, setAmounts] = useState({});

  useEffect(() => {
    if (!open) return;
    setIncome(toInputString(plan?.income ?? prevPlan?.income ?? 0));
    setAmounts(Object.fromEntries(items.map((e) => [e.id, toInputString(plan?.mandatory?.[e.id] ?? mandatoryAmount(e))])));
  }, [open]);

  if (!open) return null;

  const cur = currencySymbol(family.currency);
  const incomeKop = parseAmount(income || '0');
  const amountsKop = Object.fromEntries(items.map((e) => [e.id, parseAmount(amounts[e.id] || '0')]));
  const invalid = Number.isNaN(incomeKop) || Object.values(amountsKop).some(Number.isNaN);
  const next = invalid ? null : buildPlan({ income: incomeKop, envelopes, amounts: amountsKop });
  const totals = next && planPeriod({ income: next.income, mandatory: next.mandatory, days: period.days });
  const midPeriod = today !== period.start;
  const todayLimit =
    next && main && midPeriod ? dailyAllowance({ limit: next.free, txs, envelopeId: main.id, today, period }).todayLimit : null;

  const submit = (e) => {
    e.preventDefault();
    if (!next || incomeKop <= 0) return;
    // Новые суммы статей запоминаем: в следующем месяце они подставятся сами
    const updates = items
      .filter((env) => amountsKop[env.id] !== mandatoryAmount(env))
      .map((env) => (env.kind === 'savings' ? { id: env.id, monthly: amountsKop[env.id] } : { id: env.id, limit: amountsKop[env.id] }));
    if (main) updates.push({ id: main.id, limit: next.free });
    savePlan(next, updates);
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title="Доход на период">
    <form class="form" onSubmit=${submit}>
      <p class="muted">${formatDay(period.start)} — ${formatDay(period.end)}</p>

      <label class="field">
        <span class="field__label">Сколько денег пришло (доход семьи)</span>
        <div class="input-money input-money--big">
          <input class="input" inputmode="decimal" value=${income} onInput=${(e) => setIncome(e.target.value)} placeholder="0" />
          <span>${cur}</span>
        </div>
      </label>

      ${items.length > 0 &&
      html`<div class="field">
        <span class="field__label">Обязательные статьи (можно поправить)</span>
        <ul class="plan-rows">
          ${items.map(
            (e) => html`<li class="plan-row">
              <span class="plan-row__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
              <span class="plan-row__name">${e.name}${e.kind === 'savings' ? html`<small class="muted">в копилку</small>` : ''}</span>
              <div class="input-money input-money--small">
                <input class="input" inputmode="decimal" value=${amounts[e.id] ?? ''} placeholder="0" aria-label=${`Сумма для «${e.name}»`}
                  onInput=${(ev) => setAmounts({ ...amounts, [e.id]: ev.target.value })} />
                <span>${cur}</span>
              </div>
            </li>`,
          )}
        </ul>
      </div>`}

      ${totals &&
      incomeKop > 0 &&
      html`<div class=${`plan-result ${next.free < 0 ? 'plan-result--bad' : ''}`}>
        <div class="plan-result__row"><span>Доход</span><${Money} kop=${next.income} /></div>
        <div class="plan-result__row"><span>Обязательные статьи</span><span>−<${Money} kop=${totals.mandatoryTotal} /></span></div>
        <div class="plan-result__row plan-result__row--total"><span>Свободно до ${formatDay(period.end, { short: true })}</span><${Money} kop=${next.free} /></div>
        ${next.free < 0
          ? html`<p class="plan-result__note">Обязательные статьи больше дохода на ${formatMoney(-next.free, family.currency)}. Уменьшите какую-нибудь статью.</p>`
          : html`<p class="plan-result__note">
              ≈ <strong>${formatMoney(totals.perDay, family.currency)}</strong> в день в среднем на ${pluralDays(period.days)}
              ${todayLimit !== null && html`<br />С учётом уже потраченного сегодня можно ≈ <strong>${formatMoney(Math.max(0, todayLimit), family.currency)}</strong>`}
            </p>`}
      </div>`}

      <button type="submit" class="btn btn--primary btn--block btn--lg" disabled=${!next || incomeKop <= 0}>Сохранить</button>
    </form>
  <//>`;
}
