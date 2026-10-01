import { z } from 'zod';

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const money = z.number().int().min(0).max(1_000_000_000);
export const localized = z.strictObject({ ar: z.string().trim().min(1).max(5000), en: z.string().trim().min(1).max(5000) });
export const imageURL = z.url().refine(value => new URL(value).protocol === 'https:', 'HTTPS required');
export const variant = z.strictObject({
  id, sku: z.string().trim().min(1).max(100), label: localized,
  quantity: z.number().int().positive().max(1_000_000), unit: z.enum(['ml', 'g']),
  priceMinor: money, currencyCode: z.string().regex(/^[A-Z]{3}$/), isActive: z.boolean(),
});
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const interval = z.strictObject({ opensAt: clock, closesAt: clock });
export const branchFields = {
  name: localized, address: localized,
  coordinate: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable(),
  timeZoneIdentifier: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Invalid IANA time zone'),
  openingHours: z.array(interval.extend({ weekday: z.number().int().min(1).max(7) })).max(28),
  dateOverrides: z.array(z.strictObject({ date: z.iso.date(), intervals: z.array(interval).max(4) })).max(366),
  isVisible: z.boolean(), pickupEnabled: z.boolean(), acceptsOrders: z.boolean(),
};
export const schemas = {
  categories: z.strictObject({ name: localized, imageURL, sortOrder: z.number().int().min(0) }),
  products: z.strictObject({
    categoryID: id, name: localized, description: localized, ingredients: localized,
    storageInstructions: localized, imageURLs: z.array(imageURL).min(1).max(10),
    isFeatured: z.boolean(), publicationStatus: z.enum(['draft', 'published']),
    variants: z.array(variant).min(1).max(50),
  }),
  branches: z.strictObject(branchFields),
  banners: z.strictObject({
    title: localized, subtitle: localized, imageURL,
    destination: z.strictObject({ kind: z.enum(['product', 'category']), id }),
    sortOrder: z.number().int().min(0), isActive: z.boolean(),
  }),
};
export type Resource = keyof typeof schemas;
export const resources = Object.keys(schemas) as Resource[];
export const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(2000).optional(),
});
const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true').optional();
export const productQuery = pageQuery.extend({
  branchID: id.optional(), categoryID: id.optional(), q: z.string().trim().max(100).optional(),
  locale: z.enum(['ar', 'en']).default('en'), featured: booleanQuery, available: booleanQuery,
  minPriceMinor: z.coerce.number().int().min(0).optional(), maxPriceMinor: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['featured', 'priceAsc', 'priceDesc', 'name']).default('featured'),
}).refine(q => q.minPriceMinor === undefined || q.maxPriceMinor === undefined || q.minPriceMinor <= q.maxPriceMinor, 'Invalid price range');
export const loginBody = z.strictObject({ email: z.email().toLowerCase(), password: z.string().min(1).max(200) });
export const versionBody = z.strictObject({ version: z.number().int().min(0) });
export const settingsPatch = z.strictObject({ version: z.number().int().min(0), defaultPickupBranchID: id });
