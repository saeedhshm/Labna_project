import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { PaymentMethod } from '@labna/contracts';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useCart } from '../cart';
import { money } from '../format';
import { useLanguage } from '../i18n';

const initial = {
  name: 'Demo Customer',
  phoneNumber: '+201012345678',
  email: 'demo@example.com',
  city: 'Cairo',
  area: 'Maadi',
  street: 'Road 9',
  building: '12',
  floor: '3',
  apartment: '5',
  notes: '',
  couponCode: '',
  paymentMethod: 'cash_on_delivery' as PaymentMethod,
};

export function CheckoutPage() {
  const cart = useCart();
  const auth = useAuth();
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const validation = useQuery({ queryKey: ['cart', cart.items], queryFn: ({ signal }) => api.validateCart({ items: cart.items }, signal), enabled: cart.items.length > 0 });
  const order = useMutation({ mutationFn: () => api.createOrder({
    customer: { name: form.name, phoneNumber: form.phoneNumber, email: form.email || undefined },
    address: { city: form.city, area: form.area, street: form.street, building: form.building, floor: form.floor, apartment: form.apartment, notes: form.notes },
    items: cart.items,
    couponCode: form.couponCode,
    paymentMethod: form.paymentMethod,
  }, undefined, auth.accessToken) });
  const data = validation.data?.data;
  const discountPreview = form.couponCode.trim().toUpperCase() === 'LABNA10' && data ? Math.floor(data.subtotalMinor * 0.1) : 0;
  const deliveryFeeMinor = 1500;
  const totalMinor = data ? Math.max(0, data.subtotalMinor + deliveryFeeMinor - discountPreview) : 0;

  if (cart.items.length === 0) {
    return <section className="state-card"><h1>{t('السلة فارغة', 'Cart is empty')}</h1><Link className="button" to="/products">{t('تصفح المنتجات', 'Browse products')}</Link></section>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const created = await order.mutateAsync();
      cart.clear();
      navigate(`/orders/${created.data.orderNumber}`);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t('تعذر إنشاء الطلب.', 'Could not create order.'));
    }
  }

  return (
    <section className="section checkout-page">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('إتمام الطلب', 'Checkout')}</p>
          <h1>{t('إتمام الطلب التجريبي', 'Complete demo order')}</h1>
        </div>
        <Link to="/cart">{t('العودة للسلة', 'Back to cart')}</Link>
      </div>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-form">
          <fieldset>
            <legend>{t('بيانات العميل', 'Customer information')}</legend>
            <label>{t('الاسم', 'Name')}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>{t('الهاتف', 'Phone')}<input required dir="ltr" value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} /></label>
            <label>{t('البريد', 'Email')}<input type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          </fieldset>
          <fieldset>
            <legend>{t('العنوان والتوصيل', 'Address and delivery')}</legend>
            <label>{t('المدينة', 'City')}<input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
            <label>{t('المنطقة', 'Area')}<input required value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
            <label>{t('الشارع', 'Street')}<input required value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} /></label>
            <div className="inline-form">
              <label>{t('المبنى', 'Building')}<input required value={form.building} onChange={(event) => setForm({ ...form, building: event.target.value })} /></label>
              <label>{t('الدور', 'Floor')}<input value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} /></label>
              <label>{t('الشقة', 'Apartment')}<input value={form.apartment} onChange={(event) => setForm({ ...form, apartment: event.target.value })} /></label>
            </div>
            <label>{t('ملاحظات', 'Notes')}<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </fieldset>
          <fieldset>
            <legend>{t('الدفع والكوبون', 'Payment and coupon')}</legend>
            <label>{t('كوبون تجريبي', 'Demo coupon')}<input dir="ltr" placeholder="LABNA10" value={form.couponCode} onChange={(event) => setForm({ ...form, couponCode: event.target.value })} /></label>
            <label>{t('طريقة الدفع', 'Payment method')}
              <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>
                <option value="cash_on_delivery">{t('الدفع عند الاستلام', 'Cash on delivery')}</option>
                <option value="demo_card_success">{t('بطاقة تجريبية ناجحة', 'Demo card success')}</option>
                <option value="demo_card_failure">{t('بطاقة تجريبية فاشلة', 'Demo card failure')}</option>
              </select>
            </label>
          </fieldset>
        </div>
        <aside className="cart-summary">
          <h2>{t('ملخص الطلب', 'Order summary')}</h2>
          {validation.isPending ? <p>{t('جار التحقق من السلة…', 'Validating cart...')}</p> : null}
          {data?.items.map((item) => <div className="summary-row" key={`${item.productID}:${item.variantID}`}><span>{item.quantity} × {item.productName[locale]}</span><strong>{money(item.lineTotalMinor, item.currencyCode, locale)}</strong></div>)}
          <div className="summary-row"><span>{t('المجموع الفرعي', 'Subtotal')}</span><strong>{data ? money(data.subtotalMinor, data.currencyCode, locale) : '-'}</strong></div>
          <div className="summary-row"><span>{t('التوصيل', 'Delivery')}</span><strong>{data ? money(deliveryFeeMinor, data.currencyCode, locale) : '-'}</strong></div>
          <div className="summary-row"><span>{t('الخصم', 'Discount')}</span><strong>{data ? money(discountPreview, data.currencyCode, locale) : '-'}</strong></div>
          <div className="summary-row"><span>{t('الإجمالي', 'Total')}</span><strong>{data ? money(totalMinor, data.currencyCode, locale) : '-'}</strong></div>
          {!data?.valid ? <p className="stock-bad">{t('السلة تحتاج تعديل قبل إتمام الطلب.', 'Cart needs changes before checkout.')}</p> : null}
          {error ? <p className="stock-bad">{error}</p> : null}
          <button className="button button--wide" disabled={!data?.valid || order.isPending} type="submit">{order.isPending ? t('جار إنشاء الطلب…', 'Creating order...') : t('إنشاء الطلب', 'Place order')}</button>
        </aside>
      </form>
    </section>
  );
}
