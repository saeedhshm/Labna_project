import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { text } from '../types';

const statusCopy = {
  pending: { ar: 'قيد المراجعة', en: 'Pending' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  preparing: { ar: 'جار التحضير', en: 'Preparing' },
  ready: { ar: 'جاهز', en: 'Ready' },
  out_for_delivery: { ar: 'خرج للتوصيل', en: 'Out for delivery' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
};

export function ConfirmationPage() {
  const { orderID = '' } = useParams();
  const { locale, t } = useLanguage();
  const order = useQuery({ queryKey: ['order', orderID], queryFn: ({ signal }) => api.order(orderID, signal), enabled: Boolean(orderID) });
  const data = order.data?.data;

  if (order.isPending) return <section className="state-card"><p>{t('جار تحميل الطلب…', 'Loading order...')}</p></section>;
  if (order.isError || !data) return <section className="state-card"><h1>{t('تعذر تحميل الطلب', 'Could not load order')}</h1><Link className="button" to="/catalog">{t('العودة للمتجر', 'Back to store')}</Link></section>;

  return (
    <section className="section confirmation-page">
      <div className="confirmation-card">
        <p className="eyebrow">{t('تم إنشاء الطلب', 'Order created')}</p>
        <h1>{t('شكراً لك، طلبك جاهز للمتابعة', 'Thank you, your order is ready to track')}</h1>
        <div className="order-number">{data.orderNumber}</div>
        <p>{t('الحالة الحالية', 'Current status')}: <strong>{statusCopy[data.status][locale]}</strong></p>
      </div>
      <div className="cart-layout">
        <div className="cart-list">
          {data.items.map(item => (
            <article className="cart-item" key={`${item.productID}:${item.variantID}`}>
              <img src={item.imageURL} alt="" />
              <div><h2>{text(item.productName, locale)}</h2><p>{text(item.variantLabel, locale)} · {item.quantity}</p></div>
              <strong>{money(item.lineTotalMinor, item.currencyCode, locale)}</strong>
            </article>
          ))}
        </div>
        <aside className="cart-summary">
          <h2>{t('الإجمالي', 'Total')}</h2>
          <div className="summary-row"><span>{t('المجموع الفرعي', 'Subtotal')}</span><strong>{money(data.subtotalMinor, data.currencyCode, locale)}</strong></div>
          <div className="summary-row"><span>{t('التوصيل', 'Delivery')}</span><strong>{money(data.deliveryFeeMinor, data.currencyCode, locale)}</strong></div>
          <div className="summary-row"><span>{t('الخصم', 'Discount')}</span><strong>{money(data.discountMinor, data.currencyCode, locale)}</strong></div>
          <div className="summary-row"><span>{t('الإجمالي', 'Total')}</span><strong>{money(data.totalMinor, data.currencyCode, locale)}</strong></div>
          <p className="hint">{t('هذا طلب Demo بدون بوابة دفع حقيقية.', 'This is a demo order without a real payment gateway.')}</p>
          <Link className="button button--wide" to="/catalog">{t('متابعة التسوق', 'Continue shopping')}</Link>
        </aside>
      </div>
    </section>
  );
}
