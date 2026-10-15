// Вся математика бюджета. Чистые функции без доступа к хранилищу — их покрывают тесты.

import { makeISO, daysInMonth, daysBetween, addDays, parseISO } from './dates.js';

// День зарплаты в конкретном месяце. Если payday=31, а в месяце 30 дней, берём последний день.
function paydayIn(y, m, payday) {
  const norm = new Date(Date.UTC(y, m, 1));
  const yy = norm.getUTCFullYear();
  const mm = norm.getUTCMonth();
  return makeISO(yy, mm, Math.min(payday, daysInMonth(yy, mm)));
}

// Период «от зарплаты до зарплаты», в который попадает today.
// start включительно, end — день следующей зарплаты (не входит в период).
export function getPeriod(today, payday) {
  const t = new Date(parseISO(today));
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  let start = paydayIn(y, m, payday);
  let sm = m;
  if (today < start) {
    sm = m - 1;
    start = paydayIn(y, sm, payday);
  }
  const end = paydayIn(y, sm + 1, payday);
  return { start, end, days: daysBetween(start, end) };
}

export function previousPeriod(period, payday) {
  return getPeriod(addDays(period.start, -1), payday);
}

// Сумма трат по конверту за даты [from, to). to необязателен.
export function sumExpenses(txs, envelopeId, from, to) {
  let s = 0;
  for (const tx of txs) {
    if (tx.envelopeId !== envelopeId || tx.type !== 'expense') continue;
    if (from && tx.date < from) continue;
    if (to && tx.date >= to) continue;
    s += tx.amount;
  }
  return s;
}

// Дневной лимит для конверта типа «daily» (магазин).
// Лимит на сегодня считается от остатка на начало дня и в течение дня не меняется:
// покупка уменьшает «осталось сегодня», а не сам лимит.
export function dailyAllowance({ limit, txs, envelopeId, today, period }) {
  const daysLeft = Math.max(1, daysBetween(today, period.end));
  const spentBefore = sumExpenses(txs, envelopeId, period.start, today);
  const spentToday = sumExpenses(txs, envelopeId, today, addDays(today, 1));
  const availableAtDayStart = limit - spentBefore;
  const todayLimit = Math.floor(availableAtDayStart / daysLeft);
  const leftToday = todayLimit - spentToday;
  const remainingTotal = availableAtDayStart - spentToday;
  const tomorrow = daysLeft > 1 ? Math.floor(remainingTotal / (daysLeft - 1)) : null;
  // «Ровный» лимит на день, если бы все тратили одинаково. Для сравнения «идём лучше/хуже плана».
  const evenDaily = Math.floor(limit / period.days);

  let status = 'ok';
  if (todayLimit <= 0 || leftToday < 0) status = 'over';
  else if (leftToday < todayLimit * 0.3) status = 'warn';

  return {
    daysLeft,
    spentBefore,
    spentToday,
    spentTotal: spentBefore + spentToday,
    todayLimit,
    leftToday,
    remainingTotal,
    tomorrow,
    evenDaily,
    status,
  };
}

// Прогресс конверта с лимитом на период (бьюти, топливо…).
export function envelopeProgress({ limit, txs, envelopeId, period }) {
  const spent = sumExpenses(txs, envelopeId, period.start, period.end);
  const left = limit - spent;
  const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : spent > 0 ? 100 : 0;
  let status = 'ok';
  if (left < 0) status = 'over';
  else if (limit > 0 && left < limit * 0.15) status = 'warn';
  return { spent, left, percent, status };
}

// Трата «до начала учёта», когда бюджет создают посреди периода.
export function startingTransaction(user, envelopeId, { amount, date }) {
  return {
    envelopeId,
    amount,
    type: 'expense',
    note: 'Потрачено до начала учёта',
    date,
    createdBy: { uid: user.uid, name: user.name },
    createdAt: Date.now(),
  };
}

// Баланс копилки по операциям (пополнения минус снятия).
export function savingsDelta(tx) {
  return tx.type === 'deposit' ? tx.amount : -tx.amount;
}

