import {
  pkr,
  type ContractApproval,
  type ContractDraft,
  type EditionKey,
  type LicensedSite,
  type ModuleKey,
  type ModuleSelection,
  type Persona,
  type PlatformAuditEvent,
  type SubscriptionContract,
  type TenantDetail,
  type TenantOrganisation,
  type TenantStatus,
  type WorkspaceRequest,
} from '@repo/contracts';
import { presetFor } from './catalog';
import { addDays, defaultContract } from './contracts';
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
  'platform.audit.view', 'platform.requests.manage',
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

const grants = (modules: readonly ModuleKey[], sites: ModuleSelection['sites'] = 'all'): ModuleSelection[] => modules.map((module) => ({ module, sites }));

interface Seed {
  id: string;
  edition: EditionKey;
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
    type: presetFor(seed.edition).tenantType,
    edition: seed.edition,
    status: seed.status,
    contractStatus,
    billingStatus: seed.billingStatus,
    city: seed.organisation.city,
    siteCount: seed.sites.length,
    units: { declared: seed.sites.reduce((s, x) => s + x.declaredUnits, 0), eligible: seed.quantities['units.eligible'] ?? null },
    modules: seed.modules.map((m) => m.module),
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

const developerModules = presetFor('developer').modules;
const communityModules = presetFor('community').modules;

const larkspur = build({
  id: 'tnt_larkspur',
  edition: 'developer',
  status: 'active',
  billingStatus: 'current',
  organisation: org('Larkspur Estates (Demo)', 'Larkspur Estates (Pvt) Ltd (Demo)', 'Lahore', 'Nadia Rahman', 1),
  sites: [
    { id: 'site_lk_heights', name: 'Larkspur Heights', city: 'Lahore', kind: 'residential', buildings: 3, declaredUnits: 336 },
    { id: 'site_lk_gardens', name: 'Larkspur Gardens', city: 'Islamabad', kind: 'plots', buildings: 0, declaredUnits: 160 },
  ],
  modules: [...grants(developerModules), { module: 'online_payments', sites: ['site_lk_heights'] }],
  contract: (() => {
    const c = defaultContract('developer', { start: '2026-03-01' });
    c.components.push({ id: 'cmp_mod_online_payments', type: 'PER_MODULE', rateCardLineId: 'rc_mod_online_payments', module: 'online_payments', siteIds: ['site_lk_heights'], unitPrice: pkr('1500.00'), cadence: 'monthly', proration: 'actual_days', effectiveFrom: '2026-03-01' });
    return c;
  })(),
  quantities: { 'seats.staff_active': 14, 'sites.licensed': 2, 'units.registered': 496, 'units.eligible': 496 },
  createdAt: '2026-02-18T10:20:00Z',
  activatedAt: '2026-03-01T05:00:00Z',
  origin: 'sales',
});

const mapleCourt = build({
  id: 'tnt_maple',
  edition: 'community',
  status: 'trial',
  billingStatus: 'none',
  organisation: org('Maple Court Society (Demo)', 'Maple Court Owners Association (Demo)', 'Karachi', 'Sana Raza', 2),
  sites: [{ id: 'site_maple', name: 'Maple Court', city: 'Karachi', kind: 'residential', buildings: 2, declaredUnits: 40 }],
  modules: grants(communityModules),
  contract: defaultContract('community', { start: '2026-10-13', trial: true }),
  quantities: { 'units.eligible': 40, 'sites.licensed': 1 },
  createdAt: '2026-10-13T08:05:00Z',
  activatedAt: '2026-10-13T08:05:00Z',
  origin: 'self_service',
  trialEndsOn: addDays('2026-10-13', 30),
});

const riverbend = build({
  id: 'tnt_riverbend',
  edition: 'portfolio',
  status: 'grace',
  billingStatus: 'overdue',
  organisation: org('Riverbend Estate Managers (Demo)', 'Riverbend Estate Managers (Pvt) Ltd (Demo)', 'Islamabad', 'Faisal Butt', 3),
  sites: [
    { id: 'site_rb_heights', name: 'Riverbend Heights', city: 'Islamabad', kind: 'residential', buildings: 3, declaredUnits: 120 },
    { id: 'site_rb_court', name: 'Riverbend Court', city: 'Rawalpindi', kind: 'residential', buildings: 2, declaredUnits: 64 },
    { id: 'site_rb_villas', name: 'Riverbend Villas', city: 'Islamabad', kind: 'plots', buildings: 0, declaredUnits: 48 },
  ],
  modules: grants(presetFor('portfolio').modules),
  contract: defaultContract('portfolio', { start: '2026-05-01' }),
  quantities: { 'units.eligible': 232, 'sites.licensed': 3, 'buildings.active': 5 },
  createdAt: '2026-04-22T11:40:00Z',
  activatedAt: '2026-05-01T05:00:00Z',
  origin: 'sales',
});

const cedarHills = build({
  id: 'tnt_cedar',
  edition: 'custom',
  status: 'suspended',
  billingStatus: 'overdue',
  organisation: org('Cedar Hills Co-operative (Demo)', 'Cedar Hills Housing Co-operative (Demo)', 'Peshawar', 'Haris Mirza', 4),
  sites: [{ id: 'site_cedar', name: 'Cedar Hills', city: 'Peshawar', kind: 'residential', buildings: 4, declaredUnits: 60 }],
  modules: grants(['core', 'receivables', 'dues', 'residents', 'resident_portal', 'maintenance', 'communications', 'reports'] as ModuleKey[]),
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
  id: 'tnt_kestrel',
  edition: 'community',
  status: 'draft',
  billingStatus: 'none',
  organisation: org('Kestrel Point Residences (Demo)', 'Kestrel Point Residents Association (Demo)', 'Rawalpindi', 'Zara Iqbal', 5),
  sites: [{ id: 'site_kestrel', name: 'Kestrel Point', city: 'Rawalpindi', kind: 'residential', buildings: 2, declaredUnits: 96 }],
  modules: grants(communityModules),
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

export const SEED_TENANTS: readonly TenantDetail[] = [larkspur, mapleCourt, riverbend, cedarHills, kestrel];

export const SEED_REQUESTS: readonly WorkspaceRequest[] = [
  { id: 'req_sunfield', kind: 'approval', organisation: 'Sunfield Apartments Association (Demo)', contactName: 'Mehwish Akhtar', edition: 'community', expectedUnits: 48, city: 'Faisalabad', receivedAt: '2026-10-25T16:40:00Z', status: 'new' },
  { id: 'req_northgate', kind: 'sales', organisation: 'Northgate Builders (Demo)', contactName: 'Kamran Hashmi', edition: 'developer', expectedUnits: 420, city: 'Multan', receivedAt: '2026-10-24T09:10:00Z', status: 'new' },
  { id: 'req_oakfield', kind: 'trial', organisation: 'Oakfield Towers Owners (Demo)', contactName: 'Rabia Abbasi', edition: 'community', expectedUnits: 72, city: 'Sialkot', receivedAt: '2026-10-21T12:00:00Z', status: 'contacted' },
];

export const SEED_AUDIT: readonly PlatformAuditEvent[] = [
  { id: 'aud_7', at: '2026-10-25T16:41:00Z', actorName: 'System', actorId: 'system', action: 'requestReceived', params: { organisation: 'Sunfield Apartments Association (Demo)' } },
  { id: 'aud_6', at: '2026-10-24T13:20:00Z', actorName: 'Omar Sheikh', actorId: 'usr_hq_0004', action: 'approvalRequested', tenantId: kestrel.id, tenantName: kestrel.displayName, params: { reasons: '1' } },
  { id: 'aud_5', at: '2026-10-20T07:00:00Z', actorName: 'System', actorId: 'system', action: 'graceStarted', tenantId: riverbend.id, tenantName: riverbend.displayName, params: {} },
  { id: 'aud_4', at: '2026-10-13T08:05:00Z', actorName: 'Sana Raza', actorId: 'usr_hq_0005', action: 'trialStarted', tenantId: mapleCourt.id, tenantName: mapleCourt.displayName, params: { days: '30' } },
  { id: 'aud_3', at: '2026-09-30T07:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'tenantSuspended', tenantId: cedarHills.id, tenantName: cedarHills.displayName, params: {} },
  { id: 'aud_2', at: '2026-05-01T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'contractActivated', tenantId: riverbend.id, tenantName: riverbend.displayName, params: { version: '1' } },
  { id: 'aud_1', at: '2026-03-01T05:00:00Z', actorName: 'Hamza Qureshi', actorId: 'usr_hq_0001', action: 'contractActivated', tenantId: larkspur.id, tenantName: larkspur.displayName, params: { version: '1' } },
];

/**
 * Illustrative platform revenue for the dashboard (platform finance itself is Gate G), consistent
 * with the seeded contracts: Larkspur 47,500 + Riverbend 12,280 (+15,000 onboarding in May) +
 * Cedar Hills 2,900 until its suspension at the end of September. Riverbend has not paid since
 * September (grace); Cedar Hills owes August and September.
 */
export const SEED_REVENUE = [
  { month: '2026-05', invoiced: '77680.00', collected: '77680.00' },
  { month: '2026-06', invoiced: '62680.00', collected: '62680.00' },
  { month: '2026-07', invoiced: '62680.00', collected: '62680.00' },
  { month: '2026-08', invoiced: '62680.00', collected: '59780.00' },
  { month: '2026-09', invoiced: '62680.00', collected: '47500.00' },
  { month: '2026-10', invoiced: '59780.00', collected: '47500.00' },
] as const;

/** Unpaid platform invoices: Riverbend Sep + Oct (24,560) and Cedar Hills Aug + Sep (5,800). */
export const SEED_OUTSTANDING = '30360.00';
/** September MRR, before Cedar Hills was suspended. */
export const SEED_MRR_PREVIOUS = '62680.00';

export const SEED_USAGE = { smsThisMonth: 3840 } as const;
