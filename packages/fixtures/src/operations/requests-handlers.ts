import {
  CONTACT_PREFERENCES,
  ENTRY_PERMISSIONS,
  FLAT_ROOMS,
  OPEN_REQUEST_STATES,
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  REQUEST_URGENCIES,
  type IssueAffected,
  type MaintenanceDashboard,
  type NewRequestInput,
  type OpsFile,
  type OpsFlatPeople,
  type RequestActions,
  type RequestDetail,
  type RequestList,
  type RequestPriority,
  type ResidentIssue,
  type ResidentIssues,
  type ResidentRequests,
  type SlaDashboard,
  type SlaStatus,
  type Technician,
  type TechnicianBoard,
  type WorkOrder,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { problem } from '../society/handlers';
import { factOn } from '../society/model';
import { invalid, contactFacts, isClosed, managesMaintenance, notify, now, opsOf as opsFor, requestSla, residentRequestOf, rowOf, save, staffOps, who, type Staff } from './common';
import { DEFAULT_THRESHOLD, refreshPublished, residentCount } from './privacy';
import { personName, residentOps, type ResidentOps } from './site';
import { slaAlarm } from './sla';
import { audienceCounts, liveCounts, nextOf, type Affirmation, type StoredRequest } from './state';

/**
 * Maintenance and community issues (Gate D.2: MNT-001…008, MNT-012/013, PORTAL-018, PORTAL-034/035).
 * One request entity with a kind (D-28): a flat repair or a community issue. Staff need the
 * maintenance module for the site and their permission; technicians see and move only their own work
 * orders; community issues also need the `community_issues` feature and `issues.*`. Residents enter by
 * rule R (resident_portal + portal.use, verified link in force, then maintenance for the same site and
 * flat). A resident never sees another resident's identity, internal notes or who else is affected.
 */

const MAINTENANCE = { module: 'maintenance' as const };
const ISSUES = { module: 'maintenance' as const, feature: 'maintenance.community_issues' as const };
const ISSUE_FEATURE = 'maintenance.community_issues' as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as T;

const technicianOf = (ctx: HandlerContext, staff: Staff) => staff.ops.technicians.find((t) => t.principalId && t.principalId === ctx.persona?.principalId);

/** Requests this person may see: all with maintenance.manage; a technician only those with their work orders. */
function visibleRequests(ctx: HandlerContext, staff: Staff): StoredRequest[] {
  const issues = can(ctx, 'issues.view', 'operational') && !!ctx.access?.features.includes(ISSUE_FEATURE);
  const all = staff.ops.requests.filter((r) => r.kind === 'repair' || issues);
  if (managesMaintenance(ctx) || can(ctx, 'issues.view', 'operational')) return all;
  const tech = technicianOf(ctx, staff);
  const mine = new Set(staff.ops.workOrders.filter((w) => tech && w.technicianId === tech.id).map((w) => w.requestId));
  return all.filter((r) => mine.has(r.id));
}

function findRequest(ctx: HandlerContext, staff: Staff, id = ctx.params.id): StoredRequest {
  const r = visibleRequests(ctx, staff).find((x) => x.id === id);
  if (!r) notFound(ctx);
  return r;
}

function technicians(staff: Staff): Technician[] {
  return staff.ops.technicians.map((t) => ({ id: t.id, name: t.name, trade: t.trade, kind: t.kind, ...(t.principalId ? { principalId: t.principalId } : {}), ...(t.vendorName ? { vendorName: t.vendorName } : {}), available: t.available, load: staff.ops.workOrders.filter((w) => w.technicianId === t.id && !['done', 'cancelled'].includes(w.state)).length }));
}

const activeOrder = (staff: Staff, r: StoredRequest) => [...staff.ops.workOrders].reverse().find((w) => w.requestId === r.id && w.state !== 'cancelled' && w.state !== 'done');
const lastOrder = (staff: Staff, r: StoredRequest) => [...staff.ops.workOrders].reverse().find((w) => w.requestId === r.id && w.state !== 'cancelled');

function issueAffected(staff: Staff, r: StoredRequest, at: string): IssueAffected {
  const live = liveCounts(r, staff.site, at);
  const audience = audienceCounts(staff.site, at.slice(0, 10));
  const scope = r.visibility === 'block' && r.area?.buildingCode ? { kind: 'block' as const, code: r.area.buildingCode } : { kind: 'site' as const };
  return {
    live: { site: live.site, blocks: live.blocks },
    audience,
    households: r.affirmations.map((a) => ({ flatCode: a.flatCode, name: a.name, at: a.at, ...(a.withdrawnAt ? { withdrawnAt: a.withdrawnAt } : {}), ...(a.fromMerge ? { fromMerge: a.fromMerge } : {}) })),
    residentView: residentCount(r.published, audience, scope),
    ...(staff.ops.snapshotAt ? { snapshotAt: staff.ops.snapshotAt } : {}),
  };
}

function actionsOf(ctx: HandlerContext, staff: Staff, r: StoredRequest): RequestActions {
  const operational = (p: Parameters<typeof can>[1]) => can(ctx, p, 'operational');
  const manage = operational('maintenance.manage');
  const order = activeOrder(staff, r);
  const tech = technicianOf(ctx, staff);
  const ownOrder = !!order && !!tech && order.technicianId === tech.id && operational('workorder.update');
  const open = !isClosed(r);
  const issue = r.kind === 'community_issue';
  const suspended = !can(ctx, 'operations.view', 'operational');
  return {
    triage: manage && open && r.state !== 'completed',
    assign: manage && open && r.state !== 'completed',
    progress: open && !!order && (manage || ownOrder),
    complete: open && !!order && ['assigned', 'accepted', 'in_progress'].includes(order.state) && (manage || ownOrder),
    closeForResident: manage && r.state === 'completed' && !issue,
    cancel: manage && ['submitted', 'triaged', 'assigned'].includes(r.state) && !issue,
    comment: open && (manage || ownOrder || (issue && operational('issues.manage'))),
    commentInternal: open && (manage || ownOrder || (issue && operational('issues.manage'))),
    merge: issue && open && operational('issues.manage'),
    moderate: issue && r.state !== 'hidden' && operational('issues.moderate'),
    resolve: issue && open && operational('issues.manage'),
    ...(suspended ? { reason: 'tenant_suspended' } : !manage && !ownOrder ? { reason: tech ? 'not_your_work_order' : 'read_only' } : {}),
  };
}

function detailOf(ctx: HandlerContext, staff: Staff, r: StoredRequest): RequestDetail {
  const at = now(ctx);
  const related: RequestDetail['related'] = [];
  if (r.flat) related.push({ kind: 'flat', id: r.flat.id, label: r.flat.code });
  if (r.raisedBy.partyId && can(ctx, 'residents.view', 'operational')) related.push({ kind: 'person', id: r.raisedBy.partyId, label: r.raisedBy.name });
  for (const m of r.mergedFrom ?? []) related.push({ kind: 'issue', id: m.id, label: m.ref });
  if (r.mergedInto) related.push({ kind: 'issue', id: r.mergedInto.id, label: r.mergedInto.ref });
  if (r.flat) for (const o of staff.ops.requests.filter((x) => x.flat?.id === r.flat!.id && x.id !== r.id).slice(-4)) related.push({ kind: 'request', id: o.id, label: `${o.ref} · ${o.title}` });
  const { comments, history, affirmations: _a, followers: _f, published: _p, ...request } = r;
  return {
    request: { ...request, sla: rowSla(staff, r, at) },
    workOrders: staff.ops.workOrders.filter((w) => w.requestId === r.id),
    comments,
    history,
    actions: actionsOf(ctx, staff, r),
    ...(r.kind === 'community_issue' ? { affected: issueAffected(staff, r, at) } : {}),
    related,
    ...(can(ctx, 'maintenance.manage', 'operational') ? { technicians: technicians(staff) } : {}),
  };
}

const rowSla = (staff: Staff, r: StoredRequest, at: string) => requestSla(r, staff.ops.sla, at);

const touch = (ctx: HandlerContext, r: StoredRequest) => {
  r.updatedAt = now(ctx);
};
const event = (ctx: HandlerContext, r: StoredRequest, action: string, extra: { note?: string; values?: Record<string, string>; byKind?: 'staff' | 'technician' | 'resident' } = {}) => {
  r.history.push({ at: now(ctx), byName: who(ctx), byKind: extra.byKind ?? 'staff', action, ...(extra.note ? { note: extra.note } : {}), ...(extra.values ? { values: extra.values } : {}) });
  touch(ctx, r);
};

const requireText = (ctx: HandlerContext, field: string, value: unknown, min: number, max = 2000): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) invalid(ctx, field, 'operations:errors.tooShort', { min: String(min) });
  if (text.length > max) invalid(ctx, field, 'operations:errors.tooLong', { max: String(max) });
  return text;
};

