import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsPage } from '../src/pages/ProductsPage';

const imageURLs = [
  'https://res.cloudinary.com/labna/image/upload/front.png',
  'https://res.cloudinary.com/labna/image/upload/back.png',
];
const text = { ar: 'لبن', en: 'Milk' };
const record = {
  id: 'milk-full', version: 3, categoryID: 'milk', name: text, description: text,
  ingredients: text, storageInstructions: text, imageURLs, isFeatured: true,
  publicationStatus: 'published',
  variants: [{ id: 'milk-full-1l', sku: 'MILK-1L', label: { ar: '١ لتر', en: '1 litre' },
    quantity: 1000, unit: 'ml', priceMinor: 3500, currencyCode: 'EGP', isActive: true }],
};
const response = (data: unknown) => new Response(JSON.stringify({ data, meta: { requestID: 'req_1', nextCursor: null } }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

describe('ProductsPage editing', () => {
  it('keeps all existing image URLs when saving an unrelated product change', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/admin/products?')) return response([record]);
      if (url.includes('/admin/categories?')) return response([{ id: 'milk', version: 0, name: text }]);
      if (url.endsWith('/admin/settings')) return response({ currencyCode: 'EGP' });
      if (url.endsWith('/admin/products/milk-full')) return response({ ...record, version: 4 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><ProductsPage /></QueryClientProvider>);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تعديل' }));
    const dialog = screen.getByRole('dialog', { name: 'تعديل المنتج milk-full' });
    expect(within(dialog).getByLabelText('روابط الصور')).toHaveValue(imageURLs.join('\n'));
    await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) =>
        url.endsWith('/admin/products/milk-full') && init?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]?.body));
      expect(body.imageURLs).toEqual(imageURLs);
      expect(body.version).toBe(3);
    });
  });
});
