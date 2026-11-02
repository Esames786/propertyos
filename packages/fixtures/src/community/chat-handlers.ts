import type { FlatFact } from '@repo/contracts';
import { invalid, notFound, requires, refused, authorize, type Handler, type HandlerContext } from '../handler-types';
import { opsSite, residentOps, siteRecord } from '../operations/site';
import { smartGroups, type CommunityFlat, type CommunityGroup } from './smart-groups';
import { mayDeliverQueued, mayReadMessage, type ChatMembership, type ChatMessage, type RetentionRule } from './chat-policy';

/** D.3 browser-only fictional group chat. No real socket, notifications or messaging provider. */
interface StoredChatMessage extends ChatMessage {
  text: string;
  byPartyId: string;
  /** Public group chat uses author display names but NEVER exposes phone, email, dues or flat ownership. */
  byName: string;
  clientKey?: string;
}
interface Report {
  id: string;
  messageId: string;
  groupId: string;
  reason: string;
  reportedById: string;
  reportedAt: string;
  state: 'open' | 'dismissed' | 'removed';
  decidedById?: string;
  decidedAt?: string;
}
interface ChatState {
  /** Retention must be set explicitly by an authorized tenant admin; no assumed legal duration. */
  retentionDays?: number;
  retentionVersions: Array<{ days: number; changedById: string; changedAt: string; legalReviewConfirmed: boolean }>;
  messages: StoredChatMessage[];
  reports: Report[];
  lastRead: Record<string, string>;
}
const section = (ctx: HandlerContext) => ctx.demo.section<ChatState>('community_chat:' + opsSite(ctx).siteId, () => ({
  retentionVersions: [], messages: [], reports: [], lastRead: {},
}));
const timestamp = (ctx: HandlerContext) => new Date(ctx.at.length === 10 ? ctx.at + 'T12:00:00Z' : ctx.at).toISOString();
const policy = (s: ChatState): RetentionRule | undefined => s.retentionDays
  ? { days: s.retentionDays, heldMessageIds: s.reports.filter(r => r.state === 'open').map(r => r.messageId) } : undefined;
const textBody = (ctx: HandlerContext, min = 1, max = 2000) => {
  const raw = (ctx.req.body ?? {}) as { text?: unknown };
  if (typeof raw.text !== 'string' || raw.text.trim().length < min || raw.text.trim().length > max) invalid(ctx, 'text');
  return raw.text.trim();
};

function societyGroups(ctx: HandlerContext) {
  const site = opsSite(ctx);
  if (!site.society) notFound(ctx);
  const flats: CommunityFlat[] = site.flats.map(f => ({ id: f.id, code: f.code, buildingId: f.buildingId, floor: f.floor }));
  const facts = site.society.view.facts;
  return { site, facts, groups: smartGroups(flats, facts, ctx.at.slice(0, 10)) };
}

/**
 * All resident calls first pass the transport's resident_portal gate, then D.2's verified,
 * effective-dated flat linkage and same-site community_chat module grant. The group check below
 * further limits members to current occupants (owner/payer alone never qualifies).
 */
