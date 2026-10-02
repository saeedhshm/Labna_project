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
import { Customer, Inventory, InventoryMovement, Order, initializeDatabase, models, Staff, Store } from './database.js';
import { ApiError } from './http.js';
import { createResource, updateResource, ensureInventory, serialized } from './catalog-service.js';
import { importOrder, mapBanner, mapBranch, mapCategory, mapProduct } from './catalog-import.js';
import type { LocalizedText, OrderItemDTO, OrderStatus, Resource } from '@labna/contracts';
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
const demoCustomer = config.SEED_CUSTOMER_EMAIL && config.SEED_CUSTOMER_PASSWORD ? z.object({ email: z.email().toLowerCase(), password: z.string().min(8).max(200) }).parse({
  email: config.SEED_CUSTOMER_EMAIL,
  password: config.SEED_CUSTOMER_PASSWORD,
}) : null;

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

const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];
const demoOrders: { id: string; orderNumber: string; status: OrderStatus; productID: string; variantID: string; quantity: number; daysAgo: number; paymentStatus: 'pending' | 'paid' }[] = [
  { id: 'demo-order-pending', orderNumber: 'LBN-DEMO-PENDING', status: 'pending', productID: 'milk-full', variantID: 'milk-full-250', quantity: 2, daysAgo: 0, paymentStatus: 'pending' },
  { id: 'demo-order-confirmed', orderNumber: 'LBN-DEMO-CONFIRMED', status: 'confirmed', productID: 'yogurt-natural', variantID: 'yogurt-natural-170', quantity: 3, daysAgo: 1, paymentStatus: 'pending' },
  { id: 'demo-order-preparing', orderNumber: 'LBN-DEMO-PREPARING', status: 'preparing', productID: 'cheese-white', variantID: 'cheese-white-250', quantity: 1, daysAgo: 2, paymentStatus: 'paid' },
  { id: 'demo-order-ready', orderNumber: 'LBN-DEMO-READY', status: 'ready', productID: 'butter-unsalted', variantID: 'butter-unsalted-250', quantity: 2, daysAgo: 3, paymentStatus: 'paid' },
  { id: 'demo-order-delivery', orderNumber: 'LBN-DEMO-DELIVERY', status: 'out_for_delivery', productID: 'cream-cooking', variantID: 'cream-cooking-250', quantity: 2, daysAgo: 4, paymentStatus: 'paid' },
  { id: 'demo-order-completed', orderNumber: 'LBN-DEMO-COMPLETED', status: 'completed', productID: 'cheese-labneh', variantID: 'cheese-labneh-250', quantity: 1, daysAgo: 5, paymentStatus: 'paid' },
  { id: 'demo-order-cancelled', orderNumber: 'LBN-DEMO-CANCELLED', status: 'cancelled', productID: 'milk-low-fat', variantID: 'milk-low-fat-500', quantity: 1, daysAgo: 6, paymentStatus: 'pending' },
];

function historyFor(status: OrderStatus, createdAt: Date) {
  const flow = status === 'cancelled' ? ['pending', 'cancelled'] as OrderStatus[] : statusFlow.slice(0, statusFlow.indexOf(status) + 1);
  return flow.map((item, index) => ({ status: item, at: new Date(createdAt.getTime() + index * 18 * 60_000).toISOString(), actorID: index === 0 ? null : 'seed' }));
}

