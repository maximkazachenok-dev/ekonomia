// Шторка раздела покупок: создать, переименовать, скрыть или вернуть магазин.
import { html, useState, useEffect } from '../lib/preact.js';
import { BottomSheet, useApp, SHOP_ICONS, showToast } from './common.js';
import { shopName } from '../lib/budget.js';

export function ShopSheet({ shop, onClose }) {
  const { shops, saveShop, setOpenShopId } = useApp();
  const isNew = !shop?.id;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏪');

  useEffect(() => {
    if (!shop) return;
    setName(shop.id ? shopName(shop) : '');
    setIcon(shop.icon || '🏪');
  }, [shop]);

  if (!shop) return null;

  const trimmed = name.trim();
  const duplicate = shops.some((s) => s.id !== shop.id && !s.archived && shopName(s).toLowerCase() === trimmed.toLowerCase());

  const submit = async (e) => {
    e.preventDefault();
    if (!trimmed || duplicate) return;
    if (isNew) {
      const id = await saveShop({ name: trimmed, icon, order: Date.now(), archived: false });
      if (id) setOpenShopId(id);
    } else {
      saveShop({ id: shop.id, name: trimmed, icon });
    }
    onClose();
  };

  // Скрываем, а не удаляем: покупки остаются в истории и в дневном лимите
  const hide = () => {
    saveShop({ id: shop.id, archived: true });
    setOpenShopId(null);
    showToast(`«${shopName(shop)}» скрыт`, { label: 'Вернуть', run: () => saveShop({ id: shop.id, archived: false }) });
    onClose();
  };

  return html`<${BottomSheet} open=${true} onClose=${onClose} title=${isNew ? 'Новый раздел' : 'Раздел'}>
    <form class="form" onSubmit=${submit}>
      <label class="field">
        <span class="field__label">Название магазина или категории</span>
        <input class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Например, Гиппо" maxlength="30" required autofocus=${isNew} />
        ${duplicate && html`<span class="form-error">Такой раздел уже есть</span>`}
      </label>
      <div class="field">
        <span class="field__label">Значок</span>
        <div class="icon-grid">
          ${SHOP_ICONS.map((i) => html`<button type="button" class=${`icon-pick ${icon === i ? 'icon-pick--active' : ''}`} onClick=${() => setIcon(i)} aria-label=${i}>${i}</button>`)}
        </div>
      </div>
      ${!isNew && html`<p class="field__hint">Скрытый раздел пропадёт из списка, но его покупки останутся в истории и в расчёте. Вернуть его можно в списке «Скрытые».</p>`}
      <div class="tx-actions">
        ${!isNew && html`<button type="button" class="btn btn--danger-ghost" onClick=${hide}>Скрыть</button>`}
        <button type="submit" class="btn btn--primary btn--grow" disabled=${!trimmed || duplicate}>Сохранить</button>
      </div>
    </form>
  <//>`;
}
