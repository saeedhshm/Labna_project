import type { CartValidationRequest, CartValidationResponse } from '@labna/contracts';
import type { Detail, Page, ProductFilters, PublicBanner, PublicBranch, PublicCategory, PublicProduct } from './types';

const apiBase = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, signal?: AbortSignal, init: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, { signal, ...init, headers: { accept: 'application/json', ...init.headers } });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) throw new ApiError(response.status, (body as { error?: { message?: string } } | null)?.error?.message ?? 'Request failed');
  return body as T;
}

function query(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const api = {
  categories: (signal?: AbortSignal) => request<Page<PublicCategory>>('/categories?limit=100', signal),
  banners: (signal?: AbortSignal) => request<Page<PublicBanner>>('/banners?limit=20', signal),
  branches: (signal?: AbortSignal) => request<Page<PublicBranch>>('/branches?limit=20', signal),
  products: (filters: ProductFilters, signal?: AbortSignal) => request<Page<PublicProduct>>(`/products${query(filters)}`, signal),
  product: (id: string, signal?: AbortSignal) => request<Detail<PublicProduct>>(`/products/${encodeURIComponent(id)}`, signal),
  validateCart: (body: CartValidationRequest, signal?: AbortSignal) => request<{ data: CartValidationResponse }>('/cart/validate', signal, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
};
