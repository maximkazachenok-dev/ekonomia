// Разбор текста чека, скопированного «Живым текстом» iPhone, в строки покупки.
// Формат белорусских кассовых чеков: название товара, рядом или строкой ниже «кол-во x цена» и сумма;
// скидка печатается под товаром отдельной строкой и вычитается из его суммы; в конце «ИТОГО».
//
// Главная особенность «Живого текста»: он копирует чек по колонкам — сначала весь левый столбец
// (названия, «1 шт × 2,89», «Скидка», «ИТОГО»), потом весь правый столбец с суммами. Поэтому строки,
// которые ждут сумму, встают в очередь, а суммы, пришедшие отдельными строками, заполняют её по порядку.
// Если сумма напечатана в той же строке (или касса печатает её строкой ниже), очередь заполняется сразу.
import { formatAmount } from './money.js';

const LONG_RECEIPT = 25;

// Цена — число с двумя знаками после запятой; «1.000» (количество), «0,95л», «3,25%» ценой не считаются.
const MONEY = /[-−–]?\d{1,6}[.,]\d{2}(?!\d)/g;
const UNIT_AFTER = /^\s?(%|мл|кг|гр|г|л|шт|уп)(?![а-яa-z])/i;
const MULT = /(\d+(?:[.,]\d+)?)\s*(?:шт|кг|гр|г|л|уп)?\.?\s*[xх*×]\s*(\d{1,6}[.,]\d{2})(?!\d)/i;

const toKop = (s) => Math.round(Math.abs(Number(s.replace(/[−–]/, '-').replace(',', '.'))) * 100);

// Цены в строке (без объёмов и процентов), со знаком
function moneys(line) {
  const out = [];
  for (const m of line.matchAll(MONEY)) {
    if (UNIT_AFTER.test(line.slice(m.index + m[0].length))) continue;
    out.push({ kop: toKop(m[0]), negative: /^[-−–]/.test(m[0]), index: m.index });
  }
  return out;
}

// Латинские буквы, похожие на русские (распознавание путает «С» и «C»), — только для поиска служебных слов
const LATIN = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };
const words = (line) => line.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я]+/g) || [];
const ruWords = (line) => words(line).map((w) => (/[а-я]/.test(w) ? w.replace(/[a-z]/g, (c) => LATIN[c] || c) : w));

const TOTAL_WORDS = ['итого', 'итог', 'всего'];
const DISCOUNT_STEMS = ['скидк', 'дисконт', 'discount'];
// Служебные строки: целые слова (чтобы «картофель» не принять за «карта») и начала слов
const SERVICE_WORDS = new Set(['унп', 'касса', 'кассир', 'смена', 'чек', 'чека', 'ндс', 'сдача', 'карта', 'картой', 'карты', 'ккм', 'рн', 'фн', 'тел', 'адрес', 'код', 'ооо', 'оао', 'зао', 'одо', 'чуп', 'чтуп', 'уп', 'ип', 'ул', 'пр', 'n', 'no']);
const SERVICE_STEMS = ['наличн', 'безнал', 'оплат', 'спасибо', 'покупк', 'терминал', 'авторизац', 'кассов', 'фискал', 'регистрац', 'магазин', 'гипермаркет', 'супермаркет', 'банковск'];
const UNIT_WORDS = new Set(['x', 'х', 'шт', 'кг', 'г', 'гр', 'л', 'мл', 'уп', 'руб', 'р', 'byn', 'br']);

const isTotal = (line) => {
  const w = ruWords(line);
  return TOTAL_WORDS.includes(w[0]) || (w[0] === 'к' && w[1] === 'оплате') || (w[0] === 'сумма' && w.includes('оплате'));
};
const isDiscount = (line) => ruWords(line).some((w) => DISCOUNT_STEMS.some((s) => w.startsWith(s)));
const isService = (line) =>
  /\d{2}[./]\d{2}[./]\d{2,4}/.test(line) ||
  /\d{1,2}:\d{2}/.test(line) ||
  /^\s*(000|ooo)\s/i.test(line) || // «ООО», прочитанное цифрами
  ruWords(line).some((w) => SERVICE_WORDS.has(w) || SERVICE_STEMS.some((s) => w.startsWith(s)));
// Есть ли в строке слова, кроме единиц измерения: значит, это название товара
const hasName = (line) => words(line).some((w) => w.length > 1 && !UNIT_WORDS.has(w));
// Строка, где есть только сумма (так «Живой текст» отдаёт правый столбец)
const isAmountOnly = (line) => !hasName(line) && !MULT.test(line) && moneys(line).length > 0;

// «кол-во x цена»: сумма — итог после умножения, если напечатан, иначе произведение
function multAmount(line) {
  const m = line.match(MULT);
  if (!m) return null;
  const after = moneys(line.slice(m.index + m[0].length));
  if (after.length) return after[after.length - 1].kop;
  return Math.round(Number(m[1].replace(',', '.')) * toKop(m[2]));
}

// Название: строка до количества или цены, без кода товара в начале.
function cleanName(line) {
  let s = line;
  const cut = s.search(/\s\d+(?:[.,]\d+)?\s*(?:шт|кг|гр|г|л|уп)?\.?\s*[xх*×]\s*\d/i);
  if (cut > 0) s = s.slice(0, cut);
  const price = moneys(s).find((m) => m.index > 0);
  if (price) s = s.slice(0, price.index);
  s = s
    .replace(/^\s*(\d{3,}|\d{1,2}[.)])\s+/, '')
    .replace(/[\s=*:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Шапка чека (организация, УНП, магазин, кассир, номер, дата) — до последней служебной строки,
// которая стоит раньше первой строки с ценой, «кол-во x цена» или «ИТОГО».
function headerEnd(lines) {
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isTotal(l) || MULT.test(l) || (hasName(l) && moneys(l).length && !isService(l))) break;
    if (isService(l)) end = i;
  }
  return end;
}

