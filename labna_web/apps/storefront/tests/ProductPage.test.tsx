import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n';
import { ProductPage } from '../src/pages/ProductPage';
import { CartProvider } from '../src/cart';

const image = (name: string) => `https://images.unsplash.com/${name}?w=400`;

const makeVariant = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  label: { ar: `عبوة ${id}`, en: `Pack ${id}` },
  quantity: 1000,
  unit: 'ml',
  priceMinor: 3500,
  currencyCode: 'EGP',
  isAvailable: true,
  availableQuantity: 5,
  ...overrides,
});

const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'milk-full',
  categoryID: 'milk',
  name: { ar: 'لبن كامل الدسم', en: 'Full cream milk' },
  description: { ar: 'لبن كامل الدسم طازج', en: 'Fresh full cream milk' },
  ingredients: { ar: 'لبن', en: 'Milk' },
  storageInstructions: { ar: 'يحفظ مبردًا', en: 'Keep refrigerated' },
  imageURLs: [image('milk')],
  isFeatured: true,
  isDemo: false,
  variants: [makeVariant('milk-full-1l')],
  ...overrides,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubApi(routes: Record<string, () => Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((key) => url.includes(key));
    if (!match) return jsonResponse({ error: { message: 'unexpected route' } }, 404);
    return routes[match]();
  }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <CartProvider>
          <MemoryRouter initialEntries={['/products/milk-full']}>
            <Routes>
              <Route path="/products/:productId" element={children} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
  render(<ProductPage />, { wrapper });
  return client;
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
  localStorage.removeItem('labna.cart.v1');
});

describe('ProductPage', () => {
  it('renders a loading skeleton, then the product from the API', async () => {
    stubApi({
      '/api/v1/products/milk-full': () => jsonResponse(makeProduct()),
      '/api/v1/categories': () => jsonResponse([{ id: 'milk', name: { ar: 'الحليب', en: 'Milk' }, imageURL: image('cat'), sortOrder: 0 }]),
    });
    renderPage();
    expect(document.querySelector('.product-detail--loading')).not.toBeNull();
    expect(document.querySelector('.skeleton-card')).not.toBeNull();

    expect(await screen.findByRole('heading', { name: 'Full cream milk' })).toBeInTheDocument();
    expect(screen.getByText('Fresh full cream milk')).toBeInTheDocument();
    expect(screen.getByText('In stock')).toBeInTheDocument();
  });

  it('shows a customer facing not-found state for a missing product', async () => {
    stubApi({ '/api/v1/products/': () => jsonResponse({ error: { message: 'Product not found' } }, 404) });
    renderPage();

    expect(await screen.findByText('This product is not available.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/products');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers a retry when the API fails and recovers', async () => {
    let attempt = 0;
    stubApi({
      '/api/v1/products/': () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse({ error: { message: 'boom' } }, 500)
          : jsonResponse(makeProduct());
      },
    });
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Full cream milk' })).toBeInTheDocument();
  });

  it('updates price, availability and stock when the selected variant changes', async () => {
    const product = makeProduct({
      variants: [
        makeVariant('big', { priceMinor: 8000, availableQuantity: 2 }),
        makeVariant('small', { priceMinor: 3500, availableQuantity: 9 }),
      ],
    });
    stubApi({
      '/api/v1/products/': () => jsonResponse(product),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    await screen.findByRole('heading', { name: 'Full cream milk' });
    const group = screen.getByRole('group', { name: 'Choose a size' });

    // Preselects the first purchasable variant and shows its price.
    expect(within(group).getByRole('radio', { name: /Pack big/ })).toBeChecked();
    expect(screen.getByText('Maximum 2')).toBeInTheDocument();
    const price = () => document.querySelector('.price-panel strong')?.textContent ?? '';
    expect(price()).toContain('80');

    await userEvent.click(within(group).getByRole('radio', { name: /Pack small/ }));
    expect(within(group).getByRole('radio', { name: /Pack small/ })).toBeChecked();
    expect(screen.getByText('Maximum 9')).toBeInTheDocument();
    expect(price()).toContain('35');
  });

  it('never lets an unavailable variant be selected or purchasable', async () => {
    const product = makeProduct({
      variants: [makeVariant('sold-out', { isAvailable: false, availableQuantity: 0, priceMinor: 4200 }), makeVariant('live')],
    });
    stubApi({
      '/api/v1/products/': () => jsonResponse(product),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    await screen.findByRole('heading', { name: 'Full cream milk' });
    const group = screen.getByRole('group', { name: 'Choose a size' });
    const soldOut = within(group).getByRole('radio', { name: /Pack sold-out/ });

    expect(soldOut).toBeDisabled();
    await userEvent.click(soldOut);
    expect(soldOut).not.toBeChecked();
    // Falls back to the purchasable variant so the page stays usable.
    expect(within(group).getByRole('radio', { name: /Pack live/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('disables the quantity controls and the add to cart action when everything is sold out', async () => {
    const product = makeProduct({ variants: [makeVariant('sold-out', { isAvailable: false, availableQuantity: 0 })] });
    stubApi({
      '/api/v1/products/': () => jsonResponse(product),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    await screen.findByRole('heading', { name: 'Full cream milk' });
    // Shown once as the product availability and once per unavailable variant.
    expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Increase quantity')).toBeDisabled();
    expect(screen.getByLabelText('Decrease quantity')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Currently unavailable' })).toBeDisabled();
  });

  it('degrades to a single-image gallery and omits missing optional copy', async () => {
    const product = makeProduct({
      imageURLs: [image('only')],
      ingredients: { ar: '', en: ' ' },
      storageInstructions: { ar: '', en: '' },
      isFeatured: false,
    });
    stubApi({
      '/api/v1/products/': () => jsonResponse(product),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    await screen.findByRole('heading', { name: 'Full cream milk' });
    expect(screen.getAllByRole('img').length).toBe(1);
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    expect(screen.queryByText('Featured product')).not.toBeInTheDocument();
  });

  it('replaces a broken image with an accessible placeholder instead of collapsing', async () => {
    stubApi({
      '/api/v1/products/': () => jsonResponse(makeProduct({ imageURLs: [] })),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    const placeholder = await screen.findByRole('img', { name: 'Full cream milk' });
    expect(placeholder).toHaveClass('image-fallback');
  });

  it('adds the selected variant and quantity to the cart', async () => {
    stubApi({
      '/api/v1/products/': () => jsonResponse(makeProduct()),
      '/api/v1/categories': () => jsonResponse([]),
    });
    renderPage();

    const button = await screen.findByRole('button', { name: 'Add to cart' });
    expect(button).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Increase quantity'));
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText('Total')).toBeInTheDocument());
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('labna.cart.v1') ?? '[]')).toEqual([
        { productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 },
      ]);
    });
  });
});
