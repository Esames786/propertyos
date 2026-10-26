import type { AppLocale } from '../locales';

export function formatNumber(value: number, locale: AppLocale, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatPercent(ratio: number, locale: AppLocale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits }).format(ratio);
}

/** Intl has no square-foot unit, so the label is locale data here (Urdu: مربع فٹ). */
const SQUARE_FEET: Record<AppLocale, string> = { 'en-PK': 'sq ft', 'ur-PK': 'مربع فٹ' };

export function formatArea(squareFeet: number, locale: AppLocale): string {
  return `${formatNumber(squareFeet, locale)} ${SQUARE_FEET[locale]}`;
}
