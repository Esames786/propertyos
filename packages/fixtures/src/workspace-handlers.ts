import { ORGANISATION_TYPES, PROJECT_TYPES, WORKSPACE_ROLES, type DemoOverview, type Party, type WorkspaceProfile, type WorkspaceSetup } from '@repo/contracts';
import { can, forbid, invalid, isScopeOnly, requires, unitPermitted, visitor, type Handler, type HandlerContext } from './handler-types';
import { SEED_CONFIG, signupOf, versionAt } from './platform/config';
import { ACCESS_TODAY, directoryTenant } from './tenant-directory';

/** Lead statuses that still need someone to follow up. */
const OPEN_LEAD = new Set(['new', 'assigned', 'contacted', 'qualified', 'dormant']);

/**
 * "Your demo is ready" overview: what the demo environment holds for the signed-in identity,
 * computed from the signed-in organisation's own records plus its partition of this browser
 * session's demo changes. Counts respect the persona's project scope (not the header filter) and
 * licensed modules; kinds the role cannot see are `null`.
 */
function demoOverview(ctx: HandlerContext): DemoOverview {
  if (!ctx.persona || ctx.persona.app !== 'backoffice') forbid(ctx);
  const inScope = (projectId: string) => isScopeOnly(ctx, projectId);
  const seesLeads = can(ctx, 'lead.view');
  const leads = seesLeads ? ctx.demo.leads(ctx.data.leads).filter((l) => inScope(l.projectId)) : [];

  let customers: number | null = null;
  if (can(ctx, 'customer.view') || seesLeads) {
    const ids = new Set<string>();
    leads.forEach((l) => ids.add(l.partyId));
    if (can(ctx, 'customer.view')) ctx.data.invoices.filter((i) => inScope(i.projectId)).forEach((i) => ids.add(i.partyId));
    const sessionParties = ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties;
    customers = [...sessionParties, ...ctx.data.parties].filter((p) => ids.has(p.id)).length;
  }

  const projects = ctx.data.projects.filter((p) => inScope(p.id));
  return {
    tenantName: directoryTenant(ctx.tenantId ?? '')?.name ?? '',
    projects: projects.map((p) => ({ id: p.id, name: p.name, city: p.city, kind: p.kind })),
    counts: {
      projects: projects.length,
      units: can(ctx, 'unit.view') ? ctx.data.units.filter((u) => inScope(u.projectId) && unitPermitted(ctx, u)).length : null,
      customers,
      leads: seesLeads ? leads.length : null,
      siteVisits: seesLeads ? ctx.demo.visits(ctx.data.visits).filter((v) => inScope(v.projectId)).length : null,
      openFollowUps: seesLeads ? leads.filter((l) => l.nextFollowUp && OPEN_LEAD.has(l.status)).length : null,
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Server-side re-check of the wizard payload (the UI validates first; the API never trusts it). */
function checkSetup(ctx: HandlerContext, setup: WorkspaceSetup): void {
  if (!setup.account?.fullName?.trim()) invalid(ctx, 'account.fullName');
  if (!EMAIL.test(setup.account?.email ?? '')) invalid(ctx, 'account.email', 'forms:errors.emailInvalid');
  if (!setup.organisation?.name?.trim()) invalid(ctx, 'organisation.name');
  if (!ORGANISATION_TYPES.includes(setup.organisation.type)) invalid(ctx, 'organisation.type', 'forms:errors.selectOne');
  if (setup.organisation.currency !== 'PKR') invalid(ctx, 'organisation.currency', 'forms:errors.selectOne');
  if (setup.project) {
    if (!setup.project.name?.trim()) invalid(ctx, 'project.name');
    if (!PROJECT_TYPES.includes(setup.project.type)) invalid(ctx, 'project.type', 'forms:errors.selectOne');
    if (!Number.isInteger(setup.project.expectedUnits) || setup.project.expectedUnits < 1) invalid(ctx, 'project.expectedUnits');
  }
  (setup.invites ?? []).forEach((invite, i) => {
    if (!EMAIL.test(invite.email ?? '')) invalid(ctx, `invites.${i}.email`, 'forms:errors.emailInvalid');
    if (!WORKSPACE_ROLES.includes(invite.role)) invalid(ctx, `invites.${i}.role`, 'forms:errors.selectOne');
  });
}

/**
 * Developer-workspace setup simulation (Stage 1.5R). The submitted profile is kept in the demo
 * session only: nothing is provisioned, no email or SMS is sent and no account exists afterwards.
 * Open to visitors without a persona: setup happens before anyone signs in, so these endpoints
 * keep their state in the visitor partition and never touch an organisation's records.
 */
export const WORKSPACE_HANDLERS: readonly Handler[] = [
  {
    method: 'POST',
    pattern: /^\/workspace\/verify$/,
    access: visitor('Workspace-setup simulation before sign-in: checks the prototype code only.'),
    handle: (ctx) => {
      const code = String((ctx.req.body as { code?: string })?.code ?? '');
      if (code !== '246810') invalid(ctx, 'code', 'forms:errors.codeInvalid');
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/workspace$/,
    access: visitor('Workspace-setup simulation before sign-in: stores the visitor’s own profile.'),
    handle: (ctx): WorkspaceProfile => {
      const setup = (ctx.req.body ?? {}) as WorkspaceSetup;
      checkSetup(ctx, setup);
      // The developer signup policy in force decides what a real signup would lead to (seeded version).
      const version = versionAt(SEED_CONFIG, 'signup_policy', ACCESS_TODAY);
      const signup = signupOf(version);
      const declared = setup.project?.expectedUnits ?? 0;
      const outcome = signup.byEdition.developer === 'self_service_trial' && declared > signup.maxSelfServiceUnits ? 'approval_required' : signup.byEdition.developer;
      const profile: WorkspaceProfile = { ...setup, invites: setup.invites ?? [], createdAt: new Date().toISOString(), simulated: true, signup: { policy: outcome, version: version.label } };
      ctx.demo.workspace = profile;
      return profile;
    },
  },
  {
    method: 'GET',
    pattern: /^\/workspace$/,
    access: visitor('Workspace-setup simulation before sign-in: returns the visitor’s own profile.'),
    handle: (ctx) => ctx.demo.workspace,
  },
  {
    method: 'GET',
    pattern: /^\/demo\/overview$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: demoOverview,
  },
];
