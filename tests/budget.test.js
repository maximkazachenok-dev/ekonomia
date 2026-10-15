// Запуск: jsc -m tests/budget.test.js  (или открыть tests/index.html в браузере)
import {
  getPeriod, previousPeriod, dailyAllowance, envelopeProgress, periodSummary, sumExpenses,
  mainDailyEnvelope, mandatoryEnvelopes, planPeriod, buildPlan, applyEnvelopeToPlan, envelopeLimit,
} from '../js/lib/budget.js';
import { parseAmount, formatAmount, toInputString } from '../js/lib/money.js';
import { pluralDays, addDays, daysBetween } from '../js/lib/dates.js';

const out = typeof print === 'function' ? print : (...a) => console.log(...a);
let passed = 0;
let failed = 0;

function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    out(`✗ ${name}\n    ожидали: ${e}\n    получили: ${a}`);
  }
}

const tx = (date, amount, envelopeId = 'shop', type = 'expense') => ({ date, amount, envelopeId, type });

// ── Периоды ──
eq(getPeriod('2026-10-14', 10), { start: '2026-10-10', end: '2026-11-10', days: 31 }, 'период: середина месяца');
eq(getPeriod('2026-10-10', 10), { start: '2026-10-10', end: '2026-11-10', days: 31 }, 'период: день зарплаты — начало нового');
eq(getPeriod('2026-10-09', 10), { start: '2026-09-10', end: '2026-10-10', days: 30 }, 'период: накануне зарплаты');
eq(getPeriod('2027-01-05', 10), { start: '2026-12-10', end: '2027-01-10', days: 31 }, 'период: через Новый год');
eq(getPeriod('2026-12-20', 10), { start: '2026-12-10', end: '2027-01-10', days: 31 }, 'период: декабрь → январь');
eq(getPeriod('2027-02-28', 31), { start: '2027-02-28', end: '2027-03-31', days: 31 }, 'payday=31: в феврале последний день');
eq(getPeriod('2027-02-15', 31), { start: '2027-01-31', end: '2027-02-28', days: 28 }, 'payday=31: январь → февраль');
eq(getPeriod('2026-11-30', 31), { start: '2026-11-30', end: '2026-12-31', days: 31 }, 'payday=31: 30-дневный месяц');
eq(getPeriod('2028-02-29', 30), { start: '2028-02-29', end: '2028-03-30', days: 30 }, 'payday=30: високосный февраль');
eq(getPeriod('2028-02-20', 30), { start: '2028-01-30', end: '2028-02-29', days: 30 }, 'payday=30: до конца февраля');
eq(getPeriod('2026-10-01', 1), { start: '2026-10-01', end: '2026-11-01', days: 31 }, 'payday=1');
eq(previousPeriod(getPeriod('2026-10-14', 10), 10), { start: '2026-09-10', end: '2026-10-10', days: 30 }, 'предыдущий период');

// ── Дневной лимит ──
const period = getPeriod('2026-10-10', 10); // 31 день
const limit = 100000; // 1000 р.

let r = dailyAllowance({ limit, txs: [], envelopeId: 'shop', today: '2026-10-10', period });
eq(r.daysLeft, 31, 'дней осталось в первый день');
eq(r.todayLimit, Math.floor(100000 / 31), 'лимит в первый день = 1000/31');
eq(r.status, 'ok', 'статус ok без трат');

// Покупка сегодня не меняет «лимит на сегодня», только «осталось сегодня»
r = dailyAllowance({ limit, txs: [tx('2026-10-10', 2000)], envelopeId: 'shop', today: '2026-10-10', period });
eq(r.todayLimit, 3225, 'лимит на сегодня не сдвигается после покупки');
eq(r.leftToday, 1225, 'осталось сегодня = лимит − покупка');
eq(r.status, 'ok', 'осталось 38% — ok');
eq(r.tomorrow, Math.floor((100000 - 2000) / 30), 'прогноз на завтра');

// Сэкономили вчера → сегодня можно больше
r = dailyAllowance({ limit, txs: [tx('2026-10-10', 1000)], envelopeId: 'shop', today: '2026-10-11', period });
eq(r.todayLimit, Math.floor(99000 / 30), 'экономия вчера увеличила лимит сегодня');
eq(r.todayLimit > Math.floor(100000 / 31), true, 'лимит вырос');

