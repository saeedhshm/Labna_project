import type {
  LocalizedText,
  Product,
} from '@src/api/contracts/catalog';

import type {
  AppLanguage,
} from '@src/i18n';

export function localizedText(
  value: LocalizedText,
  language: AppLanguage,
): string {
  const localizedValue =
    value[language].trim();

  if (localizedValue) {
    return localizedValue;
  }

  const fallbackLanguage =
    language === 'ar' ? 'en' : 'ar';

  return value[fallbackLanguage].trim();
}

export function formatPrice(
  minorUnits: number,
  currencyCode: string,
  language: AppLanguage,
): string {
  const amount = minorUnits / 100;

  try {
    return new Intl.NumberFormat(
      language,
      {
        style: 'currency',
        currency: currencyCode,
      },
    ).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

export function getAvailableVariants(
  product: Product,
) {
  return product.variants.filter(
    variant => variant.isAvailable,
  );
}

export function getStartingPrice(
  product: Product,
): number | null {
  const availableVariants =
    getAvailableVariants(product);

  if (!availableVariants.length) {
    return null;
  }

  return Math.min(
    ...availableVariants.map(
      variant => variant.priceMinor,
    ),
  );
}

export function isProductAvailable(
  product: Product,
): boolean {
  return product.variants.some(
    variant =>
      variant.isAvailable &&
      variant.availableQuantity > 0,
  );
}