import type { PollOption, PollResults } from '@repo/contracts';
import { DEFAULT_THRESHOLD, type Threshold } from '../operations/privacy';

/**
 * Poll results residents see (D-47, with the owner's rulings in Issues #9 and #10). Pure;
 * vector-tested (`polls.vectors.json`, `community.test.ts`). Results exist only after the poll
 * closes; they are recomputed from the frozen answers on every read, so a stored result can never
 * show more than this rule allows.
 *
 * A grouping (the poll's whole audience, or one block) is:
 * - **not shown at all** below `minCount` answers or `minAudience` eligible households;
 * - **turnout only** (`options: null`) when its answers per option could point at one or two people:
 *   every option's count must be 0 or at least `minCount`, and so must the answers outside it (the
 *   complement). The whole breakdown is withheld, never one cell, so no count can be worked out from
 *   the total and the others. No percentages are shown either;
 * - **shown in full** otherwise. A unanimous result is shown when it meets these conditions.
 *
 * **Blocks (Issue #10: no subset enumeration).** The published figures are the whole audience's
 * breakdown and the breakdown of each shown block. From them a reader can compute exactly the sum of
 * any group of "atoms": each shown block, and the *undisclosed remainder* (every hidden block taken
 * together). Nothing finer: the figures are constant on the hidden blocks, so no single hidden block
 * (or part of the hidden set) can be computed unless it is the whole remainder. So it is enough that
 * every shown block is safe and the remainder is safe or empty: "safe" is closed under adding
 * disjoint groups (a count that is 0 or at least `minCount`, plus another such count, is again 0 or
 * at least `minCount`; the same for each complement, and a total of at least `minCount` answers among
 * at least `minAudience` households stays so). Every derivable figure (site − blocks, adjacent blocks,
 * several hidden blocks) is then a sum of safe disjoint atoms, hence safe.
 *
 * The algorithm: candidates are the blocks safe on their own; while the remainder has a *small figure*
 * (an option count or the answers outside it between 1 and `minCount` − 1; or, if it is not empty,
 * fewer than `minCount` answers or `minAudience` households), one candidate goes back into it: the
 * one that leaves the fewest small figures, then the
 * smallest, then by block code (deterministic). Adding a safe block never makes a figure small, and
 * clears every figure where the block is non-zero. The whole audience (remainder plus every candidate)
 * has no small figure, so while the remainder has one, some candidate is non-zero there and clears it:
 * every step clears at least one, so there are at most 2k + 2 steps for k options, however many
 * blocks. Time O(n log n + n·k²) for n blocks: no masks, no 2^n enumeration, no limit on blocks.
 * A poll for one block shows no block line (it would repeat the total).
 *
 * Inputs that cannot be real (negative, fractional or non-numeric counts, answers for an option the
 * poll does not have, household counts that do not add up) fail closed: nothing is shown.
 */
type Counts = number[];

const sum = (c: Counts) => c.reduce((n, x) => n + x, 0);
const add = (a: Counts, b: Counts) => a.map((x, i) => x + b[i]!);
const minus = (a: Counts, b: Counts) => a.map((x, i) => x - b[i]!);
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/**
 * A group's small figures: each option count, and the answers outside it, between 1 and `minCount`
 * − 1; and, unless the group is empty (no households, no answers), fewer than `minCount` answers in
 * total (none at all would show that every household in it stayed silent) or fewer than `minAudience`
 * households.
 */
function smallFigures(counts: Counts, households: number, t: Threshold): number {
  const total = sum(counts);
  const small = (n: number) => n > 0 && n < t.minCount;
  const empty = total === 0 && households === 0;
  let n = (!empty && total < t.minCount ? 1 : 0) + (!empty && households < t.minAudience ? 1 : 0);
  for (const c of counts) n += (small(c) ? 1 : 0) + (small(total - c) ? 1 : 0);
  return n;
}

