// Шторка создания и редактирования конверта (категории).
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, ENVELOPE_ICONS, ENVELOPE_COLORS, KIND_LABELS, showToast } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';

export function EnvelopeSheet({ env, onClose }) {
  const { envelopes, saveEnvelope, family, period, plan, openAllocate } = useApp();
  const isNew = !env?.id;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [color, setColor] = useState(ENVELOPE_COLORS[0]);
  const [kind, setKind] = useState('period');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!env) return;
    const k = env.kind || 'period';
    setName(env.name || '');
    setIcon(env.icon || (k === 'savings' ? '🐷' : '🛒'));
    setColor(env.color || ENVELOPE_COLORS[envelopes.length % ENVELOPE_COLORS.length]);
    setKind(k);
    setAmount(toInputString(k === 'savings' ? env.goal : env.limit));
  }, [env]);

  if (!env) return null;

  const kop = amount ? parseAmount(amount) : 0;
  const valid = name.trim() && !Number.isNaN(kop);
  const cur = currencySymbol(family.currency);
  // Сумма главного конверта считается из дохода: доход − распределённое по категориям
  const fromIncome = plan && env.id && env.id === plan.mainEnvelopeId;
  // Когда доход введён, сумма категории задаётся распределением на главном экране, а не здесь
  const byAllocation = plan && !fromIncome && kind !== 'savings';
  const allocatedNow = (plan && env.id && plan.mandatory[env.id]) || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    const data = { name: name.trim(), icon, color, kind };
    if (kind === 'savings') data.goal = kop;
    else if (!fromIncome && !byAllocation) data.limit = kop;
    if (isNew) data.order = envelopes.length;
    else data.id = env.id;
    onClose();
    const id = await saveEnvelope(data);
    // Доход уже введён: новую категорию сразу предлагаем распределить
    if (isNew && plan && id) openAllocate({ ...data, id });
  };

  const archive = () => {
    saveEnvelope({ id: env.id, archived: true });
    showToast(`«${env.name}» скрыт`, { label: 'Вернуть', run: () => saveEnvelope({ id: env.id, archived: false }) });
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${isNew ? 'Новая категория' : 'Категория'}>
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
        ? html`<p class="notice">Сумма этого конверта считается сама: доход минус всё, что распределено по категориям.</p>`
        : byAllocation
          ? html`<p class="notice">
              ${allocatedNow > 0 ? html`Распределено в этом периоде: ${formatMoney(allocatedNow, family.currency)} ` : ''}Сумма категории задаётся при распределении дохода: на главном экране нажмите на категорию в блоке «Распределение дохода».
            </p>`
          : html`<label class="field">
              <span class="field__label">${kind === 'savings' ? 'Цель (сколько хотим накопить)' : 'Сколько выделяем до следующей зарплаты'}</span>
              <div class="input-money">
                <input class="input" inputmode="decimal" value=${amount} onInput=${(e) => setAmount(e.target.value)} placeholder="0" />
                <span>${cur}</span>
              </div>
              ${kind === 'daily' && kop > 0 && html`<span class="field__hint">≈ ${formatMoney(Math.floor(kop / period.days), family.currency)} в день</span>`}
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
