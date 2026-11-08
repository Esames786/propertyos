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
    // Gate D.1: residents' portal access, data requests, staff sessions and the organisation's colours.
    'portal_access.view', 'portal_access.invite', 'data_export.request', 'privacy.requests.manage', 'sessions.manage', 'admin.branding',
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
    // Gate D.1: approves data exports that someone else requested (maker-checker by principal).
    'data_export.approve',
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
    // Gate D.1: portal access, data requests, staff sessions and the organisation's colours.
    'portal_access.view', 'portal_access.invite', 'data_export.request', 'privacy.requests.manage', 'sessions.manage', 'admin.branding',
    // Gate S.1 (V3.2 matrix §5.2): the committee, approval policies, reminders, the cashbook (read) and transfers.
    'committee.view', 'committee.manage', 'approval.view', 'approval_policy.manage', 'reminders.manage', 'reminders.send', 'cashbook.view', 'transfer.review',
    // Gate D.2 (V3.2 matrix §5.2): maintenance triage, community issues and their moderation, visitors and
    // vehicles, amenity bookings, official notices and quick broadcasts, and the sandbox gateway.
    'maintenance.manage', 'issues.view', 'issues.manage', 'issues.moderate', 'visitors.view', 'parking.view', 'vehicles.approve', 'amenities.manage', 'notices.publish', 'messages.send', 'merchant.manage',
    // D.3 opt-in modules: licence still required even for administrators.
    'chat.use', 'chat.groups.manage', 'chat.moderate', 'directory.manage', 'polls.manage', 'resources.publish',
    // Gate S.2a (V3.2 matrix §5.2): the optional HR add-on, licence still required. Recording attendance
    // and approving a correction are separate permissions, and nobody decides their own request.
    'hr.view', 'hr.manage', 'shifts.manage', 'attendance.record', 'attendance.adjust', 'leave.manage', 'hr.documents.manage', 'hr.advances.manage', 'hr.advances.approve',
  ],
  manager: [
    'quickcreate.use', 'customer.view', 'residents.view', 'operations.view', 'workorder.update', 'visitors.manage', 'invoice.view', 'reports.view',
    'site.view', 'site.manage', 'opening_balance.import', 'charges.manage', 'billing_run.view', 'billing_run.create',
    'collections.view', 'beneficiary.manage',
    // Gate D.1: invites residents to the portal and sees who uses it.
    'portal_access.view', 'portal_access.invite',
    // Gate S.1: sees the committee and the cashbook; prepares society transfers.
    'committee.view', 'approval.view', 'cashbook.view', 'transfer.review',
    // Gate D.2: runs the building day to day: requests, issues, the gate, vehicles, bookings and notices.
    'maintenance.manage', 'issues.view', 'issues.manage', 'issues.moderate', 'visitors.view', 'parking.view', 'vehicles.approve', 'amenities.manage', 'notices.publish', 'messages.send',
    'chat.use', 'chat.groups.manage', 'chat.moderate', 'directory.manage', 'polls.manage', 'resources.publish',
    // Gate S.2a: runs the staff day to day (employees, roster, attendance, leave, documents) and raises
    // advance requests; he never approves an advance (finance does).
    'hr.view', 'hr.manage', 'shifts.manage', 'attendance.record', 'attendance.adjust', 'leave.manage', 'hr.documents.manage', 'hr.advances.manage',
  ],
  treasurer: [
    'quickcreate.use', 'customer.view', 'invoice.view', 'payment.receive', 'finance.evidence.review', 'residents.view', 'reports.view',
    'site.view', 'opening_balance.approve', 'billing_run.view', 'billing_run.approve', 'billing_run.post', 'credit_note.create',
    'collections.view', 'bank.view', 'beneficiary.approve', 'payment_methods.manage', 'billing_policy.manage', 'liability.approve', 'payment_exception.approve',
    // Gate D.1: sees portal adoption; approves data exports someone else requested.
    'portal_access.view', 'data_export.approve',
    // Gate S.1: the checker of every money pair (vouchers, transfers, exceptions on outgoing legs,
    // office collection batches, month close, transfers and clearance), within the approval policy.
    'committee.view', 'approval.view', 'approval.decide', 'cashbook.view', 'cash_voucher.approve', 'funds_transfer.approve', 'settlement_exception.approve', 'payment.batch.confirm', 'period.close', 'transfer.approve', 'clearance.issue',
    // Gate D.2: the online gateway's sandbox settings (BILL-011) sit with payment methods.
    'merchant.manage',
    // Gate S.2a: the checker of staff advances and loans (never staff records, attendance or documents).
    'hr.advances.approve',
  ],
  // Gate D.2: the maintenance supervisor triages, assigns and closes; technicians move only their own
  // work orders (the server filters them); security runs the gate and checks vehicles at it.
  // Gate S.2a: both supervisors record attendance for their own department's duties only (the server
  // filters by department); neither sees staff records, documents or money.
  maintenance: ['quickcreate.use', 'operations.view', 'workorder.update', 'residents.view', 'maintenance.manage', 'issues.view', 'issues.manage', 'attendance.record'],
  technician: ['operations.view', 'workorder.update'],
  security: ['visitors.manage', 'residents.view', 'visitors.view', 'parking.view', 'vehicles.approve', 'attendance.record'],
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
  permissions: ['quickcreate.use', 'operations.view', 'residents.view', 'reports.view', 'lead.view', 'lead.create', 'booking.view', 'unit.view', 'maintenance.manage', 'workorder.update', 'issues.view', 'issues.manage', 'visitors.view', 'visitors.manage'],
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
    // Gate S.1: the maker of vouchers, cheques and reminders; matches statement lines to legs and cheques.
    'approval.view', 'cashbook.view', 'cash_voucher.prepare', 'cheque.manage', 'funds_transfer.create', 'reminders.manage', 'reminders.send', 'transfer.review',
    // Gate S.2a: links posted vouchers to staff advances as evidence (HR-008); never approves them.
    'hr.advances.manage',
    // Gate S.2b: prepares payroll (periods, runs and their inputs, disbursement instructions); never approves it.
    'payroll.view', 'payroll.prepare',
  ],
  holders: ['alnoor_accounts'],
};

