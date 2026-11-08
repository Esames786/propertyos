import { ApiError, decide, type ModuleKey, type Permission, type Project, type Unit } from '@repo/contracts';
import { can, decideRecord, notFound, projectRecord, type HandlerContext } from '../../handler-types';
import type { SetupRecordState } from './state';

/**
 * Gate E.2 module-local scope helpers (provisional; replace with E.0's `developer/scope.ts`
 * `projectVisible`/`projectGoverned` at Wave 1 integration). Built on the accepted `projectRecord` and
 * `decideRecord` (module grant for the record's site, permission, data scope), as HR's
 * `employeeVisible`/`employeeGoverned` split what a person may see from what they may change.
 *
 * - "Visible" uses the person's own scope (persona scope, site grants), never the header filter, so a
 *   record named by id answers the same whatever project the header shows; lists additionally follow the
 *   header filter (`ctx.allowsProject`).
 * - Everything a person may not see answers exactly like an id never issued (404 `not_found`, §4.3).
 */

/** Readers of the projects area: the register's `project.view`, or `unit.view` (the Projects menu's permission today). */
export const PROJECT_READERS: readonly Permission[] = ['project.view', 'unit.view'];

const operational = (ctx: HandlerContext): HandlerContext => ({ ...ctx, suspension: 'operational' });

export const tenantProject = (ctx: HandlerContext, projectId: string | undefined): Project | undefined => (projectId ? ctx.data.projects.find((p) => p.id === projectId) : undefined);

/** A project of this tenant the person may open in the projects area (persona scope; header filter ignored). */
export function projectVisible(ctx: HandlerContext, projectId: string): boolean {
  if (!tenantProject(ctx, projectId)) return false;
  if (!PROJECT_READERS.some((p) => can(ctx, p))) return false;
  return decideRecord(operational(ctx), 'projects', projectRecord(ctx, projectId)).allowed;
}

/** A project whose inventory the person may see: inventory licensed for its site, `unit.view`, in scope. */
export function inventoryVisible(ctx: HandlerContext, projectId: string): boolean {
  if (!tenantProject(ctx, projectId)) return false;
  return decideRecord(operational(ctx), 'inventory', projectRecord(ctx, projectId), 'unit.view').allowed;
}

/** Why a project's figures of a module are withheld (null when they may be shown). */
export function withheld(ctx: HandlerContext, module: ModuleKey, projectId: string, permission: Permission): 'not_in_plan' | 'no_permission' | null {
  const record = projectRecord(ctx, projectId);
  const licence = decideRecord(operational(ctx), module, record);
  if (!licence.allowed) return licence.reason === 'out_of_scope' ? 'no_permission' : 'not_in_plan';
  return decideRecord(operational(ctx), module, record, permission).allowed ? null : 'no_permission';
}

/** Whether a module is licensed for a site at all (Project 360 tabs). */
export function licensedOnSite(ctx: HandlerContext, module: ModuleKey, siteId: string): boolean {
  if (!ctx.access) return false;
  return decide(ctx.access, { module, siteId, at: ctx.at, suspension: 'history_read' }).allowed;
}

/** Leads the person may see (persona scope on the lead's project; `lead.view`). */
export const leadVisible = (ctx: HandlerContext, projectId: string): boolean => can(ctx, 'lead.view', 'operational') && decideRecord(operational(ctx), 'crm', projectRecord(ctx, projectId), 'lead.view').allowed;

/** A unit named in a path: this tenant's, with its inventory visible; otherwise exactly like an unknown id. */
export function scopedUnit(ctx: HandlerContext, unitId: string | undefined): Unit {
  const unit = unitId ? ctx.data.units.find((u) => u.id === unitId) : undefined;
  if (!unit || !inventoryVisible(ctx, unit.projectId)) notFound(ctx);
  return unit;
}

/** The person's scope covers the whole organisation (a new project has no id any narrower scope could name). */
export const organisationWide = (ctx: HandlerContext): boolean => !!ctx.access && ctx.access.scopes.some((s) => s.type === 'all');

/** People who work on project setup (drafts, submissions and returns are theirs only). */
export const SETUP_PEOPLE: readonly Permission[] = ['project.view', 'project.manage', 'project.approve'];

/**
 * A project setup record the person may see: drafts, submitted and returned records only by the people
 * who work on setup, an activated project by every reader of the projects area; either way with an
 * organisation-wide scope, or a site scope covering the record's site, and the site still licensed.
 * Anyone else gets the same answer as for an id never issued.
 */
export function setupVisible(ctx: HandlerContext, r: SetupRecordState): boolean {
  const readers = r.state === 'active' ? [...SETUP_PEOPLE, ...PROJECT_READERS] : SETUP_PEOPLE;
  if (!readers.some((p) => can(ctx, p))) return false;
  if (!ctx.access) return false;
  if (organisationWide(ctx)) return r.site ? licensedOnSite(ctx, 'projects', r.site.siteId) : true;
  return !!r.site && decideRecord(operational(ctx), 'projects', { projectId: r.id, siteId: r.site.siteId, legalEntityId: r.site.legalEntityId }).allowed;
}

/** A refusal with its own code and message (nothing is changed). */
export function problem(ctx: HandlerContext, status: number, code: string, messageKey: string, errors?: Record<string, Array<{ code: string; params?: Record<string, string> }>>): never {
  throw new ApiError({ status, code, messageKey, ...(errors ? { errors } : {}), correlationId: ctx.correlationId, changed: false });
}

/** A field problem (422). The code never names a record the reader cannot see (§4.2 step 6). */
export function fieldProblem(ctx: HandlerContext, field: string, code: string, params?: Record<string, string>): never {
  problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code, ...(params ? { params } : {}) }] });
}
