import {
  LEAD_SOURCES,
  PIPELINE_STAGES,
  PIPELINE_STATUSES,
  type ActivityEvent,
  type CreateLeadInput,
  type FollowUp,
  type Lead,
  type LeadDetail,
  type LeadListItem,
  type LeadListResponse,
  type LeadSort,
  type LeadStatus,
  type LogActivityInput,
  type Party,
  type PipelineStageId,
  type SalesSummary,
  type ScheduleVisitInput,
  type SiteVisit,
  type VisitStatus,
} from '@repo/contracts';
import { normalizePkPhone } from '@repo/i18n/format';
import { leadHistory, ownerName, projectName, unitDetail, unitSummary, VISITS } from './crm-data';
import { can, forbid, invalid, isScopeOnly, matches, notFound, type Handler, type HandlerContext } from './handler-types';
import { PROJECTS, UNITS } from './inventory';
import { PARTIES } from './people';
import { LEADS } from './records';
import { FIXTURE_NOW, pad } from './seed';

/**
 * Sales / CRM endpoints over the demo store (Stage 1.5R). Reads merge fixtures with this session's
 * changes; writes land in the session overlay only. Persona scope and the header project filter are
 * enforced here, before the UI sees anything, as the real backend must.
 */

const PAGE_SIZE = 12;
const DAY = 86_400_000;

interface CrmSection {
  parties: Party[];
}

const crm = (ctx: HandlerContext) => ctx.demo.section<CrmSection>('crm', () => ({ parties: [] }));

function partyById(ctx: HandlerContext, id: string): Party | undefined {
  return crm(ctx).parties.find((p) => p.id === id) ?? PARTIES.find((p) => p.id === id);
}

/** Leads the persona may see: scope + header project filter (+ own leads only for sales). */
function visibleLeads(ctx: HandlerContext): Lead[] {
  if (!can(ctx, 'lead.view')) forbid(ctx);
  return ctx.demo.leads(LEADS).filter((l) => ctx.allowsProject(l.projectId));
}

function visibleVisits(ctx: HandlerContext): SiteVisit[] {
  return ctx.demo.visits(VISITS).filter((v) => ctx.allowsProject(v.projectId));
}

const stageOf = (status: LeadStatus): PipelineStageId =>
  PIPELINE_STAGES.find((s) => PIPELINE_STATUSES[s].includes(status)) ?? 'new';

function listItem(ctx: HandlerContext, lead: Lead): LeadListItem {
  const party = partyById(ctx, lead.partyId);
  const interest = ctx.demo.isSessionLead(lead.id) ? (lead as Lead & { interestUnitId?: string }).interestUnitId : undefined;
  return {
    id: lead.id,
    ref: lead.ref,
    status: lead.status,
    source: lead.source,
    projectId: lead.projectId,
    projectName: projectName(lead.projectId),
    partyId: lead.partyId,
    displayName: party?.displayName ?? '—',
    phone: party?.phone ?? '',
    budget: lead.budget,
    ownerName: ownerName(lead.ownerPersonaId),
    createdAt: lead.createdAt,
    ...(lead.nextFollowUp ? { nextFollowUp: lead.nextFollowUp } : {}),
    ...(interest ? { interestUnitRef: UNITS.find((u) => u.id === interest)?.ref } : {}),
    ...(ctx.demo.isSessionLead(lead.id) ? { createdInSession: true } : {}),
  };
}

/** Practice leads (training store) as list rows, only for requests made in practice mode. */
function practiceItems(ctx: HandlerContext): LeadListItem[] {
  if (!ctx.req.training) return [];
  return ctx.training.list().map((r) => {
    const data = r.data as { fullName?: string; phone?: string; unitId?: string };
    const unit = UNITS.find((u) => u.id === data.unitId);
    const projectId = unit?.projectId ?? 'prj_heights';
    return {
      id: r.id,
      ref: `PRACTICE-${r.id.slice(4).padStart(3, '0')}`,
      status: 'new',
      source: 'walk_in',
      projectId,
      projectName: projectName(projectId),
      partyId: '',
      displayName: data.fullName ?? '—',
      phone: normalizePkPhone(data.phone ?? '') ?? data.phone ?? '',
      budget: unit?.price ?? { amount: '0.00', currency: 'PKR' },
      ownerName: ctx.persona?.displayName ?? '',
      createdAt: r.createdAt,
      ...(unit ? { interestUnitRef: unit.ref } : {}),
      practice: true,
    } satisfies LeadListItem;
  });
}

