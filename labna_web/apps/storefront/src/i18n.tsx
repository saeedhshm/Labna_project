import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Locale } from './types';

type LanguageContextValue = {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (locale: Locale) => void;
  t: (ar: string, en: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem('labna.locale');
    return stored === 'en' ? 'en' : 'ar';
  });
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('labna.locale', locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [dir, locale]);

  return (
    <LanguageContext.Provider value={{ locale, dir, setLocale, t: (ar, en) => (locale === 'ar' ? ar : en) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
