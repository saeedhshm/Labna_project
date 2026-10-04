import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { customerAddressInput, customerLoginBody, customerPasswordPatch, customerProfilePatch, customerRegisterBody, pageQuery } from '@labna/contracts';
import type { Config } from './config.js';
import { Customer, CustomerSession, Order } from './database.js';
import { ApiError, pagination, respond } from './http.js';
import { toOrderDTO, transitionOrder } from './orders.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'labna_customer_refresh';
const cookiePath = '/api/v1/customer/auth';
const dummyHash = hash(randomBytes(32).toString('hex'));

export function customerAuthentication(config: Config) {
  const key = new TextEncoder().encode(config.JWT_SECRET);
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict' as const, path: cookiePath };
  const token = (customerID: string, sessionID: string) => new SignJWT({ type: 'customer', sid: sessionID }).setSubject(customerID).setProtectedHeader({ alg: 'HS256' }).setIssuer('labna-api').setAudience('labna-customer').setIssuedAt().setExpirationTime('15m').sign(key);
  const toDTO = (customer: any) => ({ id: customer.id, name: customer.name, phoneNumber: customer.phoneNumber, email: customer.email, addresses: customer.addresses ?? [], createdAt: new Date(customer.createdAt).toISOString() });
  const normalizeAddresses = (addresses: any[]) => {
    if (!addresses.length) return [];
    let defaultSeen = false;
    const normalized = addresses.map((address, index) => {
      const isDefault = address.isDefault === true && !defaultSeen;
      if (isDefault) defaultSeen = true;
      return { ...address, isDefault };
    });
    if (!defaultSeen) normalized[0] = { ...normalized[0], isDefault: true };
    return normalized;
  };
  const issue = async (res: Response, customer: any, sessionID: string, refresh: string, expiresAt: Date) => {
    res.cookie(cookieName, refresh, { ...cookieOptions, expires: expiresAt });
    return respond(res, { accessToken: await token(customer.id, sessionID), expiresIn: 900, customer: toDTO(customer) });
  };
  const readCustomer: RequestHandler = async (req, res, next) => {
    try {
      if (!req.headers.authorization?.startsWith('Bearer ')) throw new Error();
      const claims = (await jwtVerify(req.headers.authorization.slice(7), key, { algorithms: ['HS256'], issuer: 'labna-api', audience: 'labna-customer' })).payload;
      if (claims.type !== 'customer' || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw new Error();
      const [customer, session] = await Promise.all([
        Customer.findOne({ id: claims.sub, isActive: true }),
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
    const created = await Customer.create({ name: input.name, phoneNumber: input.phoneNumber, email: input.email, passwordHash: await hash(input.password), isActive: true, addresses: [] });
    const refresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    const session = await CustomerSession.create({ customerID: created.id, refreshHash: digest(refresh), expiresAt });
    await issue(res, created, session.id, refresh, expiresAt);
  });
  router.post('/login', async (req, res) => {
    const input = customerLoginBody.parse(req.body);
    const customer = await Customer.findOne({ email: input.email });
    const valid = await verify(customer?.passwordHash ?? await dummyHash, input.password);
    if (!valid || !customer || !customer.isActive) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const refresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    const session = await CustomerSession.create({ customerID: customer.id, refreshHash: digest(refresh), expiresAt });
    await issue(res, customer, session.id, refresh, expiresAt);
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
    const customer = await Customer.findOne({ id: session.customerID, isActive: true });
    if (!customer) {
      await CustomerSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
      res.clearCookie(cookieName, cookieOptions);
      throw new ApiError(401, 'UNAUTHORIZED', 'Inactive customer account');
    }
    await issue(res, customer, session.id, nextRefresh, session.expiresAt);
  });
  router.post('/logout', readCustomer, async (_req, res) => {
    await CustomerSession.updateOne({ _id: res.locals.customerSessionID }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, cookieOptions);
    respond(res, { loggedOut: true });
  });

  const account = Router();
  account.get('/me', (_req, res) => respond(res, toDTO(res.locals.customer)));
  account.patch('/me', async (req, res) => {
    const input = customerProfilePatch.parse(req.body);
    const customer = await Customer.findOneAndUpdate({ id: res.locals.customer.id, isActive: true }, { $set: input }, { new: true });
    if (!customer) throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required');
    respond(res, toDTO(customer));
  });
  account.patch('/me/password', async (req, res) => {
    const input = customerPasswordPatch.parse(req.body);
    const customer = await Customer.findOne({ id: res.locals.customer.id, isActive: true });
    if (!customer) throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required');
    if (!await verify(customer.passwordHash, input.currentPassword)) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    if (await verify(customer.passwordHash, input.newPassword)) throw new ApiError(422, 'PASSWORD_REUSE', 'New password must be different from the current password');
    customer.passwordHash = await hash(input.newPassword);
    await customer.save();
    await CustomerSession.updateMany({ customerID: customer.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, cookieOptions);
    respond(res, { passwordChanged: true });
  });
  account.get('/addresses', (_req, res) => respond(res, res.locals.customer.addresses ?? []));
  account.post('/addresses', async (req, res) => {
    const input = customerAddressInput.parse(req.body);
    const customer = res.locals.customer;
    const current = customer.addresses ?? [];
    const address = { id: randomBytes(8).toString('hex'), recipientName: customer.name, phoneNumber: customer.phoneNumber, ...input, isDefault: input.isDefault || current.length === 0 };
    const addresses = normalizeAddresses([...current.map((item: any) => address.isDefault ? { ...item, isDefault: false } : item), address]);
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, address, {}, 201);
  });
  account.patch('/addresses/:id', async (req, res) => {
    const input = customerAddressInput.partial().parse(req.body);
    const customer = res.locals.customer;
    let found = false;
    const addresses = normalizeAddresses((customer.addresses ?? []).map((item: any) => {
      if (item.id !== req.params.id) return input.isDefault ? { ...item, isDefault: false } : item;
      found = true;
      return { ...item, ...input };
    }));
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Address not found');
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, addresses.find((item: any) => item.id === req.params.id));
  });
  account.patch('/addresses/:id/default', async (req, res) => {
    const customer = res.locals.customer;
    let found = false;
    const addresses = (customer.addresses ?? []).map((item: any) => {
      const isDefault = item.id === req.params.id;
      if (isDefault) found = true;
      return { ...item, isDefault };
    });
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Address not found');
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, addresses.find((item: any) => item.id === req.params.id));
  });
  account.delete('/addresses/:id', async (req, res) => {
    const customer = res.locals.customer;
    const addresses = normalizeAddresses((customer.addresses ?? []).filter((item: any) => item.id !== req.params.id));
    if (addresses.length === (customer.addresses ?? []).length) throw new ApiError(404, 'NOT_FOUND', 'Address not found');
    await Customer.updateOne({ id: customer.id }, { $set: { addresses } });
    respond(res, { deleted: true, addresses });
  });
  account.get('/orders', async (req, res) => {
    const { cursor, limit } = pageQuery.parse(req.query);
    const page = pagination(config.CURSOR_SECRET, ['customer-orders', res.locals.customer.id, limit], cursor);
    const items = await Order.find({ customerID: res.locals.customer.id }).sort({ createdAt: -1, id: 1 }).skip(page.offset).limit(limit + 1).lean();
    respond(res, items.slice(0, limit).map(toOrderDTO), { nextCursor: page.next(limit, items.length > limit) });
  });
  account.get('/orders/:id', async (req, res) => {
    const item = await Order.findOne({ customerID: res.locals.customer.id, $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    respond(res, toOrderDTO(item));
  });
  account.patch('/orders/:id/cancel', async (req, res) => {
    if (Object.keys(req.body ?? {}).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Cancel request does not accept a body');
    const item = await Order.findOne({ customerID: res.locals.customer.id, $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    if (item.status !== 'pending') throw new ApiError(409, 'ORDER_NOT_CANCELLABLE', 'Order can no longer be cancelled by the customer');
    respond(res, await transitionOrder(item.id, 'cancelled', res.locals.customer.id));
  });

  return { router, account, requireCustomer: readCustomer, optionalCustomer };
}
