import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cartItemInput, cartQuantityMax, type CartItemInput } from '@labna/contracts';
import type { PublicProduct, PublicVariant } from './types';

type CartContextValue = {
  items: CartItemInput[];
  count: number;
  add: (product: PublicProduct, variant: PublicVariant, quantity: number) => void;
  updateQuantity: (productID: string, variantID: string, quantity: number) => void;
  remove: (productID: string, variantID: string) => void;
  replace: (items: CartItemInput[]) => void;
  clear: () => void;
  /** Unit price captured when the line was added, used only to tell the shopper
   * that the server price moved. It never feeds a total: checkout uses the
   * amounts the backend returns. */
  unitPriceAtAddition: (productID: string, variantID: string) => number | undefined;
};

const CartContext = createContext<CartContextValue | null>(null);
const storageKey = 'labna.cart.v1';
/** Kept apart from the cart items so the request payload stays exactly the
 * shared `cartItemInput` shape. */
const priceKey = 'labna.cart.prices.v1';
const lineKey = (productID: string, variantID: string) => `${productID}:${variantID}`;

function readCart(): CartItemInput[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = cartItemInput.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function readPrices(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(priceKey) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
  } catch {
    return {};
  }
}

function clampLineQuantity(quantity: number, availableQuantity?: number) {
  const max = Math.max(1, Math.min(availableQuantity ?? cartQuantityMax, cartQuantityMax));
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(quantity)));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemInput[]>(readCart);
  const pricesRef = useRef<Record<string, number>>(readPrices());

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items]);

  // Capture the price the shopper saw, and forget it once the line is gone.
  const rememberPrices = useCallback((next: CartItemInput[], added?: { productID: string; variantID: string; priceMinor: number }) => {
    if (added) pricesRef.current[lineKey(added.productID, added.variantID)] = added.priceMinor;
    const live = new Set(next.map((item) => lineKey(item.productID, item.variantID)));
    for (const key of Object.keys(pricesRef.current)) {
      if (!live.has(key)) delete pricesRef.current[key];
    }
    localStorage.setItem(priceKey, JSON.stringify(pricesRef.current));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      add: (product, variant, quantity) =>
        setItems((current) => {
          const nextQuantity = clampLineQuantity(quantity, variant.availableQuantity);
          const existing = current.find((item) => item.productID === product.id && item.variantID === variant.id);
          const next = existing
            ? current.map((item) => (item === existing ? { ...item, quantity: clampLineQuantity(item.quantity + nextQuantity, variant.availableQuantity) } : item))
            : [...current, { productID: product.id, variantID: variant.id, quantity: nextQuantity }];
          rememberPrices(next, { productID: product.id, variantID: variant.id, priceMinor: variant.priceMinor });
          return next;
        }),
      updateQuantity: (productID, variantID, quantity) =>
        setItems((current) =>
          current.flatMap((item) => {
            if (item.productID !== productID || item.variantID !== variantID) return [item];
            if (quantity <= 0) return [];
            return [{ ...item, quantity: clampLineQuantity(quantity) }];
          }),
        ),
      remove: (productID, variantID) =>
        setItems((current) => {
          const next = current.filter((item) => item.productID !== productID || item.variantID !== variantID);
          rememberPrices(next);
          return next;
        }),
      replace: (next) => {
        rememberPrices(next);
        setItems(next);
      },
      clear: () => {
        rememberPrices([]);
        setItems([]);
      },
      unitPriceAtAddition: (productID, variantID) => pricesRef.current[lineKey(productID, variantID)],
    }),
    [items, rememberPrices],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
