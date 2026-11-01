import type {
  LocalizedText,
} from '@src/api/contracts/catalog';

import type {
  CheckoutAddress,
  CheckoutCustomer,
  PaymentMethod,
} from '@src/api/contracts/checkout';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed';

export type OrderItem = {
  productID: string;
  variantID: string;
  productName: LocalizedText;
  variantLabel: LocalizedText;
  imageURL: string;
  quantity: number;
  unit: 'ml' | 'g';
  variantQuantity: number;
  currencyCode: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerID: string | null;
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  branchID: string;
  items: OrderItem[];
  currencyCode: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  discountMinor: number;
  totalMinor: number;
  couponCode: string;
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    providerReference: string | null;
  };
  status: OrderStatus;
  statusHistory: Array<{
    status: OrderStatus;
    at: string;
    actorID: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type OrdersPageMeta = {
  nextCursor: string | null;
  requestID: string;
};

export type OrdersPageResponse = {
  data: Order[];
  meta: OrdersPageMeta;
};