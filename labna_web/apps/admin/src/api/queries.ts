import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getOne, getPage, request, setAccessToken } from './client';
import type {
  InventoryAdjustmentCommand,
  InventoryDTO,
  InventoryListQuery,
  InventoryMovementDTO,
  InventoryMovementQuery,
  InventoryThresholdPatch,
  AdminOrderQuery,
  DashboardMetrics,
  OrderDTO,
  OrderStatus,
  Resource,
  StoreSettings,
} from '@labna/contracts';

export const keys = {
  resource: (resource: Resource, cursor?: string) => ['admin', resource, cursor ?? 'first'] as const,
  detail: (resource: Resource, id: string) => ['admin', resource, id] as const,
  settings: () => ['admin', 'settings'] as const,
  products: (branchID: string | undefined, search: string) => ['admin', 'products', branchID ?? 'all', search] as const,
  inventory: (filters: InventoryFilters) => ['admin', 'inventory', filters] as const,
  inventoryMovements: (filters: MovementFilters) => ['admin', 'inventory', 'movements', filters] as const,
};

export type Page<T> = { items: T[]; nextCursor: string | null };
export type InventoryFilters = Pick<InventoryListQuery, 'branchID' | 'variantID' | 'lowStock' | 'outOfStock'>;
export type MovementFilters = Pick<InventoryMovementQuery, 'inventoryID' | 'from' | 'to'>;
export type OrderFilters = Pick<AdminOrderQuery, 'q' | 'status' | 'from' | 'to'>;

const queryString = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
};

/** Admin list. Archived records are hidden by the API, so no client filter is needed. */
export function useResourcePage<T>(resource: Resource, cursor?: string) {
  return useQuery({
    queryKey: keys.resource(resource, cursor),
    queryFn: ({ signal }) => getPage<T>(`/admin/${resource}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, signal),
    staleTime: 15_000,
  });
}

/**
 * Cursor pagination for admin tables. The API caps the offset at 10,000 and
 * returns an opaque signed cursor, so a manager can walk the whole collection
 * without deep-linking to an offset that may have shifted.
 */
export function useResourceList<T>(resource: Resource, pageSize = 25) {
  return useInfiniteQuery({
    queryKey: ['admin', resource, 'list', pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPage<T>(`/admin/${resource}?limit=${pageSize}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}

export function useResource<T>(resource: Resource, id: string) {
  return useQuery({
    queryKey: keys.detail(resource, id),
    queryFn: () => getOne<T>(`/admin/${resource}/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: keys.settings(),
    queryFn: () => getOne<StoreSettings>('/admin/settings'),
    staleTime: 30_000,
  });
}

export function useInventoryList(filters: InventoryFilters, pageSize = 25) {
  return useInfiniteQuery({
    queryKey: keys.inventory(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPage<InventoryDTO>(`/admin/inventory?${queryString({ ...filters, limit: pageSize, cursor: pageParam })}`, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}

export function useInventoryMovements(filters: MovementFilters, pageSize = 20) {
  return useInfiniteQuery({
    queryKey: keys.inventoryMovements(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPage<InventoryMovementDTO>(`/admin/inventory/movements?${queryString({ ...filters, limit: pageSize, cursor: pageParam })}`, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}

export function useOrdersList(filters: OrderFilters, pageSize = 25) {
  return useInfiniteQuery({
    queryKey: ['admin', 'orders', filters, pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPage<OrderDTO>(`/admin/orders?${queryString({ ...filters, limit: pageSize, cursor: pageParam })}`, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'orders', id],
    queryFn: () => getOne<OrderDTO>(`/admin/orders/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
  });
}

export function useOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => request(`/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}

export function useDashboardMetrics(filters: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['admin', 'dashboard', filters],
    queryFn: () => getOne<DashboardMetrics>(`/admin/dashboard?${queryString(filters)}`),
    staleTime: 30_000,
  });
}

export function useInventoryAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InventoryAdjustmentCommand) => request('/admin/inventory/adjustments', {
      method: 'POST',
      body: payload,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] }),
  });
}

export function useInventoryThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InventoryThresholdPatch }) =>
      request(`/admin/inventory/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] }),
  });
}

export type MutationInput = { id: string; version?: number; payload: Record<string, unknown> };

/**
 * Create, update and archive share one mutation so the query cache is invalidated
 * the same way, and a 409 version conflict surfaces without an automatic retry:
 * silently re-submitting could overwrite a colleague's change.
 */
export function useResourceMutation(resource: Resource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, version, payload }: MutationInput) => {
      if (version === undefined) return request(`/admin/${resource}`, { method: 'POST', body: payload });
      return request(`/admin/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...payload, version } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useArchiveMutation(resource: Resource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      request(`/admin/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE', body: { version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { version: number; defaultPickupBranchID: string }) =>
      request('/admin/settings', { method: 'PATCH', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.settings() }),
  });
}

export async function login(email: string, password: string) {
  const body = await request<{ data: { accessToken: string } }>('/staff/auth/login', { method: 'POST', body: { email, password } });
  setAccessToken(body.data.accessToken);
}

export async function logout() {
  try {
    await request('/staff/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

let restoreSessionRequest: Promise<boolean> | null = null;

/** Used once at startup to turn the HttpOnly refresh cookie into an access token. */
export async function restoreSession() {
  restoreSessionRequest ??= (async () => {
    try {
      const response = await fetch('/api/v1/staff/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!response.ok) return false;
      const body = (await response.json()) as { data: { accessToken: string } };
      if (!body.data?.accessToken) return false;
      setAccessToken(body.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      restoreSessionRequest = null;
    }
  })();
  return restoreSessionRequest;
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;
