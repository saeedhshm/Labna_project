import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
  } from 'react';
  
  import {
    addGuestFavorite,
    getGuestFavorites,
    removeGuestFavorite,
  } from '@src/core/storage/guestFavoritesStorage';
  
  type FavoritesContextValue = {
    favoriteProductIDs: string[];
    pendingProductIDs: string[];
    persistenceFailed: boolean;
  
    isFavorite: (
      productID: string,
    ) => boolean;
  
    toggleFavorite: (
      productID: string,
    ) => Promise<void>;
  };
  
  const FavoritesContext =
    createContext<FavoritesContextValue | null>(
      null,
    );
  
  type FavoritesProviderProps = {
    children: React.ReactNode;
  };
  
  export function FavoritesProvider({
    children,
  }: FavoritesProviderProps) {
    const [
      favoriteProductIDs,
      setFavoriteProductIDsState,
    ] = useState<string[]>([]);
  
    const [
      pendingProductIDs,
      setPendingProductIDs,
    ] = useState<string[]>([]);
  
    const [
      persistenceFailed,
      setPersistenceFailed,
    ] = useState(false);
  
    const favoriteIDsRef =
      useRef<string[]>([]);
  
    const setFavoriteProductIDs =
      useCallback((productIDs: string[]) => {
        favoriteIDsRef.current =
          productIDs;
  
        setFavoriteProductIDsState(
          productIDs,
        );
      }, []);
  
    useEffect(() => {
      let cancelled = false;
  
      async function restoreFavorites() {
        const restoredFavorites =
          await getGuestFavorites();
  
        if (!cancelled) {
          setFavoriteProductIDs(
            restoredFavorites,
          );
        }
      }
  
      restoreFavorites();
  
      return () => {
        cancelled = true;
      };
    }, [setFavoriteProductIDs]);
  
    const isFavorite = useCallback(
      (productID: string) =>
        favoriteIDsRef.current.includes(
          productID,
        ),
      [],
    );
  
    const toggleFavorite =
      useCallback(
        async (productID: string) => {
          if (
            !productID ||
            pendingProductIDs.includes(
              productID,
            )
          ) {
            return;
          }
  
          const previousIDs = [
            ...favoriteIDsRef.current,
          ];
  
          const wasFavorite =
            previousIDs.includes(productID);
  
          const optimisticIDs =
            wasFavorite
              ? previousIDs.filter(
                  id => id !== productID,
                )
              : [
                  productID,
                  ...previousIDs,
                ];
  
          setPendingProductIDs(
            current => [
              ...current,
              productID,
            ],
          );
  
          setFavoriteProductIDs(
            optimisticIDs,
          );
  
          setPersistenceFailed(false);
  
          try {
            const savedIDs = wasFavorite
              ? await removeGuestFavorite(
                  productID,
                )
              : await addGuestFavorite(
                  productID,
                );
  
            setFavoriteProductIDs(
              savedIDs,
            );
          } catch {
            setFavoriteProductIDs(
              previousIDs,
            );
  
            setPersistenceFailed(true);
          } finally {
            setPendingProductIDs(
              current =>
                current.filter(
                  id => id !== productID,
                ),
            );
          }
        },
        [
          pendingProductIDs,
          setFavoriteProductIDs,
        ],
      );
  
    return (
      <FavoritesContext.Provider
        value={{
          favoriteProductIDs,
          pendingProductIDs,
          persistenceFailed,
          isFavorite,
          toggleFavorite,
        }}
      >
        {children}
      </FavoritesContext.Provider>
    );
  }
  
  export function useFavorites():
  FavoritesContextValue {
    const context =
      useContext(FavoritesContext);
  
    if (!context) {
      throw new Error(
        'useFavorites must be used inside FavoritesProvider',
      );
    }
  
    return context;
  }