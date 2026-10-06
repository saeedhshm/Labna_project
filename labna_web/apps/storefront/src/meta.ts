import { useEffect } from 'react';
import { useLanguage } from './i18n';

const siteName = 'لبنة';
const defaultDescription = 'متجر إلكتروني لمنتجات الألبان الطازجة: اطلب أونلاين، تابع طلبك، واستلم من أقرب فرع.';

/** Keeps the document title and description in step with the active locale, so
 * a shared link or a browser history entry is labelled with what it shows. */
export function usePageMeta(title: string, description?: string) {
  const { t, locale } = useLanguage();
  useEffect(() => {
    const nextTitle = title ? `${title} | ${siteName}` : `${t('متجر لبنة', 'Labna store')} | ${siteName}`;
    if (document.title !== nextTitle) document.title = nextTitle;
    if (document.documentElement.lang !== locale) document.documentElement.lang = locale;
    const meta = document.querySelector('meta[name="description"]');
    const nextDescription = description ?? defaultDescription;
    if (meta?.getAttribute('content') !== nextDescription) meta?.setAttribute('content', nextDescription);
  }, [title, description, t, locale]);
}
