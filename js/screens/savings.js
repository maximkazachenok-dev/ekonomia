import { html } from '../lib/preact.js';
import { useApp, Money, ProgressBar } from '../ui/common.js';
import { savingsProgress } from '../lib/budget.js';
import { TxRow } from './history.js';

export function SavingsScreen() {
  const { envelopes, txs, openTx, openEnvelope } = useApp();
  const savings = envelopes.filter((e) => e.kind === 'savings' && !e.archived);
  const total = savings.reduce((s, e) => s + (e.balance || 0), 0);

  return html`<div class="screen">
    <header class="screen__head">
      <div>
        <p class="eyebrow">Всего отложено</p>
        <h1 class="screen__title"><${Money} kop=${total} /></h1>
      </div>
    </header>

    ${savings.length === 0 &&
    html`<p class="empty">Копилка — это цель: отпуск, ремонт машины, подушка безопасности.<br />Создайте первую.</p>`}

    ${savings.map((e) => {
      const s = savingsProgress(e);
      const ops = txs.filter((t) => t.envelopeId === e.id).slice(0, 5);
      return html`<section class="card" key=${e.id} style=${{ '--env': e.color }}>
        <div class="goal">
          <span class="goal__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
          <div class="goal__main">
            <button class="goal__name" onClick=${() => openEnvelope(e)}>${e.name}</button>
            <div class="goal__balance"><${Money} kop=${s.balance} /></div>
            ${s.goal > 0 && html`<div class="muted">цель <${Money} kop=${s.goal} /> · осталось <${Money} kop=${s.left} /></div>`}
          </div>
          ${s.goal > 0 && html`<div class="goal__pct">${s.percent}%</div>`}
        </div>
        ${s.goal > 0 && html`<${ProgressBar} percent=${s.percent} status="save" />`}
        <div class="goal__actions">
          <button class="btn btn--primary btn--grow" onClick=${() => openTx({ envelopeId: e.id, type: 'deposit' })}>Отложить</button>
          <button class="btn btn--ghost btn--grow" onClick=${() => openTx({ envelopeId: e.id, type: 'expense' })} disabled=${s.balance <= 0}>Взять</button>
        </div>
        ${ops.length > 0 && html`<ul class="tx-list tx-list--inset">${ops.map((t) => html`<${TxRow} key=${t.id} tx=${t} showDate />`)}</ul>`}
      </section>`;
    })}

    <button class="btn btn--ghost btn--block" onClick=${() => openEnvelope({ kind: 'savings' })}>+ Новая копилка</button>
  </div>`;
}
