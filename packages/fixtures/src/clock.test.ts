import { formatInstant } from '@repo/i18n/format';
import { describe, expect, it, vi } from 'vitest';
import { byInstant, isAfter, offsetOf, zonedStamp } from './clock';
import { nowStamp } from './identity/state';
import { timeZoneOf } from './tenant-directory';

/**
 * Issue #6 item 2: an action is stamped on the demo's business date at the organisation's wall-clock
 * time (Al-Noor: Asia/Karachi), with its offset, so evening actions in Pakistan never show on the
 * next day. Midnight on both sides.
 */
describe('demo action timestamps in the organisation time zone', () => {
  const DEMO_DATE = '2026-10-26';

  it('one second before midnight in Karachi stays on the demo date, at 11:59 pm', () => {
    const now = new Date('2026-10-31T18:59:59.500Z'); // 23:59:59.500 in Karachi
    const stamp = zonedStamp(DEMO_DATE, 'Asia/Karachi', now);
    expect(stamp).toBe('2026-10-26T23:59:59.500+05:00');
    expect(formatInstant(stamp, 'en-PK', 'dateTime')).toMatch(/^26 Oct 2026, 11:59\s?pm$/i);
    // The old stamp (demo date + UTC clock) put the same action on the next day in Karachi.
    expect(formatInstant(`${DEMO_DATE}T18:59:59.500Z`, 'en-PK', 'date')).toBe('26 Oct 2026');
    expect(formatInstant(`${DEMO_DATE}T22:12:00.000Z`, 'en-PK', 'date')).toBe('27 Oct 2026');
  });

  it('just after midnight in Karachi is still the demo date, at 12:00 am (the date never rolls over)', () => {
    const now = new Date('2026-10-31T19:00:00.250Z'); // 00:00:00.250 in Karachi, next calendar day
    const stamp = zonedStamp(DEMO_DATE, 'Asia/Karachi', now);
    expect(stamp).toBe('2026-10-26T00:00:00.250+05:00');
    expect(stamp.slice(0, 10)).toBe(DEMO_DATE);
    expect(formatInstant(stamp, 'en-PK', 'dateTime')).toMatch(/^26 Oct 2026, 12:00\s?am$/i);
    expect(formatInstant(stamp, 'ur-PK', 'date')).toBe(formatInstant(`${DEMO_DATE}T12:00:00+05:00`, 'ur-PK', 'date'));
  });

  it('a late-evening action (03:12 in Karachi) shows on the demo date, not the day after', () => {
    const stamp = zonedStamp(DEMO_DATE, 'Asia/Karachi', new Date('2026-10-30T22:12:00.000Z'));
    expect(stamp).toBe('2026-10-26T03:12:00.000+05:00');
    expect(formatInstant(stamp, 'en-PK', 'date')).toBe('26 Oct 2026');
  });

  it('offsets come from the configured zone; Al-Noor is configured as Asia/Karachi', () => {
    expect(offsetOf('Asia/Karachi')).toBe('+05:00');
    expect(offsetOf('Asia/Kolkata')).toBe('+05:30');
    expect(offsetOf('UTC')).toBe('+00:00');
    expect(timeZoneOf('tnt_alnoor')).toBe('Asia/Karachi');
    expect(timeZoneOf(undefined)).toBe('Asia/Karachi');
    expect(() => zonedStamp('26/10/2026')).toThrow(RangeError);
  });

  it('D.1 identity events use the same clock (nowStamp): the demo date at the Karachi time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-31T19:00:05.000Z')); // 00:00:05 in Karachi
      expect(nowStamp({ at: DEMO_DATE, tenantId: 'tnt_alnoor' })).toBe('2026-10-26T00:00:05.000+05:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('seeded UTC stamps and new offset stamps order by instant, not by text', () => {
    const seeded = { at: '2026-10-26T06:00:00Z' }; // 11:00 in Karachi
    const fresh = { at: '2026-10-26T10:30:00.000+05:00' }; // 05:30Z: earlier, though "10:30" > "06:00" as text
    expect([seeded, fresh].sort(byInstant((x) => x.at)).map((x) => x.at)).toEqual([fresh.at, seeded.at]);
    expect(isAfter(seeded.at, fresh.at)).toBe(true);
    expect(isAfter(fresh.at, undefined)).toBe(true);
  });
});
