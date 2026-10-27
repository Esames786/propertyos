import { AUDIT_CATEGORIES, type AuditCategory, type PlatformAuditEvent } from '@repo/contracts';
import { q, type PlatformContext, type PlatformHandler } from './kit';

/**
 * The complete commercial audit trail (Gate B remaining scope): every change to tenants, contracts,
 * grants, approvals, configuration versions, requests and previews, with principal, time and what
 * changed. Filterable; nothing in it can be edited or removed.
 */
const CATEGORY_OF: Record<string, AuditCategory> = {
  tenantCreated: 'tenants',
  tenantSuspended: 'tenants',
  graceStarted: 'tenants',
  trialStarted: 'tenants',
  contractActivated: 'contracts',
  amendmentRequested: 'contracts',
  amendmentScheduled: 'contracts',
  amendmentInForce: 'contracts',
  amendmentWithdrawn: 'contracts',
  grantsChanged: 'grants',
  approvalRequested: 'approvals',
  approvalGranted: 'approvals',
  approvalReturned: 'approvals',
  configDrafted: 'configuration',
  configSubmitted: 'configuration',
  configApproved: 'configuration',
  configReturned: 'configuration',
  configWithdrawn: 'configuration',
  requestReceived: 'requests',
  requestDecided: 'requests',
  usageCorrected: 'usage',
  previewOpened: 'previews',
};

export const categoryOf = (e: PlatformAuditEvent): AuditCategory => CATEGORY_OF[e.action] ?? 'tenants';

export interface AuditResponse {
  items: Array<PlatformAuditEvent & { category: AuditCategory }>;
  total: number;
  counts: Record<AuditCategory, number>;
}

function list(ctx: PlatformContext): AuditResponse {
  const all = ctx.store.audit().map((e) => ({ ...e, category: categoryOf(e) }));
  const category = q(ctx, 'category');
  const tenant = q(ctx, 'tenant');
  const actor = q(ctx, 'actor');
  const items = all
    .filter((e) => !category || e.category === category)
    .filter((e) => !tenant || e.tenantId === tenant)
    .filter((e) => !actor || e.actorId === actor)
    .sort((a, b) => b.at.localeCompare(a.at));
  const counts = Object.fromEntries(AUDIT_CATEGORIES.map((c) => [c, all.filter((e) => e.category === c && (!tenant || e.tenantId === tenant)).length])) as AuditResponse['counts'];
  return { items, total: items.length, counts };
}

export const AUDIT_HANDLERS: PlatformHandler[] = [{ method: 'GET', pattern: /^\/platform\/audit$/, permission: 'platform.audit.view', handle: list }];
