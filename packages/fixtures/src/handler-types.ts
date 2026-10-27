import { ApiError, decide, denyStatus, PERMISSION_MODULE, type AccessDecision, type AccessRecord, type ApiRequest, type EffectiveAccess, type Invoice, type ModuleKey, type Permission, type Persona, type SuspensionClass } from '@repo/contracts';
import type { TenantDataset } from './dataset-types';
import { billingAccountOf, entityOfProject, siteOfProject } from './dataset-types';
import type { DemoPartition } from './demo-store';
import type { TrainingStore } from './training-store';

export interface HandlerContext {
  persona: Persona | undefined;
  /** The signed-in person's tenant and effective access (tenant plane only). */
  tenantId: string | undefined;
  access: EffectiveAccess | null;
  /**
   * The signed-in person's own tenant records. Handlers never import fixture arrays: another
   * organisation's records are not in the data they see (tenant partition by construction).
   */
  data: TenantDataset;
  /** Persona scope AND the header project filter. */
  allowsProject: (projectId: string) => boolean;
  /** Evaluation date of the demo (fixtures are frozen in time). */
  at: string;
  /** Suspension class the matched endpoint declared (record checks use the same class). */
  suspension: SuspensionClass;
  correlationId: string;
  req: ApiRequest;
  params: Record<string, string>;
  training: TrainingStore;
  /** This tenant's partition of the session overlay (writes made while exploring the demo). */
  demo: DemoPartition;
  /** Prototype "Reset demo": discards every partition of this browser session and all practice records. */
  resetDemo: () => void;
}

/**
 * What an endpoint requires (CP2 security correction 1). Declared on every handler and checked by
 * the transport before the handler runs, so an undeclared endpoint cannot exist and nothing is read
 * or changed for a caller who may not use it.
 * - `tenant`: a signed-in person of an organisation with effective access. `permission` is the
 *   permission required (an array means any one of them); `'signed_in'` is only for endpoints every
 *   member may call because the handler filters its results per permission (search, notifications).
 * - `visitor`: open before sign-in (prototype workspace-setup simulation and demo reset only).
 */
export type HandlerAccess =
  | { kind: 'tenant'; module: ModuleKey; permission: Permission | readonly Permission[] | 'signed_in'; suspension: SuspensionClass }
  | { kind: 'visitor'; why: string };

/** A tenant endpoint's declaration: module, permission and suspension class, all stated explicitly. */
export const requires = (module: ModuleKey, permission: Permission | readonly Permission[] | 'signed_in', suspension: SuspensionClass): HandlerAccess => ({ kind: 'tenant', module, permission, suspension });

/** An endpoint open before sign-in (it never reads or changes tenant records). */
export const visitor = (why: string): HandlerAccess => ({ kind: 'visitor', why });

export interface Handler {
  method: ApiRequest['method'];
  pattern: RegExp;
  access: HandlerAccess;
  handle: (ctx: HandlerContext) => unknown;
}

/**
 * Holds the permission AND its module is licensed and in force (a role never reaches an unlicensed
 * module). `suspension` lets an endpoint that mixes kinds (search) treat each kind by its own class.
 */
export function can(ctx: HandlerContext, permission: Permission, suspension: SuspensionClass = ctx.suspension): boolean {
  if (!ctx.access) return false;
  return decide(ctx.access, { module: PERMISSION_MODULE[permission] ?? 'core', permission, at: ctx.at, suspension }).allowed;
}

export function forbid(ctx: HandlerContext): never {
  throw new ApiError({ status: 403, code: 'forbidden', messageKey: 'errors:api.forbidden', correlationId: ctx.correlationId, changed: false });
}

export function notFound(ctx: HandlerContext): never {
  throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: ctx.correlationId, changed: false });
}

export function refused(decision: Extract<AccessDecision, { allowed: false }>, correlationId: string): never {
  throw new ApiError({ status: denyStatus(decision.reason), code: decision.reason, messageKey: `errors:access.${decision.reason}`, correlationId, changed: false });
}

export function invalid(ctx: HandlerContext, field: string, code = 'forms:errors.required'): never {
  throw new ApiError({
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors: { [field]: [{ code }] },
    correlationId: ctx.correlationId,
    changed: false,
  });
}

/** The access facts of a project-bound record: its project, site and legal entity (from the tenant's own data). */
export function projectRecord(ctx: HandlerContext, projectId: string | undefined, extra: AccessRecord = {}): AccessRecord {
  const siteId = siteOfProject(ctx.data, projectId);
  const legalEntityId = entityOfProject(ctx.data, projectId);
  return { ...(projectId ? { projectId } : {}), ...(siteId ? { siteId } : {}), ...(legalEntityId ? { legalEntityId } : {}), ...extra };
}

/**
 * Record-level decision: module grant for the record's site, permission and data scope. A record of a
 * site-scoped module without a known site is refused (site_context_missing), never assumed licensed.
 */
export function decideRecord(ctx: HandlerContext, module: ModuleKey, record: AccessRecord, permission?: Permission): AccessDecision {
  if (!ctx.access) return { allowed: false, reason: 'permission_missing' };
  return decide(ctx.access, { module, record, at: ctx.at, suspension: ctx.suspension, ...(permission ? { permission } : {}) });
}

export const permits = (ctx: HandlerContext, module: ModuleKey, record: AccessRecord, permission?: Permission) => decideRecord(ctx, module, record, permission).allowed;

/** Throws the refusal (403 site_not_licensed, 404 out_of_scope …) unless the record may be used. */
export function authorize(ctx: HandlerContext, module: ModuleKey, record: AccessRecord, permission?: Permission): void {
  const decision = decideRecord(ctx, module, record, permission);
  if (!decision.allowed) refused(decision, ctx.correlationId);
}

/**
 * A financial record (invoice) as an access record, or null when its facts disagree: the unit must
 * belong to the invoice's project and the billing account must be that unit's (the full
 * relationship, CP2 correction 3). An inconsistent record is never shown to anyone.
 */
export function invoiceRecord(ctx: Pick<HandlerContext, 'data'>, i: Invoice): AccessRecord | null {
  const unit = ctx.data.units.find((u) => u.id === i.unitId);
  if (!unit || unit.projectId !== i.projectId || i.billingAccountId !== billingAccountOf(unit.id)) return null;
  return projectRecord(ctx as HandlerContext, i.projectId, { unitId: i.unitId, billingAccountId: i.billingAccountId, asOf: i.dueDate });
}

/** A unit is inventory: reachable only on a site whose inventory module is licensed. */
export const unitPermitted = (ctx: HandlerContext, unit: { projectId: string }) => permits(ctx, 'inventory', projectRecord(ctx, unit.projectId));

/** Project visible by persona scope, ignoring the header project filter (for pickers). */
export function isScopeOnly(ctx: HandlerContext, projectId: string): boolean {
  const scope = ctx.persona?.projectScope ?? [];
  return scope === 'all' || scope.includes(projectId);
}

const norm = (s: string) => s.toLocaleLowerCase('en').replace(/[\s\-+]/g, '');

export function matches(q: string, ...fields: Array<string | undefined>): boolean {
  const needle = norm(q);
  return fields.some((f) => f !== undefined && norm(f).includes(needle));
}
