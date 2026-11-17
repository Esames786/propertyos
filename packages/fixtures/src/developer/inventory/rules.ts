import type { AvailabilityBucket, BucketCounts, UnitDeliveryState, InventoryBucket, UnitDimensions, UnitStatus } from '@repo/contracts';
import { AVAILABILITY_BUCKETS } from '@repo/contracts';

/**
 * Gate E.2 pure rules (provisional; replace with E.0's developer state at Wave 1 integration).
 *
 * 1. Unit dimensions (A2 §4.2, decision E-10). Until E.0's developer state stores the three dimensions,
 *    they are derived from the demo seed's 12-value `UnitStatus`, and the legacy status is derived back
 *    from them: the round trip is exact for every seeded unit (inventory.vectors.json), so the Stage 1.5
 *    screens and the dashboard keep reading the same status.
 * 2. Availability buckets (INV-008), which map exactly onto the dashboard's `InventoryRow` buckets.
 * 3. The active-hold rule of Issues #22/#23, mirrored function for function from E.0's validated
 *    `packages/fixtures/src/crm-holds.ts` (Agent A, local commit 3bc31cb, read only, not merged), so the
 *    swap at integration is mechanical: `holdClock`, `holdActive`, `activeHolds`, `holdUntil`,
 *    `releasableBy`, `HOLD_DURATION_MS` have the same names, signatures and meaning.
 *    - One clock: `holdClock()` (the browser clock that also writes the expiry), read once per request.
 *    - One projection: an expired hold is not held, on every read and write; reading never deletes it.
 *    - Ownership: only the initiating principal releases; a legacy hold without one is released by nobody.
 *    REPLACE WITH E.0's `crm-holds.ts` AT INTEGRATION.
 */

/** Illustrative hold length, unchanged since Stage 1.5R (E-11 keeps it until the owner sets a policy). */
export const HOLD_DURATION_MS = 48 * 3_600_000;

/** The single clock of unit holds (milliseconds since the epoch). */
export const holdClock = (): number => Date.now();

export interface HoldRecord {
  leadId: string;
  leadRef: string;
  until: string;
  /** The principal who placed the hold (Issue #23); legacy holds without one can never be released. */
  principalId?: string;
}

/** Active at `now`: a parseable expiry strictly after `now` (an unreadable expiry is not a hold). */
export function holdActive(hold: HoldRecord | undefined, now: number): hold is HoldRecord {
  if (!hold) return false;
  const until = Date.parse(hold.until);
  return Number.isFinite(until) && now < until;
}

/** The holds in force at `now`, unit id → hold. The stored map is never changed. */
export function activeHolds(all: Readonly<Record<string, HoldRecord>>, now: number): Record<string, HoldRecord> {
  return Object.fromEntries(Object.entries(all).filter(([, h]) => holdActive(h, now)));
}

/** Holds whose time ran out at `now` (history only: they no longer count as held). */
export function lapsedHolds(all: Readonly<Record<string, HoldRecord>>, now: number): Record<string, HoldRecord> {
  return Object.fromEntries(Object.entries(all).filter(([, h]) => !holdActive(h, now)));
}

/** The expiry of a hold placed at `now`. */
export const holdUntil = (now: number): string => new Date(now + HOLD_DURATION_MS).toISOString();

/** Only the initiating principal; a legacy hold without a recorded principal is released by nobody. */
export function releasableBy(hold: HoldRecord, principalId: string | undefined): boolean {
  return typeof hold.principalId === 'string' && hold.principalId.length > 0 && hold.principalId === principalId;
}

/**
 * Release is owner-only (Issue #23): a hold in force at `now`, released by its initiator. A different
 * principal, an expired or unknown hold and a legacy hold are refused alike (one non-disclosing 404).
 */
export function mayRelease(hold: HoldRecord | undefined, principalId: string | undefined, now: number): boolean {
  return holdActive(hold, now) && releasableBy(hold, principalId);
}
const PRE_HANDOVER: UnitDeliveryState = 'under_construction';

