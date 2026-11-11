// Шторка «Добавить трату» / «Изменить» / «Отложить в копилку».
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, Numpad, useApp } from './common.js';
import { parseAmount, toInputString, currencySymbol } from '../lib/money.js';
import { addDays } from '../lib/dates.js';
import { mainDailyEnvelope, shopName } from '../lib/budget.js';

// opts: { tx } — редактирование; { envelopeId, type } — новая операция
export function TxSheet({ opts, onClose }) {
  const app = useApp();
  const { envelopes, envById, today, family, user, shops } = app;
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
  const [shopId, setShopId] = useState('other');
  // Новый раздел дневных расходов («Столовая») создаётся прямо здесь, вместе с тратой
  const [newShop, setNewShop] = useState(null);

  useEffect(() => {
    if (!opts) return;
    setShopId('other');
    setNewShop(null);
    setAmount(editing ? toInputString(editing.amount) : '');
    setEnvelopeId(defaultEnv);
    setType(editing?.type || opts.type || 'expense');
    setNote(editing?.note || '');
    setDate(editing?.date || today);
    setShowMore(Boolean(editing?.note) || (editing && editing.date !== today));
  }, [opts]);

  if (!opts) return null;

  const kop = parseAmount(amount || '0');
  const env = envById[envelopeId];
  const main = mainDailyEnvelope(envelopes);
  // Траты из свободных денег относятся к разделу (магазину, «Столовой» или «Другое»)
  const isMainDaily = !editing && envelopeId === main?.id;
  const activeShops = shops.filter((s) => !s.archived);
  const newName = (newShop || '').trim();
  const sameShop = newName && activeShops.find((s) => shopName(s).toLowerCase() === newName.toLowerCase());
  const valid = kop > 0 && envelopeId && (newShop === null || newName);

  // Один список: разделы дневного лимита и остальные категории. При правке — только категории.
  const where = newShop !== null ? 'new' : isMainDaily ? `shop:${shopId}` : `env:${envelopeId}`;
  const pick = (v) => {
    if (v === 'new') {
      setEnvelopeId(main.id);
      setNewShop('');
      return;
    }
    setNewShop(null);
    if (v.startsWith('shop:')) {
      setEnvelopeId(main.id);
      setShopId(v.slice(5));
    } else setEnvelopeId(v.slice(4));
  };
  const others = spendable.filter((e) => editing || e.id !== main?.id);

  const title = editing
    ? 'Изменить запись'
    : isSavings
      ? type === 'deposit' ? `Отложить в «${presetEnv.name}»` : `Взять из «${presetEnv.name}»`
      : 'Новая трата';

  const submit = async (e) => {
    e?.preventDefault();
    if (!valid) return;
    const data = { amount: kop, envelopeId, type, note: note.trim(), date };
    if (isMainDaily) {
      data.shopId = shopId;
      if (newShop !== null) {
        data.shopId = sameShop?.id || (await app.saveShop({ name: newName, icon: '🧾', order: Date.now(), archived: false }));
        if (!data.shopId) return;
      }
    }
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
      html`<select class="input tx-select" value=${where} onChange=${(e) => pick(e.target.value)} aria-label="На что потрачено">
        ${!editing &&
        main &&
        html`<optgroup label=${`Из дневного лимита — «${main.name}»`}>
          ${activeShops.map((s) => html`<option value=${`shop:${s.id}`}>${s.icon || '🏪'} ${shopName(s)}</option>`)}
          <option value="new">＋ Новый раздел (например, Столовая)…</option>
        </optgroup>`}
        ${others.length > 0 &&
        html`<optgroup label=${editing ? 'Категории' : 'Отдельные категории'}>
          ${others.map((e) => html`<option value=${`env:${e.id}`}>${e.icon} ${e.name}</option>`)}
        </optgroup>`}
      </select>`}

      ${newShop !== null &&
      html`<div class="tx-newshop">
        <input class="input" value=${newShop} onInput=${(e) => setNewShop(e.target.value)} placeholder="Название: Столовая, Кофе…" maxlength="30" aria-label="Название нового раздела" />
        <span class="field__hint">${sameShop ? 'Такой раздел уже есть — трата попадёт в него.' : `Трата вычтется из дневного лимита, а сумма по разделу будет видна во вкладке «Расходы» и в статистике.`}</span>
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
          ${valid && env && !isSavings && !isMainDaily && html`<span class="btn__hint">в «${env.name}»</span>`}
        </button>
      </div>
    </form>
  <//>`;
}
