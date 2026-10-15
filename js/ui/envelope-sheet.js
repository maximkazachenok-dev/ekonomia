// Шторка создания и редактирования конверта (категории).
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, ENVELOPE_ICONS, ENVELOPE_COLORS, KIND_LABELS, showToast } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';

export function EnvelopeSheet({ env, onClose }) {
  const { envelopes, saveEnvelope, family, period, plan } = useApp();
  const isNew = !env?.id;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [color, setColor] = useState(ENVELOPE_COLORS[0]);
  const [kind, setKind] = useState('period');
  const [amount, setAmount] = useState('');
  const [monthly, setMonthly] = useState('');

  useEffect(() => {
    if (!env) return;
    const k = env.kind || 'period';
    setName(env.name || '');
    setIcon(env.icon || (k === 'savings' ? '🐷' : '🛒'));
    setColor(env.color || ENVELOPE_COLORS[envelopes.length % ENVELOPE_COLORS.length]);
    setKind(k);
    setAmount(toInputString(k === 'savings' ? env.goal : env.limit));
    setMonthly(toInputString(env.monthly));
  }, [env]);

  if (!env) return null;

  const kop = amount ? parseAmount(amount) : 0;
  const monthlyKop = monthly ? parseAmount(monthly) : 0;
  const valid = name.trim() && !Number.isNaN(kop) && !Number.isNaN(monthlyKop);
  const cur = currencySymbol(family.currency);
  // Сумма главного конверта считается из дохода: доход − обязательные статьи
  const fromIncome = plan && env.id && env.id === plan.mainEnvelopeId;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    const data = { name: name.trim(), icon, color, kind };
    if (kind === 'savings') {
      data.goal = kop;
      data.monthly = monthlyKop;
    } else if (!fromIncome) data.limit = kop;
    if (isNew) data.order = envelopes.length;
    else data.id = env.id;
    saveEnvelope(data);
    onClose();
  };

  const archive = () => {
    saveEnvelope({ id: env.id, archived: true });
    showToast(`«${env.name}» скрыт`, { label: 'Вернуть', run: () => saveEnvelope({ id: env.id, archived: false }) });
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${isNew ? 'Новый конверт' : 'Конверт'}>
    <form class="form" onSubmit=${submit}>
      <label class="field">
        <span class="field__label">Название</span>
        <input class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Например, Аптека" maxlength="24" required />
      </label>

      <div class="field">
        <span class="field__label">Тип</span>
        <div class="segmented" role="radiogroup">
          ${Object.entries(KIND_LABELS).map(
            ([k, label]) => html`<button type="button" role="radio" aria-checked=${kind === k} class=${`segmented__opt ${kind === k ? 'segmented__opt--active' : ''}`} onClick=${() => setKind(k)} disabled=${!isNew && (k === 'savings') !== (env.kind === 'savings')}>${label}</button>`,
          )}
        </div>
      </div>

      ${fromIncome
        ? html`<p class="notice">Сумма этого конверта считается сама: доход минус обязательные статьи. Изменить её можно через «Доход на период».</p>`
        : html`<label class="field">
            <span class="field__label">${kind === 'savings' ? 'Цель (сколько хотим накопить)' : 'Сколько выделяем до следующей зарплаты'}</span>
            <div class="input-money">
              <input class="input" inputmode="decimal" value=${amount} onInput=${(e) => setAmount(e.target.value)} placeholder="0" />
              <span>${cur}</span>
            </div>
            ${kind === 'daily' && kop > 0 && html`<span class="field__hint">≈ ${formatMoney(Math.floor(kop / period.days), family.currency)} в день</span>`}
          </label>`}

      ${kind === 'savings' &&
      html`<label class="field">
        <span class="field__label">Откладываем каждый месяц (обязательная статья)</span>
        <div class="input-money">
          <input class="input" inputmode="decimal" value=${monthly} onInput=${(e) => setMonthly(e.target.value)} placeholder="0" />
          <span>${cur}</span>
        </div>
        <span class="field__hint">Эта сумма вычитается из дохода. В копилку деньги вы откладываете сами кнопкой «Отложить».</span>
      </label>`}

      <div class="field">
        <span class="field__label">Значок</span>
        <div class="icon-grid">
          ${ENVELOPE_ICONS.map((i) => html`<button type="button" class=${`icon-pick ${icon === i ? 'icon-pick--active' : ''}`} onClick=${() => setIcon(i)} aria-label=${i}>${i}</button>`)}
        </div>
      </div>

      <div class="field">
        <span class="field__label">Цвет</span>
        <div class="color-row">
          ${ENVELOPE_COLORS.map((c) => html`<button type="button" class=${`color-pick ${color === c ? 'color-pick--active' : ''}`} style=${{ background: c }} onClick=${() => setColor(c)} aria-label=${c}></button>`)}
        </div>
      </div>

      <div class="tx-actions">
        ${!isNew && html`<button type="button" class="btn btn--danger-ghost" onClick=${archive}>Скрыть</button>`}
        <button type="submit" class="btn btn--primary btn--grow" disabled=${!valid}>Сохранить</button>
      </div>
    </form>
  <//>`;
}
