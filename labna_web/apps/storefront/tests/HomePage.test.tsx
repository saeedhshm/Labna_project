import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '../src/i18n';
import { HomePage } from '../src/pages/HomePage';

const image = 'https://images.unsplash.com/photo-1?w=800';

const category = (id: string, en: string) => ({ id, name: { ar: `قسم ${id}`, en }, imageURL: image, sortOrder: 1 });

const product = (id: string, en: string, over: Record<string, unknown> = {}) => ({
  id,
  categoryID: 'milk',
  name: { ar: `منتج ${id}`, en },
  description: { ar: 'وصف', en: 'Description' },
  imageURLs: [image],
  isFeatured: true,
  variants: [{ id: `${id}-1l`, label: { ar: '1 لتر', en: '1 L' }, quantity: 1000, unit: 'ml', priceMinor: 3500, currencyCode: 'EGP', isAvailable: true }],
  ...over,
});

const branch = {
  id: 'demo-cairo',
  name: { ar: 'فرع القاهرة', en: 'Cairo branch' },
  address: { ar: 'وسط القاهرة', en: 'Downtown Cairo' },
  coordinate: { latitude: 30.04, longitude: 31.23 },
  phoneNumber: '+201012345678',
  timeZoneIdentifier: 'Africa/Cairo',
  openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '22:00' }],
  pickupEnabled: true,
  acceptsOrders: true,
  isDemo: true,
  isOpen: true,
  nextOpensAt: null,
};

const banner = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: { ar: 'عنوان', en: 'Banner title' },
  subtitle: { ar: 'وصف', en: 'Subtitle' },
  imageURL: image,
  destination: { kind: 'category', id: 'milk' },
  sortOrder: 1,
  ...over,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), { status, headers: { 'content-type': 'application/json' } });
}

/** Routes each request by path so a test can fail one section in isolation. */
function stubRoutes(routes: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [fragment, handler] of Object.entries(routes)) {
        if (url.includes(fragment)) return handler();
      }
      return jsonResponse([], 200);
    }),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
  return render(<HomePage />, { wrapper });
}

const allRoutes = () => ({
  '/api/v1/banners': () => jsonResponse([banner('fresh-start')]),
  '/api/v1/categories': () => jsonResponse([category('milk', 'Milk'), category('cheese', 'Cheese')]),
  '/api/v1/products': () => jsonResponse([product('milk-full', 'Full Fat Milk')]),
  '/api/v1/branches': () => jsonResponse([branch]),
});

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

describe('HomePage', () => {
  it('renders banners, categories, featured products and branches from the API', async () => {
    stubRoutes(allRoutes());
    const { container } = renderPage();
    expect(await screen.findByRole('link', { name: /Banner title/ })).toBeInTheDocument();
    expect(container.querySelector('a[href="/products?category=milk"]')).not.toBeNull();
    expect(container.querySelector('a[href="/products?category=cheese"]')).not.toBeNull();
    expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull();
    expect(screen.getByText('Cairo branch')).toBeInTheDocument();
  });

  it('requests featured products in the active locale', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/products')) return jsonResponse([product('milk-full', 'Full Fat Milk')]);
      if (url.includes('/banners')) return jsonResponse([banner('fresh-start')]);
      if (url.includes('/categories')) return jsonResponse([category('milk', 'Milk')]);
      return jsonResponse([branch]);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByRole('link', { name: /Banner title/ });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('locale=en') && String(url).includes('featured=true'))).toBe(true);
  });

  it('omits the banner area but keeps the rest of the page when there are no banners', async () => {
    stubRoutes({ ...allRoutes(), '/api/v1/banners': () => jsonResponse([]) });
    const { container } = renderPage();
    // Wait until the slowest section has settled, then assert no banner area appeared.
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.queryByRole('link', { name: /Banner title/ })).not.toBeInTheDocument();
    expect(document.querySelector('.banner-carousel')).toBeNull();
  });

  it('shows an empty state, not a blank grid, when nothing is featured', async () => {
    stubRoutes({ ...allRoutes(), '/api/v1/products': () => jsonResponse([]) });
    renderPage();
    expect(await screen.findByText('No featured products yet.')).toBeInTheDocument();
    expect(document.querySelector('a[href="/products?category=milk"]')).not.toBeNull();
  });

  it('shows an empty state when the catalog has no categories', async () => {
    stubRoutes({ ...allRoutes(), '/api/v1/categories': () => jsonResponse([]) });
    renderPage();
    expect(await screen.findByText('No categories yet.')).toBeInTheDocument();
  });

  it('shows an empty state when the API reports no branches', async () => {
    stubRoutes({ ...allRoutes(), '/api/v1/branches': () => jsonResponse([]) });
    renderPage();
    expect(await screen.findByText('No branches available yet.')).toBeInTheDocument();
  });

  it('degrades each failing section to a message while the others still render', async () => {
    stubRoutes({
      ...allRoutes(),
      '/api/v1/products': () => jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500),
    });
    renderPage();
    expect(await screen.findByText('Could not load products.')).toBeInTheDocument();
    // The unrelated sections must survive a single failing request.
    expect(screen.getByText('Cairo branch')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Banner title/ })).toBeInTheDocument();
  });

  it('renders every section as a message when the API is entirely unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderPage();
    expect(await screen.findByText('Could not load banners.')).toBeInTheDocument();
    expect(screen.getByText('Could not load categories.')).toBeInTheDocument();
    expect(screen.getByText('Could not load products.')).toBeInTheDocument();
    expect(screen.getByText('Could not load branches.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shop by need' })).toBeInTheDocument();
  });

  it('keeps the page usable while a slow section is still loading', async () => {
    let release: () => void = () => {};
    const gates = new Promise<void>((resolve) => { release = resolve; });
    stubRoutes({
      ...allRoutes(),
      '/api/v1/banners': async () => {
        await gates;
        return jsonResponse([banner('slow-banner')]);
      },
    });
    const { container } = renderPage();
    // The slow banner must not gate the rest of the page.
    await waitFor(() => expect(container.querySelector('a[href="/products/milk-full"]')).not.toBeNull());
    expect(screen.getByRole('status', { name: 'Loading banners…' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Banner title/ })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('link', { name: /Banner title/ })).toBeInTheDocument();
  });

  it('renders Arabic copy with RTL when the locale is Arabic', async () => {
    localStorage.setItem('labna.locale', 'ar');
    stubRoutes(allRoutes());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'اختر حسب احتياجك' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('renders a category whose image URL cannot load', async () => {
    stubRoutes({ ...allRoutes(), '/api/v1/categories': () => jsonResponse([{ ...category('milk', 'Milk'), imageURL: '/missing.png' }]) });
    const { container } = renderPage();
    const chip = await waitFor(() => {
      const node = container.querySelector('.category-strip a[href="/products?category=milk"]')!;
      expect(node).not.toBeNull();
      return node;
    });
    const image = chip.querySelector('img')!;
    // A broken image must not remove the category from navigation.
    expect(image).toHaveAttribute('src', '/missing.png');
    expect(chip.closest('a')).toHaveAttribute('href', '/products?category=milk');
  });
});