const money = (kop) => `${formatAmount(kop, { forceKop: true }).replace(/ /g, ' ')} р.`;

// text → { items: [{ name, amount }], total, warnings: [] }; суммы в копейках.
export function parseReceipt(text) {
  const lines = String(text || '')
    .replace(/[−–]/g, '-')
    // На фото «Живой текст» иногда ставит пробел внутри цены: «1, 99», «1 ,99»
    .replace(/(\d)\s*([.,])\s+(\d{2})(?!\d)/g, '$1$2$3')
    .replace(/(\d)\s+([.,]\d{2})(?!\d)/g, '$1$2')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = []; // { name, amount: число или null, пока сумма не пришла }
  const slots = []; // очередь строк, ждущих сумму: { kind: 'item'|'mult'|'discount'|'total', item?, expected? }
  let total = null;
  let ended = false; // после «ИТОГО» новые товары не начинаются, но суммы из правого столбца ещё читаются

  const last = () => items[items.length - 1];
  const discount = (item, kop) => {
    if (item && kop) item.amount = Math.max(0, (item.amount || 0) - kop);
  };
  const dropItemSlot = (item) => {
    const i = slots.findIndex((s) => s.kind === 'item' && s.item === item);
    if (i >= 0) slots.splice(i, 1);
  };

  // Сумма отдельной строкой: заполняет первую ждущую строку
  const takeAmount = ({ kop, negative }) => {
    // «кол-во x цена» уже посчитано: его сумма в правом столбце либо совпадает, либо её там нет
    while (slots.length && slots[0].kind === 'mult' && slots[0].expected !== kop) slots.shift();
    const slot = negative ? slots.find((s) => s.kind === 'discount') || slots[0] : slots[0];
    if (!slot) {
      if (negative) discount(last(), kop); // «-0,70» под товаром
      // Сумма без названия до «ИТОГО»: название товара не распозналось — строка, чтобы вписать вручную
      else if (!ended && total === null) items.push({ name: 'Без названия', amount: kop });
      return;
    }
    slots.splice(slots.indexOf(slot), 1);
    if (slot.kind === 'total') total = kop;
    else if (slot.kind === 'discount' || negative) discount(slot.item || last(), kop);
    else if (slot.kind === 'item') slot.item.amount = kop;
  };

  const start = headerEnd(lines) + 1;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const prices = moneys(line);

    if (isAmountOnly(line)) {
      takeAmount(prices[prices.length - 1]);
      continue;
    }
    if (ended) continue;

    if (isTotal(line)) {
      if (prices.length) total = prices[prices.length - 1].kop;
      else slots.push({ kind: 'total' });
      ended = true;
      continue;
    }
    if (isDiscount(line)) {
      if (prices.length) discount(last(), prices[prices.length - 1].kop);
      else slots.push({ kind: 'discount', item: last() });
      continue;
    }
    if (isService(line)) continue;

    const mult = multAmount(line);
    if (!hasName(line)) {
      // «1 шт × 2,89» под названием товара
      if (mult !== null && last()) {
        last().amount = mult;
        dropItemSlot(last());
        slots.push({ kind: 'mult', expected: mult });
      }
      continue;
    }

    // Перенос длинного названия: продолжение начинается с маленькой буквы
    const cur = last();
    if (/^[а-яёa-z]/.test(line) && cur && cur.amount === null && mult === null && !prices.length) {
      cur.name = `${cur.name} ${line.replace(/\s+/g, ' ')}`;
      continue;
    }

    const name = cleanName(line);
    if (!name) continue;
    const item = { name, amount: null };
    items.push(item);
    if (mult !== null) {
      item.amount = mult;
      slots.push({ kind: 'mult', expected: mult });
    } else if (prices.length) {
      item.amount = prices[prices.length - 1].kop;
    } else {
      slots.push({ kind: 'item', item });
    }
  }

  // Товары без суммы: если нашлась хоть одна сумма — оставляем с пустой ценой, чтобы дописать вручную
  const priced = items.filter((it) => it.amount !== null);
  const result = priced.length ? items.map((it) => ({ name: it.name, amount: it.amount ?? 0 })) : [];
  const unpriced = result.filter((it) => !it.amount).length;

  const warnings = [];
  const sum = result.reduce((s, it) => s + it.amount, 0);
  if (!result.length) {
    warnings.push('Не удалось найти товары с ценами. Скопируйте чек ещё раз целиком (в Камере: значок текста → «Выбрать все» → «Скопировать») или внесите покупку вручную.');
  } else {
    if (result.length > LONG_RECEIPT) {
      warnings.push(`Чек длинный (${result.length} позиций): распознавание может ошибаться. Проверьте каждую строку или внесите покупку вручную.`);
    }
    if (unpriced) warnings.push(`У ${unpriced} ${unpriced === 1 ? 'товара' : 'товаров'} не нашлась цена — впишите её вручную.`);
    if (total === null) {
      warnings.push('Не нашёл строку «ИТОГО» — сверьте сумму с чеком.');
    } else if (total !== sum) {
      warnings.push(`Сумма товаров ${money(sum)} не совпадает с итогом чека ${money(total)} (разница ${money(Math.abs(total - sum))}). Проверьте строки.`);
    }
  }
  return { items: result, total, warnings };
}
