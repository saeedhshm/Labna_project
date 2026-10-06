import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { CustomerAddressDTO, PaymentMethod } from '@labna/contracts';
import { checkoutRequest } from '@labna/contracts';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useCart } from '../cart';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';

/** Blank rather than demo values: nothing is invented for the shopper, and the
 * signed-in customer plus a saved address fill the form instead. */
const blankForm = {
  name: '',
  phoneNumber: '',
  email: '',
  city: '',
  area: '',
  street: '',
  building: '',
  floor: '',
  apartment: '',
  notes: '',
  couponCode: '',
  paymentMethod: 'cash_on_delivery' as PaymentMethod,
};

type FormState = typeof blankForm;
type FormErrors = Partial<Record<keyof FormState | 'items', string>>;

function addressToForm(address: CustomerAddressDTO) {
  return {
    city: address.city,
    area: address.area,
    street: address.street,
    building: address.building,
    floor: address.floor ?? '',
    apartment: address.apartment ?? '',
    notes: address.notes ?? '',
  };
}

export function CheckoutPage() {
  const cart = useCart();
  const auth = useAuth();
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  usePageMeta(t('إتمام الطلب', 'Checkout'));
  const [form, setForm] = useState<FormState>(blankForm);
  const [selectedAddressID, setSelectedAddressID] = useState<string>('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string>();
  // Copied from the session once, so later edits are not overwritten.
  const [customerPrefilled, setCustomerPrefilled] = useState(false);

  useEffect(() => {
    if (customerPrefilled || !auth.customer) return;
    setForm((current) => ({
      ...current,
      name: current.name || auth.customer!.name,
      phoneNumber: current.phoneNumber || auth.customer!.phoneNumber,
      email: current.email || auth.customer!.email,
    }));
    setCustomerPrefilled(true);
  }, [auth.customer, customerPrefilled]);

  const defaultAddress = auth.customer?.addresses.find((address) => address.isDefault) ?? auth.customer?.addresses[0];

  // Preselect the default saved address, but never overwrite what the shopper
  // has already typed.
  useEffect(() => {
    if (!defaultAddress) return;
    setSelectedAddressID((current) => current || defaultAddress.id);
    setForm((current) => (current.city || current.area || current.street ? current : { ...current, ...addressToForm(defaultAddress) }));
  }, [defaultAddress]);

  const validation = useQuery({ queryKey: ['cart', cart.items], queryFn: ({ signal }) => api.validateCart({ items: cart.items }, signal), enabled: cart.items.length > 0 });

  // The backend owns pricing: the request is checked against the shared schema
  // here, and every total other than the subtotal is confirmed by the server on
  // the confirmation screen.
  const buildRequest = () => ({
    customer: { name: form.name.trim(), phoneNumber: form.phoneNumber.trim(), email: form.email.trim() || undefined },
    address: {
      city: form.city.trim(),
      area: form.area.trim(),
      street: form.street.trim(),
      building: form.building.trim(),
      floor: form.floor.trim(),
      apartment: form.apartment.trim(),
      notes: form.notes.trim(),
    },
    items: cart.items,
    couponCode: form.couponCode.trim(),
    paymentMethod: form.paymentMethod,
  });

  const order = useMutation({
    mutationFn: () => {
      const parsed = checkoutRequest.safeParse(buildRequest());
      if (!parsed.success) {
        const fieldErrors: FormErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (key === 'customer' && issue.path[1]) fieldErrors[issue.path[1] as keyof FormState] ??= 'invalid';
          else if (key === 'address' && issue.path[1]) fieldErrors[issue.path[1] as keyof FormState] ??= 'invalid';
          else if (key === 'items') setErrors((current) => ({ ...current, items: 'invalid' }));
        }
        setErrors(fieldErrors);
        throw new ApiError(422, 'VALIDATION_ERROR', t('راجع بيانات الطلب وحاول مرة أخرى.', 'Check the order details and try again.'));
      }
      setErrors({});
      return api.createOrder(parsed.data, undefined, auth.accessToken);
    },
  });

  const data = validation.data?.data;
  const hasCoupon = form.couponCode.trim().length > 0;

  if (cart.items.length === 0) {
    return (
      <section className="state-card">
        <h1>{t('السلة فارغة', 'Cart is empty')}</h1>
        <Link className="button" to="/products">
          {t('تصفح المنتجات', 'Browse products')}
        </Link>
      </section>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const created = await order.mutateAsync();
      cart.clear();
      navigate(`/orders/${created.data.orderNumber}`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VALIDATION_ERROR') {
        setError(t('راجع بيانات الطلب وحاول مرة أخرى.', 'Check the order details and try again.'));
        return;
      }
      setError(failure instanceof ApiError ? failure.message : t('تعذر إنشاء الطلب.', 'Could not create order.'));
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const invalid = (key: keyof FormState) => (errors[key] ? 'invalid' : '');
  const pendingLabel = t('يحدد عند التأكيد', 'confirmed at checkout');

  return (
    <section className="section checkout-page">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('إتمام الطلب', 'Checkout')}</p>
          <h1>{t('أكمل بيانات التوصيل', 'Delivery details')}</h1>
        </div>
        <Link to="/cart">{t('العودة للسلة', 'Back to cart')}</Link>
      </div>
      <form className="checkout-layout" onSubmit={submit} noValidate>
        <div className="checkout-form">
          <fieldset>
            <legend>{t('بيانات العميل', 'Customer information')}</legend>
            <label>
              {t('الاسم', 'Name')}
              <input required value={form.name} className={invalid('name')} onChange={(event) => set('name', event.target.value)} />
            </label>
            <label>
              {t('الهاتف', 'Phone')}
              <input required dir="ltr" value={form.phoneNumber} className={invalid('phoneNumber')} onChange={(event) => set('phoneNumber', event.target.value)} />
            </label>
            <label>
              {t('البريد', 'Email')}
              <input type="email" dir="ltr" value={form.email} className={invalid('email')} onChange={(event) => set('email', event.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>{t('العنوان والتوصيل', 'Address and delivery')}</legend>
            {auth.customer && auth.customer.addresses.length > 0 ? (
              <div className="saved-addresses" role="radiogroup" aria-label={t('العناوين المحفوظة', 'Saved addresses')}>
                {auth.customer.addresses.map((address) => (
                  <label key={address.id} className={`saved-address${selectedAddressID === address.id ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="saved-address"
                      value={address.id}
                      checked={selectedAddressID === address.id}
                      onChange={() => {
                        setSelectedAddressID(address.id);
                        setForm((current) => ({ ...current, ...addressToForm(address) }));
                      }}
                    />
                    <span>
                      <strong>{address.label}</strong>
                      <span>
                        {address.city}، {address.area}، {address.street}، {address.building}
                      </span>
                    </span>
                  </label>
                ))}
                <label className={`saved-address${selectedAddressID === '' ? ' is-selected' : ''}`}>
                  <input type="radio" name="saved-address" value="" checked={selectedAddressID === ''} onChange={() => setSelectedAddressID('')} />
                  <span>
                    <strong>{t('عنوان جديد', 'New address')}</strong>
                  </span>
                </label>
              </div>
            ) : null}
            <label>
              {t('المدينة', 'City')}
              <input required value={form.city} className={invalid('city')} onChange={(event) => set('city', event.target.value)} />
            </label>
            <label>
              {t('المنطقة', 'Area')}
              <input required value={form.area} className={invalid('area')} onChange={(event) => set('area', event.target.value)} />
            </label>
            <label>
              {t('الشارع', 'Street')}
              <input required value={form.street} className={invalid('street')} onChange={(event) => set('street', event.target.value)} />
            </label>
            <div className="inline-form">
              <label>
                {t('المبنى', 'Building')}
                <input required value={form.building} className={invalid('building')} onChange={(event) => set('building', event.target.value)} />
              </label>
              <label>
                {t('الدور', 'Floor')}
                <input value={form.floor} onChange={(event) => set('floor', event.target.value)} />
              </label>
              <label>
                {t('الشقة', 'Apartment')}
                <input value={form.apartment} onChange={(event) => set('apartment', event.target.value)} />
              </label>
            </div>
            <label>
              {t('ملاحظات', 'Notes')}
              <textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>{t('الدفع والكوبون', 'Payment and coupon')}</legend>
            <label>
              {t('كود الخصم', 'Coupon code')}
              <input dir="ltr" placeholder={t('LABNA10', 'LABNA10')} value={form.couponCode} onChange={(event) => set('couponCode', event.target.value)} />
            </label>
            <label>
              {t('طريقة الدفع', 'Payment method')}
              <select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value as PaymentMethod)}>
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
          {data?.items.map((item) => (
            <div className="summary-row" key={`${item.productID}:${item.variantID}`}>
              <span>
                {item.quantity} × {item.productName[locale]}
              </span>
              <strong>{money(item.lineTotalMinor, item.currencyCode, locale)}</strong>
            </div>
          ))}
          <div className="summary-row">
            <span>{t('المجموع الفرعي', 'Subtotal')}</span>
            <strong>{data ? money(data.subtotalMinor, data.currencyCode, locale) : '-'}</strong>
          </div>
          <div className="summary-row">
            <span>{t('التوصيل', 'Delivery')}</span>
            <strong>{data ? pendingLabel : '-'}</strong>
          </div>
          <div className="summary-row">
            <span>{t('الخصم', 'Discount')}</span>
            <strong>{data ? (hasCoupon ? pendingLabel : '-') : '-'}</strong>
          </div>
          <div className="summary-row">
            <span>{t('الإجمالي', 'Total')}</span>
            <strong>{data ? pendingLabel : '-'}</strong>
          </div>
          <p className="hint">
            {t('رسوم التوصيل والخصم والإجمالي يحسبها الخادم ويظهران في صفحة التأكيد.', 'Delivery, discount and total are calculated by the backend and shown on the confirmation page.')}
          </p>
          {!data?.valid ? <p className="stock-bad">{t('السلة تحتاج تعديل قبل إتمام الطلب.', 'Cart needs changes before checkout.')}</p> : null}
          {error ? (
            <p className="stock-bad" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button button--wide" disabled={!data?.valid || order.isPending} type="submit">
            {order.isPending ? t('جار إنشاء الطلب…', 'Creating order...') : t('إنشاء الطلب', 'Place order')}
          </button>
        </aside>
      </form>
    </section>
  );
}
