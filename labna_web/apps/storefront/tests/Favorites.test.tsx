import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCard } from '../src/components';
import { AccountProviders, createTestClient } from './providers';
import type { PublicProduct } from '../src/types';

const product = {
  id: 'milk-full',
  categoryID: 'milk',
  name: { ar: 'لبن كامل الدسم', en: 'Full fat milk' },
  description: { ar: 'وصف', en: 'Description' },
  imageURLs: ['https://example.test/milk.png'],
  isFeatured: false,
  variants: [{ id: 'milk-full-1l', label: { ar: '١ لتر', en: '1L' }, priceMinor: 3500, currencyCode: 'EGP', isActive: true, isAvailable: true, availableQuantity: 10, unit: 'ml' }],
} as unknown as PublicProduct;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), { status, headers: { 'content-type': 'application/json' } });
}

const customer = { id: 'cust-1', name: 'Customer', phoneNumber: '+201012345678', email: 'customer@example.com', addresses: [], createdAt: new Date().toISOString() };

/** Records every favorites request so the merge and toggles can be asserted. */
function stubFavoritesApi(options: { authenticated?: boolean; favorites?: string[] } = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let favorites = [...(options.favorites ?? [])];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/customer/auth/refresh')) {
      if (!options.authenticated) return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'No session' } }, 401);
      return jsonResponse({ accessToken: 'token-123', customer });
    }
    if (url.includes('/customer/favorites')) {
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST') {
        const { productID } = JSON.parse(String(init?.body ?? '{}')) as { productID: string };
        favorites = [productID, ...favorites.filter((id) => id !== productID)];
        return jsonResponse({ productID, createdAt: new Date().toISOString() }, 201);
      }
      if (method === 'DELETE') {
        const id = decodeURIComponent(url.split('/customer/favorites/')[1]);
        favorites = favorites.filter((item) => item !== id);
        return jsonResponse({ deleted: true, productID: id });
      }
      return jsonResponse({ favorites: favorites.map((productID, index) => ({ productID, createdAt: new Date(Date.now() - index).toISOString() })) });
    }
    if (url.includes('/customer/me')) return jsonResponse(customer);
    return jsonResponse([]);
  }) as typeof fetch;
  return calls;
}

function renderCard({ authenticated = false }: { authenticated?: boolean } = {}) {
  const client = createTestClient();
  stubFavoritesApi({ authenticated });
  render(
    <AccountProviders client={client}>
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    </AccountProviders>,
  );
  return client;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('labna.locale', 'en');
  document.body.innerHTML = '';
});

describe('Favorites', () => {
  it('saves and removes a favourite for a guest without requiring an account', async () => {
    const user = userEvent.setup();
    renderCard();
    const button = await screen.findByRole('button', { name: /favorites/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(JSON.parse(localStorage.getItem('labna.favorites.v1') ?? '[]')).toEqual(['milk-full']);

    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(JSON.parse(localStorage.getItem('labna.favorites.v1') ?? '[]')).toEqual([]);
  });

  it('merges guest favourites into the account on sign-in and clears the local copy', async () => {
    localStorage.setItem('labna.favorites.v1', JSON.stringify(['milk-full', 'yogurt']));
    const client = createTestClient();
    const calls = stubFavoritesApi({ authenticated: true, favorites: [] });

    render(
      <AccountProviders client={client}>
        <MemoryRouter>
          <ProductCard product={product} />
        </MemoryRouter>
      </AccountProviders>,
    );

    await waitFor(() => {
      const saved = calls.filter((call) => call.method === 'POST' && call.url.includes('/customer/favorites'));
      expect(saved.map((call) => (call.body as { productID: string }).productID).sort()).toEqual(['milk-full', 'yogurt']);
    });
    await waitFor(() => expect(localStorage.getItem('labna.favorites.v1')).toBe('[]'));
    // The account list, not the guest copy, is what the UI reflects afterwards.
    await waitFor(() => expect(screen.getByRole('button', { name: /favorites/i })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('removes a favourite from the account when a signed-in customer untoggles it', async () => {
    const user = userEvent.setup();
    const client = createTestClient();
    const calls = stubFavoritesApi({ authenticated: true, favorites: ['milk-full'] });

    render(
      <AccountProviders client={client}>
        <MemoryRouter>
          <ProductCard product={product} />
        </MemoryRouter>
      </AccountProviders>,
    );

    const button = await screen.findByRole('button', { name: /favorites/i });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    await user.click(button);
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.url.includes('/customer/favorites/milk-full'))).toBe(true));
  });
});
