import { permits, type HandlerContext } from '../handler-types';
import type { HrSite, HrState, StoredAssignment, StoredEmployee } from './state';

/**
 * Gate S.2a closure (GitHub Issue #12, P0): record-level HR scope.
 *
 * The organisation keeps one HR state, so the double-booking check sees an employee's duties at
 * every site. Every read, count, summary and action is then limited to what the signed-in person
 * may see:
 * - **HR sites.** A site is visible when the shared access rule (`decide`) allows an `hr` record of
 *   that site and its owning legal entity. The rule checks the tenant, the licence for the site and
 *   the person's data scope (all, legal entity or site), today. It is worked out on every request,
 *   so a revoked or narrowed grant applies at once.
 * - **Site-bound records** (a duty, its attendance and corrections, a roster week, shift times)
 *   follow their site.
 * - **Employee-bound records** (the employee, their documents, leave, advances and history) follow
 *   the employee. The employee's sites come from their dated allocations: those in force or still
 *   to come; for someone whose allocations have all ended (a leaver), the last one. The allocated
 *   site must belong to the employing legal entity, or the record is visible to nobody (fail closed).
 *
 * Anything outside this is treated as not existing. Lists and counts leave it out, and a direct id
 * gets the same "not found" as an id that was never issued.
 *
 * Gate S.2a closure (Issue #14) adds two rules on top:
 * - **Changing** an employee-bound record needs all of the employee's sites (`employeeGoverned`).
 *   Seeing it needs only one.
 * - **Staffing by department** (`views.ts`): someone without `hr.view` or `shifts.manage` sees only
 *   the departments they supervise, at the sites they are allocated to.
 */
export interface HrScope {
  /** Visible HR sites, the organisation's first site first. */
  sites: HrSite[];
  has(siteId: string): boolean;
}

export function scopeOf(ctx: HandlerContext, state: HrState): HrScope {
  const sites = state.sites.filter((s) => permits(ctx, 'hr', { siteId: s.siteId, legalEntityId: s.legalEntityId }));
  return scopeOfSites(sites);
}

export function scopeOfSites(sites: HrSite[]): HrScope {
  const ids = new Set(sites.map((s) => s.siteId));
  return { sites, has: (id) => ids.has(id) };
}

const inForce = (s: StoredEmployee['sites'][number], on: string) => s.from <= on && (!s.to || s.to >= on);

/**
 * The sites an employee belongs to: allocations in force or starting later; for a leaver, the
 * allocations that ended last (the sites they last worked at).
 */
export function homeSites(e: StoredEmployee, today: string): string[] {
  const current = e.sites.filter((s) => !s.to || s.to >= today);
  if (current.length) return [...new Set(current.map((s) => s.siteId))];
  const lastEnd = e.sites.reduce((m, s) => ((s.to ?? '') > m ? (s.to ?? '') : m), '');
  return [...new Set(e.sites.filter((s) => (s.to ?? '') === lastEnd).map((s) => s.siteId))];
}

/** Whether the person may see this employee and everything bound to them. */
export function employeeVisible(state: HrState, scope: HrScope, e: StoredEmployee, today: string): boolean {
  return homeSites(e, today).some((id) => scope.has(id) && state.sites.find((s) => s.siteId === id)?.legalEntityId === e.legalEntityId);
}

/**
 * Gate S.2a closure (GitHub Issue #14, P0): whether the person may change what all of the employee's
 * sites share. Seeing an employee needs one of their sites in scope (`employeeVisible`). Changing the
 * employee-wide record needs **every** one of them, because the change applies at each site the
 * person works at:
 * - their details and role, and the resident-facing profile and consent;
 * - their documents, leave, advances and employment.
 *
 * Each site must belong to the employing legal entity. No site at all means nobody (fail closed).
 * Site-bound records (a duty, its attendance and corrections) follow their own site instead.
 */
export function employeeGoverned(state: HrState, scope: HrScope, e: StoredEmployee, today: string): boolean {
  const homes = homeSites(e, today);
  return homes.length > 0 && homes.every((id) => scope.has(id) && state.sites.find((s) => s.siteId === id)?.legalEntityId === e.legalEntityId);
}

/** Whether the person may see this duty (and its attendance and corrections). */
export const assignmentVisible = (scope: HrScope, a: Pick<StoredAssignment, 'siteId'>) => scope.has(a.siteId);

/** Whether the employee is allocated to the site on the date (a supervisor records only where they work). */
export const allocatedOn = (e: StoredEmployee, siteId: string, on: string) => e.sites.some((s) => s.siteId === siteId && inForce(s, on));
