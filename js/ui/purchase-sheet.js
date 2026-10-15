// Шторка покупки: раздел (магазин), дата и список «что купили — сколько стоит».
// Покупка — обычная трата в главном конверте с дневным лимитом, плюс shopId и items.
import { html, useState, useEffect, useMemo } from '../lib/preact.js';
import { BottomSheet, useApp, Money, Icon } from './common.js';
import { parseAmount, toInputString, currencySymbol } from '../lib/money.js';
import { addDays } from '../lib/dates.js';
import { mainDailyEnvelope, shopName, itemSuggestions, lastPrice } from '../lib/budget.js';

const emptyRow = () => ({ name: '', price: '' });

// opts: { tx } — правка; { shopId, draft? } — новая покупка (draft приходит из голосового ввода)
export function PurchaseSheet({ opts, onClose }) {
  const app = useApp();
  const { envelopes, shops, shopById, today, family, user, txs, openShopEdit } = app;
  const editing = opts?.tx || null;
  const main = mainDailyEnvelope(envelopes);

  const [shopId, setShopId] = useState('other');
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState([emptyRow()]);
  const [onlyTotal, setOnlyTotal] = useState(false);
  const [total, setTotal] = useState('');

  const suggestions = useMemo(() => itemSuggestions(txs), [txs]);
  const names = useMemo(() => [...suggestions.values()].map((s) => s.name), [suggestions]);

  useEffect(() => {
    if (!opts) return;
    const src = editing || opts.draft || {};
    setShopId(src.shopId || opts.shopId || 'other');
    setDate(src.date || today);
    const items = src.items || [];
    setRows(items.length ? items.map((it) => ({ name: it.name, price: toInputString(it.amount) })) : [emptyRow()]);
    setOnlyTotal(Boolean(editing && !items.length));
    setTotal(editing && !items.length ? toInputString(editing.amount) : '');
  }, [opts]);

  if (!opts) return null;
  if (!main) {
    return html`<${BottomSheet} open=${true} onClose=${onClose} title="Покупка">
      <p class="notice">Нет конверта с дневным лимитом: покупкам не из чего вычитаться. Добавьте его в Настройках → Конверты.</p>
    <//>`;
  }

  const cur = currencySymbol(family.currency);
  const filled = rows.filter((r) => r.name.trim() || r.price.trim());
  const parsed = filled.map((r) => ({ name: r.name.trim() || 'Без названия', amount: parseAmount(r.price || '0') }));
  const rowsInvalid = parsed.some((p) => Number.isNaN(p.amount));
  const items = onlyTotal ? [] : parsed.filter((p) => p.amount > 0);
  const amount = onlyTotal ? parseAmount(total || '0') : items.reduce((s, p) => s + p.amount, 0);
  const valid = !rowsInvalid && amount > 0 && !Number.isNaN(amount);

  const visibleShops = shops.filter((s) => !s.archived || s.id === shopId);

  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Знакомый товар: подставляем последнюю цену, если её ещё не ввели
  const fillPrice = (i) => {
    const r = rows[i];
    if (r.price.trim()) return;
    const p = lastPrice(suggestions, r.name);
    if (p) setRow(i, { price: toInputString(p) });
  };
  const removeRow = (i) => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyRow()]);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    const data = { envelopeId: main.id, type: 'expense', amount, shopId, items, note: '', date };
    if (editing) app.updateTx(editing, data);
    else app.addTx({ ...data, createdBy: { uid: user.uid, name: user.name }, createdAt: Date.now() });
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${editing ? 'Покупка' : opts.draft ? 'Проверьте покупку' : 'Новая покупка'}>
    <form class="form" onSubmit=${submit}>
      <div class="chips chips--scroll" role="radiogroup" aria-label="Раздел">
        ${visibleShops.map(
          (s) => html`<button type="button" role="radio" aria-checked=${s.id === shopId} class=${`chip ${s.id === shopId ? 'chip--active' : ''}`} onClick=${() => setShopId(s.id)}>
            <span class="chip__icon">${s.icon || '🏪'}</span>${shopName(s)}
          </button>`,
        )}
        <button type="button" class="chip" onClick=${() => openShopEdit({})}>+ Раздел</button>
      </div>

      <div class="date-row">
        ${[0, 1, 2].map((d) => {
          const iso = addDays(today, -d);
          return html`<button type="button" class=${`chip chip--small ${date === iso ? 'chip--active' : ''}`} onClick=${() => setDate(iso)}>
            ${['Сегодня', 'Вчера', 'Позавчера'][d]}
          </button>`;
        })}
        <input class="input input--date" type="date" value=${date} max=${today} onInput=${(e) => e.target.value && setDate(e.target.value)} aria-label="Дата покупки" />
      </div>

      ${onlyTotal
        ? html`<label class="field">
            <span class="field__label">Сумма покупки</span>
            <div class="input-money input-money--big">
              <input class="input" inputmode="decimal" value=${total} onInput=${(e) => setTotal(e.target.value)} placeholder="0" />
              <span>${cur}</span>
            </div>
          </label>`
        : html`<div class="field">
            <span class="field__label">Что купили</span>
            <ul class="item-rows">
              ${rows.map(
                (r, i) => html`<li class="item-row">
                  <input class="input" value=${r.name} placeholder=${i === 0 ? 'Хлеб' : 'Товар'} list="item-names" aria-label=${`Товар ${i + 1}`}
                    onInput=${(e) => setRow(i, { name: e.target.value })} onBlur=${() => fillPrice(i)} />
                  <div class="input-money">
                    <input class="input item-row__price" inputmode="decimal" value=${r.price} placeholder="0" aria-label=${`Цена товара ${i + 1}`}
                      onInput=${(e) => setRow(i, { price: e.target.value })} />
                  </div>
                  <button type="button" class="icon-btn item-row__del" onClick=${() => removeRow(i)} aria-label=${`Убрать товар ${i + 1}`}>${Icon.close}</button>
                </li>`,
              )}
            </ul>
            <datalist id="item-names">${names.map((n) => html`<option value=${n} />`)}</datalist>
            <button type="button" class="link-btn" onClick=${() => setRows([...rows, emptyRow()])}>+ ещё товар</button>
          </div>`}

      <div class="purchase-total">
        <span>Итого</span>
        ${valid ? html`<${Money} kop=${amount} forceKop=${amount % 100 !== 0} />` : html`<span class="muted">—</span>`}
      </div>
      ${rowsInvalid && html`<p class="form-error">Проверьте цены: допустимы цифры и запятая, не больше двух знаков после неё</p>`}
      <button type="button" class="link-btn muted" onClick=${() => setOnlyTotal(!onlyTotal)}>
        ${onlyTotal ? 'Ввести список товаров' : 'Без списка — только общая сумма'}
      </button>

      <div class="tx-actions">
        ${editing && html`<button type="button" class="btn btn--danger-ghost" onClick=${() => { app.deleteTx(editing); onClose(); }}>Удалить</button>`}
        <button type="submit" class="btn btn--primary btn--grow" disabled=${!valid}>${editing ? 'Сохранить' : 'Записать'}</button>
      </div>
    </form>
  <//>`;
}
