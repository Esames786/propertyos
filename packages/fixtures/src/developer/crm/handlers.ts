import {
  ApiError,
  ASSIGNMENT_FILTERS,
  LEAD_SOURCES,
  LOST_REASONS,
  OPEN_STAGES,
  OPPORTUNITY_SORTS,
  OPPORTUNITY_STAGES,
  SITE_VISIT_INTEREST,
  SITE_VISIT_OUTCOMES,
  type ActivityEvent,
  type AssigneeOption,
  type AssignmentFilter,
  type AssignmentLead,
  type AssignmentList,
  type AssignmentResult,
  type CalendarVisit,
  type Lead,
  type LeadSource,
  type Opportunity,
  type OpportunityDetail,
  type OpportunityList,
  type OpportunitySort,
  type OpportunityStage,
  type SalesPerson,
  type VisitCalendar,
  type VisitDetail,
  type SiteVisitInterest,
  type SiteVisitOutcome,
  type VisitStatus,
} from '@repo/contracts';
import { zonedStamp } from '../../clock';
import { projectName } from '../../crm-data';
import { can, matches, notFound, requires, unitPermitted, type Handler, type HandlerContext } from '../../handler-types';
import { ALL_PERSONAS } from '../../people';
import { bound } from './idempotency';
import { byStage, canConvert, isOpen, stageSummaries, transition, type StageRefusal } from './pipeline';
import { crmScope, mayHold, personOf, staffOf } from './scope';
import { nextId, opportunityIdFor, opportunityRefFor, pipelineState, type StoredEvent, type StoredOpportunity, type StoredVisitDetail, type StoredVisitEvent } from './state';
import {
  allLeads,
  allVisits,
  calendarVisit,
  leadById,
  leadMap,
  opportunityOfLead,
  opportunityView,
  partyOf,
  projectAssignment,
  projectEvent,
  projectVisitEvent,
  visibleLeads,
  visitVisible,
  type Ctx,
} from './views';

/**
 * Gate E.1 endpoints: opportunities (CRM-007/008), lead assignment (CRM-006), the site-visit calendar
 * (CRM-009) and the visit workspace (CRM-011). The transport checks the CRM module, the permission and
 * the suspension class first. Then every changing handler checks, in this order (plan §4.2, the
 * accepted S.3 sequence):
 * 1. **Authority and ids**: the record must be one the caller may see under the E.1 scope
 *    (`scope.ts`); an id outside it is answered exactly like an id never issued (404 `not_found`, the
 *    same body). A person named in a body (an assignee) is refused with one field answer whether the id
 *    is invented, of another organisation, or a colleague who does not hold the lead's project.
 * 2. **Idempotency** (conversion only): request-bound (`idempotency.ts`).
 * 3. **The record's state**: its version, its stage, the visit's status.
 * 4. **Validation** of every field before anything is stored; a message never names a hidden record.
 * 5. Mutate, then audit (opportunity timeline, visit history, the lead's own activity).
 * A refused request changes nothing. None of these endpoints can be used in practice mode.
 */

const PAGE = 20;
const ASSIGN_PAGE = 12;
const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Body = Record<string, unknown>;
const body = (ctx: HandlerContext): Body => (ctx.req.body && typeof ctx.req.body === 'object' ? (ctx.req.body as Body) : {});
const q = (ctx: HandlerContext, key: string) => String(ctx.req.query?.[key] ?? '').trim();
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function refuse(ctx: HandlerContext, status: number, code: string): never {
  throw new ApiError({ status, code, messageKey: `sales:problems.${code}`, correlationId: ctx.correlationId, changed: false });
}

function fieldError(ctx: HandlerContext, field: string, code: string, params?: Record<string, string>): never {
  throw new ApiError({
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors: { [field]: [{ code: `sales:errors.${code}`, ...(params ? { params } : {}) }] },
    correlationId: ctx.correlationId,
    changed: false,
  });
}

/** Practice mode has no pipeline records: every change is refused before anything is read. */
function official(ctx: HandlerContext): void {
  if (ctx.req.training) refuse(ctx, 403, 'training_not_supported');
}

const open = (ctx: HandlerContext): Ctx => ({ ctx, scope: crmScope(ctx), st: pipelineState(ctx) });
const now = (ctx: HandlerContext) => zonedStamp(ctx.at);
const me = (c: Ctx) => ({ by: c.scope.me, byName: c.ctx.persona?.displayName ?? '' });
const save = (c: Ctx) => c.ctx.demo.save();

function leadActivity(ctx: HandlerContext, leadId: string, messageKey: string, params: Record<string, string> = {}, kind: ActivityEvent['kind'] = 'status') {
  ctx.demo.addActivity(leadId, { id: ctx.demo.nextId('act'), at: now(ctx), actorName: ctx.persona?.displayName ?? 'System', messageKey, params, kind });
}

