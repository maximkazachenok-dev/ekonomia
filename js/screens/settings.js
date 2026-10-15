import { html, useState } from '../lib/preact.js';
import { useApp, Icon, KIND_LABELS, showToast, Money } from '../ui/common.js';
import { CURRENCIES, formatAmount } from '../lib/money.js';
import { envelopeLimit } from '../lib/budget.js';

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCsv({ backend, fid, envById, family, today }) {
  const txs = await backend.fetchAllTransactions(fid);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Дата', 'Конверт', 'Тип', 'Сумма', 'Заметка', 'Кто'].join(';')];
  for (const t of txs) {
    const env = envById[t.envelopeId];
    const type = env?.kind === 'savings' ? (t.type === 'deposit' ? 'Отложено' : 'Взято из копилки') : 'Трата';
    rows.push([t.date, esc(env?.name || '—'), type, formatAmount(t.amount, { forceKop: true }).replace(/ /g, ''), esc(t.note), esc(t.createdBy?.name)].join(';'));
  }
  // BOM, чтобы Excel правильно открыл кириллицу
  downloadFile(`budget-${today}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

export function SettingsScreen() {
  const app = useApp();
  const { backend, family, fid, envelopes, user, openEnvelope, updateFamily, plan, openIncome } = app;
  const [showArchived, setShowArchived] = useState(false);
  const isCloud = backend.mode === 'cloud';
  const members = Object.entries(family.memberNames || {});
  const visible = envelopes.filter((e) => showArchived || !e.archived);
  const archivedCount = envelopes.filter((e) => e.archived).length;

  const shareInvite = async () => {
    const text = `Присоединяйся к нашему бюджету «${family.name}». Открой ${location.origin}${location.pathname} и введи код: ${family.inviteCode}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('Приглашение скопировано');
      }
    } catch {
      /* пользователь закрыл окно «Поделиться» */
    }
  };

  return html`<div class="screen">
    <header class="screen__head"><h1 class="screen__title">Настройки</h1></header>

    <section class="card">
      <h2 class="card__title">Семья</h2>
      <label class="field">
        <span class="field__label">Название</span>
        <input class="input" value=${family.name} onChange=${(e) => e.target.value.trim() && updateFamily({ name: e.target.value.trim() })} maxlength="30" />
      </label>
      ${isCloud
        ? html`<div class="field">
              <span class="field__label">Участники</span>
              <ul class="members">
                ${members.map(([uid, name]) => html`<li>${name}${uid === user.uid ? html` <span class="muted">(вы)</span>` : ''}</li>`)}
              </ul>
            </div>
            <div class="invite">
              <div>
                <span class="field__label">Код приглашения</span>
                <div class="invite__code">${family.inviteCode}</div>
                <p class="field__hint">Жена (или муж) входит в приложение под своим email и вводит этот код. Траты будут видны обоим.</p>
              </div>
              <button class="btn btn--primary" onClick=${shareInvite}>${Icon.share} Отправить</button>
            </div>`
        : html`<div class="notice">
            <span class="notice__icon">${Icon.cloudOff}</span>
            <div>
              <strong>Локальный режим</strong>
              <p>Данные хранятся только на этом устройстве. Чтобы вести общий бюджет с женой с двух телефонов, подключите бесплатный Firebase: пошаговая инструкция в файле README.md.</p>
            </div>
          </div>`}
    </section>

    <section class="card">
      <h2 class="card__title">Бюджет</h2>
      <div class="field field--row">
        <span class="field__label">
          Доход на период${plan ? html`: <${Money} kop=${plan.income} />, свободно <${Money} kop=${plan.free} />` : ': не введён'}
        </span>
        <button class="btn btn--ghost" onClick=${openIncome}>${plan ? 'Изменить' : 'Ввести'}</button>
      </div>
      <label class="field field--row">
        <span class="field__label">День зарплаты</span>
        <select class="input input--select" value=${family.payday} onChange=${(e) => updateFamily({ payday: Number(e.target.value) })}>
          ${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => html`<option value=${d}>${d}-е число</option>`)}
        </select>
      </label>
      <label class="field field--row">
        <span class="field__label">Валюта</span>
        <select class="input input--select" value=${family.currency} onChange=${(e) => updateFamily({ currency: e.target.value })}>
          ${Object.keys(CURRENCIES).map((c) => html`<option value=${c}>${c} (${CURRENCIES[c].symbol})</option>`)}
        </select>
      </label>
    </section>

    <section class="card card--flush">
      <div class="card__title-row card__pad">
        <h2 class="card__title">Конверты</h2>
        <button class="link-btn" onClick=${() => openEnvelope({ kind: 'period' })}>+ Добавить</button>
      </div>
      <ul class="env-list">
        ${visible.map(
          (e) => html`<li key=${e.id}>
            <button class=${`env-row ${e.archived ? 'env-row--archived' : ''}`} onClick=${() => openEnvelope(e)}>
              <span class="env-row__icon" style=${{ background: e.color + '22' }}>${e.icon}</span>
              <span class="env-row__main">
                <span class="env-row__name">${e.name}${e.archived ? ' (скрыт)' : ''}</span>
                <span class="env-row__sub muted">
                  ${KIND_LABELS[e.kind]} ·
                  ${e.kind === 'savings'
                    ? html` в месяц <${Money} kop=${e.monthly || 0} />${e.goal ? html`, цель <${Money} kop=${e.goal} />` : ''}`
                    : plan && e.id === plan.mainEnvelopeId
                      ? ' из дохода'
                      : html` <${Money} kop=${envelopeLimit(e, plan)} />`}
                </span>
              </span>
              <span class="env-row__chev">${Icon.chevron}</span>
            </button>
          </li>`,
        )}
      </ul>
      ${archivedCount > 0 &&
      html`<button class="link-btn card__pad" onClick=${() => setShowArchived(!showArchived)}>
        ${showArchived ? 'Спрятать скрытые' : `Показать скрытые (${archivedCount})`}
      </button>`}
    </section>

    <section class="card">
      <h2 class="card__title">Данные</h2>
      <button class="btn btn--ghost btn--block" onClick=${() => exportCsv(app).catch((e) => showToast(e.message))}>Скачать все записи (CSV для Excel)</button>
      ${!isCloud &&
      html`<button class="btn btn--ghost btn--block" onClick=${() => downloadFile(`budget-backup-${app.today}.json`, JSON.stringify(backend.exportAll()), 'application/json')}>Резервная копия (JSON)</button>
        <label class="btn btn--ghost btn--block">
          Восстановить из копии
          <input type="file" accept="application/json" hidden onChange=${async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const data = JSON.parse(await file.text());
              if (!data.family || !data.envelopes) throw new Error();
              if (confirm('Заменить текущие данные данными из копии?')) backend.importAll(data);
            } catch {
              showToast('Это не файл резервной копии');
            }
            e.target.value = '';
          }} />
        </label>`}
    </section>

    ${isCloud &&
    html`<section class="card">
      <h2 class="card__title">Аккаунт</h2>
      <p class="muted">${user.name} · ${user.email}</p>
      <button class="btn btn--danger-ghost btn--block" onClick=${() => backend.signOut()}>Выйти</button>
    </section>`}

    <p class="footnote">Экономия денег · v1.0</p>
  </div>`;
}
