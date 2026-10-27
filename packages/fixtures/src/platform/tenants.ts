import {
  pkr,
  type ContractApproval,
  type ContractDraft,
  type EditionKey,
  type LicensedSite,
  type ModuleSelection,
  type Persona,
  type PlatformAuditEvent,
  type SubscriptionContract,
  type TenantDetail,
  type TenantOrganisation,
  type TenantStatus,
  type TenantType,
  type WorkspaceRequest,
} from '@repo/contracts';
import { directoryTenant } from '../tenant-directory';
import { addDays, defaultContract } from './contracts';
import { contractDiff, TODAY } from './config';
import { priceContract, type Quantities } from './pricing';

/**
 * Platform HQ fixtures. Every tenant, person and organisation is FICTIONAL and labelled "(Demo)";
 * phones use the unallocated +92 399 range and e-mails use example.com. The platform plane holds
 * licensing and commercial data only: no tenant residents, payments or ledgers live here.
 */

export const PLATFORM_ID = 'platform';

const ALL_PLATFORM = [
  'platform.dashboard.view', 'platform.tenants.view', 'platform.tenants.create', 'platform.tenants.lifecycle',
  'platform.catalog.view', 'platform.grants.manage', 'platform.pricing.view', 'platform.pricing.simulate',
  'platform.contracts.manage', 'platform.contracts.approve', 'platform.usage.view', 'platform.preview.use',
  'platform.audit.view', 'platform.requests.manage', 'platform.config.manage',
] as const;

export const PLATFORM_PERSONAS: readonly Persona[] = [
  {
    id: 'supreme_admin',
    tenantId: PLATFORM_ID,
    principalId: 'usr_hq_0001',
    app: 'platform',
    displayName: 'Hamza Qureshi',
    roleKey: 'platform:personas.supremeAdmin',
    email: 'hamza.qureshi@example.com',
    permissions: ALL_PLATFORM,
    projectScope: 'all',
  },
  {
    id: 'commercial_approver',
    tenantId: PLATFORM_ID,
    principalId: 'usr_hq_0002',
    app: 'platform',
    displayName: 'Ayesha Siddiqui',
    roleKey: 'platform:personas.commercialApprover',
    email: 'ayesha.siddiqui@example.com',
    permissions: ['platform.dashboard.view', 'platform.tenants.view', 'platform.catalog.view', 'platform.pricing.view', 'platform.pricing.simulate', 'platform.contracts.approve', 'platform.usage.view', 'platform.audit.view'],
    projectScope: 'all',
  },
  {
    id: 'platform_support',
    tenantId: PLATFORM_ID,
    principalId: 'usr_hq_0003',
    app: 'platform',
    displayName: 'Iqra Rana',
    roleKey: 'platform:personas.support',
    email: 'iqra.rana@example.com',
    permissions: ['platform.dashboard.view', 'platform.tenants.view', 'platform.catalog.view', 'platform.usage.view', 'platform.audit.view'],
    projectScope: 'all',
  },
];

export const findPlatformPersona = (id: string | null) => PLATFORM_PERSONAS.find((p) => p.id === id);

/** The platform operator (fictional) for headers and the demo sign-in card. */
export const PLATFORM_OPERATOR = { id: PLATFORM_ID, name: 'PropertyOS Platform (Demo)' } as const;

// ---------------------------------------------------------------- seeded tenants

const org = (displayName: string, legalName: string, city: string, contactName: string, n: number): TenantOrganisation => ({
  displayName,
  legalName,
  city,
  timezone: 'Asia/Karachi',
  currency: 'PKR',
  language: 'en-PK',
  contactName,
  contactEmail: `${contactName.split(' ')[0]!.toLowerCase()}@example.com`,
  contactPhone: `+92399${String(4100000 + n * 7351).padStart(7, '0')}`,
});