const sum = (items: Array<{ budget: { amount: string } }>) =>
  `${items.reduce((acc, l) => acc + BigInt(l.budget.amount.replace('.', '')), 0n) / 100n}.00`;

function sortLeads(items: LeadListItem[], sort: LeadSort): LeadListItem[] {
  const by = {
    recent: (a: LeadListItem, b: LeadListItem) => b.createdAt.localeCompare(a.createdAt),
    followUp: (a: LeadListItem, b: LeadListItem) => (a.nextFollowUp ?? '9999').localeCompare(b.nextFollowUp ?? '9999'),
    budget: (a: LeadListItem, b: LeadListItem) => Number(b.budget.amount) - Number(a.budget.amount),
    name: (a: LeadListItem, b: LeadListItem) => a.displayName.localeCompare(b.displayName),
  }[sort];
  // Session-created leads stay on top of "recent" so a new record is visible straight away.
  return [...items].sort((a, b) => (sort === 'recent' ? Number(!!b.createdInSession || !!b.practice) - Number(!!a.createdInSession || !!a.practice) : 0) || by(a, b));
}

function activityEvent(ctx: HandlerContext, kind: ActivityEvent['kind'], messageKey: string, params: Record<string, string> = {}): ActivityEvent {
  return { id: ctx.demo.nextId('act'), at: new Date().toISOString(), actorName: ctx.persona?.displayName ?? 'System', messageKey, params, kind };
}

function findLead(ctx: HandlerContext, id: string): Lead {
  const lead = ctx.demo.leads(LEADS).find((l) => l.id === id);
  if (!lead) notFound(ctx);
  if (!can(ctx, 'lead.view') || !ctx.allowsProject(lead.projectId)) forbid(ctx);
  return lead;
}

