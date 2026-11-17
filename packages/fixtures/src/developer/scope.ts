import type { AccessRecord, DeveloperState, ModuleKey, Permission } from '@repo/contracts';
import { decideRecord, notFound, projectRecord, type HandlerContext } from '../handler-types';

/**
 * Gate E.0 deliverable 2: record scope for the developer ERP (plan §4.1, §4.3), built on the shared
 * access rule (`decide` through `decideRecord`/`projectRecord`) and, for reading views, the header project
 * (`ctx.allowsProject`). Worked out on every request, so a revoked or narrowed grant applies at once.
 *
 * The same "visible vs governs" split as HR (`hr/scope.ts` `employeeVisible` / `employeeGoverned`) and
 * payroll (`entityWhole`):
 * - **visible**: the reader may see the record (one of what it touches is in their scope);
 * - **governed / whole**: the person may change what the record shares, or see entity-wide totals,
 *   because their scope covers **everything** the record touches. Nothing touched means nobody (fail closed).
 *
 * `need` names the module whose grant and data scope apply (and optionally the permission): projects for
 * PRJ, inventory for INV, accounting for the ledger, banking for statements, core for documents.
 *
 * Anything outside scope is treated as not existing: lists leave it out, counts do not include it, and an
 * id named in a path, query or body gets the same 404 as an id never issued (`requireProject`,
 * `requireEntity`, `requireCostCentre`; owner decision E-28's conservative default for Gate E records).
 * Licensing outcomes of the CP2 routes that already exist are not changed here.
 */

export interface ScopeNeed {
  module: ModuleKey;
  permission?: Permission;
}

const tenantProject = (ctx: HandlerContext, projectId: string | undefined) => (projectId ? ctx.data.projects.find((p) => p.id === projectId) : undefined);
const allows = (ctx: HandlerContext, need: ScopeNeed, record: AccessRecord) => decideRecord(ctx, need.module, record, need.permission).allowed;

/** The organisation's projects of one legal entity (from its own records). */
export const projectsOfEntity = (ctx: HandlerContext, legalEntityId: string) => ctx.data.projects.filter((p) => p.legalEntityId === legalEntityId);

/** The legal entity that sells and keeps books for a project, or undefined for a project not of this organisation. */
export const entityOfProject = (ctx: HandlerContext, projectId: string) => tenantProject(ctx, projectId)?.legalEntityId;

/** Reading view: the project is this organisation's, the header project allows it, and the access rule allows a record of it. */
export function projectVisible(ctx: HandlerContext, projectId: string, need: ScopeNeed): boolean {
  const p = tenantProject(ctx, projectId);
  return !!p && ctx.allowsProject(p.id) && allows(ctx, need, projectRecord(ctx, p.id));
}

/**
 * Authority to change: every project the record touches is this organisation's and within the person's
 * grant. The header project is a view, not authority, so it is not consulted. No project = nobody.
 */
export function projectGoverned(ctx: HandlerContext, projectIds: string | readonly string[], need: ScopeNeed): boolean {
  const ids = typeof projectIds === 'string' ? [projectIds] : projectIds;
  return ids.length > 0 && ids.every((id) => !!tenantProject(ctx, id) && allows(ctx, need, projectRecord(ctx, id)));
}

/** The person's scope reaches the entity: entity-wide (all, or that legal entity) or at least one of its projects. */
export function entityVisible(ctx: HandlerContext, legalEntityId: string, need: ScopeNeed): boolean {
  const projects = projectsOfEntity(ctx, legalEntityId);
  if (!projects.length) return false;
  return allows(ctx, need, { legalEntityId }) || projects.some((p) => allows(ctx, need, projectRecord(ctx, p.id)));
}

/**
 * Everything of the entity: an entity-wide scope, or every one of its projects. Needed for entity-wide
 * totals (trial balance, aging), period close and any change that applies to the whole entity.
 */
export function entityWhole(ctx: HandlerContext, legalEntityId: string, need: ScopeNeed): boolean {
  const projects = projectsOfEntity(ctx, legalEntityId);
  if (!projects.length) return false;
  return allows(ctx, need, { legalEntityId }) || projects.every((p) => allows(ctx, need, projectRecord(ctx, p.id)));
}

/**
 * A cost centre: a project cost centre follows its project (which must belong to the cost centre's entity);
 * an entity-level one (head office, sales) needs the whole entity.
 */
export function costCentreVisible(ctx: HandlerContext, state: DeveloperState, costCentreId: string, need: ScopeNeed): boolean {
  const cc = state.costCentres.find((c) => c.id === costCentreId);
  if (!cc || !projectsOfEntity(ctx, cc.legalEntityId).length) return false;
  if (cc.projectId) return entityOfProject(ctx, cc.projectId) === cc.legalEntityId && allows(ctx, need, projectRecord(ctx, cc.projectId));
  return entityWhole(ctx, cc.legalEntityId, need);
}

/** Lists: the projects and entities the reader may see. */
export const visibleProjectIds = (ctx: HandlerContext, need: ScopeNeed) => ctx.data.projects.filter((p) => projectVisible(ctx, p.id, need)).map((p) => p.id);
export const visibleEntityIds = (ctx: HandlerContext, need: ScopeNeed) => [...new Set(ctx.data.projects.map((p) => p.legalEntityId))].filter((id) => entityVisible(ctx, id, need));

/** An id named in a request: out of scope answers exactly like never issued (404 `not_found`). */
export function requireProject(ctx: HandlerContext, projectId: string | undefined, need: ScopeNeed): string {
  if (!projectId || !projectVisible(ctx, projectId, need)) notFound(ctx);
  return projectId;
}

export function requireEntity(ctx: HandlerContext, legalEntityId: string | undefined, need: ScopeNeed): string {
  if (!legalEntityId || !entityVisible(ctx, legalEntityId, need)) notFound(ctx);
  return legalEntityId;
}

export function requireCostCentre(ctx: HandlerContext, state: DeveloperState, costCentreId: string | undefined, need: ScopeNeed): string {
  if (!costCentreId || !costCentreVisible(ctx, state, costCentreId, need)) notFound(ctx);
  return costCentreId;
}
