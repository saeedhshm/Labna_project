/** Presentation helpers shared by the admin screens. */
import type { LocalizedText } from '@labna/contracts';

export const ar = (value: LocalizedText | undefined) => value?.ar ?? '';
export const en = (value: LocalizedText | undefined) => value?.en ?? '';

const formatters = new Map<string, Intl.NumberFormat>();
const numberFormat = (locale: string) => {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(locale, formatter);
  }
  return formatter;
};

/** Formats integer minor units, e.g. 3500 EGP becomes "٣٥٫٠٠ ج.م.". */
export const money = (minor: number, currencyCode: string, locale = 'ar-EG') => {
  try {
    return `${numberFormat(locale).format(minor / 100)} ${currencyCode}`;
  } catch {
    return `${(minor / 100).toFixed(2)} ${currencyCode}`;
  }
};

/**
 * Normalizes the digit and decimal shapes an Arabic-locale keyboard or paste can
 * produce: Arabic-Indic (٠-٩), Eastern Arabic (۰-۹), and the Arabic decimal
 * separator U+066B alongside the Latin one.
 */
const normalizeDigits = (input: string) => {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  return input.replace(/[٠-٩۰-۹]/g, char => {
    const index = arabicIndic.indexOf(char);
    return String(index >= 0 ? index : easternArabic.indexOf(char));
  });
};

/** Parses a major-unit input into minor units without floating point drift. */
export const toMinor = (input: string): number | undefined => {
  const normalized = normalizeDigits(input.trim()).replace(/[٫,\s]/g, '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
};

export const fromMinor = (minor: number) => (minor / 100).toFixed(2);

export const localize = (value: LocalizedText, language: 'ar' | 'en') => (language === 'ar' ? ar(value) : en(value));

export const isBlank = (value: string) => value.trim().length === 0;
