import type { Locale } from './types';

export function money(value: number, currencyCode: string, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: currencyCode,
  }).format(value / 100);
}

export function unit(quantity: number, measurement: 'ml' | 'g', locale: Locale) {
  const label = measurement === 'ml' ? (locale === 'ar' ? 'مل' : 'ml') : locale === 'ar' ? 'جم' : 'g';
  return `${quantity} ${label}`;
}
