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
export function normalizeSearchText(
  value: string,
  language: AppLanguage,
): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f\u064B-\u065F\u0670]/g,
      '',
    )
    .toLocaleLowerCase(language);
}

export function searchProducts(
  products: Product[],
  searchText: string,
  language: AppLanguage,
): Product[] {
  const query = normalizeSearchText(
    searchText,
    language,
  );

  if (!query) {
    return products;
  }

  return products.filter(product => {
    const searchableText = [
      localizedText(
        product.name,
        language,
      ),
      localizedText(
        product.description,
        language,
      ),
      localizedText(
        product.ingredients,
        language,
      ),
    ].join(' ');

    return normalizeSearchText(
      searchableText,
      language,
    ).includes(query);
  });
}

export function sortProductsByFeatured(
  products: Product[],
  language: AppLanguage,
): Product[] {
  return [...products].sort(
    (first, second) => {
      if (
        first.isFeatured !==
        second.isFeatured
      ) {
        return first.isFeatured
          ? -1
          : 1;
      }

      const firstName =
        localizedText(
          first.name,
          language,
        );

      const secondName =
        localizedText(
          second.name,
          language,
        );

      return firstName.localeCompare(
        secondName,
        language,
        {
          sensitivity: 'base',
        },
      );
    },
  );
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