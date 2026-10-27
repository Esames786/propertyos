import type { Money } from '@repo/contracts';
import { formatCalendarDate, formatMoney, formatMoneyCompact, formatNumber, formatNumberCompact, formatPercent, formatRelative, useLocale } from '@repo/i18n';
import { useMemo } from 'react';

/** The platform demo's data clock (fixtures are fixed so screenshots are deterministic). */
export const HQ_AS_OF = '2026-10-26T09:00:00Z';

const amountOf = (v: Money | string | number) => (typeof v === 'object' ? v.amount : typeof v === 'number' ? v.toFixed(2) : v);

/**
 * Formatting bound to the active locale. Money keeps its value in every language: only grouping
 * and reading change. Exact amounts are used in tables, quotes and accessible names; compact ones
 * only as summaries.
 */
export function useHqFormat() {
  const { locale } = useLocale();
  return useMemo(() => {
    const now = new Date(HQ_AS_OF);
    const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      locale,
      money: (v: Money | string | number) => formatMoney({ amount: amountOf(v), currency: 'PKR' }, locale),
      moneyCompact: (v: Money | string | number, digits = 1) => formatMoneyCompact({ amount: amountOf(v), currency: 'PKR' }, locale, digits),
      count: (n: number) => formatNumber(n, locale),
      compact: (n: number) => formatNumberCompact(n, locale, 0),
      percent: (ratio: number, digits = 0) => formatPercent(ratio, locale, digits),
      date: (iso: string) => formatCalendarDate(iso.slice(0, 10), locale),
      relative: (iso: string) => formatRelative(iso, locale, now),
      monthShort: (ym: string) => monthShort.format(new Date(`${ym.slice(0, 7)}-01T00:00:00Z`)),
      monthLong: (ym: string) => monthLong.format(new Date(`${ym.slice(0, 7)}-01T00:00:00Z`)),
      hour: Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Karachi' }).format(now)),
    };
  }, [locale]);
}

export type HqFormat = ReturnType<typeof useHqFormat>;
