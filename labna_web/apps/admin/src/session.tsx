import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, logout as apiLogout, restoreSession } from './api/queries';

type SessionState = 'checking' | 'authenticated' | 'anonymous';

interface SessionValue {
  state: SessionState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * A page load exchanges the HttpOnly refresh cookie for an in-memory access
 * token, so a manager stays signed in across reloads without any token in
 * localStorage. The client dispatches `labna:unauthorized` when a 401 cannot be
 * recovered, which returns the app to the login screen.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>('checking');
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void (async () => {
      const ok = await restoreSession();
      if (active) setState(ok ? 'authenticated' : 'anonymous');
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      setState('anonymous');
    };
    window.addEventListener('labna:unauthorized', onUnauthorized);
    return () => window.removeEventListener('labna:unauthorized', onUnauthorized);
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    queryClient.clear();
    setState('authenticated');
  }, [queryClient]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      queryClient.clear();
      setState('anonymous');
    }
  }, [queryClient]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