export function savingsProgress({ balance = 0, goal = 0 }) {
  const percent = goal > 0 ? Math.min(100, Math.round((Math.max(0, balance) / goal) * 100)) : 0;
  return { balance, goal, percent, left: Math.max(0, goal - balance) };
}

// ── Доход и обязательные статьи ──
// План периода: { income, mandatory: {envelopeId: сумма}, free, mainEnvelopeId }.
// free = доход − обязательные статьи; это сумма на период для главного конверта с дневным лимитом.

// Главный конверт с дневным лимитом: из него тратятся свободные деньги.
export function mainDailyEnvelope(envelopes) {
  return envelopes.find((e) => e.kind === 'daily' && !e.archived) || null;
}

// Обязательные статьи: конверты «до зарплаты», прочие дневные конверты и копилки (сколько откладываем в месяц).
export function mandatoryEnvelopes(envelopes) {
  const main = mainDailyEnvelope(envelopes);
  return envelopes.filter((e) => !e.archived && e !== main && ['period', 'daily', 'savings'].includes(e.kind));
}

export function mandatoryAmount(env) {
  return env.kind === 'savings' ? env.monthly || 0 : env.limit || 0;
}

export function planPeriod({ income, mandatory, days }) {
  const mandatoryTotal = Object.values(mandatory).reduce((s, v) => s + v, 0);
  const free = income - mandatoryTotal;
  return { mandatoryTotal, free, perDay: days > 0 ? Math.floor(Math.max(0, free) / days) : 0 };
}

// Новый план по доходу и текущим суммам конвертов (amounts переопределяет суммы, если заданы).
export function buildPlan({ income, envelopes, amounts = {} }) {
  const mandatory = {};
  for (const e of mandatoryEnvelopes(envelopes)) mandatory[e.id] = amounts[e.id] ?? mandatoryAmount(e);
  const { free } = planPeriod({ income, mandatory, days: 1 });
  return { income, mandatory, free, mainEnvelopeId: mainDailyEnvelope(envelopes)?.id || null };
}

// План, который создаётся вместе с семейным бюджетом на первом запуске.
export function initialPlan(user, income, envelopes) {
  return { ...buildPlan({ income, envelopes }), createdBy: { uid: user.uid, name: user.name }, createdAt: Date.now() };
}

// Конверт изменили, добавили или скрыли посреди периода: поправить его сумму в плане и пересчитать свободное.
export function applyEnvelopeToPlan(plan, env) {
  if (!plan || env.id === plan.mainEnvelopeId) return plan;
  const mandatory = { ...plan.mandatory };
  if (env.archived || !['period', 'daily', 'savings'].includes(env.kind)) delete mandatory[env.id];
  else mandatory[env.id] = mandatoryAmount(env);
  const { free } = planPeriod({ income: plan.income, mandatory, days: 1 });
  return { ...plan, mandatory, free };
}

// Сумма на период для конверта: из плана периода, а если дохода ещё нет — из настроек конверта.
export function envelopeLimit(env, plan) {
  if (plan) {
    if (env.id === plan.mainEnvelopeId) return plan.free;
    if (env.id in plan.mandatory) return plan.mandatory[env.id];
  }
  return env.limit || 0;
}

// Итоги закрытого периода по всем расходным конвертам (суммы берутся из плана того периода, если он есть).
export function periodSummary({ envelopes, txs, period, plan = null }) {
  const rows = envelopes
    .filter((e) => e.kind !== 'savings' && !e.archived)
    .map((e) => {
      const limit = envelopeLimit(e, plan);
      const spent = sumExpenses(txs, e.id, period.start, period.end);
      return { envelope: e, limit, spent, saved: limit - spent };
    });
  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  // Переводить в копилку имеет смысл только сэкономленное (перерасход не вычитаем из чужих конвертов).
  const totalSaved = rows.reduce((s, r) => s + Math.max(0, r.saved), 0);
  return { rows, totalLimit, totalSpent, totalSaved };
}
