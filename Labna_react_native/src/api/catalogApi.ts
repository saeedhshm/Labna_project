import { request } from '@src/core/api/apiClient';

import type {
  Banner,
  Branch,
  Category,
  DetailResponse,
  PageResponse,
  Product,
  ProductDetailFilters,
  ProductFilters,
  StoreSettings,
} from '@src/api/contracts/catalog';

export const catalogApi = {
  getStore(signal?: AbortSignal) {
    return request<DetailResponse<StoreSettings>>({
      method: 'GET',
      url: '/store',
      signal,
    });
  },

  getCategories(
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return request<PageResponse<Category>>({
      method: 'GET',
      url: '/categories',
      params: {
        limit: 100,
        cursor,
      },
      signal,
    });
  },

  getBanners(
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return request<PageResponse<Banner>>({
      method: 'GET',
      url: '/banners',
      params: {
        limit: 20,
        cursor,
      },
      signal,
    });
  },

  getBranches(
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return request<PageResponse<Branch>>({
      method: 'GET',
      url: '/branches',
      params: {
        limit: 20,
        cursor,
      },
      signal,
    });
  },

  getBranch(
    branchID: string,
    signal?: AbortSignal,
  ) {
    return request<DetailResponse<Branch>>({
      method: 'GET',
      url: `/branches/${encodeURIComponent(branchID)}`,
      signal,
    });
  },

  getProducts(
    filters: ProductFilters,
    signal?: AbortSignal,
  ) {
    return request<PageResponse<Product>>({
      method: 'GET',
      url: '/products',
      params: filters,
      signal,
    });
  },

  getProduct(
    productID: string,
    filters: ProductDetailFilters,
    signal?: AbortSignal,
  ) {
    return request<DetailResponse<Product>>({
      method: 'GET',
      url: `/products/${encodeURIComponent(productID)}`,
      params: filters,
      signal,
    });
  },
};