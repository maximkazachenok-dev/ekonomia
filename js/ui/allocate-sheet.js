// Шторка «Распределить на категорию»: сколько из дохода выделить на «Бьюти», «Квартиру», «Накопление»…
// Сумма задаётся целиком (повторно — правка), свободные деньги и дневной лимит пересчитываются сразу.
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, Numpad, useApp, Money } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';
import { allocate, mainDailyEnvelope, dailyAllowance } from '../lib/budget.js';

export function AllocateSheet({ env, onClose }) {
  const { plan, prevPlan, period, family, allocateTo, envelopes, txs, today } = useApp();
  const [amount, setAmount] = useState('');
  const current = (env && plan?.mandatory[env.id]) || 0;

  useEffect(() => {
    if (env) setAmount(toInputString(current));
  }, [env]);

  if (!env || !plan) return null;

  const cur = family.currency;
  const kop = parseAmount(amount || '0');
  const valid = !Number.isNaN(kop);
  const after = valid ? allocate(plan, env.id, kop) : plan;
  // Та же цифра, что на главном экране: сколько можно потратить сегодня (по оставшимся дням)
  const main = mainDailyEnvelope(envelopes);
  const todayNow = main ? dailyAllowance({ limit: plan.free, txs, envelopeId: main.id, today, period }).todayLimit : 0;
  const todayAfter = main ? dailyAllowance({ limit: after.free, txs, envelopeId: main.id, today, period }).todayLimit : 0;
  const lastMonth = prevPlan?.mandatory?.[env.id] || 0;

  const save = (value) => {
    allocateTo(env, value);
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${`${env.icon} ${env.name}`}>
    <div class="tx-form">
      <div class=${`amount-display ${kop > 0 ? '' : 'amount-display--empty'}`} aria-live="polite">
        <span class="amount-display__value">${amount || '0'}</span>
        <span class="amount-display__cur">${currencySymbol(cur)}</span>
      </div>

      <div class=${`plan-result ${after.free < 0 ? 'plan-result--bad' : ''}`}>
        <div class="plan-result__row"><span>Свободно сейчас</span><${Money} kop=${plan.free} /></div>
        <div class="plan-result__row plan-result__row--total"><span>Останется свободно</span><${Money} kop=${after.free} /></div>
        <p class="plan-result__note">
          ${after.free < 0
            ? `Распределено больше дохода на ${formatMoney(-after.free, cur)}`
            : html`Сегодня можно будет потратить <strong>${formatMoney(Math.max(0, todayAfter), cur)}</strong> (сейчас ${formatMoney(Math.max(0, todayNow), cur)})`}
        </p>
      </div>

      <div class="chips">
        ${lastMonth > 0 &&
        html`<button type="button" class="chip chip--small" onClick=${() => setAmount(toInputString(lastMonth))}>
          В прошлом месяце: ${formatMoney(lastMonth, cur)}
        </button>`}
        ${plan.free + current > 0 &&
        html`<button type="button" class="chip chip--small" onClick=${() => setAmount(toInputString(plan.free + current))}>
          Всё свободное: ${formatMoney(plan.free + current, cur)}
        </button>`}
      </div>

      ${env.kind === 'savings' &&
      html`<p class="field__hint">Эта сумма сразу попадёт в копилку «${env.name}». Если потом изменить или убрать распределение, взнос в копилку изменится вместе с ним.</p>`}

      <${Numpad} value=${amount} onChange=${setAmount} />

      <div class="tx-actions">
        ${current > 0 && html`<button type="button" class="btn btn--danger-ghost" onClick=${() => save(0)}>Убрать</button>`}
        <button type="button" class="btn btn--primary btn--grow" disabled=${!valid || kop === current} onClick=${() => save(kop)}>
          ${current > 0 ? 'Сохранить' : 'Распределить'}
        </button>
      </div>
    </div>
  <//>`;
}
