import mongoose, { type ClientSession, type PipelineStage } from 'mongoose';
import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { Audit, CatalogLock, Inventory, models, Store } from './database.js';
import { id, pageQuery, productQuery, resources, schemas, settingsPatch, versionBody, type Resource } from './contracts.js';
import { ApiError, pagination, publicResponse, respond } from './http.js';
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
  return { isOpen, nextOpensAt };
}

function validateSchedule(data: BranchData) {
  const groups = new Map<string, { opensAt: string; closesAt: string }[]>();
  for (const interval of data.openingHours) {
    const key = String(interval.weekday);
    groups.set(key, [...(groups.get(key) ?? []), interval]);
  }
  for (const override of data.dateOverrides) {
    if (groups.has(override.date)) throw new ApiError(422, 'INVALID_SCHEDULE', 'Duplicate date override');
    groups.set(override.date, override.intervals);
  }
  for (const intervals of groups.values()) {
    const sorted = [...intervals].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    sorted.forEach((interval, index) => {
      if (interval.opensAt >= interval.closesAt || (index > 0 && sorted[index - 1].closesAt > interval.opensAt)) throw new ApiError(422, 'INVALID_SCHEDULE', 'Intervals must not overlap or cross midnight');
    });
  }
}

async function write<T>(action: (session: ClientSession) => Promise<T>) {
  return mongoose.connection.transaction(async session => {
    await CatalogLock.updateOne({ id: 'catalog' }, { $inc: { revision: 1 } }, { session });
    return action(session);
  });
}

// All writes enter through strict Zod contracts; these shapes differ per resource.
async function validateReferences(resource: Resource, data: Record<string, any>, session: ClientSession, config: Config) {
  const urls = [...(data.imageURLs ?? []), ...(data.imageURL ? [data.imageURL] : [])] as string[];
  if (urls.some(url => !config.MEDIA_ORIGINS.includes(new URL(url).origin))) throw new ApiError(422, 'INVALID_MEDIA_ORIGIN', 'Use a configured image host');
  if (resource === 'branches') validateSchedule(data as BranchData);
  if (resource === 'products') {
    if (!await models.categories.exists({ id: data.categoryID, archivedAt: null }).session(session)) throw new ApiError(422, 'INVALID_CATEGORY', 'Category does not exist');
    const store = await Store.findOne({ id: 'store' }).session(session);
    for (const field of ['id', 'sku']) {
      const values = data.variants.map((v: Record<string, unknown>) => v[field]);
      if (new Set(values).size !== values.length) throw new ApiError(422, 'DUPLICATE_VARIANT', 'Variant IDs and SKUs must be unique');
    }
    if (data.variants.some((v: Record<string, unknown>) => v.currencyCode !== store?.currencyCode)) throw new ApiError(422, 'INVALID_CURRENCY', 'Use store currency');
  }
  if (resource === 'banners') {
    const target = data.destination.kind === 'product' ? models.products : models.categories;
    const filter = { id: data.destination.id, archivedAt: null, ...(data.destination.kind === 'product' ? { 'data.publicationStatus': 'published' } : {}) };
    if (!await target.exists(filter).session(session)) throw new ApiError(422, 'INVALID_DESTINATION', 'Banner destination must be published');
  }
}

