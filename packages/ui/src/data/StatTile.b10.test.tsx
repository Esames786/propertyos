import { screen } from '@testing-library/react';
import { Landmark } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { StatTile } from './StatTile';

/**
 * UX B10 (GitHub Issue #24). Markup contracts only (jsdom draws nothing); the drawn result is measured in
 * Chromium, Firefox and WebKit by tests/e2e/ux-b10.spec.ts and tests/smoke/uxb10.smoke.spec.ts.
 */
describe('B10 F-INT-1: a StatTile label is never cut', () => {
  it('the label carries no line clamp, ellipsis or overflow clipping, and is the start of the name', () => {
    renderWithProviders(
      <StatTile
        testId="t"
        label="Owner payable (settled money only)"
        value="Rs 0"
        accessibleValue="Rs 0.00. nothing is settled: no bank evidence exists here"
        context="Rs 0.00 · nothing is settled: no bank evidence exists here"
        delta={{ text: '+1%', description: 'up 1%', direction: 'up', tone: 'positive' }}
        href="/x"
        icon={Landmark}
      />,
    );
    const tile = screen.getByTestId('t');
    const label = tile.querySelector<HTMLElement>('[data-stat-label]')!;
    expect(label.textContent).toBe('Owner payable (settled money only)');
    expect(label.className).not.toMatch(/line-clamp|truncate|text-ellipsis|overflow-(hidden|clip)/);
    // Its row may wrap (the change badge moves below when the label's longest word cannot fit beside it).
    expect(label.parentElement!.parentElement!.className).toMatch(/\bflex-wrap\b/);
    expect(tile.getAttribute('aria-label')!.startsWith('Owner payable (settled money only), ')).toBe(true);
  });
});

describe('B10 F-INT-3: a confirm dialog keeps a focused control clear of its scrolling edge', () => {
  it('the overlay that scrolls a tall dialog has scroll padding', () => {
    renderWithProviders(<ConfirmDialog isOpen onOpenChange={() => {}} title="Issue the statement?" effect="It is frozen as it stands." confirmLabel="Issue" onConfirm={() => {}} />);
    const overlay = screen.getByRole('alertdialog').closest<HTMLElement>('.overflow-y-auto')!;
    expect(overlay).not.toBeNull();
    expect(overlay.className).toMatch(/\bscroll-p-4\b/);
  });
});
