import type { CartValidationRequest, CartValidationResponse, CheckoutRequest, OrderDTO } from '@labna/contracts';
import type { Detail, Locale, Page, ProductFilters, PublicBanner, PublicBranch, PublicCategory, PublicProduct } from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** Mirrors the admin client: status plus the API error code, so screens can
 * distinguish a missing resource from a transient failure. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    signal,
    headers: { accept: 'application/json', ...init.headers },
    credentials: 'include',
  });

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.message) message = body.error.message;
      if (body.error?.code) code = body.error.code;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

function query(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const api = {
  categories: (signal?: AbortSignal) => request<Page<PublicCategory>>('/categories?limit=100', signal),
  banners: (signal?: AbortSignal) => request<Page<PublicBanner>>('/banners?limit=20', signal),
  branches: (signal?: AbortSignal) => request<Page<PublicBranch>>('/branches?limit=20', signal),
  branch: (id: string, signal?: AbortSignal) => request<Detail<PublicBranch>>(`/branches/${encodeURIComponent(id)}`, signal),
  products: (filters: ProductFilters, signal?: AbortSignal) => request<Page<PublicProduct>>(`/products${query(filters)}`, signal),
  product: (id: string, locale: Locale, signal?: AbortSignal) => request<Detail<PublicProduct>>(`/products/${encodeURIComponent(id)}${query({ locale })}`, signal),
  validateCart: (body: CartValidationRequest, signal?: AbortSignal) => request<{ data: CartValidationResponse }>('/cart/validate', signal, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  createOrder: (body: CheckoutRequest, signal?: AbortSignal) => request<{ data: OrderDTO }>('/orders', signal, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  order: (id: string, signal?: AbortSignal) => request<{ data: OrderDTO }>(`/orders/${encodeURIComponent(id)}`, signal),
};
