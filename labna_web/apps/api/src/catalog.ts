import { type PipelineStage } from 'mongoose';
import { Router, type Response } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { Store, models } from './database.js';
import { id, pageQuery, productDetailQuery, productQuery, resources, schemas, settingsPatch, type Resource } from './contracts.js';
import { ApiError, pagination, publicResponse, respond } from './http.js';
import { archiveResource, createResource, updateResource, updateSettings } from './catalog-service.js';
import type { Config } from './config.js';

type BranchData = z.infer<typeof schemas.branches>;
export function openingState(branch: BranchData, now = new Date()) {
  const local = DateTime.fromJSDate(now).setZone(branch.timeZoneIdentifier);
  let isOpen = false;
  let nextOpensAt: string | null = null;
  // Bounded by one year of date overrides plus a complete weekly cycle.
  for (let day = 0; day <= 373; day++) {
    const date = local.startOf('day').plus({ days: day });
    const override = branch.dateOverrides.find(item => item.date === date.toISODate());
    const intervals = override ? override.intervals : branch.openingHours.filter(item => item.weekday === date.weekday);
    for (const interval of [...intervals].sort((a, b) => a.opensAt.localeCompare(b.opensAt))) {
      const start = DateTime.fromISO(`${date.toISODate()}T${interval.opensAt}`, { zone: branch.timeZoneIdentifier });
      const end = DateTime.fromISO(`${date.toISODate()}T${interval.closesAt}`, { zone: branch.timeZoneIdentifier });
      if (local >= start && local < end) isOpen = true;
      if (start > local && !nextOpensAt) nextOpensAt = start.toUTC().toISO();
    }
    if (nextOpensAt) break;
  }
  // While the branch is open there is no "next opening" worth advertising: a
  // split shift would otherwise report the later same-day interval (or the next
  // week's first interval) as if the shop were still shut.
  return { isOpen, nextOpensAt: isOpen ? null : nextOpensAt };
}

