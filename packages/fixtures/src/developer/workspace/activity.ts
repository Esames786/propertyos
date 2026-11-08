import type { ActivityGroup, ActivityItem, ActivityRange } from '@repo/contracts';
import { can, type HandlerContext } from '../../handler-types';
import { leadHistory } from '../../crm-data';
import { canViewDocuments, docsOf, templateVisible, visibleDocs } from '../documents/views';
import { addDays } from './common';
import { inContext } from './records';
import { resolveRecord } from './registry';

/**
 * Gate E.13 recent activity (HOME-005), projected by the reader's scope before it is serialised
 * (plan §4.4, Issue #16 P0-1): an entry exists only for a record the reader may open now, and its
 * values come from that record alone (no name, amount or note of a hidden record). Sources: the CRM's
 * lead history (fixture and this session), document uploads and versions, template and policy drafts
 * and decisions. Later slices add theirs (opportunities, holds, journals) the same way.
 */
const since = (today: string, range: ActivityRange) => (range === 'today' ? today : addDays(today, range === '7d' ? -6 : -29));

interface Source {
  group: ActivityGroup;
  available: (ctx: HandlerContext) => boolean;
  collect: (ctx: HandlerContext, from: string) => ActivityItem[];
}

const SOURCES: readonly Source[] = [
  {
    group: 'crm',
    available: (ctx) => can(ctx, 'lead.view', 'operational'),
    collect: (ctx, from) =>
      ctx.demo.leads(ctx.data.leads).flatMap((lead) => {
        const record = resolveRecord(ctx, lead.id);
        if (!record || !inContext(ctx, record)) return [];
        return [...ctx.demo.sessionActivity(lead.id), ...leadHistory(ctx.data, lead)]
          .filter((e) => e.at.slice(0, 10) >= from)
          .map((e): ActivityItem => ({ id: `crm:${lead.id}:${e.id}`, at: e.at, actorName: e.actorName, mine: e.actorName === ctx.persona?.displayName, group: 'crm', messageKey: `common:${e.messageKey}`, params: e.params, record }));
      }),
  },
  {
    group: 'documents',
    available: canViewDocuments,
    collect: (ctx, from) =>
      visibleDocs(ctx).flatMap(({ doc }) => {
        const record = resolveRecord(ctx, doc.id);
        if (!record) return [];
        return doc.versions
          .filter((v) => v.uploadedAt.slice(0, 10) >= from)
          .map((v): ActivityItem => ({ id: `doc:${doc.id}:v${v.n}`, at: v.uploadedAt, actorName: v.uploadedByName, mine: v.uploadedBy === ctx.persona?.principalId, group: 'documents', messageKey: v.n === 1 ? 'documents:events.uploaded' : 'documents:events.versionAdded', params: { version: String(v.n), note: v.note }, record }));
      }),
  },
  {
    group: 'templates',
    available: canViewDocuments,
    collect: (ctx, from) =>
      docsOf(ctx).templates.flatMap((t) => {
        if (!templateVisible(ctx, t) || (t.projectId && !ctx.allowsProject(t.projectId))) return [];
        const record = resolveRecord(ctx, t.id);
        if (!record) return [];
        return t.versions.flatMap((v): ActivityItem[] => [
          ...(v.draftedAt.slice(0, 10) >= from ? [{ id: `tpl:${t.id}:v${v.n}:drafted`, at: v.draftedAt, actorName: v.draftedByName, mine: v.draftedBy === ctx.persona?.principalId, group: 'templates' as const, messageKey: 'documents:events.templateDrafted', params: { version: String(v.n), note: v.note }, record }] : []),
          ...(v.decision && v.decision.at.slice(0, 10) >= from
            ? [{ id: `tpl:${t.id}:v${v.n}:${v.decision.kind}`, at: v.decision.at, actorName: v.decision.byName, mine: v.decision.by === ctx.persona?.principalId, group: 'templates' as const, messageKey: v.decision.kind === 'approved' ? 'documents:events.templateApproved' : 'documents:events.templateReturned', params: { version: String(v.n), note: v.decision.note }, record }]
            : []),
        ]);
      }),
  },
];

export function activityFor(ctx: HandlerContext, range: ActivityRange, group: ActivityGroup | 'all', who: 'all' | 'mine'): { items: ActivityItem[]; groups: ActivityGroup[] } {
  const live = SOURCES.filter((s) => s.available(ctx));
  const from = since(ctx.at, range);
  const items = live
    .filter((s) => group === 'all' || s.group === group)
    .flatMap((s) => s.collect(ctx, from))
    .filter((i) => who === 'all' || i.mine)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return { items, groups: live.map((s) => s.group) };
}
