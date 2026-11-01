import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'react-native-localize';

import { ar } from './ar';
import { en } from './en';

const LANGUAGE_STORAGE_KEY = 'labna.language.v1';

export type AppLanguage = 'ar' | 'en';

const resources = {
  ar: {
    translation: ar,
  },
  en: {
    translation: en,
  },
} as const;

function getDeviceLanguage(): AppLanguage {
  const deviceLanguage = getLocales()[0]?.languageCode;

  return deviceLanguage === 'ar' ? 'ar' : 'en';
}

function isAppLanguage(
  value: string | null,
): value is AppLanguage {
  return value === 'ar' || value === 'en';
}

export async function initializeI18n(): Promise<void> {
  const savedLanguage = await AsyncStorage.getItem(
    LANGUAGE_STORAGE_KEY,
  );

  const initialLanguage = isAppLanguage(savedLanguage)
    ? savedLanguage
    : getDeviceLanguage();

  if (!i18n.isInitialized) {
    await i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: initialLanguage,
        fallbackLng: 'en',
        supportedLngs: ['ar', 'en'],
        interpolation: {
          escapeValue: false,
        },
        returnNull: false,
      });

    return;
  }

  await i18n.changeLanguage(initialLanguage);
}

export async function setLanguage(
  language: AppLanguage,
): Promise<void> {
  await AsyncStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    language,
  );

  await i18n.changeLanguage(language);
}

export function getCurrentLanguage(): AppLanguage {
  return i18n.language === 'ar' ? 'ar' : 'en';
}

export function isRTL(
  language: AppLanguage = getCurrentLanguage(),
): boolean {
  return language === 'ar';
}

export default i18n;