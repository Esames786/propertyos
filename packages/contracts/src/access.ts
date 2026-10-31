import type { Permission } from './permissions';

/**
 * V3.1 access model (Gate A, A1 §4 and A6 §2). An action is allowed only when every layer allows it:
 * tenant lifecycle → module grant → site/feature entitlement → permission → data scope → workflow
 * state. The first failing layer is the reason. The mock transport (now) and the backend (later)
 * must evaluate the same rules; hiding a menu item is never access control.
 */

export const MODULE_KEYS = [
  'core',
  'crm',
  'projects',
  'inventory',
  'sales',
  'construction',
  'handover',
  'receivables',
  'dues',
  'residents',
  'resident_portal',
  'online_payments',
  'banking',
  'accounting',
  'payables',
  'procurement',
  'hr',
  'payroll',
  'maintenance',
  'visitors',
  'parking',
  'amenities',
  'communications',
  'reports',
  'public_website',
  'white_label',
  'api_access',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Modules granted per site (A1 §5, the catalogue's "site" scope). A record of one of these modules
 * is only reachable when its site is known and licensed: a missing site context is refused.
 */
export const SITE_SCOPED_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  'inventory',
  'construction',
  'handover',
  'dues',
  'residents',
  'resident_portal',
  'online_payments',
  'maintenance',
  'visitors',
  'parking',
  'amenities',
]);
export type FeatureKey = `${ModuleKey}.${string}`;

