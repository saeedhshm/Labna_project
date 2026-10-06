import { expect, test } from '@playwright/test';
import { stubApi, useEnglish } from './helpers';

test.describe('Browse to order', () => {
  test('searches the catalog, adds to cart and checks out with server totals', async ({ page }) => {
    await useEnglish(page);
    const api = await stubApi(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shop by need' })).toBeVisible();

    // The home search hands the query to the catalog.
    await page.getByRole('searchbox', { name: 'Search products' }).fill('milk');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/\/products\?q=milk/);
    expect(api.calls.some((call) => call.path.endsWith('/products') && call.path.includes('q'))).toBe(false);

    // Back to the catalog to pick a product.
    await page.goto('/products');
    await page.getByRole('link', { name: 'Full Fat Milk' }).first().click();
    await expect(page.getByRole('heading', { name: 'Full Fat Milk' })).toBeVisible();

    // Two units, so the subtotal is a value worth checking.
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await page.getByRole('button', { name: /add to cart/i }).click();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Review items before checkout' })).toBeVisible();
    // 3500 x 2 comes from the backend, not from the browser.
    await expect(page.getByText('EGP 70.00').first()).toBeVisible();

    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page).toHaveURL(/\/checkout/);

    // Delivery and total stay with the backend until the order exists.
    await expect(page.getByText('confirmed at checkout').first()).toBeVisible();

    await page.getByLabel('Name').fill('Nour Hassan');
    await page.getByLabel('Phone').fill('+201099988877');
    await page.getByLabel('City').fill('Cairo');
    await page.getByLabel('Area').fill('Maadi');
    await page.getByLabel('Street').fill('Road 9');
    await page.getByLabel('Building').fill('12');
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page).toHaveURL(/\/orders\/LBN-E2E-1/);
    // Exactly one order reached the backend, with the shopper's own details.
    expect(api.orders).toHaveLength(1);
    expect(api.orders[0]).toMatchObject({
      customer: { name: 'Nour Hassan', phoneNumber: '+201099988877' },
      address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12' },
    });
  });

  test('explains a price change and still charges the server price', async ({ page }) => {
    await useEnglish(page);
    await stubApi(page, { unitPriceMinor: 3800 });

    // The shopper added this line when it cost 3500.
    await page.addInitScript(() => {
      localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }]));
      localStorage.setItem('labna.cart.prices.v1', JSON.stringify({ 'milk-full:milk-full-1l': 3500 }));
    });

    await page.goto('/cart');
    await expect(page.getByText('Price changed')).toBeVisible();
    await expect(page.getByText(/server-calculated price is what will be charged/i)).toBeVisible();
    // 3800 x 2 is charged, not the remembered 3500 x 2.
    await expect(page.getByText('EGP 76.00').first()).toBeVisible();
    await expect(page.getByText('EGP 70.00')).toHaveCount(0);
  });

  test('keeps recently viewed products on the home page', async ({ page }) => {
    await useEnglish(page);
    await stubApi(page);

    await page.goto('/products/milk-full');
    await expect(page.getByRole('heading', { name: 'Full Fat Milk' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Pick up where you left off' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Full Fat Milk' }).first()).toBeVisible();
  });
});

test.describe('Account features', () => {
  test('registers, logs out and signs back in', async ({ page }) => {
    await useEnglish(page);
    const api = await stubApi(page);

    await page.goto('/register');
    await page.getByLabel('Name').fill('Nour Hassan');
    await page.getByLabel('Email').fill('nour@example.com');
    await page.getByLabel('Phone number').fill('+201099988877');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible();
    expect(api.calls.some((call) => call.method === 'POST' && call.path.endsWith('/customer/auth/register'))).toBe(true);

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(api.calls.some((call) => call.method === 'POST' && call.path.endsWith('/customer/auth/logout'))).toBe(true);

    await page.getByLabel('Email').fill('nour@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible();
    expect(api.calls.some((call) => call.method === 'POST' && call.path.endsWith('/customer/auth/login'))).toBe(true);
  });

  test('saves a favourite as a guest and keeps it after signing in', async ({ page }) => {
    await useEnglish(page);
    const api = await stubApi(page, { signedIn: true, favorites: [] });

    await page.goto('/products/milk-full');
    const save = page.getByRole('button', { name: 'Add to favorites' });
    await expect(save).toHaveAttribute('aria-pressed', 'false');
    await save.click();
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');

    // The reference went to the account, not just to this browser.
    expect(api.favorites.has('milk-full')).toBe(true);

    await page.goto('/account/favorites');
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Full Fat Milk' }).first()).toBeVisible();
  });

  test('fills checkout from the signed-in customer and saved address', async ({ page }) => {
    await useEnglish(page);
    const api = await stubApi(page, { signedIn: true });

    await page.addInitScript(() => localStorage.setItem('labna.cart.v1', JSON.stringify([{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 1 }])));
    await page.goto('/checkout');

    await expect(page.getByLabel('Name')).toHaveValue('Nour Hassan');
    await expect(page.getByLabel('Phone')).toHaveValue('+201099988877');
    await expect(page.getByLabel('Area')).toHaveValue('Maadi');
    await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();

    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(/\/orders\/LBN-E2E-1/);
    expect(api.orders[0]).toMatchObject({
      customer: { name: 'Nour Hassan', email: 'nour@example.com' },
      address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12' },
    });
  });
});

test.describe('Resilience', () => {
  test('warns instead of pretending when the connection drops', async ({ page, context }) => {
    await useEnglish(page);
    await stubApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shop by need' })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toHaveCount(0);
  });
});
