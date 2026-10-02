import type { Detail, Page, ProductFilters, PublicBanner, PublicBranch, PublicCategory, PublicProduct } from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    signal,
    headers: { accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, message);
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
  product: (id: string, signal?: AbortSignal) => request<Detail<PublicProduct>>(`/products/${encodeURIComponent(id)}`, signal),
};
