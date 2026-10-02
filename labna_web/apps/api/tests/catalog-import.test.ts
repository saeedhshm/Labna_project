import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { id, schemas } from '@labna/contracts';
import { deriveSKU, mapBanner, mapBranch, mapCategory, mapProduct } from '../src/catalog-import.js';

const catalogDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'seed', 'ios-catalog');
const load = (name: string) => JSON.parse(readFileSync(path.join(catalogDir, `${name}.json`), 'utf8')) as any[];

describe('iOS catalog mapping', () => {
  it('derives stable, unique SKUs from variant ids', () => {
    expect(deriveSKU('milk-full-500')).toBe('MILK-FULL-500');
    expect(deriveSKU('butter_ghee.1000')).toBe('BUTTER-GHEE-1000');
    expect(deriveSKU('-odd-id-')).toBe('ODD-ID');
  });

  it('exposes the same id pattern the API enforces', () => {
    expect(id.safeParse('milk-full-500').success).toBe(true);
    expect(id.safeParse('bad id!').success).toBe(false);
  });

  it('maps every bundled record to a valid API payload', () => {
    for (const row of load('categories')) expect(schemas.categories.safeParse(mapCategory(row).value).success).toBe(true);
    for (const row of load('branches')) expect(schemas.branches.safeParse(mapBranch(row).value).success).toBe(true);
    for (const row of load('products')) expect(schemas.products.safeParse(mapProduct(row).value).success).toBe(true);
    for (const row of load('banners')) expect(schemas.banners.safeParse(mapBanner(row).value).success).toBe(true);
  });

  it('keeps SKUs unique across the whole imported catalog', () => {
    const skus = load('products').flatMap(row => mapProduct(row).value.variants.map(variant => variant.sku));
    expect(new Set(skus).size).toBe(skus.length);
    const ids = load('products').flatMap(row => mapProduct(row).value.variants.map(variant => variant.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('inverts the iOS isAvailable flag into isActive and reports it', () => {
    const row = { ...load('products').find(item => item.id === 'milk-buffalo') };
    const { value, warnings } = mapProduct(row);
    const litre = value.variants.find(variant => variant.id === 'milk-buffalo-1000');
    const small = value.variants.find(variant => variant.id === 'milk-buffalo-500');
    expect(litre?.isActive).toBe(false);
    expect(small?.isActive).toBe(true);
    expect(warnings.some(warning => warning.includes('milk-buffalo-1000'))).toBe(true);
  });

  it('publishes imported products and points each one at an existing category', () => {
    const categoryIDs = new Set(load('categories').map(row => row.id));
    for (const row of load('products')) {
      const value = mapProduct(row).value;
      expect(value.publicationStatus).toBe('published');
      expect(categoryIDs.has(value.categoryID)).toBe(true);
    }
  });

  it('only targets destinations that the import will have created', () => {
    const categoryIDs = new Set(load('categories').map(row => row.id));
    const productIDs = new Set(load('products').map(row => row.id));
    for (const row of load('banners')) {
      const { destination } = mapBanner(row).value;
      const known = destination.kind === 'category' ? categoryIDs : productIDs;
      expect(known.has(destination.id)).toBe(true);
    }
  });

  it('defaults branches to visible and accepting pickup orders', () => {
    for (const row of load('branches')) {
      const value = mapBranch(row).value;
      expect(value).toMatchObject({ isVisible: true, pickupEnabled: true, acceptsOrders: true, dateOverrides: [] });
    }
  });

  it('rejects a product variant with an unusable id instead of importing it silently', () => {
    const source = load('products')[0];
    const broken = { ...source, variants: [{ ...source.variants[0], id: 'bad id!' }] };
    expect(() => mapProduct(broken)).toThrow();
  });
});

afterAll(() => expect(catalogDir).toContain('ios-catalog'));
beforeAll(() => expect(load('products').length).toBeGreaterThan(0));
