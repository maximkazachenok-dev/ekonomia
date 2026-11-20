// Шторка создания и редактирования конверта (категории).
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, ENVELOPE_COLORS, KIND_LABELS, showToast, Mono, Icon } from './common.js';
import { parseAmount, toInputString, currencySymbol, formatMoney } from '../lib/money.js';

export function EnvelopeSheet({ env, onClose }) {
  const { envelopes, saveEnvelope, family, period, plan, openAllocate } = useApp();
  const isNew = !env?.id;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [color, setColor] = useState(ENVELOPE_COLORS[0]);
  const [kind, setKind] = useState('period');
  const [amount, setAmount] = useState('');
  // Подразделы (свет, вода, газ): удалённые не стираются, а скрываются — траты в них остаются в истории
  const [subs, setSubs] = useState([]);
  const [subName, setSubName] = useState('');

  useEffect(() => {
    if (!env) return;
    const k = env.kind || 'period';
    setName(env.name || '');
    setIcon(env.icon || (k === 'savings' ? '🐷' : '🛒'));
    setColor(env.color || ENVELOPE_COLORS[envelopes.length % ENVELOPE_COLORS.length]);
    setKind(k);
    setAmount(toInputString(k === 'savings' ? env.goal : env.limit));
    setSubs(env.subs || []);
    setSubName('');
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

  const visibleSubs = subs.filter((s) => !s.archived);
  const canHaveSubs = kind === 'period' && !fromIncome;
  const addSub = () => {
    const n = subName.trim();
    if (!n) return;
    const same = subs.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (same) setSubs(subs.map((s) => (s === same ? { ...s, archived: false } : s)));
    else setSubs([...subs, { id: Math.random().toString(36).slice(2, 10), name: n }]);
    setSubName('');
  };
  const removeSub = (id) => setSubs(subs.map((s) => (s.id === id ? { ...s, archived: true } : s)));

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    const data = { name: name.trim(), icon, color, kind };
    if (canHaveSubs) {
      // Название, введённое, но не добавленное кнопкой, тоже сохраняем
      const pendingName = subName.trim();
      data.subs = pendingName && !subs.some((s) => s.name.toLowerCase() === pendingName.toLowerCase())
        ? [...subs, { id: Math.random().toString(36).slice(2, 10), name: pendingName }]
        : subs;
    }
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
      <div class="mono-preview">
        <${Mono} name=${name} color=${color} size="lg" />
        <div>
          <strong class="mono-preview__name">${name.trim() || 'Название'}</strong>
          <span class="field__hint">Значок складывается из названия сам</span>
        </div>
      </div>
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

      ${canHaveSubs &&
      html`<div class="field">
        <span class="field__label">Подразделы</span>
        ${visibleSubs.length > 0 &&
        html`<ul class="subs-edit">
          ${visibleSubs.map(
            (s) => html`<li key=${s.id}>
              <span>${s.name}</span>
              <button type="button" class="icon-btn icon-btn--close" onClick=${() => removeSub(s.id)} aria-label=${`Убрать подраздел «${s.name}»`}>${Icon.close}</button>
            </li>`,
          )}
        </ul>`}
        <div class="subs-add">
          <input class="input" value=${subName} onInput=${(e) => setSubName(e.target.value)} placeholder=${visibleSubs.length ? 'Ещё подраздел' : 'Например: свет, вода, газ'} maxlength="24"
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} aria-label="Название подраздела" />
          <button type="button" class="btn btn--ghost" onClick=${addSub} disabled=${!subName.trim()}>Добавить</button>
        </div>
        <span class="field__hint">Необязательно. С подразделами сумма статьи складывается из сумм подразделов, а трату можно записать в подраздел.</span>
      </div>`}

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
