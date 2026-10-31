import { DISPLAY_TIME_ZONE } from '@repo/i18n/format';

/**
 * The demo's clock for actions (integration of D.1 and S.1, Issue #6). The demo keeps a fixed
 * business date (`ctx.at`); an action happens on that date at the current wall-clock time of the
 * organisation's time zone, written with its offset ("2026-10-26T23:59:30.123+05:00"). Earlier the
 * time was UTC with the demo date ("…T22:12Z"), which showed as the next day in Pakistan.
 *
 * Business dates (posting dates, periods, due dates) stay plain dates and never come from these
 * timestamps' clock time. Compare timestamps as instants (`byInstant`), never as strings: seeded
 * records are written in UTC ("…Z") and new ones with an offset.
 */

/** "+05:00" for Asia/Karachi (no daylight saving); generic for any IANA zone. */
export function offsetOf(timeZone: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? `${m[1]}${m[2]}:${m[3] ?? '00'}` : '+00:00';
}

/** The wall-clock time now in a time zone, "HH:mm:ss.SSS". */
function wallTime(timeZone: string, now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

/** An action's timestamp: the business date with the wall-clock time and offset of the time zone. */
export function zonedStamp(date: string, timeZone: string = DISPLAY_TIME_ZONE, now: Date = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Invalid business date "${date}"`);
  return `${date}T${wallTime(timeZone, now)}${offsetOf(timeZone, now)}`;
}

/** Orders by instant (oldest first; reverse the arguments for newest first). */
export const byInstant = <T>(pick: (x: T) => string) => (a: T, b: T) => Date.parse(pick(a)) - Date.parse(pick(b));

/** Whether instant `a` is after instant `b` (an empty `b` counts as "never"). */
export const isAfter = (a: string, b: string | undefined) => !b || Date.parse(a) > Date.parse(b);
