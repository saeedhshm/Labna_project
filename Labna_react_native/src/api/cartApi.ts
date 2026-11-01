import { request } from '@src/core/api/apiClient';
import type { ApiResponse } from '@src/api/contracts/common';

import type {
  CartValidationRequest,
  CartValidationResponse,
} from '@src/api/contracts/cart';

export const cartApi = {
  validate(
    body: CartValidationRequest,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<CartValidationResponse>>({
      method: 'POST',
      url: '/cart/validate',
      data: body,
      signal,
    });
  },
};