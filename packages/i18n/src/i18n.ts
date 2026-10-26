import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from './locales';
import { NAMESPACES, resources } from './resources';

export interface MissingKey {
  locale: string;
  ns: string;
  key: string;
}

const missing = new Map<string, MissingKey>();
const listeners = new Set<() => void>();

/** Keys requested but absent from a dictionary. Shown in the dev panel; never rendered raw in production. */
export function getMissingKeys(): MissingKey[] {
  return [...missing.values()];
}

export function subscribeMissingKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createI18n(locale: AppLocale = DEFAULT_LOCALE): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: DEFAULT_LOCALE,
    ns: NAMESPACES,
    defaultNS: 'common',
    initAsync: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    saveMissing: true,
    missingKeyHandler: (lngs, ns, key) => {
      for (const lng of lngs) {
        const id = `${lng}:${ns}:${key}`;
        if (!missing.has(id)) {
          missing.set(id, { locale: lng, ns, key });
          if (import.meta.env?.DEV) console.warn(`[i18n] missing key ${id}`);
          listeners.forEach((l) => l());
        }
      }
    },
  });
  return instance;
}
