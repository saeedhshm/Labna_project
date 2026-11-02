import AsyncStorage from '@react-native-async-storage/async-storage';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useTranslation,
} from 'react-i18next';

import {
  catalogApi,
} from '@src/api/catalogApi';

import type {
  Banner,
  Branch,
  Category,
  Locale,
  PageResponse,
  Product,
} from '@src/api/contracts/catalog';

const CATALOG_CACHE_KEY =
  'labna.catalog.snapshot.v1';

type CatalogCache = {
  version: 1;
  savedAt: string;
  snapshot: CatalogSnapshot;
};

export type CatalogSnapshot = {
  products: Product[];
  categories: Category[];
  banners: Banner[];
  branches: Branch[];
};

type CatalogContextValue = {
  snapshot: CatalogSnapshot | null;

  isInitialLoading: boolean;
  isRefreshing: boolean;

  error: string | null;
  refreshError: string | null;

  reload: () => Promise<void>;
};

const CatalogContext =
  createContext<CatalogContextValue | null>(
    null,
  );

type CatalogProviderProps = {
  children: React.ReactNode;
};

async function fetchAllPages<T>(
  requestPage: (
    cursor?: string,
  ) => Promise<PageResponse<T>>,
): Promise<T[]> {
  const collectedItems: T[] = [];
  const visitedCursors = new Set<string>();

  let cursor: string | undefined;

  while (true) {
    const response =
      await requestPage(cursor);

    collectedItems.push(
      ...response.data,
    );

    const nextCursor =
      response.meta.nextCursor;

    if (!nextCursor) {
      break;
    }

    if (
      visitedCursors.has(nextCursor)
    ) {
      throw new Error(
        'The catalog API returned a repeated cursor',
      );
    }

    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return collectedItems;
}

async function fetchCatalogSnapshot(
  locale: Locale,
  signal?: AbortSignal,
): Promise<CatalogSnapshot> {
  const [
    products,
    categories,
    banners,
    branches,
  ] = await Promise.all([
    fetchAllPages(cursor =>
      catalogApi.getProducts(
        {
          locale,
          sort: 'featured',
          limit: 100,
          cursor,
        },
        signal,
      ),
    ),

    fetchAllPages(cursor =>
      catalogApi.getCategories(
        cursor,
        signal,
      ),
    ),

    fetchAllPages(cursor =>
      catalogApi.getBanners(
        cursor,
        signal,
      ),
    ),

    fetchAllPages(cursor =>
      catalogApi.getBranches(
        cursor,
        signal,
      ),
    ),
  ]);

  return {
    products,
    categories: [...categories].sort(
      (first, second) =>
        first.sortOrder -
        second.sortOrder,
    ),
    banners: [...banners].sort(
      (first, second) =>
        first.sortOrder -
        second.sortOrder,
    ),
    branches,
  };
}

function isCatalogSnapshot(
  value: unknown,
): value is CatalogSnapshot {
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as Partial<CatalogSnapshot>;

  return (
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.banners) &&
    Array.isArray(candidate.branches)
  );
}

async function readCatalogCache():
Promise<CatalogSnapshot | null> {
  try {
    const storedValue =
      await AsyncStorage.getItem(
        CATALOG_CACHE_KEY,
      );

    if (!storedValue) {
      return null;
    }

    const parsedValue =
      JSON.parse(
        storedValue,
      ) as Partial<CatalogCache>;

    if (
      parsedValue.version !== 1 ||
      !isCatalogSnapshot(
        parsedValue.snapshot,
      )
    ) {
      return null;
    }

    return parsedValue.snapshot;
  } catch {
    return null;
  }
}

async function writeCatalogCache(
  snapshot: CatalogSnapshot,
): Promise<void> {
  const cache: CatalogCache = {
    version: 1,
    savedAt: new Date().toISOString(),
    snapshot,
  };

  try {
    await AsyncStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify(cache),
    );
  } catch {
    /**
     * A persistence failure must not prevent
     * the live catalog from being displayed.
     */
  }
}

function getErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return 'Unable to load the catalog';
}

export function CatalogProvider({
  children,
}: CatalogProviderProps) {
  const { i18n } = useTranslation();

  const locale: Locale =
    i18n.resolvedLanguage === 'ar'
      ? 'ar'
      : 'en';

  const [
    snapshot,
    setSnapshotState,
  ] = useState<CatalogSnapshot | null>(
    null,
  );

  const [
    isInitialLoading,
    setIsInitialLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    refreshError,
    setRefreshError,
  ] = useState<string | null>(null);

  const snapshotRef =
    useRef<CatalogSnapshot | null>(null);

  const mountedRef = useRef(true);

  const setSnapshot = useCallback(
    (
      nextSnapshot: CatalogSnapshot,
    ) => {
      snapshotRef.current =
        nextSnapshot;

      if (mountedRef.current) {
        setSnapshotState(
          nextSnapshot,
        );
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    let cancelled = false;

    async function loadCatalog() {
      setError(null);
      setRefreshError(null);

      const cachedSnapshot =
        await readCatalogCache();

      if (
        cancelled ||
        controller.signal.aborted
      ) {
        return;
      }

      if (cachedSnapshot) {
        setSnapshot(cachedSnapshot);
        setIsInitialLoading(false);
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }

      try {
        const remoteSnapshot =
          await fetchCatalogSnapshot(
            locale,
            controller.signal,
          );

        if (
          cancelled ||
          controller.signal.aborted
        ) {
          return;
        }

        setSnapshot(remoteSnapshot);

        await writeCatalogCache(
          remoteSnapshot,
        );
      } catch (loadError) {
        if (
          cancelled ||
          controller.signal.aborted
        ) {
          return;
        }

        const message =
          getErrorMessage(loadError);

        if (
          cachedSnapshot ||
          snapshotRef.current
        ) {
          setRefreshError(message);
        } else {
          setError(message);
        }
      } finally {
        if (
          !cancelled &&
          !controller.signal.aborted
        ) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    }

     loadCatalog();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    locale,
    setSnapshot,
  ]);

  const reload =
    useCallback(async () => {
      if (isRefreshing) {
        return;
      }

      setIsRefreshing(true);
      setError(null);
      setRefreshError(null);

      try {
        const remoteSnapshot =
          await fetchCatalogSnapshot(
            locale,
          );

        if (!mountedRef.current) {
          return;
        }

        setSnapshot(remoteSnapshot);

        await writeCatalogCache(
          remoteSnapshot,
        );
      } catch (reloadError) {
        if (!mountedRef.current) {
          return;
        }

        const message =
          getErrorMessage(
            reloadError,
          );

        if (snapshotRef.current) {
          setRefreshError(message);
        } else {
          setError(message);
        }
      } finally {
        if (mountedRef.current) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    }, [
      isRefreshing,
      locale,
      setSnapshot,
    ]);

  const value: CatalogContextValue = {
    snapshot,
    isInitialLoading,
    isRefreshing,
    error,
    refreshError,
    reload,
  };

  return (
    <CatalogContext.Provider
      value={value}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog():
CatalogContextValue {
  const context =
    useContext(CatalogContext);

  if (!context) {
    throw new Error(
      'useCatalog must be used inside CatalogProvider',
    );
  }

  return context;
}