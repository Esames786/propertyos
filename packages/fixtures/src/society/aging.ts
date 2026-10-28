import type { AgingBucketKey } from '@repo/contracts';
import type { OpenLine } from './allocate';

/**
 * Aging (COL-005): what is still open, by how long past its due date it is. Unapplied credit is
 * never netted into a bucket; it is reported beside them.
 */

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function bucketOf(dueOn: string, today: string): AgingBucketKey {
  const late = days(dueOn, today);
  if (late <= 0) return 'current';
  if (late <= 30) return 'd1_30';
  if (late <= 60) return 'd31_60';
  if (late <= 90) return 'd61_90';
  return 'd90_plus';
}

export type Buckets = Record<AgingBucketKey, bigint>;

export const emptyBuckets = (): Buckets => ({ current: 0n, d1_30: 0n, d31_60: 0n, d61_90: 0n, d90_plus: 0n });

/** Open amounts per billing account and bucket. */
export function agingByAccount(lines: readonly OpenLine[], today: string): Map<string, Buckets> {
  const out = new Map<string, Buckets>();
  for (const l of lines) {
    if (l.open <= 0n) continue;
    const b = out.get(l.billingAccountId) ?? emptyBuckets();
    b[bucketOf(l.dueOn, today)] += l.open;
    out.set(l.billingAccountId, b);
  }
  return out;
}