export function catalogRouters(config: Config) {
  const publicRouter = Router();
  const admin = Router();
  const getStore = async () => {
    const store = await Store.findOne({ id: 'store' }).lean();
    if (!store) throw new ApiError(503, 'NOT_INITIALIZED', 'Store not initialized');
    const { _id, __v, ...dto } = store;
    return dto;
  };
  publicRouter.get('/store', async (req, res) => { publicResponse(req, res, await getStore()); });
  admin.get('/settings', async (_req, res) => { respond(res, await getStore()); });
  admin.patch('/settings', async (req, res) => {
    const actor = { actorID: res.locals.staff.id, requestID: res.locals.requestID };
    const store = await updateSettings(settingsPatch.parse(req.body), actor);
    respond(res, { id: store.id, version: store.version, defaultPickupBranchID: store.defaultPickupBranchID });
  });

  for (const resource of resources) {
    const model = models[resource];
    // The acting manager comes from the auth middleware, never from the payload.
    const actor = (res: Response) => ({ actorID: res.locals.staff.id, requestID: res.locals.requestID });
    admin.get(`/${resource}`, async (req, res) => {
      const { cursor, limit } = pageQuery.parse(req.query);
      const page = pagination(config.CURSOR_SECRET, ['admin', resource, limit], cursor);
      const items = await model.find({ archivedAt: null }).sort({ id: 1 }).skip(page.offset).limit(limit + 1).lean();
      respond(res, items.slice(0, limit).map(item => ({ id: item.id, ...item.data, version: item.version })), { nextCursor: page.next(limit, items.length > limit) });
    });
    admin.get(`/${resource}/:id`, async (req, res) => {
      const item = await model.findOne({ id: id.parse(req.params.id), archivedAt: null }).lean();
      if (!item) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
      respond(res, { id: item.id, ...item.data, version: item.version });
    });
    admin.post(`/${resource}`, async (req, res) => {
      const { id: publicID, ...data } = schemas[resource].extend({ id }).parse(req.body);
      const item = await createResource(resource, publicID, data, config, actor(res));
      respond(res, { id: item.id, ...item.data, version: item.version }, {}, 201);
    });
    admin.patch(`/${resource}/:id`, async (req, res) => {
      const { version, ...patch } = schemas[resource].partial().extend({ version: z.number().int().min(0) }).parse(req.body);
      const item = await updateResource(resource, id.parse(req.params.id), version, patch, config, actor(res));
      respond(res, { id: item.id, ...item.data, version: item.version });
    });
    admin.delete(`/${resource}/:id`, async (req, res) => {
      const { version } = req.body as { version: number };
      await archiveResource(resource, id.parse(req.params.id), version, actor(res));
      respond(res, { archived: true });
    });
  }

  const publicFilter = (resource: Resource) => ({ archivedAt: null,
    ...(resource === 'branches' ? { 'data.isVisible': true } : {}),
    ...(resource === 'banners' ? { 'data.isActive': true } : {}),
  });
  for (const resource of ['categories', 'banners', 'branches'] as const) {
    const dto = (item: { id: string; data: any }) => {
      if (resource !== 'branches') {
        const { isActive, ...data } = item.data;
        return { id: item.id, ...data };
      }
      const { dateOverrides, isVisible, ...data } = item.data;
      return { id: item.id, ...data, isDemo: false, ...openingState(item.data) };
    };
    publicRouter.get(`/${resource}`, async (req, res) => {
      const { cursor, limit } = pageQuery.parse(req.query);
      const page = pagination(config.CURSOR_SECRET, [resource, limit], cursor);
      const items = await models[resource].find(publicFilter(resource)).sort(resource === 'branches' ? { id: 1 } : { 'data.sortOrder': 1, id: 1 }).skip(page.offset).limit(limit + 1).lean();
      publicResponse(req, res, items.slice(0, limit).map(dto), { nextCursor: page.next(limit, items.length > limit) });
    });
    if (resource === 'branches') publicRouter.get('/branches/:id', async (req, res) => {
      const item = await models.branches.findOne({ ...publicFilter('branches'), id: id.parse(req.params.id) }).lean();
      if (!item) throw new ApiError(404, 'NOT_FOUND', 'Branch not found');
      publicResponse(req, res, dto(item));
    });
  }

  async function products(query: z.infer<typeof productQuery>, productID?: string) {
    const store = await getStore();
    const branchID = query.branchID ?? store.defaultPickupBranchID;
    if (!branchID) throw new ApiError(503, 'NO_PICKUP_BRANCH', 'Configure a default pickup branch');
    const branch = await models.branches.findOne({ id: branchID, archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).lean();
    if (!branch) throw new ApiError(422, 'INVALID_BRANCH', 'Select a visible pickup branch');
    const { cursor, ...scope } = query;
    const page = pagination(config.CURSOR_SECRET, ['products', scope, branchID], cursor);
    const filter: Record<string, unknown> = { archivedAt: null, 'data.publicationStatus': 'published' };
    if (productID) filter.id = productID;
    if (query.categoryID) filter['data.categoryID'] = query.categoryID;
    if (query.featured !== undefined) filter['data.isFeatured'] = query.featured;
    if (query.q) filter.$or = ['name', 'description', 'ingredients'].map(field => ({ [`data.${field}.${query.locale}`]: { $regex: query.q!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }));
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $lookup: { from: 'inventories', let: { ids: '$data.variants.id' }, pipeline: [{ $match: { branchID, $expr: { $in: ['$variantID', '$$ids'] } } }], as: 'stock' } },
      { $set: {
        'data.variants': { $map: { input: '$data.variants', as: 'v', in: { $mergeObjects: ['$$v', {
          // A paused branch reports zero availability rather than hiding the product.
          availableQuantity: { $cond: [{ $and: ['$$v.isActive', branch.data.acceptsOrders] }, { $max: [0, { $sum: { $map: { input: { $filter: { input: '$stock', as: 's', cond: { $eq: ['$$s.variantID', '$$v.id'] } } }, as: 's', in: { $subtract: ['$$s.onHand', '$$s.reserved'] } } } }] }, 0] },
        }] } } },
      } },
      { $set: {
        // Matches the iOS contract: the starting price considers only variants a
        // customer can actually buy, so a fully unavailable product has no price
        // to sort or filter by.
        availablePrices: { $map: { input: { $filter: { input: '$data.variants', as: 'v', cond: { $gt: ['$$v.availableQuantity', 0] } } }, as: 'v', in: '$$v.priceMinor' } },
      } },
      { $set: { startingPrice: { $min: '$availablePrices' }, available: { $gt: [{ $size: '$availablePrices' }, 0] } } },
    ];
    const derived: Record<string, unknown> = {};
    if (query.available !== undefined) derived.available = query.available;
    if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) derived.startingPrice = { ...(query.minPriceMinor !== undefined ? { $gte: query.minPriceMinor } : {}), ...(query.maxPriceMinor !== undefined ? { $lte: query.maxPriceMinor } : {}) };
    pipeline.push({ $match: derived });
    // Unavailable products always sort last, then by price; id breaks ties.
    const unavailableLast = { available: -1 as const };
    const sort: Record<string, 1 | -1> = query.sort === 'name'
      ? { [`data.name.${query.locale}`]: 1, id: 1 }
      : query.sort === 'priceAsc'
        ? { ...unavailableLast, startingPrice: 1, id: 1 }
        : query.sort === 'priceDesc'
          ? { ...unavailableLast, startingPrice: -1, id: 1 }
          : { 'data.isFeatured': -1, id: 1 };
    pipeline.push({ $sort: sort }, { $skip: page.offset }, { $limit: query.limit + 1 });
    const items = await models.products.aggregate(pipeline);
    const data = items.slice(0, query.limit).map(item => {
      const { publicationStatus, ...product } = item.data;
      return { id: item.id, ...product, isDemo: false, variants: product.variants.map((v: any) => {
        const { sku, isActive, ...variant } = v;
        return { ...variant, isAvailable: variant.availableQuantity > 0 };
      }) };
    });
    return { data, meta: { branchID, nextCursor: page.next(query.limit, items.length > query.limit) } };
  }
  publicRouter.get('/products', async (req, res) => {
    const result = await products(productQuery.parse(req.query));
    publicResponse(req, res, result.data, result.meta);
  });
  publicRouter.get('/products/:id', async (req, res) => {
    // A single product honours branch and locale like the list route, but the
    // list-only filters are rejected instead of silently becoming a false 404.
    const query = productDetailQuery.parse(req.query);
    const result = await products(productQuery.parse(query), id.parse(req.params.id));
    if (!result.data.length) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    publicResponse(req, res, result.data[0], { branchID: result.meta.branchID });
  });
  return { publicRouter, admin };
}
