import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { OrderDTO } from '@labna/contracts';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';
import { dateTime, statusCopy, timeline } from '../order-display';
import { text } from '../types';

const paymentCopy: Record<string, { ar: string; en: string }> = {
  cash_on_delivery: { ar: 'الدفع عند الاستلام', en: 'Cash on delivery' },
  demo_card_success: { ar: 'بطاقة Demo', en: 'Demo card' },
  demo_card_failure: { ar: 'بطاقة Demo', en: 'Demo card' },
};

function errorText(error: unknown, t: (ar: string, en: string) => string) {
  if (error instanceof ApiError && error.code === 'ORDER_NOT_CANCELLABLE') return t('لا يمكن إلغاء هذا الطلب الآن.', 'This order can no longer be cancelled.');
  return t('تعذر تحميل الطلبات. حاول مرة أخرى.', 'Could not load orders. Try again.');
}

function itemSummary(order: OrderDTO, locale: 'ar' | 'en') {
  const first = order.items[0];
  if (!first) return '';
  const rest = order.items.length - 1;
  return rest > 0 ? `${text(first.productName, locale)} +${rest}` : text(first.productName, locale);
}

export function OrdersPage() {
  const { t, locale } = useLanguage();
  usePageMeta(t('طلباتي', 'My Orders'));
  const auth = useAuth();
  const token = auth.accessToken!;
  const orders = useQuery({ queryKey: ['customer-orders'], queryFn: ({ signal }) => api.customerOrders(token, signal) });
  const data = orders.data?.data ?? [];

  if (orders.isPending)
    return (
      <section className="state-card">
        <p>{t('جار تحميل الطلبات...', 'Loading orders...')}</p>
      </section>
    );
  if (orders.isError)
    return (
      <section className="state-card">
        <h1>{t('تعذر تحميل الطلبات', 'Could not load orders')}</h1>
        <button className="button" type="button" onClick={() => void orders.refetch()}>
          {t('إعادة المحاولة', 'Retry')}
        </button>
      </section>
    );

  return (
    <section className="section account-page" aria-labelledby="orders-title">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('منطقة العملاء', 'Customer area')}</p>
          <h1 id="orders-title">{t('طلباتي', 'My Orders')}</h1>
        </div>
        <button className="button" type="button" onClick={() => void orders.refetch()} disabled={orders.isFetching}>
          {orders.isFetching ? t('جار التحديث...', 'Refreshing...') : t('تحديث', 'Refresh')}
        </button>
      </div>
      {data.length ? (
        <div className="orders-list">
          {data.map((order) => (
            <article className="order-card" key={order.id}>
              <div>
                <p className="eyebrow">{order.orderNumber}</p>
                <h2>
                  <Link to={`/account/orders/${order.orderNumber}`}>{itemSummary(order, locale)}</Link>
                </h2>
                <p>{dateTime(order.createdAt, locale)}</p>
              </div>
              <div className="order-card__meta">
                <span className="default-badge">{statusCopy[order.status][locale]}</span>
                <strong>{money(order.totalMinor, order.currencyCode, locale)}</strong>
                <small>
                  {paymentCopy[order.payment.method]?.[locale] ?? order.payment.method} · {order.payment.status}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="state-card">
          <h2>{t('لا توجد طلبات بعد', 'No orders yet')}</h2>
          <Link className="button" to="/products">
            {t('تصفح المنتجات', 'Browse products')}
          </Link>
        </section>
      )}
    </section>
  );
}

export function OrderDetailPage() {
  const { t, locale } = useLanguage();
  const { orderId = '' } = useParams();
  const auth = useAuth();
  const token = auth.accessToken!;
  const order = useQuery({ queryKey: ['customer-order', orderId], queryFn: ({ signal }) => api.customerOrder(token, orderId, signal), enabled: Boolean(orderId) });
  const cancel = useMutation({
    mutationFn: () => api.customerCancelOrder(token, orderId),
    onSuccess: () => void order.refetch(),
  });
  const data = order.data?.data;

  if (order.isPending)
    return (
      <section className="state-card">
        <p>{t('جار تحميل الطلب...', 'Loading order...')}</p>
      </section>
    );
  if (order.isError || !data)
    return (
      <section className="state-card">
        <h1>{t('تعذر تحميل الطلب', 'Could not load order')}</h1>
        <button className="button" type="button" onClick={() => void order.refetch()}>
          {t('إعادة المحاولة', 'Retry')}
        </button>
      </section>
    );

  const currentIndex = timeline.indexOf(data.status);
  const history = new Map(data.statusHistory.map((item) => [item.status, item.at]));
  const canCancel = data.status === 'pending';

  return (
    <section className="section confirmation-page" aria-labelledby="order-title">
      <div className="confirmation-card">
        <p className="eyebrow">{t('تتبع الطلب', 'Order tracking')}</p>
        <h1 id="order-title">{data.orderNumber}</h1>
        <p>
          {t('الحالة الحالية', 'Current status')}: <strong>{statusCopy[data.status][locale]}</strong>
        </p>
        <p>{dateTime(data.createdAt, locale)}</p>
        <div className="order-actions">
          <button className="button button--ghost" type="button" onClick={() => void order.refetch()} disabled={order.isFetching}>
            {order.isFetching ? t('جار التحديث...', 'Refreshing...') : t('تحديث الحالة', 'Refresh status')}
          </button>
          {canCancel ? (
            <button className="button button--ghost" type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? t('جار الإلغاء...', 'Cancelling...') : t('إلغاء الطلب', 'Cancel order')}
            </button>
          ) : null}
        </div>
        {cancel.isError ? (
          <p className="form-alert" role="alert">
            {errorText(cancel.error, t)}
          </p>
        ) : null}
      </div>

      <section className="tracking-panel" aria-labelledby="timeline-title">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('خط سير الطلب', 'Tracking timeline')}</p>
            <h2 id="timeline-title">{t('آخر تحديث من لوحة الإدارة يظهر هنا', 'Admin status updates appear here')}</h2>
          </div>
        </div>
        <ol className="tracking-timeline" aria-label={t('مراحل الطلب', 'Order stages')}>
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
              <div>
                <strong>{statusCopy.cancelled[locale]}</strong>
                <small>{history.get('cancelled') ? dateTime(history.get('cancelled')!, locale) : ''}</small>
              </div>
            </li>
          ) : null}
        </ol>
      </section>

      <div className="cart-layout">
        <div className="cart-list">
          <section className="order-info-grid">
            <article>
              <span>{t('العنوان', 'Address')}</span>
              <strong>
                {data.address.city}, {data.address.area}
              </strong>
              <small>
                {data.address.street}, {data.address.building}
                {data.address.apartment ? `, ${data.address.apartment}` : ''}
              </small>
            </article>
            <article>
              <span>{t('الدفع', 'Payment')}</span>
              <strong>{paymentCopy[data.payment.method]?.[locale] ?? data.payment.method}</strong>
              <small>{data.payment.status}</small>
            </article>
            <article>
              <span>{t('العميل', 'Customer')}</span>
              <strong>{data.customer.name}</strong>
              <small dir="ltr">{data.customer.phoneNumber}</small>
            </article>
          </section>
          {data.items.map((item) => (
            <article className="cart-item" key={`${item.productID}:${item.variantID}`}>
              <img src={item.imageURL} alt="" />
              <div>
                <h2>{text(item.productName, locale)}</h2>
                <p>
                  {text(item.variantLabel, locale)} · {item.quantity} × {money(item.unitPriceMinor, item.currencyCode, locale)}
                </p>
              </div>
              <strong>{money(item.lineTotalMinor, item.currencyCode, locale)}</strong>
            </article>
          ))}
        </div>
        <aside className="cart-summary">
          <h2>{t('الإجمالي', 'Total')}</h2>
          <div className="summary-row">
            <span>{t('المجموع الفرعي', 'Subtotal')}</span>
            <strong>{money(data.subtotalMinor, data.currencyCode, locale)}</strong>
          </div>
          <div className="summary-row">
            <span>{t('التوصيل', 'Delivery')}</span>
            <strong>{money(data.deliveryFeeMinor, data.currencyCode, locale)}</strong>
          </div>
          <div className="summary-row">
            <span>{t('الخصم', 'Discount')}</span>
            <strong>{money(data.discountMinor, data.currencyCode, locale)}</strong>
          </div>
          <div className="summary-row">
            <span>{t('الإجمالي', 'Total')}</span>
            <strong>{money(data.totalMinor, data.currencyCode, locale)}</strong>
          </div>
          <Link className="button button--wide" to="/account/orders">
            {t('العودة للطلبات', 'Back to orders')}
          </Link>
        </aside>
      </div>
    </section>
  );
}
