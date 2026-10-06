import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '../src/i18n';
import { BranchesPage } from '../src/pages/BranchesPage';

const makeBranch = (overrides: Record<string, unknown> = {}) => ({
  id: 'demo-cairo',
  name: { ar: 'فرع القاهرة', en: 'Cairo branch' },
  address: { ar: 'وسط القاهرة', en: 'Downtown Cairo' },
  coordinate: { latitude: 30.0444, longitude: 31.2357 },
  phoneNumber: '+201012345678',
  timeZoneIdentifier: 'Africa/Cairo',
  openingHours: [
    { weekday: 1, opensAt: '09:00', closesAt: '22:00' },
    { weekday: 2, opensAt: '09:00', closesAt: '22:00' },
    { weekday: 5, opensAt: '13:00', closesAt: '22:00' },
  ],
  pickupEnabled: true,
  acceptsOrders: true,
  isDemo: true,
  isOpen: true,
  nextOpensAt: null,
  ...overrides,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? body : { data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubBranches(handler: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/branches')) return handler();
      return jsonResponse([], 200);
    }),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
  render(<BranchesPage />, { wrapper });
}

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

describe('BranchesPage', () => {
  it('renders name, address, status, schedule, phone and directions from the API', async () => {
    stubBranches(() => jsonResponse([makeBranch()]));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cairo branch' })).toBeInTheDocument();
    expect(screen.getByText('Downtown Cairo')).toBeInTheDocument();
    expect(screen.getByText('Open now')).toBeInTheDocument();

    // Weekly schedule, grouped and labelled as regular hours.
    expect(screen.getByText('Regular weekly hours')).toBeInTheDocument();
    expect(screen.getByText('Mon – Tue')).toBeInTheDocument();
    expect(screen.getByText('09:00 – 22:00')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('13:00 – 22:00')).toBeInTheDocument();
    // Wednesday/Thursday and the weekend have no intervals and read as closed.
    expect(screen.getByText('Wed – Thu')).toBeInTheDocument();
    expect(screen.getByText('Sat – Sun')).toBeInTheDocument();
    expect(screen.getAllByText('Closed')).toHaveLength(2);

    const call = screen.getByRole('link', { name: 'Call Cairo branch' });
    expect(call).toHaveAttribute('href', 'tel:+201012345678');
    const directions = screen.getByRole('link', { name: 'Get directions' });
    expect(directions).toHaveAttribute('href', expect.stringContaining('30.0444'));
    expect(directions).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders several branches the API returns', async () => {
    stubBranches(() => jsonResponse([makeBranch(), makeBranch({ id: 'demo-alexandria', name: { ar: 'إسكندرية', en: 'Alexandria branch' } })]));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cairo branch' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alexandria branch' })).toBeInTheDocument();
  });

  it('shows the closed state with the next opening when the API reports it', async () => {
    stubBranches(() => jsonResponse([makeBranch({ isOpen: false, nextOpensAt: '2026-10-05T06:00:00.000Z' })]));
    renderPage();

    expect(await screen.findByText('Closed now')).toBeInTheDocument();
    expect(screen.getByText(/Opens/)).toBeInTheDocument();
    expect(screen.queryByText('Open now')).not.toBeInTheDocument();
  });

  it('omits the call action and directions when optional data is missing', async () => {
    stubBranches(() => jsonResponse([makeBranch({ phoneNumber: null, coordinate: { latitude: Number.NaN, longitude: 10 } })]));
    renderPage();

    await screen.findByRole('heading', { name: 'Cairo branch' });
    expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get directions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coordinates')).not.toBeInTheDocument();
  });

  it('states that hours are unpublished instead of guessing', async () => {
    stubBranches(() => jsonResponse([makeBranch({ isOpen: false, openingHours: [] })]));
    renderPage();

    await screen.findByRole('heading', { name: 'Cairo branch' });
    expect(screen.getByText('Opening hours are not published for this branch.')).toBeInTheDocument();
    // The status line appends the missing-hours note after the closed label.
    expect(screen.getByText(/Hours not published/)).toBeInTheDocument();
  });

  it('shows a loading skeleton then the branches', async () => {
    stubBranches(() => jsonResponse([makeBranch()]));
    renderPage();
    expect(document.querySelector('.skeleton-card')).not.toBeNull();
    expect(await screen.findByRole('heading', { name: 'Cairo branch' })).toBeInTheDocument();
  });

  it('offers a working retry after an API error', async () => {
    let attempt = 0;
    stubBranches(() => {
      attempt += 1;
      return attempt === 1 ? jsonResponse({ error: { message: 'boom' } }, 500) : jsonResponse([makeBranch()]);
    });
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Cairo branch' })).toBeInTheDocument();
  });

  it('shows an empty state when the API returns no branches', async () => {
    stubBranches(() => jsonResponse([]));
    renderPage();

    expect(await screen.findByText('No branches available yet.')).toBeInTheDocument();
  });

  it('renders Arabic copy with RTL when the locale is Arabic', async () => {
    localStorage.setItem('labna.locale', 'ar');
    stubBranches(() => jsonResponse([makeBranch({ isOpen: false })]));
    renderPage();

    await screen.findByRole('heading', { name: 'فرع القاهرة' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText('مواعيد العمل الأسبوعية')).toBeInTheDocument();
    expect(screen.getByText('مغلق الآن')).toBeInTheDocument();
    // Arabic-Indic digits keep the unambiguous 24-hour form.
    expect(screen.getByText(/٠٩:٠٠ – ٢٢:٠٠/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الاتجاهات/ }).getAttribute('href')).toContain('30.0444');
  });
});
