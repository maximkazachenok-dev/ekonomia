// Все суммы — целые копейки. Так не бывает ошибок вида 0.1 + 0.2.

export const CURRENCIES = {
  BYN: { label: 'BYN', symbol: 'р.' },
  RUB: { label: 'RUB', symbol: '₽' },
  USD: { label: 'USD', symbol: '$' },
  EUR: { label: 'EUR', symbol: '€' },
};

export function currencySymbol(code) {
  return (CURRENCIES[code] || CURRENCIES.BYN).symbol;
}

// «1 234,50» / «1 234» (копейки скрываем, если их нет)
export function formatAmount(kop, { forceKop = false } = {}) {
  const sign = kop < 0 ? '−' : '';
  const abs = Math.abs(Math.round(kop));
  const rub = Math.floor(abs / 100);
  const k = abs % 100;
  const rubStr = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + rubStr + (k || forceKop ? ',' + String(k).padStart(2, '0') : '');
}

export function formatMoney(kop, currency = 'BYN', opts) {
  return `${formatAmount(kop, opts)} ${currencySymbol(currency)}`;
}

// «12,5» / «12.50» / «1 200» → копейки. Неверный ввод → NaN.
export function parseAmount(str) {
  if (typeof str === 'number') return Math.round(str * 100);
  const s = String(str).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const [r, k = ''] = s.split('.');
  return Number(r) * 100 + Number(k.padEnd(2, '0'));
}

// Копейки → строка для поля ввода: 125050 → «1250,5»
export function toInputString(kop) {
  if (!kop) return '';
  const r = Math.floor(kop / 100);
  const k = kop % 100;
  if (!k) return String(r);
  return `${r},${String(k).padStart(2, '0').replace(/0$/, '')}`;
}
