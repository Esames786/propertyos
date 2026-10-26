/**
 * Locale registry. Adding a language is configuration: add an entry here and its dictionaries;
 * no component changes. Codes are BCP 47.
 */
export const SUPPORTED_LOCALES = ['en-PK', 'ur-PK'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type TextDirection = 'ltr' | 'rtl';

export const DEFAULT_LOCALE: AppLocale = 'en-PK';
export const DISPLAY_TIME_ZONE = 'Asia/Karachi';

export interface LocaleMeta {
  /** Language name written in that language, so speakers can find it regardless of current UI language. */
  nativeName: string;
  /** Compact label for the header toggle. */
  shortLabel: string;
  fallbackDir: TextDirection;
}

export const LOCALE_META: Record<AppLocale, LocaleMeta> = {
  'en-PK': { nativeName: 'English', shortLabel: 'EN', fallbackDir: 'ltr' },
  'ur-PK': { nativeName: 'اردو', shortLabel: 'اردو', fallbackDir: 'rtl' },
};

export const LOCALE_STORAGE_KEY = 'pref:locale';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

type LocaleWithTextInfo = Intl.Locale & {
  textInfo?: { direction?: string };
  getTextInfo?: () => { direction?: string };
};

/** Direction from the platform's CLDR data, falling back to the registry. */
export function directionOf(locale: AppLocale): TextDirection {
  try {
    const l = new Intl.Locale(locale) as LocaleWithTextInfo;
    const info = typeof l.getTextInfo === 'function' ? l.getTextInfo() : l.textInfo;
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction;
  } catch {
    /* fall through */
  }
  return LOCALE_META[locale].fallbackDir;
}

export function readStoredLocale(): AppLocale | null {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: AppLocale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage unavailable (private mode); preference lasts for this session only */
  }
}