// Перерасход вчера → сегодня меньше
r = dailyAllowance({ limit, txs: [tx('2026-10-10', 10000)], envelopeId: 'shop', today: '2026-10-11', period });
eq(r.todayLimit, 3000, 'перерасход вчера уменьшил лимит');

// Перерасход сегодня
r = dailyAllowance({ limit, txs: [tx('2026-10-14', 5000)], envelopeId: 'shop', today: '2026-10-14', period });
eq(r.status, 'over', 'перерасход за день → over');
eq(r.leftToday < 0, true, 'осталось сегодня отрицательное');

// Почти исчерпан
r = dailyAllowance({ limit, txs: [tx('2026-10-10', 2500)], envelopeId: 'shop', today: '2026-10-10', period });
eq(r.status, 'warn', 'осталось меньше 30% → warn');

// Последний день периода
r = dailyAllowance({ limit, txs: [tx('2026-10-15', 90000)], envelopeId: 'shop', today: '2026-11-09', period });
eq(r.daysLeft, 1, 'последний день: 1 день');
eq(r.todayLimit, 10000, 'последний день: весь остаток');
eq(r.tomorrow, null, 'последний день: прогноза нет');

// Весь бюджет исчерпан
r = dailyAllowance({ limit, txs: [tx('2026-10-12', 120000)], envelopeId: 'shop', today: '2026-10-20', period });
eq(r.status, 'over', 'бюджет исчерпан → over');
eq(r.remainingTotal, -20000, 'остаток отрицательный');

// Траты других конвертов, пополнения и прошлых периодов не учитываются
r = dailyAllowance({
  limit,
  txs: [tx('2026-10-11', 5000, 'fuel'), tx('2026-10-11', 5000, 'shop', 'deposit'), tx('2026-10-05', 5000)],
  envelopeId: 'shop', today: '2026-10-12', period,
});
eq(r.spentTotal, 0, 'чужие траты не учитываются');

// ── Конверты на период ──
let p = envelopeProgress({ limit: 20000, txs: [tx('2026-10-12', 5000, 'beauty')], envelopeId: 'beauty', period });
eq(p, { spent: 5000, left: 15000, percent: 25, status: 'ok' }, 'конверт: 25%');
p = envelopeProgress({ limit: 20000, txs: [tx('2026-10-12', 18000, 'beauty')], envelopeId: 'beauty', period });
eq(p.status, 'warn', 'конверт: почти исчерпан');
p = envelopeProgress({ limit: 20000, txs: [tx('2026-10-12', 25000, 'beauty')], envelopeId: 'beauty', period });
eq([p.status, p.percent, p.left], ['over', 100, -5000], 'конверт: перерасход');
p = envelopeProgress({ limit: 0, txs: [], envelopeId: 'beauty', period });
eq(p.percent, 0, 'конверт без лимита и трат');

// ── Итоги периода ──
const envs = [
  { id: 'shop', kind: 'daily', limit: 100000 },
  { id: 'fuel', kind: 'period', limit: 30000 },
  { id: 'save', kind: 'savings', limit: 0 },
];
const s = periodSummary({ envelopes: envs, txs: [tx('2026-10-11', 80000), tx('2026-10-11', 35000, 'fuel')], period });
eq([s.totalLimit, s.totalSpent, s.totalSaved], [130000, 115000, 20000], 'итоги: экономия без учёта перерасхода');
eq(s.rows.length, 2, 'итоги: копилки не входят');

eq(sumExpenses([tx('2026-10-10', 1), tx('2026-11-10', 1)], 'shop', period.start, period.end), 1, 'end не входит в период');

// ── Деньги ──
eq(parseAmount('12,5'), 1250, 'парсинг 12,5');
eq(parseAmount('12.05'), 1205, 'парсинг 12.05');
eq(parseAmount('1 200'), 120000, 'парсинг с пробелом');
eq(parseAmount('0,99'), 99, 'парсинг 0,99');
eq(Number.isNaN(parseAmount('12,345')), true, 'три знака после запятой — ошибка');
eq(Number.isNaN(parseAmount('abc')), true, 'буквы — ошибка');
eq(formatAmount(123450), '1 234,50', 'формат с копейками');
eq(formatAmount(100000), '1 000', 'формат без копеек');
eq(formatAmount(-500), '−5', 'формат отрицательный');
eq(toInputString(125050), '1250,5', 'в поле ввода');
eq(toInputString(125005), '1250,05', 'в поле ввода с 05');

