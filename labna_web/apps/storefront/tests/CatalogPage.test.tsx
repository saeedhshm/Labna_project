import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '../src/i18n';
import { AuthProvider } from '../src/auth';
import { FavoritesProvider } from '../src/favorites';
import { stubSessionRefresh } from './providers';
import { CatalogPage } from '../src/pages/CatalogPage';

const image = 'https://images.unsplash.com/photo-1?w=800';
const category = (id: string, en: string) => ({ id, name: { ar: `قسم ${id}`, en }, imageURL: image, sortOrder: 1 });
const product = (id: string, en: string, priceMinor = 3500) => ({
  id,
  categoryID: 'milk',
  name: { ar: `منتج ${id}`, en },
  description: { ar: 'وصف', en: 'Description' },
  imageURLs: [image],
  isFeatured: true,
  variants: [{ id: `${id}-1l`, label: { ar: '1 لتر', en: '1 L' }, quantity: 1000, unit: 'ml', priceMinor, currencyCode: 'EGP', isAvailable: true }],
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), { status, headers: { 'content-type': 'application/json' } });
}

/** Products page includes meta.nextCursor, so list responses need the envelope. */
function page(items: unknown[], nextCursor: string | null = null) {
  return new Response(JSON.stringify({ data: items, meta: { nextCursor } }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function renderPage(initialEntry = '/products') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <AuthProvider>
          <FavoritesProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
              <Routes>
                <Route path="/products" element={children} />
                <Route path="/categories/:categoryId" element={children} />
              </Routes>
            </MemoryRouter>
          </FavoritesProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
  stubSessionRefresh();
  return render(<CatalogPage />, { wrapper });
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

describe('CatalogPage', () => {
  it('lists products and reflects the sort, availability and featured filters in the request', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk'), category('cheese', 'Cheese')]);
        if (url.includes('/products')) {
          calls.push(url);
          return page([product('milk-full', 'Full Fat Milk'), product('milk-low-fat', 'Low Fat Milk', 2500)]);
        }
        return jsonResponse([]);
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(calls.at(-1)).toContain('sort=featured');

    await userEvent.selectOptions(screen.getByLabelText('Sort products'), 'priceAsc');
    await waitFor(() => expect(calls.at(-1)).toContain('sort=priceAsc'));

    await userEvent.click(screen.getByLabelText('Available only'));
    await waitFor(() => expect(calls.at(-1)).toContain('available=true'));

    await userEvent.click(screen.getByLabelText('Featured only'));
    await waitFor(() => expect(calls.at(-1)).toContain('featured=true'));
  });

  it('debounces rapid typing and shows only the final query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
        if (url.includes('/products')) {
          calls.push(decodeURIComponent(url));
          return page([product('milk-full', 'Full Fat Milk')]);
        }
        return jsonResponse([]);
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    const before = calls.length;

    const input = screen.getByLabelText('Search products');
    await userEvent.type(input, 'che');
    await userEvent.type(input, 'e');
    await userEvent.clear(input);
    await userEvent.type(input, 'labneh');

    // Nothing may be requested while the user is still typing.
    expect(calls.length).toBe(before);
    await waitFor(() => expect(calls.some((url) => url.includes('q=labneh'))).toBe(true));
    // Only the settled value is sent, never the intermediate keystrokes.
    expect(calls.filter((url) => url.includes('q=')).map((url) => url.split('q=')[1].split('&')[0])).toEqual(['labneh']);
    vi.useRealTimers();
  });

  it('keeps the newest results when an older request resolves last', async () => {
    const pending: ((value: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = decodeURIComponent(String(input));
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
        if (url.includes('/products')) {
          if (url.includes('q=')) {
            return new Promise<Response>((resolve) => pending.push(resolve));
          }
          return page([product('milk-full', 'Full Fat Milk')]);
        }
        return jsonResponse([]);
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());

    await userEvent.type(screen.getByLabelText('Search products'), 'zzz');
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));

    // Resolve the last request first, then the earlier ones, out of order.
    const late = product('stale-result', 'Stale Result');
    const fresh = product('fresh-result', 'Fresh Result');
    for (const resolve of [...pending].reverse()) resolve(page([fresh]));
    await waitFor(() => expect(container.querySelector('a[href="/products/fresh-result"]')).not.toBeNull());
    for (const resolve of pending) resolve(page([late]));
    // The superseded response must not overwrite the current result set.
    await waitFor(() => expect(container.querySelector('a[href="/products/stale-result"]')).toBeNull());
    expect(container.querySelector('a[href="/products/fresh-result"]')).not.toBeNull();
  });

  it('shows an empty state and a clear action that actually drops the filters', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
        calls.push(decodeURIComponent(url));
        return page(url.includes('q=') ? [] : [product('milk-full', 'Full Fat Milk')]);
      }),
    );
    const { container } = renderPage();
    expect(await screen.findByText('Full Fat Milk')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search products'), 'nothing-matches');
    await waitFor(() => expect(calls.some((url) => url.includes('q=nothing-matches'))).toBe(true));
    expect(await screen.findByText('No matching products.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    // Clearing must empty the search box and drop q from the next request.
    await waitFor(() => expect((screen.getByLabelText('Search products') as HTMLInputElement).value).toBe(''));
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.queryByText('No matching products.')).not.toBeInTheDocument();
    expect(calls.at(-1)).not.toContain('q=');
  });

  it('offers a retry that recovers from an API failure', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
        if (fail) return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500);
        return page([product('milk-full', 'Full Fat Milk')]);
      }),
    );
    const { container } = renderPage();
    expect(await screen.findByText('Could not load products.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
  });

  it('renders a usable page, not a crash, when the API is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPage();
    expect(await screen.findByText('Could not load products.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Labna products' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search products')).toBeInTheDocument();
  });

  it('falls back to the all-products heading for an unknown category id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
        return page([product('milk-full', 'Full Fat Milk')]);
      }),
    );
    const { container } = renderPage('/products?category=ghost-category');
    // No crash and no misleading category title; results still render.
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'All Labna products' })).toBeInTheDocument();
  });

  it('supports the /categories/:categoryId route shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories') && !url.includes('/api/v1/products')) return jsonResponse([category('milk', 'Milk')]);
        return page([product('milk-full', 'Full Fat Milk')]);
      }),
    );
    const { container } = renderPage('/categories/milk');
    expect(await screen.findByRole('heading', { name: 'Milk' })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
  });

  it('keeps the category filter and offers a way to clear it', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories') && !url.includes('/api/v1/products')) return jsonResponse([category('milk', 'Milk')]);
        if (url.includes('/products')) {
          calls.push(url);
          return page([product('milk-full', 'Full Fat Milk')]);
        }
        return jsonResponse([]);
      }),
    );
    const { container } = renderPage('/products?category=milk');
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(calls.at(-1)).toContain('categoryID=milk');
    await userEvent.click(screen.getByRole('button', { name: 'Clear category' }));
    await waitFor(() => expect(calls.at(-1)).not.toContain('categoryID='));
  });

  it('offers pagination only when the API returns a cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories') && !url.includes('/api/v1/products')) return jsonResponse([category('milk', 'Milk')]);
        if (url.includes('/products')) return page([product('milk-full', 'Full Fat Milk')], url.includes('cursor=') ? null : 'next-page');
        return jsonResponse([]);
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled());
  });

  it('hides pagination entirely when a single page covers the catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories') && !url.includes('/api/v1/products')) return jsonResponse([category('milk', 'Milk')]);
        return page([product('milk-full', 'Full Fat Milk')]);
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders Arabic copy with RTL when the locale is Arabic', async () => {
    localStorage.setItem('labna.locale', 'ar');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/categories') && !url.includes('/api/v1/products')) return jsonResponse([category('milk', 'حليب')]);
        return page([product('milk-full', 'حليب كامل الدسم')]);
      }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'كل منتجات لبنة' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(screen.getByLabelText('بحث في المنتجات')).toBeInTheDocument();
  });
});