function filesOf(ctx: HandlerContext, idBase: string, files: NewRequestInput['files']): OpsFile[] {
  if (!files) return [];
  if (!Array.isArray(files) || files.length > 3) invalid(ctx, 'files', 'operations:errors.tooManyFiles');
  return files.map((f, i) => {
    if (!f || typeof f.name !== 'string' || !/^image\//.test(String(f.type))) invalid(ctx, 'files', 'operations:errors.fileType');
    if (!(Number(f.sizeBytes) > 0) || Number(f.sizeBytes) > MAX_FILE_BYTES) invalid(ctx, 'files', 'operations:errors.fileSize');
    if (typeof f.alt !== 'string' || f.alt.trim().length < 3) invalid(ctx, 'files', 'operations:errors.altText');
    return { id: `fil_${idBase}_${i + 1}`, name: f.name.slice(0, 120), type: String(f.type), sizeBytes: Number(f.sizeBytes), alt: f.alt.trim().slice(0, 200) };
  });
}

/** The same request sent twice (a double tap, a retry) is created once. */
const recent = new Map<string, string>();

function createRequest(ctx: HandlerContext, staff: Staff, input: NewRequestInput, raisedBy: StoredRequest['raisedBy'], flatAllowed: (flatId: string) => boolean): StoredRequest {
  const key = input.idempotencyKey ? `${ctx.tenantId}:${input.idempotencyKey}` : undefined;
  if (key && recent.has(key)) {
    const existing = staff.ops.requests.find((r) => r.id === recent.get(key));
    if (existing) return existing;
  }
  if (input.kind !== 'repair' && input.kind !== 'community_issue') invalid(ctx, 'kind', 'forms:errors.required');
  if (!(REQUEST_CATEGORIES as readonly string[]).includes(input.category)) invalid(ctx, 'category', 'forms:errors.required');
  if (!(REQUEST_URGENCIES as readonly string[]).includes(input.urgency)) invalid(ctx, 'urgency', 'forms:errors.required');
  const title = requireText(ctx, 'title', input.title, 5, 120);
  const description = requireText(ctx, 'description', input.description, 10, 2000);
  const flat = input.kind === 'repair' ? staff.site.flats.find((f) => f.id === input.flatId) : undefined;
  const area = input.areaId ? staff.site.areas.find((a) => a.id === input.areaId) : undefined;
  if (input.kind === 'repair' && (!flat || !flatAllowed(flat.id))) invalid(ctx, 'flatId', 'operations:errors.flatNotYours');
  if (input.kind === 'repair' && input.room && !(FLAT_ROOMS as readonly string[]).includes(input.room)) invalid(ctx, 'room', 'forms:errors.required');
  if (input.kind === 'community_issue' && !area) invalid(ctx, 'areaId', 'forms:errors.required');
  if (input.contact) {
    if (!(CONTACT_PREFERENCES as readonly string[]).includes(input.contact.preference) || !(ENTRY_PERMISSIONS as readonly string[]).includes(input.contact.entry)) invalid(ctx, 'contact', 'forms:errors.required');
    if (input.contact.preferredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.contact.preferredOn) || input.contact.preferredOn < ctx.at)) invalid(ctx, 'preferredOn', 'operations:errors.dateInPast');
  }
  const { id, ref } = nextOf(staff.ops, staff.site, input.kind === 'repair' ? 'request' : 'issue');
  const at = now(ctx);
  const r: StoredRequest = {
    id,
    ref,
    kind: input.kind,
    category: input.category,
    title,
    description,
    siteId: staff.site.siteId,
    ...(flat ? { flat } : {}),
    ...(input.room && flat ? { room: input.room } : {}),
    ...(area ? { area } : {}),
    urgency: input.urgency,
    state: 'submitted',
    raisedBy,
    ...(input.contact ? { contact: input.contact } : {}),
    files: filesOf(ctx, id, input.files),
    createdAt: at,
    updatedAt: at,
    reopenCount: 0,
    ...(input.kind === 'community_issue' ? { visibility: area?.buildingId ? ('block' as const) : ('site' as const) } : {}),
    comments: [],
    history: [{ at, byName: raisedBy.name, byKind: raisedBy.kind, action: 'submitted', ...(raisedBy.kind === 'staff' && input.onBehalfOf ? { values: { onBehalfOf: personName(staff.site, input.onBehalfOf) } } : {}) }],
    affirmations: [],
    followers: raisedBy.partyId ? [raisedBy.partyId] : [],
  };
  staff.ops.requests.push(r);
  if (key) recent.set(key, r.id);
  return r;
}

