import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { CustomerAddressInput } from '@labna/contracts';
import { api } from '../api';
import { useCart } from '../cart';
import { useCustomerSession } from '../customer-session';
import { money } from '../format';
import { useLanguage } from '../i18n';

const blankAddress: CustomerAddressInput = { label: 'Home', city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '', apartment: '', notes: '', isDefault: true };

export function AccountPage() {
  const session = useCustomerSession();
  const cart = useCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale, t } = useLanguage();
  const [address, setAddress] = useState<CustomerAddressInput>(blankAddress);
  const addresses = useQuery({ queryKey: ['customer', 'addresses'], queryFn: ({ signal }) => api.customerAddresses(signal), enabled: session.state === 'authenticated' });
  const orders = useQuery({ queryKey: ['customer', 'orders'], queryFn: ({ signal }) => api.customerOrders(signal), enabled: session.state === 'authenticated' });
  const addAddress = useMutation({ mutationFn: () => api.addCustomerAddress(address), onSuccess: async () => { setAddress(blankAddress); await queryClient.invalidateQueries({ queryKey: ['customer'] }); await session.reload(); } });
  const deleteAddress = useMutation({ mutationFn: (id: string) => api.deleteCustomerAddress(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['customer'] }); await session.reload(); } });

  if (session.state === 'checking') return <section className="state-card"><p>{t('جار تحميل الحساب…', 'Loading account...')}</p></section>;
  if (session.state !== 'authenticated') return <Navigate to="/login" replace />;

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    addAddress.mutate();
  }

  return (
    <section className="section account-page">
      <div className="section__head">
        <div><p className="eyebrow">{t('حسابي', 'Account')}</p><h1>{session.customer?.name}</h1></div>
        <button className="language-toggle" type="button" onClick={() => void session.signOut()}>{t('تسجيل الخروج', 'Logout')}</button>
      </div>
      <div className="account-grid">
        <section className="account-panel">
          <h2>{t('العناوين', 'Addresses')}</h2>
          <div className="address-list">
            {addresses.data?.data.map(item => <article key={item.id}><strong>{item.label}{item.isDefault ? ` · ${t('افتراضي', 'Default')}` : ''}</strong><p>{item.city}، {item.area}، {item.street}، {item.building}</p><button className="remove-button" type="button" onClick={() => deleteAddress.mutate(item.id)}>{t('حذف', 'Delete')}</button></article>)}
          </div>
          <form className="checkout-form account-address-form" onSubmit={submitAddress}>
            <fieldset><legend>{t('عنوان جديد', 'New address')}</legend>
              <label>{t('الاسم', 'Label')}<input value={address.label} onChange={e => setAddress({ ...address, label: e.target.value })} required /></label>
              <label>{t('المدينة', 'City')}<input value={address.city} onChange={e => setAddress({ ...address, city: e.target.value })} required /></label>
              <label>{t('المنطقة', 'Area')}<input value={address.area} onChange={e => setAddress({ ...address, area: e.target.value })} required /></label>
              <label>{t('الشارع', 'Street')}<input value={address.street} onChange={e => setAddress({ ...address, street: e.target.value })} required /></label>
              <label>{t('المبنى', 'Building')}<input value={address.building} onChange={e => setAddress({ ...address, building: e.target.value })} required /></label>
              <label className="check-filter"><input type="checkbox" checked={address.isDefault} onChange={e => setAddress({ ...address, isDefault: e.target.checked })} />{t('اجعله افتراضيًا', 'Make default')}</label>
              <button className="button" type="submit" disabled={addAddress.isPending}>{t('إضافة عنوان', 'Add address')}</button>
            </fieldset>
          </form>
        </section>
        <section className="account-panel">
          <h2>{t('طلباتي', 'My orders')}</h2>
          {orders.isPending ? <p>{t('جار تحميل الطلبات…', 'Loading orders...')}</p> : null}
          {orders.data?.data.length === 0 ? <p>{t('لا توجد طلبات بعد.', 'No orders yet.')}</p> : null}
          <div className="customer-orders">
            {orders.data?.data.map(order => <article key={order.id}><div><strong>{order.orderNumber}</strong><small>{order.status}</small></div><strong>{money(order.totalMinor, order.currencyCode, locale)}</strong><div className="status-actions"><Link className="button" to={`/orders/${order.orderNumber}`}>{t('التفاصيل', 'Details')}</Link><button className="language-toggle" type="button" onClick={() => { cart.replace(order.items.map(item => ({ productID: item.productID, variantID: item.variantID, quantity: item.quantity }))); navigate('/cart'); }}>{t('إعادة الطلب', 'Reorder')}</button></div></article>)}
          </div>
        </section>
      </div>
    </section>
  );
}