/** Licensing facts (name, sites, modules, status) come from the shared tenant directory. */
const fromDirectory = (id: string, n: number) => {
  const d = directoryTenant(id)!;
  return { id: d.id, edition: d.edition, status: d.status, type: d.type, organisation: org(d.name, d.legalName, d.city, d.contactName, n), sites: [...d.sites], modules: [...d.modules] };
};

interface Seed {
  id: string;
  edition: EditionKey;
  type: TenantType;
  status: TenantStatus;
  billingStatus: TenantDetail['billingStatus'];
  organisation: TenantOrganisation;
  sites: LicensedSite[];
  modules: ModuleSelection[];
  contract: ContractDraft;
  quantities: Quantities;
  createdAt: string;
  activatedAt?: string;
  origin: TenantDetail['origin'];
  contractStatus?: SubscriptionContract['status'];
  trialEndsOn?: string;
}

function build(seed: Seed): TenantDetail {
  const quote = priceContract({ contract: seed.contract, quantities: seed.quantities, quantitySource: 'snapshot', edition: seed.edition });
  const contractStatus = seed.contractStatus ?? 'active';
  const contract: SubscriptionContract = {
    ...seed.contract,
    id: `ctr_${seed.id.replace(/^tnt_/, '')}_1`,
    tenantId: seed.id,
    version: 1,
    status: contractStatus,
    createdBy: 'Hamza Qureshi',
    createdById: 'usr_hq_0001',
    createdAt: seed.createdAt,
    ...(seed.activatedAt ? { activatedAt: seed.activatedAt } : {}),
  };
  const paying = seed.status === 'active' || seed.status === 'grace';
  return {
    id: seed.id,
    displayName: seed.organisation.displayName,
    legalName: seed.organisation.legalName,
    type: seed.type,
    edition: seed.edition,
    status: seed.status,
    contractStatus,
    billingStatus: seed.billingStatus,
    city: seed.organisation.city,
    siteCount: seed.sites.length,
    units: { declared: seed.sites.reduce((s, x) => s + x.declaredUnits, 0), eligible: seed.quantities['units.eligible'] ?? null },
    // Modules in force today (a scheduled grant is listed in the grants, not here).
    modules: seed.modules.filter((m) => !m.from || m.from <= TODAY).map((m) => m.module),
    mrr: paying ? quote.regularPeriod.net : pkr('0.00'),
    createdAt: seed.createdAt,
    ...(seed.trialEndsOn ? { trialEndsOn: seed.trialEndsOn } : {}),
    origin: seed.origin,
    organisation: seed.organisation,
    sites: seed.sites,
    grants: seed.modules,
    contract,
    quote,
    approval: null,
    audit: [],
  };
}

/** Larkspur's first contract (1 March 2026), before online payments were added. */
const larkspurV1Contract = defaultContract('developer', { start: '2026-03-01' });

const larkspur = (() => {
  const t = build({
    ...fromDirectory('tnt_larkspur', 1),
    billingStatus: 'current',
    contract: (() => {
      const c = structuredClone(larkspurV1Contract);
      c.components.push({ id: 'cmp_mod_online_payments', type: 'PER_MODULE', rateCardLineId: 'rc_mod_online_payments', module: 'online_payments', siteIds: ['site_lk_heights'], unitPrice: pkr('1500.00'), cadence: 'monthly', proration: 'actual_days', effectiveFrom: '2026-04-01' });
      return c;
    })(),
    quantities: { 'seats.staff_active': 14, 'sites.licensed': 2, 'units.registered': 496, 'units.eligible': 496 },
    createdAt: '2026-02-18T10:20:00Z',
    activatedAt: '2026-03-01T05:00:00Z',
    origin: 'sales',
  });
  // Version 2 (amendment from 1 April 2026) is the contract in force.
  t.contract = { ...t.contract!, id: 'ctr_larkspur_2', version: 2, supersedesId: 'ctr_larkspur_1', effectiveFrom: '2026-04-01', createdAt: '2026-03-20T08:30:00Z', activatedAt: '2026-04-01T05:00:00Z' };
  return t;
})();

