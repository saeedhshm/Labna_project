import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { useAuth } from './auth';

/** Guests keep favorites locally so the button works before signing in. The
 * list is merged into the account the first time the customer authenticates,
 * then the local copy is cleared so the server stays the single source. */
const storageKey = 'labna.favorites.v1';
const maxGuestFavorites = 200;

type FavoritesState = {
  productIDs: string[];
  isFavorite: (productID: string) => boolean;
  toggle: (productID: string) => Promise<void>;
  pending: boolean;
  error: string | null;
};

const FavoritesContext = createContext<FavoritesState | null>(null);

function readGuestFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function writeGuestFavorites(productIDs: string[]) {
  localStorage.setItem(storageKey, JSON.stringify(productIDs.slice(0, maxGuestFavorites)));
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status, accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [guestProductIDs, setGuestProductIDs] = useState<string[]>(readGuestFavorites);
  const [guestError, setGuestError] = useState<string | null>(null);
  const authenticated = status === 'authenticated' && accessToken !== null;

  const favorites = useQuery({
    queryKey: ['customer', 'favorites'],
    queryFn: ({ signal }) => api.customerFavorites(accessToken as string, signal),
    enabled: authenticated,
    staleTime: 60_000,
  });

  // Merge the guest list into the account once per session, then drop the local
  // copy. Failures keep the local list so nothing is silently lost.
  useEffect(() => {
    if (!authenticated || !accessToken || guestProductIDs.length === 0) return;
    const pending = guestProductIDs.map((productID) =>
      api.customerAddFavorite(accessToken, productID).catch((error) => {
        // A product that is no longer published can never be saved; drop it.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }),
    );
    let cancelled = false;
    Promise.all(pending)
      .then(() => {
        if (cancelled) return;
        writeGuestFavorites([]);
        setGuestProductIDs([]);
        setGuestError(null);
        queryClient.invalidateQueries({ queryKey: ['customer', 'favorites'] });
      })
      .catch(() => {
        if (cancelled) return;
        setGuestError('favorites_merge_failed');
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, accessToken, guestProductIDs, queryClient]);

  const productIDs = useMemo(() => {
    if (authenticated) return (favorites.data?.data.favorites ?? []).map((item) => item.productID);
    return guestProductIDs;
  }, [authenticated, favorites.data, guestProductIDs]);

  const setGuestProductIDsAndStore = useCallback((next: string[]) => {
    setGuestProductIDs(next);
    writeGuestFavorites(next);
  }, []);

  const toggle = useCallback(
    async (productID: string) => {
      const saved = productIDs.includes(productID);
      if (!authenticated || !accessToken) {
        setGuestProductIDsAndStore(saved ? productIDs.filter((id) => id !== productID) : [productID, ...productIDs]);
        return;
      }
      // Optimistic, then reconciled by the server response.
      queryClient.setQueryData(['customer', 'favorites'], (current: { data: { favorites: { productID: string; createdAt: string }[] } } | undefined) => ({
        data: {
          favorites: saved ? (current?.data.favorites ?? []).filter((item) => item.productID !== productID) : [{ productID, createdAt: new Date().toISOString() }, ...(current?.data.favorites ?? [])],
        },
      }));
      try {
        if (saved) await api.customerRemoveFavorite(accessToken, productID);
        else await api.customerAddFavorite(accessToken, productID);
        setGuestError(null);
      } catch (error) {
        queryClient.invalidateQueries({ queryKey: ['customer', 'favorites'] });
        if (error instanceof ApiError && error.status === 404) return;
        setGuestError('favorites_update_failed');
      }
    },
    [authenticated, accessToken, productIDs, queryClient, setGuestProductIDsAndStore],
  );

  const value = useMemo<FavoritesState>(
    () => ({
      productIDs,
      isFavorite: (productID) => productIDs.includes(productID),
      toggle,
      pending: favorites.isFetching,
      error: guestError,
    }),
    [productIDs, toggle, favorites.isFetching, guestError],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside FavoritesProvider');
  return context;
}
