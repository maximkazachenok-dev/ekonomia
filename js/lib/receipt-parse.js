// Разбор текста чека, считанного камерой iPhone («Сканировать текст»), в строки покупки.
// Формат белорусских кассовых чеков: название товара, рядом или строкой ниже «кол-во x цена» и сумма;
// скидка печатается под товаром отдельной строкой и вычитается из его суммы; в конце «ИТОГО».
import { formatAmount } from './money.js';

const LONG_RECEIPT = 25;

// Цены в чеке всегда с двумя знаками после запятой; «1.000» (количество) ценой не считается.
const MONEY = /-?\d{1,6}[.,]\d{2}(?!\d)/g;
const MULT = /(\d+(?:[.,]\d+)?)\s*[xх*×]\s*(\d{1,6}[.,]\d{2})(?!\d)/i;

const toKop = (s) => Math.round(Math.abs(Number(s.replace(',', '.'))) * 100);
const words = (line) => line.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я]+/g) || [];

const TOTAL_START = /^\s*(итого|итог|всего|к\s*оплате|сумма\s*к\s*оплате)/i;
const DISCOUNT_STEMS = ['скидк', 'дисконт', 'discount'];
// Служебные строки: целые слова (чтобы «картофель» не принять за «карта») и начала слов
const SERVICE_WORDS = new Set(['унп', 'касса', 'кассир', 'смена', 'чек', 'чека', 'ндс', 'сдача', 'карта', 'картой', 'карты', 'ккм', 'рн', 'фн', 'тел', 'адрес', 'код', 'итог', 'ооо', 'оао', 'зао', 'одо', 'чуп', 'уп', 'ип', 'ул', 'пр']);
const SERVICE_STEMS = ['наличн', 'безнал', 'оплат', 'спасибо', 'покупк', 'терминал', 'авторизац', 'кассов', 'фискал', 'регистрац', 'магазин', 'гипермаркет', 'супермаркет'];
const UNIT_WORDS = new Set(['x', 'х', 'шт', 'кг', 'г', 'л', 'уп', 'руб', 'р', 'byn', 'br']);

const isTotal = (line) => TOTAL_START.test(line);
const isDiscount = (line) => words(line).some((w) => DISCOUNT_STEMS.some((s) => w.startsWith(s)));
const isService = (line) =>
  /\d{2}[./]\d{2}[./]\d{2,4}/.test(line) ||
  /\d{1,2}:\d{2}/.test(line) ||
  words(line).some((w) => SERVICE_WORDS.has(w) || SERVICE_STEMS.some((s) => w.startsWith(s)));
// Есть ли в строке слова, кроме единиц измерения: значит, это название товара
const hasName = (line) => words(line).some((w) => w.length > 1 && !UNIT_WORDS.has(w));

// Сумма позиции в строке: «кол-во x цена» без итога — перемножаем, иначе последнее число-цена.
function linePrice(line) {
  const all = line.match(MONEY);
  if (!all) return null;
  const m = line.match(MULT);
  if (m) {
    const after = line.slice(m.index + m[0].length);
    if (!after.match(MONEY)) {
      const qty = Number(m[1].replace(',', '.'));
      return Math.round(qty * toKop(m[2]));
    }
  }
  return toKop(all[all.length - 1]);
}

// Название: строка до количества или цены, без кода товара в начале.
function cleanName(line, capitalize = true) {
  let s = line;
  const cut = s.search(/\s\d+(?:[.,]\d+)?\s*[xх*×]\s*\d|\s-?\d{1,6}[.,]\d{2}(?!\d)/i);
  if (cut > 0) s = s.slice(0, cut);
  s = s
    .replace(/^\s*(\d{3,}|\d{1,2}[.)])\s+/, '')
    .replace(/[\s=*:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s && capitalize ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const money = (kop) => `${formatAmount(kop, { forceKop: true }).replace(/ /g, ' ')} р.`;

// text → { items: [{ name, amount }], total, warnings: [] }; суммы в копейках.
export function parseReceipt(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  const warnings = [];
  let pending = null; // название без цены: цена будет строкой ниже
  let pendingDiscount = false; // «Скидка» без суммы: сумма строкой ниже
  let total = null;

  const applyDiscount = (kop) => {
    const target = items[items.length - 1];
    if (!target || !kop) return;
    target.amount = Math.max(0, target.amount - kop);
  };

  for (const line of lines) {
    if (isTotal(line)) {
      const all = line.match(MONEY);
      total = all ? toKop(all[all.length - 1]) : null;
      break;
    }
    if (isDiscount(line)) {
      const p = linePrice(line);
      if (p === null) pendingDiscount = true;
      else applyDiscount(p);
      continue;
    }
    const named = hasName(line);
    const price = linePrice(line);
    if (pendingDiscount && !named && price !== null) {
      applyDiscount(price);
      pendingDiscount = false;
      continue;
    }
    pendingDiscount = false;
    // «-0,50» отдельной строкой — тоже скидка на товар выше
    if (!named && price !== null && /^\s*-/.test(line)) {
      applyDiscount(price);
      continue;
    }
    if (isService(line)) {
      pending = null;
      continue;
    }
    if (named) {
      const name = cleanName(line, !pending);
      if (!name) continue;
      if (price !== null) {
        items.push({ name: pending ? `${pending} ${name}` : name, amount: price });
        pending = null;
      } else {
        // Длинное название переносится на вторую строку
        pending = pending ? `${pending} ${name}` : name;
      }
    } else if (price !== null && pending) {
      items.push({ name: pending, amount: price });
      pending = null;
    }
  }

  const sum = items.reduce((s, it) => s + it.amount, 0);
  if (!items.length) {
    warnings.push('Не удалось найти товары в тексте. Внесите покупку вручную или отсканируйте чек ещё раз.');
  } else {
    if (items.length > LONG_RECEIPT) {
      warnings.push(`Чек длинный (${items.length} позиций): распознавание может ошибаться. Проверьте каждую строку или внесите покупку вручную.`);
    }
    if (total === null) {
      warnings.push('Не нашёл строку «ИТОГО» — сверьте сумму с чеком.');
    } else if (total !== sum) {
      warnings.push(`Сумма товаров ${money(sum)} не совпадает с итогом чека ${money(total)} (разница ${money(Math.abs(total - sum))}). Проверьте строки.`);
    }
  }
  return { items, total, warnings };
}
