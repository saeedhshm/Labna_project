import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { authApi } from '@src/api/authApi';
import type {
  AuthResponse,
  Customer,
  LoginRequest,
  RegisterRequest,
} from '@src/api/contracts/auth';
import { ApiError } from '@src/core/api/ApiError';
import {
  clearAccessToken,
  setAccessToken,
} from '@src/core/api/accessToken';
import {
  getAuthToken,
  removeAuthToken,
  saveAuthToken,
} from '@src/core/storage/authTokenStorage';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

type AuthContextValue = {
  status: AuthStatus;
  customer: Customer | null;
  sessionError: ApiError | null;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function sessionRestoreError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(
    0,
    'SESSION_RESTORE_FAILED',
    'Unable to restore the saved session',
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sessionError, setSessionError] = useState<ApiError | null>(null);

  const clearLocalSession = useCallback(async () => {
    clearAccessToken();

    try {
      await removeAuthToken();
    } finally {
      setCustomer(null);
      setSessionError(null);
      setStatus('unauthenticated');
    }
  }, []);

  const applySession = useCallback(async (session: AuthResponse) => {
    await saveAuthToken(session.accessToken);
    setAccessToken(session.accessToken);
    setCustomer(session.customer);
    setSessionError(null);
    setStatus('authenticated');
  }, []);

  const restoreSession = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    setSessionError(null);

    try {
      const savedToken = await getAuthToken();

      if (signal?.aborted) {
        return;
      }

      if (!savedToken) {
        clearAccessToken();
        setCustomer(null);
        setStatus('unauthenticated');
        return;
      }

      setAccessToken(savedToken);
      const response = await authApi.getCurrentCustomer(signal);

      if (signal?.aborted) {
        return;
      }

      setCustomer(response.data);
      setStatus('authenticated');
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        await clearLocalSession();
        return;
      }

      setCustomer(null);
      setSessionError(sessionRestoreError(error));
      setStatus('error');
    }
  }, [clearLocalSession]);

  useEffect(() => {
    const controller = new AbortController();
    restoreSession(controller.signal).catch(error => {
      if (controller.signal.aborted) {
        return;
      }

      setCustomer(null);
      setSessionError(sessionRestoreError(error));
      setStatus('error');
    });

    return () => controller.abort();
  }, [restoreSession]);

  const login = useCallback(async (input: LoginRequest) => {
    const response = await authApi.login({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });

    await applySession(response.data);
  }, [applySession]);

  const register = useCallback(async (input: RegisterRequest) => {
    const response = await authApi.register({
      name: input.name.trim(),
      phoneNumber: input.phoneNumber.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });

    await applySession(response.data);
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Local logout must still succeed if the server is unavailable or the
      // short-lived access token has already expired.
    } finally {
      await clearLocalSession();
    }
  }, [clearLocalSession]);

  const retrySession = useCallback(() => restoreSession(), [restoreSession]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    customer,
    sessionError,
    login,
    register,
    logout,
    retrySession,
  }), [
    status,
    customer,
    sessionError,
    login,
    register,
    logout,
    retrySession,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
