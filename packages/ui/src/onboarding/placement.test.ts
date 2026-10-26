import { describe, expect, it } from 'vitest';
import { placeCard, sheetEdge } from './placement';

const vp = { width: 1440, height: 900 };
const card = { width: 352, height: 220 };

describe('placeCard', () => {
  it('places below and aligned to the reading-start edge in LTR', () => {
    const p = placeCard({ top: 12, left: 300, width: 200, height: 40 }, card, vp, 'ltr');
    expect(p.side).toBe('bottom');
    expect(p.left).toBe(300);
  });

  it('mirrors alignment in RTL (aligns to the right edge of the target)', () => {
    const p = placeCard({ top: 12, left: 900, width: 200, height: 40 }, card, vp, 'rtl');
    expect(p.side).toBe('bottom');
    expect(p.left).toBe(900 + 200 - 352);
  });

  it('goes to the logical end side for a tall sidebar target', () => {
    const ltr = placeCard({ top: 64, left: 0, width: 256, height: 836 }, card, vp, 'ltr');
    expect(ltr.side).toBe('end');
    expect(ltr.left).toBeGreaterThan(256);
    const rtl = placeCard({ top: 64, left: 1184, width: 256, height: 836 }, card, vp, 'rtl');
    expect(rtl.side).toBe('end');
    expect(rtl.left + card.width).toBeLessThan(1184);
  });

  it('never leaves the viewport', () => {
    const p = placeCard({ top: 12, left: 1400, width: 40, height: 40 }, card, vp, 'ltr');
    expect(p.left + card.width).toBeLessThanOrEqual(vp.width - 12);
  });

  it('centres when there is no target', () => {
    expect(placeCard(null, card, vp, 'ltr').side).toBe('center');
  });

  it('puts the phone sheet on the edge away from the target', () => {
    expect(sheetEdge({ top: 10, left: 0, width: 40, height: 40 }, 844)).toBe('bottom');
    expect(sheetEdge({ top: 780, left: 0, width: 40, height: 40 }, 844)).toBe('top');
  });
});
