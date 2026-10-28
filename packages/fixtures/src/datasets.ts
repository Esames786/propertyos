import { generateVisits } from './crm-data';
import type { TenantDataset } from './dataset-types';
import { FLOORS, GARDEN_BLOCKS, PROJECTS, TOWERS, UNITS } from './inventory';
import { AL_NOOR, PARTIES, SHALIMAR, TENANT } from './people';
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

/**
 * Verified links of Al-Noor's resident identities: the flats they are associated with and the account
 * those flats are billed to. Rabia Hashmi owns A-201 and A-202 on one account; Junaid Akhtar rents
 * A-202 and pays for it alone, so within that account each sees only their own liability.
 */
const anrLink = (partyId: string, flat: string, account: string, from: string) => ({
  partyId,
  unitId: `unt_anr_${flat.replace('-', '').toLowerCase()}`,
  billingAccountId: `ba_anr_${account.replace('-', '').toLowerCase()}`,
  siteId: 'site_alnoor',
  legalEntityId: 'le_alnoor',
  verified: true,
  from,
});

/** Al-Noor Residency (Demo): no projects, no developer records (I-2); the society model holds the rest. */
const ALNOOR_DATA: TenantDataset = {
  tenantId: AL_NOOR.id,
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
  partyLinks: [
    anrLink('pty_anr_0001', 'A-101', 'A101', '2017-04-01'),
    anrLink('pty_anr_0003', 'A-102', 'A102', '2026-03-01'),
    anrLink('pty_anr_0010', 'A-201', 'A201', '2018-09-01'),
    anrLink('pty_anr_0010', 'A-202', 'A201', '2020-02-01'),
    anrLink('pty_anr_0011', 'A-202', 'A201', '2025-08-01'),
  ],
  refs: { party: 'ANR-P-', lead: 'ANR-LD-', city: 'Lahore' },
  society: { siteId: 'site_alnoor', legalEntityId: 'le_alnoor' },
};

const DATASETS: ReadonlyMap<string, TenantDataset> = new Map([LARKSPUR, CRESCENT, CEDAR, SHALIMAR_DATA, ALNOOR_DATA].map((d) => [d.tenantId, d]));

/** The tenant's own records; undefined for a tenant with no records in the demo (fail closed). */
export const datasetFor = (tenantId: string | undefined): TenantDataset | undefined => (tenantId ? DATASETS.get(tenantId) : undefined);
