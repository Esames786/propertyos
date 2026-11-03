import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateTime } from './DateTime';
import { renderWithProviders } from '../test/render';

describe('DateTime: mixed Urdu/English punctuation isolation', () => {
  it('isolate absolute local time from an RTL surrounding sentence, without changing its value', () => {
    renderWithProviders(<p dir="rtl">ڈیوٹی ختم ہونے کا وقت <DateTime value="2026-10-26T18:00:00Z" style="time" /></p>);
    const time = screen.getByText(/\d/).closest('time');
    expect(time).toBeInTheDocument();
    expect(time?.querySelector('bdi')).toHaveAttribute('dir', 'auto');
    expect(time?.querySelector('bdi')?.textContent).toBeTruthy();
  });
  it('isolates calendar dates and retains semantic datetime attribute', () => {
    renderWithProviders(<DateTime value="2026-10-26" style="calendar" />);
    const time = document.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-10-26');
    expect(time?.querySelector('bdi')).toHaveAttribute('dir', 'auto');
  });
  it('keeps relative timestamps isolated and accessible', () => {
    renderWithProviders(<DateTime value="2026-10-26T18:00:00Z" relative />);
    const time = document.querySelector('time');
    expect(time?.querySelector('bdi')).toHaveAttribute('dir', 'auto');
    expect(time?.getAttribute('title')).toBeTruthy();
  });
});
