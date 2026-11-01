export type Locale = 'ar' | 'en';

export type LocalizedText = {
  ar: string;
  en: string;
};

export type Category = {
  id: string;
  name: LocalizedText;
  imageURL: string;
  sortOrder: number;
};

export type BannerTarget =
  | { kind: 'product'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

export type Banner = {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  imageURL: string;
  destination: BannerTarget;
  cta?: LocalizedText;
  sortOrder: number;
};

export type OpeningInterval = {
  weekday: number;
  opensAt: string;
  closesAt: string;
};

export type Branch = {
  id: string;
  name: LocalizedText;
  address: LocalizedText;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  phoneNumber: string | null;
  timeZoneIdentifier: string;
  openingHours: OpeningInterval[];
  pickupEnabled: boolean;
  acceptsOrders: boolean;
  isDemo: boolean;
  isOpen: boolean;
  nextOpensAt: string | null;
};

export type ProductVariant = {
  id: string;
  label: LocalizedText;
  quantity: number;
  unit: 'ml' | 'g';
  priceMinor: number;
  currencyCode: string;
  isAvailable: boolean;
  availableQuantity: number;
};

export type Product = {
  id: string;
  categoryID: string;
  name: LocalizedText;
  description: LocalizedText;
  ingredients: LocalizedText;
  storageInstructions: LocalizedText;
  imageURLs: string[];
  isFeatured: boolean;
  isDemo: boolean;
  variants: ProductVariant[];
};

export type StoreSettings = {
  id: string;
  currencyCode: string;
  defaultPickupBranchID: string | null;
  acceptOutsideHours: boolean;
  contact: string;
  policies: string;
  version: number;
};
export type ResponseMeta = {
  requestID: string;
};

export type PageMeta = ResponseMeta & {
  nextCursor: string | null;
  branchID?: string;
};

export type DetailMeta = ResponseMeta & {
  branchID?: string;
};

export type PageResponse<T> = {
  data: T[];
  meta: PageMeta;
};

export type DetailResponse<T> = {
  data: T;
  meta: DetailMeta;
};

export type ProductFilters = {
  locale: Locale;
  branchID?: string;
  categoryID?: string;
  q?: string;
  featured?: boolean;
  available?: boolean;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: 'featured' | 'priceAsc' | 'priceDesc' | 'name';
  cursor?: string;
  limit?: number;
};

export type ProductDetailFilters = {
  locale: Locale;
  branchID?: string;
};