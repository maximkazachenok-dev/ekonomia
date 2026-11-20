// Шторка «Распределить на категорию»: сколько из дохода выделить на «Бьюти», «Квартиру», «Накопление»…
// Сумма задаётся целиком (повторно — правка), свободные деньги и дневной лимит пересчитываются сразу.
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, Numpad, useApp, Money } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';
import { allocate, allocateSubs, activeSubs, mainDailyEnvelope, dailyAllowance } from '../lib/budget.js';

export function AllocateSheet({ env, onClose }) {
  const { plan, prevPlan, period, family, allocateTo, allocateSubsTo, envelopes, txs, today, envById } = useApp();
  const [amount, setAmount] = useState('');
  const [subAmounts, setSubAmounts] = useState({});
  const current = (env && plan?.mandatory[env.id]) || 0;
  // Подразделы берём из свежих данных конверта (новый конверт приходит сюда без них)
  const subs = env && env.kind !== 'savings' ? activeSubs(envById[env.id] || env) : [];

  useEffect(() => {
    if (!env) return;
    setAmount(toInputString(current));
    const saved = plan?.subAlloc?.[env.id] || {};
    setSubAmounts(Object.fromEntries(Object.entries(saved).map(([id, v]) => [id, toInputString(v)])));
  }, [env]);

  if (!env || !plan) return null;
  if (subs.length) return html`<${SubsAllocate} env=${env} subs=${subs} values=${subAmounts} setValues=${setSubAmounts} onClose=${onClose} />`;

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

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${env.name}>
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

// Статья с подразделами: сумма на каждый подраздел, сумма статьи складывается сама.
function SubsAllocate({ env, subs, values, setValues, onClose }) {
  const { plan, prevPlan, family, allocateSubsTo } = useApp();
  const cur = family.currency;
  const kops = Object.fromEntries(subs.map((s) => [s.id, parseAmount(values[s.id] || '0')]));
  const invalid = Object.values(kops).some((v) => Number.isNaN(v));
  const total = invalid ? 0 : Object.values(kops).reduce((s, v) => s + v, 0);
  const current = plan.mandatory[env.id] || 0;
  const after = invalid ? plan : allocateSubs(plan, env.id, kops);
  const prev = prevPlan?.subAlloc?.[env.id] || {};

  const save = () => {
    allocateSubsTo(env, kops);
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${env.name}>
    <div class="form">
      <ul class="subs-alloc">
        ${subs.map(
          (s) => html`<li key=${s.id}>
            <label class="subs-alloc__name" for=${`sub-${s.id}`}>${s.name}
              ${prev[s.id] > 0 && html`<button type="button" class="link-btn subs-alloc__prev" onClick=${() => setValues({ ...values, [s.id]: toInputString(prev[s.id]) })}>было ${formatMoney(prev[s.id], cur)}</button>`}
            </label>
            <div class="input-money">
              <input id=${`sub-${s.id}`} class="input" inputmode="decimal" value=${values[s.id] || ''} placeholder="0"
                onInput=${(e) => setValues({ ...values, [s.id]: e.target.value })} />
              <span>${currencySymbol(cur)}</span>
            </div>
          </li>`,
        )}
      </ul>
      ${invalid && html`<p class="form-error">Проверьте суммы: допустимы цифры и запятая</p>`}
      <div class=${`plan-result ${after.free < 0 ? 'plan-result--bad' : ''}`}>
        <div class="plan-result__row"><span>Итого на «${env.name}»</span><${Money} kop=${total} /></div>
        <div class="plan-result__row plan-result__row--total"><span>Останется свободно</span><${Money} kop=${after.free} /></div>
        ${after.free < 0 && html`<p class="plan-result__note">Распределено больше дохода на ${formatMoney(-after.free, cur)}</p>`}
      </div>
      <div class="tx-actions">
        ${current > 0 && html`<button type="button" class="btn btn--danger-ghost" onClick=${() => { allocateSubsTo(env, {}); onClose(); }}>Убрать</button>`}
        <button type="button" class="btn btn--primary btn--grow" disabled=${invalid || (total === 0 && current === 0)} onClick=${save}>
          ${current > 0 ? 'Сохранить' : 'Распределить'}
        </button>
      </div>
    </div>
  <//>`;
}