export const TENANT_TYPES = ['developer', 'association', 'portfolio_manager', 'custom'] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_STATUSES = ['draft', 'trial', 'active', 'grace', 'suspended', 'cancelled', 'archived'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export interface ModuleGrant {
  module: ModuleKey;
  /** 'all' = current and future sites. */
  sites: 'all' | readonly string[];
  /** ISO date, inclusive. */
  from: string;
  /** ISO date, exclusive. */
  to?: string;
  source: 'preset' | 'addon' | 'trial' | 'override';
}

export type AccessScope =
  | { type: 'all' }
  | { type: 'legal_entity' | 'site' | 'building' | 'project' | 'team'; ids: readonly string[] }
  | { type: 'assigned' }
  /** Residents: only what a verified, in-force party link reaches (A2 §4.4 unit liabilities). */
  | { type: 'party'; partyId: string; links: readonly PartyLink[] };

/**
 * A resident's relationship to a flat and the billing account liable for it, as verified by the
 * tenant. Liability is effective-dated: a record is reachable only for dates inside [from, to).
 */
export interface PartyLink {
  unitId: string;
  billingAccountId: string;
  siteId: string;
  legalEntityId: string;
  verified: boolean;
  from: string;
  to?: string;
}

export interface EffectiveAccess {
  tenant: {
    id: string;
    type: TenantType;
    status: TenantStatus;
    /** D-20: while suspended, may residents still settle already-issued invoices? */
    suspensionPolicy: { allowSettlement: boolean };
  };
  grants: readonly ModuleGrant[];
  features: readonly FeatureKey[];
  permissions: readonly Permission[];
  scopes: readonly AccessScope[];
  userId: string;
}

export const DENY_REASONS = [
  'tenant_inactive',
  'tenant_suspended',
  'module_not_licensed',
  'site_not_licensed',
  'site_context_missing',
  'feature_not_licensed',
  'permission_missing',
  'out_of_scope',
  'state_locked',
  'separation_of_duties',
] as const;
export type DenyReason = (typeof DENY_REASONS)[number];

/**
 * Suspension class of an action (A1 §4, required correction 5). Undeclared actions are
 * 'operational' and therefore blocked while the tenant is suspended.
 */
export type SuspensionClass = 'history_read' | 'settlement' | 'operational';

export interface AccessRecord {
  siteId?: string;
  buildingId?: string;
  projectId?: string;
  legalEntityId?: string;
  teamId?: string;
  assignedTo?: string;
  unitId?: string;
  billingAccountId?: string;
  /** The record's own date (due, issued, paid…), checked against effective-dated liability. */
  asOf?: string;
}

export interface AccessRequest {
  module: ModuleKey;
  feature?: FeatureKey;
  permission?: Permission;
  siteId?: string;
  record?: AccessRecord;
  state?: { locked?: boolean; makerUserId?: string };
  /** Evaluation date (ISO), for effective-dated grants. */
  at: string;
  suspension?: SuspensionClass;
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: DenyReason };

const deny = (reason: DenyReason): AccessDecision => ({ allowed: false, reason });

const day = (iso: string) => iso.slice(0, 10);

/** Grant in force on `at`: from ≤ at < to (dates compared as ISO calendar days). */
export function grantActive(grant: ModuleGrant, at: string): boolean {
  const d = day(at);
  return day(grant.from) <= d && (grant.to === undefined || d < day(grant.to));
}

/**
 * A party link reaches a record when it is verified, in force on the record's date, and matches the
 * record's flat and billing account. A financial record (one with a billing account) must also name
 * its site and legal entity and match the link on both: no cross-site or cross-entity exposure.
 */
function linkReaches(l: PartyLink, record: AccessRecord, at: string): boolean {
  const on = day(record.asOf ?? at);
  if (!l.verified || on < day(l.from) || (l.to !== undefined && on >= day(l.to))) return false;
  if (record.unitId === undefined && record.billingAccountId === undefined) return false;
  if (record.unitId !== undefined && record.unitId !== l.unitId) return false;
  if (record.billingAccountId !== undefined) {
    if (record.billingAccountId !== l.billingAccountId) return false;
    if (record.siteId === undefined || record.legalEntityId === undefined) return false;
  }
  if (record.siteId !== undefined && record.siteId !== l.siteId) return false;
  if (record.legalEntityId !== undefined && record.legalEntityId !== l.legalEntityId) return false;
  return true;
}

function inScope(scopes: readonly AccessScope[], record: AccessRecord, userId: string, at: string): boolean {
  return scopes.some((s) => {
    switch (s.type) {
      case 'all':
        return true;
      case 'assigned':
        return record.assignedTo !== undefined && record.assignedTo === userId;
      case 'party':
        return s.links.some((l) => linkReaches(l, record, at));
      case 'site':
        return record.siteId !== undefined && s.ids.includes(record.siteId);
      case 'building':
        return record.buildingId !== undefined && s.ids.includes(record.buildingId);
      case 'project':
        return record.projectId !== undefined && s.ids.includes(record.projectId);
      case 'legal_entity':
        return record.legalEntityId !== undefined && s.ids.includes(record.legalEntityId);
      case 'team':
        return record.teamId !== undefined && s.ids.includes(record.teamId);
    }
  });
}

/** Pure and table-tested (access.vectors.json). Layers are evaluated in order; the first failure is the reason. */
export function decide(access: EffectiveAccess, req: AccessRequest): AccessDecision {
  // 1. Tenant lifecycle
  const status = access.tenant.status;
  if (status === 'draft' || status === 'cancelled' || status === 'archived') return deny('tenant_inactive');
  if (status === 'suspended') {
    const cls = req.suspension ?? 'operational';
    if (cls === 'operational') return deny('tenant_suspended');
    if (cls === 'settlement' && !access.tenant.suspensionPolicy.allowSettlement) return deny('tenant_suspended');
  }

  // 2. Module grant in force
  const grants = access.grants.filter((g) => g.module === req.module && grantActive(g, req.at));
  if (grants.length === 0) return deny('module_not_licensed');

  // 3. Site and feature entitlement
  const siteId = req.siteId ?? req.record?.siteId;
  if (siteId !== undefined && !grants.some((g) => g.sites === 'all' || g.sites.includes(siteId))) return deny('site_not_licensed');
  // Fail closed: a record of a site-scoped module must say which site it belongs to.
  if (siteId === undefined && req.record !== undefined && SITE_SCOPED_MODULES.has(req.module)) return deny('site_context_missing');
  if (req.feature !== undefined && !access.features.includes(req.feature)) return deny('feature_not_licensed');

  // 4. Permission
  if (req.permission !== undefined && !access.permissions.includes(req.permission)) return deny('permission_missing');

  // 5. Data scope (records only; module-level questions such as "show the Sales menu?" stop at 4)
  if (req.record !== undefined && !inScope(access.scopes, req.record, access.userId, req.at)) return deny('out_of_scope');

  // 6. Workflow state
  if (req.state?.locked) return deny('state_locked');
  if (req.state?.makerUserId !== undefined && req.state.makerUserId === access.userId) return deny('separation_of_duties');

  return { allowed: true };
}

/**
 * The module each tenant-plane permission belongs to (illustrative prototype catalogue). Checking a
 * permission therefore also checks that its module is licensed, so a role can never reach a
 * module its organisation has not licensed. Platform (HQ) permissions belong to no tenant module.
 */
export const PERMISSION_MODULE: Partial<Record<Permission, ModuleKey>> = {
  'project.context.use': 'projects',
  'quickcreate.use': 'core',
  'lead.view': 'crm',
  'lead.create': 'crm',
  'visit.schedule': 'crm',
  'unit.view': 'inventory',
  'unit.hold': 'sales',
  'quote.create': 'sales',
  'customer.view': 'core',
  'booking.view': 'sales',
  'invoice.view': 'receivables',
  'payment.receive': 'receivables',
  'finance.evidence.review': 'receivables',
  'expense.create': 'payables',
  'supplier.view': 'payables',
  'procurement.view': 'procurement',
  'hr.view': 'hr',
  'operations.view': 'maintenance',
  'residents.view': 'residents',
  'reports.view': 'reports',
  'admin.view': 'core',
  'portal.use': 'resident_portal',
  'construction.view': 'construction',
  'workorder.update': 'maintenance',
  'visitors.manage': 'visitors',
  'site.view': 'core',
  'site.manage': 'core',
  'opening_balance.import': 'receivables',
  'opening_balance.approve': 'receivables',
  'charges.manage': 'dues',
  'billing_run.view': 'dues',
  'billing_run.create': 'dues',
  'billing_run.approve': 'dues',
  'billing_run.post': 'dues',
  'credit_note.create': 'receivables',
  'collections.view': 'receivables',
  'bank.view': 'banking',
  'bank.reconcile': 'banking',
  'beneficiary.manage': 'banking',
  'beneficiary.approve': 'banking',
  'payment_methods.manage': 'receivables',
  'billing_policy.manage': 'dues',
  'liability.approve': 'receivables',
  'payment_exception.approve': 'receivables',
  'portal_access.view': 'resident_portal',
  'portal_access.invite': 'resident_portal',
  'data_export.request': 'core',
  'data_export.approve': 'core',
  'privacy.requests.manage': 'core',
  'sessions.manage': 'core',
  'admin.branding': 'core',
  'cashbook.view': 'banking',
  'cash_voucher.prepare': 'banking',
  'cash_voucher.approve': 'banking',
  'funds_transfer.create': 'banking',
  'funds_transfer.approve': 'banking',
  'settlement_exception.approve': 'banking',
  'cheque.manage': 'receivables',
  'payment.batch.confirm': 'receivables',
  'period.close': 'banking',
  'reminders.manage': 'receivables',
  'reminders.send': 'receivables',
  'committee.view': 'residents',
  'committee.manage': 'residents',
  'approval.view': 'core',
  'approval.decide': 'core',
  'approval_policy.manage': 'core',
  'transfer.review': 'residents',
  'transfer.approve': 'residents',
  'clearance.issue': 'residents',
};

/** Something the UI offers (a menu item, action, tour step, link): its module and permission. */
export interface AccessTarget {
  module?: ModuleKey;
  feature?: FeatureKey;
  permission?: Permission | readonly Permission[];
  /** At least one of these is needed as well (e.g. a page for both the requester and the approver). */
  anyOf?: readonly Permission[];
  /** The site in context (the header project's site): the grant must cover it. */
  siteId?: string;
  /** Suspension class of what the target opens; undeclared targets are operational (fail closed). */
  suspension?: SuspensionClass;
}

/**
 * Whether a UI target is available: every listed permission held, and the module licensed and in
 * force (explicit, or the module of the first permission), for the site in context when there is
 * one, and allowed in the tenant's lifecycle for the target's suspension class (operational unless
 * declared). Same layers as `decide`; menus use it so what is offered matches what the API allows.
 */
export function decideTarget(access: EffectiveAccess, target: AccessTarget, at: string): AccessDecision {
  const permissions: readonly Permission[] = target.permission === undefined ? [] : Array.isArray(target.permission) ? target.permission : [target.permission as Permission];
  const module = target.module ?? permissions.map((p) => PERMISSION_MODULE[p]).find((m) => m !== undefined) ?? 'core';
  const context = { at, suspension: target.suspension ?? 'operational', ...(target.siteId ? { siteId: target.siteId } : {}) } as const;
  const base = decide(access, { module, ...(target.feature ? { feature: target.feature } : {}), ...context });
  if (!base.allowed) return base;
  for (const p of permissions) {
    const own = PERMISSION_MODULE[p];
    if (own && own !== module) {
      const d = decide(access, { module: own, permission: p, ...context });
      if (!d.allowed) return d;
    } else if (!access.permissions.includes(p)) return deny('permission_missing');
  }
  if (target.anyOf?.length) {
    const one = target.anyOf.some((p) => decide(access, { module: PERMISSION_MODULE[p] ?? module, permission: p, ...context }).allowed);
    if (!one) return deny('permission_missing');
  }
  return { allowed: true };
}

/**
 * Answer of GET /access/record?id=…: whether the signed-in person may open a record named in an
 * address. `record: false` when the value is not a record id (a filter value, for example).
 */
export type RecordAccess = { record: false } | { record: true; module: ModuleKey; decision: AccessDecision };

/** HTTP status the API uses for a reason: out-of-scope records are "not found", so their existence is not confirmed. */
export function denyStatus(reason: DenyReason): 403 | 404 | 409 {
  if (reason === 'out_of_scope') return 404;
  if (reason === 'state_locked') return 409;
  return 403;
}
