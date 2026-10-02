/**
 * Bootstraps a usable store: manager account, catalog imported from the iOS app's
 * bundled JSON, with zero stock unless demo stock is explicitly requested.
 *
 * Every catalog write goes through the same service the admin API uses, so the
 * imported data is held to identical rules and each record is audited.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import { hash } from '@node-rs/argon2';
import { readConfig } from './config.js';
import { initializeDatabase, Inventory, models, Staff, Store } from './database.js';
import { ApiError } from './http.js';
import { createResource, updateResource, ensureInventory, serialized } from './catalog-service.js';
import { importOrder, mapBanner, mapBranch, mapCategory, mapProduct } from './catalog-import.js';
import type { Resource } from '@labna/contracts';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adjustInventory } from './inventory-service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/seed.js at runtime, src/seed.ts in development.
const catalogDir = [path.join(here, '..', '..', '..', 'seed', 'ios-catalog'), path.join(here, '..', '..', 'seed', 'ios-catalog')];

async function readCatalog(name: string) {
  for (const directory of catalogDir) {
    try {
      return JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8')) as unknown[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Missing ${name}.json. Expected it under labna_web/seed/ios-catalog/.`);
}

const config = readConfig();
const admin = z.object({ email: z.email().toLowerCase(), password: z.string().min(12).max(200) }).parse({
  email: config.SEED_ADMIN_EMAIL,
  password: config.SEED_ADMIN_PASSWORD,
});

let created = 0;
let updated = 0;
const warnings: string[] = [];

/** Creates the record, or updates it in place when it already exists. */
async function upsert(resource: Resource, id: string, data: unknown) {
  const existing = await models[resource].findOne({ id });
  if (!existing) {
    await createResource(resource, id, data, config, { actorID: 'seed' });
    created++;
    return;
  }
  if (existing.archivedAt) {
    warnings.push(`${resource}/${id} was archived and was left untouched`);
    return;
  }
  await updateResource(resource, id, existing.version, data as Record<string, unknown>, config, { actorID: 'seed' });
  updated++;
}

try {
  await mongoose.connect(config.MONGODB_URI);
  await initializeDatabase();

  await Staff.updateOne({ email: admin.email }, { $setOnInsert: {
    email: admin.email, passwordHash: await hash(admin.password), role: 'manager', status: 'active',
  } }, { upsert: true });

  for (const resource of importOrder) {
    const rows = await readCatalog(resource);
    for (const row of rows) {
      const source = row as { id: string };
      const mapped = resource === 'categories' ? mapCategory(row as never)
        : resource === 'branches' ? mapBranch(row as never)
        : resource === 'products' ? mapProduct(row as never)
        : mapBanner(row as never);
      warnings.push(...mapped.warnings.map(warning => `${resource}/${source.id}: ${warning}`));
      await upsert(resource, source.id, mapped.value);
    }
  }

  // Demo stock only, so the imported catalog is visible instead of unavailable.
  const stock = config.SEED_STOCK_ON_HAND;
  await serialized(ensureInventory);
  if (stock > 0) {
    const branchIDs = await models.branches.find({ archivedAt: null, 'data.pickupEnabled': true }).then(list => list.map(branch => branch.id));
    const rows = await Inventory.find({ branchID: { $in: branchIDs } });
    for (const row of rows) {
      const delta = stock - row.onHand;
      if (delta !== 0) await adjustInventory({ branchID: row.branchID, variantID: row.variantID, onHandDelta: delta, reason: 'Explicit demo seed stock', version: row.version }, randomUUID(), 'seed', randomUUID());
    }
    warnings.push(`Stock adjusted to ${stock} units per variant as demo data; movements were recorded.`);
  }

  const store = await Store.findOne({ id: 'store' }).lean();
  if (!store?.defaultPickupBranchID) {
    const branch = await models.branches.findOne({ archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).lean();
    if (branch) {
      await serialized(async session => {
        await Store.updateOne({ id: 'store' }, { $set: { defaultPickupBranchID: branch.id }, $inc: { version: 1 } }, { session });
      });
      warnings.push(`Default pickup branch set to ${branch.id}.`);
    }
  }

  const [categoryCount, productCount, bannerCount, branchCount, variantCount] = await Promise.all([
    models.categories.countDocuments({ archivedAt: null }),
    models.products.countDocuments({ archivedAt: null }),
    models.banners.countDocuments({ archivedAt: null }),
    models.branches.countDocuments({ archivedAt: null }),
    Inventory.countDocuments(),
  ]);

  console.info('Seed complete.');
  console.info(`  manager:   ${admin.email}${created + updated === 0 ? ' (already existed)' : ''}`);
  console.info(`  branches:  ${branchCount}`);
  console.info(`  categories:${categoryCount}`);
  console.info(`  products:  ${productCount}`);
  console.info(`  banners:   ${bannerCount}`);
  console.info(`  inventory rows: ${variantCount}`);
  console.info(`  created ${created}, updated ${updated}`);
  if (warnings.length) {
    console.info('  notes:');
    for (const warning of warnings) console.info(`    - ${warning}`);
  }
  if (created + updated === 0) console.info('  The catalog was already present; re-running only refreshes nothing.');
} catch (error) {
  if (error instanceof ApiError) console.error(`Seed failed: ${error.code} — ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
