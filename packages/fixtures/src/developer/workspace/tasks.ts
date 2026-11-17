import { TASK_URGENCIES, type ModuleKey, type RecordRef, type TaskItem, type TaskKind, type TaskUrgency } from '@repo/contracts';
import { can, type HandlerContext } from '../../handler-types';
import { ownerName } from '../../crm-data';
import { societyDashboardOf } from '../../society/handlers';
import { canApproveTemplates, canDraftTemplates, canViewDocuments, current, docHref, docsOf, mayDecide, templateGoverned, templateHref, templateVisible, versionState, visibleDocs } from '../documents/views';
import { addDays } from './common';
import { visibleLead } from './records';
import { resolveRecord } from './registry';

/**
 * Gate E.13 task providers (HOME-002 my tasks, HOME-004 work queue). Each provider declares what it
 * needs (module and permission) and lists real work from its own module's records, each re-resolved
 * for the reader: no invented counts, and a record the reader may not open is never listed or counted.
 * "Mine" is the reader's own work; the team queue is everyone's work inside the reader's scope.
 *
 * Integration hook: later slices register providers here (E.1 opportunity next steps, E.4 hold expiry
 * with E.0's hold ownership, APR-001 approvals for every edition once E.0 opens them).
 */
export type Scope = 'mine' | 'team';

interface TaskProvider {
  kind: TaskKind;
  module: ModuleKey;
  available: (ctx: HandlerContext) => boolean;
  collect: (ctx: HandlerContext, scope: Scope) => TaskItem[];
}

export function urgencyOf(today: string, due: string | undefined): TaskUrgency {
  if (!due) return 'later';
  const day = due.slice(0, 10);
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  return day <= addDays(today, 3) ? 'soon' : 'later';
}

const OPEN_LEAD = new Set(['new', 'assigned', 'contacted', 'qualified', 'dormant']);
const me = (ctx: HandlerContext) => ctx.persona?.id;
const inHeader = (ctx: HandlerContext, r: RecordRef) => !r.project || !ctx.data.projects.some((p) => p.id === r.project!.id) || ctx.allowsProject(r.project.id);

