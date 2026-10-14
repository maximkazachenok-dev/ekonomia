// Даты храним строками 'YYYY-MM-DD'. Арифметика в UTC, чтобы переход на летнее время не сдвигал дни.

const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeISO(y, m, d) {
  // m — индекс месяца с 0, может выходить за 0..11
  return toISO(Date.UTC(y, m, d));
}

// Сегодняшняя дата по местному времени устройства.
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, n) {
  return toISO(parseISO(iso) + n * DAY);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / DAY);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function formatDay(iso, { short = false } = {}) {
  const ms = parseISO(iso);
  const d = new Date(ms);
  return `${d.getUTCDate()} ${(short ? MONTHS_SHORT : MONTHS_GEN)[d.getUTCMonth()]}`;
}

export function weekday(iso) {
  return WEEKDAYS[new Date(parseISO(iso)).getUTCDay()];
}

export function relativeDay(iso, today) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return `${formatDay(iso)}, ${weekday(iso)}`;
}

// «27 дней», «1 день», «3 дня»
export function pluralDays(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return `${n} дней`;
  if (b === 1) return `${n} день`;
  if (b >= 2 && b <= 4) return `${n} дня`;
  return `${n} дней`;
}
