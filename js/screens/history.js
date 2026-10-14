import { html, useState, useMemo } from '../lib/preact.js';
import { useApp, Money } from '../ui/common.js';
import { relativeDay, formatDay } from '../lib/dates.js';

export function TxRow({ tx, showDate = false }) {
  const { envById, openTx, user, family } = useApp();
  const env = envById[tx.envelopeId];
  if (!env) return null;
  const isSave = env.kind === 'savings';
  const who = tx.createdBy?.uid === user.uid ? 'Я' : tx.createdBy?.name || '—';
  const multi = (family.members || []).length > 1;
  const sign = isSave ? (tx.type === 'deposit' ? '+' : '−') : '';
  return html`<li>
    <button class="tx-row" onClick=${() => openTx({ tx })}>
      <span class="env-row__icon" style=${{ background: env.color + '22' }}>${env.icon}</span>
      <span class="tx-row__main">
        <span class="tx-row__name">${tx.note || env.name}</span>
        <span class="tx-row__meta muted">
          ${tx.note ? env.name : ''}${tx.note && (multi || showDate) ? ' · ' : ''}${multi ? who : ''}${multi && showDate ? ' · ' : ''}${showDate ? formatDay(tx.date, { short: true }) : ''}
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
  const { txs, envelopes, envById, today, family, user, since, loadEarlier } = useApp();
  const [envFilter, setEnvFilter] = useState('all');
  const [who, setWho] = useState('all');
  const members = Object.entries(family.memberNames || {});

  const filtered = useMemo(
    () =>
      txs.filter(
        (t) =>
          envById[t.envelopeId] &&
          (envFilter === 'all' || t.envelopeId === envFilter) &&
          (who === 'all' || t.createdBy?.uid === who),
      ),
    [txs, envFilter, who, envById],
  );

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
