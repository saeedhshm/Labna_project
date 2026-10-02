import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import type { Config } from './config.js';
import { authentication } from './auth.js';
import { catalogRouters } from './catalog.js';
import { ApiError, errors, requestContext, respond } from './http.js';
import { openapi } from './openapi.js';
import { inventoryRouter } from './inventory.js';
import { cartRouter } from './cart.js';
import { adminOrdersRouter, ordersRouter } from './orders.js';

export function createApp(config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('query parser', 'simple');
  app.use(requestContext, helmet());
  app.use(cors({ origin: (origin, callback) => {
    if (!origin || config.WEB_ORIGINS.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'INVALID_ORIGIN', 'Origin not allowed'));
  }, credentials: true, exposedHeaders: ['ETag', 'X-Request-ID', 'Retry-After'] }));
  app.use(express.json({ limit: '128kb' }), cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')) }));
  app.get('/health/live', (_req, res) => { respond(res, { status: 'ok' }); });
  app.get('/health/ready', (_req, res) => {
    if (mongoose.connection.readyState !== 1) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database not connected');
    respond(res, { status: 'ready' });
  });
  app.get('/api/v1/openapi.json', (_req, res) => { res.json(openapi); });
  const auth = authentication(config);
  const catalog = catalogRouters(config);
  app.use('/api/v1/staff/auth', auth.router);
  app.use('/api/v1/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/v1/admin/inventory', auth.requireStaff, inventoryRouter(config, auth.requireManager));
  app.use('/api/v1/admin/orders', auth.requireStaff, auth.requireManager, adminOrdersRouter(config));
  app.use('/api/v1/admin', auth.requireStaff, auth.requireManager, catalog.admin);
  app.use('/api/v1', cartRouter());
  app.use('/api/v1', ordersRouter());
  app.use('/api/v1', catalog.publicRouter);
  app.use(() => { throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found'); });
  app.use(errors);
  return app;
}
