/**
 * Catalog and store write rules.
 *
 * The HTTP routes and the iOS catalog importer both call these functions, so a
 * seeded store is validated by exactly the same invariants as one edited in the
 * admin panel: reference checks, variant identity, archiving guards, revision
 * serialization, inventory rows and audit records.
 */
import { z } from 'zod';
import { schemas, settingsPatch, versionBody, type Resource } from '@labna/contracts';
import { ApiError } from './http.js';
import { Audit, CatalogLock, Inventory, models, Store } from './database.js';
import type { Config } from './config.js';
import mongoose, { type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type BranchData = z.infer<typeof schemas.branches>;
export type Actor = { actorID?: string; requestID?: string };

const toData = (resource: Resource) => schemas[resource];

export function validateSchedule(data: BranchData) {
  const groups = new Map<string, { opensAt: string; closesAt: string }[]>();
  for (const interval of data.openingHours) {
    groups.set(String(interval.weekday), [...(groups.get(String(interval.weekday)) ?? []), interval]);
  }
  for (const override of data.dateOverrides) {
    if (groups.has(override.date)) throw new ApiError(422, 'INVALID_SCHEDULE', 'Duplicate date override');
    groups.set(override.date, override.intervals);
  }
  for (const intervals of groups.values()) {
    const sorted = [...intervals].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    sorted.forEach((interval, index) => {
      if (interval.opensAt >= interval.closesAt || (index > 0 && sorted[index - 1].closesAt > interval.opensAt)) {
        throw new ApiError(422, 'INVALID_SCHEDULE', 'Intervals must not overlap or cross midnight');
      }
    });
  }
}

/** Runs a write inside a transaction and bumps the catalog revision to serialize it. */
export async function serialized<T>(action: (session: ClientSession) => Promise<T>) {
  return mongoose.connection.transaction(async session => {
    await CatalogLock.updateOne({ id: 'catalog' }, { $inc: { revision: 1 } }, { session });
    return action(session);
  });
}

/** Creates inventory rows at zero. Stock is entered through a later adjustment step. */
export async function ensureInventory(session: ClientSession) {
  const products = await models.products.find({ archivedAt: null }).session(session);
  const branches = await models.branches.find({ archivedAt: null, 'data.pickupEnabled': true }).session(session);
  const ops = branches.flatMap(branch => products.flatMap(product => product.data.variants.map((v: { id: string }) => ({
    updateOne: { filter: { branchID: branch.id, variantID: v.id }, update: { $setOnInsert: { id: randomUUID(), onHand: 0, reserved: 0, lowStockThreshold: 5, version: 0 } }, upsert: true },
  }))));
  if (ops.length) await Inventory.bulkWrite(ops, { session });
}

async function validateReferences(resource: Resource, data: Record<string, any>, session: ClientSession, config: Config) {
  const urls = [...(data.imageURLs ?? []), ...(data.imageURL ? [data.imageURL] : [])] as string[];
  if (urls.some(url => !config.MEDIA_ORIGINS.includes(new URL(url).origin))) {
    throw new ApiError(422, 'INVALID_MEDIA_ORIGIN', 'Use a configured image host');
  }
  if (resource === 'branches') validateSchedule(data as BranchData);
  if (resource === 'products') {
    if (!await models.categories.exists({ id: data.categoryID, archivedAt: null }).session(session)) {
      throw new ApiError(422, 'INVALID_CATEGORY', 'Category does not exist');
    }
    const store = await Store.findOne({ id: 'store' }).session(session);
    for (const field of ['id', 'sku']) {
      const values = data.variants.map((v: Record<string, unknown>) => v[field]);
      if (new Set(values).size !== values.length) {
        throw new ApiError(422, 'DUPLICATE_VARIANT', 'Variant IDs and SKUs must be unique');
      }
    }
    if (data.variants.some((v: Record<string, unknown>) => v.currencyCode !== store?.currencyCode)) {
      throw new ApiError(422, 'INVALID_CURRENCY', 'Use store currency');
    }
  }
  if (resource === 'banners') {
    const target = data.destination.kind === 'product' ? models.products : models.categories;
    const filter = {
      id: data.destination.id,
      archivedAt: null,
      ...(data.destination.kind === 'product' ? { 'data.publicationStatus': 'published' } : {}),
    };
    if (!await target.exists(filter).session(session)) {
      throw new ApiError(422, 'INVALID_DESTINATION', 'Banner destination must be published');
    }
  }
}

export async function createResource(
  resource: Resource,
  publicID: string,
  rawData: unknown,
  config: Config,
  actor: Actor = {},
) {
  const data = toData(resource).parse(rawData);
  return serialized(async session => {
    await validateReferences(resource, data, session, config);
    const [created] = await models[resource].create([{ id: publicID, data }], { session });
    if (resource === 'products' || resource === 'branches') await ensureInventory(session);
    await Audit.create([{ actorID: actor.actorID, action: `${resource}.create`, resourceID: publicID, requestID: actor.requestID }], { session });
    return created;
  });
}

export async function updateResource(
  resource: Resource,
  publicID: string,
  version: number,
  patch: Record<string, unknown>,
  config: Config,
  actor: Actor = {},
) {
  const schema = toData(resource);
  return serialized(async session => {
    const current = await models[resource].findOne({ id: publicID, archivedAt: null }).session(session);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    if (current.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh resource and retry');
    const data = schema.parse({ ...current.data, ...patch });
    await validateReferences(resource, data, session, config);
    if (resource === 'products') {
      const next = data as z.infer<typeof schemas.products>;
      // Variant identity is immutable so carts, stock rows and orders stay valid.
      const removed = current.data.variants.filter((v: { id: string }) => !next.variants.some(item => item.id === v.id));
      if (removed.length) throw new ApiError(409, 'VARIANT_IN_USE', 'Deactivate variants instead of removing them');
      if (next.publicationStatus !== 'published' && await models.banners.exists({ archivedAt: null, 'data.isActive': true, 'data.destination.kind': 'product', 'data.destination.id': publicID }).session(session)) {
        throw new ApiError(409, 'RESOURCE_IN_USE', 'Disable referencing banners first');
      }
    }
    if (resource === 'branches') {
      const next = data as BranchData;
      const store = await Store.findOne({ id: 'store' }).session(session);
      if (store?.defaultPickupBranchID === publicID && (!next.pickupEnabled || !next.isVisible)) {
        throw new ApiError(409, 'DEFAULT_BRANCH', 'Choose another default branch first');
      }
    }
    current.data = data;
    current.version++;
    await current.save({ session });
    if (resource === 'products' || resource === 'branches') await ensureInventory(session);
    await Audit.create([{ actorID: actor.actorID, action: `${resource}.update`, resourceID: publicID, requestID: actor.requestID }], { session });
    return current;
  });
}

/** Archiving is a soft delete: historical orders keep their own snapshots. */
export async function archiveResource(resource: Resource, publicID: string, version: number, actor: Actor = {}) {
  void versionBody.parse({ version });
  return serialized(async session => {
    const current = await models[resource].findOne({ id: publicID, archivedAt: null }).session(session);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    if (current.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh resource and retry');
    if (resource === 'categories' && await models.products.exists({ archivedAt: null, 'data.categoryID': publicID }).session(session)) {
      throw new ApiError(409, 'RESOURCE_IN_USE', 'Move or archive products first');
    }
    if (resource === 'categories' || resource === 'products') {
      const kind = resource === 'products' ? 'product' : 'category';
      if (await models.banners.exists({ archivedAt: null, 'data.isActive': true, 'data.destination.kind': kind, 'data.destination.id': publicID }).session(session)) {
        throw new ApiError(409, 'RESOURCE_IN_USE', 'Disable referencing banners first');
      }
    }
    if (resource === 'branches' && (await Store.findOne({ id: 'store' }).session(session))?.defaultPickupBranchID === publicID) {
      throw new ApiError(409, 'DEFAULT_BRANCH', 'Choose another default branch first');
    }
    if (resource === 'branches' || resource === 'products') {
      const stockFilter = resource === 'branches'
        ? { branchID: publicID }
        : { variantID: { $in: current.data.variants.map((v: { id: string }) => v.id) } };
      if (await Inventory.exists({ ...stockFilter, reserved: { $gt: 0 } }).session(session)) {
        throw new ApiError(409, 'STOCK_RESERVED', 'Resource has reserved inventory');
      }
    }
    current.archivedAt = new Date();
    current.version++;
    await current.save({ session });
    await Audit.create([{ actorID: actor.actorID, action: `${resource}.archive`, resourceID: publicID, requestID: actor.requestID }], { session });
  });
}

export async function updateSettings(rawBody: unknown, actor: Actor = {}) {
  const input = settingsPatch.parse(rawBody);
  return serialized(async session => {
    if (!await models.branches.exists({ id: input.defaultPickupBranchID, archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).session(session)) {
      throw new ApiError(422, 'INVALID_BRANCH', 'Default branch must be visible and support pickup');
    }
    const result = await Store.findOneAndUpdate(
      { id: 'store', version: input.version },
      { $set: { defaultPickupBranchID: input.defaultPickupBranchID }, $inc: { version: 1 } },
      { new: true, session },
    );
    if (!result) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh settings and retry');
    await Audit.create([{ actorID: actor.actorID, action: 'settings.update', resourceID: 'store', requestID: actor.requestID }], { session });
    return result;
  });
}