const visibleProjects = (c: Ctx) => c.ctx.data.projects.filter((p) => c.scope.projectVisible(p.id)).map((p) => ({ id: p.id, name: p.name }));

/** People the reader may filter by: themselves only, or (a sales manager) everyone who holds one of their projects. */
function ownerOptions(c: Ctx): SalesPerson[] {
  if (!c.scope.whole) {
    const self = personOf(c.ctx, c.scope.me);
    return self ? [self] : [];
  }
  const projects = visibleProjects(c);
  return staffOf(c.ctx)
    .filter((p) => projects.some((pr) => mayHold(c.ctx, p, pr.id)))
    .map((p) => ({ principalId: p.principalId, name: p.displayName }));
}

// ── Opportunities ────────────────────────────────────────────────────────────────────────────────

function opportunitiesOf(c: Ctx): Opportunity[] {
  const leads = leadMap(c.ctx);
  const visits = allVisits(c.ctx);
  const at = now(c.ctx);
  return c.st.opportunities.flatMap((o) => {
    const lead = leads.get(o.leadId);
    return lead && lead.projectId === o.projectId && c.scope.leadVisible(lead) ? [opportunityView(c, o, lead, visits, at)] : [];
  });
}

function findOpportunity(c: Ctx, id: string | undefined): { o: StoredOpportunity; lead: Lead } {
  const o = c.st.opportunities.find((x) => x.id === id);
  const lead = o ? leadById(c, o.leadId) : undefined;
  if (!o || !lead || lead.projectId !== o.projectId) notFound(c.ctx);
  return { o, lead };
}

const SORTS: Record<OpportunitySort, (a: Opportunity, b: Opportunity) => number> = {
  updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.ref.localeCompare(b.ref),
  value: (a, b) => Number(b.value.amount) - Number(a.value.amount) || a.ref.localeCompare(b.ref),
  close: (a, b) => (a.expectedCloseOn ?? '9999').localeCompare(b.expectedCloseOn ?? '9999') || a.ref.localeCompare(b.ref),
  name: (a, b) => a.displayName.localeCompare(b.displayName) || a.ref.localeCompare(b.ref),
};

function detailOf(c: Ctx, o: StoredOpportunity, lead: Lead): OpportunityDetail {
  const party = partyOf(c.ctx, lead.partyId);
  const visits = allVisits(c.ctx);
  const interestId = (lead as Lead & { interestUnitId?: string }).interestUnitId;
  const interest = interestId ? c.ctx.data.units.find((u) => u.id === interestId) : undefined;
  const open = isOpen(o.stage);
  return {
    opportunity: opportunityView(c, o, lead, visits, now(c.ctx)),
    lead: { id: lead.id, ref: lead.ref, status: lead.status, source: lead.source, ...(lead.nextFollowUp ? { nextFollowUp: lead.nextFollowUp } : {}) },
    party: { displayName: party?.displayName ?? '—', phone: party?.phone ?? '', ...(party?.email ? { email: party.email } : {}) },
    interestUnit: interest && interest.projectId === lead.projectId && unitPermitted(c.ctx, interest) ? { id: interest.id, ref: interest.ref } : null,
    visits: visits
      .filter((v) => v.leadId === lead.id && v.projectId === lead.projectId)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .map((v) => calendarVisit(c, v, lead)),
    timeline: o.events.map((e) => projectEvent(c, e)),
    ...(o.stage === 'lost' && o.lostNote ? { lostNote: o.lostNote } : {}),
    allowed: {
      move: c.scope.manage && open ? OPEN_STAGES.filter((s) => s !== o.stage) : [],
      lose: c.scope.manage && open,
      reopen: c.scope.manage && o.stage === 'lost',
      reassign: c.scope.whole,
      scheduleVisit: can(c.ctx, 'visit.schedule') && open,
    },
  };
}

/** The version a change was made on must still be the record's (a stale board card is refused). */
function current(c: Ctx, o: { version: number }): void {
  if (body(c.ctx).version !== o.version) refuse(c.ctx, 409, 'stale_version');
}

function stageProblem(ctx: HandlerContext, code: StageRefusal): never {
  if (code === 'booking_required' || code === 'not_open' || code === 'not_lost') refuse(ctx, 409, code);
  if (code === 'invalid_reason') fieldError(ctx, 'reason', 'reasonRequired');
  if (code === 'note_required') fieldError(ctx, 'note', 'noteRequired');
  fieldError(ctx, 'stage', code === 'same_stage' ? 'sameStage' : code === 'use_lost' ? 'useLost' : 'stageInvalid');
}

function note(ctx: HandlerContext, raw: unknown, max: number, field = 'note'): string {
  const v = str(raw);
  if (v.length > max) fieldError(ctx, field, 'tooLong', { max: String(max) });
  return v;
}

