import { DISPLAY_TIME_ZONE, type AppLocale } from '../locales';

/**
 * Explicit patterns instead of locale "short" styles: CLDR gives en-PK "26/10/2026" but
 * ur-PK "26/10/26" (Stage 0 conflict C5). Instants are stored in UTC and shown in Asia/Karachi.
 */
const INSTANT_PATTERNS = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
  monthYear: { month: 'long', year: 'numeric' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type InstantStyle = keyof typeof INSTANT_PATTERNS;

/** Formats an ISO-8601 instant (e.g. "2026-10-26T09:05:00Z"). */
export function formatInstant(iso: string, locale: AppLocale, style: InstantStyle = 'date'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant "${iso}"`);
  return new Intl.DateTimeFormat(locale, {
    ...INSTANT_PATTERNS[style],
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

/**
 * Formats a calendar date with no time ("2026-11-05"), such as a due date.
 * Interpreted as a civil date, so it never shifts a day across time zones.
 */
export function formatCalendarDate(isoDate: string, locale: AppLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`Invalid calendar date "${isoDate}"`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(locale, { ...INSTANT_PATTERNS.date, timeZone: 'UTC' }).format(date);
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.345],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** "2 hours ago" / "2 گھنٹے پہلے". Always pair with the absolute time in a title or tooltip. */
export function formatRelative(iso: string, locale: AppLocale, now: Date = new Date()): string {
  let delta = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit);
    delta /= size;
  }
  return rtf.format(Math.round(delta), 'year');
}
