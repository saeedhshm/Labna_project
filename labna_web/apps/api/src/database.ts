import { randomUUID } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';

// Payloads are validated by the shared strict Zod contracts before every write.
// Mixed retains the DTO's exact camel-case structure; metadata stays internal.
const recordSchema = () => new Schema({
  id: { type: String, required: true, unique: true },
  data: { type: Schema.Types.Mixed, required: true },
  version: { type: Number, default: 0, required: true },
  archivedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });
const productSchema = recordSchema();
productSchema.index({ 'data.variants.id': 1 }, { unique: true });
productSchema.index({ 'data.variants.sku': 1 }, { unique: true });
productSchema.index({ 'data.categoryID': 1, 'data.publicationStatus': 1, id: 1 });
export const models = {
  products: mongoose.model('Product', productSchema),
  categories: mongoose.model('Category', recordSchema()),
  branches: mongoose.model('Branch', recordSchema()),
  banners: mongoose.model('Banner', recordSchema()),
};
const inventorySchema = new Schema({
  id: { type: String, required: true, unique: true, default: () => randomUUID() },
  branchID: { type: String, required: true }, variantID: { type: String, required: true },
  onHand: { type: Number, min: 0, required: true, default: 0 },
  reserved: { type: Number, min: 0, required: true, default: 0 },
  lowStockThreshold: { type: Number, min: 0, required: true, default: 5 },
  version: { type: Number, min: 0, required: true, default: 0 },
}, { timestamps: true });
inventorySchema.index({ branchID: 1, variantID: 1 }, { unique: true });
export const Inventory = mongoose.model('Inventory', inventorySchema);
const inventoryMovementSchema = new Schema({
  id: { type: String, required: true, unique: true, default: () => randomUUID() },
  inventoryID: { type: String, required: true },
  orderID: { type: String, default: null },
  onHandDelta: { type: Number, required: true }, reservedDelta: { type: Number, required: true, default: 0 },
  reason: { type: String, required: true }, actorID: { type: String, required: true }, commandID: { type: String, required: true },
}, { timestamps: true });
inventoryMovementSchema.index({ inventoryID: 1, createdAt: -1, id: 1 });
inventoryMovementSchema.index({ commandID: 1, inventoryID: 1 }, { unique: true });
export const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);
const idempotencySchema = new Schema({
  subject: { type: String, required: true }, route: { type: String, required: true }, key: { type: String, required: true },
  payloadHash: { type: String, required: true }, status: { type: Number, required: true }, response: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
idempotencySchema.index({ subject: 1, route: 1, key: 1 }, { unique: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const IdempotencyRecord = mongoose.model('IdempotencyRecord', idempotencySchema);
export const Store = mongoose.model('Store', new Schema({
  id: { type: String, unique: true, default: 'store' },
  currencyCode: { type: String, default: 'EGP' },
  defaultPickupBranchID: { type: String, default: null },
  acceptOutsideHours: { type: Boolean, default: true },
  contact: { type: String, default: '' }, policies: { type: String, default: '' },
  version: { type: Number, default: 0 },
}));
const orderSchema = new Schema({
  id: { type: String, required: true, unique: true, default: () => randomUUID() },
  orderNumber: { type: String, required: true, unique: true },
  customerID: { type: String, default: null },
  customer: { type: Schema.Types.Mixed, required: true },
  address: { type: Schema.Types.Mixed, required: true },
  branchID: { type: String, required: true },
  items: { type: [Schema.Types.Mixed], required: true },
  currencyCode: { type: String, required: true },
  subtotalMinor: { type: Number, min: 0, required: true },
  deliveryFeeMinor: { type: Number, min: 0, required: true },
  discountMinor: { type: Number, min: 0, required: true },
  totalMinor: { type: Number, min: 0, required: true },
  couponCode: { type: String, default: '' },
  payment: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'], required: true },
}, { timestamps: true, strict: 'throw' });
orderSchema.index({ createdAt: -1, id: 1 });
orderSchema.index({ 'customer.phoneNumber': 1, createdAt: -1 });
export const Order = mongoose.model('Order', orderSchema);
// Serializes related catalog mutations so reference checks and archiving cannot race.
export const CatalogLock = mongoose.model('CatalogLock', new Schema({
  id: { type: String, unique: true }, revision: { type: Number, default: 0 },
}));
export const Audit = mongoose.model('Audit', new Schema({
  actorID: String, action: String, resourceID: String, requestID: String,
}, { timestamps: true }));
export const Staff = mongoose.model('Staff', new Schema({
  email: { type: String, unique: true, required: true }, passwordHash: { type: String, required: true },
  role: { type: String, enum: ['manager', 'orderOperator'], required: true },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
}));
export const Session = mongoose.model('Session', new Schema({
  staffID: { type: Schema.Types.ObjectId, required: true },
  refreshHash: { type: String, unique: true, required: true },
  previousHashes: { type: [String], default: [] },
  expiresAt: { type: Date, required: true }, revokedAt: { type: Date, default: null },
}).index({ expiresAt: 1 }, { expireAfterSeconds: 0 }));

export async function initializeDatabase() {
  // Existing deployments predate public inventory IDs and optimistic versions.
  await Inventory.updateMany({ version: { $exists: false } }, { $set: { version: 0 } });
  const missingIDs = await Inventory.find({ $or: [{ id: { $exists: false } }, { id: null }] }).select('_id').lean();
  if (missingIDs.length) await Inventory.bulkWrite(missingIDs.map(row => ({ updateOne: { filter: { _id: row._id }, update: { $set: { id: randomUUID() } } } })));
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  await CatalogLock.updateOne({ id: 'catalog' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  await Store.updateOne({ id: 'store' }, { $setOnInsert: { id: 'store' } }, { upsert: true });
}
