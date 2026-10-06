import { describe, expect, it } from 'vitest';
import { cartQuantityMax } from '@labna/contracts';
import { ApiError } from '../src/api';
import { clampQuantity, galleryImages, isAvailabilityError, isMissingProduct, isPurchasable, quantityBounds, resolveVariant, selectInitialVariant, startingPrice } from '../src/product-detail';
import type { PublicVariant } from '../src/types';

const variant = (id: string, overrides: Partial<PublicVariant> = {}): PublicVariant => ({
  id,
  label: { ar: `خيار ${id}`, en: `Option ${id}` },
  quantity: 1000,
  unit: 'ml',
  priceMinor: 3500,
  currencyCode: 'EGP',
  isAvailable: true,
  availableQuantity: 5,
  ...overrides,
});

describe('product detail domain rules', () => {
  it('preselects the first purchasable variant and falls back to the first when sold out', () => {
    const single = [variant('only')];
    expect(selectInitialVariant(single)?.id).toBe('only');

    const mixed = [variant('out', { isAvailable: false, availableQuantity: 0 }), variant('in')];
    expect(selectInitialVariant(mixed)?.id).toBe('in');

    const soldOut = [variant('a', { isAvailable: false }), variant('b', { isAvailable: false })];
    expect(selectInitialVariant(soldOut)?.id).toBe('a');
    expect(isPurchasable(soldOut)).toBe(false);
  });

  it('keeps an explicit selection but recovers from a stale variant id', () => {
    const variants = [variant('a'), variant('b')];
    expect(resolveVariant(variants, 'b')?.id).toBe('b');
    expect(resolveVariant(variants, 'removed')?.id).toBe('a');
    expect(resolveVariant(variants)?.id).toBe('a');
    expect(resolveVariant([], 'a')).toBeUndefined();
  });

  it('caps quantity by availability and by the shared cart limit', () => {
    expect(quantityBounds(variant('a', { availableQuantity: 5 }))).toEqual({ min: 1, max: 5 });
    expect(quantityBounds(variant('a', { availableQuantity: 999_999 }))).toEqual({ min: 1, max: cartQuantityMax });
    expect(quantityBounds(variant('a', { isAvailable: false, availableQuantity: 0 }))).toEqual({ min: 0, max: 0 });
    expect(quantityBounds(undefined)).toEqual({ min: 0, max: 0 });
  });

  it('clamps quantity into range and refuses to produce one for sold out variants', () => {
    const bounds = { min: 1, max: 4 };
    expect(clampQuantity(0, bounds)).toBe(1);
    expect(clampQuantity(3, bounds)).toBe(3);
    expect(clampQuantity(99, bounds)).toBe(4);
    expect(clampQuantity(Number.NaN, bounds)).toBe(1);
    expect(clampQuantity(Number.POSITIVE_INFINITY, bounds)).toBe(1);
    expect(clampQuantity(3, { min: 0, max: 0 })).toBe(0);
  });

  it('separates a missing product from a retryable failure', () => {
    expect(isMissingProduct(new ApiError(404, 'NOT_FOUND', 'Product not found'))).toBe(true);
    expect(isMissingProduct(new ApiError(500, 'INTERNAL_ERROR', 'boom'))).toBe(false);
    expect(isMissingProduct(new Error('network'))).toBe(false);
    expect(isAvailabilityError(new ApiError(503, 'NO_PICKUP_BRANCH', 'no branch'))).toBe(true);
    expect(isAvailabilityError(new ApiError(422, 'INVALID_BRANCH', 'bad branch'))).toBe(true);
    expect(isAvailabilityError(new ApiError(404, 'NOT_FOUND', 'missing'))).toBe(false);
  });

  it('normalizes gallery sources and drops blanks and duplicates', () => {
    expect(galleryImages(['a', ' b ', 'a', '', '  ', 'b'])).toEqual(['a', 'b']);
    expect(galleryImages(undefined)).toEqual([]);
    expect(galleryImages([])).toEqual([]);
  });

  it('reports the starting price from purchasable variants only', () => {
    expect(startingPrice([variant('a', { priceMinor: 5000 }), variant('b', { priceMinor: 3000 })])).toBe(3000);
    expect(startingPrice([variant('a', { priceMinor: 100, isAvailable: false })])).toBeUndefined();
    expect(startingPrice([])).toBeUndefined();
  });
});