function dashboard(ctx: HandlerContext, staff: Staff): MaintenanceDashboard {
  const at = now(ctx);
  const list = visibleRequests(ctx, staff);
  const rows = list.map((r) => rowOf(r, staff.ops.sla, at));
  const open = rows.filter((r) => (OPEN_REQUEST_STATES as readonly string[]).includes(r.state));
  const weekAgo = Date.parse(at) - 7 * 86400_000;
  const repairs = list.filter((r) => r.kind === 'repair');
  const ratings = repairs.filter((r) => r.rating).map((r) => r.rating!);
  const techs = technicians(staff);
  return {
    asOf: ctx.at,
    open: open.length,
    unassigned: open.filter((r) => !r.assigneeName && r.state !== 'completed').length,
    breached: open.filter((r) => r.sla?.resolution === 'breached' || r.sla?.response === 'breached').length,
    atRisk: open.filter((r) => r.sla?.resolution === 'at_risk' || r.sla?.response === 'at_risk').length,
    awaitingConfirmation: rows.filter((r) => r.state === 'completed').length,
    reopened: open.filter((r) => r.reopenCount > 0).length,
    closedThisWeek: list.filter((r) => (r.state === 'closed' || r.state === 'resolved') && r.closedAt && Date.parse(r.closedAt) >= weekAgo).length,
    communityIssues: open.filter((r) => r.kind === 'community_issue').length,
    byCategory: [...new Set(open.map((r) => r.category))].map((category) => ({ category, open: open.filter((r) => r.category === category).length })).sort((a, b) => b.open - a.open),
    byTechnician: techs.map((t) => ({ technicianId: t.id, name: t.name, open: t.load, trade: t.trade })).filter((t) => t.open > 0),
    needsAttention: open
      .filter((r) => !r.assigneeName || (r.sla && (slaAlarm(r.sla.resolution) || slaAlarm(r.sla.response))) || r.reopenCount > 0)
      .sort((a, b) => Date.parse(a.sla?.resolveBy ?? a.createdAt) - Date.parse(b.sla?.resolveBy ?? b.createdAt))
      .slice(0, 8),
    slaTargets: staff.ops.sla,
    confirmation: {
      confirmed: repairs.filter((r) => r.confirmation === 'confirmed').length,
      reopened: repairs.filter((r) => r.reopenCount > 0).length,
      awaiting: repairs.filter((r) => r.state === 'completed').length,
      ...(ratings.length ? { averageRating: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) } : {}),
    },
  };
}

const STATUSES = ['all', 'open', 'unassigned', 'breached', 'awaiting_confirmation', 'closed'] as const;

