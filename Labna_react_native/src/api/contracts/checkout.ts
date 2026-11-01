import type {
  CartItemRequest,
} from '@src/api/contracts/cart';

export type CheckoutCustomer = {
  name: string;
  phoneNumber: string;
  email?: string;
};

export type CheckoutAddress = {
  city: string;
  area: string;
  street: string;
  building: string;
  floor?: string;
  apartment?: string;
  notes?: string;
};

export type PaymentMethod =
  | 'cash_on_delivery'
  | 'demo_card_success'
  | 'demo_card_failure';

export type CheckoutRequest = {
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  branchID?: string;
  items: CartItemRequest[];
  couponCode?: string;
  paymentMethod: PaymentMethod;
};

