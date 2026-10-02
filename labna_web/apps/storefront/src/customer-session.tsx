import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerDTO, CustomerLoginBody, CustomerRegisterBody } from '@labna/contracts';
import { api, setCustomerAccessToken } from './api';

type State = 'checking' | 'anonymous' | 'authenticated';
type CustomerSession = {
  state: State;
  customer: CustomerDTO | null;
  signIn: (input: CustomerLoginBody) => Promise<void>;
  register: (input: CustomerRegisterBody) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};

const Context = createContext<CustomerSession | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);

  async function loadCustomer() {
    const me = await api.customerMe();
    setCustomer(me.data);
    setState('authenticated');
  }

  async function restore() {
    try {
      const refreshed = await api.customerRefresh();
      setCustomerAccessToken(refreshed.data.accessToken);
      await loadCustomer();
    } catch {
      setCustomerAccessToken(null);
      setCustomer(null);
      setState('anonymous');
    }
  }

  useEffect(() => { void restore(); }, []);

  const value = useMemo<CustomerSession>(() => ({
    state,
    customer,
    signIn: async input => {
      const result = await api.customerLogin(input);
      setCustomerAccessToken(result.data.accessToken);
      await loadCustomer();
    },
    register: async input => {
      const result = await api.customerRegister(input);
      setCustomerAccessToken(result.data.accessToken);
      await loadCustomer();
    },
    signOut: async () => {
      try { await api.customerLogout(); } finally {
        setCustomerAccessToken(null);
        setCustomer(null);
        setState('anonymous');
      }
    },
    reload: loadCustomer,
  }), [customer, state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomerSession() {
  const context = useContext(Context);
  if (!context) throw new Error('useCustomerSession must be used inside CustomerSessionProvider');
  return context;
}
