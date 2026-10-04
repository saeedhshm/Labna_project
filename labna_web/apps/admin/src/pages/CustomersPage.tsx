import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { AdminCustomerQuery, CustomerAddressDTO, OrderDTO } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useCustomer, useCustomerOrders, useCustomersList, useCustomerStatusMutation, type CustomerFilters } from '../api/queries';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { money } from '../lib/format';

const date = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const statusLabel = { active: 'نشط', inactive: 'غير نشط' };
const orderStatusLabel: Record<OrderDTO['status'], string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'جارٍ التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};
const sortOptions: { value: AdminCustomerQuery['sort']; label: string }[] = [
  { value: 'joinedDesc', label: 'الأحدث انضماماً' },
  { value: 'joinedAsc', label: 'الأقدم انضماماً' },
  { value: 'nameAsc', label: 'الاسم أ-ي' },
  { value: 'nameDesc', label: 'الاسم ي-أ' },
  { value: 'ordersDesc', label: 'الأكثر طلباً' },
  { value: 'spentDesc', label: 'الأعلى إنفاقاً' },
];

export function CustomersPage() {
  const { customerId } = useParams();
  return customerId ? <CustomerDetails customerId={customerId} /> : <CustomersList />;
}

function filtersFromSearch(params: URLSearchParams): CustomerFilters {
  const status = params.get('status');
  const sort = params.get('sort');
  return {
    ...(params.get('q') ? { q: params.get('q')! } : {}),
    ...(status === 'active' || status === 'inactive' ? { status } : {}),
    sort: sortOptions.some(option => option.value === sort) ? sort as AdminCustomerQuery['sort'] : 'joinedDesc',
  };
}

