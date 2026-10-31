import type { EditionKey, EffectiveAccess, LicensedSite, ModuleGrant, ModuleKey, ModuleSelection, Persona, TenantStatus, TenantType, FeatureKey } from '@repo/contracts';
import { datasetFor } from './datasets';
import { presetFor } from './platform/catalog';
import { FIXTURE_NOW } from './seed';

/**
 * Licensing facts for every fictional tenant, shared by Platform HQ (which sells and changes them)
 * and the tenant apps (which are limited by them). One source, so the HQ preview of a tenant and
 * that tenant's own workspace agree. Kept free of pricing so the tenant apps stay light.
 */
export interface DirectoryTenant {
  id: string;
  name: string;
  legalName: string;
  type: TenantType;
  edition: EditionKey;
  status: TenantStatus;
  city: string;
  contactName: string;
  sites: readonly LicensedSite[];
  modules: readonly ModuleSelection[];
  /** Grants are in force from this date (contract start). */
  licensedFrom: string;
  /** D-20: may residents still settle issued invoices while the tenant is suspended? */
  allowSettlement: boolean;
  /** Licensed features (catalogue keys) on top of the modules; none unless a contract grants them. */
  features?: readonly FeatureKey[];
}

const all = (modules: readonly ModuleKey[]): ModuleSelection[] => modules.map((module) => ({ module, sites: 'all' }));

export const TENANT_DIRECTORY: readonly DirectoryTenant[] = [
  {
    id: 'tnt_larkspur',
    name: 'Larkspur Estates (Demo)',
    legalName: 'Larkspur Estates (Pvt) Ltd (Demo)',
    type: 'developer',
    edition: 'developer',
    status: 'active',
    city: 'Lahore',
    contactName: 'Nadia Rahman',
    sites: [
      { id: 'site_lk_heights', name: 'Larkspur Heights', city: 'Lahore', kind: 'residential', buildings: 3, declaredUnits: 336 },
      { id: 'site_lk_gardens', name: 'Larkspur Gardens', city: 'Islamabad', kind: 'plots', buildings: 0, declaredUnits: 160 },
    ],
    // Online payments for Larkspur Heights were added by contract amendment 2 from 1 April 2026.
    modules: [...all(presetFor('developer').modules), { module: 'online_payments', sites: ['site_lk_heights'], from: '2026-04-01' }],
    licensedFrom: '2026-03-01',
    allowSettlement: true,
  },
  {
    // Two sites, different grants (CP2 security correction 2): Crescent Bay Towers is a residential
    // project with sales inventory, construction and handover; Crescent Bay Plaza is a commercial
    // building the company only maintains. CRM, sales and receivables cover the whole company.
    id: 'tnt_crescent',
    name: 'Crescent Bay Developers (Demo)',
    legalName: 'Crescent Bay Developers (Pvt) Ltd (Demo)',
    type: 'developer',
    edition: 'developer',
    status: 'trial',
    city: 'Karachi',
    contactName: 'Zain Abbasi',
    sites: [
      { id: 'site_cb_towers', name: 'Crescent Bay Towers', city: 'Karachi', kind: 'residential', buildings: 2, declaredUnits: 48 },
      { id: 'site_cb_plaza', name: 'Crescent Bay Plaza', city: 'Karachi', kind: 'commercial', buildings: 1, declaredUnits: 18 },
    ],
    modules: [
      ...all(['core', 'crm', 'projects', 'sales', 'receivables', 'communications', 'reports']),
      { module: 'inventory', sites: ['site_cb_towers'] },
      { module: 'construction', sites: ['site_cb_towers'] },
      { module: 'handover', sites: ['site_cb_towers'] },
      { module: 'maintenance', sites: ['site_cb_plaza'] },
    ],
    licensedFrom: '2026-10-15',
    allowSettlement: true,
  },
  {
    id: 'tnt_maple',
    name: 'Maple Court Society (Demo)',
    legalName: 'Maple Court Owners Association (Demo)',
    type: 'association',
    edition: 'community',
    status: 'trial',
    city: 'Karachi',
    contactName: 'Sana Raza',
    sites: [{ id: 'site_maple', name: 'Maple Court', city: 'Karachi', kind: 'residential', buildings: 2, declaredUnits: 40 }],
    modules: all(presetFor('community').modules),
    licensedFrom: '2026-10-13',
    allowSettlement: true,
  },
  {
    id: 'tnt_riverbend',
    name: 'Riverbend Estate Managers (Demo)',
    legalName: 'Riverbend Estate Managers (Pvt) Ltd (Demo)',
    type: 'portfolio_manager',
    edition: 'portfolio',
    status: 'grace',
    city: 'Islamabad',
    contactName: 'Faisal Butt',
    sites: [
      { id: 'site_rb_heights', name: 'Riverbend Heights', city: 'Islamabad', kind: 'residential', buildings: 3, declaredUnits: 120 },
      { id: 'site_rb_court', name: 'Riverbend Court', city: 'Rawalpindi', kind: 'residential', buildings: 2, declaredUnits: 64 },
      { id: 'site_rb_villas', name: 'Riverbend Villas', city: 'Islamabad', kind: 'plots', buildings: 0, declaredUnits: 48 },
    ],
    modules: all(presetFor('portfolio').modules),
    licensedFrom: '2026-05-01',
    allowSettlement: true,
  },
  {
    id: 'tnt_cedar',
    name: 'Cedar Hills Co-operative (Demo)',
    legalName: 'Cedar Hills Housing Co-operative (Demo)',
    type: 'custom',
    edition: 'custom',
    status: 'suspended',
    city: 'Peshawar',
    contactName: 'Haris Mirza',
    sites: [{ id: 'site_cedar', name: 'Cedar Hills', city: 'Peshawar', kind: 'residential', buildings: 4, declaredUnits: 60 }],
    modules: all(['core', 'receivables', 'dues', 'residents', 'resident_portal', 'maintenance', 'communications', 'reports']),
    licensedFrom: '2026-02-01',
    allowSettlement: true,
  },
  {
    id: 'tnt_kestrel',
    name: 'Kestrel Point Residences (Demo)',
    legalName: 'Kestrel Point Residents Association (Demo)',
    type: 'association',
    edition: 'community',
    status: 'draft',
    city: 'Rawalpindi',
    contactName: 'Zara Iqbal',
    sites: [{ id: 'site_kestrel', name: 'Kestrel Point', city: 'Rawalpindi', kind: 'residential', buildings: 2, declaredUnits: 96 }],
    modules: all(presetFor('community').modules),
    licensedFrom: '2026-11-01',
    allowSettlement: true,
  },
  {
    // The owner's maintenance-only client (Gate B checkpoint 2): it must never reach developer CRM,
    // sales, booking or construction, whatever its people's roles say.
    id: 'tnt_shalimar',
    name: 'Shalimar Court Residents (Demo)',
    legalName: 'Shalimar Court Residents Welfare Association (Demo)',
    type: 'association',
    edition: 'custom',
    status: 'active',
    city: 'Lahore',
    contactName: 'Adnan Malik',
    sites: [{ id: 'site_shalimar', name: 'Shalimar Court', city: 'Lahore', kind: 'residential', buildings: 2, declaredUnits: 64 }],
    // Amendment 2 (approved, scheduled): a resident roster and gate passes from 1 November 2026.
    modules: [...all(['core', 'maintenance']), { module: 'residents', sites: 'all', from: '2026-11-01' }, { module: 'visitors', sites: 'all', from: '2026-11-01' }],
    licensedFrom: '2026-08-01',
    allowSettlement: true,
  },
  {
    // The Gate C society (A7 §C.2): one site, two blocks, 80 flats, community edition. It is created
    // in Platform HQ by the Gate B storyline (the HQ wizard test checks the same sites and modules),
    // so it is not one of HQ's seeded tenants; the workspace demo starts after that activation.
    id: 'tnt_alnoor',
    name: 'Al-Noor Residency (Demo)',
    legalName: 'Al-Noor Residency Owners’ Association (Demo)',
    type: 'association',
    edition: 'community',
    status: 'active',
    city: 'Lahore',
    contactName: 'Imran Qureshi',
    sites: [{ id: 'site_alnoor', name: 'Al-Noor Residency', city: 'Lahore', kind: 'residential', buildings: 2, declaredUnits: 80 }],
    modules: all(presetFor('community').modules),
    licensedFrom: '2026-10-01',
    allowSettlement: true,
    // Gate S.1 amendment (fictional, V3.2 matrix §7): cashbook, bulk collection and the committee, plus the
    // features S.1 builds on (office collections, reminders, transfer clearance) and the metered
    // SMS/WhatsApp channels D.1 already simulates. Every message stays simulated.
    features: ['banking.cashbook', 'receivables.bulk_office_collection', 'receivables.office_collections', 'receivables.reminders', 'residents.committee', 'residents.transfer_clearance', 'communications.sms', 'communications.whatsapp'],
  },
];

