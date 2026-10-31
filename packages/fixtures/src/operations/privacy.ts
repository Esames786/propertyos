import type { ResidentCount } from '@repo/contracts';

/**
 * D-47 small-audience privacy for counts residents see (community issues; later polls). A count is
 * shown only when the count and the eligible audience both reach the threshold (3 and 5 households by
 * default; a tenant may raise them, never lower them), and only in fixed groupings: the whole site,
 * and a block that qualifies. A block is hidden when the rest of the site ("site − block") would fall
 * below the threshold in count or audience, so two shown numbers can never be subtracted to point at a
 * few households. Counts are scheduled snapshots, not live tallies, and a published number moves only
 * when it has changed by at least the threshold since it was last published: one neighbour's
 * affirmation (or someone toggling theirs on and off) never shows as a change between snapshots.
 * Pure and vector-tested (privacy-differencing.vectors.json).
 */
export interface Threshold {
  minCount: number;
  minAudience: number;
}

export const DEFAULT_THRESHOLD: Threshold = { minCount: 3, minAudience: 5 };

/** A tenant may only raise the thresholds (D-47 (1)). */
export const effectiveThreshold = (tenant?: Partial<Threshold>): Threshold => ({
  minCount: Math.max(DEFAULT_THRESHOLD.minCount, tenant?.minCount ?? 0),
  minAudience: Math.max(DEFAULT_THRESHOLD.minAudience, tenant?.minAudience ?? 0),
});

export interface Counts {
  site: number;
  blocks: Record<string, number>;
}

export interface Published extends Counts {
  at: string;
}

/**
 * The scheduled refresh: each grouping takes the live value only if it moved by at least the
 * threshold since the value last published (a first publication takes the live value).
 */
export function refreshPublished(previous: Published | undefined, live: Counts, at: string, t: Threshold = DEFAULT_THRESHOLD): Published {
  const stick = (old: number | undefined, now: number) => (old === undefined || Math.abs(now - old) >= t.minCount ? now : old);
  const codes = new Set([...Object.keys(live.blocks), ...Object.keys(previous?.blocks ?? {})]);
  return { at, site: stick(previous?.site, live.site), blocks: Object.fromEntries([...codes].sort().map((c) => [c, stick(previous?.blocks[c], live.blocks[c] ?? 0)])) };
}

/**
 * What a resident may see of the published counts. `scope` is the grouping the issue belongs to: the
 * site (site count plus qualifying blocks) or one block (that block's count only).
 */
export function residentCount(published: Published | undefined, audience: Counts, scope: { kind: 'site' } | { kind: 'block'; code: string }, t: Threshold = DEFAULT_THRESHOLD): ResidentCount {
  if (!published) return { shown: false, reason: 'no_snapshot' };
  if (scope.kind === 'block') {
    const n = published.blocks[scope.code] ?? 0;
    const aud = audience.blocks[scope.code] ?? 0;
    if (aud < t.minAudience) return { shown: false, reason: 'audience_too_small' };
    if (n < t.minCount) return { shown: false, reason: 'below_threshold' };
    return { shown: true, site: n, blocks: [], asOf: published.at };
  }
  if (audience.site < t.minAudience) return { shown: false, reason: 'audience_too_small' };
  if (published.site < t.minCount) return { shown: false, reason: 'below_threshold' };
  const blocks = Object.keys(published.blocks)
    .sort()
    .filter((code) => {
      const n = published.blocks[code] ?? 0;
      const aud = audience.blocks[code] ?? 0;
      const rest = published.site - n;
      const restAudience = audience.site - aud;
      return n >= t.minCount && aud >= t.minAudience && rest >= t.minCount && restAudience >= t.minAudience;
    })
    .map((code) => ({ code, count: published.blocks[code]! }));
  return { shown: true, site: published.site, blocks, asOf: published.at };
}
