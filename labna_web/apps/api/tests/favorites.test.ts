import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { createApp } from '../src/app.js';
import { initializeDatabase, Customer, models, Staff } from '../src/database.js';
import { readConfig } from '../src/config.js';

const config = readConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://unused', JWT_SECRET: 'x'.repeat(64), CURSOR_SECRET: 'y'.repeat(64), WEB_ORIGINS: 'http://localhost:5173', MEDIA_ORIGINS: 'https://res.cloudinary.com' });
const app = createApp(config);
let mongo: MongoMemoryReplSet;
let staffBearer: string;
const text = { ar: 'لبنة', en: 'Labna' };
const imageURL = 'https://res.cloudinary.com/labna/image/upload/milk.png';
const branch = {
  name: text, address: text, coordinate: { latitude: 30, longitude: 31 },
  phoneNumber: '+201012345678', timeZoneIdentifier: 'Africa/Cairo',
  openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '17:00' }],
  dateOverrides: [], isVisible: true, pickupEnabled: true, acceptsOrders: true,
};
const category = { name: text, imageURL, sortOrder: 0 };
const product = (id: string) => ({
  id, categoryID: 'milk', name: { ar: 'لبن', en: id }, description: text, ingredients: text, storageInstructions: text,
  imageURLs: [imageURL], isFeatured: true, publicationStatus: 'published',
  variants: [{ id: `${id}-1l`, sku: `${id}-sku`, label: text, quantity: 1000, unit: 'ml', priceMinor: 3500, currencyCode: 'EGP', isActive: true }],
});
const admin = (path: string) => request(app).post(`/api/v1/admin/${path}`).set('Authorization', staffBearer);
async function createCatalog(...productIDs: string[]) {
  expect((await admin('branches').send({ id: 'main', ...branch })).status).toBe(201);
  expect((await request(app).patch('/api/v1/admin/settings').set('Authorization', staffBearer).send({ version: 0, defaultPickupBranchID: 'main' })).status).toBe(200);
  expect((await admin('categories').send({ id: 'milk', ...category })).status).toBe(201);
  for (const id of productIDs) expect((await admin('products').send(product(id))).status).toBe(201);
}
async function register(name: string, phoneNumber: string, email: string) {
  const response = await request(app).post('/api/v1/customer/auth/register').send({ name, phoneNumber, email, password: 'password123' });
  expect(response.status).toBe(200);
  return { bearer: `Bearer ${response.body.data.accessToken}`, cookie: response.headers['set-cookie'][0].split(';')[0] };
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
  staffBearer = `Bearer ${login.body.data.accessToken}`;
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('Customer favorites', () => {
  it('stores favorites as product references that survive sessions and stay customer scoped', async () => {
    const { bearer: let0, cookie } = await register('Fav Customer', '+201055500001', 'fav@example.com');
    let bearer = let0;
    await createCatalog('milk-full', 'yogurt');

    // Reading state before anything is saved.
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data).toEqual({ favorites: [] });

    // Adding is newest first and de-duplicated.
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'milk-full' })).status).toBe(201);
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'yogurt' })).status).toBe(201);
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'milk-full' })).status).toBe(201);
    const listed = await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer);
    expect(listed.body.data.favorites.map((item: any) => item.productID)).toEqual(['milk-full', 'yogurt']);
    expect(listed.body.data.favorites[0].createdAt).toEqual(expect.any(String));
    // Only references are stored, never a copy of the product document.
    expect((await Customer.findOne({ email: 'fav@example.com' }).lean())?.favoriteProductIDs).toEqual(['milk-full', 'yogurt']);

    // Persists across sessions: a refreshed access token sees the same favorites.
    const refreshed = await request(app).post('/api/v1/customer/auth/refresh').set('Origin', config.WEB_ORIGINS[0]).set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    bearer = `Bearer ${refreshed.body.data.accessToken}`;
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data.favorites).toHaveLength(2);

    // Removing is idempotent and scoped to the owner.
    expect((await request(app).delete('/api/v1/customer/favorites/milk-full').set('Authorization', bearer)).status).toBe(200);
    expect((await request(app).delete('/api/v1/customer/favorites/milk-full').set('Authorization', bearer)).status).toBe(200);
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data.favorites.map((item: any) => item.productID)).toEqual(['yogurt']);

    // Validation: unauthenticated, unknown product, malformed and unexpected keys.
    expect((await request(app).get('/api/v1/customer/favorites')).status).toBe(401);
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'does-not-exist' })).status).toBe(404);
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({})).status).toBe(422);
    expect((await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'milk-full', extra: 1 })).status).toBe(422);

    // One customer never sees another customer's favorites.
    const { bearer: otherBearer } = await register('Other Fav', '+201055500002', 'fav2@example.com');
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', otherBearer)).body.data.favorites).toEqual([]);
  });

  it('drops favorites for products that stop being published', async () => {
    const { bearer } = await register('Archive Fav', '+201055500003', 'fav3@example.com');
    await createCatalog('milk-full');
    await request(app).post('/api/v1/customer/favorites').set('Authorization', bearer).send({ productID: 'milk-full' });
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data.favorites).toHaveLength(1);

    // The catalog archives the product, so the stored reference stops resolving.
    await models.products.updateOne({ id: 'milk-full' }, { $set: { archivedAt: new Date() } });
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data.favorites).toEqual([]);
    // The id is still on the record, so restoring the product brings the
    // favorite back rather than losing it silently.
    expect((await Customer.findOne({ email: 'fav3@example.com' }).lean())?.favoriteProductIDs).toEqual(['milk-full']);
    await models.products.updateOne({ id: 'milk-full' }, { $set: { archivedAt: null } });
    expect((await request(app).get('/api/v1/customer/favorites').set('Authorization', bearer)).body.data.favorites).toHaveLength(1);
  });
});