const mapleCourt = build({
  ...fromDirectory('tnt_maple', 2),
  billingStatus: 'none',
  contract: defaultContract('community', { start: '2026-10-13', trial: true }),
  quantities: { 'units.eligible': 40, 'sites.licensed': 1 },
  createdAt: '2026-10-13T08:05:00Z',
  activatedAt: '2026-10-13T08:05:00Z',
  origin: 'self_service',
  trialEndsOn: addDays('2026-10-13', 30),
});

const riverbend = build({
  ...fromDirectory('tnt_riverbend', 3),
  billingStatus: 'overdue',
  contract: defaultContract('portfolio', { start: '2026-05-01' }),
  quantities: { 'units.eligible': 232, 'sites.licensed': 3, 'buildings.active': 5 },
  createdAt: '2026-04-22T11:40:00Z',
  activatedAt: '2026-05-01T05:00:00Z',
  origin: 'sales',
});

const cedarHills = build({
  ...fromDirectory('tnt_cedar', 4),
  billingStatus: 'overdue',
  contract: (() => {
    const c = defaultContract('community', { start: '2026-02-01' });
    c.components = c.components.filter((x) => x.type !== 'ONE_TIME');
    return c;
  })(),
  quantities: { 'units.eligible': 60, 'sites.licensed': 1 },
  createdAt: '2026-01-25T09:00:00Z',
  activatedAt: '2026-02-01T05:00:00Z',
  origin: 'hq',
});

const kestrelContract = (() => {
  const c = defaultContract('community', { start: '2026-11-01' });
  c.discounts.push({ id: 'dsc_intro', target: 'recurring', kind: 'percent', value: '20', from: '2026-11-01', to: '2027-05-01', reason: 'Six-month introductory offer' });
  return c;
})();

const kestrel = build({
  ...fromDirectory('tnt_kestrel', 5),
  billingStatus: 'none',
  contract: kestrelContract,
  quantities: { 'units.eligible': 96, 'sites.licensed': 1 },
  createdAt: '2026-10-24T13:15:00Z',
  origin: 'request',
  contractStatus: 'pending_approval',
});

export const SEED_APPROVALS: ContractApproval[] = [
  {
    id: 'apr_kestrel_1',
    tenantId: kestrel.id,
    contractId: kestrel.contract!.id,
    contractVersion: 1,
    reasons: kestrel.quote!.approval.reasons,
    requestedBy: 'Omar Sheikh',
    requestedById: 'usr_hq_0004',
    requestedAt: '2026-10-24T13:20:00Z',
    status: 'pending',
  },
];
kestrel.approval = SEED_APPROVALS[0]!;

/** Maintenance-only client: core + maintenance, community rate card without onboarding (64 × 40 + 500). */
const shalimar = build({
  ...fromDirectory('tnt_shalimar', 6),
  billingStatus: 'current',
  contract: (() => {
    const c = defaultContract('community', { start: '2026-08-01' });
    c.components = c.components.filter((x) => x.type !== 'ONE_TIME');
    return c;
  })(),
  quantities: { 'units.eligible': 64, 'sites.licensed': 1 },
  createdAt: '2026-07-24T10:00:00Z',
  activatedAt: '2026-08-01T05:00:00Z',
  origin: 'sales',
});

/**
 * Two-site developer on a trial with a per-site licence (CP2 security correction 2): inventory,
 * construction and handover for Crescent Bay Towers, maintenance only for Crescent Bay Plaza.
 */
const crescentBay = build({
  ...fromDirectory('tnt_crescent', 7),
  billingStatus: 'none',
  contract: defaultContract('developer', { start: '2026-10-15', trial: true }),
  quantities: { 'seats.staff_active': 6, 'sites.licensed': 2, 'units.registered': 66, 'units.eligible': 66 },
  createdAt: '2026-10-14T09:30:00Z',
  activatedAt: '2026-10-15T05:00:00Z',
  origin: 'sales',
  trialEndsOn: addDays('2026-10-15', 30),
});

