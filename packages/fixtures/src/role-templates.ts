import { STARTER_ROLE_SETS, type Permission, type StarterRoleKey, type TenantRoleTemplate, type TenantType } from '@repo/contracts';

/**
 * Staff roles (owner decision, CP2 review). Every workspace starts from a starter set for its kind of
 * organisation, then owns its roles. The demo identities hold these roles and take their permissions
 * from them, so Platform HQ's "Preview as client" of a role is exactly what its people get.
 * Illustrative permission catalogue (see permissions.ts): the backend decides the real one.
 */
const STARTER_PERMISSIONS: Record<StarterRoleKey, readonly Permission[]> = {
  // Developer starters
  administration: [
    'project.context.use', 'quickcreate.use', 'lead.view', 'lead.create', 'visit.schedule', 'unit.view',
    'unit.hold', 'quote.create', 'customer.view', 'booking.view', 'invoice.view', 'payment.receive',
    'finance.evidence.review', 'expense.create', 'supplier.view', 'procurement.view', 'hr.view',
    'operations.view', 'residents.view', 'reports.view', 'admin.view', 'construction.view', 'collections.view', 'bank.view',
  ],
  sales: [
    'project.context.use', 'quickcreate.use', 'lead.view', 'lead.create', 'visit.schedule',
    'unit.view', 'unit.hold', 'quote.create', 'customer.view', 'booking.view',
  ],
  project_management: ['project.context.use', 'quickcreate.use', 'unit.view', 'booking.view', 'construction.view', 'procurement.view', 'supplier.view', 'reports.view'],
  inventory: ['project.context.use', 'quickcreate.use', 'unit.view', 'unit.hold', 'booking.view', 'reports.view'],
  finance: [
    'project.context.use', 'quickcreate.use', 'customer.view', 'booking.view', 'invoice.view',
    'payment.receive', 'finance.evidence.review', 'expense.create', 'supplier.view', 'reports.view', 'collections.view', 'bank.view',
  ],
  construction: ['project.context.use', 'quickcreate.use', 'construction.view', 'procurement.view', 'supplier.view', 'reports.view'],
  // Society starters. Billing is split so maker-checker holds (A4 §9): the manager sets up the site,
  // prepares runs and requests payer changes; the treasurer approves runs, exemptions, opening
  // balances, payer changes and collection-account changes. Posting an approved run is for finance
  // (treasurer, accounts) by default (owner decision, C.1 review); the site's posting policy narrows
  // it further, and nobody approves or posts their own run (checked by principal on the server).
  administrator: [
    'quickcreate.use', 'customer.view', 'residents.view', 'operations.view', 'workorder.update', 'visitors.manage',
    'invoice.view', 'payment.receive', 'finance.evidence.review', 'reports.view', 'admin.view',
    'site.view', 'site.manage', 'opening_balance.import', 'charges.manage', 'billing_run.view', 'billing_run.create', 'billing_run.post',
    'collections.view', 'bank.view', 'beneficiary.manage', 'payment_methods.manage', 'billing_policy.manage',
  ],
  manager: [
    'quickcreate.use', 'customer.view', 'residents.view', 'operations.view', 'workorder.update', 'visitors.manage', 'invoice.view', 'reports.view',
    'site.view', 'site.manage', 'opening_balance.import', 'charges.manage', 'billing_run.view', 'billing_run.create',
    'collections.view', 'beneficiary.manage',
  ],
  treasurer: [
    'quickcreate.use', 'customer.view', 'invoice.view', 'payment.receive', 'finance.evidence.review', 'residents.view', 'reports.view',
    'site.view', 'opening_balance.approve', 'billing_run.view', 'billing_run.approve', 'billing_run.post', 'credit_note.create',
    'collections.view', 'bank.view', 'beneficiary.approve', 'payment_methods.manage', 'billing_policy.manage', 'liability.approve', 'payment_exception.approve',
  ],
  maintenance: ['quickcreate.use', 'operations.view', 'workorder.update', 'residents.view'],
  technician: ['operations.view', 'workorder.update'],
  security: ['visitors.manage', 'residents.view'],
};

/** Which starter set a kind of organisation begins with. */
export const starterSetFor = (type: TenantType): keyof typeof STARTER_ROLE_SETS => (type === 'developer' ? 'developer' : 'society');

