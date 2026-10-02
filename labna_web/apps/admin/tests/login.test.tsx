import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { LoginPage } from '../src/pages/LoginPage';
import { SessionProvider, useSession } from '../src/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SessionProvider>
          <LoginPage />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('rejects wrong credentials with an Arabic message and does not navigate', async () => {
    // SessionProvider probes the refresh cookie on mount; deny it so the login form renders.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/staff/auth/refresh')) return json({ error: { code: 'UNAUTHORIZED', message: 'no session' } }, 401);
      return json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('البريد الإلكتروني'), 'manager@example.com');
    await user.type(screen.getByLabelText('كلمة المرور'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('البريد الإلكتروني أو كلمة المرور غير صحيحة.'));
  });

  it('asks for both email and password before submitting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)));
    renderLogin();
    await screen.findByLabelText('البريد الإلكتروني');
    expect(screen.getByLabelText('البريد الإلكتروني')).toBeRequired();
    expect(screen.getByLabelText('كلمة المرور')).toBeRequired();
  });

  it('restores a staff session only once under React StrictMode', async () => {
    function Probe() {
      const { state } = useSession();
      return <div>{state}</div>;
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const fetchMock = vi.fn(async () => json({ data: { accessToken: 'restored-token' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SessionProvider>
              <Probe />
            </SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(await screen.findByText('authenticated')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/staff/auth/refresh', { method: 'POST', credentials: 'include' });
  });
});
