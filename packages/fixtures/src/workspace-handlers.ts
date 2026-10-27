import { ORGANISATION_TYPES, PROJECT_TYPES, WORKSPACE_ROLES, type DemoOverview, type Party, type WorkspaceProfile, type WorkspaceSetup } from '@repo/contracts';
import { VISITS } from './crm-data';
import { can, forbid, invalid, isScopeOnly, type Handler, type HandlerContext } from './handler-types';
import { PROJECTS, UNITS } from './inventory';
import { PARTIES, TENANT } from './people';
import { INVOICES, LEADS } from './records';

/** Lead statuses that still need someone to follow up. */
const OPEN_LEAD = new Set(['new', 'assigned', 'contacted', 'qualified', 'dormant']);

/**
 * "Your demo is ready" overview: what the demo environment holds for the signed-in identity,
 * computed from the fixtures plus this browser session's demo changes. Counts respect the
 * persona's project scope (not the header filter); kinds the role cannot see are `null`.
 */
function demoOverview(ctx: HandlerContext): DemoOverview {
  if (!ctx.persona || ctx.persona.app !== 'backoffice') forbid(ctx);
  const inScope = (projectId: string) => isScopeOnly(ctx, projectId);
  const seesLeads = can(ctx, 'lead.view');
  const leads = seesLeads ? ctx.demo.leads(LEADS).filter((l) => inScope(l.projectId)) : [];

  let customers: number | null = null;
  if (can(ctx, 'customer.view') || seesLeads) {
    const ids = new Set<string>();
    leads.forEach((l) => ids.add(l.partyId));
    if (can(ctx, 'customer.view')) INVOICES.filter((i) => inScope(i.projectId)).forEach((i) => ids.add(i.partyId));
    const sessionParties = ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties;
    customers = [...sessionParties, ...PARTIES].filter((p) => ids.has(p.id)).length;
  }

  const projects = PROJECTS.filter((p) => inScope(p.id));
  return {
    tenantName: TENANT.name,
    projects: projects.map((p) => ({ id: p.id, name: p.name, city: p.city, kind: p.kind })),
    counts: {
      projects: projects.length,
      units: can(ctx, 'unit.view') ? UNITS.filter((u) => inScope(u.projectId)).length : null,
      customers,
      leads: seesLeads ? leads.length : null,
      siteVisits: seesLeads ? ctx.demo.visits(VISITS).filter((v) => inScope(v.projectId)).length : null,
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
 * Open to visitors without a persona: setup happens before anyone signs in.
 */
export const WORKSPACE_HANDLERS: readonly Handler[] = [
  {
    method: 'POST',
    pattern: /^\/workspace\/verify$/,
    handle: (ctx) => {
      const code = String((ctx.req.body as { code?: string })?.code ?? '');
      if (code !== '246810') invalid(ctx, 'code', 'forms:errors.codeInvalid');
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/workspace$/,
    handle: (ctx): WorkspaceProfile => {
      const setup = (ctx.req.body ?? {}) as WorkspaceSetup;
      checkSetup(ctx, setup);
      const profile: WorkspaceProfile = { ...setup, invites: setup.invites ?? [], createdAt: new Date().toISOString(), simulated: true };
      ctx.demo.workspace = profile;
      return profile;
    },
  },
  {
    method: 'GET',
    pattern: /^\/workspace$/,
    handle: (ctx) => ctx.demo.workspace,
  },
  {
    method: 'GET',
    pattern: /^\/demo\/overview$/,
    handle: demoOverview,
  },
];