const starter = (tenantId: string, key: StarterRoleKey, holders: readonly string[] = []): TenantRoleTemplate => ({
  id: key,
  tenantId,
  starter: key,
  labelKey: `common:roles.${key}`,
  permissions: STARTER_PERMISSIONS[key],
  holders,
});

/** A workspace's roles straight from its starter set (before it changes anything). */
export function starterRoles(tenantId: string, type: TenantType, holders: Partial<Record<StarterRoleKey, readonly string[]>> = {}): TenantRoleTemplate[] {
  return STARTER_ROLE_SETS[starterSetFor(type)].map((key) => starter(tenantId, key, holders[key]));
}

/**
 * Shalimar Court replaced the starter "Manager" with its own "Facility manager" role, carried over
 * from its old system with lead, booking and unit permissions. Its licence (core + maintenance),
 * not the role, keeps those developer areas away: the CP2 licensing demonstration.
 */
const SHALIMAR_FACILITY_MANAGER: TenantRoleTemplate = {
  id: 'facility_manager',
  tenantId: 'tnt_shalimar',
  starter: null,
  labelKey: 'common:persona.facility_manager',
  permissions: ['quickcreate.use', 'operations.view', 'residents.view', 'reports.view', 'lead.view', 'lead.create', 'booking.view', 'unit.view'],
  holders: ['facility_manager'],
};

/**
 * Al-Noor's own "Accounts officer" (A4 §9): verifies proofs, matches the bank feed, receives office
 * cash, issues receipts and posts approved runs. It cannot approve runs, exemptions, payer changes or
 * a new collection account, so every one of those keeps a second person.
 */
const ALNOOR_ACCOUNTS_OFFICER: TenantRoleTemplate = {
  id: 'accounts_officer',
  tenantId: 'tnt_alnoor',
  starter: null,
  labelKey: 'common:roles.accounts_officer',
  permissions: [
    'quickcreate.use', 'customer.view', 'residents.view', 'invoice.view', 'payment.receive', 'finance.evidence.review', 'reports.view',
    'site.view', 'billing_run.view', 'billing_run.post', 'collections.view', 'bank.view', 'bank.reconcile', 'beneficiary.manage',
  ],
  holders: ['alnoor_accounts'],
};

const ALNOOR_ROLE_NAMES: Readonly<Record<string, string>> = {
  manager: 'common:roles.building_manager',
  treasurer: 'common:roles.committee_treasurer',
  security: 'common:roles.security_guard',
};

const TENANT_ROLES: Readonly<Record<string, readonly TenantRoleTemplate[]>> = {
  tnt_larkspur: starterRoles('tnt_larkspur', 'developer', { administration: ['manager'], sales: ['sales'], finance: ['finance'] }),
  tnt_crescent: starterRoles('tnt_crescent', 'developer', { administration: ['cb_manager'] }),
  tnt_shalimar: starterRoles('tnt_shalimar', 'association', { administrator: ['society_admin'] }).map((r) => (r.id === 'manager' ? SHALIMAR_FACILITY_MANAGER : r)),
  tnt_cedar: starterRoles('tnt_cedar', 'custom', { treasurer: ['cedar_treasurer'] }),
  // Al-Noor Residency kept the society starters and named three of them after its committee posts.
  tnt_alnoor: [
    ...starterRoles('tnt_alnoor', 'association', { manager: ['alnoor_manager'], treasurer: ['alnoor_treasurer'], security: ['alnoor_guard'] }).map((r) =>
      ALNOOR_ROLE_NAMES[r.id] ? { ...r, labelKey: ALNOOR_ROLE_NAMES[r.id]! } : r,
    ),
    ALNOOR_ACCOUNTS_OFFICER,
  ],
};

/** The tenant's own roles (a workspace without changes has its starter set). */
export function rolesOf(tenantId: string, type: TenantType): readonly TenantRoleTemplate[] {
  return TENANT_ROLES[tenantId] ?? starterRoles(tenantId, type);
}

/** One role of a tenant (the demo identities take their permissions from it). */
export function tenantRole(tenantId: string, roleId: string): TenantRoleTemplate {
  const role = TENANT_ROLES[tenantId]?.find((r) => r.id === roleId);
  if (!role) throw new Error(`No role ${roleId} in ${tenantId}`);
  return role;
}
