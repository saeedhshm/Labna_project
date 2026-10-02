import type { BannerDTO, BranchDTO, CategoryDTO, LocalizedText, ProductDTO, VariantInput } from '@labna/contracts';

export type Locale = 'ar' | 'en';

export type PublicVariant = Omit<VariantInput, 'sku' | 'isActive'> & {
  isAvailable: boolean;
  availableQuantity: number;
};

export type PublicProduct = Omit<ProductDTO, 'version' | 'publicationStatus' | 'variants'> & {
  isDemo: boolean;
  variants: PublicVariant[];
};

export type PublicCategory = Omit<CategoryDTO, 'version'>;
export type PublicBanner = Omit<BannerDTO, 'version' | 'isActive'>;
export type PublicBranch = Omit<BranchDTO, 'version' | 'dateOverrides' | 'isVisible'> & {
  isDemo: boolean;
  isOpen: boolean;
  nextOpensAt: string | null;
};

export type Page<T> = {
  data: T[];
  meta: { nextCursor: string | null; branchID?: string };
};

export type Detail<T> = {
  data: T;
  meta: { branchID?: string; requestID?: string };
};

export type ProductFilters = {
  categoryID?: string;
  q?: string;
  sort?: 'featured' | 'priceAsc' | 'priceDesc' | 'name';
  available?: boolean;
  featured?: boolean;
  cursor?: string;
  limit?: number;
  locale: Locale;
};

export const text = (value: LocalizedText, locale: Locale) => value[locale] || value.ar || value.en;