function listOf(ctx: HandlerContext, staff: Staff): RequestList {
  const at = now(ctx);
  const q = ctx.req.query ?? {};
  const kind = q.kind === 'repair' || q.kind === 'community_issue' ? q.kind : undefined;
  const status = (STATUSES as readonly string[]).includes(String(q.status ?? '')) ? (String(q.status) as (typeof STATUSES)[number]) : 'all';
  const text = String(q.q ?? '').trim().toLowerCase();
  const flat = q.flat ? String(q.flat) : undefined;
  const tech = q.technician ? String(q.technician) : undefined;
  const all = visibleRequests(ctx, staff).map((r) => rowOf(r, staff.ops.sla, at));
  const ofKind = all.filter((r) => !kind || r.kind === kind);
  const isOpen = (r: (typeof all)[number]) => (OPEN_REQUEST_STATES as readonly string[]).includes(r.state);
  const test: Record<(typeof STATUSES)[number], (r: (typeof all)[number]) => boolean> = {
    all: () => true,
    open: isOpen,
    unassigned: (r) => isOpen(r) && !r.assigneeName && r.state !== 'completed',
    breached: (r) => isOpen(r) && (r.sla?.resolution === 'breached' || r.sla?.response === 'breached'),
    awaiting_confirmation: (r) => r.state === 'completed',
    closed: (r) => !isOpen(r),
  };
  const items = ofKind
    .filter(test[status])
    .filter((r) => !flat || r.flatId === flat)
    .filter((r) => !tech || staff.ops.workOrders.some((w) => w.requestId === r.id && w.technicianId === tech && w.state !== 'cancelled'))
    .filter((r) => !text || [r.ref, r.title, r.where].some((v) => v.toLowerCase().includes(text)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    items,
    counts: Object.fromEntries(STATUSES.map((s) => [s, ofKind.filter(test[s]).length])) as RequestList['counts'],
    kindCounts: { repair: all.filter((r) => r.kind === 'repair').length, community_issue: all.filter((r) => r.kind === 'community_issue').length },
  };
}

function slaBoard(ctx: HandlerContext, staff: Staff): SlaDashboard {
  const at = now(ctx);
  const rows = visibleRequests(ctx, staff).filter((r) => r.state !== 'hidden' && r.state !== 'merged').map((r) => rowOf(r, staff.ops.sla, at));
  const full = visibleRequests(ctx, staff).filter((r) => r.state !== 'hidden' && r.state !== 'merged').map((r) => rowSla(staff, r, at));
  const zero = (): Record<SlaStatus, number> => ({ on_track: 0, at_risk: 0, breached: 0, met: 0, missed: 0, paused: 0 });
  const response = zero();
  const resolution = zero();
  for (const s of full) {
    response[s.response] += 1;
    resolution[s.resolution] += 1;
  }
  const open = rows.filter((r) => (OPEN_REQUEST_STATES as readonly string[]).includes(r.state));
  return {
    asOf: ctx.at,
    targets: staff.ops.sla,
    response,
    resolution,
    byPriority: REQUEST_PRIORITIES.map((p) => {
      const mine = full.filter((s) => s.priority === p);
      return { priority: p, open: open.filter((r) => (r.priority ?? '') === p || (!r.priority && rowSla(staff, staff.ops.requests.find((x) => x.id === r.id)!, at).priority === p)).length, breached: mine.filter((s) => s.resolution === 'breached' || s.response === 'breached').length, atRisk: mine.filter((s) => s.resolution === 'at_risk' || s.response === 'at_risk').length, met: mine.filter((s) => s.resolution === 'met').length, missed: mine.filter((s) => s.resolution === 'missed').length };
    }),
    breaches: open.filter((r) => r.sla?.resolution === 'breached' || r.sla?.response === 'breached'),
    atRisk: open.filter((r) => r.sla?.resolution === 'at_risk' || r.sla?.response === 'at_risk'),
  };
}

function board(ctx: HandlerContext, staff: Staff): TechnicianBoard {
  const at = now(ctx);
  const manage = managesMaintenance(ctx);
  const tech = technicianOf(ctx, staff);
  const people = technicians(staff).filter((t) => manage || (tech && t.id === tech.id));
  return {
    asOf: ctx.at,
    ownOnly: !manage,
    technicians: people.map((t) => ({
      ...t,
      jobs: staff.ops.workOrders
        .filter((w) => w.technicianId === t.id && !['done', 'cancelled'].includes(w.state))
        .map((w) => {
          const r = staff.ops.requests.find((x) => x.id === w.requestId)!;
          const sla = rowSla(staff, r, at);
          return { ...w, title: r.title, ...(r.flat ? { flatCode: r.flat.code } : {}), ...(r.area ? { areaKey: r.area.key } : {}), priority: sla.priority, sla: { resolution: sla.resolution, resolveBy: sla.resolveBy } };
        })
        .sort((a, b) => (a.scheduledOn ?? '9999').localeCompare(b.scheduledOn ?? '9999')),
    })),
  };
}

const residentHref = (r: StoredRequest) => (r.kind === 'repair' ? `/customer/portal/maintenance-workspace?record=${r.id}` : `/customer/portal/issues?record=${r.id}`);

/** Residents to tell about a request: who raised it and, for an issue, its followers. */
const audienceOf = (r: StoredRequest) => [...new Set([...(r.raisedBy.partyId ? [r.raisedBy.partyId] : []), ...(r.kind === 'community_issue' ? r.followers : [])])];

function assign(ctx: HandlerContext, staff: Staff, r: StoredRequest) {
  const input = body<{ technicianId?: string; scheduledOn?: string; slot?: WorkOrder['slot']; instructions?: string }>(ctx);
  const tech = staff.ops.technicians.find((t) => t.id === input.technicianId);
  if (!tech) invalid(ctx, 'technicianId', 'forms:errors.required');
  if (!tech.available) invalid(ctx, 'technicianId', 'operations:errors.technicianUnavailable');
  if (input.scheduledOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledOn) || input.scheduledOn < ctx.at)) invalid(ctx, 'scheduledOn', 'operations:errors.dateInPast');
  if (input.slot && !['morning', 'afternoon', 'evening'].includes(input.slot)) invalid(ctx, 'slot', 'forms:errors.required');
  const previous = activeOrder(staff, r);
  if (previous) {
    if (previous.technicianId === tech.id && previous.scheduledOn === input.scheduledOn && previous.slot === input.slot) return previous;
    previous.state = 'cancelled';
    previous.history.push({ at: now(ctx), byName: who(ctx), byKind: 'staff', action: 'reassigned', values: { technician: tech.name } });
  }
  const { id, ref } = nextOf(staff.ops, staff.site, 'workOrder');
  const order: WorkOrder = {
    id,
    ref,
    requestId: r.id,
    requestRef: r.ref,
    technicianId: tech.id,
    technicianName: tech.name,
    state: 'assigned',
    ...(input.scheduledOn ? { scheduledOn: input.scheduledOn } : {}),
    ...(input.slot ? { slot: input.slot } : {}),
    ...(input.instructions?.trim() ? { instructions: input.instructions.trim().slice(0, 500) } : {}),
    assignedAt: now(ctx),
    assignedByName: who(ctx),
    history: [{ at: now(ctx), byName: who(ctx), byKind: 'staff', action: 'assigned', values: { technician: tech.name } }],
  };
  staff.ops.workOrders.push(order);
  // Assignment answers the request if nobody triaged it yet (the response target is met here).
  if (!r.respondedAt) r.respondedAt = now(ctx);
  if (!r.priority) r.priority = ({ emergency: 'p1', urgent: 'p2', normal: 'p3', low: 'p4' } as const)[r.urgency];
  r.assignee = { technicianId: tech.id, name: tech.name };
  if (r.state !== 'in_progress') r.state = 'assigned';
  event(ctx, r, previous ? 'reassigned' : 'assigned', { values: { technician: tech.name, workOrder: ref, ...(input.scheduledOn ? { date: input.scheduledOn } : {}), ...(input.slot ? { slot: input.slot } : {}) } });
  notify(ctx, staff, { partyIds: audienceOf(r), ...(r.flat ? { flatId: r.flat.id } : {}), module: 'maintenance', kind: 'request', key: input.scheduledOn ? 'requestVisit' : 'requestAssigned', values: { ref: r.ref, title: r.title, ...(input.scheduledOn ? { date: input.scheduledOn } : {}), ...(input.slot ? { slot: input.slot } : {}) }, href: residentHref(r) });
  return order;
}

function workOrderOf(ctx: HandlerContext, staff: Staff): { order: WorkOrder; r: StoredRequest; own: boolean } {
  const order = staff.ops.workOrders.find((w) => w.id === ctx.params.id);
  if (!order) notFound(ctx);
  const r = staff.ops.requests.find((x) => x.id === order.requestId)!;
  const tech = technicianOf(ctx, staff);
  const own = !!tech && order.technicianId === tech.id;
  // Someone else's work order is not found for a technician; refused for anyone without either right.
  if (!own && !managesMaintenance(ctx)) {
    if (tech) notFound(ctx);
    problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
  }
  if (order.state === 'cancelled' || order.state === 'done') problem(ctx, 409, 'state_locked', 'operations:errors.workOrderClosed');
  return { order, r, own };
}

