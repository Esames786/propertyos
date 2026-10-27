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
  /** Residents: only units and billing accounts reached through a verified party link. */
  | { type: 'party'; partyId: string; units: readonly string[]; billingAccounts: readonly string[] };

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

function inScope(scopes: readonly AccessScope[], record: AccessRecord, userId: string): boolean {
  return scopes.some((s) => {
    switch (s.type) {
      case 'all':
        return true;
      case 'assigned':
        return record.assignedTo !== undefined && record.assignedTo === userId;
      case 'party':
        return (
          (record.unitId !== undefined && s.units.includes(record.unitId)) ||
          (record.billingAccountId !== undefined && s.billingAccounts.includes(record.billingAccountId))
        );
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
  if (req.feature !== undefined && !access.features.includes(req.feature)) return deny('feature_not_licensed');

  // 4. Permission
  if (req.permission !== undefined && !access.permissions.includes(req.permission)) return deny('permission_missing');

  // 5. Data scope (records only; module-level questions such as "show the Sales menu?" stop at 4)
  if (req.record !== undefined && !inScope(access.scopes, req.record, access.userId)) return deny('out_of_scope');

  // 6. Workflow state
  if (req.state?.locked) return deny('state_locked');
  if (req.state?.makerUserId !== undefined && req.state.makerUserId === access.userId) return deny('separation_of_duties');

  return { allowed: true };
}

/** HTTP status the API uses for a reason: out-of-scope records are "not found", so their existence is not confirmed. */
export function denyStatus(reason: DenyReason): 403 | 404 | 409 {
  if (reason === 'out_of_scope') return 404;
  if (reason === 'state_locked') return 409;
  return 403;
}