async function createDemoOrders(customerID: string, branchID: string) {
  let orderCreated = 0;
  for (const demo of demoOrders) {
    if (await Order.exists({ id: demo.id })) continue;
    const product = await models.products.findOne({ id: demo.productID, archivedAt: null }).lean();
    const variant = product?.data.variants.find((item: { id: string }) => item.id === demo.variantID);
    const stock = await Inventory.findOne({ branchID, variantID: demo.variantID });
    if (!product || !variant || !stock) {
      warnings.push(`demo order ${demo.orderNumber} skipped: missing product, variant or stock row`);
      continue;
    }
    const reservedDelta = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(demo.status) ? demo.quantity : 0;
    const onHandDelta = demo.status === 'completed' ? -demo.quantity : 0;
    if (stock.onHand + onHandDelta < stock.reserved + reservedDelta) {
      warnings.push(`demo order ${demo.orderNumber} skipped: not enough stock for ${demo.variantID}`);
      continue;
    }
    const createdAt = new Date(Date.now() - demo.daysAgo * 86400_000);
    const item: OrderItemDTO = {
      productID: product.id,
      variantID: variant.id,
      productName: product.data.name as LocalizedText,
      variantLabel: variant.label as LocalizedText,
      imageURL: product.data.imageURLs[0],
      quantity: demo.quantity,
      unit: variant.unit,
      variantQuantity: variant.quantity,
      currencyCode: variant.currencyCode,
      unitPriceMinor: variant.priceMinor,
      lineTotalMinor: variant.priceMinor * demo.quantity,
    };
    const subtotalMinor = item.lineTotalMinor;
    const deliveryFeeMinor = demo.status === 'cancelled' ? 0 : 1500;
    const discountMinor = demo.status === 'completed' ? Math.floor(subtotalMinor * 0.1) : 0;
    const totalMinor = Math.max(0, subtotalMinor + deliveryFeeMinor - discountMinor);
    await mongoose.connection.transaction(async session => {
      stock.onHand += onHandDelta;
      stock.reserved += reservedDelta;
      stock.version += 1;
      await stock.save({ session });
      if (reservedDelta || onHandDelta) await InventoryMovement.create([{ inventoryID: stock.id, orderID: demo.id, onHandDelta, reservedDelta, reason: `Seed demo order ${demo.status}`, actorID: 'seed', commandID: randomUUID() }], { session });
      await Order.create([{ id: demo.id, orderNumber: demo.orderNumber, customerID, customer: { name: 'Demo Customer', phoneNumber: '+201012345678', email: demoCustomer?.email }, address: { city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '3', apartment: '5', notes: 'Demo seed order' }, branchID, items: [item], currencyCode: variant.currencyCode, subtotalMinor, deliveryFeeMinor, discountMinor, totalMinor, couponCode: discountMinor ? 'LABNA10' : '', payment: { method: demo.paymentStatus === 'paid' ? 'demo_card_success' : 'cash_on_delivery', status: demo.paymentStatus, providerReference: demo.paymentStatus === 'paid' ? `seed_${demo.id}` : null }, status: demo.status, statusHistory: historyFor(demo.status, createdAt), createdAt, updatedAt: new Date(createdAt.getTime() + 2 * 60 * 60_000) }], { session });
    });
    orderCreated++;
  }
  if (orderCreated) warnings.push(`Created ${orderCreated} demo orders across different lifecycle statuses.`);
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

  const finalStore = await Store.findOne({ id: 'store' }).lean();
  if (demoCustomer && finalStore?.defaultPickupBranchID) {
    const customerID = 'demo-customer';
    await Customer.updateOne({ email: demoCustomer.email }, { $setOnInsert: {
      id: customerID,
      name: 'Demo Customer',
      phoneNumber: '+201012345678',
      email: demoCustomer.email,
      passwordHash: await hash(demoCustomer.password),
      addresses: [{ id: 'demo-home', label: 'Home', city: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12', floor: '3', apartment: '5', notes: 'Demo address', isDefault: true }],
    } }, { upsert: true });
    await createDemoOrders(customerID, finalStore.defaultPickupBranchID);
  }

  const [categoryCount, productCount, bannerCount, branchCount, variantCount, customerCount, orderCount] = await Promise.all([
    models.categories.countDocuments({ archivedAt: null }),
    models.products.countDocuments({ archivedAt: null }),
    models.banners.countDocuments({ archivedAt: null }),
    models.branches.countDocuments({ archivedAt: null }),
    Inventory.countDocuments(),
    Customer.countDocuments(),
    Order.countDocuments(),
  ]);

  console.info('Seed complete.');
  console.info(`  manager:   ${admin.email}${created + updated === 0 ? ' (already existed)' : ''}`);
  console.info(`  branches:  ${branchCount}`);
  console.info(`  categories:${categoryCount}`);
  console.info(`  products:  ${productCount}`);
  console.info(`  banners:   ${bannerCount}`);
  console.info(`  inventory rows: ${variantCount}`);
  console.info(`  customers: ${customerCount}`);
  console.info(`  orders:    ${orderCount}`);
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
