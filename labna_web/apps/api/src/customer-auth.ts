import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { customerAddressInput, customerLoginBody, customerRegisterBody, pageQuery } from '@labna/contracts';
import type { Config } from './config.js';
import { Customer, CustomerSession, Order } from './database.js';
import { ApiError, pagination, respond } from './http.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'labna_customer_refresh';
const cookiePath = '/api/v1/customer/auth';
const dummyHash = hash(randomBytes(32).toString('hex'));

export function customerAuthentication(config: Config) {
  const key = new TextEncoder().encode(config.JWT_SECRET);
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict' as const, path: cookiePath };
  const token = (customerID: string, sessionID: string) => new SignJWT({ type: 'customer', sid: sessionID }).setSubject(customerID).setProtectedHeader({ alg: 'HS256' }).setIssuer('labna-api').setAudience('labna-customer').setIssuedAt().setExpirationTime('15m').sign(key);
  const toDTO = (customer: any) => ({ id: customer.id, name: customer.name, phoneNumber: customer.phoneNumber, email: customer.email, addresses: customer.addresses ?? [], createdAt: new Date(customer.createdAt).toISOString() });
  const issue = async (res: Response, customerID: string, sessionID: string, refresh: string, expiresAt: Date) => {
    res.cookie(cookieName, refresh, { ...cookieOptions, expires: expiresAt });
    return respond(res, { accessToken: await token(customerID, sessionID), expiresIn: 900 });
  };
  const readCustomer: RequestHandler = async (req, res, next) => {
    try {
      if (!req.headers.authorization?.startsWith('Bearer ')) throw new Error();
      const claims = (await jwtVerify(req.headers.authorization.slice(7), key, { algorithms: ['HS256'], issuer: 'labna-api', audience: 'labna-customer' })).payload;
      if (claims.type !== 'customer' || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw new Error();
      const [customer, session] = await Promise.all([
        Customer.findOne({ id: claims.sub }),
        CustomerSession.findOne({ _id: claims.sid, customerID: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } }),
      ]);
      if (!customer || !session) throw new Error();
      res.locals.customer = customer;
      res.locals.customerSessionID = session.id;
      next();
    } catch { throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required'); }
  };
  const optionalCustomer: RequestHandler = async (req, res, next) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) return next();
    try { await readCustomer(req, res, next); } catch { next(); }
  };

  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use((req, _res, next) => {
    const origin = req.headers.origin;
    if ((origin && !config.WEB_ORIGINS.includes(origin)) || (!origin && req.cookies?.[cookieName])) throw new ApiError(403, 'INVALID_ORIGIN', 'Allowed Origin required for cookie authentication');
    next();
  });
  router.use(rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many authentication attempts')) }));
  router.post('/register', async (req, res) => {
    const input = customerRegisterBody.parse(req.body);
    const created = await Customer.create({ name: input.name, phoneNumber: input.phoneNumber, email: input.email, passwordHash: await hash(input.password), addresses: [] });
    const refresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    const session = await CustomerSession.create({ customerID: created.id, refreshHash: digest(refresh), expiresAt });
    await issue(res, created.id, session.id, refresh, expiresAt);
  });
  router.post('/login', async (req, res) => {
    const input = customerLoginBody.parse(req.body);
    const customer = await Customer.findOne({ email: input.email });
    const valid = await verify(customer?.passwordHash ?? await dummyHash, input.password);
    if (!valid || !customer) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const refresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    const session = await CustomerSession.create({ customerID: customer.id, refreshHash: digest(refresh), expiresAt });
    await issue(res, customer.id, session.id, refresh, expiresAt);
  });
  router.post('/refresh', async (req, res) => {
    const refresh = req.cookies?.[cookieName];
    if (typeof refresh !== 'string' || refresh.length > 200) throw new ApiError(401, 'UNAUTHORIZED', 'Refresh session required');
    const oldHash = digest(refresh);
    const nextRefresh = randomBytes(48).toString('base64url');
    const session = await CustomerSession.findOneAndUpdate({ refreshHash: oldHash, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { refreshHash: digest(nextRefresh) }, $push: { previousHashes: oldHash } }, { new: true });
    if (!session) {
      await CustomerSession.updateMany({ previousHashes: oldHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
      res.clearCookie(cookieName, cookieOptions);
      throw new ApiError(401, 'UNAUTHORIZED', 'Expired or reused refresh token');
    }
    await issue(res, session.customerID, session.id, nextRefresh, session.expiresAt);
  });
  router.post('/logout', readCustomer, async (_req, res) => {
    await CustomerSession.updateOne({ _id: res.locals.customerSessionID }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, cookieOptions);
    respond(res, { loggedOut: true });
  });

  const account = Router();
  account.get('/me', (_req, res) => respond(res, toDTO(res.locals.customer)));
  account.get('/addresses', (_req, res) => respond(res, res.locals.customer.addresses ?? []));
  account.post('/addresses', async (req, res) => {
    const input = customerAddressInput.parse(req.body);
    const customer = res.locals.customer;
    const address = { id: randomBytes(8).toString('hex'), ...input };
    const addresses = [...(customer.addresses ?? []).map((item: any) => input.isDefault ? { ...item, isDefault: false } : item), address];
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, address, {}, 201);
  });
  account.patch('/addresses/:id', async (req, res) => {
    const input = customerAddressInput.partial().parse(req.body);
    const customer = res.locals.customer;
    let found = false;
    const addresses = (customer.addresses ?? []).map((item: any) => {
      if (item.id !== req.params.id) return input.isDefault ? { ...item, isDefault: false } : item;
      found = true;
      return { ...item, ...input };
    });
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Address not found');
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, addresses.find((item: any) => item.id === req.params.id));
  });
  account.delete('/addresses/:id', async (req, res) => {
    const customer = res.locals.customer;
    const addresses = (customer.addresses ?? []).filter((item: any) => item.id !== req.params.id);
    if (addresses.length === (customer.addresses ?? []).length) throw new ApiError(404, 'NOT_FOUND', 'Address not found');
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, { deleted: true });
  });
  account.get('/orders', async (req, res) => {
    const { cursor, limit } = pageQuery.parse(req.query);
    const page = pagination(config.CURSOR_SECRET, ['customer-orders', res.locals.customer.id, limit], cursor);
    const items = await Order.find({ customerID: res.locals.customer.id }).sort({ createdAt: -1, id: 1 }).skip(page.offset).limit(limit + 1).lean();
    respond(res, items.slice(0, limit).map((item: any) => ({ ...item, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() })), { nextCursor: page.next(limit, items.length > limit) });
  });
  account.get('/orders/:id', async (req, res) => {
    const item = await Order.findOne({ customerID: res.locals.customer.id, $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    respond(res, { ...item, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() });
  });

  return { router, account, requireCustomer: readCustomer, optionalCustomer };
}
