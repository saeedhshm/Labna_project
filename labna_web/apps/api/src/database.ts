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
export const Inventory = mongoose.model('Inventory', new Schema({
  branchID: { type: String, required: true }, variantID: { type: String, required: true },
  onHand: { type: Number, min: 0, required: true, default: 0 },
  reserved: { type: Number, min: 0, required: true, default: 0 },
  lowStockThreshold: { type: Number, min: 0, default: 5 },
}, { timestamps: true }).index({ branchID: 1, variantID: 1 }, { unique: true }));
export const Store = mongoose.model('Store', new Schema({
  id: { type: String, unique: true, default: 'store' },
  currencyCode: { type: String, default: 'EGP' },
  defaultPickupBranchID: { type: String, default: null },
  acceptOutsideHours: { type: Boolean, default: true },
  contact: { type: String, default: '' }, policies: { type: String, default: '' },
  version: { type: Number, default: 0 },
}));
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
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  await CatalogLock.updateOne({ id: 'catalog' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  await Store.updateOne({ id: 'store' }, { $setOnInsert: { id: 'store' } }, { upsert: true });
}
