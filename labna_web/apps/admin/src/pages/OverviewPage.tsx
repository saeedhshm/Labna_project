import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { OrderStatus } from '@labna/contracts';
import { useDashboardMetrics } from '../api/queries';
import { Panel, Spinner, Notice } from '../components/Primitives';
import { ar, money } from '../lib/format';

const statusLabel: Record<OrderStatus, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'جارٍ التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};
const statuses = Object.keys(statusLabel) as OrderStatus[];

const dateInput = (date: Date) => date.toISOString().slice(0, 10);

export function OverviewPage() {
  const now = new Date();
  const [draft, setDraft] = useState({ from: dateInput(new Date(now.getTime() - 30 * 86400_000)), to: dateInput(now) });
  const [filters, setFilters] = useState(() => ({ from: `${draft.from}T00:00:00.000Z`, to: `${draft.to}T23:59:59.999Z` }));
  const dashboard = useDashboardMetrics(filters);
  const data = dashboard.data;
  const maxDay = Math.max(1, ...(data?.salesByDay.map(day => day.revenueMinor) ?? [0]));

  return (
    <div className="stack">
      <Panel title="لوحة الأداء">
        <form className="inventory-filters" onSubmit={event => { event.preventDefault(); setFilters({ from: `${draft.from}T00:00:00.000Z`, to: `${draft.to}T23:59:59.999Z` }); }}>
          <label>من<input type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
          <label>إلى<input type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
          <div className="inventory-filters__actions"><button className="primary" type="submit">تطبيق الفترة</button></div>
        </form>
        {dashboard.isPending ? <Spinner label="جارٍ تحميل مؤشرات الأداء…" /> : null}
        {dashboard.isError ? <Notice tone="error">تعذر تحميل مؤشرات الأداء.</Notice> : null}
        {data ? (
          <>
            <div className="tiles dashboard-tiles">
              <article><span>الإيرادات</span><strong>{money(data.revenueMinor, data.currencyCode)}</strong><small>من MongoDB aggregation</small></article>
              <article><span>الطلبات</span><strong>{data.ordersCount}</strong><small>باستثناء الملغاة للإيراد</small></article>
              <article><span>متوسط قيمة الطلب</span><strong>{money(data.averageOrderValueMinor, data.currencyCode)}</strong><small>Average order value</small></article>
              <article><span>مخزون منخفض</span><strong>{data.lowStockCount}</strong><small>{data.outOfStockCount} نفد المخزون</small></article>
            </div>
            <section className="dashboard-grid">
              <article className="dashboard-card">
                <h3>الطلبات حسب الحالة</h3>
                <div className="status-bars">{statuses.map(status => {
                  const value = data.ordersByStatus[status] ?? 0;
                  const max = Math.max(1, ...statuses.map(item => data.ordersByStatus[item] ?? 0));
                  return <div key={status}><span>{statusLabel[status]}</span><meter min="0" max={max} value={value} /><strong>{value}</strong></div>;
                })}</div>
              </article>
              <article className="dashboard-card">
                <h3>أفضل المنتجات</h3>
                {data.topProducts.length === 0 ? <p className="hint">لا توجد مبيعات في الفترة.</p> : <ol className="top-products">{data.topProducts.map(product => <li key={product.productID}><span>{ar(product.name)}</span><strong>{product.unitsSold} وحدة</strong><small>{money(product.revenueMinor, data.currencyCode)}</small></li>)}</ol>}
              </article>
              <article className="dashboard-card dashboard-card--wide">
                <h3>المبيعات اليومية</h3>
                {data.salesByDay.length === 0 ? <p className="hint">لا توجد مبيعات في الفترة.</p> : <div className="sales-chart">{data.salesByDay.map(day => <div key={day.date} style={{ '--bar': `${Math.max(6, Math.round(day.revenueMinor / maxDay * 100))}%` } as CSSProperties}><span>{day.date.slice(5)}</span><b>{money(day.revenueMinor, data.currencyCode)}</b></div>)}</div>}
              </article>
              <article className="dashboard-card dashboard-card--wide">
                <h3>المبيعات الأسبوعية</h3>
                {data.salesByWeek.length === 0 ? <p className="hint">لا توجد مبيعات أسبوعية في الفترة.</p> : <div className="weekly-list">{data.salesByWeek.map(week => <div key={week.week}><span>{week.week}</span><strong>{money(week.revenueMinor, data.currencyCode)}</strong><small>{week.ordersCount} طلب</small></div>)}</div>}
              </article>
            </section>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