function progress(ctx: HandlerContext, staff: Staff, action: string) {
  const { order, r, own } = workOrderOf(ctx, staff);
  const byKind = own ? ('technician' as const) : ('staff' as const);
  const at = now(ctx);
  const allowed: Record<string, WorkOrder['state'][]> = { accept: ['assigned'], start: ['assigned', 'accepted', 'on_hold'], hold: ['assigned', 'accepted', 'in_progress'], resume: ['on_hold'], complete: ['assigned', 'accepted', 'in_progress'] };
  if (!allowed[action]?.includes(order.state)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
  const note = String(body<{ note?: string }>(ctx).note ?? '').trim();
  switch (action) {
    case 'accept':
      order.state = 'accepted';
      break;
    case 'start':
    case 'resume':
      order.state = 'in_progress';
      if (r.state !== 'in_progress') r.state = 'in_progress';
      break;
    case 'hold': {
      if (note.length < 5) invalid(ctx, 'note', 'operations:errors.tooShort', { min: '5' });
      order.state = 'on_hold';
      r.state = 'on_hold';
      break;
    }
    case 'complete': {
      if (note.length < 10) invalid(ctx, 'note', 'operations:errors.tooShort', { min: '10' });
      const files = filesOf(ctx, order.id, body<{ files?: NewRequestInput['files'] }>(ctx).files);
      if (!files.length) invalid(ctx, 'files', 'operations:errors.evidenceNeeded');
      order.state = 'done';
      order.completion = { at, byName: who(ctx), note, files };
      if (r.kind === 'repair') {
        r.state = 'completed';
        r.completedAt = at;
        r.confirmation = 'awaiting';
        notify(ctx, staff, { partyIds: audienceOf(r), ...(r.flat ? { flatId: r.flat.id } : {}), module: 'maintenance', kind: 'request', key: 'requestCompleted', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      } else {
        r.state = 'in_progress';
      }
      break;
    }
  }
  order.history.push({ at, byName: who(ctx), byKind, action: action === 'complete' ? 'done' : action, ...(note ? { note } : {}) });
  event(ctx, r, action === 'complete' ? (r.kind === 'repair' ? 'completed' : 'work_done') : action === 'resume' ? 'started' : action === 'start' ? 'started' : action === 'hold' ? 'on_hold' : 'accepted', { byKind, ...(note ? { note } : {}), values: { workOrder: order.ref } });
  save(ctx);
  return detailOf(ctx, staff, r);
}

// ---------------------------------------------------------------------------------------------
// Resident side
// ---------------------------------------------------------------------------------------------

/** Repairs a resident may see: those they raised, and those of a flat they live in today. */
function residentRepairs(res: ResidentOps, staff: Staff): StoredRequest[] {
  const lives = new Set(res.flats.filter((f) => f.roles.includes('occupant')).map((f) => f.flat.id));
  const linked = new Set(res.flats.map((f) => f.flat.id));
  return staff.ops.requests.filter((r) => r.kind === 'repair' && r.flat && linked.has(r.flat.id) && (r.raisedBy.partyId === res.partyId || lives.has(r.flat.id)));
}

function residentRequests(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentRequests {
  const items = residentRepairs(res, staff)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((r) => residentRequestOf(r, staff.ops));
  return {
    asOf: ctx.at,
    flats: res.flats.map((f) => ({ id: f.flat.id, code: f.flat.code, roles: f.roles })),
    canRaiseFor: res.flats.filter((f) => f.roles.includes('owner') || f.roles.includes('occupant')).map((f) => f.flat.id),
    items,
    areas: staff.site.areas,
  };
}

function residentRequest(ctx: HandlerContext): { res: ResidentOps; staff: Staff; r: StoredRequest } {
  const res = residentOps(ctx, MAINTENANCE);
  const staff: Staff = { site: res.site, ops: opsOf(ctx, res) };
  const r = residentRepairs(res, staff).find((x) => x.id === ctx.params.id);
  if (!r) notFound(ctx);
  return { res, staff, r };
}

const opsOf = (ctx: HandlerContext, res: ResidentOps) => opsFor(ctx, res.site);

/** Issues a resident may see: the site's, and their own block's; hidden ones only to who raised them. */
function residentIssueList(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentIssues {
  const blocks = new Set(res.flats.map((f) => f.flat.buildingCode));
  const audience = audienceCounts(staff.site, ctx.at);
  const items: ResidentIssue[] = staff.ops.requests
    .filter((r) => r.kind === 'community_issue')
    .filter((r) => r.visibility !== 'block' || (r.area?.buildingCode && blocks.has(r.area.buildingCode)))
    .filter((r) => r.state !== 'hidden' || r.raisedBy.partyId === res.partyId)
    .map((r) => {
      const scope = r.visibility === 'block' && r.area?.buildingCode ? { kind: 'block' as const, code: r.area.buildingCode } : { kind: 'site' as const };
      const mine = r.affirmations.some((a) => a.partyId === res.partyId && !a.withdrawnAt);
      return {
        id: r.id,
        ref: r.ref,
        category: r.category,
        title: r.title,
        summary: r.state === 'hidden' ? '' : (r.publicSummary ?? r.description),
        ...(r.area ? { area: r.area } : {}),
        state: r.state,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        count: r.state === 'hidden' ? { shown: false as const, reason: 'below_threshold' as const } : residentCount(r.published, audience, scope),
        affirmed: mine,
        following: r.followers.includes(res.partyId),
        mine: r.raisedBy.partyId === res.partyId,
        nearMe: !!r.area?.buildingCode && blocks.has(r.area.buildingCode),
        ...(r.mergedInto ? { mergedInto: r.mergedInto } : {}),
        // Other residents are never named: "A resident" (the screen says it), or "You".
        comments: r.comments.filter((c) => c.visibility === 'public' && !c.hidden).map((c) => ({ id: c.id, at: c.at, byKind: c.byKind, byName: c.byKind === 'resident' ? (c.byName === res.name ? res.name : '') : c.byKind === 'staff' ? 'office' : '', text: c.text })),
      };
    })
    .sort((a, b) => Number(b.nearMe) - Number(a.nearMe) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { asOf: ctx.at, ...(staff.ops.snapshotAt ? { snapshotAt: staff.ops.snapshotAt } : {}), refresh: 'daily_0600', items, areas: staff.site.areas };
}

function residentIssue(ctx: HandlerContext): { res: ResidentOps; staff: Staff; r: StoredRequest } {
  const res = residentOps(ctx, ISSUES);
  const staff: Staff = { site: res.site, ops: opsOf(ctx, res) };
  const list = residentIssueList(ctx, res, staff);
  const r = staff.ops.requests.find((x) => x.id === ctx.params.id && list.items.some((i) => i.id === x.id));
  if (!r) notFound(ctx);
  return { res, staff, r };
}

/** The household a resident affirms for: a flat they live in (or own) in the issue's grouping. */
function householdFor(res: ResidentOps, r: StoredRequest) {
  const candidates = res.flats.filter((f) => r.visibility !== 'block' || f.flat.buildingCode === r.area?.buildingCode);
  return candidates.find((f) => f.roles.includes('occupant')) ?? candidates.find((f) => f.roles.includes('owner'));
}

export const OPS_REQUEST_HANDLERS: readonly Handler[] = [
  // Staff: dashboards, lists and Request 360 ------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/ops\/maintenance\/dashboard$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx): MaintenanceDashboard => dashboard(ctx, staffOps(ctx, 'maintenance')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/maintenance\/sla$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx): SlaDashboard => slaBoard(ctx, staffOps(ctx, 'maintenance')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/technicians\/board$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx): TechnicianBoard => board(ctx, staffOps(ctx, 'maintenance')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/technicians$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): Technician[] => technicians(staffOps(ctx, 'maintenance')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/requests$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx): RequestList => listOf(ctx, staffOps(ctx, 'maintenance')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      return detailOf(ctx, staff, findRequest(ctx, staff));
    },
  },
  {
    // MNT-004: the office raises a request (a phone call, a walk-in, something the guard saw).
    method: 'POST',
    pattern: /^\/ops\/requests$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const input = body<NewRequestInput>(ctx);
      if (input.kind === 'community_issue' && !ctx.access?.features.includes(ISSUE_FEATURE)) problem(ctx, 403, 'feature_not_licensed', 'errors:access.feature_not_licensed');
      let raisedBy: StoredRequest['raisedBy'] = { kind: 'staff', name: who(ctx) };
      if (input.onBehalfOf) {
        const flat = staff.site.flats.find((f) => f.id === input.flatId);
        const linked = flat && staff.site.society?.view.facts.some((f) => f.partyId === input.onBehalfOf && f.flatId === flat.id && f.role !== 'payer' && factOn(f, ctx.at));
        if (!linked) invalid(ctx, 'onBehalfOf', 'operations:errors.notLinked');
        raisedBy = { kind: 'staff', name: who(ctx), partyId: input.onBehalfOf };
      }
      const r = createRequest(ctx, staff, input, raisedBy, () => true);
      if (input.onBehalfOf) r.followers = [input.onBehalfOf];
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    // The site's shared places (lobby, lift, water tank …) for the office's new-request form.
    method: 'GET',
    pattern: /^\/ops\/areas$/,
    access: requires('maintenance', 'operations.view', 'operational'),
    handle: (ctx) => staffOps(ctx, 'maintenance').site.areas,
  },
  {
    // The flats a request can be raised for, with who lives in or owns each today (names only: no
    // payers or balances), so maintenance staff raise requests without reading the site's records.
    method: 'GET',
    pattern: /^\/ops\/flats$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): OpsFlatPeople => {
      const site = staffOps(ctx, 'maintenance').site;
      const facts = (site.society?.view.facts ?? []).filter((f) => (f.role === 'occupant' || f.role === 'owner') && f.occupancyKind !== 'association' && factOn(f, ctx.at));
      return {
        siteId: site.siteId,
        flats: site.flats.map((flat) => ({
          id: flat.id,
          code: flat.code,
          people: facts
            .filter((f) => f.flatId === flat.id)
            .sort((a, b) => (a.role === b.role ? 0 : a.role === 'occupant' ? -1 : 1))
            .filter((f, i, all) => all.findIndex((x) => x.partyId === f.partyId) === i)
            .map((f) => ({ partyId: f.partyId, partyName: f.partyName, role: f.role as 'owner' | 'occupant' })),
        })),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)\/triage$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const r = findRequest(ctx, staff);
      if (isClosed(r) || r.state === 'completed') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const input = body<{ priority?: RequestPriority; category?: string; note?: string }>(ctx);
      if (!input.priority || !(REQUEST_PRIORITIES as readonly string[]).includes(input.priority)) invalid(ctx, 'priority', 'forms:errors.required');
      if (input.category && !(REQUEST_CATEGORIES as readonly string[]).includes(input.category)) invalid(ctx, 'category', 'forms:errors.required');
      const first = !r.respondedAt;
      r.priority = input.priority;
      if (input.category) r.category = input.category as StoredRequest['category'];
      if (first) r.respondedAt = now(ctx);
      if (r.state === 'submitted') r.state = 'triaged';
      event(ctx, r, first ? 'triaged' : 'reprioritised', { values: { priority: input.priority }, ...(input.note?.trim() ? { note: input.note.trim() } : {}) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    // MNT-005: assign (or reassign) a work order to a technician, with the visit booked.
    method: 'POST',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)\/assign$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const r = findRequest(ctx, staff);
      if (isClosed(r) || r.state === 'completed') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      assign(ctx, staff, r);
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  ...(['accept', 'start', 'hold', 'resume', 'complete'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/ops\\/work-orders\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('maintenance', ['workorder.update', 'maintenance.manage'], 'operational'),
      handle: (ctx): RequestDetail => progress(ctx, staffOps(ctx, 'maintenance'), action),
    }),
  ),
  {
    // MNT-008: close for a resident who has not answered (with a reason; the resident is told).
    method: 'POST',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)\/close$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const r = findRequest(ctx, staff);
      if (r.state !== 'completed' || r.kind !== 'repair') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = requireText(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 10, 500);
      r.state = 'closed';
      r.closedAt = now(ctx);
      r.confirmation = 'closed_by_office';
      event(ctx, r, 'closed_by_office', { note: reason });
      notify(ctx, staff, { partyIds: audienceOf(r), ...(r.flat ? { flatId: r.flat.id } : {}), module: 'maintenance', kind: 'request', key: 'requestClosedByOffice', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)\/cancel$/,
    access: requires('maintenance', 'maintenance.manage', 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const r = findRequest(ctx, staff);
      if (!['submitted', 'triaged', 'assigned'].includes(r.state) || r.kind !== 'repair') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = requireText(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 10, 500);
      const order = activeOrder(staff, r);
      if (order) order.state = 'cancelled';
      r.state = 'cancelled';
      r.closedAt = now(ctx);
      event(ctx, r, 'cancelled', { note: reason });
      notify(ctx, staff, { partyIds: audienceOf(r), ...(r.flat ? { flatId: r.flat.id } : {}), module: 'maintenance', kind: 'request', key: 'requestCancelled', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/requests\/(?<id>[\w-]+)\/comments$/,
    access: requires('maintenance', ['workorder.update', 'maintenance.manage', 'issues.manage'], 'operational'),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance');
      const r = findRequest(ctx, staff);
      const actions = actionsOf(ctx, staff, r);
      const input = body<{ text?: string; visibility?: 'public' | 'internal' }>(ctx);
      if (!actions.comment) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
      const text = requireText(ctx, 'text', input.text, 2, 1000);
      const visibility = input.visibility === 'internal' ? 'internal' : 'public';
      const tech = technicianOf(ctx, staff);
      const byKind = tech && activeOrder(staff, r)?.technicianId === tech.id ? 'technician' : 'staff';
      r.comments.push({ id: `cmt_${r.id}_${r.comments.length + 1}`, at: now(ctx), byName: who(ctx), byKind, visibility, text });
      touch(ctx, r);
      if (visibility === 'public') notify(ctx, staff, { partyIds: audienceOf(r), ...(r.flat ? { flatId: r.flat.id } : {}), module: 'maintenance', kind: 'request', key: 'requestComment', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  // Staff: community issues (MNT-012, MNT-013) ----------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/issues$/,
    access: requires('maintenance', 'issues.view', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestList & { snapshotAt?: string; threshold: typeof DEFAULT_THRESHOLD; residentViews: Record<string, IssueAffected['residentView']>; live: Record<string, number> } => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      ctx.req.query = { ...(ctx.req.query ?? {}), kind: 'community_issue' };
      const list = listOf(ctx, staff);
      const status = String(ctx.req.query?.issueStatus ?? '');
      const items = status === 'in_progress' ? list.items.filter((i) => ['assigned', 'in_progress', 'on_hold'].includes(i.state)) : status === 'merged' ? list.items.filter((i) => i.state === 'merged') : status === 'hidden' ? list.items.filter((i) => i.state === 'hidden') : status === 'resolved' ? list.items.filter((i) => i.state === 'resolved') : list.items;
      const at = now(ctx);
      const views = Object.fromEntries(items.map((i) => [i.id, issueAffected(staff, staff.ops.requests.find((r) => r.id === i.id)!, at).residentView]));
      return { ...list, items, ...(staff.ops.snapshotAt ? { snapshotAt: staff.ops.snapshotAt } : {}), threshold: DEFAULT_THRESHOLD, residentViews: views, live: Object.fromEntries(items.map((i) => [i.id, i.affected ?? 0])) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/(?<id>[\w-]+)\/merge$/,
    access: requires('maintenance', 'issues.manage', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const r = findRequest(ctx, staff);
      const intoId = body<{ intoId?: string }>(ctx).intoId;
      const target = staff.ops.requests.find((x) => x.id === intoId && x.kind === 'community_issue');
      if (r.kind !== 'community_issue' || isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      if (!target || target.id === r.id || isClosed(target)) invalid(ctx, 'intoId', 'operations:errors.mergeTarget');
      // The duplicate's affirmations and followers move to the issue it is merged into (counts kept).
      for (const a of r.affirmations.filter((x) => !x.withdrawnAt)) if (!target.affirmations.some((x) => x.flatId === a.flatId && !x.withdrawnAt)) target.affirmations.push({ ...a, fromMerge: r.ref });
      for (const f of r.followers) if (!target.followers.includes(f)) target.followers.push(f);
      r.state = 'merged';
      r.mergedInto = { id: target.id, ref: target.ref };
      r.closedAt = now(ctx);
      target.mergedFrom = [...(target.mergedFrom ?? []), { id: r.id, ref: r.ref }];
      event(ctx, r, 'merged', { values: { into: target.ref } });
      event(ctx, target, 'merged_from', { values: { from: r.ref } });
      notify(ctx, staff, { partyIds: audienceOf(r), module: 'maintenance', kind: 'request', key: 'issueMerged', values: { ref: r.ref, into: target.ref, title: target.title }, href: residentHref(target) });
      save(ctx);
      return detailOf(ctx, staff, target);
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/(?<id>[\w-]+)\/resolve$/,
    access: requires('maintenance', 'issues.manage', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const r = findRequest(ctx, staff);
      if (r.kind !== 'community_issue' || isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const summary = requireText(ctx, 'summary', body<{ summary?: string }>(ctx).summary, 10, 600);
      const order = activeOrder(staff, r);
      if (order) order.state = 'done';
      r.state = 'resolved';
      r.publicSummary = summary;
      r.closedAt = now(ctx);
      event(ctx, r, 'resolved', { note: summary });
      notify(ctx, staff, { partyIds: audienceOf(r), module: 'maintenance', kind: 'request', key: 'issueResolved', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/(?<id>[\w-]+)\/summary$/,
    access: requires('maintenance', 'issues.manage', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const r = findRequest(ctx, staff);
      if (r.kind !== 'community_issue' || isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      r.publicSummary = requireText(ctx, 'summary', body<{ summary?: string }>(ctx).summary, 10, 600);
      event(ctx, r, 'summary_updated', { note: r.publicSummary });
      notify(ctx, staff, { partyIds: audienceOf(r), module: 'maintenance', kind: 'request', key: 'issueUpdate', values: { ref: r.ref, title: r.title }, href: residentHref(r) });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/(?<id>[\w-]+)\/hide$/,
    access: requires('maintenance', 'issues.moderate', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const r = findRequest(ctx, staff);
      if (r.kind !== 'community_issue' || r.state === 'hidden') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = requireText(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 10, 300);
      r.hidden = { at: now(ctx), byName: who(ctx), reason };
      r.state = 'hidden';
      r.closedAt = now(ctx);
      event(ctx, r, 'hidden', { note: reason });
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/(?<id>[\w-]+)\/comments\/(?<comment>[\w-]+)\/hide$/,
    access: requires('maintenance', 'issues.moderate', 'operational', ISSUE_FEATURE),
    handle: (ctx): RequestDetail => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const r = findRequest(ctx, staff);
      const c = r.comments.find((x) => x.id === ctx.params.comment);
      if (!c || c.hidden) notFound(ctx);
      c.hidden = { at: now(ctx), byName: who(ctx), reason: requireText(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 5, 300) };
      event(ctx, r, 'comment_hidden');
      save(ctx);
      return detailOf(ctx, staff, r);
    },
  },
  {
    // Demo control: the scheduled refresh of resident-visible counts (daily at 06:00 in production).
    method: 'POST',
    pattern: /^\/issues\/refresh$/,
    access: requires('maintenance', 'issues.manage', 'operational', ISSUE_FEATURE),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'maintenance', ISSUE_FEATURE);
      const at = now(ctx);
      for (const r of staff.ops.requests.filter((x) => x.kind === 'community_issue')) r.published = refreshPublished(r.published, liveCounts(r, staff.site, at), at);
      staff.ops.snapshotAt = at;
      save(ctx);
      return { snapshotAt: at };
    },
  },
  // Resident: repairs (PORTAL-018) ----------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/requests$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ResidentRequests => {
      const res = residentOps(ctx, MAINTENANCE);
      return residentRequests(ctx, res, { site: res.site, ops: opsOf(ctx, res) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/requests$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const res = residentOps(ctx, MAINTENANCE);
      const staff: Staff = { site: res.site, ops: opsOf(ctx, res) };
      const input = { ...body<NewRequestInput>(ctx), kind: 'repair' as const };
      const raiseable = new Set(res.flats.filter((f) => f.roles.includes('owner') || f.roles.includes('occupant')).map((f) => f.flat.id));
      if (input.contact?.preference === 'whatsapp' && !contactFacts(ctx).consented(res.partyId, 'whatsapp')) invalid(ctx, 'contact', 'operations:errors.noWhatsappConsent');
      const r = createRequest(ctx, staff, input, { kind: 'resident', name: res.name, partyId: res.partyId }, (id) => raiseable.has(id));
      save(ctx);
      return residentRequestOf(r, staff.ops);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/requests\/(?<id>[\w-]+)\/confirm$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { staff, r } = residentRequest(ctx);
      if (r.state !== 'completed') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const rating = Number(body<{ rating?: number }>(ctx).rating ?? 0);
      if (rating && !(rating >= 1 && rating <= 5)) invalid(ctx, 'rating', 'forms:errors.required');
      r.state = 'closed';
      r.closedAt = now(ctx);
      r.confirmation = 'confirmed';
      if (rating) r.rating = Math.round(rating);
      const note = String(body<{ note?: string }>(ctx).note ?? '').trim().slice(0, 500);
      event(ctx, r, 'confirmed', { byKind: 'resident', ...(note ? { note } : {}), ...(rating ? { values: { rating: String(Math.round(rating)) } } : {}) });
      save(ctx);
      return residentRequestOf(r, staff.ops);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/requests\/(?<id>[\w-]+)\/reopen$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { staff, r } = residentRequest(ctx);
      if (r.state !== 'completed') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = requireText(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 10, 600);
      r.reopenCount += 1;
      r.confirmation = 'reopened';
      delete r.completedAt;
      // The same technician goes back: a new work order, so the first visit keeps its history.
      const last = lastOrder(staff, r);
      if (last) {
        const { id, ref } = nextOf(staff.ops, staff.site, 'workOrder');
        staff.ops.workOrders.push({ id, ref, requestId: r.id, requestRef: r.ref, technicianId: last.technicianId, technicianName: last.technicianName, state: 'assigned', assignedAt: now(ctx), assignedByName: residentName(ctx), history: [{ at: now(ctx), byName: residentName(ctx), byKind: 'resident', action: 'reopened', note: reason }] });
        r.state = 'assigned';
      } else r.state = 'triaged';
      r.comments.push({ id: `cmt_${r.id}_${r.comments.length + 1}`, at: now(ctx), byName: residentName(ctx), byKind: 'resident', visibility: 'public', text: reason });
      event(ctx, r, 'reopened', { byKind: 'resident', note: reason });
      save(ctx);
      return residentRequestOf(r, staff.ops);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/requests\/(?<id>[\w-]+)\/cancel$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { staff, r } = residentRequest(ctx);
      if (!['submitted', 'triaged'].includes(r.state) || r.raisedBy.partyId !== ctx.persona!.partyId) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      r.state = 'cancelled';
      r.closedAt = now(ctx);
      event(ctx, r, 'cancelled', { byKind: 'resident' });
      save(ctx);
      return residentRequestOf(r, staff.ops);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/requests\/(?<id>[\w-]+)\/comments$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { staff, r } = residentRequest(ctx);
      if (isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const text = requireText(ctx, 'text', body<{ text?: string }>(ctx).text, 2, 1000);
      r.comments.push({ id: `cmt_${r.id}_${r.comments.length + 1}`, at: now(ctx), byName: residentName(ctx), byKind: 'resident', visibility: 'public', text });
      touch(ctx, r);
      save(ctx);
      return residentRequestOf(r, staff.ops);
    },
  },
  // Resident: community issues (PORTAL-034, PORTAL-035) -------------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/issues$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ResidentIssues => {
      const res = residentOps(ctx, ISSUES);
      return residentIssueList(ctx, res, { site: res.site, ops: opsOf(ctx, res) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/issues$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const res = residentOps(ctx, ISSUES);
      const staff: Staff = { site: res.site, ops: opsOf(ctx, res) };
      const input = { ...body<NewRequestInput>(ctx), kind: 'community_issue' as const };
      const area = staff.site.areas.find((a) => a.id === input.areaId);
      // A block's area is for the people of that block.
      if (area?.buildingCode && !res.flats.some((f) => f.flat.buildingCode === area.buildingCode)) invalid(ctx, 'areaId', 'operations:errors.notYourBlock');
      const r = createRequest(ctx, staff, input, { kind: 'resident', name: res.name, partyId: res.partyId }, () => true);
      const home = householdFor(res, r);
      if (home) r.affirmations.push({ partyId: res.partyId, flatId: home.flat.id, flatCode: home.flat.code, buildingCode: home.flat.buildingCode, name: res.name, at: now(ctx) });
      save(ctx);
      return residentIssueList(ctx, res, staff).items.find((i) => i.id === r.id)!;
    },
  },
  ...(['affirm', 'withdraw'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/portal\\/issues\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('resident_portal', 'portal.use', 'operational'),
      handle: (ctx) => {
        const { res, staff, r } = residentIssue(ctx);
        if (isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
        const mine = r.affirmations.find((a) => a.partyId === res.partyId && !a.withdrawnAt);
        if (action === 'affirm' && !mine) {
          const home = householdFor(res, r);
          if (!home) problem(ctx, 403, 'out_of_scope', 'operations:errors.notYourBlock');
          r.affirmations.push({ partyId: res.partyId, flatId: home.flat.id, flatCode: home.flat.code, buildingCode: home.flat.buildingCode, name: res.name, at: now(ctx) } satisfies Affirmation);
          if (!r.followers.includes(res.partyId)) r.followers.push(res.partyId);
        }
        if (action === 'withdraw' && mine) mine.withdrawnAt = now(ctx);
        // Resident-visible counts do not move here: they change only at the scheduled refresh (D-47).
        save(ctx);
        return residentIssueList(ctx, res, staff).items.find((i) => i.id === r.id)!;
      },
    }),
  ),
  {
    method: 'POST',
    pattern: /^\/portal\/issues\/(?<id>[\w-]+)\/follow$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { res, staff, r } = residentIssue(ctx);
      const follow = body<{ follow?: boolean }>(ctx).follow !== false;
      r.followers = follow ? [...new Set([...r.followers, res.partyId])] : r.followers.filter((p) => p !== res.partyId);
      save(ctx);
      return residentIssueList(ctx, res, staff).items.find((i) => i.id === r.id)!;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/issues\/(?<id>[\w-]+)\/comments$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { res, staff, r } = residentIssue(ctx);
      if (isClosed(r)) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const text = requireText(ctx, 'text', body<{ text?: string }>(ctx).text, 2, 600);
      r.comments.push({ id: `cmt_${r.id}_${r.comments.length + 1}`, at: now(ctx), byName: res.name, byKind: 'resident', visibility: 'public', text });
      touch(ctx, r);
      save(ctx);
      return residentIssueList(ctx, res, staff).items.find((i) => i.id === r.id)!;
    },
  },
];

function residentName(ctx: HandlerContext) {
  return ctx.persona!.displayName;
}
