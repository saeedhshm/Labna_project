/**
 * Shared request/response validation for the Labna backend, storefront and admin.
 *
 * These schemas are the single source of truth for catalog and administration
 * payloads. They are strict: unknown keys are rejected so a typo or a stale
 * client field fails loudly instead of being silently dropped.
 */
import { z } from 'zod';

/** Public, stable resource identifier. Also used for deep links and SKU-ish keys. */
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);

/** Integer minor currency units. Totals must never use floating point. */
const money = z.number().int().min(0).max(1_000_000_000);

/** Bilingual text. Both languages are required so the storefront never falls back mid-page. */
export const localized = z.strictObject({
  ar: z.string().trim().min(1).max(5000),
  en: z.string().trim().min(1).max(5000),
});

/** Only HTTPS image URLs; the host allowlist is enforced server side. */
export const imageURL = z.url().refine(value => new URL(value).protocol === 'https:', 'HTTPS required');

export const unit = z.enum(['ml', 'g']);

/** A sellable size option. `quantity` is the pack size, never the stock count. */
export const variant = z.strictObject({
  id,
  sku: z.string().trim().min(1).max(100),
  label: localized,
  quantity: z.number().int().positive().max(1_000_000),
  unit,
  priceMinor: money,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  isActive: z.boolean(),
});

export const publicationStatus = z.enum(['draft', 'published']);

/** ISO weekday 1 (Monday) ... 7 (Sunday) with local 24-hour times. */
export const weekday = z.number().int().min(1).max(7);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const openingInterval = z.strictObject({ opensAt: clock, closesAt: clock });
export const openingHours = z.array(openingInterval.extend({ weekday })).max(28);
export const dateOverride = z.strictObject({ date: z.iso.date(), intervals: z.array(openingInterval).max(4) });
export const timeZoneIdentifier = z.string().refine(value => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA time zone');

export const branchFields = {
  name: localized,
  address: localized,
  coordinate: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable(),
  timeZoneIdentifier,
  openingHours,
  dateOverrides: z.array(dateOverride).max(366),
  isVisible: z.boolean(),
  pickupEnabled: z.boolean(),
  acceptsOrders: z.boolean(),
};

export const schemas = {
  categories: z.strictObject({ name: localized, imageURL, sortOrder: z.number().int().min(0) }),
  products: z.strictObject({
    categoryID: id,
    name: localized,
    description: localized,
    ingredients: localized,
    storageInstructions: localized,
    imageURLs: z.array(imageURL).min(1).max(10),
    isFeatured: z.boolean(),
    publicationStatus,
    variants: z.array(variant).min(1).max(50),
  }),
  branches: z.strictObject(branchFields),
  banners: z.strictObject({
    title: localized,
    subtitle: localized,
    imageURL,
    destination: z.strictObject({ kind: z.enum(['product', 'category']), id }),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  }),
};

export type Resource = keyof typeof schemas;
export const resources: Resource[] = ['categories', 'products', 'branches', 'banners'];

// ---------------------------------------------------------------------------
// Shared query and command payloads
// ---------------------------------------------------------------------------

/** Signed, filter-bound offset cursor. Maximum offset is capped server side. */
export const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(2000).optional(),
});

const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true').optional();

export const productQuery = pageQuery.extend({
  branchID: id.optional(),
  categoryID: id.optional(),
  q: z.string().trim().max(100).optional(),
  locale: z.enum(['ar', 'en']).default('en'),
  featured: booleanQuery,
  available: booleanQuery,
  minPriceMinor: z.coerce.number().int().min(0).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['featured', 'priceAsc', 'priceDesc', 'name']).default('featured'),
}).refine(
  query => query.minPriceMinor === undefined || query.maxPriceMinor === undefined || query.minPriceMinor <= query.maxPriceMinor,
  'Invalid price range',
);

export const loginBody = z.strictObject({ email: z.email().toLowerCase(), password: z.string().min(1).max(200) });
export const versionBody = z.strictObject({ version: z.number().int().min(0) });
export const settingsPatch = z.strictObject({ version: z.number().int().min(0), defaultPickupBranchID: id });

