import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/auth';
import { FavoritesProvider } from '../src/favorites';
import { LanguageProvider } from '../src/i18n';

/** Answers the silent session-restore call the auth provider makes on mount, so
 * tests that are not about authentication start as a signed-out guest. */
export function stubSessionRefresh() {
  const existing = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/customer/auth/refresh')) {
      return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'No session' } }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    return (existing as typeof fetch)(input, init);
  }) as typeof fetch;
}

export function createTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/** Auth plus favorites, so components that render a favourite toggle resolve
 * the same providers they use in the running app. */
export function AccountProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <AuthProvider>
          <FavoritesProvider>{children}</FavoritesProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