function CustomersList() {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromSearch(params);
  const customers = useCustomersList(filters);
  const rows = customers.data?.pages.flatMap(page => page.items) ?? [];

  function apply(form: FormData) {
    const next = new URLSearchParams();
    for (const key of ['q', 'status', 'sort']) {
      const value = String(form.get(key) ?? '').trim();
      if (value && !(key === 'sort' && value === 'joinedDesc')) next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <Panel title="العملاء">
      <form className="inventory-filters" onSubmit={event => { event.preventDefault(); apply(new FormData(event.currentTarget)); }}>
        <Field label="بحث" htmlFor="customers-q" hint="الاسم، البريد، أو الهاتف.">
          <input id="customers-q" name="q" defaultValue={filters.q ?? ''} />
        </Field>
        <Field label="الحالة" htmlFor="customers-status">
          <select id="customers-status" name="status" defaultValue={filters.status ?? ''}>
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
        </Field>
        <Field label="الترتيب" htmlFor="customers-sort">
          <select id="customers-sort" name="sort" defaultValue={filters.sort}>
            {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <div className="inventory-filters__actions">
          <button type="submit" className="primary">تطبيق</button>
          <button type="button" className="ghost" onClick={() => setParams({}, { replace: true })}>إعادة ضبط</button>
        </div>
      </form>

      {customers.isPending ? <Spinner label="جارٍ تحميل العملاء…" /> : null}
      {customers.isError ? <Notice tone="error">تعذر تحميل العملاء. <button type="button" className="link-button" onClick={() => void customers.refetch()}>إعادة المحاولة</button></Notice> : null}
      {rows.length === 0 && customers.isSuccess ? <EmptyState>لا يوجد عملاء مطابقون لعوامل البحث.</EmptyState> : null}
      {rows.length ? (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th scope="col">العميل</th><th scope="col">البريد</th><th scope="col">الهاتف</th><th scope="col">الحالة</th><th scope="col">الطلبات</th><th scope="col">إجمالي الإنفاق</th><th scope="col">تاريخ الانضمام</th><th scope="col">إجراءات</th></tr></thead>
              <tbody>{rows.map(customer => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong></td>
                  <td dir="ltr">{customer.email}</td>
                  <td dir="ltr">{customer.phoneNumber}</td>
                  <td><span className={`tag ${customer.isActive ? 'tag--ok' : 'tag--muted'}`}>{customer.isActive ? statusLabel.active : statusLabel.inactive}</span></td>
                  <td>{customer.ordersCount}</td>
                  <td>{money(customer.totalSpentMinor, 'EGP')}</td>
                  <td>{date.format(new Date(customer.createdAt))}</td>
                  <td className="table__actions"><Link className="ghost" to={`/customers/${customer.id}`}>التفاصيل</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {customers.hasNextPage ? <button type="button" className="ghost" onClick={() => void customers.fetchNextPage()} disabled={customers.isFetchingNextPage}>{customers.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}</button> : <p className="hint">تم عرض كل العملاء.</p>}
        </>
      ) : null}
    </Panel>
  );
}

function CustomerDetails({ customerId }: { customerId: string }) {
  const customer = useCustomer(customerId);
  const orders = useCustomerOrders(customerId);
  const status = useCustomerStatusMutation();
  const data = customer.data;

  async function setActive(isActive: boolean) {
    if (!isActive && !window.confirm('تعطيل العميل سيمنع تسجيل الدخول والوصول لحسابه. هل تريد المتابعة؟')) return;
    await status.mutateAsync({ id: customerId, payload: { isActive } }).catch(() => undefined);
  }

  return (
    <div className="customer-detail-page">
      <p><Link to="/customers">العودة إلى العملاء</Link></p>
      {customer.isPending ? <Spinner label="جارٍ تحميل بيانات العميل…" /> : null}
      {customer.isError ? <Notice tone="error">تعذر تحميل بيانات العميل. <button type="button" className="link-button" onClick={() => void customer.refetch()}>إعادة المحاولة</button></Notice> : null}
      {status.error instanceof ApiError ? <Notice tone="error">{status.error.message}</Notice> : null}
      {data ? (
        <>
          <Panel title={data.name} actions={<button type="button" className={data.isActive ? 'danger-ghost' : 'primary'} onClick={() => void setActive(!data.isActive)} disabled={status.isPending}>{data.isActive ? 'تعطيل العميل' : 'تفعيل العميل'}</button>}>
            <div className="customer-profile-grid">
              <Info label="البريد" value={data.email} dir="ltr" />
              <Info label="الهاتف" value={data.phoneNumber} dir="ltr" />
              <Info label="الحالة" value={data.isActive ? statusLabel.active : statusLabel.inactive} />
              <Info label="تاريخ الانضمام" value={dateTime.format(new Date(data.createdAt))} />
              <Info label="آخر تحديث" value={dateTime.format(new Date(data.updatedAt))} />
            </div>
            <div className="metrics-grid">
              <Metric label="إجمالي الطلبات" value={data.metrics.totalOrders} />
              <Metric label="المكتملة" value={data.metrics.completedOrders} />
              <Metric label="الملغاة" value={data.metrics.cancelledOrders} />
              <Metric label="إجمالي الإنفاق" value={money(data.metrics.totalSpentMinor, data.metrics.currencyCode)} />
            </div>
          </Panel>
          <Panel title="العناوين المحفوظة">
            <Addresses addresses={data.addresses} />
          </Panel>
          <Panel title="طلبات العميل">
            <CustomerOrders orders={orders.data?.pages.flatMap(page => page.items) ?? []} pending={orders.isPending} error={orders.isError} retry={() => void orders.refetch()} />
            {orders.hasNextPage ? <button type="button" className="ghost" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>{orders.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}</button> : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function Info({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return <div><dt>{label}</dt><dd dir={dir}>{value}</dd></div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Addresses({ addresses }: { addresses: CustomerAddressDTO[] }) {
  if (!addresses.length) return <EmptyState>لا توجد عناوين محفوظة.</EmptyState>;
  return (
    <div className="address-list">
      {addresses.map(address => (
        <article key={address.id} className="address-card">
          <h3>{address.label} {address.isDefault ? <span className="tag tag--ok">افتراضي</span> : null}</h3>
          <p><strong>{address.recipientName}</strong><br /><span dir="ltr">{address.phoneNumber}</span></p>
          <p>{address.city}، {address.area}، {address.street}، مبنى {address.building}{address.floor ? `، دور ${address.floor}` : ''}{address.apartment ? `، شقة ${address.apartment}` : ''}</p>
          {address.notes ? <p className="hint">{address.notes}</p> : null}
        </article>
      ))}
    </div>
  );
}

function CustomerOrders({ orders, pending, error, retry }: { orders: OrderDTO[]; pending: boolean; error: boolean; retry: () => void }) {
  if (pending) return <Spinner label="جارٍ تحميل طلبات العميل…" />;
  if (error) return <Notice tone="error">تعذر تحميل طلبات العميل. <button type="button" className="link-button" onClick={retry}>إعادة المحاولة</button></Notice>;
  if (!orders.length) return <EmptyState>لا توجد طلبات لهذا العميل.</EmptyState>;
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th scope="col">رقم الطلب</th><th scope="col">التاريخ</th><th scope="col">الحالة</th><th scope="col">الإجمالي</th><th scope="col">إجراءات</th></tr></thead>
        <tbody>{orders.map(order => (
          <tr key={order.id}>
            <td><code>{order.orderNumber}</code></td>
            <td>{dateTime.format(new Date(order.createdAt))}</td>
            <td><span className={`tag order-status order-status--${order.status}`}>{orderStatusLabel[order.status]}</span></td>
            <td>{money(order.totalMinor, order.currencyCode)}</td>
            <td className="table__actions"><Link className="ghost" to={`/orders?order=${encodeURIComponent(order.id)}`}>فتح الطلب</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
