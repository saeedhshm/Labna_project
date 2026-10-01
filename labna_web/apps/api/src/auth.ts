import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import type { Config } from './config.js';
import { loginBody } from './contracts.js';
import { Session, Staff } from './database.js';
import { ApiError, respond } from './http.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'labna_staff_refresh';
const cookiePath = '/api/v1/staff/auth';
const dummyHash = hash(randomBytes(32).toString('hex'));

export function authentication(config: Config) {
  const key = new TextEncoder().encode(config.JWT_SECRET);
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict' as const, path: cookiePath };
  const accessToken = (staffID: string, sessionID: string) => new SignJWT({ type: 'staff', sid: sessionID })
    .setSubject(staffID).setProtectedHeader({ alg: 'HS256' }).setIssuer('labna-api').setAudience('labna-staff')
    .setIssuedAt().setExpirationTime('15m').sign(key);
  const requireStaff: RequestHandler = async (req, res, next) => {
    let claims;
    try {
      if (!req.headers.authorization?.startsWith('Bearer ')) throw new Error();
      claims = (await jwtVerify(req.headers.authorization.slice(7), key, { algorithms: ['HS256'], issuer: 'labna-api', audience: 'labna-staff' })).payload;
      if (claims.type !== 'staff' || !mongoose.isValidObjectId(claims.sub) || typeof claims.sid !== 'string' || !mongoose.isValidObjectId(claims.sid)) throw new Error();
    } catch { throw new ApiError(401, 'UNAUTHORIZED', 'Valid staff session required'); }
    const [staff, session] = await Promise.all([
      Staff.findOne({ _id: claims.sub, status: 'active' }),
      Session.findOne({ _id: claims.sid, staffID: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ]);
    if (!staff || !session) throw new ApiError(401, 'UNAUTHORIZED', 'Session is no longer active');
    res.locals.staff = staff;
    res.locals.sessionID = session.id;
    next();
  };
  const requireManager: RequestHandler = (_req, res, next) => {
    if (res.locals.staff.role !== 'manager') throw new ApiError(403, 'FORBIDDEN', 'Manager role required');
    next();
  };
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use((req, _res, next) => {
    // Browsers must originate from an allowed UI; native/CLI login has no cookies.
    const origin = req.headers.origin;
    if ((origin && !config.WEB_ORIGINS.includes(origin)) || (!origin && req.cookies?.[cookieName])) throw new ApiError(403, 'INVALID_ORIGIN', 'Allowed Origin required for cookie authentication');
    next();
  });
  router.use(rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many authentication attempts')) }));
  const issue = async (res: Response, staffID: string, sessionID: string, token: string, expiresAt: Date) => {
    res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
    return respond(res, { accessToken: await accessToken(staffID, sessionID), expiresIn: 900 });
  };
  router.post('/login', async (req, res) => {
    const input = loginBody.parse(req.body);
    const staff = await Staff.findOne({ email: input.email });
    const valid = await verify(staff?.passwordHash ?? await dummyHash, input.password);
    if (!valid || !staff || staff.status !== 'active') throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    const session = await Session.create({ staffID: staff._id, refreshHash: digest(token), expiresAt });
    await issue(res, staff.id, session.id, token, expiresAt);
  });
  router.post('/refresh', async (req, res) => {
    const token = req.cookies?.[cookieName];
    if (typeof token !== 'string' || token.length > 200) throw new ApiError(401, 'UNAUTHORIZED', 'Refresh session required');
    const oldHash = digest(token);
    const nextToken = randomBytes(48).toString('base64url');
    const session = await Session.findOneAndUpdate(
      { refreshHash: oldHash, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { refreshHash: digest(nextToken) }, $push: { previousHashes: oldHash } }, { new: true },
    );
    if (!session) {
      await Session.updateMany({ previousHashes: oldHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
      res.clearCookie(cookieName, cookieOptions);
      throw new ApiError(401, 'UNAUTHORIZED', 'Expired or reused refresh token');
    }
    const staff = await Staff.findOne({ _id: session.staffID, status: 'active' });
    if (!staff) {
      await Session.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
      throw new ApiError(401, 'UNAUTHORIZED', 'Inactive staff account');
    }
    await issue(res, staff.id, session.id, nextToken, session.expiresAt);
  });
  router.post('/logout', requireStaff, async (_req, res) => {
    await Session.updateOne({ _id: res.locals.sessionID }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, cookieOptions);
    respond(res, { loggedOut: true });
  });
  return { router, requireStaff, requireManager };
}
