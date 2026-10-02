import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
};

const CartContext = createContext<CartContextValue | null>(null);
const storageKey = 'labna.cart.v1';

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

function clampLineQuantity(quantity: number, availableQuantity?: number) {
  const max = Math.max(1, Math.min(availableQuantity ?? cartQuantityMax, cartQuantityMax));
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(quantity)));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemInput[]>(readCart);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    add: (product, variant, quantity) => setItems((current) => {
      const nextQuantity = clampLineQuantity(quantity, variant.availableQuantity);
      const existing = current.find((item) => item.productID === product.id && item.variantID === variant.id);
      if (existing) {
        return current.map((item) => (
          item === existing
            ? { ...item, quantity: clampLineQuantity(item.quantity + nextQuantity, variant.availableQuantity) }
            : item
        ));
      }
      return [...current, { productID: product.id, variantID: variant.id, quantity: nextQuantity }];
    }),
    updateQuantity: (productID, variantID, quantity) => setItems((current) => current.flatMap((item) => {
      if (item.productID !== productID || item.variantID !== variantID) return [item];
      if (quantity <= 0) return [];
      return [{ ...item, quantity: clampLineQuantity(quantity) }];
    })),
    remove: (productID, variantID) => setItems((current) => current.filter((item) => item.productID !== productID || item.variantID !== variantID)),
    replace: (next) => setItems(next),
    clear: () => setItems([]),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
