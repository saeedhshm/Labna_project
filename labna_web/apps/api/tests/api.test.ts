import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import SwaggerParser from '@apidevtools/swagger-parser';
import { createApp } from '../src/app.js';
import { initializeDatabase, Staff, Inventory, models, Audit } from '../src/database.js';
import { openingState } from '../src/catalog.js';
import { openapi } from '../src/openapi.js';
import { readConfig } from '../src/config.js';
import { randomUUID } from 'node:crypto';

const config = readConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://unused', JWT_SECRET: 'x'.repeat(64), CURSOR_SECRET: 'y'.repeat(64), WEB_ORIGINS: 'http://localhost:5173', MEDIA_ORIGINS: 'https://res.cloudinary.com' });
const app = createApp(config);
let mongo: MongoMemoryReplSet;
let bearer: string;
let refreshCookie: string;
const text = { ar: 'لبنة', en: 'Labna' };
const imageURL = 'https://res.cloudinary.com/labna/image/upload/milk.png';
const branch = {
  name: text, address: text, coordinate: { latitude: 30, longitude: 31 },
  phoneNumber: '+201012345678', timeZoneIdentifier: 'Africa/Cairo',
  openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '17:00' }],
  dateOverrides: [], isVisible: true, pickupEnabled: true, acceptsOrders: true,
};
const category = { name: text, imageURL, sortOrder: 0 };
const product = (id: string, price = 3500) => ({
  id, categoryID: 'milk', name: { ar: 'لبن', en: id }, description: text, ingredients: text, storageInstructions: text,
  imageURLs: [imageURL], isFeatured: true, publicationStatus: 'published',
  variants: [{ id: `${id}-1l`, sku: `${id}-sku`, label: text, quantity: 1000, unit: 'ml', priceMinor: price, currencyCode: 'EGP', isActive: true }],
});
const admin = (path: string) => request(app).post(`/api/v1/admin/${path}`).set('Authorization', bearer);
async function createCatalog() {
  expect((await admin('branches').send({ id: 'main', ...branch })).status).toBe(201);
  expect((await request(app).patch('/api/v1/admin/settings').set('Authorization', bearer).send({ version: 0, defaultPickupBranchID: 'main' })).status).toBe(200);
  expect((await admin('categories').send({ id: 'milk', ...category })).status).toBe(201);
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  await initializeDatabase();
}, 180000);
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  await initializeDatabase();
  await Staff.create({ email: 'manager@example.com', passwordHash: await hash('correct-password'), role: 'manager' });
  const login = await request(app).post('/api/v1/staff/auth/login').send({ email: 'manager@example.com', password: 'correct-password' });
  expect(login.status).toBe(200);
  bearer = `Bearer ${login.body.data.accessToken}`;
  refreshCookie = login.headers['set-cookie'][0].split(';')[0];
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('API foundation and catalog', () => {
  it('returns structured validation errors and denies unauthorized administration', async () => {
    expect((await request(app).get('/health/ready')).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/products')).status).toBe(401);
    const invalid = await admin('categories').send({ id: 'milk', ...category, unexpected: true });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.meta.requestID).toBeTruthy();
    expect((await request(app).post('/api/v1/staff/auth/login').set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await request(app).get('/api/v1/categories').query({ limit: 1000 })).status).toBe(422);
    expect((await request(app).get('/api/v1/products').query({ 'q[$ne]': 'x' })).status).toBe(422);
  });

  it('rejects operators and immediately denies blocked staff', async () => {
    await Staff.updateOne({ email: 'manager@example.com' }, { $set: { role: 'orderOperator' } });
    expect((await admin('categories').send({ id: 'milk', ...category })).status).toBe(403);
    await Staff.updateOne({ email: 'manager@example.com' }, { $set: { status: 'blocked' } });
    expect((await request(app).get('/api/v1/admin/categories').set('Authorization', bearer)).status).toBe(401);
  });

  it('lists inventory for operators and applies idempotent manager adjustments with movements', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full'))).status).toBe(201);
    const initial = await Inventory.findOne({ branchID: 'main', variantID: 'milk-full-1l' }).lean();
    expect(initial).toMatchObject({ onHand: 0, reserved: 0, version: 0 });
    expect(initial?.id).toMatch(/^[0-9a-f-]{36}$/);

    await Staff.create({ email: 'operator@example.com', passwordHash: await hash('correct-password'), role: 'orderOperator' });
    const login = await request(app).post('/api/v1/staff/auth/login').send({ email: 'operator@example.com', password: 'correct-password' });
    const operator = `Bearer ${login.body.data.accessToken}`;
    const operatorList = await request(app).get('/api/v1/admin/inventory').set('Authorization', operator);
    expect(operatorList.status).toBe(200);
    expect(operatorList.headers['cache-control']).toBe('no-store');
    expect(operatorList.body.data[0]).toMatchObject({ available: 0, lowStock: true });
    expect((await request(app).get('/api/v1/admin/categories').set('Authorization', operator)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/inventory/movements').set('Authorization', operator)).status).toBe(403);

    const key = randomUUID();
    const command = { branchID: 'main', variantID: 'milk-full-1l', onHandDelta: 7, reason: ' Initial count ', version: 0 };
    const adjustment = () => request(app).post('/api/v1/admin/inventory/adjustments').set('Authorization', bearer).set('Idempotency-Key', key).send(command);
    const [adjusted, concurrentReplay] = await Promise.all([adjustment(), adjustment()]);
    expect(adjusted.status).toBe(200);
    expect(concurrentReplay.status).toBe(200);
    expect(concurrentReplay.body).toEqual(adjusted.body);
    expect(adjusted.body.data).toMatchObject({ onHand: 7, reserved: 0, available: 7, lowStock: false, version: 1 });
    const replay = await adjustment();
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(adjusted.body);
    const conflict = await request(app).post('/api/v1/admin/inventory/adjustments').set('Authorization', bearer).set('Idempotency-Key', key).send({ ...command, reason: 'Different' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    const movements = await request(app).get('/api/v1/admin/inventory/movements').set('Authorization', bearer).query({ inventoryID: initial!.id });
    expect(movements.body.data).toHaveLength(1);
    expect(movements.body.data[0]).toMatchObject({ inventoryID: initial!.id, onHandDelta: 7, reservedDelta: 0, reason: 'Initial count', commandID: key });
    expect(movements.body.data[0].actorID).toBeTruthy();
    expect((await request(app).get('/api/v1/admin/inventory/movements').set('Authorization', bearer).query({ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' })).status).toBe(422);

    const threshold = await request(app).patch(`/api/v1/admin/inventory/${initial!.id}`).set('Authorization', bearer).send({ version: 1, lowStockThreshold: 10 });
    expect(threshold.body.data).toMatchObject({ version: 2, lowStockThreshold: 10, lowStock: true });
    const low = await request(app).get('/api/v1/admin/inventory').set('Authorization', operator).query({ lowStock: true });
    expect(low.body.data.map((row: { id: string }) => row.id)).toContain(initial!.id);
    expect((await request(app).patch(`/api/v1/admin/inventory/${initial!.id}`).set('Authorization', bearer).send({ version: 2, onHand: 99 })).status).toBe(422);
    await Inventory.updateOne({ id: initial!.id }, { $set: { reserved: 3 } });
    const belowReserved = await request(app).post('/api/v1/admin/inventory/adjustments').set('Authorization', bearer).set('Idempotency-Key', randomUUID())
      .send({ branchID: 'main', variantID: 'milk-full-1l', onHandDelta: -5, reason: 'Bad count', version: 2 });
    expect(belowReserved.status).toBe(409);
    expect(belowReserved.body.error.code).toBe('INVENTORY_CONSTRAINT');
    expect(await Inventory.findOne({ id: initial!.id }).then(row => row?.onHand)).toBe(7);
  });

  it('sorts and filters by price using only variants a customer can buy', async () => {
    await createCatalog();
    // Two variants: one cheap but deactivated, one pricier and sellable.
    const input = product('mixed');
    input.variants[0].isActive = false;
    input.variants.push({ ...input.variants[0], id: 'mixed-2l', sku: 'MIXED-2L', priceMinor: 5000, label: { ar: '٢ لتر', en: '2 litres' } });
    expect((await admin('products').send(input)).status).toBe(201);
    expect((await admin('products').send({ ...product('sold-out'), variants: [{ ...input.variants[0], id: 'sold-out-1l', sku: 'SOLD-1L' }] })).status).toBe(201);
    await Inventory.updateMany({}, { $set: { onHand: 5 } });

    const ascending = await request(app).get('/api/v1/products').query({ sort: 'priceAsc' });
    const ids = ascending.body.data.map((p: { id: string }) => p.id);
    expect(ids.at(-1)).toBe('sold-out');
    expect(ids.indexOf('mixed')).toBeLessThan(ids.indexOf('sold-out'));
    // The deactivated 3500 variant must not define the price.
    expect(ascending.body.data.find((p: { id: string }) => p.id === 'mixed').variants[0]).toMatchObject({ isAvailable: false, priceMinor: 3500 });

    const filtered = await request(app).get('/api/v1/products').query({ maxPriceMinor: 4000 });
    expect(filtered.body.data.map((p: { id: string }) => p.id)).not.toContain('mixed');
    expect(filtered.body.data.map((p: { id: string }) => p.id)).not.toContain('sold-out');
    expect((await request(app).get('/api/v1/products').query({ available: true })).body.data.map((p: { id: string }) => p.id)).not.toContain('sold-out');
  });

  it('reports zero availability while a branch is paused for new orders', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full'))).status).toBe(201);
    await Inventory.updateOne({ variantID: 'milk-full-1l' }, { $set: { onHand: 10 } });
    expect((await request(app).get('/api/v1/products/milk-full')).body.data.variants[0].isAvailable).toBe(true);
    expect((await request(app).patch('/api/v1/admin/branches/main').set('Authorization', bearer).send({ version: 0, acceptsOrders: false })).status).toBe(200);
    const paused = await request(app).get('/api/v1/products/milk-full');
    expect(paused.body.data.variants[0]).toMatchObject({ isAvailable: false, availableQuantity: 0 });
    // The stock itself is untouched, so reopening the branch restores it.
    expect(await Inventory.findOne({ variantID: 'milk-full-1l' }).then(row => row?.onHand)).toBe(10);
  });

  it('creates zero stock, computes branch-specific availability and excludes private fields', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full'))).status).toBe(201);
    expect(await Inventory.countDocuments()).toBe(1);
    let result = await request(app).get('/api/v1/products/milk-full');
    expect(result.status).toBe(200);
    expect(result.body.data.variants[0]).toMatchObject({ isAvailable: false, availableQuantity: 0, priceMinor: 3500 });
    expect(result.body.data).not.toHaveProperty('publicationStatus');
    expect(result.body.data.variants[0]).not.toHaveProperty('sku');
    await Inventory.updateOne({ branchID: 'main', variantID: 'milk-full-1l' }, { $set: { onHand: 10, reserved: 3 } });
    result = await request(app).get('/api/v1/products/milk-full');
    expect(result.body.data.variants[0]).toMatchObject({ isAvailable: true, availableQuantity: 7 });
    expect((await admin('branches').send({ id: 'second', ...branch })).status).toBe(201);
    const second = await request(app).get('/api/v1/products/milk-full').query({ branchID: 'second' });
    expect(second.body.data.variants[0].availableQuantity).toBe(0);
    expect((await request(app).get('/api/v1/products').query({ branchID: 'missing' })).status).toBe(422);
  });

  it('validates cart items against current catalog, stock and server-side prices', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full', 3500))).status).toBe(201);
    await Inventory.updateOne({ branchID: 'main', variantID: 'milk-full-1l' }, { $set: { onHand: 3, reserved: 1 } });

    const polluted = await request(app).post('/api/v1/cart/validate').send({
      items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2, unitPriceMinor: 1 }],
    });
    expect(polluted.status).toBe(422);

    const valid = await request(app).post('/api/v1/cart/validate').send({ items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }] });
    expect(valid.status).toBe(200);
    expect(valid.body.data).toMatchObject({ branchID: 'main', valid: true, subtotalMinor: 7000 });
    expect(valid.body.data.items[0]).toMatchObject({ unitPriceMinor: 3500, lineTotalMinor: 7000, availableQuantity: 2, reason: 'ok' });

    const tooMany = await request(app).post('/api/v1/cart/validate').send({ items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 3 }] });
    expect(tooMany.body.data).toMatchObject({ valid: false, subtotalMinor: 0 });
    expect(tooMany.body.data.items[0]).toMatchObject({ valid: false, reason: 'insufficient_stock', availableQuantity: 2, unitPriceMinor: 3500 });

    const missing = await request(app).post('/api/v1/cart/validate').send({ items: [{ productID: 'milk-full', variantID: 'missing', quantity: 1 }] });
    expect(missing.body.data.items[0]).toMatchObject({ valid: false, reason: 'variant_not_found' });
  });

  it('creates checkout orders with server-side prices, snapshots and demo payments', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full', 3500))).status).toBe(201);
    await Inventory.updateOne({ branchID: 'main', variantID: 'milk-full-1l' }, { $set: { onHand: 5, reserved: 0 } });
    const checkout = {
      customer: { name: 'Demo Customer', phoneNumber: '+201012345678', email: 'demo@example.com' },
      address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '3', apartment: '5', notes: 'Ring once' },
      items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2, unitPriceMinor: 1 }],
      couponCode: 'LABNA10',
      paymentMethod: 'demo_card_success',
    };
    expect((await request(app).post('/api/v1/orders').send(checkout)).status).toBe(422);
    const created = await request(app).post('/api/v1/orders').send({ ...checkout, items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2 }] });
    expect(created.status).toBe(201);
    expect(created.body.data.orderNumber).toMatch(/^LBN-\d{8}-\d{6}$/);
    expect(created.body.data).toMatchObject({ status: 'pending', subtotalMinor: 7000, deliveryFeeMinor: 1500, discountMinor: 700, totalMinor: 7800, payment: { method: 'demo_card_success', status: 'paid' } });
    expect(created.body.data.items[0]).toMatchObject({ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 2, unitPriceMinor: 3500, lineTotalMinor: 7000 });
    expect(await Inventory.findOne({ variantID: 'milk-full-1l' }).then(row => row?.reserved)).toBe(2);

    const detail = await request(app).get(`/api/v1/orders/${created.body.data.orderNumber}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(created.body.data.id);
    expect(detail.body.data.statusHistory.map((item: { status: string }) => item.status)).toEqual(['pending']);

    const adminList = await request(app).get('/api/v1/admin/orders').set('Authorization', bearer).query({ q: created.body.data.orderNumber });
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.map((order: { orderNumber: string }) => order.orderNumber)).toContain(created.body.data.orderNumber);
    expect((await request(app).patch(`/api/v1/admin/orders/${created.body.data.id}/status`).set('Authorization', bearer).send({ status: 'completed' })).status).toBe(409);

    const failure = await request(app).post('/api/v1/orders').send({ ...checkout, items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 1 }], paymentMethod: 'demo_card_failure' });
    expect(failure.status).toBe(402);
    expect(failure.body.error.code).toBe('PAYMENT_FAILED');
    expect(await Inventory.findOne({ variantID: 'milk-full-1l' }).then(row => row?.reserved)).toBe(2);

    const tooMany = await request(app).post('/api/v1/orders').send({ ...checkout, items: [{ productID: 'milk-full', variantID: 'milk-full-1l', quantity: 4 }], paymentMethod: 'cash_on_delivery' });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.code).toBe('INSUFFICIENT_STOCK');

    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed']) {
      const moved = await request(app).patch(`/api/v1/admin/orders/${created.body.data.id}/status`).set('Authorization', bearer).send({ status });
      expect(moved.status).toBe(200);
      expect(moved.body.data.status).toBe(status);
    }
    const completed = await request(app).get(`/api/v1/admin/orders/${created.body.data.id}`).set('Authorization', bearer);
    expect(completed.body.data.statusHistory.map((item: { status: string }) => item.status)).toEqual(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed']);
    expect(await Inventory.findOne({ variantID: 'milk-full-1l' }).then(row => ({ onHand: row?.onHand, reserved: row?.reserved }))).toEqual({ onHand: 3, reserved: 0 });
  });

  it('supports search, price filters, stable pagination and stock-sensitive ETags', async () => {
    await createCatalog();
    for (const [index, name] of ['alpha', 'beta', 'gamma'].entries()) expect((await admin('products').send(product(name, (index + 1) * 100))).status).toBe(201);
    const first = await request(app).get('/api/v1/products').query({ sort: 'priceAsc', limit: 1 });
    expect(first.body.data[0].id).toBe('alpha');
    const next = await request(app).get('/api/v1/products').query({ sort: 'priceAsc', limit: 1, cursor: first.body.meta.nextCursor });
    expect(next.body.data[0].id).toBe('beta');
    expect((await request(app).get('/api/v1/products').query({ sort: 'priceDesc', limit: 1, cursor: first.body.meta.nextCursor })).status).toBe(400);
    expect((await request(app).get('/api/v1/products').query({ cursor: 'fake' })).status).toBe(400);
    // A price range only matches products that can actually be bought, so stock
    // has to exist before the range is applied.
    expect((await request(app).get('/api/v1/products').query({ maxPriceMinor: 4000 })).body.data).toEqual([]);
    await Inventory.updateMany({}, { $set: { onHand: 3 } });
    expect((await request(app).get('/api/v1/products').query({ q: 'alpha', minPriceMinor: 90, maxPriceMinor: 110 })).body.data.map((p: { id: string }) => p.id)).toEqual(['alpha']);
    expect((await request(app).get('/api/v1/products').query({ q: '.*' })).body.data).toEqual([]);
    const detail = await request(app).get('/api/v1/products/alpha');
    expect((await request(app).get('/api/v1/products/alpha').set('If-None-Match', detail.headers.etag)).status).toBe(304);
    await Inventory.updateOne({ variantID: 'alpha-1l' }, { $set: { onHand: 1 } });
    expect((await request(app).get('/api/v1/products/alpha').set('If-None-Match', detail.headers.etag)).status).toBe(200);
  });

  it('keeps drafts/hidden branches private and excludes disabled variants from availability', async () => {
    await createCatalog();
    expect((await admin('products').send({ ...product('draft'), publicationStatus: 'draft' })).status).toBe(201);
    expect((await request(app).get('/api/v1/products/draft')).status).toBe(404);
    expect((await admin('branches').send({ id: 'hidden', ...branch, isVisible: false })).status).toBe(201);
    expect((await request(app).get('/api/v1/branches/hidden')).status).toBe(404);
    expect((await request(app).get('/api/v1/branches')).body.data.map((b: { id: string }) => b.id)).toEqual(['main']);
    const input = product('inactive'); input.variants[0].isActive = false;
    expect((await admin('products').send(input)).status).toBe(201);
    await Inventory.updateOne({ variantID: 'inactive-1l' }, { $set: { onHand: 10 } });
    expect((await request(app).get('/api/v1/products').query({ available: true })).body.data).toEqual([]);
  });

  it('protects relationships, variant IDs and default branches from invalid edits', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full'))).status).toBe(201);
    const removeCategory = await request(app).delete('/api/v1/admin/categories/milk').set('Authorization', bearer).send({ version: 0 });
    expect(removeCategory.status).toBe(409);
    expect((await request(app).delete('/api/v1/admin/branches/main').set('Authorization', bearer).send({ version: 0 })).status).toBe(409);
    expect((await request(app).patch('/api/v1/admin/branches/main').set('Authorization', bearer).send({ version: 0, isVisible: false })).status).toBe(409);
    const duplicate = product('other'); duplicate.variants[0].id = 'milk-full-1l';
    expect((await admin('products').send(duplicate)).status).toBe(409);
    expect(await models.products.countDocuments()).toBe(1);
    expect((await admin('products').send({ ...product('invalid'), categoryID: 'missing' })).status).toBe(422);
    expect((await admin('categories').send({ id: 'bad-image', ...category, imageURL: 'https://untrusted.example/image.png' })).status).toBe(422);
  });

  it('serializes concurrent edits and records only committed audit events', async () => {
    await createCatalog();
    const edits = await Promise.all([1, 2].map(sortOrder => request(app).patch('/api/v1/admin/categories/milk').set('Authorization', bearer).send({ version: 0, sortOrder })));
    expect(edits.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await Audit.countDocuments({ action: 'categories.update' })).toBe(1);
    expect((await models.categories.findOne({ id: 'milk' }))?.version).toBe(1);
  });

  it('blocks archiving banner targets until their banners are disabled', async () => {
    await createCatalog();
    expect((await admin('products').send(product('milk-full'))).status).toBe(201);
    expect((await admin('banners').send({ id: 'hero', title: text, subtitle: text, imageURL, destination: { kind: 'product', id: 'milk-full' }, sortOrder: 0, isActive: true })).status).toBe(201);
    expect((await request(app).delete('/api/v1/admin/products/milk-full').set('Authorization', bearer).send({ version: 0 })).status).toBe(409);
    expect((await request(app).patch('/api/v1/admin/banners/hero').set('Authorization', bearer).send({ version: 0, isActive: false })).status).toBe(200);
    expect((await request(app).delete('/api/v1/admin/products/milk-full').set('Authorization', bearer).send({ version: 0 })).status).toBe(200);
    expect((await request(app).get('/api/v1/products/milk-full')).status).toBe(404);
    expect((await request(app).get('/api/v1/banners')).body.data).toEqual([]);
  });

  it('rotates refresh cookies, rejects CSRF and revokes a family after replay', async () => {
    expect((await request(app).post('/api/v1/staff/auth/refresh').set('Cookie', refreshCookie)).status).toBe(403);
    expect((await request(app).post('/api/v1/staff/auth/refresh').set('Origin', 'https://evil.example').set('Cookie', refreshCookie)).status).toBe(403);
    const rotated = await request(app).post('/api/v1/staff/auth/refresh').set('Origin', config.WEB_ORIGINS[0]).set('Cookie', refreshCookie);
    expect(rotated.status).toBe(200);
    expect(rotated.headers['set-cookie'][0]).toContain('HttpOnly');
    const replay = await request(app).post('/api/v1/staff/auth/refresh').set('Origin', config.WEB_ORIGINS[0]).set('Cookie', refreshCookie);
    expect(replay.status).toBe(401);
    expect((await request(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${rotated.body.data.accessToken}`)).status).toBe(401);
  });

  it('logout revokes the current access token', async () => {
    expect((await request(app).post('/api/v1/staff/auth/logout').set('Authorization', bearer)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/categories').set('Authorization', bearer)).status).toBe(401);
  });

  it('validates overlapping schedules and respects date overrides in branch time zones', async () => {
    const invalid = { ...branch, openingHours: [...branch.openingHours, { weekday: 1, opensAt: '16:00', closesAt: '18:00' }] };
    expect((await admin('branches').send({ id: 'overlap', ...invalid })).status).toBe(422);
    const utc = { ...branch, timeZoneIdentifier: 'UTC' };
    expect(openingState(utc, new Date('2026-10-05T10:00:00Z')).isOpen).toBe(true);
    expect(openingState(utc, new Date('2026-10-05T17:00:00Z'))).toEqual({ isOpen: false, nextOpensAt: '2026-10-12T09:00:00.000Z' });
    const holiday = { ...utc, dateOverrides: [{ date: '2026-10-05', intervals: [] }] };
    expect(openingState(holiday, new Date('2026-10-05T10:00:00Z')).isOpen).toBe(false);
  });

  it('serves a valid OpenAPI 3.1 document covering implemented catalog and staff routes', async () => {
    const result = await request(app).get('/api/v1/openapi.json');
    expect(result.status).toBe(200);
    expect(result.body.paths['/admin/products/{id}'].patch.security).toBeTruthy();
    // Parser's TypeScript types lag behind its OpenAPI 3.1 runtime support.
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(openapi)))).resolves.toBeTruthy();
    expect(result.body.paths['/orders']).toBeUndefined();
  });
});
