import { Link, useT } from '@repo/ui';
import { formatInstant, useLocale } from '@repo/i18n';
import type { ReactNode } from 'react';

/**
 * Gate E.1: an accessible month calendar with an agenda-list alternative, written for CRM-009 site
 * visits and kept generic so the handover appointments calendar (HND-008, Gate E.11) and the buyer's
 * appointment page (PORTAL-014) can reuse it (plan §2.3: no calendar existed). Lift it into
 * `packages/ui` when the second slice uses it.
 *
 * - The month is a real table: a caption, weekday column headers (abbreviated, full name for screen
 *   readers), one cell per day with its entries as links, today marked with `aria-current="date"`.
 * - The agenda lists the same entries day by day with headings, for phones, 200 % text and anyone who
 *   prefers a list; it carries the same actions (each entry links to its record).
 * - Days are Pakistan calendar days (Asia/Karachi, no daylight saving); weeks start on Monday.
 */

export interface CalendarEntry {
  id: string;
  /** ISO instant. */
  at: string;
  title: string;
  href: string;
  /** Short text after the time in the month grid (e.g. a status word). */
  note?: string;
  testId?: string;
  data?: Record<string, string>;
}

const DAY = 86_400_000;
const OFFSET = 5 * 3_600_000;
export const karachiDate = (iso: string) => new Date(Date.parse(iso) + OFFSET).toISOString().slice(0, 10);
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The 5–6 Monday-first weeks a month grid shows (≤ 42 days): the range to request. */
export function monthRange(month: string): { from: string; to: string; days: string[] } {
  const first = `${month}-01`;
  const from = plus(first, -weekday(first));
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const last = plus(next, -1);
  const to = plus(last, 6 - weekday(last));
  const days: string[] = [];
  for (let d = from; d <= to; d = plus(d, 1)) days.push(d);
  return { from, to, days };
}

export const shiftMonth = (month: string, n: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

function useCalendarFormat() {
  const { locale } = useLocale();
  const tz = { timeZone: 'UTC' } as const;
  return {
    month: (month: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', ...tz }).format(new Date(`${month}-01T00:00:00Z`)),
    dayNumber: (date: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', ...tz }).format(new Date(`${date}T00:00:00Z`)),
    weekdayShort: (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', ...tz }).format(new Date(`${date}T00:00:00Z`)),
    weekdayLong: (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', ...tz }).format(new Date(`${date}T00:00:00Z`)),
    fullDate: (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...tz }).format(new Date(`${date}T00:00:00Z`)),
    time: (iso: string) => formatInstant(iso, locale, 'time'),
  };
}

export function byDay<T extends CalendarEntry>(entries: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const d = karachiDate(e.at);
    map.set(d, [...(map.get(d) ?? []), e]);
  }
  return map;
}

/** The month as a table of days. At most `perDay` entries show in a cell; "more" opens that day in the agenda. */
export function MonthGrid<T extends CalendarEntry>({ month, today, entries, perDay = 3, onMore, testId = 'calendar-month' }: { month: string; today: string; entries: readonly T[]; perDay?: number; onMore: (date: string) => void; testId?: string }) {
  const { t } = useT();
  const fmt = useCalendarFormat();
  const { days } = monthRange(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const map = byDay(entries);
  return (
    <table className="w-full table-fixed border-collapse text-sm" data-testid={testId}>
      <caption className="sr-only">{t('sales:calendar.gridCaption', { month: fmt.month(month) })}</caption>
      <thead>
        <tr>
          {weeks[0]!.map((d) => (
            <th key={d} scope="col" className="border-b border-border px-2 py-2 text-start text-xs font-semibold text-muted">
              <abbr title={fmt.weekdayLong(d)} className="no-underline">
                {fmt.weekdayShort(d)}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((d) => {
              const list = map.get(d) ?? [];
              const outside = d.slice(0, 7) !== month;
              const isToday = d === today;
              return (
                <td key={d} className={`h-28 border border-border/70 p-1.5 align-top ${outside ? 'bg-sunken/60' : 'bg-panel'}`} data-date={d} data-count={list.length}>
                  <p className="mb-1 flex items-center justify-between gap-1">
                    <span
                      aria-current={isToday ? 'date' : undefined}
                      className={`grid size-7 place-items-center rounded-pill text-xs font-semibold ${isToday ? 'bg-primary text-on-primary' : outside ? 'text-subtle' : 'text-text'}`}
                    >
                      <span aria-hidden>{fmt.dayNumber(d)}</span>
                      <span className="sr-only">{fmt.fullDate(d)}</span>
                    </span>
                    {isToday && <span className="text-xs font-medium text-primary">{t('sales:calendar.today')}</span>}
                  </p>
                  {list.length > 0 && (
                    <ul className="space-y-1">
                      {list.slice(0, perDay).map((e) => (
                        <li key={e.id} {...Object.fromEntries(Object.entries(e.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}>
                          <Link href={e.href} variant="plain" className="block rounded-control px-1 py-0.5 text-xs text-text outline-none data-hovered:bg-primary-soft data-focus-visible:outline-2 data-focus-visible:outline-focus" data-testid={e.testId}>
                            <bdi dir="ltr" className="font-semibold">
                              {fmt.time(e.at)}
                            </bdi>{' '}
                            <span className="line-clamp-2 break-words">
                              <bdi>{e.title}</bdi>
                              {e.note ? <span className="text-muted"> · {e.note}</span> : null}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {list.length > perDay && (
                    <button type="button" onClick={() => onMore(d)} className="mt-1 rounded-control px-1 text-xs font-medium text-primary underline outline-none focus-visible:outline-2 focus-visible:outline-focus" data-testid="calendar-more">
                      {t('sales:calendar.moreShort', { count: list.length - perDay })}
                      <span className="sr-only"> {fmt.fullDate(d)}</span>
                    </button>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The same entries as a list of days with headings (phones, 200 % text, or by choice). */
export function AgendaList<T extends CalendarEntry>({ entries, today, renderEntry, emptyText, focusDay, testId = 'calendar-agenda' }: { entries: readonly T[]; today: string; renderEntry: (e: T) => ReactNode; emptyText: string; focusDay?: string | null; testId?: string }) {
  const { t } = useT();
  const fmt = useCalendarFormat();
  const map = byDay(entries);
  if (map.size === 0) return <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted" data-testid={`${testId}-empty`}>{emptyText}</p>;
  return (
    <ol className="space-y-5" data-testid={testId}>
      {[...map.entries()].map(([day, list]) => (
        <li key={day} data-date={day} id={`agenda-${day}`} className="scroll-mt-24">
          <h3 tabIndex={focusDay === day ? -1 : undefined} className="mb-2 flex flex-wrap items-baseline gap-2 text-base font-semibold text-text outline-none focus-visible:outline-2 focus-visible:outline-focus" data-testid="agenda-day">
            {fmt.fullDate(day)}
            {day === today && <span className="text-sm font-medium text-primary">{t('sales:calendar.today')}</span>}
            <span className="text-sm font-normal text-muted">{t('sales:calendar.dayCount', { count: list.length })}</span>
          </h3>
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.id}>{renderEntry(e)}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export const useCalendarTime = () => useCalendarFormat().time;
export const useMonthTitle = () => useCalendarFormat().month;
