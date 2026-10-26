import {
  DISPLAY_TIME_ZONE,
  formatArea,
  formatCalendarDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatNumberCompact,
  formatPercent,
  formatRelative,
  toDecimalAmount,
  useLocale,
} from '@repo/i18n';
import { useMemo } from 'react';

const amount = (v: string | number) => (typeof v === 'number' ? toDecimalAmount(v) : v);

/**
 * Number formatting for the dashboard, bound to the active locale and to the data's own clock
 * (`asOf`), so relative times and greetings are deterministic for fixtures and screenshots.
 * Compact money is a summary only; exact amounts are kept for tables and accessible names.
 */
export function useDashboardFormat(asOf: string) {
  const { locale } = useLocale();
  return useMemo(() => {
    const now = new Date(asOf);
    const monthFmt = (style: 'short' | 'long', withYear = false) =>
      new Intl.DateTimeFormat(locale, { month: style, ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    const short = monthFmt('short');
    const long = monthFmt('long', true);
    const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: DISPLAY_TIME_ZONE });
    return {
      locale,
      money: (v: string | number, digits = 2) => formatMoneyCompact({ amount: amount(v), currency: 'PKR' }, locale, digits),
      moneyExact: (v: string | number) => formatMoney({ amount: amount(v), currency: 'PKR' }, locale),
      tick: (v: number) => formatNumberCompact(v, locale, 0),
      count: (v: number) => formatNumber(v, locale),
      percent: (ratio: number, digits = 0) => formatPercent(ratio, locale, digits),
      area: (sqft: number) => formatArea(sqft, locale),
      monthShort: (period: string) => short.format(new Date(`${period}T00:00:00Z`)),
      monthLong: (period: string) => long.format(new Date(`${period}T00:00:00Z`)),
      monthYear: (date: string) => monthYear.format(new Date(`${date}T00:00:00Z`)),
      date: (isoDate: string) => formatCalendarDate(isoDate, locale),
      relative: (iso: string) => formatRelative(iso, locale, now),
      /** Hour of the data clock in Pakistan time, for the greeting. */
      hour: Number(hourFmt.format(now)),
    };
  }, [locale, asOf]);
}

export type DashboardFormat = ReturnType<typeof useDashboardFormat>;