async function ensureInventory(session: ClientSession) {
  const products = await models.products.find({ archivedAt: null }).session(session);
  const branches = await models.branches.find({ archivedAt: null, 'data.pickupEnabled': true }).session(session);
  const ops = branches.flatMap(branch => products.flatMap(product => product.data.variants.map((v: { id: string }) => ({
    updateOne: { filter: { branchID: branch.id, variantID: v.id }, update: { $setOnInsert: { onHand: 0, reserved: 0 } }, upsert: true },
  }))));
  if (ops.length) await Inventory.bulkWrite(ops, { session });
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
    const input = settingsPatch.parse(req.body);
    const store = await write(async session => {
      if (!await models.branches.exists({ id: input.defaultPickupBranchID, archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).session(session)) throw new ApiError(422, 'INVALID_BRANCH', 'Default branch must be visible and support pickup');
      const result = await Store.findOneAndUpdate({ id: 'store', version: input.version }, { $set: { defaultPickupBranchID: input.defaultPickupBranchID }, $inc: { version: 1 } }, { new: true, session });
      if (!result) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh settings and retry');
      await Audit.create([{ actorID: res.locals.staff.id, action: 'settings.update', resourceID: 'store', requestID: res.locals.requestID }], { session });
      return result;
    });
    respond(res, { id: store.id, version: store.version, defaultPickupBranchID: store.defaultPickupBranchID });
  });

  for (const resource of resources) {
    const model = models[resource];
    const schema = schemas[resource];
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
      const { id: publicID, ...data } = schema.extend({ id }).parse(req.body);
      const item = await write(async session => {
        await validateReferences(resource, data, session, config);
        const [created] = await model.create([{ id: publicID, data }], { session });
        if (resource === 'products' || resource === 'branches') await ensureInventory(session);
        await Audit.create([{ actorID: res.locals.staff.id, action: `${resource}.create`, resourceID: publicID, requestID: res.locals.requestID }], { session });
        return created;
      });
      respond(res, { id: item.id, ...item.data, version: item.version }, {}, 201);
    });
    admin.patch(`/${resource}/:id`, async (req, res) => {
      const publicID = id.parse(req.params.id);
      const { version, ...patch } = schema.partial().extend({ version: z.number().int().min(0) }).parse(req.body);
      const item = await write(async session => {
        const current = await model.findOne({ id: publicID, archivedAt: null }).session(session);
        if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
        if (current.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh resource and retry');
        const data = schema.parse({ ...current.data, ...patch });
        await validateReferences(resource, data, session, config);
        if (resource === 'products') {
          const next = data as z.infer<typeof schemas.products>;
          const removed = current.data.variants.filter((v: { id: string }) => !next.variants.some(item => item.id === v.id));
          // Immutable variant identity even before an order exists, preserving iOS cart references.
          if (removed.length) throw new ApiError(409, 'VARIANT_IN_USE', 'Deactivate variants instead of removing them');
          if (next.publicationStatus !== 'published' && await models.banners.exists({ archivedAt: null, 'data.isActive': true, 'data.destination.kind': 'product', 'data.destination.id': publicID }).session(session)) throw new ApiError(409, 'RESOURCE_IN_USE', 'Disable referencing banners first');
        }
        if (resource === 'branches') {
          const next = data as BranchData;
          const store = await Store.findOne({ id: 'store' }).session(session);
          if (store?.defaultPickupBranchID === publicID && (!next.pickupEnabled || !next.isVisible)) throw new ApiError(409, 'DEFAULT_BRANCH', 'Choose another default branch first');
        }
        current.data = data;
        current.version++;
        await current.save({ session });
        if (resource === 'products' || resource === 'branches') await ensureInventory(session);
        await Audit.create([{ actorID: res.locals.staff.id, action: `${resource}.update`, resourceID: publicID, requestID: res.locals.requestID }], { session });
        return current;
      });
      respond(res, { id: item.id, ...item.data, version: item.version });
    });
    admin.delete(`/${resource}/:id`, async (req, res) => {
      const publicID = id.parse(req.params.id);
      const { version } = versionBody.parse(req.body);
      await write(async session => {
        const current = await model.findOne({ id: publicID, archivedAt: null }).session(session);
        if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
        if (current.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh resource and retry');
        if (resource === 'categories' && await models.products.exists({ archivedAt: null, 'data.categoryID': publicID }).session(session)) throw new ApiError(409, 'RESOURCE_IN_USE', 'Move or archive products first');
        if (resource === 'categories' || resource === 'products') {
          if (await models.banners.exists({ archivedAt: null, 'data.isActive': true, 'data.destination.kind': resource === 'products' ? 'product' : 'category', 'data.destination.id': publicID }).session(session)) throw new ApiError(409, 'RESOURCE_IN_USE', 'Disable referencing banners first');
        }
        if (resource === 'branches' && (await Store.findOne({ id: 'store' }).session(session))?.defaultPickupBranchID === publicID) throw new ApiError(409, 'DEFAULT_BRANCH', 'Choose another default branch first');
        if (resource === 'branches' || resource === 'products') {
          const stockFilter = resource === 'branches' ? { branchID: publicID } : { variantID: { $in: current.data.variants.map((v: { id: string }) => v.id) } };
          if (await Inventory.exists({ ...stockFilter, reserved: { $gt: 0 } }).session(session)) throw new ApiError(409, 'STOCK_RESERVED', 'Resource has reserved inventory');
        }
        current.archivedAt = new Date(); current.version++;
        await current.save({ session });
        await Audit.create([{ actorID: res.locals.staff.id, action: `${resource}.archive`, resourceID: publicID, requestID: res.locals.requestID }], { session });
      });
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
        activePrices: { $map: { input: { $filter: { input: '$data.variants', as: 'v', cond: '$$v.isActive' } }, as: 'v', in: '$$v.priceMinor' } },
        'data.variants': { $map: { input: '$data.variants', as: 'v', in: { $mergeObjects: ['$$v', {
          availableQuantity: { $cond: [{ $and: ['$$v.isActive', branch.data.acceptsOrders] }, { $max: [0, { $sum: { $map: { input: { $filter: { input: '$stock', as: 's', cond: { $eq: ['$$s.variantID', '$$v.id'] } } }, as: 's', in: { $subtract: ['$$s.onHand', '$$s.reserved'] } } } }] }, 0] },
        }] } } },
      } },
      { $set: { startingPrice: { $min: '$activePrices' }, available: { $gt: [{ $max: '$data.variants.availableQuantity' }, 0] } } },
    ];
    const derived: Record<string, unknown> = {};
    if (query.available !== undefined) derived.available = query.available;
    if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) derived.startingPrice = { ...(query.minPriceMinor !== undefined ? { $gte: query.minPriceMinor } : {}), ...(query.maxPriceMinor !== undefined ? { $lte: query.maxPriceMinor } : {}) };
    pipeline.push({ $match: derived });
    const sort: Record<string, 1 | -1> = query.sort === 'name' ? { [`data.name.${query.locale}`]: 1, id: 1 } : query.sort === 'priceAsc' ? { startingPrice: 1, id: 1 } : query.sort === 'priceDesc' ? { startingPrice: -1, id: 1 } : { 'data.isFeatured': -1, id: 1 };
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
    const query = z.strictObject({ branchID: id.optional() }).parse(req.query);
    const result = await products(productQuery.parse(query), id.parse(req.params.id));
    if (!result.data.length) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    publicResponse(req, res, result.data[0], { branchID: result.meta.branchID });
  });
  return { publicRouter, admin };
}