function changeStage(c: Ctx, o: StoredOpportunity, to: OpportunityStage, event: Omit<StoredEvent, 'id' | 'at' | 'by' | 'byName'>, patch: Partial<StoredOpportunity> = {}) {
  const at = now(c.ctx);
  o.events.unshift({ id: nextId(c.st, 'oev'), at, ...me(c), ...event });
  Object.assign(o, patch, { stage: to, updatedAt: at, version: o.version + 1 });
  if (to !== 'lost') {
    delete o.lostReason;
    delete o.lostNote;
    delete o.lostFrom;
  }
  save(c);
}

const OPPORTUNITY_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/opportunities$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx): OpportunityList => {
      const c = open(ctx);
      let items = opportunitiesOf(c);
      const project = q(ctx, 'project');
      const owner = q(ctx, 'owner');
      const lead = q(ctx, 'lead');
      const text = q(ctx, 'q');
      if (project && project !== 'all') items = items.filter((i) => i.projectId === project);
      if (owner && owner !== 'all') items = items.filter((i) => i.owner.principalId === owner);
      if (lead) items = items.filter((i) => i.leadId === lead);
      if (text) items = items.filter((i) => matches(text, i.displayName, i.ref, i.leadRef, i.phone));
      const stages = stageSummaries(items);
      const stageParam = q(ctx, 'stage');
      const stage = (['all', 'open', ...OPPORTUNITY_STAGES] as string[]).includes(stageParam) ? (stageParam as OpportunityStage | 'all' | 'open') : 'all';
      const sortParam = q(ctx, 'sort');
      const sort: OpportunitySort = (OPPORTUNITY_SORTS as readonly string[]).includes(sortParam) ? (sortParam as OpportunitySort) : 'updated';
      const filtered = byStage(items, stage).sort(SORTS[sort]);
      const board = q(ctx, 'view') === 'board';
      const page = board ? 1 : Math.max(1, Number(q(ctx, 'page')) || 1);
      const pageSize = board ? Math.max(1, filtered.length) : PAGE;
      return {
        items: board ? filtered : filtered.slice((page - 1) * PAGE, page * PAGE),
        total: filtered.length,
        page,
        pageSize,
        stages,
        owners: ownerOptions(c),
        projects: visibleProjects(c),
        canManage: c.scope.manage,
        canAssign: c.scope.whole,
        scope: c.scope.whole ? 'project' : 'assigned',
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/opportunities\/(?<id>[\w-]+)$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx): OpportunityDetail => {
      const c = open(ctx);
      const { o, lead } = findOpportunity(c, ctx.params.id);
      return detailOf(c, o, lead);
    },
  },
  {
    // Qualified leads the reader may convert (the conversion dialog's picker).
    method: 'GET',
    pattern: /^\/crm\/convertible-leads$/,
    access: requires('crm', 'lead.manage', 'operational'),
    handle: (ctx) => {
      const c = open(ctx);
      const items = visibleLeads(c)
        .filter((l) => l.status === 'qualified' && !opportunityOfLead(c, l.id))
        .map((l) => ({ id: l.id, ref: l.ref, displayName: partyOf(ctx, l.partyId)?.displayName ?? '—', projectName: projectName(ctx.data, l.projectId), owner: personOf(ctx, c.scope.ownerOf(l)) ?? { principalId: '', name: '—' } }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { items };
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads\/(?<leadId>[\w-]+)\/opportunities$/,
    access: requires('crm', 'lead.manage', 'operational'),
    handle: (ctx): Opportunity => {
      official(ctx);
      const c = open(ctx);
      const lead = leadById(c, ctx.params.leadId!);
      if (!lead) notFound(ctx);
      const b = body(ctx);
      const input = { note: str(b.note), expectedCloseOn: str(b.expectedCloseOn) };
      const idem = bound(ctx, c.st, 'opportunity.convert', lead.id, input);
      if ('reused' in idem) refuse(ctx, 409, 'idempotency_key_reused');
      if (idem.replay) {
        // The same request again: the opportunity it created, re-read through the reader's own scope.
        const again = c.st.opportunities.find((o) => o.id === idem.replay);
        const againLead = again ? leadById(c, again.leadId) : undefined;
        if (!again || !againLead) refuse(ctx, 409, 'idempotency_key_reused');
        return opportunityView(c, again, againLead, allVisits(ctx), now(ctx));
      }
      const convertible = canConvert(lead, !!opportunityOfLead(c, lead.id));
      if (!convertible.ok) refuse(ctx, 409, convertible.code);
      note(ctx, input.note, 500);
      if (input.expectedCloseOn) {
        const day = Date.parse(`${input.expectedCloseOn}T00:00:00Z`);
        const today = Date.parse(`${ctx.at}T00:00:00Z`);
        if (!DATE.test(input.expectedCloseOn) || Number.isNaN(day)) fieldError(ctx, 'expectedCloseOn', 'dateInvalid');
        if (day < today || day > today + 730 * DAY) fieldError(ctx, 'expectedCloseOn', 'closeOutOfRange');
      }
      const at = now(ctx);
      const o: StoredOpportunity = {
        id: opportunityIdFor(lead.id),
        ref: opportunityRefFor(lead.ref),
        leadId: lead.id,
        projectId: lead.projectId,
        stage: 'qualified',
        ...(input.expectedCloseOn ? { expectedCloseOn: input.expectedCloseOn } : {}),
        createdAt: at,
        updatedAt: at,
        createdBy: c.scope.me,
        version: 1,
        events: [{ id: nextId(c.st, 'oev'), at, ...me(c), kind: 'converted', to: 'qualified', ...(input.note ? { note: input.note } : {}) }],
      };
      c.st.opportunities.unshift(o);
      idem.remember(o.id);
      save(c);
      return opportunityView(c, o, lead, allVisits(ctx), at);
    },
  },
  {
    method: 'POST',
    pattern: /^\/opportunities\/(?<id>[\w-]+)\/stage$/,
    access: requires('crm', 'lead.manage', 'operational'),
    handle: (ctx): Opportunity => {
      official(ctx);
      const c = open(ctx);
      const { o, lead } = findOpportunity(c, ctx.params.id);
      current(c, o);
      const b = body(ctx);
      const result = transition(o, { kind: 'move', to: str(b.stage) });
      if (!result.ok) stageProblem(ctx, result.code);
      const text = note(ctx, b.note, 300);
      changeStage(c, o, result.stage, { kind: 'stage', from: o.stage, to: result.stage, ...(text ? { note: text } : {}) });
      return opportunityView(c, o, lead, allVisits(ctx), now(ctx));
    },
  },
  {
    method: 'POST',
    pattern: /^\/opportunities\/(?<id>[\w-]+)\/lost$/,
    access: requires('crm', 'lead.manage', 'operational'),
    handle: (ctx): Opportunity => {
      official(ctx);
      const c = open(ctx);
      const { o, lead } = findOpportunity(c, ctx.params.id);
      current(c, o);
      const b = body(ctx);
      const text = str(b.note);
      const result = transition(o, { kind: 'lose', reason: str(b.reason), note: text });
      if (!result.ok) stageProblem(ctx, result.code);
      note(ctx, text, 300);
      const reason = str(b.reason) as (typeof LOST_REASONS)[number];
      changeStage(c, o, 'lost', { kind: 'lost', from: o.stage, to: 'lost', reason, ...(text ? { note: text } : {}) }, { lostFrom: result.lostFrom!, lostReason: reason, ...(text ? { lostNote: text } : {}) });
      return opportunityView(c, o, lead, allVisits(ctx), now(ctx));
    },
  },
  {
    method: 'POST',
    pattern: /^\/opportunities\/(?<id>[\w-]+)\/reopen$/,
    access: requires('crm', 'lead.manage', 'operational'),
    handle: (ctx): Opportunity => {
      official(ctx);
      const c = open(ctx);
      const { o, lead } = findOpportunity(c, ctx.params.id);
      current(c, o);
      const b = body(ctx);
      const text = str(b.note);
      const result = transition(o, { kind: 'reopen', note: text });
      if (!result.ok) stageProblem(ctx, result.code);
      if (text.length < 3) fieldError(ctx, 'note', 'noteRequired');
      note(ctx, text, 300);
      changeStage(c, o, result.stage, { kind: 'reopened', from: 'lost', to: result.stage, note: text });
      return opportunityView(c, o, lead, allVisits(ctx), now(ctx));
    },
  },
];

// ── Lead assignment ──────────────────────────────────────────────────────────────────────────────

function assignmentLead(c: Ctx, l: Lead, nowMs: number): AssignmentLead {
  const party = partyOf(c.ctx, l.partyId);
  const opp = opportunityOfLead(c, l.id);
  return {
    id: l.id,
    ref: l.ref,
    displayName: party?.displayName ?? '—',
    phone: party?.phone ?? '',
    projectId: l.projectId,
    projectName: projectName(c.ctx.data, l.projectId),
    status: l.status,
    source: l.source,
    owner: personOf(c.ctx, c.scope.ownerOf(l)) ?? { principalId: '', name: '—' },
    budget: l.budget,
    createdAt: l.createdAt,
    ...(l.nextFollowUp ? { nextFollowUp: l.nextFollowUp } : {}),
    overdue: !!l.nextFollowUp && Date.parse(l.nextFollowUp) < nowMs,
    ...(opp ? { opportunityId: opp.id } : {}),
  };
}

const CLOSED = new Set(['converted', 'lost', 'unqualified']);
const FILTER: Record<AssignmentFilter, (l: AssignmentLead) => boolean> = {
  all: () => true,
  new: (l) => l.status === 'new' || l.status === 'assigned',
  overdue: (l) => l.overdue,
  no_follow_up: (l) => !l.nextFollowUp && !CLOSED.has(l.status),
  qualified: (l) => l.status === 'qualified',
};

/** The leads of a request, each one the caller may see; one unknown or hidden id refuses the whole request. */
function requestedLeads(c: Ctx, raw: unknown): Lead[] {
  if (!Array.isArray(raw) || raw.length === 0) fieldError(c.ctx, 'leadIds', 'leadsRequired');
  if (raw.length > 50) fieldError(c.ctx, 'leadIds', 'tooManyLeads', { max: '50' });
  const ids = [...new Set(raw.map((x) => (typeof x === 'string' ? x : '')))];
  return ids.map((id) => leadById(c, id) ?? notFound(c.ctx));
}

const ASSIGNMENT_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/crm\/assignments$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx): AssignmentList => {
      const c = open(ctx);
      const nowMs = Date.parse(now(ctx));
      let items = visibleLeads(c).map((l) => assignmentLead(c, l, nowMs));
      const project = q(ctx, 'project');
      const owner = q(ctx, 'owner');
      const source = q(ctx, 'source');
      const text = q(ctx, 'q');
      if (project && project !== 'all') items = items.filter((i) => i.projectId === project);
      if (owner && owner !== 'all') items = items.filter((i) => i.owner.principalId === owner);
      if (source && source !== 'all') items = items.filter((i) => i.source === source);
      if (text) items = items.filter((i) => matches(text, i.displayName, i.ref, i.phone));
      const counts = Object.fromEntries(ASSIGNMENT_FILTERS.map((f) => [f, items.filter(FILTER[f]).length])) as AssignmentList['counts'];
      const filterParam = q(ctx, 'filter');
      const filter: AssignmentFilter = (ASSIGNMENT_FILTERS as readonly string[]).includes(filterParam) ? (filterParam as AssignmentFilter) : 'all';
      const filtered = items.filter(FILTER[filter]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.ref.localeCompare(b.ref));
      const page = Math.max(1, Number(q(ctx, 'page')) || 1);
      return {
        items: filtered.slice((page - 1) * ASSIGN_PAGE, page * ASSIGN_PAGE),
        total: filtered.length,
        page,
        pageSize: ASSIGN_PAGE,
        counts,
        owners: ownerOptions(c),
        projects: visibleProjects(c),
        sources: [...LEAD_SOURCES] as LeadSource[],
        canAssign: c.scope.whole,
        scope: c.scope.whole ? 'project' : 'assigned',
      };
    },
  },
  {
    // People the selected leads may go to: they hold every selected lead's project (a picker lists only
    // what the caller may use, plan §4.3).
    method: 'GET',
    pattern: /^\/crm\/assignees$/,
    access: requires('crm', 'lead.assign', 'operational'),
    handle: (ctx): { items: AssigneeOption[] } => {
      const c = open(ctx);
      const leads = requestedLeads(c, q(ctx, 'leads').split(',').filter(Boolean));
      const items = staffOf(ctx)
        .filter((p) => leads.every((l) => mayHold(ctx, p, l.projectId)))
        .map((p) => ({ principalId: p.principalId, name: p.displayName, roleKey: p.roleKey, owns: leads.filter((l) => c.scope.ownerOf(l) === p.principalId).length }));
      return { items };
    },
  },
  {
    method: 'GET',
    pattern: /^\/leads\/(?<leadId>[\w-]+)\/assignments$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx) => {
      const c = open(ctx);
      const lead = leadById(c, ctx.params.leadId!);
      if (!lead) notFound(ctx);
      return {
        leadId: lead.id,
        lead: { id: lead.id, ref: lead.ref, displayName: partyOf(ctx, lead.partyId)?.displayName ?? '—', projectId: lead.projectId, projectName: projectName(ctx.data, lead.projectId), status: lead.status },
        owner: personOf(ctx, c.scope.ownerOf(lead)) ?? { principalId: '', name: '—' },
        items: (c.st.assignments[lead.id] ?? []).map((a) => projectAssignment(c, a)),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads\/assign$/,
    access: requires('crm', 'lead.assign', 'operational'),
    handle: (ctx): AssignmentResult => {
      official(ctx);
      const c = open(ctx);
      if (!c.scope.whole) refuse(ctx, 403, 'forbidden');
      const b = body(ctx);
      const leads = requestedLeads(c, b.leadIds);
      // Unknown, of another organisation, or not holding a lead's project: one answer for all three.
      const assignee = ALL_PERSONAS.find((p) => p.principalId === str(b.assigneeId) && p.tenantId === ctx.tenantId && p.app === 'backoffice');
      if (!assignee || !leads.every((l) => mayHold(ctx, assignee, l.projectId))) fieldError(ctx, 'assigneeId', 'assigneeUnavailable');
      if (leads.some((l) => c.scope.ownerOf(l) === assignee.principalId)) fieldError(ctx, 'leadIds', 'alreadyAssigned', { name: assignee.displayName });
      const reason = str(b.reason);
      if (reason.length < 3) fieldError(ctx, 'reason', 'reasonRequired');
      note(ctx, reason, 300, 'reason');
      const at = now(ctx);
      const who = me(c);
      for (const lead of leads) {
        const from = personOf(ctx, c.scope.ownerOf(lead));
        (c.st.assignments[lead.id] ??= []).unshift({ id: nextId(c.st, 'asg'), at, ...who, ...(from ? { from: from.principalId, fromName: from.name } : {}), to: assignee.principalId, toName: assignee.displayName, reason });
        const opp = opportunityOfLead(c, lead.id);
        if (opp) {
          opp.events.unshift({ id: nextId(c.st, 'oev'), at, ...who, kind: 'assigned', ...(from ? { fromPrincipal: from.principalId, from: from.name } : {}), toPrincipal: assignee.principalId, to: assignee.displayName, reason });
          opp.version += 1;
          opp.updatedAt = at;
        }
        ctx.demo.patchLead(lead.id, { ownerPersonaId: assignee.id, ...(lead.status === 'new' ? { status: 'assigned' as const } : {}) });
        leadActivity(ctx, lead.id, 'activity.assigned', { name: assignee.displayName });
      }
      save(c);
      return { assigned: leads.length, assignee: { principalId: assignee.principalId, name: assignee.displayName } };
    },
  },
];