/** Workspace demos created by an HQ storyline rather than seeded in HQ (see the Al-Noor entry). */
export const CREATED_IN_HQ_STORYLINE: readonly string[] = ['tnt_alnoor'];

export const directoryTenant = (id: string) => TENANT_DIRECTORY.find((t) => t.id === id);

/** Today in the demo (fixtures are frozen in time). */
export const ACCESS_TODAY = FIXTURE_NOW.toISOString().slice(0, 10);

/** Module selections as effective-dated grants (a selection's own date wins over the licence start). */
export function grantsOf(modules: readonly ModuleSelection[], from: string): ModuleGrant[] {
  return modules.map((m) => ({ module: m.module, sites: m.sites, from: m.from ?? from, source: m.from ? ('override' as const) : ('preset' as const) }));
}

/**
 * Effective access of a tenant-plane person: their tenant's lifecycle and grants plus their own
 * permissions. A resident's data scope is their party links (verified, effective-dated liability);
 * staff are scoped to all projects or the projects they are assigned to.
 */
export function effectiveAccessFor(persona: Persona, tenant = directoryTenant(persona.tenantId)): EffectiveAccess | null {
  if (!tenant) return null;
  const partyId = persona.partyId;
  const links = partyId ? (datasetFor(tenant.id)?.partyLinks ?? []).filter((l) => l.partyId === partyId).map(({ partyId: _owner, ...link }) => link) : [];
  return {
    tenant: { id: tenant.id, type: tenant.type, status: tenant.status, suspensionPolicy: { allowSettlement: tenant.allowSettlement } },
    grants: grantsOf(tenant.modules, tenant.licensedFrom),
    features: tenant.features ?? [],
    permissions: persona.permissions,
    scopes: partyId ? [{ type: 'party', partyId, links }] : persona.projectScope === 'all' ? [{ type: 'all' }] : [{ type: 'project', ids: persona.projectScope }],
    userId: persona.principalId,
  };
}