// ── Даты ──
eq([pluralDays(1), pluralDays(3), pluralDays(5), pluralDays(11), pluralDays(21), pluralDays(22)],
  ['1 день', '3 дня', '5 дней', '11 дней', '21 день', '22 дня'], 'склонение дней');
eq(addDays('2026-03-28', 2), '2026-03-30', 'переход на летнее время не ломает дни');
eq(daysBetween('2026-10-25', '2026-10-26'), 1, 'переход на зимнее время');

// ── Доход и обязательные статьи ──
const envs2 = [
  { id: 'shop', kind: 'daily', limit: 100000, name: 'Покупки' },
  { id: 'beauty', kind: 'period', limit: 30000 },
  { id: 'fuel', kind: 'period', limit: 40000 },
  { id: 'rest', kind: 'period', limit: 20000 },
  { id: 'save', kind: 'savings', monthly: 300000, goal: 1000000 },
  { id: 'old', kind: 'period', limit: 99900, archived: true },
];
eq(mainDailyEnvelope(envs2).id, 'shop', 'главный дневной конверт');
eq(mandatoryEnvelopes(envs2).map((e) => e.id), ['beauty', 'fuel', 'rest', 'save'], 'обязательные: без главного и скрытых');

// Пример владельца: доход 5000, обязательные 300 + 400 + 200 + 3000 = 3900 → свободно 1100
let plan = buildPlan({ income: 500000, envelopes: envs2 });
eq(plan, { income: 500000, mandatory: { beauty: 30000, fuel: 40000, rest: 20000, save: 300000 }, free: 110000, mainEnvelopeId: 'shop' }, 'план: свободно = доход − обязательные');
eq(planPeriod({ income: 500000, mandatory: plan.mandatory, days: 31 }), { mandatoryTotal: 390000, free: 110000, perDay: 3548 }, 'в среднем ≈ 35,48 в день на 31 день');
eq(buildPlan({ income: 500000, envelopes: envs2, amounts: { beauty: 50000 } }).free, 90000, 'исправленная сумма статьи учитывается');
eq(planPeriod({ income: 300000, mandatory: plan.mandatory, days: 31 }).perDay, 0, 'обязательные больше дохода: в день 0');
eq(planPeriod({ income: 300000, mandatory: plan.mandatory, days: 31 }).free, -90000, 'обязательные больше дохода: свободно с минусом');

// Сумма на период для конверта
eq(envelopeLimit(envs2[0], plan), 110000, 'дневной конверт получает свободные деньги');
eq(envelopeLimit(envs2[1], plan), 30000, 'статья — из плана');
eq(envelopeLimit(envs2[0], null), 100000, 'без дохода — старая сумма конверта');
eq(envelopeLimit({ id: 'new', kind: 'period', limit: 5000 }, plan), 5000, 'статья не из плана — сумма конверта');

// Правка статьи посреди периода
eq(applyEnvelopeToPlan(plan, { ...envs2[1], limit: 50000 }).free, 90000, 'статья выросла — свободных меньше');
eq(applyEnvelopeToPlan(plan, { ...envs2[1], archived: true }).free, 140000, 'статью скрыли — свободных больше');
eq(applyEnvelopeToPlan(plan, { id: 'pharm', kind: 'period', limit: 10000 }).free, 100000, 'новая статья вычитается');
eq(applyEnvelopeToPlan(plan, { ...envs2[0], limit: 1 }), plan, 'главный конверт план не меняет');
eq(applyEnvelopeToPlan(null, envs2[1]), null, 'без плана ничего не делаем');

// Итоги берут суммы из плана того периода
const sum2 = periodSummary({ envelopes: envs2, txs: [tx('2026-10-11', 100000), tx('2026-10-12', 10000, 'beauty')], period, plan });
eq(sum2.rows.map((r) => [r.envelope.id, r.limit, r.saved]), [['shop', 110000, 10000], ['beauty', 30000, 20000], ['fuel', 40000, 40000], ['rest', 20000, 20000]], 'итоги по плану периода');

out(`\n${failed ? '✗' : '✓'} Пройдено: ${passed}, упало: ${failed}`);
if (typeof globalThis.__testResult === 'function') globalThis.__testResult(passed, failed);
// Node (GitHub Actions): ненулевой код выхода, чтобы проверка на GitHub покраснела
if (failed && typeof process !== 'undefined') process.exitCode = 1;
