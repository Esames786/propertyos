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
 * 3. Holds: Wave 1 integration (Issue #25). E.2 mirrored E.0's validated `crm-holds.ts` function for function
 *    while E.0 was not yet merged; that copy is gone. Every E.2 read and write now uses `crm-holds.ts` itself
 *    (one clock, one active-hold projection, owner-only release, legacy holds released by nobody) and the
 *    hold view the CRM uses (`holdViewFor`), on the one hold store the CRM writes.
 */

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