const PROVIDERS: readonly TaskProvider[] = [
  {
    kind: 'follow_up',
    module: 'crm',
    available: (ctx) => can(ctx, 'lead.view', 'operational'),
    collect: (ctx, scope) =>
      ctx.demo
        .leads(ctx.data.leads)
        .filter((l) => l.nextFollowUp && OPEN_LEAD.has(l.status) && (scope === 'team' || l.ownerPersonaId === me(ctx)))
        .flatMap((l): TaskItem[] => {
          const record = visibleLead(ctx, l.id) ? resolveRecord(ctx, l.id) : null;
          if (!record || !inHeader(ctx, record)) return [];
          return [{ id: `follow_up:${l.id}`, kind: 'follow_up', module: 'crm', urgency: urgencyOf(ctx.at, l.nextFollowUp), due: l.nextFollowUp!, record, actionHref: `${record.href}&tab=activity`, owner: { name: ownerName(l.ownerPersonaId), mine: l.ownerPersonaId === me(ctx) } }];
        }),
  },
  {
    kind: 'site_visit',
    module: 'crm',
    available: (ctx) => can(ctx, 'lead.view', 'operational'),
    collect: (ctx, scope) =>
      ctx.demo
        .visits(ctx.data.visits)
        .filter((v) => (v.status === 'scheduled' || v.status === 'confirmed') && v.at.slice(0, 10) >= addDays(ctx.at, -7))
        .flatMap((v): TaskItem[] => {
          const lead = visibleLead(ctx, v.leadId);
          const record = lead ? resolveRecord(ctx, lead.id) : null;
          if (!lead || !record || !inHeader(ctx, record)) return [];
          const mine = lead.ownerPersonaId === me(ctx);
          if (scope === 'mine' && !mine) return [];
          return [{ id: `site_visit:${v.id}`, kind: 'site_visit', module: 'crm', urgency: urgencyOf(ctx.at, v.at), due: v.at, record, actionHref: `${record.href}&tab=visits`, owner: { name: v.ownerName, mine }, detail: { unit: v.unitRef ?? '' } }];
        }),
  },
  {
    kind: 'hold_expiry',
    module: 'sales',
    available: (ctx) => can(ctx, 'unit.hold', 'operational'),
    collect: (ctx, scope) =>
      Object.entries(ctx.demo.holds()).flatMap(([unitId, hold]): TaskItem[] => {
        const record = resolveRecord(ctx, unitId);
        if (!record || record.type !== 'unit' || !inHeader(ctx, record)) return [];
        const lead = visibleLead(ctx, hold.leadId);
        const mine = lead?.ownerPersonaId === me(ctx);
        if (scope === 'mine' && !mine) return [];
        const leadRef = lead ? resolveRecord(ctx, lead.id) : null;
        return [{ id: `hold_expiry:${unitId}`, kind: 'hold_expiry', module: 'sales', urgency: urgencyOf(ctx.at, hold.until), due: hold.until, record, actionHref: leadRef ? `${leadRef.href}&tab=units` : record.href, owner: lead ? { name: ownerName(lead.ownerPersonaId), mine } : null, detail: lead ? { lead: lead.ref } : {} }];
      }),
  },
  {
    kind: 'document_expiry',
    module: 'core',
    available: canViewDocuments,
    collect: (ctx, scope) =>
      visibleDocs(ctx).flatMap(({ doc, record: linked }): TaskItem[] => {
        const v = current(doc);
        if (!v.expiresOn || v.expiresOn > addDays(ctx.at, 30)) return [];
        const lead = linked.type === 'lead' ? visibleLead(ctx, linked.id) : null;
        const mine = v.uploadedBy === ctx.persona?.principalId || lead?.ownerPersonaId === me(ctx);
        if (scope === 'mine' && !mine) return [];
        const record = resolveRecord(ctx, doc.id);
        if (!record) return [];
        return [{ id: `document_expiry:${doc.id}`, kind: 'document_expiry', module: 'core', urgency: urgencyOf(ctx.at, v.expiresOn), due: v.expiresOn, record, actionHref: docHref(doc.id, '&drawer=version'), owner: { name: v.uploadedByName, mine }, detail: { linked: linked.title, linkedRef: linked.ref } }];
      }),
  },
  {
    kind: 'template_approval',
    module: 'core',
    available: canApproveTemplates,
    collect: (ctx, scope) =>
      docsOf(ctx).templates.flatMap((t): TaskItem[] => {
        if (!templateVisible(ctx, t) || (t.projectId && !ctx.allowsProject(t.projectId))) return [];
        const v = t.versions.find((x) => !x.decision);
        if (!v) return [];
        const mine = mayDecide(ctx, t, v);
        if (scope === 'mine' && !mine) return [];
        const record = resolveRecord(ctx, t.id);
        if (!record) return [];
        return [{ id: `template_approval:${t.id}:v${v.n}`, kind: 'template_approval', module: 'core', urgency: urgencyOf(ctx.at, v.effectiveFrom), due: v.effectiveFrom, record, actionHref: templateHref(t.id, `&version=${v.n}`), owner: { name: v.draftedByName, mine }, detail: { version: String(v.n) } }];
      }),
  },
  {
    kind: 'template_returned',
    module: 'core',
    available: canDraftTemplates,
    collect: (ctx, scope) =>
      docsOf(ctx).templates.flatMap((t): TaskItem[] => {
        if (!templateVisible(ctx, t) || !templateGoverned(ctx, t) || (t.projectId && !ctx.allowsProject(t.projectId))) return [];
        const v = t.versions[t.versions.length - 1]!;
        if (versionState(t, v, ctx.at) !== 'returned') return [];
        const mine = v.draftedBy === ctx.persona?.principalId;
        if (scope === 'mine' && !mine) return [];
        const record = resolveRecord(ctx, t.id);
        if (!record) return [];
        return [{ id: `template_returned:${t.id}:v${v.n}`, kind: 'template_returned', module: 'core', urgency: 'soon', record, actionHref: templateHref(t.id, '&drawer=draft'), owner: { name: v.draftedByName, mine }, detail: { version: String(v.n), note: v.decision?.note ?? '' } }];
      }),
  },
  {
    // A society's own work (C.1–S.1): the dashboard's tasks, each already decided by the society's rules.
    kind: 'society_task',
    module: 'dues',
    available: (ctx) => !!ctx.data.society,
    collect: (ctx, scope) => {
      try {
        const d = societyDashboardOf({ ...ctx, params: {} });
        return d.tasks
          .filter((task) => scope === 'team' || task.yours)
          .map((task): TaskItem => ({ id: `society_task:${task.key}`, kind: 'society_task', module: 'dues', urgency: task.urgency === 'urgent' ? 'today' : 'soon', actionHref: task.href, owner: task.yours ? { name: ctx.persona!.displayName, mine: true } : null, titleKey: `billing:tasks.${task.key}.title`, params: { period: task.period ?? d.period, count: String(task.count ?? 0) } }));
      } catch {
        return [];
      }
    },
  },
  {
    kind: 'society_approval',
    module: 'dues',
    available: (ctx) => !!ctx.data.society,
    collect: (ctx, scope) => {
      try {
        const d = societyDashboardOf({ ...ctx, params: {} });
        return d.approvals.items
          .filter((a) => scope === 'team' || a.yours)
          .map((a): TaskItem => ({ id: `society_approval:${a.kind}:${a.id}`, kind: 'society_approval', module: 'dues', urgency: 'soon', actionHref: a.href, owner: a.yours ? { name: ctx.persona!.displayName, mine: true } : null, titleKey: 'workspace:hub.tasks.approvalItem', params: { label: a.label } }));
      } catch {
        return [];
      }
    },
  },
];

const RANK: Record<TaskUrgency, number> = { overdue: 0, today: 1, soon: 2, later: 3 };

export function tasksFor(ctx: HandlerContext, scope: Scope): { items: TaskItem[]; kinds: TaskKind[] } {
  const live = PROVIDERS.filter((p) => p.available(ctx));
  const items = live
    .flatMap((p) => p.collect(ctx, scope))
    .sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id));
  return { items, kinds: [...new Set(live.map((p) => p.kind))] };
}

export const countsOf = (items: readonly TaskItem[]) => Object.fromEntries(TASK_URGENCIES.map((u) => [u, items.filter((i) => i.urgency === u).length])) as Record<TaskUrgency, number>;
