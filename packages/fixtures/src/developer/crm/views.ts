import type { AssignmentEvent, CalendarVisit, Lead, Opportunity, OpportunityEvent, Party, SiteVisit, VisitEvent } from '@repo/contracts';
import { projectName } from '../../crm-data';
import { unitPermitted, type HandlerContext } from '../../handler-types';
import { personOf, type CrmScope } from './scope';
import type { PipelineState, StoredAssignment, StoredEvent, StoredOpportunity, StoredVisitEvent } from './state';

/**
 * Gate E.1 read models. Everything a reader receives is built here from records they may see, and
 * every nested history is projected for that reader before it is serialised (plan §4.4, Issue #16
 * P0-1): a reader who sees only their own records gets reassignments without the other person's name
 * or the reason (the action and time are kept), and unit references only for units on sites whose
 * inventory they may see. Full-scope readers keep the whole audit.
 */

export interface Ctx {
  ctx: HandlerContext;
  scope: CrmScope;
  st: PipelineState;
}

const sessionParties = (ctx: HandlerContext) => ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties;

export function partyOf(ctx: HandlerContext, partyId: string): Party | undefined {
  return sessionParties(ctx).find((p) => p.id === partyId) ?? ctx.data.parties.find((p) => p.id === partyId);
}

/** Every lead of the tenant with this session's changes (the existing CRM overlay). */
export const allLeads = (ctx: HandlerContext): Lead[] => ctx.demo.leads(ctx.data.leads);

export const visibleLeads = (c: Ctx): Lead[] => allLeads(c.ctx).filter((l) => c.scope.leadVisible(l));

export function leadById(c: Ctx, id: string): Lead | undefined {
  const lead = allLeads(c.ctx).find((l) => l.id === id);
  return lead && c.scope.leadVisible(lead) ? lead : undefined;
}

export function opportunityOfLead(c: Ctx, leadId: string): StoredOpportunity | undefined {
  return c.st.opportunities.find((o) => o.leadId === leadId);
}

/** Visits of the tenant with this session's changes; a visit is the responsibility of its lead's owner. */
export const allVisits = (ctx: HandlerContext): SiteVisit[] => ctx.demo.visits(ctx.data.visits);

export function visitVisible(c: Ctx, v: SiteVisit, leads: Map<string, Lead>): Lead | undefined {
  const lead = leads.get(v.leadId);
  return lead && c.scope.leadVisible(lead) && lead.projectId === v.projectId ? lead : undefined;
}

export const leadMap = (ctx: HandlerContext) => new Map(allLeads(ctx).map((l) => [l.id, l] as const));

const nowMs = (at: string) => Date.parse(at);

export function calendarVisit(c: Ctx, v: SiteVisit, lead: Lead): CalendarVisit {
  const host = personOf(c.ctx, c.scope.ownerOf(lead)) ?? { principalId: '', name: v.ownerName };
  const opp = opportunityOfLead(c, lead.id);
  const party = partyOf(c.ctx, lead.partyId);
  const unit = v.unitRef ? c.ctx.data.units.find((u) => u.ref === v.unitRef && u.projectId === v.projectId) : undefined;
  return {
    id: v.id,
    leadId: lead.id,
    leadRef: lead.ref,
    displayName: party?.displayName ?? v.displayName,
    projectId: v.projectId,
    projectName: projectName(c.ctx.data, v.projectId),
    at: v.at,
    status: v.status,
    host,
    ...(unit && unitPermitted(c.ctx, unit) ? { unitRef: unit.ref } : {}),
    ...(opp ? { opportunityId: opp.id } : {}),
    outcomeRecorded: !!c.st.visits[v.id]?.outcome,
  };
}

export function opportunityView(c: Ctx, o: StoredOpportunity, lead: Lead, visits: SiteVisit[], nowIso: string): Opportunity {
  const party = partyOf(c.ctx, lead.partyId);
  const owner = personOf(c.ctx, c.scope.ownerOf(lead)) ?? { principalId: '', name: '—' };
  const next = visits
    .filter((v) => v.leadId === lead.id && (v.status === 'scheduled' || v.status === 'confirmed') && nowMs(v.at) >= nowMs(nowIso))
    .sort((a, b) => nowMs(a.at) - nowMs(b.at))[0];
  return {
    id: o.id,
    ref: o.ref,
    leadId: lead.id,
    leadRef: lead.ref,
    displayName: party?.displayName ?? '—',
    phone: party?.phone ?? '',
    projectId: o.projectId,
    projectName: projectName(c.ctx.data, o.projectId),
    stage: o.stage,
    value: lead.budget,
    owner,
    ...(o.expectedCloseOn ? { expectedCloseOn: o.expectedCloseOn } : {}),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    version: o.version,
    ...(o.lostReason && o.stage === 'lost' ? { lostReason: o.lostReason } : {}),
    ...(next ? { nextVisitAt: next.at } : {}),
    ...(lead.nextFollowUp ? { nextFollowUp: lead.nextFollowUp } : {}),
  };
}

/** Unit references the reader may see (a unit of another tenant, or of an unlicensed site, is dropped). */
function unitRefs(c: Ctx, ids: readonly string[] | undefined): string[] {
  return (ids ?? []).flatMap((id) => {
    const u = c.ctx.data.units.find((x) => x.id === id);
    return u && unitPermitted(c.ctx, u) ? [u.ref] : [];
  });
}

export function projectEvent(c: Ctx, e: StoredEvent): OpportunityEvent {
  if (e.kind === 'assigned' && !c.scope.whole) {
    // A reader who sees only their own records: the action and time only (no names, no reason).
    return { id: e.id, at: e.at, kind: e.kind, sanitised: true };
  }
  const units = e.units ? unitRefs(c, e.units) : undefined;
  return {
    id: e.id,
    at: e.at,
    kind: e.kind,
    actorName: e.byName,
    ...(e.from ? { from: e.from } : {}),
    ...(e.to ? { to: e.to } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.note ? { note: e.note } : {}),
    ...(e.visitId ? { visitId: e.visitId } : {}),
    ...(units && units.length ? { units } : {}),
  };
}

export function projectAssignment(c: Ctx, a: StoredAssignment): AssignmentEvent {
  if (c.scope.whole) {
    return { id: a.id, at: a.at, actorName: a.byName, ...(a.fromName ? { fromName: a.fromName } : {}), toName: a.toName, reason: a.reason };
  }
  const mine = a.to === c.scope.me ? 'to_me' : a.from === c.scope.me ? 'from_me' : undefined;
  return { id: a.id, at: a.at, ...(mine ? { mine } : {}), sanitised: true };
}

export function projectVisitEvent(e: StoredVisitEvent): VisitEvent {
  const kind = e.kind === 'follow_up' ? 'follow_up' : e.kind;
  return {
    id: e.id,
    at: e.at,
    kind,
    actorName: e.byName,
    ...(e.from ? { from: e.from } : {}),
    ...(e.to ? { to: e.to } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.outcome ? { outcome: e.outcome } : {}),
  };
}
