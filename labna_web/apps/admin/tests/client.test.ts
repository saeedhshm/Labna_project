import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAccessToken, getOne, getPage, request, setAccessToken } from '../src/api/client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const envelope = (data: unknown) => ({ data, meta: { requestID: 'req_1' } });

describe('api client', () => {
  beforeEach(() => setAccessToken(null));

  it('sends the in-memory bearer token and unwraps the envelope', async () => {
    setAccessToken('token-1');
    const fetchMock = vi.fn().mockResolvedValue(json(envelope({ id: 'milk' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOne('/admin/categories/milk')).resolves.toEqual({ id: 'milk' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/admin/categories/milk');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(init.credentials).toBe('include');
  });

  it('sends no Authorization header before a session exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(envelope({ id: 'milk' })));
    vi.stubGlobal('fetch', fetchMock);
    await getOne('/admin/categories/milk');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('merges custom headers without allowing callers to replace authentication', async () => {
    setAccessToken('real-token');
    const fetchMock = vi.fn().mockResolvedValue(json(envelope({ id: 'inventory' })));
    vi.stubGlobal('fetch', fetchMock);

    await request('/admin/inventory/adjustments', {
      method: 'POST',
      body: { onHandDelta: 1 },
      headers: { 'Idempotency-Key': 'key-1', Authorization: 'Bearer injected', 'Content-Type': 'text/plain' },
    });

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Idempotency-Key')).toBe('key-1');
    expect(headers.get('Authorization')).toBe('Bearer real-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('never stores the access token in localStorage', async () => {
    setAccessToken('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(envelope({ id: 'milk' }))));
    await getOne('/admin/categories/milk');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('exchanges the refresh cookie once after a 401 and replays the request', async () => {
    setAccessToken('stale');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401))
      .mockResolvedValueOnce(json(envelope({ accessToken: 'fresh' })))
      .mockResolvedValueOnce(json(envelope({ id: 'milk' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOne('/admin/categories/milk')).resolves.toEqual({ id: 'milk' });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/v1/admin/categories/milk',
      '/api/v1/staff/auth/refresh',
      '/api/v1/admin/categories/milk',
    ]);
    // The replay must carry the refreshed token, not the stale one.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('sends a single refresh when two requests fail at the same time', async () => {
    setAccessToken('stale');
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/staff/auth/refresh') {
        refreshes += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return json(envelope({ accessToken: 'fresh' }));
      }
      if (fetchMock.mock.calls.filter(call => call[0] === url).length === 1) {
        return json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401);
      }
      return json(envelope('ok'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([getOne('/admin/categories/a'), getOne('/admin/categories/b')]);
    expect(refreshes).toBe(1);
  });

  it('reports a structured ApiError and returns the session when the refresh fails', async () => {
    setAccessToken('stale');
    const unauthorized = vi.fn();
    window.addEventListener('labna:unauthorized', unauthorized);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'VERSION_CONFLICT', message: 'Refresh and retry' } }, 409));
    vi.stubGlobal('fetch', fetchMock);

    const failure = await request('/admin/categories/milk', { method: 'PATCH', body: { version: 0 } }).catch(error => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    // A 409 is a real answer, not an expired session: no refresh, no login redirect.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener('labna:unauthorized', unauthorized);
  });

  it('clears an expired session and emits one logout event if refresh fails', async () => {
    setAccessToken('stale');
    const unauthorized = vi.fn();
    window.addEventListener('labna:unauthorized', unauthorized);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getOne('/admin/categories')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener('labna:unauthorized', unauthorized);
  });

  it('does not retry a login attempt with a refresh cookie after invalid credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/staff/auth/login', { method: 'POST', body: { email: 'wrong@example.com', password: 'wrong' } })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes a missing error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(getOne('/admin/settings')).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', message: 'تعذر الاتصال بالخادم' });
  });

  it('exposes the next cursor from a paged list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: ['a'], meta: { requestID: 'req_1', nextCursor: 'abc' } })));
    await expect(getPage('/admin/products')).resolves.toEqual({ items: ['a'], nextCursor: 'abc' });
  });

  it('passes the abort signal so a cancelled query stops work', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [], meta: { requestID: 'r', nextCursor: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await getPage('/admin/products', controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