/**
 * Al-Noor's own changes to two society starters (Gate S.1, documented in the S.1 report): the committee
 * secretary is the second signatory for large vouchers, transfers and waivers (resolution R-8/2026);
 * the building manager takes office cash to the bank, so he prepares deposits (the accounts officer,
 * who matches the bank line, never confirms an instruction she prepared).
 */
const ALNOOR_EXTRA: Readonly<Record<string, readonly Permission[]>> = {
  administrator: ['approval.decide', 'cash_voucher.approve', 'funds_transfer.approve'],
  manager: ['funds_transfer.create'],
  // Gate S.2b (V3.2 matrix §5.2): the treasurer approves payroll runs and their disbursement instructions,
  // and closes payroll periods. Given to Al-Noor's treasurer only, never through a starter set.
  treasurer: ['payroll.view', 'payroll.approve'],
};

const ALNOOR_ROLE_NAMES: Readonly<Record<string, string>> = {
  administrator: 'common:roles.committee_secretary',
  manager: 'common:roles.building_manager',
  treasurer: 'common:roles.committee_treasurer',
  security: 'common:roles.security_guard',
};

/**
 * Riverbend Estate Managers (Gate S.3): its own roles for the rentals add-on (V3.2 matrix §5.2), so each
 * maker-checker pair sits with different people. The director drafts management agreement versions and
 * the finance controller approves them (an addition to the matrix, which gives `rentals.configure` to
 * administrators only: approving an agreement needs a second person); the portfolio manager drafts
 * leases and prepares rent rolls; the client-money accounts officer activates leases someone else drafted
 * and prepares owner payout instructions; the finance controller approves rent rolls and payout
 * instructions and may read leases. Issuing an owner statement to the landlord (`owner_statement.issue`,
 * Issue #17 R4) is the client-money accounts officer's alone: every other role reads statements only.
 * No Riverbend role holds a society billing or HR permission: those screens are built for societies
 * only. The technician and security starters are kept as they are.
 */
const RIVERBEND_ROLES: readonly TenantRoleTemplate[] = [
  { id: 'administrator', tenantId: 'tnt_riverbend', starter: null, labelKey: 'common:roles.director', permissions: ['lease.view', 'lease.manage', 'owner_statement.view', 'rentals.configure'], holders: ['rb_director'] },
  { id: 'manager', tenantId: 'tnt_riverbend', starter: null, labelKey: 'common:roles.portfolio_manager', permissions: ['lease.view', 'lease.manage', 'rent.bill', 'owner_statement.view'], holders: ['rb_manager'] },
  { id: 'treasurer', tenantId: 'tnt_riverbend', starter: null, labelKey: 'common:roles.finance_controller', permissions: ['lease.view', 'rent.approve', 'owner_statement.view', 'owner_payout.approve', 'rentals.configure'], holders: ['rb_finance'] },
  { id: 'accounts_officer', tenantId: 'tnt_riverbend', starter: null, labelKey: 'common:roles.client_money_officer', permissions: ['lease.view', 'lease.manage', 'rent.bill', 'owner_statement.view', 'owner_statement.issue', 'owner_payout.prepare'], holders: ['rb_accounts'] },
  ...starterRoles('tnt_riverbend', 'portfolio_manager').filter((r) => r.id === 'technician' || r.id === 'security'),
];

