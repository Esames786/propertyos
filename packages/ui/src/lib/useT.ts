import { NAMESPACES, useTranslation } from '@repo/i18n';

/**
 * Translation hook with every namespace loaded, so components can use `t('nav:items.home')`.
 * Keys are type-checked against the en-PK dictionaries.
 */
export function useT() {
  return useTranslation(NAMESPACES);
}

export type DynamicT = (key: string, params?: Record<string, unknown>) => string;

/**
 * For keys that arrive as data (notification and activity message keys from the API).
 * They cannot be checked at compile time; the i18n parity check and the missing-key handler
 * still catch absent translations.
 */
export function dynamicT(t: unknown): DynamicT {
  return t as DynamicT;
}
