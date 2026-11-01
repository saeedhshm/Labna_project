import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_FAVORITES_KEY =
  'labna.guest-favorites.v1';

const MAX_FAVORITES = 200;

export async function getGuestFavorites(): Promise<
  string[]
> {
  try {
    const storedValue = await AsyncStorage.getItem(
      GUEST_FAVORITES_KEY,
    );

    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const validIDs = parsedValue.filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.length > 0,
    );

    return [...new Set(validIDs)].slice(
      0,
      MAX_FAVORITES,
    );
  } catch {
    return [];
  }
}

export async function addGuestFavorite(
  productID: string,
): Promise<string[]> {
  const current = await getGuestFavorites();

  const next = [
    productID,
    ...current.filter(id => id !== productID),
  ].slice(0, MAX_FAVORITES);

  await AsyncStorage.setItem(
    GUEST_FAVORITES_KEY,
    JSON.stringify(next),
  );

  return next;
}

export async function removeGuestFavorite(
  productID: string,
): Promise<string[]> {
  const current = await getGuestFavorites();

  const next = current.filter(
    id => id !== productID,
  );

  await AsyncStorage.setItem(
    GUEST_FAVORITES_KEY,
    JSON.stringify(next),
  );

  return next;
}

export async function clearGuestFavorites(): Promise<void> {
  await AsyncStorage.removeItem(
    GUEST_FAVORITES_KEY,
  );
}