// ── Site visits ──────────────────────────────────────────────────────────────────────────────────

const VISIT_STATUSES: readonly VisitStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

function findVisit(c: Ctx, id: string | undefined) {
  const v = allVisits(c.ctx).find((x) => x.id === id);
  const lead = v ? visitVisible(c, v, leadMap(c.ctx)) : undefined;
  if (!v || !lead) notFound(c.ctx);
  return { v, lead };
}

function visitDetail(c: Ctx, id: string): StoredVisitDetail {
  return (c.st.visits[id] ??= { version: 1, unitsShown: [], history: [] });
}

const visitVersion = (c: Ctx, id: string) => c.st.visits[id]?.version ?? 1;

/** An appointment time: a valid instant in the future (≤ 90 days), 09:00–19:00 Pakistan time, on the half hour. */
function appointment(ctx: HandlerContext, raw: unknown, field: string): string {
  const v = str(raw);
  const t = Date.parse(v);
  if (!v || Number.isNaN(t)) fieldError(ctx, field, 'timeInvalid');
  const nowMs = Date.parse(now(ctx));
  if (t <= nowMs) fieldError(ctx, field, 'timeInPast');
  if (t > nowMs + 90 * DAY) fieldError(ctx, field, 'timeTooFar');
  const local = new Date(t + 5 * 3_600_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < 9 * 60 || minutes > 19 * 60 || local.getUTCMinutes() % 30 !== 0 || local.getUTCSeconds() !== 0) fieldError(ctx, field, 'timeOutsideHours');
  return new Date(t).toISOString();
}

