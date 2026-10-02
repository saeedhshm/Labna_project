import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryPage } from '../src/pages/InventoryPage';

const inventory = {
  id: '11111111-1111-4111-8111-111111111111',
  branchID: 'cairo',
  variantID: 'milk-1l',
  onHand: 10,
  reserved: 2,
  available: 8,
  lowStockThreshold: 8,
  lowStock: true,
  version: 3,
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const text = { ar: 'لبن كامل', en: 'Full milk' };
const page = (data: unknown) => new Response(JSON.stringify({ data, meta: { requestID: 'req_1', nextCursor: null } }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

function setup(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><InventoryPage /></QueryClientProvider>);
}

function inventoryFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/admin/inventory?')) return page([inventory]);
    if (url.includes('/admin/branches?')) return page([{ id: 'cairo', version: 1, name: { ar: 'فرع القاهرة', en: 'Cairo' } }]);
    if (url.includes('/admin/products?')) return page([{
      id: 'milk', version: 1, name: text,
      variants: [{ id: 'milk-1l', label: { ar: 'لتر', en: '1 litre' } }],
    }]);
    if (url.endsWith('/admin/inventory/adjustments') && init?.method === 'POST') return page({ ...inventory, onHand: 15, available: 13, lowStock: false });
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('InventoryPage', () => {
  it('renders branch and variant labels, quantities, and a clear low-stock state', async () => {
    setup(inventoryFetch());

    expect(await screen.findByText('فرع القاهرة')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /لبن كامل - لتر/ });
    expect(within(row).getByText('لبن كامل - لتر')).toBeInTheDocument();
    expect(within(row).getByText('مخزون منخفض')).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: '2' })).toBeInTheDocument();
  });

  it('posts a validated adjustment with a fresh UUID idempotency key', async () => {
    const key = '22222222-2222-4222-8222-222222222222';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(key);
    const fetchMock = inventoryFetch();
    setup(fetchMock);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تعديل الكمية' }));
    const dialog = screen.getByRole('dialog', { name: /تعديل كمية/ });
    await user.type(within(dialog).getByLabelText('التغيير الموقّع'), '5');
    await user.type(within(dialog).getByLabelText('السبب'), 'استلام توريد جديد');
    expect(within(dialog).getByText('15')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل التعديل' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => url.endsWith('/admin/inventory/adjustments') && init?.method === 'POST');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({ branchID: 'cairo', variantID: 'milk-1l', onHandDelta: 5, reason: 'استلام توريد جديد', version: 3 });
      expect(new Headers(call![1]?.headers).get('Idempotency-Key')).toBe(key);
    });
  });

  it('blocks a change that would reduce on-hand below reserved stock', async () => {
    const fetchMock = inventoryFetch();
    setup(fetchMock);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تعديل الكمية' }));
    const dialog = screen.getByRole('dialog', { name: /تعديل كمية/ });
    await user.type(within(dialog).getByLabelText('التغيير الموقّع'), '-9');
    await user.type(within(dialog).getByLabelText('السبب'), 'تصحيح جرد');
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل التعديل' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('أقل من المحجوز');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/admin/inventory/adjustments'))).toBe(false);
  });
});
