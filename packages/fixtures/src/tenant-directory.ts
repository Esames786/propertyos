import type { EditionKey, EffectiveAccess, LicensedSite, ModuleGrant, ModuleKey, ModuleSelection, Persona, TenantStatus, TenantType } from '@repo/contracts';
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
    modules: [...all(presetFor('developer').modules), { module: 'online_payments', sites: ['site_lk_heights'] }],
    licensedFrom: '2026-03-01',
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
    modules: all(['core', 'maintenance']),
    licensedFrom: '2026-08-01',
    allowSettlement: true,
  },
];

export const directoryTenant = (id: string) => TENANT_DIRECTORY.find((t) => t.id === id);

/** Today in the demo (fixtures are frozen in time). */
export const ACCESS_TODAY = FIXTURE_NOW.toISOString().slice(0, 10);

/** Module selections as effective-dated grants. */
export function grantsOf(modules: readonly ModuleSelection[], from: string): ModuleGrant[] {
  return modules.map((m) => ({ module: m.module, sites: m.sites, from, source: 'preset' as const }));
}

/** Effective access of a tenant-plane person: their tenant's lifecycle and grants plus their own permissions. */
export function effectiveAccessFor(persona: Persona, tenant = directoryTenant(persona.tenantId)): EffectiveAccess | null {
  if (!tenant) return null;
  return {
    tenant: { id: tenant.id, type: tenant.type, status: tenant.status, suspensionPolicy: { allowSettlement: tenant.allowSettlement } },
    grants: grantsOf(tenant.modules, tenant.licensedFrom),
    features: [],
    permissions: persona.permissions,
    scopes: persona.projectScope === 'all' ? [{ type: 'all' }] : [{ type: 'project', ids: persona.projectScope }],
    userId: persona.principalId,
  };
}
