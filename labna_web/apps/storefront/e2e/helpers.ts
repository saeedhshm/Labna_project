import type { Page, Route } from '@playwright/test';

export const locale = { ar: 'ar', en: 'en' } as const;

const image = (name: string) => `https://res.cloudinary.com/labna/image/upload/${name}.png`;

export const product = (id: string, name: string, priceMinor = 3500) => ({
  id,
  categoryID: 'milk',
  name: { ar: `منتج ${id}`, en: name },
  description: { ar: 'وصف المنتج', en: 'Product description' },
  ingredients: { ar: 'لبن', en: 'Milk' },
  storageInstructions: { ar: 'يحفظ مبردًا', en: 'Keep refrigerated' },
  imageURLs: [image(id)],
  isFeatured: true,
  isDemo: false,
  variants: [
    {
      id: `${id}-1l`,
      sku: `${id}-sku`,
      label: { ar: '١ لتر', en: '1 L' },
      quantity: 1000,
      unit: 'ml',
      priceMinor,
      currencyCode: 'EGP',
      isActive: true,
      isAvailable: true,
      availableQuantity: 20,
    },
  ],
});

export const customer = {
  id: 'cust-1',
  name: 'Nour Hassan',
  phoneNumber: '+201099988877',
  email: 'nour@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  addresses: [
    {
      id: 'addr-home',
      label: 'Home',
      recipientName: 'Nour Hassan',
      phoneNumber: '+201099988877',
      city: 'Cairo',
      area: 'Maadi',
      street: 'Road 9',
      building: '12',
      floor: '',
      apartment: '',
      notes: '',
      isDefault: true,
    },
  ],
};

const pageBody = (items: unknown[]) => ({ data: items, meta: { nextCursor: null, branchID: 'demo-cairo' } });
const envelope = (data: unknown) => ({ data });

export type StubOptions = {
  /** Omit to run as a signed-out guest. */
  signedIn?: boolean;
  /** Cart lines the backend reports, with the price it charges today. */
  unitPriceMinor?: number;
  favorites?: string[];
  orderNumber?: string;
};

/**
 * Stubs the storefront's API with contract-shaped payloads, so the journey runs
 * without a database while still exercising the real client, routing, cache and
 * validation code paths.
 */
export async function stubApi(page: Page, options: StubOptions = {}) {
  let authenticated = options.signedIn ?? false;
  const price = options.unitPriceMinor ?? 3500;
  const orderNumber = options.orderNumber ?? 'LBN-E2E-1';
  const saved = new Set(options.favorites ?? []);
  const calls: { method: string; path: string; body: unknown }[] = [];
  const orders: Record<string, unknown>[] = [];

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let body: unknown = undefined;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    calls.push({ method, path, body });

    const json = (payload: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

    if (path.endsWith('/customer/auth/refresh')) {
      return authenticated ? json(envelope({ accessToken: 'e2e-token', expiresIn: 900, customer })) : json({ error: { code: 'UNAUTHENTICATED', message: 'No session' } }, 401);
    }

    if ((path.endsWith('/customer/auth/register') || path.endsWith('/customer/auth/login')) && method === 'POST') {
      authenticated = true;
      return json(envelope({ accessToken: 'e2e-token', expiresIn: 900, customer }));
    }

    if (path.endsWith('/customer/auth/logout') && method === 'POST') {
      authenticated = false;
      return json(envelope({ loggedOut: true }));
    }

    if (path.endsWith('/customer/favorites')) {
      if (method === 'POST') {
        const { productID } = body as { productID: string };
        saved.add(productID);
        return json(envelope({ productID, createdAt: new Date().toISOString() }), 201);
      }
      return json(envelope({ favorites: [...saved].map((id) => ({ productID: id, createdAt: new Date().toISOString() })) }));
    }

    if (/^\/api\/v1\/customer\/favorites\//.test(path) && method === 'DELETE') {
      saved.delete(decodeURIComponent(path.split('/favorites/')[1]));
      return json(envelope({ deleted: true, productID: path.split('/favorites/')[1] }));
    }

    if (path.endsWith('/cart/validate')) {
      const items = (body as { items: { productID: string; variantID: string; quantity: number }[] }).items;
      return json(
        envelope({
          branchID: 'demo-cairo',
          currencyCode: 'EGP',
          subtotalMinor: items.reduce((sum, item) => sum + price * item.quantity, 0),
          valid: true,
          items: items.map((item) => {
            const catalog = product(item.productID, 'Full Fat Milk', price);
            return {
              productID: item.productID,
              variantID: item.variantID,
              quantity: item.quantity,
              productName: catalog.name,
              variantLabel: catalog.variants[0].label,
              imageURL: catalog.imageURLs[0],
              unit: 'ml',
              variantQuantity: 1000,
              currencyCode: 'EGP',
              unitPriceMinor: price,
              lineTotalMinor: price * item.quantity,
              availableQuantity: 20,
              valid: true,
              reason: 'ok',
            };
          }),
        }),
      );
    }

    if (path.endsWith('/orders') && method === 'POST') {
      const submitted = body as { items: { quantity: number }[]; customer: unknown; address: unknown };
      const subtotalMinor = submitted.items.reduce((sum, item) => sum + price * item.quantity, 0);
      const deliveryFeeMinor = 1500;
      const discountMinor = 0;
      orders.push(submitted as unknown as Record<string, unknown>);
      return json(
        envelope({
          id: 'order-1',
          orderNumber,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: 'cash_on_delivery',
          branchID: 'demo-cairo',
          customer: submitted.customer,
          address: submitted.address,
          items: submitted.items.map((item) => ({ ...item, unitPriceMinor: price, lineTotalMinor: price * item.quantity })),
          subtotalMinor,
          deliveryFeeMinor,
          discountMinor,
          totalMinor: subtotalMinor + deliveryFeeMinor - discountMinor,
          currencyCode: 'EGP',
          couponCode: '',
          timeline: [{ status: 'pending', at: new Date().toISOString() }],
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        201,
      );
    }

    if (/^\/api\/v1\/products\/[^/]+$/.test(path)) {
      return json(envelope(product(path.split('/').pop() as string, 'Full Fat Milk', price)));
    }

    if (path.endsWith('/products')) {
      const q = url.searchParams.get('q');
      const items = q ? [] : [product('milk-full', 'Full Fat Milk', price)];
      return json(pageBody(items));
    }

    if (path.endsWith('/categories')) return json(pageBody([{ id: 'milk', name: { ar: 'ألبان', en: 'Milk' }, imageURL: image('milk'), sortOrder: 0 }]));
    if (path.endsWith('/banners')) return json(pageBody([]));
    if (path.endsWith('/branches')) return json(pageBody([]));

    return json({ error: { code: 'NOT_FOUND', message: `Unhandled ${method} ${path}` } }, 404);
  });

  return { calls, orders, favorites: saved };
}

/** The storefront persists the UI language; English keeps selectors readable. */
export async function useEnglish(page: Page) {
  await page.addInitScript(() => localStorage.setItem('labna.locale', 'en'));
}