/** E-10 derivation from the seeded legacy status (pre-handover stock is under construction, draft stock is planned). */
const DIMENSIONS: Record<UnitStatus, UnitDimensions> = {
  draft: { inventory: 'draft', delivery: 'planned', occupancy: 'vacant' },
  available: { inventory: 'available', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  held: { inventory: 'held', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  reserved: { inventory: 'reserved', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  booked: { inventory: 'booked', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  allocated: { inventory: 'allocated', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  handover_ready: { inventory: 'allocated', delivery: 'handover_ready', occupancy: 'vacant' },
  handed_over: { inventory: 'allocated', delivery: 'handed_over', occupancy: 'vacant' },
  // No occupancy record exists for developer units (E-24): occupied, kind not recorded.
  occupied: { inventory: 'allocated', delivery: 'handed_over', occupancy: 'occupied_unrecorded' },
  blocked: { inventory: 'blocked', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  disputed: { inventory: 'disputed', delivery: PRE_HANDOVER, occupancy: 'vacant' },
  withdrawn: { inventory: 'withdrawn', delivery: PRE_HANDOVER, occupancy: 'vacant' },
};

export const dimensionsOf = (status: UnitStatus): UnitDimensions => ({ ...DIMENSIONS[status] });

/** The legacy 12-value status derived from the dimensions (E-10: Stage 1.5 screens keep reading it). */
export function legacyOf(d: UnitDimensions): UnitStatus {
  if (d.delivery === 'handed_over') return d.occupancy === 'vacant' ? 'handed_over' : 'occupied';
  if (d.delivery === 'handover_ready') return 'handover_ready';
  return d.inventory;
}

/** A unit's live availability: a hold in force turns available stock into held stock. */
export function bucketOf(d: UnitDimensions, heldLive: boolean): AvailabilityBucket {
  switch (d.inventory) {
    case 'available':
      return heldLive ? 'held' : 'available';
    case 'held':
      return 'held';
    case 'reserved':
      return 'reserved';
    case 'booked':
    case 'allocated':
      return 'booked';
    default:
      return 'unavailable';
  }
}

/** Sold stock storage may be allocated to (an active booking stands in until E.5 brings booking records). */
export const isSold = (d: UnitDimensions): boolean => d.inventory === 'booked' || d.inventory === 'allocated';

export const emptyBuckets = (): BucketCounts => Object.fromEntries(AVAILABILITY_BUCKETS.map((b) => [b, 0])) as BucketCounts;

export function countBuckets(buckets: Iterable<AvailabilityBucket>): BucketCounts {
  const counts = emptyBuckets();
  for (const b of buckets) counts[b] += 1;
  return counts;
}

export function addBuckets(a: BucketCounts, b: BucketCounts): BucketCounts {
  const out = emptyBuckets();
  for (const k of AVAILABILITY_BUCKETS) out[k] = a[k] + b[k];
  return out;
}

/**
 * The dashboard's buckets (`InventoryRow.counts` + `other`) expressed in availability buckets, for the
 * parity vectors: available = available; onHold = held + reserved; sold + handedOver = booked;
 * other = unavailable. Holds placed in the demo session are not in the dashboard's seed figures.
 */
export function dashboardParity(counts: Record<InventoryBucket, number> & { other: number }): { available: number; heldOrReserved: number; booked: number; unavailable: number } {
  return { available: counts.available, heldOrReserved: counts.onHold, booked: counts.sold + counts.handedOver, unavailable: counts.other };
}

/**
 * One clock reading per request (E.0's rule: the expiry check of a request uses one instant): the first
 * read of a request is kept for that request's other checks.
 */
const REQUEST_NOW = new WeakMap<object, number>();
export function requestNow(req: object): number {
  let now = REQUEST_NOW.get(req);
  if (now === undefined) REQUEST_NOW.set(req, (now = holdClock()));
  return now;
}