export const SEED_TENANTS: readonly TenantDetail[] = [larkspur, mapleCourt, riverbend, cedarHills, kestrel, shalimar, crescentBay];

// ---------------------------------------------------------------- contract history (amendments, HQ-011)

/** One version of a tenant's contract and the grants it licenses. */
export interface ContractRecord {
  contract: SubscriptionContract;
  modules: ModuleSelection[];
  reason?: string;
  changes: NonNullable<PlatformAuditEvent['changes']>;
}

const larkspurV1: ContractRecord = {
  contract: { ...larkspurV1Contract, id: 'ctr_larkspur_1', tenantId: larkspur.id, version: 1, status: 'superseded', createdBy: 'Hamza Qureshi', createdById: 'usr_hq_0001', createdAt: '2026-02-18T10:20:00Z', activatedAt: '2026-03-01T05:00:00Z', effectiveFrom: '2026-03-01' },
  modules: larkspur.grants.filter((g) => g.module !== 'online_payments'),
  changes: [],
};
const larkspurV2: ContractRecord = {
  contract: larkspur.contract!,
  modules: larkspur.grants,
  reason: 'Online payments for Larkspur Heights residents.',
  changes: contractDiff(larkspurV1, { contract: larkspur.contract!, modules: larkspur.grants }),
};

const { activatedAt: _never, ...shalimarBase } = shalimar.contract!;
const shalimarV1: ContractRecord = { contract: shalimar.contract!, modules: shalimar.grants.filter((g) => !g.from), changes: [] };
const shalimarV2Contract: SubscriptionContract = { ...structuredClone(shalimarBase), id: 'ctr_shalimar_2', version: 2, status: 'scheduled', supersedesId: shalimar.contract!.id, effectiveFrom: '2026-11-01', createdAt: '2026-10-22T09:15:00Z' };
const shalimarV2: ContractRecord = {
  contract: shalimarV2Contract,
  modules: shalimar.grants,
  reason: 'The committee adds a resident roster and gate passes from November. No price change.',
  changes: contractDiff(shalimarV1, { contract: shalimarV2Contract, modules: shalimar.grants }),
};

/** Every seeded contract version; tenants without amendments have their single version. */
export const SEED_CONTRACT_HISTORY: Readonly<Record<string, readonly ContractRecord[]>> = {
  ...Object.fromEntries(SEED_TENANTS.filter((t) => t.contract).map((t) => [t.id, [{ contract: t.contract!, modules: t.grants, changes: [] }]])),
  [larkspur.id]: [larkspurV1, larkspurV2],
  [shalimar.id]: [shalimarV1, shalimarV2],
};

export const SEED_REQUESTS: readonly WorkspaceRequest[] = [
  { id: 'req_sunfield', kind: 'approval', organisation: 'Sunfield Apartments Association (Demo)', contactName: 'Mehwish Akhtar', edition: 'community', expectedUnits: 48, city: 'Faisalabad', receivedAt: '2026-10-25T16:40:00Z', status: 'new' },
  { id: 'req_northgate', kind: 'sales', organisation: 'Northgate Builders (Demo)', contactName: 'Kamran Hashmi', edition: 'developer', expectedUnits: 420, city: 'Multan', receivedAt: '2026-10-24T09:10:00Z', status: 'new' },
  { id: 'req_oakfield', kind: 'trial', organisation: 'Oakfield Towers Owners (Demo)', contactName: 'Rabia Abbasi', edition: 'community', expectedUnits: 72, city: 'Sialkot', receivedAt: '2026-10-21T12:00:00Z', status: 'contacted' },
];

