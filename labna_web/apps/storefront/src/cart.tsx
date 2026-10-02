import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItemInput } from '@labna/contracts';
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

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItemInput => Boolean(item && typeof item === 'object' && 'productID' in item && 'variantID' in item && 'quantity' in item));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemInput[]>(readCart);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    add: (product, variant, quantity) => setItems(current => {
      const nextQuantity = Math.max(1, Math.min(variant.availableQuantity, quantity));
      const existing = current.find(item => item.productID === product.id && item.variantID === variant.id);
      if (existing) return current.map(item => item === existing ? { ...item, quantity: Math.min(variant.availableQuantity, item.quantity + nextQuantity) } : item);
      return [...current, { productID: product.id, variantID: variant.id, quantity: nextQuantity }];
    }),
    updateQuantity: (productID, variantID, quantity) => setItems(current => current.flatMap(item => {
      if (item.productID !== productID || item.variantID !== variantID) return [item];
      if (quantity <= 0) return [];
      return [{ ...item, quantity: Math.min(1000, quantity) }];
    })),
    remove: (productID, variantID) => setItems(current => current.filter(item => item.productID !== productID || item.variantID !== variantID)),
    replace: next => setItems(next),
    clear: () => setItems([]),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
