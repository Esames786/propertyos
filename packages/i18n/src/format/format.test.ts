import { describe, expect, it } from 'vitest';
import {
  buildIban,
  formatArea,
  formatCalendarDate,
  formatIban,
  formatInstant,
  formatMoney,
  formatPkPhone,
  formatRelative,
  isValidCnic,
  isValidIban,
  maskCnic,
  normalizePkPhone,
  toDecimalAmount,
} from './index';

/** Intl uses NBSP / narrow NBSP and bidi marks; compare on visible characters. */
const visible = (s: string) => s.replace(/[‎‏؜]/g, '').replace(/\s/g, ' ');

describe('formatMoney', () => {
  it.each(['en-PK', 'ur-PK'] as const)('%s keeps two decimals (C4: no silent rounding)', (locale) => {
    expect(visible(formatMoney({ amount: '12500000.50', currency: 'PKR' }, locale))).toBe(
      'Rs 12,500,000.50',
    );
    expect(visible(formatMoney({ amount: '0', currency: 'PKR' }, locale))).toBe('Rs 0.00');
  });

  it('formats large amounts exactly from decimal strings', () => {
    expect(visible(formatMoney({ amount: '9999999999999.99', currency: 'PKR' }, 'en-PK'))).toBe(
      'Rs 9,999,999,999,999.99',
    );
  });

  it('uses Latin digits in Urdu (assumption A1) and does not change the amount', () => {
    const ur = visible(formatMoney({ amount: '1500.25', currency: 'PKR' }, 'ur-PK'));
    const en = visible(formatMoney({ amount: '1500.25', currency: 'PKR' }, 'en-PK'));
    expect(ur).toBe(en);
    expect(ur).toMatch(/^[\x20-\x7e]+$/);
  });

  it('supports currency code display', () => {
    expect(visible(formatMoney({ amount: '1500', currency: 'PKR' }, 'en-PK', { currencyDisplay: 'code' }))).toBe(
      'PKR 1,500.00',
    );
  });

  it('rejects float-looking or malformed amounts', () => {
    expect(() => formatMoney({ amount: '1.005', currency: 'PKR' }, 'en-PK')).toThrow(RangeError);
    expect(() => formatMoney({ amount: '1e5', currency: 'PKR' }, 'en-PK')).toThrow(RangeError);
  });

  it('toDecimalAmount produces canonical strings', () => {
    expect(toDecimalAmount(12500000.5)).toBe('12500000.50');
    expect(toDecimalAmount(0.1 + 0.2)).toBe('0.30');
  });
});

describe('dates (C5: explicit patterns, Asia/Karachi)', () => {
  it('shows the Karachi calendar day for a late-evening UTC instant', () => {
    expect(visible(formatInstant('2026-10-26T20:30:00Z', 'en-PK'))).toBe('27 Oct 2026');
    expect(visible(formatInstant('2026-10-26T20:30:00Z', 'ur-PK'))).toBe('27 اکتوبر، 2026');
  });

  it('formats date-time in both locales', () => {
    expect(visible(formatInstant('2026-10-26T09:05:00Z', 'en-PK', 'dateTime'))).toBe(
      '26 Oct 2026, 2:05 pm',
    );
    expect(visible(formatInstant('2026-10-26T09:05:00Z', 'ur-PK', 'dateTime'))).toContain('2:05');
  });

  it('never shifts a calendar date', () => {
    expect(visible(formatCalendarDate('2026-11-05', 'en-PK'))).toBe('5 Nov 2026');
  });

  it('formats relative time', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(formatRelative('2026-10-26T10:00:00Z', 'en-PK', now)).toBe('2 hours ago');
    expect(formatRelative('2026-10-26T10:00:00Z', 'ur-PK', now)).toBe('2 گھنٹے پہلے');
  });
});

describe('area', () => {
  it('uses square feet in both languages', () => {
    expect(formatArea(1617, 'en-PK')).toBe('1,617 sq ft');
    expect(formatArea(1617, 'ur-PK')).toBe('1,617 مربع فٹ');
  });
});

describe('Pakistani phone numbers', () => {
  it.each([
    ['0300 1234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['042-35761234', '+924235761234'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePkPhone(input)).toBe(expected);
  });

  it.each(['12345', '0300123456', 'abc', '+44 20 7946 0000'])('rejects %s', (input) => {
    expect(normalizePkPhone(input)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatPkPhone('+923001234567')).toBe('+92 300 1234567');
  });
});

describe('CNIC', () => {
  it('masks progressively', () => {
    expect(maskCnic('35202')).toBe('35202');
    expect(maskCnic('352021')).toBe('35202-1');
    expect(maskCnic('3520212345671')).toBe('35202-1234567-1');
    expect(maskCnic('35202-1234567-1999')).toBe('35202-1234567-1');
  });

  it('validates format', () => {
    expect(isValidCnic('35202-1234567-1')).toBe(true);
    expect(isValidCnic('3520212345671')).toBe(true);
    expect(isValidCnic('35202-123456-1')).toBe(false);
  });
});

describe('IBAN', () => {
  it('validates a published example IBAN', () => {
    expect(isValidIban('PK36 SCBL 0000 0011 2345 6702')).toBe(true);
    expect(isValidIban('PK36SCBL0000001123456703')).toBe(false);
  });

  it('builds checksum-valid fictional IBANs with the DEMO bank code', () => {
    const iban = buildIban('PK', 'DEMO0000001234567890');
    expect(iban).toHaveLength(24);
    expect(isValidIban(iban)).toBe(true);
    expect(formatIban(iban)).toMatch(/^PK\d{2} DEMO 0000 0012 3456 7890$/);
  });
});
