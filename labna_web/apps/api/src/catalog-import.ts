/**
 * Pure mapping from the iOS app's bundled JSON catalog to the API write payloads.
 *
 * Kept free of database access so the transformation is unit tested. The two
 * formats differ in ways the API requires:
 *   - iOS variants have `isAvailable` and no SKU; the API stores `isActive` and
 *     requires a unique SKU, so availability is inverted and a SKU is derived.
 *   - iOS products have no publication state, so they are imported as published.
 *   - iOS branches carry no visibility or order flags, so they default to a
 *     visible branch that accepts pickup orders.
 */
import { schemas, type BannerInput, type BranchInput, type CategoryInput, type ProductInput } from '@labna/contracts';

type Localized = { ar: string; en: string };

const localized = (value: Localized): Localized => ({ ar: value.ar.trim(), en: value.en.trim() });

/** Uppercase, punctuation-free SKU derived from the variant id, e.g. MILK-FULL-500. */
export const deriveSKU = (variantID: string) => variantID.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

export type SourceProduct = {
  id: string;
  categoryID: string;
  name: Localized;
  description: Localized;
  ingredients: Localized;
  storageInstructions: Localized;
  imageURLs: string[];
  isFeatured: boolean;
  variants: { id: string; label: Localized; quantity: number; unit: 'ml' | 'g'; priceMinor: number; currencyCode: string; isAvailable: boolean }[];
};

export type SourceCategory = { id: string; name: Localized; imageURL: string; sortOrder: number };
export type SourceBanner = { id: string; title: Localized; subtitle: Localized; imageURL: string; destination: { kind: 'product' | 'category'; id: string }; sortOrder: number };
export type SourceBranch = {
  id: string;
  name: Localized;
  address: Localized;
  coordinate: { latitude: number; longitude: number };
  phoneNumber: string | null;
  timeZoneIdentifier: string;
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
};

export type MappingResult<T> = { value: T; warnings: string[] };

export const mapCategory = (source: SourceCategory): MappingResult<CategoryInput> => {
  const value = { name: localized(source.name), imageURL: source.imageURL, sortOrder: source.sortOrder };
  return { value: schemas.categories.parse(value), warnings: [] };
};

export const mapBranch = (source: SourceBranch): MappingResult<BranchInput> => {
  const value = {
    name: localized(source.name),
    address: localized(source.address),
    coordinate: source.coordinate,
    phoneNumber: source.phoneNumber,
    timeZoneIdentifier: source.timeZoneIdentifier,
    openingHours: source.openingHours,
    dateOverrides: [],
    isVisible: true,
    pickupEnabled: true,
    acceptsOrders: true,
  };
  return { value: schemas.branches.parse(value), warnings: [] };
};

export const mapBanner = (source: SourceBanner): MappingResult<BannerInput> => {
  // iOS has no active flag; every bundled banner is treated as live.
  const value = {
    title: localized(source.title),
    subtitle: localized(source.subtitle),
    imageURL: source.imageURL,
    destination: source.destination,
    sortOrder: source.sortOrder,
    isActive: true,
  };
  return { value: schemas.banners.parse(value), warnings: [] };
};

export const mapProduct = (source: SourceProduct): MappingResult<ProductInput> => {
  const warnings: string[] = [];
  const skus = new Set<string>();
  const variants = source.variants.map(variant => {
    const sku = deriveSKU(variant.id);
    if (skus.has(sku)) warnings.push(`${source.id}: duplicate derived SKU ${sku}`);
    skus.add(sku);
    if (!variant.isAvailable) warnings.push(`${variant.id}: unavailable in iOS, imported as inactive`);
    return {
      id: variant.id,
      sku,
      label: localized(variant.label),
      quantity: variant.quantity,
      unit: variant.unit,
      priceMinor: variant.priceMinor,
      currencyCode: variant.currencyCode,
      // The API treats availability as a stock question, so only the sellable
      // flag is imported; stock quantity starts at zero and is set separately.
      isActive: variant.isAvailable,
    };
  });
  const value = {
    categoryID: source.categoryID,
    name: localized(source.name),
    description: localized(source.description),
    ingredients: localized(source.ingredients),
    storageInstructions: localized(source.storageInstructions),
    imageURLs: source.imageURLs,
    isFeatured: source.isFeatured,
    publicationStatus: 'published',
    variants,
  };
  return { value: schemas.products.parse(value), warnings };
};

export type Report = { created: number; updated: number; skipped: number; warnings: string[] };

/** Sorts categories, branches, products, then banners so references resolve. */
export const importOrder = ['branches', 'categories', 'products', 'banners'] as const;
