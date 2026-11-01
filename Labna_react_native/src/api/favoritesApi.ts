import { request } from '@src/core/api/apiClient';
import type { ApiResponse } from '@src/api/contracts/common';

import type {
  AddFavoriteRequest,
  Favorite,
  FavoritesResponse,
  RemoveFavoriteResponse,
} from '@src/api/contracts/favorites';

export const favoritesApi = {
  getAll(signal?: AbortSignal) {
    return request<ApiResponse<FavoritesResponse>>({
      method: 'GET',
      url: '/customer/favorites',
      signal,
    });
  },

  add(
    body: AddFavoriteRequest,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<Favorite>>({
      method: 'POST',
      url: '/customer/favorites',
      data: body,
      signal,
    });
  },

  remove(
    productID: string,
    signal?: AbortSignal,
  ) {
    return request<
      ApiResponse<RemoveFavoriteResponse>
    >({
      method: 'DELETE',
      url: `/customer/favorites/${encodeURIComponent(
        productID,
      )}`,
      signal,
    });
  },
};