function resident(ctx: HandlerContext) {
  const res = residentOps(ctx, { module: 'community_chat' });
  const { groups, facts } = societyGroups(ctx);
  const mine = groups.filter(g => g.memberPartyIds.includes(res.partyId));
  return { res, groups: mine, facts };
}
function membership(ctx: HandlerContext, group: CommunityGroup, partyId: string, facts: readonly FlatFact[]): ChatMembership[] {
  const on = ctx.at.slice(0, 10);
  const members = facts.filter(f => f.partyId === partyId && f.role === 'occupant'
    && f.occupancyKind !== 'association' && f.from <= on && (!f.to || on < f.to));
  const { site } = societyGroups(ctx);
  const inGroup = (f: FlatFact) => {
    const flat = site.flats.find(x => x.id === f.flatId);
    if (!flat) return false;
    if (group.kind === 'site') return true;
    if (group.kind === 'block') return group.id === 'block:' + flat.buildingId;
    return group.id === 'floor:' + flat.buildingId + ':' + flat.floor;
  };
  return members.filter(inGroup).map(f => ({
    principalId: partyId, groupId: group.id, joinedAt: f.from + 'T00:00:00Z',
    ...(f.to ? { leftAt: f.to + 'T00:00:00Z' } : {}),
  }));
}
function guarded(ctx: HandlerContext, groupId: string) {
  const current = resident(ctx);
  const group = current.groups.find(g => g.id === groupId);
  if (!group) notFound(ctx);
  return { ...current, group, memberships: membership(ctx, group, current.res.partyId, current.facts) };
}
function chatRead(ctx: HandlerContext, group: CommunityGroup, memberships: ChatMembership[], s: ChatState): StoredChatMessage[] {
  const retention = policy(s);
  return s.messages.filter(m => {
    if (m.groupId !== group.id) return false;
    return mayReadMessage({ enabled: true, memberships, principalId: memberships[0]?.principalId ?? '', groupId: group.id, message: m, now: timestamp(ctx), retention }).allowed;
  });
}
const readRow = (m: StoredChatMessage) => ({
  id: m.id, groupId: m.groupId, text: m.text, senderName: m.byName, senderIsMe: false, at: m.createdAt,
});
function staff(ctx: HandlerContext, permission: 'chat.groups.manage' | 'chat.moderate') {
  if (ctx.persona?.app !== 'backoffice') notFound(ctx);
  const { site, groups } = societyGroups(ctx);
  authorize(ctx, 'community_chat', siteRecord(site), permission);
  return groups;
}

