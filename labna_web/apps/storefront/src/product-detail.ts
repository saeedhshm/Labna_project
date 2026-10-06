/**
 * Pure decision helpers for the product detail screen.
 *
 * Kept free of React so the domain rules — which variant to preselect, how far
 * the quantity stepper may move, whether a failed load means "missing" or
 * "retry" — are unit testable and reusable from the cart milestone.
 */
import { cartQuantityMax } from '@labna/contracts';
import type { PublicVariant } from './types';
import { ApiError } from './api';

export type QuantityBounds = { min: number; max: number };

/**
 * Preselects the first variant a customer can actually buy and falls back to the
 * first variant so an out-of-stock product still shows its price and options.
 */
export function selectInitialVariant(variants: PublicVariant[]): PublicVariant | undefined {
  return variants.find((variant) => variant.isAvailable) ?? variants[0];
}

/** Resolves the selected variant, falling back when the id is stale or absent. */
export function resolveVariant(variants: PublicVariant[], selectedID?: string): PublicVariant | undefined {
  const selected = selectedID ? variants.find((variant) => variant.id === selectedID) : undefined;
  return selected ?? selectInitialVariant(variants);
}

/**
 * Quantity is capped by what the variant can supply, then by the shared cart
 * line limit. An unavailable variant yields max 0 so the stepper cannot offer a
 * purchasable quantity.
 */
export function quantityBounds(variant: PublicVariant | undefined): QuantityBounds {
  if (!variant || !variant.isAvailable) return { min: 0, max: 0 };
  return { min: 1, max: Math.max(1, Math.min(variant.availableQuantity, cartQuantityMax)) };
}

export function clampQuantity(value: number, bounds: QuantityBounds): number {
  if (bounds.max === 0) return 0;
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(value)));
}

/**
 * The catalog answers 404 for unknown, archived and unpublished products, so that
 * status means "customer facing not found" rather than a transient failure.
 */
export function isMissingProduct(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function isAvailabilityError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 422 || error.status === 503);
}

/**
 * Normalizes gallery sources: drops blanks and duplicates so the same picture is
 * not shown twice, and reports an empty list so the UI can render a placeholder.
 */
export function galleryImages(urls: readonly string[] | undefined): string[] {
  if (!urls) return [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (typeof url === 'string' && url.trim()) seen.add(url.trim());
  }
  return [...seen];
}

/** Cheapest purchasable variant price, used for "from" labelling on cards. */
export function startingPrice(variants: PublicVariant[]): number | undefined {
  const prices = variants.filter((variant) => variant.isAvailable).map((variant) => variant.priceMinor);
  return prices.length ? Math.min(...prices) : undefined;
}

export function isPurchasable(variants: PublicVariant[]): boolean {
  return variants.some((variant) => variant.isAvailable);
}