export const SEED_AUDIT: readonly PlatformAuditEvent[] = [
  { id: 'aud_7', at: '2026-10-25T16:41:00Z', actorName: 'System', actorId: 'system', action: 'requestReceived', params: { organisation: 'Sunfield Apartments Association (Demo)' } },
  { id: 'aud_6', at: '2026-10-24T13:20:00Z', actorName: 'Omar Sheikh', actorId: 'usr_hq_0004', action: 'approvalRequested', tenantId: kestrel.id, tenantName: kestrel.displayName, params: { reasons: '1' } },
  { id: 'aud_5b', at: '2026-10-22T09:15:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'amendmentScheduled', tenantId: shalimar.id, tenantName: shalimar.displayName, params: { version: '2', date: '2026-11-01' }, changes: shalimarV2.changes },
  { id: 'aud_5', at: '2026-10-20T07:00:00Z', actorName: 'System', actorId: 'system', action: 'graceStarted', tenantId: riverbend.id, tenantName: riverbend.displayName, params: {} },
  { id: 'aud_4b', at: '2026-10-15T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'trialStarted', tenantId: crescentBay.id, tenantName: crescentBay.displayName, params: { days: '30' } },
  { id: 'aud_4', at: '2026-10-13T08:05:00Z', actorName: 'Sana Raza', actorId: 'usr_hq_0005', action: 'trialStarted', tenantId: mapleCourt.id, tenantName: mapleCourt.displayName, params: { days: '30' } },
  { id: 'aud_3', at: '2026-09-30T07:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'tenantSuspended', tenantId: cedarHills.id, tenantName: cedarHills.displayName, params: {} },
  { id: 'aud_1b', at: '2026-08-01T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'contractActivated', tenantId: shalimar.id, tenantName: shalimar.displayName, params: { version: '1' } },
  { id: 'aud_2', at: '2026-05-01T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'contractActivated', tenantId: riverbend.id, tenantName: riverbend.displayName, params: { version: '1' } },
  { id: 'aud_1c', at: '2026-04-01T05:00:00Z', actorName: 'System', actorId: 'system', action: 'amendmentInForce', tenantId: larkspur.id, tenantName: larkspur.displayName, params: { version: '2' } },
  { id: 'aud_1b2', at: '2026-03-20T08:30:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'amendmentScheduled', tenantId: larkspur.id, tenantName: larkspur.displayName, params: { version: '2', date: '2026-04-01' }, changes: larkspurV2.changes },
  { id: 'aud_1', at: '2026-03-01T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'contractActivated', tenantId: larkspur.id, tenantName: larkspur.displayName, params: { version: '1' } },
];

/**
 * Illustrative platform revenue for the dashboard (platform finance itself is Gate G), consistent
 * with the seeded contracts: Larkspur 47,500 + Riverbend 12,280 (+15,000 onboarding in May) +
 * Shalimar Court 3,060 from August + Cedar Hills 2,900 until its suspension at the end of
 * September. Riverbend has not paid since September (grace); Cedar Hills owes August and September.
 */
export const SEED_REVENUE = [
  { month: '2026-05', invoiced: '77680.00', collected: '77680.00' },
  { month: '2026-06', invoiced: '62680.00', collected: '62680.00' },
  { month: '2026-07', invoiced: '62680.00', collected: '62680.00' },
  { month: '2026-08', invoiced: '65740.00', collected: '62840.00' },
  { month: '2026-09', invoiced: '65740.00', collected: '50560.00' },
  { month: '2026-10', invoiced: '62840.00', collected: '50560.00' },
] as const;

/** Unpaid platform invoices: Riverbend Sep + Oct (24,560) and Cedar Hills Aug + Sep (5,800). */
export const SEED_OUTSTANDING = '30360.00';
/** September MRR, before Cedar Hills was suspended. */
export const SEED_MRR_PREVIOUS = '65740.00';

export const SEED_USAGE = { smsThisMonth: 3840 } as const;
