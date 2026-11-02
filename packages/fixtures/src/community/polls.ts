import type { PollOption, PollResults } from '@repo/contracts';
import { DEFAULT_THRESHOLD, type Threshold } from '../operations/privacy';

/**
 * Poll results residents see (D-47, with the owner's ruling in Issue #9). Pure; vector-tested
 * (`polls.vectors.json`). Results exist only after the poll closes; they are recomputed from the
 * frozen answers on every read, so a stored result can never show more than this rule allows.
 *
 * A grouping (the poll's whole audience, or one block) is:
 * - **not shown at all** below `minCount` answers or `minAudience` eligible households;
 * - **turnout only** (`options: null`) when its answers per option could point at one or two people:
 *   every option's count must be 0 or at least `minCount`, and so must the answers outside it (the
 *   complement). The whole breakdown is withheld, never one cell, so no count can be worked out from
 *   the total and the others. No percentages are shown either;
 * - **shown in full** otherwise.
 *
 * A block is shown only when the whole audience's breakdown is, when its own breakdown is safe, and
 * when every figure that can be derived from the shown ones is safe too: the audience minus any set
 * of shown blocks (site − block, and adjacent blocks together). Blocks that fail are dropped, smallest
 * first, until every difference is safe. A poll for one block shows no block line (it would repeat
 * the total). Residents in different blocks get the same answer; there are no filters or dates to vary.
 */
type Counts = number[];

const sum = (c: Counts) => c.reduce((n, x) => n + x, 0);
const minus = (a: Counts, b: Counts) => a.map((x, i) => x - b[i]!);

/** A breakdown that cannot point at fewer than `minCount` people, in any option or its complement. */
export function safeBreakdown(counts: Counts, households: number, t: Threshold = DEFAULT_THRESHOLD): boolean {
  const total = sum(counts);
  const ok = (n: number) => n === 0 || n >= t.minCount;
  return total >= t.minCount && households >= t.minAudience && counts.every((c) => ok(c) && ok(total - c));
}

export function pollResults(
  tally: Readonly<Record<string, Readonly<Record<string, number>>>>,
  options: readonly PollOption[],
  audience: { site: number; blocks: Readonly<Record<string, number>> },
  t: Threshold = DEFAULT_THRESHOLD,
): PollResults {
  const codes = [...new Set([...Object.keys(audience.blocks), ...Object.keys(tally)])].sort();
  const countsOf = (blocks: readonly string[]): Counts => options.map((o) => blocks.reduce((n, code) => n + (tally[code]?.[o.id] ?? 0), 0));
  const householdsOf = (blocks: readonly string[]) => blocks.reduce((n, code) => n + (audience.blocks[code] ?? 0), 0);
  const site = countsOf(codes);
  const total = sum(site);
  if (audience.site < t.minAudience) return { shown: false, reason: 'audience_too_small' };
  if (total < t.minCount) return { shown: false, reason: 'below_threshold' };
  // Turnout is safe here; the breakdown only if no option (or its complement) is a small group.
  if (!safeBreakdown(site, audience.site, t)) return { shown: true, total, options: null, blocks: [] };

  // Blocks: each safe on its own, and every difference "audience − a set of shown blocks" safe too.
  const answered = codes.filter((c) => audience.blocks[c] !== undefined || sum(countsOf([c])) > 0);
  let shown = answered.length < 2 ? [] : answered.filter((c) => safeBreakdown(countsOf([c]), audience.blocks[c] ?? 0, t));
  const differencesSafe = (set: string[]) => {
    for (let mask = 1; mask < 1 << set.length; mask++) {
      const removed = set.filter((_, i) => mask & (1 << i));
      const rest = minus(site, countsOf(removed));
      if (sum(rest) === 0 && removed.length === answered.length) continue;
      if (!safeBreakdown(rest, audience.site - householdsOf(removed), t)) return false;
    }
    return true;
  };
  while (shown.length && !differencesSafe(shown)) {
    const smallest = [...shown].sort((a, b) => sum(countsOf([a])) - sum(countsOf([b])) || a.localeCompare(b))[0]!;
    shown = shown.filter((c) => c !== smallest);
  }
  return {
    shown: true,
    total,
    options: options.map((o, i) => ({ ...o, count: site[i]! })),
    blocks: shown.map((code) => {
      const c = countsOf([code]);
      return { code, total: sum(c), options: options.map((o, i) => ({ id: o.id, count: c[i]! })) };
    }),
  };
}
