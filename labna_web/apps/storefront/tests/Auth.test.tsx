import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const customer = {
  id: 'customer-1',
  name: 'Customer One',
  phoneNumber: '+201012345678',
  email: 'customer@example.com',
  addresses: [],
  createdAt: '2026-10-03T00:00:00.000Z',
};
type TestAddress = {
  id: string;
  label: string;
  recipientName?: string;
  phoneNumber?: string;
  city: string;
  area: string;
  street: string;
  building: string;
  floor?: string;
  apartment?: string;
  notes?: string;
  isDefault: boolean;
};

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), { status, headers: { 'content-type': 'application/json' } });
}

function authPayload(overrides: Record<string, unknown> = {}) {
  return { accessToken: 'access-token', expiresIn: 900, customer: { ...customer, ...overrides } };
}

function route(path: string) {
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
  localStorage.removeItem('labna.cart.v1');
  route('/');
});

describe('customer authentication', () => {
  it('registers a customer, authenticates them, and restores the session after reload', async () => {
    let restore = false;
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('/customer/auth/refresh')) return restore ? apiResponse(authPayload()) : apiResponse({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } }, 401);
      if (url.includes('/customer/auth/register')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ name: 'Customer One', email: 'customer@example.com', phoneNumber: '+201012345678', password: 'password123' });
        restore = true;
        return apiResponse(authPayload());
      }
      return apiResponse([], 200);
    }));

    route('/register');
    const first = render(<App />);
    await userEvent.type(await screen.findByLabelText('Name'), 'Customer One');
    await userEvent.type(screen.getByLabelText('Email'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('Phone number'), '+201012345678');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'My Account' })).toBeInTheDocument();
    expect(screen.getByText('Customer One', { selector: 'summary' })).toBeInTheDocument();
    first.unmount();

    route('/account');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'My Account' })).toBeInTheDocument();
    expect(screen.getByText('Customer One', { selector: 'summary' })).toBeInTheDocument();
    expect(requests.filter(url => url.includes('/customer/auth/refresh')).length).toBeGreaterThanOrEqual(2);
  });

  it('updates profile details, refreshes header state, and restores updated details after reload', async () => {
    let current = { ...customer };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/customer/auth/refresh')) return apiResponse(authPayload(current));
      if (url.includes('/customer/me') && init?.method === 'PATCH') {
        current = { ...current, ...JSON.parse(String(init.body)) };
        return apiResponse(current);
      }
      return apiResponse([], 200);
    }));

    route('/account');
    const first = render(<App />);
    expect(await screen.findByRole('heading', { name: 'My Account' })).toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Updated Customer');
    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'updated@example.com');
    await userEvent.clear(screen.getByLabelText('Phone number'));
    await userEvent.type(screen.getByLabelText('Phone number'), '+201012345679');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Account details saved.');
    expect(screen.getByText('Updated Customer', { selector: 'summary' })).toBeInTheDocument();
    expect(screen.getByText('updated@example.com')).toBeInTheDocument();
    first.unmount();

    route('/account');
    render(<App />);
    expect(await screen.findByText('Updated Customer', { selector: 'summary' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('updated@example.com')).toBeInTheDocument();
  });

  it('shows duplicate email errors while editing the profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/customer/auth/refresh')) return apiResponse(authPayload());
      if (url.includes('/customer/me') && init?.method === 'PATCH') return apiResponse({ error: { code: 'DUPLICATE_RESOURCE', message: 'Identifier or SKU already exists' } }, 409);
      return apiResponse([], 200);
    }));

    route('/account');
    render(<App />);
    await screen.findByRole('heading', { name: 'My Account' });
    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  });

  it('logs in, opens account, logs out, and blocks protected routes afterwards', async () => {
    let loggedIn = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/customer/auth/refresh')) return loggedIn ? apiResponse(authPayload()) : apiResponse({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } }, 401);
      if (url.includes('/customer/auth/login')) {
        loggedIn = true;
        return apiResponse(authPayload());
      }
      if (url.includes('/customer/auth/logout')) {
        loggedIn = false;
        return apiResponse({ loggedOut: true });
      }
      return apiResponse([], 200);
    }));

    route('/login');
    const first = render(<App />);
    await userEvent.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'My Account' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Logout' })[0]);
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    first.unmount();

    route('/account/orders');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('shows the backend duplicate-account error during registration', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/customer/auth/refresh')) return apiResponse({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } }, 401);
      if (url.includes('/customer/auth/register')) return apiResponse({ error: { code: 'DUPLICATE_RESOURCE', message: 'Identifier or SKU already exists' } }, 409);
      return apiResponse([], 200);
    }));

    route('/register');
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Name'), 'Customer One');
    await userEvent.type(screen.getByLabelText('Email'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('Phone number'), '+201012345678');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  });

  it('manages addresses end-to-end and restores the MongoDB-backed state after reload', async () => {
    let loggedIn = false;
    let current = { ...customer, addresses: [] as TestAddress[] };
    let nextID = 1;
    const normalize = () => {
      let seenDefault = false;
      current.addresses = current.addresses.map((address) => {
        const isDefault = address.isDefault && !seenDefault;
        if (isDefault) seenDefault = true;
        return { ...address, isDefault };
      });
      if (current.addresses.length && !seenDefault) current.addresses[0] = { ...current.addresses[0], isDefault: true };
    };
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/customer/auth/refresh')) return loggedIn ? apiResponse(authPayload(current)) : apiResponse({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } }, 401);
      if (url.includes('/customer/auth/login')) {
        loggedIn = true;
        return apiResponse(authPayload(current));
      }
      if (url.includes('/customer/me')) return apiResponse(current);
      if (url.includes('/customer/addresses') && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        const address = { id: `addr-${nextID++}`, ...body, isDefault: body.isDefault || current.addresses.length === 0 } as TestAddress;
        if (address.isDefault) current.addresses = current.addresses.map(item => ({ ...item, isDefault: false }));
        current.addresses.push(address);
        normalize();
        return apiResponse(address, 201);
      }
      const defaultMatch = url.match(/\/customer\/addresses\/([^/]+)\/default/);
      if (defaultMatch && method === 'PATCH') {
        current.addresses = current.addresses.map(item => ({ ...item, isDefault: item.id === defaultMatch[1] }));
        return apiResponse(current.addresses.find(item => item.id === defaultMatch[1]));
      }
      const addressMatch = url.match(/\/customer\/addresses\/([^/]+)/);
      if (addressMatch && method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        current.addresses = current.addresses.map(item => item.id === addressMatch[1] ? { ...item, ...body } : body.isDefault ? { ...item, isDefault: false } : item);
        normalize();
        return apiResponse(current.addresses.find(item => item.id === addressMatch[1]));
      }
      if (addressMatch && method === 'DELETE') {
        current.addresses = current.addresses.filter(item => item.id !== addressMatch[1]);
        normalize();
        return apiResponse({ deleted: true, addresses: current.addresses });
      }
      return apiResponse([], 200);
    }));

    route('/login');
    const first = render(<App />);
    await userEvent.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('heading', { name: 'My Account' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('link', { name: 'Addresses' }).at(-1)!);
    expect(await screen.findByRole('heading', { name: 'Addresses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No saved addresses' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Address label'), 'Home');
    await userEvent.type(screen.getByLabelText('City'), 'Cairo');
    await userEvent.type(screen.getByLabelText('Area'), 'Maadi');
    await userEvent.type(screen.getByLabelText('Street'), 'Road 9');
    await userEvent.type(screen.getByLabelText('Building'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Add Address' }));
    expect(await screen.findByText('Default')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Address label'), 'Work');
    await userEvent.type(screen.getByLabelText('City'), 'Cairo');
    await userEvent.type(screen.getByLabelText('Area'), 'Zamalek');
    await userEvent.type(screen.getByLabelText('Street'), 'Office St');
    await userEvent.type(screen.getByLabelText('Building'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Add Address' }));
    expect(await screen.findByText('Work')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await userEvent.clear(screen.getByLabelText('Address label'));
    await userEvent.type(screen.getByLabelText('Address label'), 'Home Updated');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Home Updated')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Set as Default' }).find(button => !button.hasAttribute('disabled'))!);
    expect(current.addresses.find(item => item.label === 'Work')?.isDefault).toBe(true);
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(await screen.findByText('Home Updated')).toBeInTheDocument();
    expect(current.addresses).toHaveLength(1);
    expect(current.addresses[0]).toMatchObject({ label: 'Home Updated', isDefault: true });
    first.unmount();

    route('/account/addresses');
    render(<App />);
    expect(await screen.findByText('Home Updated')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows customer order history, detail tracking, cancellation, and refreshed admin status', async () => {
    const baseOrder = {
      id: 'order-1',
      orderNumber: 'LBN-TEST-1',
      customerID: 'customer-1',
      customer: { name: 'Customer One', phoneNumber: '+201012345678', email: 'customer@example.com' },
      address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '', apartment: '', notes: '' },
      branchID: 'main',
      items: [{ productID: 'milk-full', variantID: 'milk-full-1l', productName: { ar: 'لبن', en: 'Milk' }, variantLabel: { ar: '1 لتر', en: '1 L' }, imageURL: 'https://images.unsplash.com/photo-1?w=400', quantity: 2, unit: 'ml', variantQuantity: 1000, currencyCode: 'EGP', unitPriceMinor: 3500, lineTotalMinor: 7000 }],
      currencyCode: 'EGP',
      subtotalMinor: 7000,
      deliveryFeeMinor: 1500,
      discountMinor: 0,
      totalMinor: 8500,
      couponCode: '',
      payment: { method: 'cash_on_delivery', status: 'pending', providerReference: null },
      status: 'pending',
      statusHistory: [{ status: 'pending', at: '2026-10-03T10:00:00.000Z', actorID: null }],
      createdAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    };
    let order: Record<string, unknown> = { ...baseOrder };
    let adminAdvanced = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/customer/auth/refresh')) return apiResponse(authPayload());
      if (url.includes('/customer/orders/LBN-TEST-1/cancel')) {
        order = { ...order, status: 'cancelled', statusHistory: [...(order.statusHistory as unknown[]), { status: 'cancelled', at: '2026-10-03T10:05:00.000Z', actorID: 'customer-1' }] };
        return apiResponse(order);
      }
      if (url.includes('/customer/orders/LBN-TEST-1')) {
        if (adminAdvanced && order.status === 'pending') order = { ...order, status: 'confirmed', statusHistory: [...(order.statusHistory as unknown[]), { status: 'confirmed', at: '2026-10-03T10:10:00.000Z', actorID: 'admin' }] };
        return apiResponse(order);
      }
      if (url.includes('/customer/orders')) return apiResponse([order]);
      return apiResponse([], 200);
    }));

    route('/account/orders');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'My Orders' })).toBeInTheDocument();
    expect(screen.getByText('LBN-TEST-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Milk' }));
    expect(await screen.findByRole('heading', { name: 'LBN-TEST-1' })).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect((await screen.findAllByText('Cancelled')).length).toBeGreaterThan(0);

    order = { ...baseOrder };
    adminAdvanced = true;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect((await screen.findAllByText('Confirmed')).length).toBeGreaterThan(0);
  });
});
