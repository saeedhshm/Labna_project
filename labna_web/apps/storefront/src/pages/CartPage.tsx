import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart';
import { money, unit } from '../format';
import { useLanguage } from '../i18n';
import { text } from '../types';

const reasonCopy = {
  product_not_found: { ar: 'المنتج غير موجود', en: 'Product not found' },
  variant_not_found: { ar: 'الخيار غير موجود', en: 'Variant not found' },
  unavailable: { ar: 'غير متوفر حاليًا', en: 'Currently unavailable' },
  insufficient_stock: { ar: 'الكمية المطلوبة أكبر من المتاح', en: 'Requested quantity exceeds stock' },
  ok: { ar: 'متاح', en: 'Available' },
};

export function CartPage() {
  const cart = useCart();
  const { locale, t } = useLanguage();
  const validation = useQuery({
    queryKey: ['cart', cart.items],
    queryFn: ({ signal }) => api.validateCart({ items: cart.items }, signal),
    enabled: cart.items.length > 0,
  });
  const data = validation.data?.data;

  if (cart.items.length === 0) {
    return (
      <section className="state-card">
        <h1>{t('السلة فارغة', 'Your cart is empty')}</h1>
        <p>{t('ابدأ بإضافة منتجات طازجة من الكتالوج.', 'Start adding fresh products from the catalog.')}</p>
        <Link className="button" to="/catalog">{t('تصفح المنتجات', 'Browse products')}</Link>
      </section>
    );
  }

  return (
    <section className="section cart-page">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('السلة', 'Cart')}</p>
          <h1>{t('راجع المنتجات قبل checkout', 'Review items before checkout')}</h1>
        </div>
        <button className="language-toggle" type="button" onClick={cart.clear}>{t('تفريغ السلة', 'Clear cart')}</button>
      </div>

      {validation.isPending ? <div className="skeleton-lines" /> : null}
      {validation.isError ? <div className="state-card"><p>{t('تعذر التحقق من السلة.', 'Could not validate cart.')}</p></div> : null}

      {data ? (
        <div className="cart-layout">
          <div className="cart-list">
            {data.items.map(item => (
              <article className={`cart-item${item.valid ? '' : ' cart-item--invalid'}`} key={`${item.productID}:${item.variantID}`}>
                <img src={item.imageURL} alt="" />
                <div>
                  <h2>{text(item.productName, locale)}</h2>
                  <p>{text(item.variantLabel, locale)} · {unit(item.variantQuantity, item.unit, locale)}</p>
                  <p className={item.valid ? 'stock-ok' : 'stock-bad'}>{reasonCopy[item.reason][locale]} · {item.availableQuantity} {t('متاح', 'available')}</p>
                </div>
                <div className="cart-item__controls">
                  <div className="quantity-control">
                    <button type="button" onClick={() => cart.updateQuantity(item.productID, item.variantID, item.quantity - 1)}>-</button>
                    <input value={item.quantity} min="1" type="number" onChange={event => cart.updateQuantity(item.productID, item.variantID, Number(event.target.value) || 1)} />
                    <button type="button" onClick={() => cart.updateQuantity(item.productID, item.variantID, item.quantity + 1)}>+</button>
                  </div>
                  <strong>{money(item.unitPriceMinor, item.currencyCode, locale)}</strong>
                  <button className="remove-button" type="button" onClick={() => cart.remove(item.productID, item.variantID)}>{t('حذف', 'Remove')}</button>
                </div>
              </article>
            ))}
          </div>

          <aside className="cart-summary">
            <h2>{t('ملخص السلة', 'Cart summary')}</h2>
            <div className="summary-row"><span>{t('عدد العناصر', 'Items')}</span><strong>{cart.count}</strong></div>
            <div className="summary-row"><span>{t('المجموع الفرعي', 'Subtotal')}</span><strong>{money(data.subtotalMinor, data.currencyCode, locale)}</strong></div>
            {!data.valid ? <p className="stock-bad">{t('صحح العناصر غير المتاحة قبل checkout.', 'Fix unavailable items before checkout.')}</p> : null}
            <button className="button button--wide" type="button" disabled={!data.valid}>{t('المتابعة إلى checkout', 'Continue to checkout')}</button>
            <p className="hint">{t('السعر والمخزون محسوبان من الخادم الآن، وليس من بيانات الواجهة.', 'Prices and stock are validated by the backend, not the frontend.')}</p>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