/** A breakdown that cannot point at fewer than `minCount` people, in any option or its complement. */
export function safeBreakdown(counts: Counts, households: number, t: Threshold = DEFAULT_THRESHOLD): boolean {
  return sum(counts) > 0 && smallFigures(counts, households, t) === 0;
}

/** The hidden remainder: empty (nothing hidden), or a safe breakdown itself. */
export function safeRemainder(counts: Counts, households: number, t: Threshold = DEFAULT_THRESHOLD): boolean {
  return smallFigures(counts, households, t) === 0;
}

function validInputs(tally: Readonly<Record<string, Readonly<Record<string, number>>>>, options: readonly PollOption[], audience: { site: number; blocks: Readonly<Record<string, number>> }): boolean {
  const ids = new Set(options.map((o) => o.id));
  if (!options.length || ids.size !== options.length) return false;
  for (const byOption of Object.values(tally)) {
    if (!byOption || typeof byOption !== 'object') return false;
    for (const [id, n] of Object.entries(byOption)) if (!ids.has(id) || !count(n)) return false;
  }
  if (!count(audience.site)) return false;
  const households = Object.values(audience.blocks);
  if (!households.every(count)) return false;
  // Every eligible household is counted in its block (`eligibility`), so the blocks add up to the
  // audience exactly; otherwise unknown households could pad the remainder.
  return sum(households) === audience.site;
}

interface Block {
  code: string;
  counts: Counts;
  total: number;
  households: number;
}

export function pollResults(
  tally: Readonly<Record<string, Readonly<Record<string, number>>>>,
  options: readonly PollOption[],
  audience: { site: number; blocks: Readonly<Record<string, number>> },
  t: Threshold = DEFAULT_THRESHOLD,
): PollResults {
  if (!validInputs(tally, options, audience)) return { shown: false, reason: 'unavailable' };
  const codes = [...new Set([...Object.keys(audience.blocks), ...Object.keys(tally)])].sort();
  const blocks: Block[] = codes.map((code) => {
    const counts = options.map((o) => tally[code]?.[o.id] ?? 0);
    return { code, counts, total: sum(counts), households: audience.blocks[code] ?? 0 };
  });
  const site = blocks.reduce((acc, b) => add(acc, b.counts), options.map(() => 0));
  const total = sum(site);
  if (audience.site < t.minAudience) return { shown: false, reason: 'audience_too_small' };
  if (total < t.minCount) return { shown: false, reason: 'below_threshold' };
  // Turnout is safe here; the breakdown only if no option (or its complement) is a small group.
  if (!safeBreakdown(site, audience.site, t)) return { shown: true, total, options: null, blocks: [] };

  // Candidates, smallest first (then by code): each block safe on its own.
  let shown = blocks.length < 2 ? [] : blocks.filter((b) => safeBreakdown(b.counts, b.households, t)).sort((a, b) => a.total - b.total || a.code.localeCompare(b.code));
  let rest = shown.reduce((acc, b) => minus(acc, b.counts), site);
  let restHouseholds = audience.site - shown.reduce((n, b) => n + b.households, 0);
  // Until the undisclosed remainder is safe, return to it the candidate that leaves the fewest small
  // figures (the first in size and code order on a tie). One always clears at least one (see above).
  for (let left = smallFigures(rest, restHouseholds, t); shown.length && left; left = smallFigures(rest, restHouseholds, t)) {
    let back = shown[0]!;
    let fewest = left;
    for (const b of shown) {
      const after = smallFigures(add(rest, b.counts), restHouseholds + b.households, t);
      if (after < fewest) [back, fewest] = [b, after];
    }
    shown = shown.filter((b) => b !== back);
    rest = add(rest, back.counts);
    restHouseholds += back.households;
  }
  return {
    shown: true,
    total,
    options: options.map((o, i) => ({ ...o, count: site[i]! })),
    blocks: shown
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((b) => ({ code: b.code, total: b.total, options: options.map((o, i) => ({ id: o.id, count: b.counts[i]! })) })),
  };
}
