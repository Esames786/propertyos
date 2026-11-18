import { decide, type Lead, type Persona, type SalesPerson } from '@repo/contracts';
import { can, decideRecord, projectRecord, type HandlerContext } from '../../handler-types';
import { ALL_PERSONAS } from '../../people';
import { effectiveAccessFor } from '../../tenant-directory';
import { projectGoverned, projectVisible as visibleProject, type ScopeNeed } from '../scope';

const CRM_LEADS: ScopeNeed = { module: 'crm', permission: 'lead.view' };

/**
 * Gate E.1 scope for the CRM pipeline ("project + assigned", decision E-05; its proposed default is not
 * approved, so the conservative reading applies to the new E.1 endpoints only):
 * - a person with `lead.assign` (a sales manager) sees every lead, opportunity and visit of the
 *   projects in their scope;
 * - anyone else with `lead.view` sees only what is assigned to them in those projects.
 * A project is in scope when the person's project scope and the header filter allow it AND the CRM
 * grant, the permission and the data scope of their effective access cover it (so a narrowed or
 * revoked access hides records on the very next request). The existing lead list and Sales home keep
 * their whole-project rule until E-05 is decided.
 *
 * Wave 1 integration (Issue #25): a project is in scope through E.0's `developer/scope.ts` `projectVisible`
 * (need: CRM, `lead.view`), which is exactly E.1's former check (this organisation's project, the header
 * filter, and the access rule's `decideRecord` on the project's record). The "assigned" layer of E-05 on top
 * of it is the CRM's own rule and stays here.
 */

export interface CrmScope {
  me: string;
  /** Sees every record of the projects in scope (`lead.assign`). */
  whole: boolean;
  /** May convert, move, lose and reopen (`lead.manage` and `lead.assign`; Wave 1 integration, see handlers.ts `PIPELINE_MANAGER`). */
  manage: boolean;
  projectVisible: (projectId: string) => boolean;
  ownerOf: (lead: Lead) => string;
  /** THE record-level lead rule (E-05, conservative): project in CRM scope (with the header project) AND assigned to the reader or `lead.assign` there. */
  leadVisible: (lead: Lead) => boolean;
  /**
   * The same rule for a lead reached by id or through another record (a hold, an event, a related card): the header
   * project is a view, not a filter, so it is not consulted (E.0's visible vs governed split). F-GPT-W1-01.
   */
  leadOpen: (lead: Lead) => boolean;
}

/** Staff of the caller's own organisation (backoffice identities offered on the sign-in page). */
export const staffOf = (ctx: Pick<HandlerContext, 'tenantId'>): Persona[] => ALL_PERSONAS.filter((p) => p.tenantId === ctx.tenantId && p.app === 'backoffice' && !p.unlisted);

export function personOf(ctx: HandlerContext, principalId: string | undefined): SalesPerson | undefined {
  const p = principalId ? staffOf(ctx).find((x) => x.principalId === principalId) : undefined;
  return p ? { principalId: p.principalId, name: p.displayName } : undefined;
}

export function crmScope(ctx: HandlerContext): CrmScope {
  const staff = staffOf(ctx);
  const me = ctx.persona?.principalId ?? '';
  const whole = can(ctx, 'lead.assign');
  const manage = can(ctx, 'lead.manage') && can(ctx, 'lead.assign');
  const projects = new Map<string, boolean>();
  const projectVisible = (projectId: string) => {
    if (!projects.has(projectId)) projects.set(projectId, visibleProject(ctx, projectId, CRM_LEADS));
    return projects.get(projectId)!;
  };
  const ownerOf = (lead: Lead) => staff.find((p) => p.id === lead.ownerPersonaId)?.principalId ?? '';
  // F-GPT-W1-01 (Issue #25 review): `lead.assign` counts within the lead's own project only (the access rule on that
  // project's record), so a manager stays scoped to their projects on every surface.
  const assigners = new Map<string, boolean>();
  const assignsIn = (projectId: string) => {
    if (!assigners.has(projectId)) assigners.set(projectId, decideRecord(ctx, 'crm', projectRecord(ctx, projectId), 'lead.assign').allowed);
    return assigners.get(projectId)!;
  };
  const governed = new Map<string, boolean>();
  const projectOpen = (projectId: string) => {
    if (!governed.has(projectId)) governed.set(projectId, projectGoverned(ctx, projectId, CRM_LEADS));
    return governed.get(projectId)!;
  };
  const assignedOrAssigner = (lead: Lead) => ownerOf(lead) === me || assignsIn(lead.projectId);
  return {
    me,
    whole,
    manage,
    projectVisible,
    ownerOf,
    leadVisible: (lead) => !!me && projectVisible(lead.projectId) && assignedOrAssigner(lead),
    leadOpen: (lead) => !!me && projectOpen(lead.projectId) && assignedOrAssigner(lead),
  };
}

/**
 * F-GPT-W1-01: the one CRM scope of a request context, built once and reused by every developer surface that shows
 * something of a lead (hold views, the hold picker and hold write, Project 360's leads and counts, the inventory
 * activity, the E.13 record registry). A changed grant or a reassignment applies on the next request (a new context).
 */
const SCOPES = new WeakMap<HandlerContext, CrmScope>();
export function crmScopeOf(ctx: HandlerContext): CrmScope {
  let s = SCOPES.get(ctx);
  if (!s) SCOPES.set(ctx, (s = crmScope(ctx)));
  return s;
}

/** May this reader see this lead, reached by id or through another record (`leadOpen`)? */
export const leadOpenTo = (ctx: HandlerContext, lead: Lead): boolean => crmScopeOf(ctx).leadOpen(lead);

/**
 * Whether a person may be given a lead: staff of the same organisation who hold `lead.view` and
 * `lead.manage` for the lead's project (their own project scope and effective access). Anyone else, and
 * any id that is not a person of this organisation, is refused with the same answer.
 *
 * Wave 1 integration (Issue #25): an owner must be able to work the lead. Since E.0's F-3, activity, status
 * and follow-ups need `lead.manage`, so a person who only reads leads (E.13's records clerk reads them for
 * their documents) is never offered as an owner.
 */
export function mayHold(ctx: HandlerContext, person: Persona, projectId: string): boolean {
  if (person.tenantId !== ctx.tenantId || person.app !== 'backoffice' || person.unlisted) return false;
  if (person.projectScope !== 'all' && !person.projectScope.includes(projectId)) return false;
  const access = effectiveAccessFor(person);
  if (!access) return false;
  const allowed = (permission: 'lead.view' | 'lead.manage') => decide(access, { module: 'crm', permission, record: projectRecord(ctx, projectId), at: ctx.at, suspension: 'operational' }).allowed;
  return allowed('lead.view') && allowed('lead.manage');
}
