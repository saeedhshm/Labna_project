import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CartProvider } from '../src/cart';
import { LanguageProvider } from '../src/i18n';
import { CartPage } from '../src/pages/CartPage';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const validCart = (quantity = 2) => ({
  branchID: 'demo-cairo',
  currencyCode: 'EGP',
  subtotalMinor: 3500 * quantity,
  valid: true,
  items: [
    {
      productID: 'milk-full',
      variantID: 'milk-full-1l',
      quantity,
      productName: { ar: 'حليب كامل الدسم', en: 'Full cream milk' },
      variantLabel: { ar: '١ لتر', en: '1 L' },
      imageURL: 'https://images.unsplash.com/photo-1?w=400',
      unit: 'ml',
      variantQuantity: 1000,
      currencyCode: 'EGP',
      unitPriceMinor: 3500,
      lineTotalMinor: 3500 * quantity,
      availableQuantity: 8,
      valid: true,
      reason: 'ok',
    },
  ],
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <CartProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </CartProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
  render(<CartPage />, { wrapper });
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
  localStorage.removeItem('labna.cart.v1');
  localStorage.removeItem('labna.cart.prices.v1');
});

describe('CartPage', () => {
  it('renders the restored empty-cart state', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/products');
  });

  it('validates stored cart lines against the backend and renders totals', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body ?? '{}')));
        return jsonResponse(validCart(2));
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Review items before checkout' })).toBeInTheDocument();
    expect(await screen.findByText('Full cream milk')).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
    expect(screen.getByText('Cart summary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout');
    expect(calls[0]).toEqual({ items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }] });
  });

  it('updates quantity and persists the new line quantity', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { items: Array<{ quantity: number }> };
        return jsonResponse(validCart(body.items[0]?.quantity ?? 1));
      }),
    );

    renderPage();
    await screen.findByText('Full cream milk');
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('labna.cart.v1') ?? '[]')).toEqual([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 3 }]);
    });
  });

  it('removes and clears items without leaving a stale page', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 1 }]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(validCart(1))),
    );

    renderPage();
    await screen.findByText('Full cream milk');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('labna.cart.v1') ?? '[]')).toEqual([]);
  });
  it('explains a price change and keeps charging the server price', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    // The shopper added this line at 3000, and the catalog now charges 3500.
    localStorage.setItem('labna.cart.prices.v1', JSON.stringify({ 'milk-full:milk-full-1l': 3000 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(validCart(2))),
    );

    renderPage();

    expect(await screen.findByText(/Price changed/)).toBeInTheDocument();
    expect(screen.getByText(/server-calculated price is what will be charged/i)).toBeInTheDocument();
    // The authoritative total is the server one, not the remembered price: the
    // line total and the summary subtotal both read 70.00, and the 60.00 the
    // old price would have produced never appears.
    expect(screen.getAllByText('EGP 70.00')).toHaveLength(2);
    expect(screen.queryByText('EGP 60.00')).toBeNull();
  });

  it('stays quiet when the price has not moved', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    localStorage.setItem('labna.cart.prices.v1', JSON.stringify({ 'milk-full:milk-full-1l': 3500 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(validCart(2))),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: /Review items before checkout/ })).toBeInTheDocument();
    expect(screen.queryByText(/Price changed/)).toBeNull();
  });

  it('forgets the remembered price once the line is removed', async () => {
    const user = userEvent.setup();
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    localStorage.setItem('labna.cart.prices.v1', JSON.stringify({ 'milk-full:milk-full-1l': 3000 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(validCart(2))),
    );

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(localStorage.getItem('labna.cart.prices.v1')).toBe('{}'));
  });
});
