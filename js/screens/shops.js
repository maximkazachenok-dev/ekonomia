// Вкладка «Магазины»: разделы покупок (магазины и категории) и покупки в них.
import { html, useState, useMemo } from '../lib/preact.js';
import { useApp, Money, Icon } from '../ui/common.js';
import { shopName, shopTotals } from '../lib/budget.js';
import { relativeDay, formatDay } from '../lib/dates.js';

const pluralPurchases = (n) => {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return `${n} покупок`;
  if (b === 1) return `${n} покупка`;
  if (b >= 2 && b <= 4) return `${n} покупки`;
  return `${n} покупок`;
};

function ShopList() {
  const { shops, txs, period, setOpenShopId, openShopEdit, saveShop } = useApp();
  const [showHidden, setShowHidden] = useState(false);
  const totals = useMemo(() => shopTotals(txs, period.start, period.end), [txs, period]);
  const active = shops.filter((s) => !s.archived);
  const hidden = shops.filter((s) => s.archived);
  const spentAll = Object.values(totals).reduce((s, t) => s + t.spent, 0);

  return html`<div class="screen">
    <header class="screen__head">
      <div>
        <p class="eyebrow">${formatDay(period.start, { short: true })} — ${formatDay(period.end, { short: true })}</p>
        <h1 class="screen__title">Магазины</h1>
      </div>
    </header>
    ${spentAll > 0 && html`<p class="muted">За период в разделах потрачено <${Money} kop=${spentAll} /></p>`}

    <section class="card card--flush">
      <ul class="env-list">
        ${active.map((s) => {
          const t = totals[s.id];
          return html`<li key=${s.id}>
            <button class="env-row" onClick=${() => { setOpenShopId(s.id); window.scrollTo(0, 0); }}>
              <span class="env-row__icon" style=${{ background: 'var(--surface-2)' }}>${s.icon || '🏪'}</span>
              <span class="env-row__main">
                <span class="env-row__top">
                  <span class="env-row__name">${shopName(s)}</span>
                  ${t && html`<span class="env-row__left"><${Money} kop=${t.spent} /></span>`}
                </span>
                <span class="env-row__sub muted">${t ? `${pluralPurchases(t.count)} за период` : 'пока без покупок'}</span>
              </span>
              <span class="env-row__chev">${Icon.chevron}</span>
            </button>
          </li>`;
        })}
      </ul>
    </section>

    <button class="btn btn--ghost btn--block" onClick=${() => openShopEdit({})}>+ Новый раздел</button>

    ${hidden.length > 0 &&
    html`<button class="link-btn" onClick=${() => setShowHidden(!showHidden)}>
      ${showHidden ? 'Спрятать скрытые' : `Скрытые разделы (${hidden.length})`}
    </button>`}
    ${showHidden &&
    html`<section class="card card--flush">
      <ul class="env-list">
        ${hidden.map(
          (s) => html`<li key=${s.id} class="env-row env-row--archived">
            <span class="env-row__icon">${s.icon || '🏪'}</span>
            <span class="env-row__main"><span class="env-row__name">${shopName(s)}</span></span>
            <button class="link-btn" onClick=${() => saveShop({ id: s.id, archived: false })}>Вернуть</button>
          </li>`,
        )}
      </ul>
    </section>`}
  </div>`;
}

function ShopDetail({ shop }) {
  const { txs, today, period, family, user, setOpenShopId, openShopEdit, openPurchase, since, loadEarlier } = useApp();
  const list = txs.filter((t) => t.shopId === shop.id && t.type === 'expense');
  const totals = shopTotals(list, period.start, period.end)[shop.id];
  const multi = (family.members || []).length > 1;

  return html`<div class="screen">
    <header class="shop-head">
      <button class="icon-btn" onClick=${() => setOpenShopId(null)} aria-label="Назад к магазинам">${Icon.back}</button>
      <h1 class="screen__title">${shop.icon || '🏪'} ${shopName(shop)}</h1>
      <button class="link-btn" onClick=${() => openShopEdit(shop)}>Изменить</button>
    </header>
    <p class="muted">
      ${totals ? html`За период: <${Money} kop=${totals.spent} /> · ${pluralPurchases(totals.count)}` : 'В этом периоде покупок нет'}
    </p>

    <button class="btn btn--primary btn--block" onClick=${() => openPurchase({ shopId: shop.id })}>+ Покупка</button>

    ${list.length > 0 &&
    html`<section class="card card--flush">
      ${list.map(
        (t) => html`<div class="purchase" key=${t.id}>
          <button class="purchase__btn" onClick=${() => openPurchase({ tx: t })}>
            <span class="purchase__top">
              <span>${relativeDay(t.date, today)}${multi && t.createdBy?.uid !== user.uid ? html` <span class="muted">· ${t.createdBy?.name}</span>` : ''}</span>
              <${Money} kop=${t.amount} forceKop=${t.amount % 100 !== 0} />
            </span>
            ${t.items?.length
              ? html`<span class="purchase__items">
                  ${t.items.map((it) => html`<span class="purchase__item"><span>${it.name}</span><${Money} kop=${it.amount} forceKop=${it.amount % 100 !== 0} /></span>`)}
                </span>`
              : html`<span class="purchase__items">${t.note || 'без списка товаров'}</span>`}
            ${t.pending && html`<span class="purchase__items pending">⏳ отправится, когда появится интернет</span>`}
          </button>
        </div>`,
      )}
    </section>`}

    <button class="btn btn--ghost btn--block" onClick=${loadEarlier}>Показать раньше ${formatDay(since, { short: true })}</button>
  </div>`;
}

export function ShopsScreen() {
  const { openShopId, shopById } = useApp();
  const shop = openShopId && shopById[openShopId];
  return shop ? html`<${ShopDetail} shop=${shop} />` : html`<${ShopList} />`;
}
