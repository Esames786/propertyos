import { generateVisits } from './crm-data';
import type { TenantDataset } from './dataset-types';
import { FLOORS, GARDEN_BLOCKS, PROJECTS, TOWERS, UNITS } from './inventory';
import { PARTIES, SHALIMAR, TENANT } from './people';
import { billingAccountOf, INVOICES, LEADS, NOTIFICATIONS } from './records';
import { CEDAR } from './tenants/cedar';
import { CRESCENT } from './tenants/crescent';

/** Larkspur Estates (Demo): the original developer demo, unchanged (same seeds, same ids). */
export const VISITS = generateVisits({ seed: 5150, leads: LEADS, units: UNITS, parties: PARTIES, projects: PROJECTS, count: 26, idPrefix: 'vst_' });

/**
 * Usman Tariq (the demo resident, party 1) is liable for the flat he bought in Larkspur Heights. His
 * earlier plot in Larkspur Gardens was transferred on 1 Apr 2026, so that liability has ended, and he
 * has claimed his brother's flat, which nobody has verified. Only the first link reaches records today.
 */
const RESIDENT_UNIT = INVOICES.find((i) => i.partyId === 'pty_0001')!.unitId;
const FORMER_PLOT = UNITS.find((u) => u.projectId === 'prj_gardens' && u.type === 'plot' && u.status === 'handed_over')!.id;
const CLAIMED_FLAT = UNITS.find((u) => u.projectId === 'prj_heights' && u.id !== RESIDENT_UNIT && u.status === 'occupied')!.id;
const link = (unitId: string, siteId: string, verified: boolean, from: string, to?: string) => ({
  partyId: 'pty_0001', unitId, billingAccountId: billingAccountOf(unitId), siteId, legalEntityId: 'le_larkspur', verified, from, ...(to ? { to } : {}),
});

export const LARKSPUR: TenantDataset = {
  tenantId: TENANT.id,
  projects: PROJECTS,
  towers: TOWERS,
  floors: FLOORS,
  blocks: GARDEN_BLOCKS.map((label, i) => ({ id: `blk_lg_p${i + 1}`, projectId: 'prj_gardens', label })),
  units: UNITS,
  parties: PARTIES,
  leads: LEADS,
  invoices: INVOICES,
  visits: VISITS,
  notifications: NOTIFICATIONS,
  partyLinks: [
    link(RESIDENT_UNIT, 'site_lk_heights', true, '2025-07-01'),
    link(FORMER_PLOT, 'site_lk_gardens', true, '2024-02-01', '2026-04-01'),
    link(CLAIMED_FLAT, 'site_lk_heights', false, '2026-10-20'),
  ],
  refs: { party: 'CUS-', lead: 'LD-2026-', city: 'Lahore' },
};

/** Shalimar Court Residents (Demo) runs maintenance only; it keeps no sales or billing records here. */
const SHALIMAR_DATA: TenantDataset = {
  tenantId: SHALIMAR.id,
  projects: [],
  towers: [],
  floors: [],
  blocks: [],
  units: [],
  parties: [],
  leads: [],
  invoices: [],
  visits: [],
  notifications: [],
  partyLinks: [],
  refs: { party: 'SHC-', lead: 'SH-LD-', city: 'Lahore' },
};

const DATASETS: ReadonlyMap<string, TenantDataset> = new Map([LARKSPUR, CRESCENT, CEDAR, SHALIMAR_DATA].map((d) => [d.tenantId, d]));

/** The tenant's own records; undefined for a tenant with no records in the demo (fail closed). */
export const datasetFor = (tenantId: string | undefined): TenantDataset | undefined => (tenantId ? DATASETS.get(tenantId) : undefined);