function followUpTime(ctx: HandlerContext, raw: unknown): string {
  const v = str(raw);
  const t = Date.parse(v);
  if (Number.isNaN(t)) fieldError(ctx, 'followUpAt', 'timeInvalid');
  const nowMs = Date.parse(now(ctx));
  if (t <= nowMs) fieldError(ctx, 'followUpAt', 'timeInPast');
  if (t > nowMs + 60 * DAY) fieldError(ctx, 'followUpAt', 'followUpTooFar');
  return new Date(t).toISOString();
}

function visitView(c: Ctx, id: string): VisitDetail {
  const { v, lead } = findVisit(c, id);
  const d = c.st.visits[v.id];
  const party = partyOf(c.ctx, lead.partyId);
  const opp = opportunityOfLead(c, lead.id);
  const pending = v.status === 'scheduled' || v.status === 'confirmed';
  const canAct = can(c.ctx, 'visit.schedule');
  return {
    visit: { ...calendarVisit(c, v, lead), version: visitVersion(c, v.id) },
    lead: { id: lead.id, ref: lead.ref, status: lead.status, ...(lead.nextFollowUp ? { nextFollowUp: lead.nextFollowUp } : {}) },
    party: { displayName: party?.displayName ?? v.displayName, phone: party?.phone ?? v.phone },
    opportunity: opp ? { id: opp.id, ref: opp.ref, stage: opp.stage } : null,
    outcome: d?.outcome ? { outcome: d.outcome.outcome, ...(d.outcome.interest ? { interest: d.outcome.interest } : {}), ...(d.outcome.feedback ? { feedback: d.outcome.feedback } : {}), recordedAt: d.outcome.at, recordedBy: d.outcome.byName } : null,
    unitsShown: (d?.unitsShown ?? []).flatMap((uid) => {
      const u = c.ctx.data.units.find((x) => x.id === uid);
      return u && u.projectId === v.projectId && unitPermitted(c.ctx, u) ? [{ id: u.id, ref: u.ref, type: u.type, price: u.price }] : [];
    }),
    ...(d?.followUpAt ? { followUpAt: d.followUpAt } : {}),
    history: (d?.history ?? []).map(projectVisitEvent),
    allowed: { reschedule: canAct && pending, outcome: canAct && pending, confirm: canAct && v.status === 'scheduled' },
  };
}

