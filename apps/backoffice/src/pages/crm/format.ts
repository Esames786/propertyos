import type { Money } from '@repo/contracts';
import { formatArea, formatInstant, formatMoney, formatMoneyCompact, formatNumber, formatPkPhone, useLocale } from '@repo/i18n';
import { useMemo } from 'react';

/** Locale-bound formatting for the Sales screens. Times are shown in Pakistan time, absolute (deterministic). */
export function useCrmFormat() {
  const { locale, dir } = useLocale();
  return useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'Asia/Karachi' });
    const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'Asia/Karachi' });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Karachi' });
    return {
      locale,
      dir,
      money: (m: Money, digits = 1) => formatMoneyCompact(m, locale, digits),
      moneyExact: (m: Money) => formatMoney(m, locale),
      count: (n: number) => formatNumber(n, locale),
      when: (iso: string) => formatInstant(iso, locale, 'dateTime'),
      date: (iso: string) => formatInstant(iso, locale, 'date'),
      time: (iso: string) => formatInstant(iso, locale, 'time'),
      area: (sqft: number) => formatArea(sqft, locale),
      phone: (e164: string) => (e164.startsWith('+92') ? formatPkPhone(e164) : e164),
      dayParts: (iso: string) => ({ day: dayFmt.format(new Date(iso)), month: monthFmt.format(new Date(iso)), weekday: weekdayFmt.format(new Date(iso)) }),
    };
  }, [locale, dir]);
}

export type CrmFormat = ReturnType<typeof useCrmFormat>;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
