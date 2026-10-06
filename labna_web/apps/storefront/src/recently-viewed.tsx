import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Browsing history is personal to the device, so it stays in local storage
 * rather than the account: only product ids are kept, and the catalog remains
 * the source of the name, price and availability shown on screen. */
const storageKey = 'labna.recentlyViewed.v1';
const maxEntries = 12;

type RecentlyViewedState = {
  productIDs: string[];
  record: (productID: string) => void;
  clear: () => void;
};

const RecentlyViewedContext = createContext<RecentlyViewedState | null>(null);

function readEntries(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [productIDs, setProductIDs] = useState<string[]>(readEntries);

  // Stable identities, so an effect that records a visit does not re-run every
  // time the list changes.
  const record = useCallback((productID: string) => {
    setProductIDs((current) => {
      // Most recent first, no duplicates, bounded length.
      const next = [productID, ...current.filter((id) => id !== productID)].slice(0, maxEntries);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
    setProductIDs([]);
  }, []);

  const value = useMemo<RecentlyViewedState>(() => ({ productIDs, record, clear }), [productIDs, record, clear]);

  return <RecentlyViewedContext.Provider value={value}>{children}</RecentlyViewedContext.Provider>;
}

export function useRecentlyViewed() {
  const context = useContext(RecentlyViewedContext);
  if (!context) throw new Error('useRecentlyViewed must be used inside RecentlyViewedProvider');
  return context;
}
