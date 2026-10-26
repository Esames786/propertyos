import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nProvider as AriaI18nProvider } from 'react-aria-components';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from './i18n';
import {
  DEFAULT_LOCALE,
  directionOf,
  readStoredLocale,
  storeLocale,
  type AppLocale,
  type TextDirection,
} from './locales';

interface LocaleContextValue {
  locale: AppLocale;
  dir: TextDirection;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Owns the active locale. Switching updates i18next, React Aria, <html lang dir> and the stored
 * preference in place: the component tree is not remounted, so form values, open drawers,
 * scroll position and tour progress survive (blueprint J7).
 */
export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(
    () => initialLocale ?? readStoredLocale() ?? DEFAULT_LOCALE,
  );
  const [i18n] = useState(() => createI18n(locale));
  const dir = directionOf(locale);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, dir, i18n]);

  const setLocale = useCallback((next: AppLocale) => {
    storeLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, dir, setLocale }), [locale, dir, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>
        <AriaI18nProvider locale={locale}>{children}</AriaI18nProvider>
      </I18nextProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
