import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerDTO, CustomerLoginBody, CustomerPasswordPatch, CustomerProfilePatch, CustomerRegisterBody } from '@labna/contracts';
import { api, ApiError } from './api';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';
type AuthState = {
  status: AuthStatus;
  customer: CustomerDTO | null;
  accessToken: string | null;
  login: (body: CustomerLoginBody) => Promise<CustomerDTO>;
  register: (body: CustomerRegisterBody) => Promise<CustomerDTO>;
  updateProfile: (body: CustomerProfilePatch) => Promise<CustomerDTO>;
  changePassword: (body: CustomerPasswordPatch) => Promise<void>;
  reloadCustomer: () => Promise<CustomerDTO>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
let refreshRequest: Promise<{ accessToken: string; customer: CustomerDTO } | null> | null = null;

function restoreCustomer() {
  refreshRequest ??= api.customerRefresh()
    .then(result => ({ accessToken: result.data.accessToken, customer: result.data.customer }))
    .catch(error => {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
      throw error;
    })
    .finally(() => { refreshRequest = null; });
  return refreshRequest;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    restoreCustomer()
      .then(result => {
        if (cancelled) return;
        setAccessToken(result?.accessToken ?? null);
        setCustomer(result?.customer ?? null);
        setStatus(result ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setAccessToken(null);
        setCustomer(null);
        setStatus('unauthenticated');
      });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthState>(() => ({
    status,
    customer,
    accessToken,
    login: async (body) => {
      const result = await api.customerLogin(body);
      setAccessToken(result.data.accessToken);
      setCustomer(result.data.customer);
      setStatus('authenticated');
      return result.data.customer;
    },
    register: async (body) => {
      const result = await api.customerRegister(body);
      setAccessToken(result.data.accessToken);
      setCustomer(result.data.customer);
      setStatus('authenticated');
      return result.data.customer;
    },
    updateProfile: async (body) => {
      if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required');
      const result = await api.customerUpdateProfile(accessToken, body);
      setCustomer(result.data);
      setStatus('authenticated');
      return result.data;
    },
    changePassword: async (body) => {
      if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required');
      await api.customerChangePassword(accessToken, body);
      setAccessToken(null);
      setCustomer(null);
      setStatus('unauthenticated');
    },
    reloadCustomer: async () => {
      if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED', 'Valid customer session required');
      const result = await api.customerMe(accessToken);
      setCustomer(result.data);
      setStatus('authenticated');
      return result.data;
    },
    logout: async () => {
      const token = accessToken;
      setAccessToken(null);
      setCustomer(null);
      setStatus('unauthenticated');
      if (token) {
        try { await api.customerLogout(token); } catch { /* Local logout still wins when the session already expired. */ }
      }
    },
  }), [accessToken, customer, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
