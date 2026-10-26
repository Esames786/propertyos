import type { AppLocale } from '../locales';

export interface MoneyValue {
  /** Decimal string with at most 2 fraction digits, e.g. "12500000.50". Never a float. */
  amount: string;
  /** ISO 4217 code. Amounts never change with locale; only presentation does. */
  currency: string;
}

const DECIMAL_AMOUNT = /^-?\d{1,18}(\.\d{1,2})?$/;

export function isDecimalAmount(value: string): boolean {
  return DECIMAL_AMOUNT.test(value);
}

/**
 * Formats money with exactly two fraction digits.
 * CLDR's default for PKR is 0 fraction digits, which would silently round 12,500,000.50 to
 * "Rs 12,500,001" (Stage 0 conflict C4), so the digits are always set explicitly.
 * The decimal string is passed straight to Intl (NumberFormat v3) to avoid float conversion.
 */
export function formatMoney(
  value: MoneyValue,
  locale: AppLocale,
  options: { currencyDisplay?: 'symbol' | 'code' | 'name' } = {},
): string {
  if (!isDecimalAmount(value.amount)) {
    throw new RangeError(`Invalid money amount "${value.amount}"`);
  }
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: options.currencyDisplay ?? 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(value.amount as Intl.StringNumericLiteral);
}

/** Converts a number from a numeric input to the canonical 2-decimal string. */
export function toDecimalAmount(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Amount must be finite');
  return value.toFixed(2);
}
