// Разбор фразы о покупке: «в Гиппо купили хлеб 3.5, молоко 2.8» →
// { shopId, date, items: [{name:'Хлеб', amount:350}, {name:'Молоко', amount:280}] }.
// Работает без сервера и нейросетей; всё, что не угадано, человек поправит на экране подтверждения.
import { addDays } from './dates.js';
import { shopName } from './budget.js';

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

// Слова, которые ничего не значат для покупки
const FILLER = new Set(['купил', 'купила', 'купили', 'взял', 'взяла', 'взяли', 'брали', 'покупка', 'покупки', 'потратил', 'потратила',
  'потратили', 'за', 'по', 'это', 'там', 'еще', 'и', 'а', 'также', 'сегодня', 'руб', 'рубль', 'рубля', 'рублей', 'р', 'бел', 'белорусских']);
const PREPOSITIONS = new Set(['в', 'во', 'из', 'у', 'на']);

// Числа словами: «три», «двадцать пять», «полтора», «три с половиной»
const UNITS = { ноль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19 };
const TENS = { двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 };
const HUNDREDS = { сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900 };
const isNumWord = (w) => w in UNITS || w in TENS || w in HUNDREDS;

// Расстояние Левенштейна: «гипо» и «гиппо» отличаются на 1
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Слово из фразы похоже на слово из названия: совпадение, падеж («соседей» — «соседи»), опечатка распознавания
function similar(word, name) {
  if (word === name) return true;
  if (name.length >= 4 && word.length >= 4) {
    const stem = name.slice(0, Math.max(4, name.length - 2));
    if (word.startsWith(stem)) return true;
  }
  return name.length >= 5 && distance(word, name) <= 1;
}

// «3.5», «3,50», «12» → копейки
function digitsToKop(tok) {
  const m = tok.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}

// Токены после нормализации: слова и числа, запятые — отдельные разделители
function tokenize(text) {
  let t = norm(text)
    // «2 рубля 10 копеек», «2 р 10 коп» → «2,10»
    .replace(/(\d+)\s*(?:рубл\S*|руб\.?|р\.?)\s+(\d{1,2})\s*(?:копе\S*|коп\.?)/g, (_, r, k) => `${r},${k.padStart(2, '0')}`)
    .replace(/(\d+)\s*(?:копе\S*|коп\.?)/g, (_, k) => `0,${k.padStart(2, '0')}`)
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2');
  t = t.replace(/[;:!?«»"()]/g, ',');
  return t
    .split(/(,)|\s+/)
    .filter((x) => x && x.trim())
    .map((x) => x.replace(/^[.\-–—]+|[.\-–—]+$/g, ''))
    .filter(Boolean);
}

// Читает число начиная с позиции i: цифрами или словами. Возвращает { kop, next } или null.
function readNumber(toks, i) {
  const direct = digitsToKop(toks[i]);
  if (direct !== null) {
    // «3.5 с половиной» не бывает; «2 с половиной» — бывает
    if (toks[i + 1] === 'с' && toks[i + 2]?.startsWith('половин')) return { kop: direct + 50, next: i + 3 };
    return { kop: direct, next: i + 1 };
  }
  if (toks[i] === 'полтора' || toks[i] === 'полторы') return { kop: 150, next: i + 1 };
  if (!isNumWord(toks[i])) return null;
  let rub = 0;
  let j = i;
  while (j < toks.length && isNumWord(toks[j])) {
    rub += UNITS[toks[j]] ?? TENS[toks[j]] ?? HUNDREDS[toks[j]];
    j++;
  }
  let kop = rub * 100;
  if (toks[j] === 'с' && toks[j + 1]?.startsWith('половин')) {
    kop += 50;
    j += 2;
  }
  return { kop, next: j };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Ищем раздел: все значимые слова названия (или большинство) встречаются во фразе
function findShop(toks, shops) {
  let best = null;
  for (const shop of shops) {
    const words = norm(shopName(shop)).split(/\s+/).filter((w) => w.length >= 3);
    if (!words.length) continue;
    const used = [];
    for (const w of words) {
      const idx = toks.findIndex((t, k) => !used.includes(k) && digitsToKop(t) === null && similar(t, w));
      if (idx >= 0) used.push(idx);
    }
    const need = Math.max(1, Math.ceil(words.length / 2));
    if (used.length >= need && (!best || used.length > best.used.length)) best = { shop, used };
  }
  return best;
}

export function parsePurchase(text, shops = [], today) {
  let toks = tokenize(text || '');
  let date = today;

  // Дата: «вчера», «позавчера»
  const dayShift = { позавчера: -2, вчера: -1 };
  for (const [w, shift] of Object.entries(dayShift)) {
    if (toks.includes(w)) {
      date = addDays(today, shift);
      toks = toks.filter((t) => t !== w);
    }
  }

  // Раздел
  const active = shops.filter((s) => !s.archived);
  const found = findShop(toks, active);
  let shopId = null;
  let shopGuess = null;
  if (found) {
    shopId = found.shop.id;
    const drop = new Set(found.used);
    // предлог перед названием тоже убираем: «в гиппо», «у соседей»
    for (const k of found.used) if (PREPOSITIONS.has(toks[k - 1])) drop.add(k - 1);
    toks = toks.filter((_, k) => !drop.has(k));
  } else {
    // «в евроопте …» — магазин, которого ещё нет: предложим создать
    const k = toks.findIndex((t, idx) => PREPOSITIONS.has(t) && idx <= 1 && toks[idx + 1] && digitsToKop(toks[idx + 1]) === null);
    if (k >= 0 && !isNumWord(toks[k + 1])) {
      shopGuess = capitalize(toks[k + 1]);
      toks = toks.filter((_, idx) => idx !== k && idx !== k + 1);
    }
  }

  // Позиции: слова до числа — название, число — цена
  const items = [];
  let name = [];
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    const num = readNumber(toks, i);
    if (num) {
      items.push({ name: name.join(' '), amount: num.kop });
      name = [];
      i = num.next;
      continue;
    }
    if (t === ',' || FILLER.has(t) || PREPOSITIONS.has(t)) {
      i++;
      continue;
    }
    name.push(t);
    i++;
  }
  if (name.length) items.push({ name: name.join(' '), amount: 0 }); // товар без цены — цену введут на экране подтверждения

  // Одно число без названия — это общая сумма покупки
  if (items.length === 1 && !items[0].name) return { shopId, shopGuess, date, items: [], total: items[0].amount };
  return {
    shopId,
    shopGuess,
    date,
    items: items.map((it) => ({ name: capitalize(it.name || 'Без названия'), amount: it.amount })),
    total: null,
  };
}
