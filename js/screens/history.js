import { html, useState, useMemo } from '../lib/preact.js';
import { useApp, Money } from '../ui/common.js';
import { relativeDay, formatDay } from '../lib/dates.js';
import { shopName } from '../lib/budget.js';

export function TxRow({ tx, showDate = false }) {
  const { envById, shopById, openTx, user, family } = useApp();
  const env = envById[tx.envelopeId];
  if (!env) return null;
  const shop = tx.shopId ? shopById[tx.shopId] : null;
  const isSave = env.kind === 'savings';
  const who = tx.createdBy?.uid === user.uid ? 'Я' : tx.createdBy?.name || '—';
  const multi = (family.members || []).length > 1;
  const sign = isSave ? (tx.type === 'deposit' ? '+' : '−') : '';
  // Покупка в разделе: «Гиппо» и список товаров; обычная трата: заметка или конверт
  const title = shop ? shopName(shop) : tx.note || env.name;
  const meta = [
    tx.items?.length ? tx.items.map((it) => it.name).join(', ') : shop ? tx.note : tx.note ? env.name : '',
    multi ? who : '',
    showDate ? formatDay(tx.date, { short: true }) : '',
  ].filter(Boolean);
  return html`<li>
    <button class="tx-row" onClick=${() => openTx({ tx })}>
      <span class="env-row__icon" style=${{ background: env.color + '22' }}>${shop ? shop.icon || '🏪' : env.icon}</span>
      <span class="tx-row__main">
        <span class="tx-row__name">${title}</span>
        <span class="tx-row__meta muted">
          ${meta.join(' · ')}
          ${tx.pending ? html` · <span class="pending" title="Отправится, когда появится интернет">⏳</span>` : ''}
        </span>
      </span>
      <span class=${`tx-row__amount ${isSave ? (tx.type === 'deposit' ? 'tx-row__amount--plus' : '') : ''}`}>
        ${sign}<${Money} kop=${tx.amount} forceKop=${tx.amount % 100 !== 0} />
      </span>
    </button>
  </li>`;
}

export function HistoryScreen() {
  const { txs, envelopes, envById, shops, today, family, user, since, loadEarlier } = useApp();
  // Фильтр: 'all', id конверта или 'shop:<id>' для раздела покупок
  const [envFilter, setEnvFilter] = useState('all');
  const [who, setWho] = useState('all');
  const members = Object.entries(family.memberNames || {});

  const matches = (t) =>
    envFilter === 'all' || (envFilter.startsWith('shop:') ? t.shopId === envFilter.slice(5) : t.envelopeId === envFilter);

  const filtered = useMemo(
    () => txs.filter((t) => envById[t.envelopeId] && matches(t) && (who === 'all' || t.createdBy?.uid === who)),
    [txs, envFilter, who, envById],
  );
  const usedShops = shops.filter((s) => txs.some((t) => t.shopId === s.id));

  const groups = useMemo(() => {
    const m = new Map();
    for (const t of filtered) {
      if (!m.has(t.date)) m.set(t.date, []);
      m.get(t.date).push(t);
    }
    return [...m];
  }, [filtered]);

  const used = envelopes.filter((e) => !e.archived || txs.some((t) => t.envelopeId === e.id));

  return html`<div class="screen">
    <header class="screen__head"><h1 class="screen__title">История</h1></header>

    <div class="chips chips--scroll">
      <button class=${`chip chip--small ${envFilter === 'all' ? 'chip--active' : ''}`} onClick=${() => setEnvFilter('all')}>Все</button>
      ${used.map(
        (e) => html`<button class=${`chip chip--small ${envFilter === e.id ? 'chip--active' : ''}`} style=${{ '--chip': e.color }} onClick=${() => setEnvFilter(e.id)}>
          <span class="chip__icon">${e.icon}</span>${e.name}
        </button>`,
      )}
      ${usedShops.map(
        (s) => html`<button class=${`chip chip--small ${envFilter === `shop:${s.id}` ? 'chip--active' : ''}`} onClick=${() => setEnvFilter(`shop:${s.id}`)}>
          <span class="chip__icon">${s.icon || '🏪'}</span>${shopName(s)}
        </button>`,
      )}
    </div>
    ${members.length > 1 &&
    html`<div class="chips">
      <button class=${`chip chip--small ${who === 'all' ? 'chip--active' : ''}`} onClick=${() => setWho('all')}>Все</button>
      ${members.map(
        ([uid, name]) => html`<button class=${`chip chip--small ${who === uid ? 'chip--active' : ''}`} onClick=${() => setWho(uid)}>
          ${uid === user.uid ? 'Я' : name}
        </button>`,
      )}
    </div>`}

    ${groups.length === 0 && html`<p class="empty">Здесь появятся ваши траты.<br />Нажмите «+», чтобы записать первую.</p>`}

    ${groups.map(([date, list]) => {
      const dayTotal = list.filter((t) => t.type === 'expense' && envById[t.envelopeId]?.kind !== 'savings').reduce((s, t) => s + t.amount, 0);
      return html`<section class="card card--flush" key=${date}>
        <div class="day-head">
          <span>${relativeDay(date, today)}</span>
          ${dayTotal > 0 && html`<span class="muted"><${Money} kop=${dayTotal} /></span>`}
        </div>
        <ul class="tx-list">${list.map((t) => html`<${TxRow} key=${t.id} tx=${t} />`)}</ul>
      </section>`;
    })}

    <button class="btn btn--ghost btn--block" onClick=${loadEarlier}>Показать раньше ${formatDay(since, { short: true })}</button>
  </div>`;
}
