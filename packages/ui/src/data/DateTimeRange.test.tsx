import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/render';
import { DateTimeRange } from './DateTimeRange';

const START = '2026-10-26T02:00:00Z';
const END = '2026-10-26T10:00:00Z';

describe('DateTimeRange', () => {
  it('renders time tokens separately with preserved ISO values and isolation', () => {
    renderWithProviders(<p dir="rtl">ڈیوٹی <DateTimeRange start={START} end={END} /></p>);
    const times = document.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect([...times].map((time) => time.dateTime)).toEqual([START, END]);
    expect([...times].every((time) => time.querySelector('bdi[dir="auto"]') !== null)).toBe(true);
    expect(screen.getByText('–')).toHaveAttribute('aria-hidden', 'true');
  });

  it('wraps long ranges instead of forcing a single unbreakable sentence', () => {
    renderWithProviders(<DateTimeRange start={START} end={END} style="dateTime" />);
    const parent = document.querySelector('time')?.parentElement;
    expect(parent).toHaveClass('flex-wrap');
    expect(parent).toHaveClass('max-w-full');
  });
});
