import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider } from '../src/auth';
import { CartProvider } from '../src/cart';
import { LanguageProvider } from '../src/i18n';
import { CheckoutPage } from '../src/pages/CheckoutPage';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function cartResponse() {
  return {
    branchID: 'demo-cairo',
    currencyCode: 'EGP',
    subtotalMinor: 7000,
    valid: true,
    items: [{
      productID: 'milk-full',
      variantID: 'milk-full-250',
      quantity: 2,
      productName: { ar: 'حليب كامل الدسم', en: 'Full Cream Milk' },
      variantLabel: { ar: '250 مل', en: '250 ml' },
      imageURL: 'https://images.unsplash.com/photo-1?w=400',
      unit: 'ml',
      variantQuantity: 250,
      currencyCode: 'EGP',
      unitPriceMinor: 3500,
      lineTotalMinor: 7000,
      availableQuantity: 10,
      valid: true,
      reason: 'ok',
    }],
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/checkout']}>
              <Routes>
                <Route path="/checkout" element={children} />
                <Route path="/orders/:orderID" element={<h1>Created order</h1>} />
                <Route path="/products" element={<h1>Products</h1>} />
              </Routes>
            </MemoryRouter>
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
  render(<CheckoutPage />, { wrapper });
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
  localStorage.removeItem('labna.cart.v1');
});

describe('CheckoutPage', () => {
  it('redirects an empty cart back to browsing', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Cart is empty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/products');
  });

  it('creates an order from the restored cart flow and clears the cart', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-250', quantity: 2 }]));
    const orderBodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/cart/validate')) return jsonResponse(cartResponse());
      if (url.includes('/orders')) {
        orderBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return jsonResponse({ orderNumber: 'LBN-TEST-1' });
      }
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404);
    }));

    renderPage();
    const place = await screen.findByRole('button', { name: 'Place order' });
    await waitFor(() => expect(place).toBeEnabled());
    await userEvent.click(place);

    expect(await screen.findByRole('heading', { name: 'Created order' })).toBeInTheDocument();
    expect(orderBodies[0]).toMatchObject({
      customer: { name: 'Demo Customer', phoneNumber: '+201012345678', email: 'demo@example.com' },
      address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12' },
      items: [{ productID: 'milk-full', variantID: 'milk-full-250', quantity: 2 }],
      paymentMethod: 'cash_on_delivery',
    });
    await waitFor(() => expect(localStorage.getItem('labna.cart.v1')).toBe('[]'));
  });
});
