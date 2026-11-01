import { request } from '@src/core/api/apiClient';
import type { ApiResponse } from '@src/api/contracts/common';

import type {
  Order,
  OrdersPageResponse,
} from '@src/api/contracts/orders';

export type OrdersQuery = {
  cursor?: string;
  limit?: number;
};

export const ordersApi = {
  track(
    idOrOrderNumber: string,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<Order>>({
      method: 'GET',
      url: `/orders/${encodeURIComponent(
        idOrOrderNumber,
      )}`,
      signal,
    });
  },

  getMyOrders(
    query: OrdersQuery = {},
    signal?: AbortSignal,
  ) {
    return request<OrdersPageResponse>({
      method: 'GET',
      url: '/customer/orders',
      params: {
        limit: query.limit ?? 20,
        cursor: query.cursor,
      },
      signal,
    });
  },

  getMyOrder(
    idOrOrderNumber: string,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<Order>>({
      method: 'GET',
      url: `/customer/orders/${encodeURIComponent(
        idOrOrderNumber,
      )}`,
      signal,
    });
  },

  cancelMyOrder(
    idOrOrderNumber: string,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<Order>>({
      method: 'PATCH',
      url: `/customer/orders/${encodeURIComponent(
        idOrOrderNumber,
      )}/cancel`,
      signal,
    });
  },
};