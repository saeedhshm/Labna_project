import { useState } from 'react';
import {
  inventoryAdjustmentCommand,
  inventoryThresholdPatch,
  type BranchDTO,
  type InventoryDTO,
  type ProductDTO,
} from '@labna/contracts';
import { ApiError } from '../api/client';
import {
  useInventoryAdjustment,
  useInventoryList,
  useInventoryMovements,
  useInventoryThresholdMutation,
  useResourceList,
  type InventoryFilters,
  type MovementFilters,
} from '../api/queries';
import { FormDialog } from '../components/Dialog';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { ar } from '../lib/format';

const integer = /^-?\d+$/;
const nonnegativeInteger = /^\d+$/;

const errorMessage = (failure: unknown, fallback: string) => failure instanceof ApiError ? failure.message : fallback;

export function InventoryPage() {
  const [draft, setDraft] = useState({ branchID: '', variantID: '', stockState: '' });
  const [filters, setFilters] = useState<InventoryFilters>({});
  const [adjusting, setAdjusting] = useState<InventoryDTO | null>(null);
  const [threshold, setThreshold] = useState<InventoryDTO | null>(null);
  const [history, setHistory] = useState<InventoryDTO | null>(null);
  const inventory = useInventoryList(filters);
  const branches = useResourceList<BranchDTO>('branches', 100);
  const products = useResourceList<ProductDTO>('products', 100);
  const rows = inventory.data?.pages.flatMap(page => page.items) ?? [];
  const branchItems = branches.data?.pages.flatMap(page => page.items) ?? [];
  const productItems = products.data?.pages.flatMap(page => page.items) ?? [];
  const branchNames = new Map(branchItems.map(branch => [branch.id, ar(branch.name)]));
  const variantNames = new Map(productItems.flatMap(product => product.variants.map(variant => [variant.id, `${ar(product.name)} - ${ar(variant.label)}`] as const)));

  function applyFilters() {
    setFilters({
      ...(draft.branchID ? { branchID: draft.branchID } : {}),
      ...(draft.variantID.trim() ? { variantID: draft.variantID.trim() } : {}),
      ...(draft.stockState === 'low' ? { lowStock: true } : {}),
      ...(draft.stockState === 'stable' ? { lowStock: false } : {}),
      ...(draft.stockState === 'out' ? { outOfStock: true } : {}),
    });
  }

  function resetFilters() {
    setDraft({ branchID: '', variantID: '', stockState: '' });
    setFilters({});
  }

  return (
    <div className="stack">
      <Panel title="المخزون">
        <form className="inventory-filters" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
          <Field label="الفرع" htmlFor="inventory-branch">
            <select id="inventory-branch" value={draft.branchID} onChange={event => setDraft({ ...draft, branchID: event.target.value })}>
              <option value="">كل الفروع</option>
              {branchItems.map(branch => <option key={branch.id} value={branch.id}>{ar(branch.name)} ({branch.id})</option>)}
            </select>
            {branches.hasNextPage ? <button type="button" className="ghost" onClick={() => void branches.fetchNextPage()} disabled={branches.isFetchingNextPage}>{branches.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد من الفروع'}</button> : null}
          </Field>
          <Field label="معرّف الخيار" htmlFor="inventory-variant" hint="يمكن اختيار خيار معروف أو إدخال المعرّف مباشرة.">
            <input id="inventory-variant" dir="ltr" list="inventory-variants" value={draft.variantID} onChange={event => setDraft({ ...draft, variantID: event.target.value })} />
            <datalist id="inventory-variants">
              {[...variantNames].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </datalist>
            {products.hasNextPage ? <button type="button" className="ghost" onClick={() => void products.fetchNextPage()} disabled={products.isFetchingNextPage}>{products.isFetchingNextPage ? 'جارٍ التحميل…' : 'تحميل خيارات منتجات إضافية'}</button> : null}
          </Field>
          <Field label="حالة المخزون" htmlFor="inventory-low-stock">
            <select id="inventory-low-stock" value={draft.stockState} onChange={event => setDraft({ ...draft, stockState: event.target.value })}>
              <option value="">الكل</option>
              <option value="out">نفد المخزون فقط</option>
              <option value="low">منخفض فقط</option>
              <option value="stable">غير منخفض فقط</option>
            </select>
          </Field>
          <div className="inventory-filters__actions">
            <button type="submit" className="primary">تطبيق</button>
            <button type="button" className="ghost" onClick={resetFilters}>إعادة ضبط</button>
          </div>
        </form>
        {inventory.isPending ? <Spinner label="جارٍ تحميل المخزون…" /> : null}
        {inventory.isError ? <Notice tone="error">تعذر تحميل المخزون.</Notice> : null}
        {rows.length === 0 && inventory.isSuccess ? <EmptyState>لا توجد سجلات تطابق عوامل التصفية.</EmptyState> : null}
        {rows.length ? (
          <>
            <div className="table-scroll">
              <table className="table inventory-table">
                <thead>
                  <tr>
                    <th scope="col">الفرع</th>
                    <th scope="col">الخيار</th>
                    <th scope="col">المتوفر فعليًا</th>
                    <th scope="col">المحجوز</th>
                    <th scope="col">المتاح</th>
                    <th scope="col">حد التنبيه</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className={row.lowStock ? 'inventory-row--low' : undefined}>
                      <td><strong>{branchNames.get(row.branchID) || 'فرع غير محمّل'}</strong><small><code>{row.branchID}</code></small></td>
                      <td><strong>{variantNames.get(row.variantID) || 'خيار غير محمّل'}</strong><small><code>{row.variantID}</code></small></td>
                      <td className="stock-number">{row.onHand}</td>
                      <td className="stock-number">{row.reserved}</td>
                      <td className="stock-number"><strong>{row.available}</strong></td>
                      <td className="stock-number">{row.lowStockThreshold}</td>
                      <td><span className={row.available === 0 ? 'tag tag--danger' : row.lowStock ? 'tag tag--low' : 'tag tag--ok'}>{row.available === 0 ? 'نفد المخزون' : row.lowStock ? 'مخزون منخفض' : 'مستقر'}</span></td>
                      <td className="table__actions">
                        <button type="button" className="ghost" onClick={() => setAdjusting(row)}>تعديل الكمية</button>
                        <button type="button" className="ghost" onClick={() => setThreshold(row)}>تعديل الحد</button>
                        <button type="button" className="ghost" onClick={() => setHistory(row)}>السجل</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inventory.hasNextPage ? (
              <button type="button" className="ghost" onClick={() => void inventory.fetchNextPage()} disabled={inventory.isFetchingNextPage}>
                {inventory.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}
              </button>
            ) : <p className="hint">تم عرض كل سجلات المخزون.</p>}
          </>
        ) : null}
      </Panel>
      {adjusting ? <AdjustmentDialog row={adjusting} label={variantNames.get(adjusting.variantID)} onClose={() => setAdjusting(null)} /> : null}
      {threshold ? <ThresholdDialog row={threshold} onClose={() => setThreshold(null)} /> : null}
      {history ? <MovementDialog row={history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

function AdjustmentDialog({ row, label, onClose }: { row: InventoryDTO; label?: string; onClose: () => void }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useInventoryAdjustment();
  const parsedDelta = integer.test(delta.trim()) ? Number(delta) : undefined;
  const projected = parsedDelta === undefined ? undefined : row.onHand + parsedDelta;

  async function submit() {
    setError(undefined);
    const parsed = inventoryAdjustmentCommand.safeParse({
      branchID: row.branchID,
      variantID: row.variantID,
      onHandDelta: parsedDelta,
      reason,
      version: row.version,
    });
    if (!parsed.success || projected === undefined || projected < row.reserved) {
      setError(projected !== undefined && projected < row.reserved
        ? `لا يمكن أن تصبح الكمية الفعلية أقل من المحجوز (${row.reserved}).`
        : 'أدخل تغييرًا صحيحًا غير صفري وسببًا واضحًا.');
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, 'تعذر تعديل كمية المخزون.'));
    }
  }

  return (
    <FormDialog title={`تعديل كمية ${label || row.variantID}`} submitLabel="تسجيل التعديل" onClose={onClose} onSubmit={() => void submit()} error={error} busy={mutation.isPending}>
      <Notice tone="info">المتوفر فعليًا: {row.onHand}، المحجوز للطلبات: {row.reserved}. الكمية المحجوزة للقراءة فقط.</Notice>
      <Field label="التغيير الموقّع" htmlFor="inventory-delta" hint="استخدم عددًا موجبًا للإضافة أو سالبًا للخصم.">
        <input id="inventory-delta" type="number" step="1" dir="ltr" value={delta} onChange={event => setDelta(event.target.value)} placeholder="مثال: 10 أو -3" required />
      </Field>
      <Field label="السبب" htmlFor="inventory-reason">
        <textarea id="inventory-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} required />
      </Field>
      <dl className="summary inventory-projection">
        <div><dt>الكمية بعد التعديل</dt><dd>{projected ?? '—'}</dd></div>
        <div><dt>المتاح بعد التعديل</dt><dd>{projected === undefined ? '—' : projected - row.reserved}</dd></div>
      </dl>
    </FormDialog>
  );
}

function ThresholdDialog({ row, onClose }: { row: InventoryDTO; onClose: () => void }) {
  const [value, setValue] = useState(String(row.lowStockThreshold));
  const [error, setError] = useState<string>();
  const mutation = useInventoryThresholdMutation();

  async function submit() {
    setError(undefined);
    const parsed = inventoryThresholdPatch.safeParse({ version: row.version, lowStockThreshold: nonnegativeInteger.test(value.trim()) ? Number(value) : undefined });
    if (!parsed.success) {
      setError('أدخل حدًا صحيحًا يساوي صفرًا أو أكبر.');
      return;
    }
    try {
      await mutation.mutateAsync({ id: row.id, payload: parsed.data });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, 'تعذر تعديل حد التنبيه.'));
    }
  }

  return (
    <FormDialog title="تعديل حد المخزون المنخفض" submitLabel="حفظ الحد" onClose={onClose} onSubmit={() => void submit()} error={error} busy={mutation.isPending}>
      <Notice tone="info">المتاح حاليًا: {row.available}. تظهر حالة المخزون المنخفض عندما يكون المتاح أقل من الحد أو مساويًا له.</Notice>
      <Field label="حد التنبيه" htmlFor="inventory-threshold">
        <input id="inventory-threshold" type="number" min="0" step="1" dir="ltr" value={value} onChange={event => setValue(event.target.value)} required />
      </Field>
    </FormDialog>
  );
}

function MovementDialog({ row, onClose }: { row: InventoryDTO; onClose: () => void }) {
  const [dates, setDates] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState<MovementFilters>({ inventoryID: row.id });
  const invalidRange = Boolean(dates.from && dates.to && dates.from > dates.to);
  const movements = useInventoryMovements(filters);
  const items = movements.data?.pages.flatMap(page => page.items) ?? [];

  function applyDates() {
    if (invalidRange) return;
    setFilters({
      inventoryID: row.id,
      ...(dates.from ? { from: `${dates.from}T00:00:00.000Z` } : {}),
      ...(dates.to ? { to: `${dates.to}T23:59:59.999Z` } : {}),
    });
  }

  return (
    <div className="dialog__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`سجل حركة ${row.variantID}`}>
        <header className="dialog__header">
          <h2>سجل حركة المخزون</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="إغلاق">✕</button>
        </header>
        <div className="dialog__body">
          <p className="hint">الخيار <code>{row.variantID}</code> في الفرع <code>{row.branchID}</code></p>
          <form className="movement-filters" onSubmit={event => { event.preventDefault(); applyDates(); }}>
            <Field label="من تاريخ" htmlFor="movement-from"><input id="movement-from" type="date" value={dates.from} onChange={event => setDates({ ...dates, from: event.target.value })} /></Field>
            <Field label="إلى تاريخ" htmlFor="movement-to" error={invalidRange ? 'يجب ألا يسبق تاريخ النهاية تاريخ البداية.' : undefined}><input id="movement-to" type="date" value={dates.to} onChange={event => setDates({ ...dates, to: event.target.value })} /></Field>
            <div className="inventory-filters__actions">
              <button type="submit" className="primary" disabled={invalidRange}>تطبيق</button>
              <button type="button" className="ghost" onClick={() => { setDates({ from: '', to: '' }); setFilters({ inventoryID: row.id }); }}>إعادة ضبط</button>
            </div>
          </form>
          {movements.isPending ? <Spinner label="جارٍ تحميل سجل الحركة…" /> : null}
          {movements.isError ? <Notice tone="error">تعذر تحميل سجل الحركة. هذه العملية متاحة للمدير فقط.</Notice> : null}
          {movements.isSuccess && items.length === 0 ? <EmptyState>لا توجد حركات في هذه الفترة.</EmptyState> : null}
          {items.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th scope="col">التاريخ</th><th scope="col">الفعلية</th><th scope="col">المحجوزة</th><th scope="col">السبب</th><th scope="col">المنفذ</th></tr></thead>
                <tbody>{items.map(item => (
                  <tr key={item.id}>
                    <td><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></td>
                    <td className="stock-number">{item.onHandDelta > 0 ? `+${item.onHandDelta}` : item.onHandDelta}</td>
                    <td className="stock-number">{item.reservedDelta > 0 ? `+${item.reservedDelta}` : item.reservedDelta}</td>
                    <td>{item.reason}</td>
                    <td><code>{item.actorID}</code></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
          {movements.hasNextPage ? <button type="button" className="ghost" onClick={() => void movements.fetchNextPage()} disabled={movements.isFetchingNextPage}>{movements.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}</button> : null}
        </div>
        <footer className="dialog__footer"><button type="button" className="ghost" onClick={onClose}>إغلاق</button></footer>
      </div>
    </div>
  );
}
