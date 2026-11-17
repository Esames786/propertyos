import { UNIT_STATUSES, type InventoryBucket, type UnitStatus } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../../dashboard';
import { datasetFor, LARKSPUR } from '../../datasets';
import { invSession } from './inv-test-kit';
import { activeHolds, bucketOf, countBuckets, dashboardParity, dimensionsOf, holdActive, holdUntil, legacyOf, mayRelease, releasableBy, type HoldRecord } from './rules';
import vectors from './inventory.vectors.json';
import type { UnitMatrix, AvailabilitySnapshot } from '@repo/contracts';

/** Gate E.2 golden vectors: dimension derivation, buckets, hold expiry and release, seed totals and dashboard parity. */
describe('inventory.vectors.json', () => {
  it('every legacy status derives its three dimensions and back exactly (E-10)', () => {
    expect(vectors.dimensions.map((v) => v.legacy).sort()).toEqual([...UNIT_STATUSES].sort());
    for (const v of vectors.dimensions) {
      const d = dimensionsOf(v.legacy as UnitStatus);
      expect(d, v.legacy).toEqual({ inventory: v.inventory, delivery: v.delivery, occupancy: v.occupancy });
      expect(legacyOf(d), v.legacy).toBe(v.legacy);
      expect(bucketOf(d, false), v.legacy).toBe(v.bucket);
      expect(bucketOf(d, true), v.legacy).toBe(v.bucketWithLiveHold);
    }
  });

  it('a hold is active strictly before its expiry; an unreadable expiry is no hold; 48 hours from placing', () => {
    for (const v of vectors.holdActive) {
      const hold: HoldRecord = { leadId: 'led_x', leadRef: 'LD-X', until: v.until, principalId: 'usr_x' };
      expect(holdActive(hold, Date.parse(v.now)), v.case).toBe(v.active);
      expect(Object.keys(activeHolds({ unt_x: hold }, Date.parse(v.now))).length, v.case).toBe(v.active ? 1 : 0);
    }
    for (const v of vectors.holdUntil) expect(holdUntil(Date.parse(v.now))).toBe(v.until);
  });

  it('only the initiator releases a hold in force; legacy and expired holds are released by nobody', () => {
    for (const v of vectors.release) {
      const hold: HoldRecord = { leadId: 'led_x', leadRef: 'LD-X', until: v.until, ...(v.principal !== null ? { principalId: v.principal } : {}) };
      expect(mayRelease(hold, v.caller ?? undefined, Date.parse(v.now)), v.case).toBe(v.allowed);
      if (v.case.startsWith('legacy')) expect(releasableBy(hold, v.caller ?? undefined)).toBe(false);
    }
  });

  it('seed totals per project are as frozen, and equal the dashboard’s inventory buckets (no session holds)', () => {
    for (const d of [LARKSPUR, datasetFor('tnt_crescent')!]) {
      const dash = buildDashboard({ data: d, can: () => true, allowsProject: () => true, inventoryOn: () => true, constructionOn: () => true, range: undefined });
      for (const p of d.projects) {
        const units = d.units.filter((u) => u.projectId === p.id);
        const mine = { ...countBuckets(units.map((u) => bucketOf(dimensionsOf(u.status), false))), total: units.length };
        expect(mine, p.id).toEqual((vectors.seedTotals as Record<string, unknown>)[p.id]);
        const rows = (dash.inventory ?? []).filter((r) => r.projectId === p.id);
        const sum = rows.reduce((acc, r) => ({ available: acc.available + r.counts.available, onHold: acc.onHold + r.counts.onHold, sold: acc.sold + r.counts.sold, handedOver: acc.handedOver + r.counts.handedOver, other: acc.other + r.other }), { available: 0, onHold: 0, sold: 0, handedOver: 0, other: 0 } as Record<InventoryBucket, number> & { other: number });
        expect(dashboardParity(sum), p.id).toEqual({ available: mine.available, heldOrReserved: mine.held + mine.reserved, booked: mine.booked, unavailable: mine.unavailable });
      }
    }
  });

  it('live availability equals the units plus the holds in force: a hold moves one unit from available to held, its expiry moves it back', async () => {
    const api = invSession();
    api.as('sales');
    const before = await api.get<AvailabilitySnapshot>('/inventory/availability');
    expect(before.counts).toEqual({ available: 167, held: 25, reserved: 23, booked: 113, unavailable: 8 });
    const m = await api.get<UnitMatrix>('/inventory/matrix', { project: 'prj_heights', bucket: 'available' });
    const unit = m.groups.flatMap((g) => g.floors!.flatMap((f) => f.cells)).find((c) => c.match)!;
    const lead = LARKSPUR.leads.find((l) => l.projectId === 'prj_heights' && l.status === 'new')!;
    await api.post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id });
    const held = await api.get<AvailabilitySnapshot>('/inventory/availability');
    expect(held.counts).toEqual({ ...before.counts, available: 166, held: 26 });
    // The stored hold lapses (its expiry moved into the past): counted as available again.
    (api.holds()[unit.id] as HoldRecord).until = new Date(Date.now() - 1).toISOString();
    const lapsed = await api.get<AvailabilitySnapshot>('/inventory/availability');
    expect(lapsed.counts).toEqual(before.counts);
    expect(lapsed.lapsed.map((x) => x.unitId)).toEqual([unit.id]);
  });
});
