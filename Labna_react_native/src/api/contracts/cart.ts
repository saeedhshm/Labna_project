import type {
  LocalizedText,
} from '@src/api/contracts/catalog';

export const CART_QUANTITY_MAX = 1000;

export type CartItemRequest = {
  productID: string;
  variantID: string;
  quantity: number;
};

export type CartValidationRequest = {
  branchID?: string;
  items: CartItemRequest[];
};

export type CartValidationReason =
  | 'ok'
  | 'product_not_found'
  | 'variant_not_found'
  | 'unavailable'
  | 'insufficient_stock';

export type CartValidationItem = {
  productID: string;
  variantID: string;
  quantity: number;
  productName: LocalizedText;
  variantLabel: LocalizedText;
  imageURL: string;
  unit: 'ml' | 'g';
  variantQuantity: number;
  currencyCode: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  availableQuantity: number;
  valid: boolean;
  reason: CartValidationReason;
};

export type CartValidationResponse = {
  branchID: string;
  currencyCode: string;
  items: CartValidationItem[];
  subtotalMinor: number;
  valid: boolean;
};

export type LocalCartItem = {
  productID: string;
  variantID: string;
  quantity: number;
  unitPriceAtAddition: number;
};