export const COMMUNITY_CHAT_HANDLERS: readonly Handler[] = [
  {
    method: 'GET', pattern: /^\/portal\/chat\/groups$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { groups } = resident(ctx);
      const s = section(ctx);
      return {
        available: !!policy(s), retentionConfigured: !!policy(s),
        groups: groups.map(g => ({ id: g.id, kind: g.kind, title: g.title,
          unread: policy(s) ? chatRead(ctx, g, membership(ctx, g, ctx.persona!.partyId!, societyGroups(ctx).facts), s)
            .filter(m => m.byPartyId !== ctx.persona!.partyId && (!s.lastRead[ctx.persona!.partyId + '|' + g.id] || m.createdAt > s.lastRead[ctx.persona!.partyId + '|' + g.id]!)).length : 0,
        })),
      };
    },
  },
  {
    method: 'GET', pattern: /^\/portal\/chat\/groups\/(?<id>[\w:-]+)\/messages$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { group, memberships, res } = guarded(ctx, ctx.params.id!);
      const s = section(ctx);
      return { group: { id: group.id, title: group.title, kind: group.kind }, available: !!policy(s),
        messages: chatRead(ctx, group, memberships, s).map(m => ({ ...readRow(m), senderIsMe: m.byPartyId === res.partyId })),
      };
    },
  },
  {
    method: 'POST', pattern: /^\/portal\/chat\/groups\/(?<id>[\w:-]+)\/messages$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { group, memberships, res } = guarded(ctx, ctx.params.id!);
      const s = section(ctx);
      const decision = mayDeliverQueued({ enabled: true, memberships, senderId: res.partyId, groupId: group.id, now: timestamp(ctx), retention: policy(s) });
      if (!decision.allowed) refused({ allowed: false, reason: 'state_locked' }, ctx.correlationId);
      const text = textBody(ctx, 1, 2000);
      const key = (ctx.req.body as { clientKey?: unknown } | undefined)?.clientKey;
      if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{6,80}$/.test(key))) invalid(ctx, 'clientKey');
      const old = typeof key === 'string' ? s.messages.find(m => m.byPartyId === res.partyId && m.groupId === group.id && m.clientKey === key) : undefined;
      if (old) return { ...readRow(old), senderIsMe: true };
      const message: StoredChatMessage = { id: ctx.demo.nextId('chat'), groupId: group.id,
        senderId: res.principalId, byPartyId: res.partyId, byName: res.name,
        createdAt: timestamp(ctx), text, ...(typeof key === 'string' ? { clientKey: key } : {}) };
      s.messages.push(message);
      ctx.demo.save();
      return { ...readRow(message), senderIsMe: true };
    },
  },
  {
    method: 'POST', pattern: /^\/portal\/chat\/groups\/(?<id>[\w:-]+)\/read$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { group, memberships, res } = guarded(ctx, ctx.params.id!);
      const s = section(ctx);
      const visible = chatRead(ctx, group, memberships, s);
      if (!policy(s)) refused({ allowed: false, reason: 'state_locked' }, ctx.correlationId);
      s.lastRead[res.partyId + '|' + group.id] = visible.at(-1)?.createdAt ?? timestamp(ctx);
      ctx.demo.save();
      return { ok: true };
    },
  },
  {
    method: 'POST', pattern: /^\/portal\/chat\/groups\/(?<id>[\w:-]+)\/report$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { group, memberships, res } = guarded(ctx, ctx.params.id!);
      const s = section(ctx);
      const input = (ctx.req.body ?? {}) as { messageId?: string; reason?: string };
      if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 500) invalid(ctx, 'reason');
      const m = chatRead(ctx, group, memberships, s).find(m => m.id === input.messageId);
      if (!m) notFound(ctx);
      const previous = s.reports.find(r => r.messageId === m.id && r.reportedById === res.principalId && r.state === 'open');
      if (previous) return { id: previous.id, state: previous.state };
      const report: Report = { id: ctx.demo.nextId('chat_report'), messageId: m.id, groupId: group.id,
        reason: input.reason.trim(), reportedById: res.principalId, reportedAt: timestamp(ctx), state: 'open' };
      s.reports.push(report);
      ctx.demo.save();
      return { id: report.id, state: report.state };
    },
  },
  {
    method: 'GET', pattern: /^\/ops\/chat\/groups$/,
    access: requires('community_chat', 'chat.groups.manage', 'operational'),
    handle: (ctx) => {
      const groups = staff(ctx, 'chat.groups.manage');
      const s = section(ctx);
      return { retentionDays: s.retentionDays ?? null,
        groups: groups.map(g => ({ id: g.id, title: g.title, kind: g.kind, memberCount: g.memberPartyIds.length })),
        history: s.retentionVersions.map(v => ({ ...v })),
      };
    },
  },
  {
    method: 'PATCH', pattern: /^\/ops\/chat\/policy$/,
    access: requires('community_chat', 'chat.groups.manage', 'operational'),
    handle: (ctx) => {
      staff(ctx, 'chat.groups.manage');
      const input = (ctx.req.body ?? {}) as { retentionDays?: unknown; legalReviewConfirmed?: unknown };
      const days = input.retentionDays;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 3650) invalid(ctx, 'retentionDays');
      if (input.legalReviewConfirmed !== true) invalid(ctx, 'legalReviewConfirmed');
      const s = section(ctx);
      s.retentionDays = days;
      s.retentionVersions.push({ days, changedById: ctx.access!.userId, changedAt: timestamp(ctx), legalReviewConfirmed: true });
      ctx.demo.save();
      return { retentionDays: days, available: true };
    },
  },
  {
    method: 'GET', pattern: /^\/ops\/chat\/reports$/,
    access: requires('community_chat', 'chat.moderate', 'operational'),
    handle: (ctx) => {
      staff(ctx, 'chat.moderate');
      const s = section(ctx);
      return { items: s.reports.map(r => {
        const m = s.messages.find(m => m.id === r.messageId);
        return { ...r, message: m ? { id: m.id, text: m.text, senderName: m.byName, at: m.createdAt } : null };
      }) };
    },
  },
  {
    method: 'POST', pattern: /^\/ops\/chat\/reports\/(?<id>[\w-]+)\/decide$/,
    access: requires('community_chat', 'chat.moderate', 'operational'),
    handle: (ctx) => {
      staff(ctx, 'chat.moderate');
      const s = section(ctx);
      const report = s.reports.find(r => r.id === ctx.params.id);
      if (!report) notFound(ctx);
      if (report.state !== 'open') refused({ allowed: false, reason: 'state_locked' }, ctx.correlationId);
      const action = (ctx.req.body as { action?: string } | undefined)?.action;
      if (action !== 'dismissed' && action !== 'removed') invalid(ctx, 'action');
      if (report.reportedById === ctx.access!.userId) refused({ allowed: false, reason: 'separation_of_duties' }, ctx.correlationId);
      report.state = action;
      report.decidedById = ctx.access!.userId;
      report.decidedAt = timestamp(ctx);
      if (action === 'removed') {
        const m = s.messages.find(m => m.id === report.messageId);
        if (m) m.deletedAt = timestamp(ctx);
      }
      ctx.demo.save();
      return { id: report.id, state: report.state };
    },
  },
];
