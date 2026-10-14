// Шторка «Добавить трату» / «Изменить» / «Отложить в копилку».
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, Numpad, useApp } from './common.js';
import { parseAmount, toInputString, currencySymbol } from '../lib/money.js';
import { addDays } from '../lib/dates.js';

// opts: { tx } — редактирование; { envelopeId, type } — новая операция
export function TxSheet({ opts, onClose }) {
  const app = useApp();
  const { envelopes, envById, today, family, user } = app;
  const editing = opts?.tx || null;
  const presetEnv = editing ? envById[editing.envelopeId] : envById[opts?.envelopeId];
  const isSavings = presetEnv?.kind === 'savings';

  const spendable = envelopes.filter((e) => !e.archived && e.kind !== 'savings');
  const defaultEnv = presetEnv?.id || spendable[0]?.id;

  const [amount, setAmount] = useState('');
  const [envelopeId, setEnvelopeId] = useState(defaultEnv);
  const [type, setType] = useState('expense');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!opts) return;
    setAmount(editing ? toInputString(editing.amount) : '');
    setEnvelopeId(defaultEnv);
    setType(editing?.type || opts.type || 'expense');
    setNote(editing?.note || '');
    setDate(editing?.date || today);
    setShowMore(Boolean(editing?.note) || (editing && editing.date !== today));
  }, [opts]);

  if (!opts) return null;

  const kop = parseAmount(amount || '0');
  const valid = kop > 0 && envelopeId;
  const env = envById[envelopeId];

  const title = editing
    ? 'Изменить запись'
    : isSavings
      ? type === 'deposit' ? `Отложить в «${presetEnv.name}»` : `Взять из «${presetEnv.name}»`
      : 'Новая трата';

  const submit = (e) => {
    e?.preventDefault();
    if (!valid) return;
    const data = { amount: kop, envelopeId, type, note: note.trim(), date };
    if (editing) app.updateTx(editing, data);
    else app.addTx({ ...data, createdBy: { uid: user.uid, name: user.name }, createdAt: Date.now() });
    onClose();
  };

  const remove = () => {
    app.deleteTx(editing);
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${title}>
    <form class="tx-form" onSubmit=${submit}>
      <div class=${`amount-display ${kop > 0 ? '' : 'amount-display--empty'}`} aria-live="polite">
        <span class="amount-display__value">${amount || '0'}</span>
        <span class="amount-display__cur">${currencySymbol(family.currency)}</span>
      </div>

      ${!isSavings &&
      html`<div class="chips" role="radiogroup" aria-label="Конверт">
        ${spendable.map(
          (e) => html`<button
            type="button"
            role="radio"
            aria-checked=${e.id === envelopeId}
            class=${`chip ${e.id === envelopeId ? 'chip--active' : ''}`}
            style=${{ '--chip': e.color }}
            onClick=${() => setEnvelopeId(e.id)}
          >
            <span class="chip__icon">${e.icon}</span>${e.name}
          </button>`,
        )}
      </div>`}

      ${showMore
        ? html`<div class="tx-extra">
            <input class="input" type="text" placeholder="Заметка (необязательно)" value=${note} onInput=${(e) => setNote(e.target.value)} maxlength="80" />
            <div class="date-row">
              ${[0, 1, 2].map((d) => {
                const iso = addDays(today, -d);
                return html`<button type="button" class=${`chip chip--small ${date === iso ? 'chip--active' : ''}`} onClick=${() => setDate(iso)}>
                  ${['Сегодня', 'Вчера', 'Позавчера'][d]}
                </button>`;
              })}
              <input class="input input--date" type="date" value=${date} max=${today} onInput=${(e) => e.target.value && setDate(e.target.value)} aria-label="Дата" />
            </div>
          </div>`
        : html`<button type="button" class="link-btn" onClick=${() => setShowMore(true)}>+ заметка или другая дата</button>`}

      <${Numpad} value=${amount} onChange=${setAmount} />

      <div class="tx-actions">
        ${editing && html`<button type="button" class="btn btn--danger-ghost" onClick=${remove}>Удалить</button>`}
        <button type="submit" class="btn btn--primary btn--grow" disabled=${!valid}>
          ${editing ? 'Сохранить' : isSavings ? (type === 'deposit' ? 'Отложить' : 'Взять') : 'Записать'}
          ${valid && env && !isSavings && html`<span class="btn__hint">в «${env.name}»</span>`}
        </button>
      </div>
    </form>
  <//>`;
}
