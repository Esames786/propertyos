import type { PollOption, PollResults } from '@repo/contracts';
import { DEFAULT_THRESHOLD, residentCount, type Threshold } from '../operations/privacy';

/**
 * D-47 for poll results residents see (CMTY-002, PORTAL-039). Results exist only after the poll
 * closes (no running tally) and are frozen when the office publishes them. The whole audience is
 * shown only when at least `minCount` answered and the eligible audience has at least `minAudience`
 * households; a block is shown only when it qualifies on its own and the rest of the audience
 * ("site − block", and the hidden blocks together) qualifies too, so two shown numbers can never be
 * subtracted to point at a few households. The same rule as D.2's affected counts (privacy.ts),
 * applied to the number of answers. Pure and vector-tested (polls.vectors.json).
 */
export function pollResults(
  tally: Readonly<Record<string, Readonly<Record<string, number>>>>,
  options: readonly PollOption[],
  audience: { site: number; blocks: Readonly<Record<string, number>> },
  t: Threshold = DEFAULT_THRESHOLD,
): PollResults {
  const blockTotals = Object.fromEntries(Object.entries(tally).map(([code, byOption]) => [code, Object.values(byOption).reduce((n, x) => n + x, 0)]));
  const total = Object.values(blockTotals).reduce((n, x) => n + x, 0);
  const count = residentCount({ at: '', site: total, blocks: blockTotals }, { site: audience.site, blocks: { ...audience.blocks } }, { kind: 'site' }, t);
  if (!count.shown) return { shown: false, reason: count.reason };
  const of = (code: string, id: string) => tally[code]?.[id] ?? 0;
  return {
    shown: true,
    total,
    options: options.map((o) => ({ ...o, count: Object.keys(tally).reduce((n, code) => n + of(code, o.id), 0) })),
    blocks: count.blocks.map((b) => ({ code: b.code, total: b.count, options: options.map((o) => ({ id: o.id, count: of(b.code, o.id) })) })),
  };
}
