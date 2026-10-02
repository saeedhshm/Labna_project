import { useState } from 'react';
import type { OrderDTO, OrderStatus } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useOrder, useOrdersList, useOrderStatusMutation, type OrderFilters } from '../api/queries';
import { FormDialog } from '../components/Dialog';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { ar, money } from '../lib/format';

const statuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
const statusLabel: Record<OrderStatus, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'جارٍ التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};
const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const dateTime = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

export function OrdersPage() {
  const [draft, setDraft] = useState({ q: '', status: '', from: '', to: '' });
  const [filters, setFilters] = useState<OrderFilters>({});
  const [selected, setSelected] = useState<OrderDTO | null>(null);
  const orders = useOrdersList(filters);
  const rows = orders.data?.pages.flatMap(page => page.items) ?? [];

  function applyFilters() {
    setFilters({
      ...(draft.q.trim() ? { q: draft.q.trim() } : {}),
      ...(draft.status ? { status: draft.status as OrderStatus } : {}),
      ...(draft.from ? { from: `${draft.from}T00:00:00.000Z` } : {}),
      ...(draft.to ? { to: `${draft.to}T23:59:59.999Z` } : {}),
    });
  }

  return (
    <Panel title="الطلبات">
      <form className="inventory-filters" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
        <Field label="بحث" htmlFor="orders-q" hint="رقم الطلب، اسم العميل، أو الهاتف.">
          <input id="orders-q" value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })} />
        </Field>
        <Field label="الحالة" htmlFor="orders-status">
          <select id="orders-status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
            <option value="">كل الحالات</option>
            {statuses.map(status => <option key={status} value={status}>{statusLabel[status]}</option>)}
          </select>
        </Field>
        <Field label="من" htmlFor="orders-from"><input id="orders-from" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></Field>
        <Field label="إلى" htmlFor="orders-to"><input id="orders-to" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></Field>
        <div className="inventory-filters__actions">
          <button type="submit" className="primary">تطبيق</button>
          <button type="button" className="ghost" onClick={() => { setDraft({ q: '', status: '', from: '', to: '' }); setFilters({}); }}>إعادة ضبط</button>
        </div>
      </form>

      {orders.isPending ? <Spinner label="جارٍ تحميل الطلبات…" /> : null}
      {orders.isError ? <Notice tone="error">تعذر تحميل الطلبات.</Notice> : null}
      {rows.length === 0 && orders.isSuccess ? <EmptyState>لا توجد طلبات تطابق عوامل التصفية.</EmptyState> : null}
      {rows.length ? (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th scope="col">رقم الطلب</th><th scope="col">العميل</th><th scope="col">الحالة</th><th scope="col">الدفع</th><th scope="col">الإجمالي</th><th scope="col">التاريخ</th><th scope="col">إجراءات</th></tr></thead>
              <tbody>{rows.map(order => (
                <tr key={order.id}>
                  <td><code>{order.orderNumber}</code></td>
                  <td><strong>{order.customer.name}</strong><small dir="ltr">{order.customer.phoneNumber}</small></td>
                  <td><span className={`tag order-status order-status--${order.status}`}>{statusLabel[order.status]}</span></td>
                  <td>{order.payment.method}<br /><small>{order.payment.status}</small></td>
                  <td>{money(order.totalMinor, order.currencyCode)}</td>
                  <td>{dateTime.format(new Date(order.createdAt))}</td>
                  <td className="table__actions"><button type="button" className="ghost" onClick={() => setSelected(order)}>التفاصيل</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {orders.hasNextPage ? <button type="button" className="ghost" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>{orders.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}</button> : <p className="hint">تم عرض كل الطلبات.</p>}
        </>
      ) : null}
      {selected ? <OrderDialog orderID={selected.id} onClose={() => setSelected(null)} /> : null}
    </Panel>
  );
}

function OrderDialog({ orderID, onClose }: { orderID: string; onClose: () => void }) {
  const order = useOrder(orderID);
  const mutation = useOrderStatusMutation();
  const [error, setError] = useState<string>();
  const data = order.data;

  async function move(status: OrderStatus) {
    setError(undefined);
    try {
      await mutation.mutateAsync({ id: orderID, status });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'تعذر تغيير حالة الطلب.');
    }
  }

  return (
    <FormDialog title={data ? `طلب ${data.orderNumber}` : 'تفاصيل الطلب'} submitLabel="إغلاق" onClose={onClose} onSubmit={onClose} error={error} busy={mutation.isPending}>
      {order.isPending ? <Spinner label="جارٍ تحميل تفاصيل الطلب…" /> : null}
      {order.isError ? <Notice tone="error">تعذر تحميل تفاصيل الطلب.</Notice> : null}
      {data ? (
        <div className="order-detail">
          <section><h3>العميل</h3><p><strong>{data.customer.name}</strong><br /><span dir="ltr">{data.customer.phoneNumber}</span><br />{data.customer.email ?? 'لا يوجد بريد'}</p></section>
          <section><h3>العنوان</h3><p>{data.address.city}، {data.address.area}، {data.address.street}، مبنى {data.address.building}{data.address.floor ? `، دور ${data.address.floor}` : ''}{data.address.apartment ? `، شقة ${data.address.apartment}` : ''}</p>{data.address.notes ? <p className="hint">{data.address.notes}</p> : null}</section>
          <section><h3>العناصر</h3><ul className="order-items">{data.items.map(item => <li key={`${item.productID}:${item.variantID}`}><img src={item.imageURL} alt="" /><span>{ar(item.productName)} - {ar(item.variantLabel)} × {item.quantity}</span><strong>{money(item.lineTotalMinor, item.currencyCode)}</strong></li>)}</ul></section>
          <section><h3>الأسعار والدفع</h3><dl className="summary"><div><dt>المجموع الفرعي</dt><dd>{money(data.subtotalMinor, data.currencyCode)}</dd></div><div><dt>التوصيل</dt><dd>{money(data.deliveryFeeMinor, data.currencyCode)}</dd></div><div><dt>الخصم</dt><dd>{money(data.discountMinor, data.currencyCode)}</dd></div><div><dt>الإجمالي</dt><dd>{money(data.totalMinor, data.currencyCode)}</dd></div><div><dt>الدفع</dt><dd>{data.payment.method} / {data.payment.status}</dd></div></dl></section>
          <section><h3>الحالة</h3><p><span className={`tag order-status order-status--${data.status}`}>{statusLabel[data.status]}</span></p><div className="status-actions">{nextStatuses[data.status].map(status => <button key={status} type="button" className={status === 'cancelled' ? 'danger-ghost' : 'primary'} onClick={() => void move(status)} disabled={mutation.isPending}>{statusLabel[status]}</button>)}</div></section>
          <section><h3>سجل الحالة</h3><ol className="status-history">{data.statusHistory.map(item => <li key={`${item.status}:${item.at}`}><strong>{statusLabel[item.status]}</strong><time dateTime={item.at}>{dateTime.format(new Date(item.at))}</time></li>)}</ol></section>
        </div>
      ) : null}
    </FormDialog>
  );
}
