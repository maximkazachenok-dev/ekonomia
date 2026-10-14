// Вход по email и паролю (только в облачном режиме).
import { html, useState } from '../lib/preact.js';

export function LoginScreen({ backend }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signin') await backend.signIn(email.trim(), password);
      else if (mode === 'signup') await backend.signUp(email.trim(), password, name.trim());
      else {
        await backend.resetPassword(email.trim());
        setInfo('Письмо для смены пароля отправлено. Проверьте почту.');
        setMode('signin');
      }
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return html`<form class="onb" onSubmit=${submit}>
    <div class="onb__logo">💰</div>
    <h1 class="onb__title">Экономия денег</h1>
    <p class="onb__text">
      ${mode === 'signup' ? 'Создайте аккаунт. Потом пригласите жену в общий бюджет.' : mode === 'reset' ? 'Введите email, пришлём ссылку для смены пароля.' : 'Сколько можно потратить сегодня — с первого взгляда.'}
    </p>

    ${mode === 'signup' &&
    html`<input class="input" placeholder="Как вас зовут" value=${name} onInput=${(e) => setName(e.target.value)} required autocomplete="given-name" maxlength="20" />`}
    <input class="input" type="email" placeholder="Email" value=${email} onInput=${(e) => setEmail(e.target.value)} required autocomplete="email" />
    ${mode !== 'reset' &&
    html`<input class="input" type="password" placeholder="Пароль" value=${password} onInput=${(e) => setPassword(e.target.value)} required minlength="6" autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} />`}

    ${error && html`<p class="form-error">${error}</p>`}
    ${info && html`<p class="form-info">${info}</p>`}

    <button class="btn btn--primary btn--block btn--lg" disabled=${busy}>
      ${busy ? '…' : mode === 'signup' ? 'Зарегистрироваться' : mode === 'reset' ? 'Отправить письмо' : 'Войти'}
    </button>

    ${mode === 'signin'
      ? html`<button type="button" class="link-btn" onClick=${() => setMode('signup')}>Нет аккаунта? Зарегистрироваться</button>
          <button type="button" class="link-btn muted" onClick=${() => setMode('reset')}>Забыли пароль?</button>`
      : html`<button type="button" class="link-btn" onClick=${() => setMode('signin')}>Уже есть аккаунт? Войти</button>`}
  </form>`;
}