function visitEvent(c: Ctx, visitId: string, e: Omit<StoredVisitEvent, 'id' | 'at' | 'by' | 'byName'>, at: string) {
  const d = visitDetail(c, visitId);
  d.history.unshift({ id: nextId(c.st, 'vev'), at, ...me(c), ...e });
  d.version += 1;
}

const VISIT_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/visits\/calendar$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx): VisitCalendar => {
      const c = open(ctx);
      const from = q(ctx, 'from');
      const to = q(ctx, 'to');
      const start = Date.parse(`${from}T00:00:00+05:00`);
      const end = Date.parse(`${to}T00:00:00+05:00`) + DAY;
      if (!DATE.test(from) || Number.isNaN(start)) fieldError(ctx, 'from', 'dateInvalid');
      if (!DATE.test(to) || Number.isNaN(end) || end <= start) fieldError(ctx, 'to', 'dateInvalid');
      if (end - start > 42 * DAY) fieldError(ctx, 'to', 'rangeTooLong', { max: '42' });
      const leads = leadMap(ctx);
      let items: CalendarVisit[] = allVisits(ctx).flatMap((v) => {
        const lead = visitVisible(c, v, leads);
        const t = Date.parse(v.at);
        return lead && t >= start && t < end ? [calendarVisit(c, v, lead)] : [];
      });
      const project = q(ctx, 'project');
      const owner = q(ctx, 'owner');
      const text = q(ctx, 'q');
      if (project && project !== 'all') items = items.filter((i) => i.projectId === project);
      if (owner && owner !== 'all') items = items.filter((i) => i.host.principalId === owner);
      if (text) items = items.filter((i) => matches(text, i.displayName, i.leadRef, i.unitRef));
      const counts = Object.fromEntries([['all', items.length], ...VISIT_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])]) as VisitCalendar['counts'];
      const status = q(ctx, 'status');
      if ((VISIT_STATUSES as readonly string[]).includes(status)) items = items.filter((i) => i.status === status);
      return {
        from,
        to,
        today: ctx.at,
        items: items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)),
        counts,
        owners: ownerOptions(c),
        projects: visibleProjects(c),
        canSchedule: can(ctx, 'visit.schedule'),
        scope: c.scope.whole ? 'project' : 'assigned',
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/visits\/(?<id>[\w-]+)$/,
    access: requires('crm', 'lead.view', 'operational'),
    handle: (ctx): VisitDetail => visitView(open(ctx), ctx.params.id!),
  },
  {
    method: 'POST',
    pattern: /^\/visits\/(?<id>[\w-]+)\/confirm$/,
    access: requires('crm', 'visit.schedule', 'operational'),
    handle: (ctx): VisitDetail => {
      official(ctx);
      const c = open(ctx);
      const { v, lead } = findVisit(c, ctx.params.id);
      if (body(ctx).version !== visitVersion(c, v.id)) refuse(ctx, 409, 'stale_version');
      if (v.status !== 'scheduled') refuse(ctx, 409, 'visit_not_pending');
      const at = now(ctx);
      ctx.demo.patchVisit(v.id, { status: 'confirmed' });
      visitEvent(c, v.id, { kind: 'confirmed' }, at);
      leadActivity(ctx, lead.id, 'activity.visitConfirmed', { at: v.at }, 'visit');
      save(c);
      return visitView(c, v.id);
    },
  },
  {
    method: 'POST',
    pattern: /^\/visits\/(?<id>[\w-]+)\/reschedule$/,
    access: requires('crm', 'visit.schedule', 'operational'),
    handle: (ctx): VisitDetail => {
      official(ctx);
      const c = open(ctx);
      const { v } = findVisit(c, ctx.params.id);
      const b = body(ctx);
      if (b.version !== visitVersion(c, v.id)) refuse(ctx, 409, 'stale_version');
      if (v.status !== 'scheduled' && v.status !== 'confirmed') refuse(ctx, 409, 'visit_not_pending');
      const when = appointment(ctx, b.at, 'at');
      if (Date.parse(when) === Date.parse(v.at)) fieldError(ctx, 'at', 'sameTime');
      const reason = str(b.reason);
      if (reason.length < 3) fieldError(ctx, 'reason', 'reasonRequired');
      note(ctx, reason, 300, 'reason');
      const at = now(ctx);
      // A new time needs the customer's confirmation again.
      ctx.demo.patchVisit(v.id, { at: when, status: 'scheduled' });
      visitEvent(c, v.id, { kind: 'rescheduled', from: v.at, to: when, reason }, at);
      const opp = opportunityOfLead(c, v.leadId);
      if (opp) opp.events.unshift({ id: nextId(c.st, 'oev'), at, ...me(c), kind: 'visit_rescheduled', from: v.at, to: when, reason, visitId: v.id });
      save(c);
      return visitView(c, v.id);
    },
  },
  {
    method: 'POST',
    pattern: /^\/visits\/(?<id>[\w-]+)\/outcome$/,
    access: requires('crm', 'visit.schedule', 'operational'),
    handle: (ctx): VisitDetail => {
      official(ctx);
      const c = open(ctx);
      const { v, lead } = findVisit(c, ctx.params.id);
      const b = body(ctx);
      if (b.version !== visitVersion(c, v.id)) refuse(ctx, 409, 'stale_version');
      if (v.status !== 'scheduled' && v.status !== 'confirmed') refuse(ctx, 409, 'visit_not_pending');
      const outcome = str(b.outcome) as SiteVisitOutcome;
      if (!(SITE_VISIT_OUTCOMES as readonly string[]).includes(outcome)) fieldError(ctx, 'outcome', 'outcomeRequired');
      const nowMs = Date.parse(now(ctx));
      if (outcome !== 'cancelled' && Date.parse(v.at) > nowMs) fieldError(ctx, 'outcome', 'notYetHappened');
      const interestRaw = str(b.interest);
      if (interestRaw && (outcome !== 'completed' || !(SITE_VISIT_INTEREST as readonly string[]).includes(interestRaw))) fieldError(ctx, 'interest', 'interestInvalid');
      const interest = interestRaw ? (interestRaw as SiteVisitInterest) : undefined;
      const feedback = note(ctx, b.feedback, 1000, 'feedback');
      if (outcome === 'cancelled' && feedback.length < 3) fieldError(ctx, 'feedback', 'cancelReasonRequired');
      const rawUnits = b.unitsShown === undefined ? [] : b.unitsShown;
      if (!Array.isArray(rawUnits) || rawUnits.length > 10) fieldError(ctx, 'unitsShown', 'unitsTooMany', { max: '10' });
      if (rawUnits.length && outcome !== 'completed') fieldError(ctx, 'unitsShown', 'unitsOnlyCompleted');
      const units = [...new Set(rawUnits.map((x) => (typeof x === 'string' ? x : '')))];
      // A unit of another project, another organisation, an unlicensed site, or never issued: one answer.
      for (const id of units) {
        const u = ctx.data.units.find((x) => x.id === id);
        if (!u || u.projectId !== v.projectId || !unitPermitted(ctx, u)) fieldError(ctx, 'unitsShown', 'unitUnavailable');
      }
      const followUp = b.followUpAt === undefined || b.followUpAt === '' ? undefined : followUpTime(ctx, b.followUpAt);
      const at = now(ctx);
      const who = me(c);
      ctx.demo.patchVisit(v.id, { status: outcome });
      const d = visitDetail(c, v.id);
      d.outcome = { outcome, ...(interest ? { interest } : {}), ...(feedback ? { feedback } : {}), at, ...who };
      d.unitsShown = units;
      visitEvent(c, v.id, { kind: 'outcome', outcome, ...(feedback ? { reason: feedback } : {}) }, at);
      const opp = opportunityOfLead(c, lead.id);
      if (opp) opp.events.unshift({ id: nextId(c.st, 'oev'), at, ...who, kind: 'visit_outcome', to: outcome, visitId: v.id, ...(feedback ? { note: feedback } : {}), ...(units.length ? { units } : {}) });
      if (outcome === 'completed') leadActivity(ctx, lead.id, 'activity.visitCompleted', {}, 'visit');
      if (followUp) {
        d.followUpAt = followUp;
        visitEvent(c, v.id, { kind: 'follow_up', to: followUp }, at);
        ctx.demo.patchLead(lead.id, { nextFollowUp: followUp });
        leadActivity(ctx, lead.id, 'activity.followUpSet', { at: followUp });
        if (opp) opp.events.unshift({ id: nextId(c.st, 'oev'), at, ...who, kind: 'follow_up', to: followUp, visitId: v.id });
      }
      save(c);
      return visitView(c, v.id);
    },
  },
];

/** Gate E.1 (CRM-006…009, CRM-011): registered after the Stage 1.5R CRM endpoints (first match wins). */
export const CRM_PIPELINE_HANDLERS: readonly Handler[] = [...OPPORTUNITY_HANDLERS, ...ASSIGNMENT_HANDLERS, ...VISIT_HANDLERS];

/** Exposed for the tests: every stored record of the pipeline (to prove a refusal changed nothing). */
export const pipelineSnapshot = (ctx: HandlerContext) => JSON.stringify({ pipeline: pipelineState(ctx), leads: allLeads(ctx), visits: allVisits(ctx) });
