import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomersPage } from '../src/pages/CustomersPage';

const envelope = (data: unknown, nextCursor: string | null = null) => new Response(JSON.stringify({ data, meta: { requestID: 'req_1', nextCursor } }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const customer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Alice Buyer',
  email: 'alice@example.com',
  phoneNumber: '+201012345678',
  isActive: true,
  ordersCount: 2,
  totalSpentMinor: 5000,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};
const detail = {
  ...customer,
  addresses: [{ id: 'home', label: 'Home', recipientName: 'Alice Receiver', phoneNumber: '+201012345678', city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '', apartment: '', notes: '', isDefault: true }],
  metrics: { totalOrders: 2, completedOrders: 1, cancelledOrders: 1, totalSpentMinor: 5000, currencyCode: 'EGP' },
};
const order = {
  id: 'order-1',
  orderNumber: 'LBN-20261001-111111',
  customerID: customer.id,
  customer: { name: 'Alice Buyer', phoneNumber: '+201012345678', email: 'alice@example.com' },
  address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '', apartment: '', notes: '' },
  branchID: 'main',
  items: [],
  currencyCode: 'EGP',
  subtotalMinor: 3500,
  deliveryFeeMinor: 1500,
  discountMinor: 0,
  totalMinor: 5000,
  couponCode: '',
  payment: { method: 'cash_on_delivery', status: 'pending', providerReference: null },
  status: 'completed',
  statusHistory: [{ status: 'completed', at: '2026-10-01T10:00:00.000Z', actorID: null }],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

function setup(path: string, fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:customerId" element={<CustomersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomersPage', () => {
  it('renders server-side customer summaries and applies URL-backed filters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/admin/customers?');
      return envelope([customer]);
    });
    setup('/customers', fetchMock);

    expect(await screen.findByText('Alice Buyer')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('نشط').length).toBeGreaterThan(1);
    expect(screen.getByText(/EGP/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('بحث'), 'alice');
    await user.selectOptions(screen.getByLabelText('الحالة'), 'active');
    await user.selectOptions(screen.getByLabelText('الترتيب'), 'spentDesc');
    await user.click(screen.getByRole('button', { name: 'تطبيق' }));

    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('q=alice'));
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('status=active');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('sort=spentDesc');
  });

  it('shows customer details, addresses, orders and confirms deactivation', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith(`/admin/customers/${customer.id}`) && (!init?.method || init.method === 'GET')) return envelope(detail);
      if (url.includes(`/admin/customers/${customer.id}/orders?`)) return envelope([order]);
      if (url.endsWith(`/admin/customers/${customer.id}/status`) && init?.method === 'PATCH') return envelope({ ...detail, isActive: false });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup(`/customers/${customer.id}`, fetchMock);

    expect(await screen.findByRole('heading', { name: 'Alice Buyer' })).toBeInTheDocument();
    expect(screen.getByText('Alice Receiver')).toBeInTheDocument();
    expect(screen.getByText('إجمالي الطلبات')).toBeInTheDocument();
    expect(screen.getByText('LBN-20261001-111111')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'فتح الطلب' })).toHaveAttribute('href', '/orders?order=order-1');

    await userEvent.click(screen.getByRole('button', { name: 'تعطيل العميل' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => url.endsWith('/status') && init?.method === 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({ isActive: false });
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it('renders empty and error states with retry', async () => {
    const empty = setup('/customers', vi.fn().mockResolvedValueOnce(envelope([])));
    expect(await screen.findByText('لا يوجد عملاء مطابقون لعوامل البحث.')).toBeInTheDocument();
    const row = screen.queryByRole('row', { name: /Alice Buyer/ });
    expect(row).toBeNull();
    empty.unmount();

    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(envelope([customer]));
    setup('/customers', fetchMock);
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByText('Alice Buyer')).toBeInTheDocument();
  });
});
