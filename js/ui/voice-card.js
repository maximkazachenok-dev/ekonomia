// Карточка «Продиктуйте покупку» на главном экране.
// Текст можно надиктовать микрофоном клавиатуры (работает везде, включая iPhone)
// или кнопкой «Говорить» (браузерное распознавание речи, где оно есть — обычно Android/Chrome).
// Разобранная фраза всегда открывается на экране подтверждения: без нажатия «Записать» ничего не сохраняется.
import { html, useState, useRef, useEffect } from '../lib/preact.js';
import { useApp, Icon, showToast } from './common.js';
import { parsePurchase } from '../lib/voice-parse.js';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
// На iPhone в приложении с экрана «Домой» распознавание из браузера работает ненадёжно — там только клавиатура
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const mic = html`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;

export function VoiceCard() {
  const { shops, today, openPurchase } = useApp();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => () => recRef.current?.abort(), []);

  const submit = (phrase = text) => {
    const t = phrase.trim();
    if (!t) return;
    const parsed = parsePurchase(t, shops, today);
    openPurchase({ shopId: parsed.shopId || 'other', draft: { ...parsed, shopId: parsed.shopId || 'other', phrase: t } });
    setText('');
  };

  const listen = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Recognition();
    rec.lang = 'ru-RU';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setText((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') showToast('Нет доступа к микрофону. Разрешите его в настройках браузера или нажмите на поле и диктуйте с клавиатуры');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') showToast('Не удалось распознать речь. Нажмите на поле и диктуйте с клавиатуры');
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) submit(finalText);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      showToast('Распознавание речи недоступно. Нажмите на поле и диктуйте с клавиатуры');
    }
  };

  return html`<section class="card voice">
    <h2 class="card__title">Продиктуйте или напишите покупку</h2>
    <form class="voice__row" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
      <input class="input voice__input" value=${text} onInput=${(e) => setText(e.target.value)}
        placeholder="в Гиппо хлеб 3,5, молоко 2,8" enterkeyhint="done" autocomplete="off" aria-label="Фраза о покупке" />
      ${Recognition && !isIOS &&
      html`<button type="button" class=${`voice__mic ${listening ? 'voice__mic--on' : ''}`} onClick=${listen} aria-label=${listening ? 'Остановить запись' : 'Говорить'}>${mic}</button>`}
      <button type="submit" class="btn btn--primary voice__go" disabled=${!text.trim()} aria-label="Разобрать фразу">${Icon.chevron}</button>
    </form>
    <p class="field__hint">
      ${listening
        ? 'Слушаю… Скажите, например: «в Гиппо купили хлеб три с половиной, молоко два восемьдесят»'
        : Recognition && !isIOS
          ? 'Нажмите микрофон и скажите покупку. Перед записью покажу, что понял.'
          : 'Нажмите на поле и микрофон на клавиатуре. Перед записью покажу, что понял.'}
    </p>
  </section>`;
}