export const CRM_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/crm\/summary$/,
    handle: (ctx): SalesSummary => {
      const leads = visibleLeads(ctx);
      const now = FIXTURE_NOW.getTime();
      const weekAgo = now - 7 * DAY;
      const newLeads = leads.filter((l) => new Date(l.createdAt).getTime() > weekAgo || ctx.demo.isSessionLead(l.id)).length;
      const previous = leads.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t > weekAgo - 7 * DAY && t <= weekAgo;
      }).length;
      const endOfToday = now + DAY - ((now + 5 * 3_600_000) % DAY);
      const due = leads
        .filter((l) => l.nextFollowUp && new Date(l.nextFollowUp).getTime() < endOfToday)
        .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!));
      const followUps: FollowUp[] = due.slice(0, 6).map((l) => {
        const party = partyById(ctx, l.partyId);
        return {
          leadId: l.id,
          leadRef: l.ref,
          displayName: party?.displayName ?? '—',
          phone: party?.phone ?? '',
          projectName: projectName(l.projectId),
          dueAt: l.nextFollowUp!,
          overdue: new Date(l.nextFollowUp!).getTime() < now,
          status: l.status,
        };
      });
      const visits = visibleVisits(ctx);
      const upcoming = visits
        .filter((v) => ['scheduled', 'confirmed'].includes(v.status) && new Date(v.at).getTime() >= now - 12 * 3_600_000)
        .sort((a, b) => a.at.localeCompare(b.at));
      const week = upcoming.filter((v) => new Date(v.at).getTime() < now + 7 * DAY);
      const monthStart = Date.UTC(FIXTURE_NOW.getUTCFullYear(), FIXTURE_NOW.getUTCMonth(), 1);
      const booked = leads.filter((l) => l.status === 'converted' && new Date(l.createdAt).getTime() >= monthStart - 30 * DAY);
      const pipeline = PIPELINE_STAGES.map((id) => {
        const inStage = leads.filter((l) => stageOf(l.status) === id);
        return { id, count: inStage.length, value: { amount: sum(inStage), currency: 'PKR' as const } };
      });
      return {
        asOf: FIXTURE_NOW.toISOString(),
        kpis: {
          newLeads: { value: newLeads, previous },
          followUpsDue: { value: due.length, overdue: due.filter((l) => new Date(l.nextFollowUp!).getTime() < now).length },
          visitsThisWeek: { value: week.length, confirmed: week.filter((v) => v.status === 'confirmed').length },
          bookingsThisMonth: { value: booked.length, amount: { amount: sum(booked), currency: 'PKR' } },
        },
        pipeline,
        followUps,
        visits: upcoming.slice(0, 5),
        recentLeads: sortLeads(leads.map((l) => listItem(ctx, l)), 'recent').slice(0, 6),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/leads$/,
    handle: (ctx): LeadListResponse => {
      const { q, status = 'all', project, sort = 'recent', page = 1 } = (ctx.req.query ?? {}) as Record<string, string | number | undefined>;
      let items = [...practiceItems(ctx), ...visibleLeads(ctx).map((l) => listItem(ctx, l))];
      if (project && project !== 'all') items = items.filter((i) => i.projectId === project);
      if (q && String(q).trim()) items = items.filter((i) => matches(String(q).trim(), i.displayName, i.ref, i.phone, i.interestUnitRef));
      const counts = Object.fromEntries([
        ['all', items.length],
        ...PIPELINE_STAGES.map((s) => [s, items.filter((i) => stageOf(i.status) === s).length]),
      ]) as LeadListResponse['counts'];
      if (status !== 'all') items = items.filter((i) => stageOf(i.status) === status);
      const sorted = sortLeads(items, (sort as LeadSort) ?? 'recent');
      const pageNo = Math.max(1, Number(page) || 1);
      return { items: sorted.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE), total: sorted.length, page: pageNo, pageSize: PAGE_SIZE, counts };
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads$/,
    handle: (ctx) => {
      if (!can(ctx, 'lead.create')) forbid(ctx);
      const input = (ctx.req.body ?? {}) as CreateLeadInput;
      if (!input.fullName?.trim()) invalid(ctx, 'fullName');
      const phone = normalizePkPhone(input.phone ?? '');
      if (!phone) invalid(ctx, 'phone', 'forms:errors.phoneInvalid');
      if (!input.projectId || !isScopeOnly(ctx, input.projectId)) invalid(ctx, 'projectId');
      const unit = input.unitId ? UNITS.find((u) => u.id === input.unitId) : undefined;
      if (ctx.req.training) {
        const record = ctx.training.add('lead', { fullName: input.fullName, phone, unitId: input.unitId });
        return { id: record.id, ref: `PRACTICE-${record.id.slice(4).padStart(3, '0')}`, training: true };
      }
      const n = ctx.demo.counter + 1;
      const party: Party = {
        id: ctx.demo.nextId('pty'),
        ref: `CUS-${pad(20000 + n, 5)}`,
        kind: 'individual',
        displayName: input.fullName.trim(),
        phone,
        email: input.email?.trim() || '',
        city: PROJECTS.find((p) => p.id === input.projectId)?.city ?? 'Lahore',
      };
      crm(ctx).parties.unshift(party);
      const id = ctx.demo.nextId('led');
      const lead: Lead & { interestUnitId?: string } = {
        id,
        ref: `LD-2026-${pad(LEADS.length + n, 5)}`,
        partyId: party.id,
        projectId: input.projectId,
        status: 'new',
        source: LEAD_SOURCES.includes(input.source) ? input.source : 'walk_in',
        ownerPersonaId: ctx.persona?.id ?? 'manager',
        budget: { amount: input.budget && /^\d+(\.\d{1,2})?$/.test(input.budget) ? (input.budget.includes('.') ? input.budget : `${input.budget}.00`) : (unit?.price.amount ?? '0.00'), currency: 'PKR' },
        createdAt: new Date().toISOString(),
        nextFollowUp: new Date(Date.now() + DAY).toISOString(),
        ...(unit ? { interestUnitId: unit.id } : {}),
      };
      ctx.demo.addLead(lead);
      ctx.demo.addActivity(id, activityEvent(ctx, 'system', 'activity.leadCreated', { source: lead.source }));
      if (input.notes?.trim()) ctx.demo.addActivity(id, activityEvent(ctx, 'note', 'activity.noteAdded', { note: input.notes.trim() }));
      return { id, ref: lead.ref, training: false };
    },
  },
  {
    method: 'GET',
    pattern: /^\/leads\/(?<leadId>[\w-]+)$/,
    handle: (ctx): LeadDetail => {
      const lead = findLead(ctx, ctx.params.leadId!) as Lead & { interestUnitId?: string };
      const party = partyById(ctx, lead.partyId)!;
      const holds = ctx.demo.holds();
      const holdView = Object.fromEntries(Object.entries(holds).map(([k, v]) => [k, { leadRef: v.leadRef, until: v.until }]));
      const interest = lead.interestUnitId ? UNITS.find((u) => u.id === lead.interestUnitId) : undefined;
      const budget = Number(lead.budget.amount);
      // Within 15 % of the budget; without a budget, the project's available units in price order.
      const matched = UNITS.filter(
        (u) =>
          u.projectId === lead.projectId &&
          (u.status === 'available' || holds[u.id]?.leadId === lead.id) &&
          (budget <= 0 || Math.abs(Number(u.price.amount) - budget) <= budget * 0.15),
      )
        .sort((a, b) => (budget <= 0 ? Number(a.price.amount) - Number(b.price.amount) : 0))
        .slice(0, 6)
        .map((u) => unitSummary(u, holdView));
      const base = ctx.demo.isSessionLead(lead.id) ? [] : leadHistory(lead);
      return {
        lead: { ...lead, ...(ctx.demo.isSessionLead(lead.id) ? { createdInSession: true } : {}) },
        party,
        project: PROJECTS.find((p) => p.id === lead.projectId)!,
        ownerName: ownerName(lead.ownerPersonaId),
        interestUnit: interest ? unitSummary(interest, holdView) : null,
        activity: [...ctx.demo.sessionActivity(lead.id), ...base],
        visits: visibleVisits(ctx).filter((v) => v.leadId === lead.id).sort((a, b) => b.at.localeCompare(a.at)),
        matchedUnits: matched,
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads\/(?<leadId>[\w-]+)\/activity$/,
    handle: (ctx) => {
      const lead = findLead(ctx, ctx.params.leadId!);
      const input = (ctx.req.body ?? {}) as LogActivityInput;
      if (input.kind === 'note' && !input.note?.trim()) invalid(ctx, 'note');
      const event =
        input.kind === 'call'
          ? activityEvent(ctx, 'call', input.outcome === 'no_answer' ? 'activity.callNoAnswer' : input.outcome === 'callback' ? 'activity.callCallback' : 'activity.callAnswered')
          : input.kind === 'whatsapp'
            ? activityEvent(ctx, 'call', 'activity.whatsappSent')
            : activityEvent(ctx, 'note', 'activity.noteAdded', { note: input.note!.trim() });
      ctx.demo.addActivity(lead.id, event);
      if (input.kind !== 'note' && lead.status === 'new') ctx.demo.patchLead(lead.id, { status: 'contacted' });
      return event;
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads\/(?<leadId>[\w-]+)\/status$/,
    handle: (ctx) => {
      const lead = findLead(ctx, ctx.params.leadId!);
      const status = (ctx.req.body as { status?: LeadStatus })?.status;
      if (!status) invalid(ctx, 'status');
      ctx.demo.patchLead(lead.id, { status });
      ctx.demo.addActivity(lead.id, activityEvent(ctx, 'status', 'activity.statusChanged', { status }));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/leads\/(?<leadId>[\w-]+)\/follow-up$/,
    handle: (ctx) => {
      const lead = findLead(ctx, ctx.params.leadId!);
      const { at, done } = (ctx.req.body ?? {}) as { at?: string; done?: boolean };
      if (done) {
        ctx.demo.patchLead(lead.id, { nextFollowUp: undefined });
        ctx.demo.addActivity(lead.id, activityEvent(ctx, 'status', 'activity.followUpDone'));
      } else {
        if (!at || Number.isNaN(new Date(at).getTime())) invalid(ctx, 'at');
        ctx.demo.patchLead(lead.id, { nextFollowUp: at });
        ctx.demo.addActivity(lead.id, activityEvent(ctx, 'status', 'activity.followUpSet', { at }));
      }
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: /^\/visits$/,
    handle: (ctx): SiteVisit[] => {
      if (!can(ctx, 'lead.view')) forbid(ctx);
      return visibleVisits(ctx).sort((a, b) => a.at.localeCompare(b.at));
    },
  },
  {
    method: 'POST',
    pattern: /^\/visits$/,
    handle: (ctx): SiteVisit => {
      if (!can(ctx, 'visit.schedule')) forbid(ctx);
      const input = (ctx.req.body ?? {}) as ScheduleVisitInput;
      const lead = findLead(ctx, input.leadId);
      if (!input.at || Number.isNaN(new Date(input.at).getTime())) invalid(ctx, 'at');
      const party = partyById(ctx, lead.partyId);
      const unit = input.unitId ? UNITS.find((u) => u.id === input.unitId) : undefined;
      const visit: SiteVisit = {
        id: ctx.demo.nextId('vst'),
        leadId: lead.id,
        leadRef: lead.ref,
        displayName: party?.displayName ?? '—',
        phone: party?.phone ?? '',
        projectId: lead.projectId,
        projectName: projectName(lead.projectId),
        ...(unit ? { unitRef: unit.ref } : {}),
        at: input.at,
        status: 'scheduled',
        ownerName: ctx.persona?.displayName ?? '',
      };
      ctx.demo.addVisit(visit);
      ctx.demo.addActivity(lead.id, activityEvent(ctx, 'visit', 'activity.visitBooked', { at: input.at }));
      return visit;
    },
  },
  {
    method: 'POST',
    pattern: /^\/visits\/(?<visitId>[\w-]+)\/status$/,
    handle: (ctx) => {
      const visit = visibleVisits(ctx).find((v) => v.id === ctx.params.visitId);
      if (!visit) notFound(ctx);
      if (!can(ctx, 'visit.schedule')) forbid(ctx);
      const status = (ctx.req.body as { status?: VisitStatus })?.status;
      if (!status) invalid(ctx, 'status');
      ctx.demo.patchVisit(visit.id, { status });
      if (status === 'completed') ctx.demo.addActivity(visit.leadId, activityEvent(ctx, 'visit', 'activity.visitCompleted'));
      if (status === 'confirmed') ctx.demo.addActivity(visit.leadId, activityEvent(ctx, 'visit', 'activity.visitConfirmed', { at: visit.at }));
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: /^\/units\/(?<unitId>[\w-]+)$/,
    handle: (ctx) => {
      if (!can(ctx, 'unit.view')) forbid(ctx);
      const unit = UNITS.find((u) => u.id === ctx.params.unitId);
      if (!unit) notFound(ctx);
      if (!isScopeOnly(ctx, unit.projectId)) forbid(ctx);
      const holds = Object.fromEntries(Object.entries(ctx.demo.holds()).map(([k, v]) => [k, { leadRef: v.leadRef, until: v.until }]));
      return unitDetail(unit, holds);
    },
  },
  {
    method: 'POST',
    pattern: /^\/units\/(?<unitId>[\w-]+)\/hold$/,
    handle: (ctx) => {
      if (!can(ctx, 'unit.hold')) forbid(ctx);
      const unit = UNITS.find((u) => u.id === ctx.params.unitId);
      if (!unit) notFound(ctx);
      const lead = findLead(ctx, (ctx.req.body as { leadId?: string })?.leadId ?? '');
      if (unit.status !== 'available' || ctx.demo.holds()[unit.id]) invalid(ctx, 'unit', 'forms:errors.unitUnavailable');
      const until = new Date(Date.now() + 2 * DAY).toISOString();
      ctx.demo.hold(unit.id, { leadId: lead.id, leadRef: lead.ref, until });
      ctx.demo.addActivity(lead.id, activityEvent(ctx, 'status', 'activity.unitHeld', { unit: unit.ref, until }));
      return { ok: true, until };
    },
  },
  {
    method: 'POST',
    pattern: /^\/units\/(?<unitId>[\w-]+)\/release$/,
    handle: (ctx) => {
      if (!can(ctx, 'unit.hold')) forbid(ctx);
      const hold = ctx.demo.holds()[ctx.params.unitId!];
      if (!hold) notFound(ctx);
      ctx.demo.release(ctx.params.unitId!);
      const unit = UNITS.find((u) => u.id === ctx.params.unitId);
      ctx.demo.addActivity(hold.leadId, activityEvent(ctx, 'status', 'activity.unitReleased', { unit: unit?.ref ?? '' }));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/demo\/reset$/,
    handle: (ctx) => {
      ctx.demo.reset();
      ctx.training.clear();
      return { ok: true };
    },
  },
];
