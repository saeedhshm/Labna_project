import { request } from '@src/core/api/apiClient';
import type { ApiResponse } from '@src/api/contracts/common';

import type {
  CheckoutRequest,
} from '@src/api/contracts/checkout';

import type {
  Order,
} from '@src/api/contracts/orders';

export const checkoutApi = {
  submit(
    body: CheckoutRequest,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<Order>>({
      method: 'POST',
      url: '/orders',
      data: body,
      signal,
    });
  },
};