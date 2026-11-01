import { describe, expect, it } from 'vitest';
import vectors from './privacy-differencing.vectors.json';
import { effectiveThreshold, refreshPublished, residentCount, type Counts, type Published, type Threshold } from './privacy';

/**
 * D-47 privacy vectors (Gate D.2): thresholds only raised, snapshots that ignore small changes and
 * toggles, and no count a resident can subtract from another to point at a few households (site minus
 * block, adjacent blocks).
 */
const AT = '2026-10-26T06:00:00+05:00';

describe('D-47 counts residents see', () => {
  for (const v of vectors.threshold) {
    it(`threshold: ${v.name}`, () => {
      expect(effectiveThreshold((v.tenant ?? undefined) as Partial<Threshold> | undefined)).toEqual(v.expect);
    });
  }

  for (const v of vectors.refresh) {
    it(`snapshot: ${v.name}`, () => {
      const previous = v.previous ? ({ ...v.previous, at: '2026-10-25T06:00:00+05:00' } as Published) : undefined;
      expect(refreshPublished(previous, v.live as Counts, AT)).toEqual({ ...v.expect, at: AT });
    });
  }

  for (const v of vectors.resident) {
    it(`resident view: ${v.name}`, () => {
      const published = v.published ? ({ ...v.published, at: AT } as Published) : undefined;
      expect(residentCount(published, v.audience as Counts, v.scope as Parameters<typeof residentCount>[2])).toMatchObject(v.expect);
    });
  }

  it('no shown block count, together with the site count, leaves a hidden remainder below the threshold', () => {
    for (const v of vectors.resident) {
      if (!v.published || v.scope.kind !== 'site') continue;
      const view = residentCount({ ...v.published, at: AT } as Published, v.audience as Counts, { kind: 'site' });
      if (!view.shown) continue;
      const shownCodes = view.blocks.map((b) => b.code);
      const hidden = Object.keys(v.published.blocks).filter((c) => !shownCodes.includes(c));
      if (!hidden.length) continue;
      const remainder = view.site - view.blocks.reduce((sum, b) => sum + b.count, 0);
      expect(remainder, v.name).toBeGreaterThanOrEqual(3);
    }
  });
});
