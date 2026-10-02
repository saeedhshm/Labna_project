import type { CartValidationRequest, CartValidationResponse, CheckoutRequest, CustomerAddressDTO, CustomerAddressInput, CustomerDTO, CustomerLoginBody, CustomerRegisterBody, OrderDTO } from '@labna/contracts';
import type { Detail, Page, ProductFilters, PublicBanner, PublicBranch, PublicCategory, PublicProduct } from './types';

const apiBase = '/api/v1';
let customerAccessToken: string | null = null;
export const setCustomerAccessToken = (token: string | null) => { customerAccessToken = token; };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, signal?: AbortSignal, init: RequestInit = {}) {
  const headers = { accept: 'application/json', ...(customerAccessToken ? { authorization: `Bearer ${customerAccessToken}` } : {}), ...init.headers };
  const response = await fetch(`${apiBase}${path}`, { signal, credentials: 'include', ...init, headers });
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
  createOrder: (body: CheckoutRequest, signal?: AbortSignal) => request<{ data: OrderDTO }>('/orders', signal, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  order: (id: string, signal?: AbortSignal) => request<{ data: OrderDTO }>(`/orders/${encodeURIComponent(id)}`, signal),
  customerRegister: (body: CustomerRegisterBody) => request<{ data: { accessToken: string } }>('/customer/auth/register', undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  customerLogin: (body: CustomerLoginBody) => request<{ data: { accessToken: string } }>('/customer/auth/login', undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  customerRefresh: () => request<{ data: { accessToken: string } }>('/customer/auth/refresh', undefined, { method: 'POST' }),
  customerLogout: () => request('/customer/auth/logout', undefined, { method: 'POST' }),
  customerMe: (signal?: AbortSignal) => request<{ data: CustomerDTO }>('/customer/me', signal),
  customerAddresses: (signal?: AbortSignal) => request<{ data: CustomerAddressDTO[] }>('/customer/addresses', signal),
  addCustomerAddress: (body: CustomerAddressInput) => request<{ data: CustomerAddressDTO }>('/customer/addresses', undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  updateCustomerAddress: (id: string, body: Partial<CustomerAddressInput>) => request<{ data: CustomerAddressDTO }>(`/customer/addresses/${encodeURIComponent(id)}`, undefined, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  deleteCustomerAddress: (id: string) => request(`/customer/addresses/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' }),
  customerOrders: (signal?: AbortSignal) => request<{ data: OrderDTO[]; meta: { nextCursor: string | null } }>('/customer/orders?limit=50', signal),
};
