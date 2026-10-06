import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/error-boundary';
import { OfflineBanner } from '../src/offline';
import { LanguageProvider } from '../src/i18n';

function Boom(): never {
  throw new Error('render failure');
}

function renderOfflineBanner() {
  localStorage.setItem('labna.locale', 'en');
  return render(
    <LanguageProvider>
      <OfflineBanner />
    </LanguageProvider>,
  );
}

const originalOnLine = navigator.onLine;
beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  localStorage.clear();
});

describe('ErrorBoundary', () => {
  it('shows a recoverable message instead of a blank screen', () => {
    // The expected failure is what this test is about.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders its children while nothing has failed', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('OfflineBanner', () => {
  it('stays hidden while the connection is up', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    renderOfflineBanner();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('warns that orders cannot be placed while offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderOfflineBanner();
    expect(screen.getByRole('status')).toHaveTextContent(/You are offline/);
    expect(screen.getByRole('status')).toHaveTextContent(/orders cannot be placed/i);
  });

  it('clears the warning once the connection returns', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderOfflineBanner();
    expect(screen.getByRole('status')).toBeInTheDocument();

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    fireEvent(window, new Event('online'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