/**
 * Gate E.0 (owner decisions E-06 and E-07, conservative defaults; listed in docs/status/gate-e0/REPORT.md).
 * No starter set changes, and no existing person gains a capability:
 * - **F-3.** Writing to a lead (activity, status, follow-up) now needs `lead.manage`, no longer `lead.view`.
 *   The three roles that wrote leads through `lead.view` (Larkspur's administration and sales, Crescent Bay's
 *   administration) hold `lead.manage` as their organisation's own change, so Nadia, Bilal and Zain can do
 *   exactly what they could before (decision D-E0-01). Shalimar's facility manager keeps `lead.view` alone:
 *   its licence has no CRM, so nothing it could do changes.
 * - **Maker-checker holders (E-06).** Larkspur adds four roles of its own for the developer ERP's Wave 1
 *   pairs, each held by a new fictional person; every pair is split across two people (`gate-e-access.test.ts`).
 */
const DEVELOPER_EXTRA: Readonly<Record<string, Readonly<Record<string, readonly Permission[]>>>> = {
  tnt_larkspur: { administration: ['lead.manage'], sales: ['lead.manage'] },
  tnt_crescent: { administration: ['lead.manage'] },
};
const withDeveloperExtra = (tenantId: string, roles: readonly TenantRoleTemplate[]): TenantRoleTemplate[] =>
  roles.map((r) => (DEVELOPER_EXTRA[tenantId]?.[r.id] ? { ...r, permissions: [...r.permissions, ...DEVELOPER_EXTRA[tenantId]![r.id]!] } : r));

const larkspurRole = (id: string, labelKey: string, permissions: readonly Permission[], holder: string): TenantRoleTemplate => ({ id, tenantId: 'tnt_larkspur', starter: null, labelKey, permissions, holders: [holder] });

/** Gate E.0: Larkspur's own developer-ERP roles (Wave 1 maker-checker pairs). */
export const LARKSPUR_ERP_ROLES: readonly TenantRoleTemplate[] = [
  // Assigns leads to salespeople and works every lead of every project (E.1).
  larkspurRole('sales_manager', 'common:roles.sales_manager', [...STARTER_PERMISSIONS.sales, 'lead.manage', 'lead.assign', 'project.view', 'document.view', 'document.upload'], 'lsp_sales_manager'),
  // Maker: drafts project setup, manages storage, drafts document templates (E.2, E.13).
  larkspurRole('project_manager', 'common:roles.project_manager', [...STARTER_PERMISSIONS.project_management, 'project.view', 'project.manage', 'inventory.manage', 'document.view', 'document.upload', 'document_template.manage'], 'lsp_project_manager'),
  // Maker: journals, chart and posting-rule drafts, statement imports (E.7).
  larkspurRole('accounts_officer', 'common:roles.accounts_officer', ['project.context.use', 'gl.view', 'gl.manage', 'journal.create', 'bank.view', 'bank.import', 'document.view', 'document.upload'], 'lsp_accounts'),
  // Checker: approves and posts what someone else prepared; activates projects (reads their inventory: the
  // Projects area is gated by unit.view, unchanged); approves templates.
  larkspurRole('finance_controller', 'common:roles.finance_controller', ['project.context.use', 'reports.view', 'unit.view', 'project.view', 'project.approve', 'gl.view', 'gl.approve', 'journal.approve', 'gl.post', 'bank.view', 'bank.import.approve', 'document.view', 'document_template.approve'], 'lsp_finance_controller'),
];

const TENANT_ROLES: Readonly<Record<string, readonly TenantRoleTemplate[]>> = {
  tnt_riverbend: RIVERBEND_ROLES,
  tnt_larkspur: [...withDeveloperExtra('tnt_larkspur', starterRoles('tnt_larkspur', 'developer', { administration: ['manager'], sales: ['sales'], finance: ['finance'] })), ...LARKSPUR_ERP_ROLES],
  tnt_crescent: withDeveloperExtra('tnt_crescent', starterRoles('tnt_crescent', 'developer', { administration: ['cb_manager'] })),
  tnt_shalimar: starterRoles('tnt_shalimar', 'association', { administrator: ['society_admin'] }).map((r) => (r.id === 'manager' ? SHALIMAR_FACILITY_MANAGER : r)),
  tnt_cedar: starterRoles('tnt_cedar', 'custom', { treasurer: ['cedar_treasurer'] }),
  // Al-Noor Residency kept the society starters and named three of them after its committee posts.
  tnt_alnoor: [
    ...starterRoles('tnt_alnoor', 'association', { administrator: ['alnoor_admin'], manager: ['alnoor_manager'], treasurer: ['alnoor_treasurer'], security: ['alnoor_guard'], maintenance: ['alnoor_maintenance'], technician: ['alnoor_technician'] }).map((r) =>
      ({ ...r, ...(ALNOOR_ROLE_NAMES[r.id] ? { labelKey: ALNOOR_ROLE_NAMES[r.id]! } : {}), ...(ALNOOR_EXTRA[r.id] ? { permissions: [...r.permissions, ...ALNOOR_EXTRA[r.id]!] } : {}) }),
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