// Inventory quantities are whole sellable units, never package measurements.
const stockQuantity = z.number().int().min(0).max(1_000_000_000);
const inventoryFields = {
  id: z.uuid(),
  branchID: id,
  variantID: id,
  onHand: stockQuantity,
  reserved: stockQuantity,
  available: z.number().int().min(0).max(1_000_000_000),
  lowStockThreshold: stockQuantity,
  lowStock: z.boolean(),
  version: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
};
export const inventoryDTO = z.strictObject(inventoryFields).superRefine((value, context) => {
  if (value.onHand < value.reserved) context.addIssue({ code: 'custom', path: ['reserved'], message: 'Reserved stock cannot exceed on-hand stock' });
  if (value.available !== value.onHand - value.reserved) context.addIssue({ code: 'custom', path: ['available'], message: 'Available stock must equal onHand - reserved' });
  if (value.lowStock !== (value.available <= value.lowStockThreshold)) context.addIssue({ code: 'custom', path: ['lowStock'], message: 'Low-stock state does not match the threshold' });
});
export const inventoryMovementDTO = z.strictObject({
  id: z.uuid(),
  inventoryID: z.uuid(),
  orderID: id.nullable(),
  onHandDelta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  reservedDelta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  reason: z.string().trim().min(1).max(500),
  actorID: z.string().min(1),
  commandID: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const inventoryListQuery = pageQuery.extend({
  branchID: id.optional(),
  variantID: id.optional(),
  lowStock: booleanQuery,
  outOfStock: booleanQuery,
});
export const inventoryMovementQuery = pageQuery.extend({
  inventoryID: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).refine(query => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), { path: ['to'], message: 'Invalid date range' });
export const inventoryAdjustmentCommand = z.strictObject({
  branchID: id,
  variantID: id,
  onHandDelta: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0, 'Adjustment must be nonzero'),
  reason: z.string().trim().min(1).max(500),
  version: z.number().int().min(0),
});
export const inventoryThresholdPatch = z.strictObject({
  version: z.number().int().min(0),
  lowStockThreshold: stockQuantity,
});

export const cartItemInput = z.strictObject({
  productID: id,
  variantID: id,
  quantity: z.number().int().min(1).max(1000),
});
export const cartValidationRequest = z.strictObject({
  branchID: id.optional(),
  items: z.array(cartItemInput).min(1).max(100),
});
export const cartValidationItem = z.strictObject({
  productID: id,
  variantID: id,
  quantity: z.number().int().min(1).max(1000),
  productName: localized,
  variantLabel: localized,
  imageURL,
  unit,
  variantQuantity: z.number().int().positive().max(1_000_000),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  unitPriceMinor: money,
  lineTotalMinor: money,
  availableQuantity: stockQuantity,
  valid: z.boolean(),
  reason: z.enum(['ok', 'product_not_found', 'variant_not_found', 'unavailable', 'insufficient_stock']),
});
export const cartValidationResponse = z.strictObject({
  branchID: id,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  items: z.array(cartValidationItem),
  subtotalMinor: money,
  valid: z.boolean(),
});

export const orderStatus = z.enum(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
export const paymentMethod = z.enum(['cash_on_delivery', 'demo_card_success', 'demo_card_failure']);
export const paymentStatus = z.enum(['pending', 'paid', 'failed']);
export const checkoutAddress = z.strictObject({
  city: z.string().trim().min(2).max(100),
  area: z.string().trim().min(2).max(100),
  street: z.string().trim().min(3).max(200),
  building: z.string().trim().min(1).max(50),
  floor: z.string().trim().max(50).optional().default(''),
  apartment: z.string().trim().max(50).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
});
export const checkoutCustomer = z.strictObject({
  name: z.string().trim().min(2).max(120),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
  email: z.email().toLowerCase().optional(),
});
export const customerRegisterBody = checkoutCustomer.extend({ password: z.string().min(8).max(200) });
export const customerLoginBody = z.strictObject({ email: z.email().toLowerCase(), password: z.string().min(1).max(200) });
export const customerAddressInput = checkoutAddress.extend({ label: z.string().trim().min(1).max(80), isDefault: z.boolean().default(false) });
export const customerAddressDTO = customerAddressInput.extend({ id });
export const customerDTO = z.strictObject({ id, name: z.string(), phoneNumber: z.string(), email: z.email(), addresses: z.array(customerAddressDTO), createdAt: z.iso.datetime() });
export const checkoutRequest = z.strictObject({
  customerID: id.optional(),
  customer: checkoutCustomer,
  address: checkoutAddress,
  branchID: id.optional(),
  items: z.array(cartItemInput).min(1).max(100),
  couponCode: z.string().trim().max(40).optional().default(''),
  paymentMethod,
});
export const orderItemDTO = z.strictObject({
  productID: id,
  variantID: id,
  productName: localized,
  variantLabel: localized,
  imageURL,
  quantity: z.number().int().min(1).max(1000),
  unit,
  variantQuantity: z.number().int().positive().max(1_000_000),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  unitPriceMinor: money,
  lineTotalMinor: money,
});
export const orderDTO = z.strictObject({
  id,
  orderNumber: z.string().min(6).max(40),
  customerID: id.nullable(),
  customer: checkoutCustomer,
  address: checkoutAddress,
  branchID: id,
  items: z.array(orderItemDTO).min(1),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  subtotalMinor: money,
  deliveryFeeMinor: money,
  discountMinor: money,
  totalMinor: money,
  couponCode: z.string(),
  payment: z.strictObject({ method: paymentMethod, status: paymentStatus, providerReference: z.string().nullable() }),
  status: orderStatus,
  statusHistory: z.array(z.strictObject({ status: orderStatus, at: z.iso.datetime(), actorID: z.string().nullable() })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const adminOrderQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: orderStatus.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).refine(query => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), { path: ['to'], message: 'Invalid date range' });
export const orderStatusPatch = z.strictObject({ status: orderStatus });

export type InventoryDTO = z.infer<typeof inventoryDTO>;
export type InventoryMovementDTO = z.infer<typeof inventoryMovementDTO>;
export type InventoryListQuery = z.infer<typeof inventoryListQuery>;
export type InventoryMovementQuery = z.infer<typeof inventoryMovementQuery>;
export type InventoryAdjustmentCommand = z.infer<typeof inventoryAdjustmentCommand>;
export type InventoryThresholdPatch = z.infer<typeof inventoryThresholdPatch>;
export type CartItemInput = z.infer<typeof cartItemInput>;
export type CartValidationRequest = z.infer<typeof cartValidationRequest>;
export type CartValidationItem = z.infer<typeof cartValidationItem>;
export type CartValidationResponse = z.infer<typeof cartValidationResponse>;
export type CheckoutRequest = z.infer<typeof checkoutRequest>;
export type OrderDTO = z.infer<typeof orderDTO>;
export type OrderItemDTO = z.infer<typeof orderItemDTO>;
export type OrderStatus = z.infer<typeof orderStatus>;
export type PaymentMethod = z.infer<typeof paymentMethod>;
export type AdminOrderQuery = z.infer<typeof adminOrderQuery>;
export type OrderStatusPatch = z.infer<typeof orderStatusPatch>;
export type CustomerRegisterBody = z.infer<typeof customerRegisterBody>;
export type CustomerLoginBody = z.infer<typeof customerLoginBody>;
export type CustomerAddressInput = z.infer<typeof customerAddressInput>;
export type CustomerAddressDTO = z.infer<typeof customerAddressDTO>;
export type CustomerDTO = z.infer<typeof customerDTO>;

export type CategoryInput = z.infer<typeof schemas.categories>;
export type ProductInput = z.infer<typeof schemas.products>;
export type BranchInput = z.infer<typeof schemas.branches>;
export type BannerInput = z.infer<typeof schemas.banners>;
export type VariantInput = z.infer<typeof variant>;
export type LocalizedText = z.infer<typeof localized>;

/** Admin reads return the write payload plus identity and optimistic-lock version. */
type WithMeta<T> = T & { id: string; version: number };
export type CategoryDTO = WithMeta<CategoryInput>;
export type ProductDTO = WithMeta<ProductInput>;
export type BranchDTO = WithMeta<BranchInput>;
export type BannerDTO = WithMeta<BannerInput>;
/** Discriminated union so a screen can narrow on the resource it expects. */
export type ResourceDTO = CategoryDTO | ProductDTO | BranchDTO | BannerDTO;

export const storeSettings = z.strictObject({
  id: z.literal('store'),
  version: z.number().int().min(0),
  currencyCode: z.string(),
  defaultPickupBranchID: z.string().nullable(),
  acceptOutsideHours: z.literal(true),
  contact: z.string(),
  policies: z.string(),
});
export type StoreSettings = z.infer<typeof storeSettings>;
