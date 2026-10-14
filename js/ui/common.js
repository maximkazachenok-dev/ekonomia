import { html, useEffect, useState, createContext, useContext } from '../lib/preact.js';
import { formatAmount, currencySymbol } from '../lib/money.js';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function Money({ kop, currency, big = false, forceKop = false }) {
  const { family } = useApp() || {};
  const cur = currency || family?.currency || 'BYN';
  return html`<span class=${big ? 'money money--big' : 'money'}
    >${formatAmount(kop, { forceKop })}<span class="money__cur">${currencySymbol(cur)}</span></span
  >`;
}

export function ProgressBar({ percent, status = 'ok', thin = false }) {
  return html`<div class=${`bar ${thin ? 'bar--thin' : ''}`}>
    <div class=${`bar__fill bar__fill--${status}`} style=${{ width: `${Math.max(0, Math.min(100, percent))}%` }}></div>
  </div>`;
}

export function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open]);
  if (!open) return null;
  return html`<div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet__grip"></div>
      <div class="sheet__head">
        <h2 class="sheet__title">${title}</h2>
        <button class="icon-btn" onClick=${onClose} aria-label="Закрыть">${Icon.close}</button>
      </div>
      <div class="sheet__body">${children}</div>
    </div>
  </div>`;
}

// Цифровая клавиатура: быстрее системной и не закрывает экран.
export function Numpad({ value, onChange }) {
  const press = (k) => {
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === ',') {
      if (value.includes(',')) return;
      return onChange((value || '0') + ',');
    }
    const [, dec] = value.split(',');
    if (dec !== undefined && dec.length >= 2) return;
    if (value === '0') return onChange(k);
    if (value.replace(',', '').length >= 9) return;
    onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
  return html`<div class="numpad">
    ${keys.map(
      (k) => html`<button type="button" class="numpad__key" onClick=${() => press(k)} aria-label=${k === 'del' ? 'Стереть' : k}>
        ${k === 'del' ? Icon.backspace : k}
      </button>`,
    )}
  </div>`;
}

let toastSetter = null;
export function showToast(text, action) {
  toastSetter?.({ text, action, id: Date.now() });
}

export function Toasts() {
  const [toast, setToast] = useState(null);
  toastSetter = setToast;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return html`<div class="toast" role="status" key=${toast.id}>
    <span>${toast.text}</span>
    ${toast.action &&
    html`<button class="toast__btn" onClick=${() => { toast.action.run(); setToast(null); }}>${toast.action.label}</button>`}
  </div>`;
}

const svg = (d, extra = '') =>
  html`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: d + extra }}></svg>`;

export const Icon = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  piggy: svg('<path d="M19 9.5c1 .3 2 1.2 2 2.5M5 11a7 6 0 0 1 7-5c1.5 0 3 .4 4 1l2.5-1.5-.5 3c.9.9 1.5 2 1.7 3.2l1.3.3v3l-1.6.4A7 7 0 0 1 17 18v2.5h-3V19a9 9 0 0 1-3 0v1.5H8V18a6 6 0 0 1-3-5"/><circle cx="15.5" cy="10.5" r=".6" fill="currentColor"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  backspace: svg('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m17 9-6 6M11 9l6 6"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>'),
  share: svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>'),
  cloudOff: svg('<path d="m2 2 20 20M5.8 7.8A6 6 0 0 0 7 19h11M17.5 10A4.5 4.5 0 0 1 21.7 17M9.5 5.4A6 6 0 0 1 17.6 10"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
};

export const ENVELOPE_ICONS = ['🛒', '💅', '💇', '⛽', '🔧', '🐷', '💊', '👶', '🍽️', '🚌', '🏠', '📱', '🎁', '🎉', '👕', '🐾', '📚', '✈️', '💡', '☕'];
export const ENVELOPE_COLORS = ['#1F9D6B', '#D9468A', '#7B61FF', '#E8833A', '#3B82C4', '#C9A227', '#0E9AA7', '#8A6D5B'];

export const KIND_LABELS = {
  daily: 'Лимит на каждый день',
  period: 'Лимит до зарплаты',
  savings: 'Копилка (цель)',
};
