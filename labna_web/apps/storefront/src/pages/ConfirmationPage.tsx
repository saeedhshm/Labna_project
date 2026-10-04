import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { dateTime, statusCopy, timeline } from '../order-display';
import { text } from '../types';

export function ConfirmationPage() {
  const { orderID = '' } = useParams();
  const { locale, t } = useLanguage();
  const order = useQuery({ queryKey: ['order', orderID], queryFn: ({ signal }) => api.order(orderID, signal), enabled: Boolean(orderID) });
  const data = order.data?.data;

  if (order.isPending) return <section className="state-card"><p>{t('جار تحميل الطلب…', 'Loading order...')}</p></section>;
  if (order.isError || !data) return <section className="state-card"><h1>{t('تعذر تحميل الطلب', 'Could not load order')}</h1><Link className="button" to="/products">{t('العودة للمتجر', 'Back to store')}</Link></section>;

  const currentIndex = timeline.indexOf(data.status);
  const history = new Map(data.statusHistory.map((item) => [item.status, item.at]));

  return (
    <section className="section confirmation-page">
      <div className="confirmation-card">
        <p className="eyebrow">{t('تتبع الطلب', 'Order tracking')}</p>
        <h1>{t('طلبك قيد المتابعة من المتجر', 'Your order is being tracked by the store')}</h1>
        <div className="order-number">{data.orderNumber}</div>
        <p>{t('الحالة الحالية', 'Current status')}: <strong>{statusCopy[data.status][locale]}</strong></p>
        <button className="button button--ghost" type="button" onClick={() => void order.refetch()} disabled={order.isFetching}>
          {order.isFetching ? t('جار التحديث…', 'Refreshing...') : t('تحديث الحالة', 'Refresh status')}
        </button>
      </div>

      <section className="tracking-panel">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('خط سير الطلب', 'Tracking timeline')}</p>
            <h2>{t('آخر تحديث من لوحة الإدارة يظهر هنا', 'Admin status updates appear here')}</h2>
          </div>
        </div>
        <ol className="tracking-timeline">
          {timeline.map((status, index) => {
            const done = data.status === 'cancelled' ? history.has(status) : index <= currentIndex;
            const timestamp = history.get(status);
            return (
              <li className={done ? 'is-done' : 'is-pending'} key={status}>
                <span className="tracking-dot">{done ? '✓' : '○'}</span>
                <div>
                  <strong>{statusCopy[status][locale]}</strong>
                  <small>{timestamp ? dateTime(timestamp, locale) : t('بانتظار التحديث', 'Waiting for update')}</small>
                </div>
              </li>
            );
          })}
          {data.status === 'cancelled' ? (
            <li className="is-cancelled">
              <span className="tracking-dot">!</span>
              <div><strong>{statusCopy.cancelled[locale]}</strong><small>{history.get('cancelled') ? dateTime(history.get('cancelled')!, locale) : ''}</small></div>
            </li>
          ) : null}
        </ol>
      </section>

      <div className="cart-layout">
        <div className="cart-list">
          <section className="order-info-grid">
            <article><span>{t('العميل', 'Customer')}</span><strong>{data.customer.name}</strong><small dir="ltr">{data.customer.phoneNumber}</small></article>
            <article><span>{t('العنوان', 'Address')}</span><strong>{data.address.city}، {data.address.area}</strong><small>{data.address.street}، {data.address.building}{data.address.apartment ? `، ${data.address.apartment}` : ''}</small></article>
            <article><span>{t('الدفع', 'Payment')}</span><strong>{data.payment.status}</strong><small>{data.payment.method}</small></article>
          </section>
          {data.items.map((item) => (
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
          <Link className="button button--wide" to="/products">{t('متابعة التسوق', 'Continue shopping')}</Link>
        </aside>
      </div>
    </section>
  );
}
