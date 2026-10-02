/**
 * Minimal typed client for the Labna API.
 *
 * The access token is kept in memory only and never written to localStorage, so
 * an XSS payload cannot read it from storage. Durability comes from the HttpOnly
 * refresh cookie, which this client re-exchanges once per page load and again
 * after a 401.
 */
import type { ZodType } from 'zod';

const base = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;

async function parse(response: Response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'استجابة غير مفهومة من الخادم');
  }
}

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${base}/staff/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const body = (await parse(response)) as { data: { accessToken: string } };
      accessToken = body.data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal; headers?: HeadersInit };

/** Performs a request, transparently refreshing the session once on 401. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const supplied = new Headers(options.headers);
    supplied.delete('authorization');
    supplied.delete('accept');
    supplied.delete('content-type');
    const headers: Record<string, string> = {};
    supplied.forEach((value, key) => { headers[key] = value; });
    headers.Accept = 'application/json';
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    // Authentication is owned by the client and cannot be replaced by callers.
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  };

  let response = await send();
  const isLogin = path === '/staff/auth/login';
  if (response.status === 401 && !isLogin && await refreshSession()) response = await send();

  if (response.ok) return (await parse(response)) as T;

  // The session cannot be recovered: let the app return to the login screen
  // instead of leaving every query in a permanent error state.
  if (response.status === 401 && !isLogin) {
    accessToken = null;
    window.dispatchEvent(new CustomEvent('labna:unauthorized'));
  }

  const payload = (await parse(response).catch(() => undefined)) as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | undefined;
  throw new ApiError(
    response.status,
    payload?.error?.code ?? 'UNKNOWN_ERROR',
    payload?.error?.message ?? 'تعذر الاتصال بالخادم',
    payload?.error?.details,
  );
}

type Envelope<T> = { data: T; meta: { requestID: string; nextCursor?: string | null; branchID?: string } };

export const getPage = async <T>(path: string, signal?: AbortSignal) => {
  const body = await request<Envelope<T[]>>(path, signal ? { signal } : {});
  return { items: body.data, nextCursor: body.meta.nextCursor ?? null };
};

export const getOne = async <T>(path: string) => (await request<Envelope<T>>(path)).data;

/** Parses a response against the shared schema so the UI cannot drift from the API. */
export const getValidated = async <T>(path: string, schema: ZodType<T>) => schema.parse(await getOne(path));

/** Formats Zod issues into field -> first message for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
  if (!issues) return {};
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
