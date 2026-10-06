import { act, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AccountProviders, createTestClient, stubSessionRefresh } from './providers';
import { CartProvider } from '../src/cart';
import { RecentlyViewedProvider } from '../src/recently-viewed';
import { HomePage } from '../src/pages/HomePage';
import { CatalogPage } from '../src/pages/CatalogPage';
import { ProductPage } from '../src/pages/ProductPage';
import { CartPage } from '../src/pages/CartPage';

const image = 'https://example.test/milk.png';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Catalog list endpoints answer with the page envelope itself, so the body is
 * not wrapped again the way single-resource responses are.
 */
function pageResponse(items: unknown[]) {
  return new Response(JSON.stringify({ data: items, meta: { nextCursor: null, branchID: 'demo-cairo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const product = (id: string, en: string) => ({
  id,
  categoryID: 'milk',
  name: { ar: `منتج ${id}`, en },
  description: { ar: 'وصف', en: 'Description' },
  ingredients: { ar: 'لبن', en: 'Milk' },
  storageInstructions: { ar: 'يحفظ مبردًا', en: 'Keep refrigerated' },
  imageURLs: [image],
  isFeatured: true,
  isDemo: false,
  variants: [
    { id: `${id}-1l`, sku: `${id}-sku`, label: { ar: '١ لتر', en: '1 L' }, quantity: 1000, unit: 'ml', priceMinor: 3500, currencyCode: 'EGP', isActive: true, isAvailable: true, availableQuantity: 5 },
  ],
});

const cartValidation = {
  branchID: 'demo-cairo',
  currencyCode: 'EGP',
  subtotalMinor: 7000,
  valid: true,
  items: [
    {
      productID: 'milk-full',
      variantID: 'milk-full-1l',
      quantity: 2,
      productName: { ar: 'لبن', en: 'Full Fat Milk' },
      variantLabel: { ar: '١ لتر', en: '1 L' },
      imageURL: image,
      unit: 'ml',
      variantQuantity: 1000,
      currencyCode: 'EGP',
      unitPriceMinor: 3500,
      lineTotalMinor: 7000,
      availableQuantity: 8,
      valid: true,
      reason: 'ok',
    },
  ],
};

function stubApi() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/cart/validate')) return jsonResponse(cartValidation);
    if (url.includes('/products/milk-full')) return jsonResponse(product('milk-full', 'Full Fat Milk'));
    if (url.includes('/products')) return pageResponse([product('milk-full', 'Full Fat Milk')]);
    if (url.includes('/categories')) return pageResponse([{ id: 'milk', name: { ar: 'ألبان', en: 'Milk' }, imageURL: image, sortOrder: 0 }]);
    if (url.includes('/banners')) return pageResponse([]);
    if (url.includes('/branches')) return pageResponse([]);
    return pageResponse([]);
  }) as typeof fetch;
}

/** Only violations a shopper would actually notice fail the build. */
const blocking = new Set(['critical', 'serious']);

async function expectNoBlockingViolations(container: HTMLElement) {
  const results = await axe(container);
  const problems = results.violations.filter((violation) => blocking.has(violation.impact ?? 'critical'));
  expect(problems.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s)`)).toEqual([]);
}

function Wrapper({ children, path }: { children: ReactNode; path: string }) {
  const client = createTestClient();
  return (
    <AccountProviders client={client}>
      <RecentlyViewedProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/" element={children} />
              <Route path="/products" element={children} />
              <Route path="/products/:productId" element={children} />
              <Route path="/cart" element={children} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </RecentlyViewedProvider>
    </AccountProviders>
  );
}

/** `ready` waits for the page content so the audit covers the settled UI, not
 * the loading skeleton. */
async function renderAndCheck(element: ReactNode, path: string, ready: () => Promise<unknown>) {
  stubApi();
  // Wrapped last, so the silent session restore is answered with "no session".
  stubSessionRefresh();
  const { container } = render(element, { wrapper: ({ children }) => <Wrapper path={path}>{children}</Wrapper> });
  await ready();
  // Let the remaining session and favourite queries settle before auditing.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expectNoBlockingViolations(container);
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

describe('Accessibility', () => {
  it('home page has no critical or serious violations', async () => {
    await renderAndCheck(<HomePage />, '/', () => screen.findByRole('heading', { name: 'Shop by need' }));
  });

  it('catalog page has no critical or serious violations', async () => {
    await renderAndCheck(<CatalogPage />, '/products', () => screen.findByLabelText('Search products'));
  });

  it('product page has no critical or serious violations', async () => {
    await renderAndCheck(<ProductPage />, '/products/milk-full', () => screen.findByRole('heading', { name: 'Full Fat Milk' }));
  });

  it('cart page has no critical or serious violations', async () => {
    localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
    await renderAndCheck(<CartPage />, '/cart', () => screen.findByRole('heading', { name: /Review items before checkout/ }));
  });

  it('home page has no serious violations in Arabic RTL', async () => {
    localStorage.setItem('labna.locale', 'ar');
    await renderAndCheck(<HomePage />, '/', () => screen.findByRole('heading', { name: 'اختر حسب احتياجك' }));
    expect(document.documentElement.dir).toBe('rtl');
  });
});
