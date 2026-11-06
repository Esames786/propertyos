import { generateVisits } from './crm-data';
import type { TenantDataset } from './dataset-types';
import { FLOORS, GARDEN_BLOCKS, PROJECTS, TOWERS, UNITS } from './inventory';
import { alnoorRegisterPeople, registerLinks } from './identity/register-people';
import { ALNOOR_RESIDENTS, AL_NOOR, PARTIES, RIVERBEND, SHALIMAR, TENANT } from './people';
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
    // Gate D.1: everyone else on the register, for residents who join by invitation. A link is
    // verified only when the register is (two tenants' agreements are not on file yet).
    ...alnoorRegisterPeople()
      .filter((p) => !ALNOOR_RESIDENTS.some((r) => r.partyId === p.partyId))
      .flatMap(registerLinks),
  ],
  refs: { party: 'ANR-P-', lead: 'ANR-LD-', city: 'Lahore' },
  society: { siteId: 'site_alnoor', legalEntityId: 'le_alnoor' },
};

/**
 * Gate S.3: Riverbend Estate Managers (Demo). Its lettings live in the rentals state (rentals/state.ts);
 * here are only the verified links of its fictional landlords and lessee. Tahira Rehman is linked to
 * a flat at each rentals site, a plot at Riverbend Villas (no rentals licence) and a flat she sold on
 * 30 June 2026 (that link has ended). Kashif Mirza signs for Mirza Family Properties (Demo): one verified
 * link, and a claim to a second flat that nobody has verified. Adeel Shah rents a flat; he is no landlord.
 */
const rbLink = (partyId: string, unit: string, siteId: string, verified: boolean, from: string, to?: string) => ({
  partyId, unitId: `unt_rb_${unit}`, billingAccountId: `ba_rb_${unit}`, siteId, legalEntityId: 'le_riverbend', verified, from, ...(to ? { to } : {}),
});

const RIVERBEND_DATA: TenantDataset = {
  tenantId: RIVERBEND.id,
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
    rbLink('pty_rb_0001', 'h1204', 'site_rb_heights', true, '2024-01-10'),
    rbLink('pty_rb_0001', 'c07', 'site_rb_court', true, '2023-05-01'),
    rbLink('pty_rb_0001', 'v14', 'site_rb_villas', true, '2022-08-01'),
    rbLink('pty_rb_0001', 'c03', 'site_rb_court', true, '2021-03-01', '2026-07-01'),
    rbLink('pty_rb_0002', 'c11', 'site_rb_court', true, '2025-11-01'),
    rbLink('pty_rb_0002', 'c12', 'site_rb_court', false, '2026-10-20'),
    rbLink('pty_rb_0010', 'h1204', 'site_rb_heights', true, '2026-03-01'),
  ],
  refs: { party: 'RB-P-', lead: 'RB-LD-', city: 'Islamabad' },
};

const DATASETS: ReadonlyMap<string, TenantDataset> = new Map([LARKSPUR, CRESCENT, CEDAR, SHALIMAR_DATA, ALNOOR_DATA, RIVERBEND_DATA].map((d) => [d.tenantId, d]));

/** The tenant's own records; undefined for a tenant with no records in the demo (fail closed). */
export const datasetFor = (tenantId: string | undefined): TenantDataset | undefined => (tenantId ? DATASETS.get(tenantId) : undefined);
