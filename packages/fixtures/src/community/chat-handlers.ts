import { CHAT_REPORT_REASONS, type AudienceRole, type ChatConversation, type ChatGroupSummary, type ChatGroups, type ChatMessageView, type ChatPolicy, type ChatReportReason, type ChatReports, type ChatReportState, type ChatReportView, type ChatRulePreview, type ChatRules, type ChatRuleView, type ChatSendResult, type Permission } from '@repo/contracts';
import { byInstant } from '../clock';
import { authorize, can, notFound, requires, type Handler, type HandlerAccess, type HandlerContext } from '../handler-types';
import { invalid, notify, opsOf } from '../operations/common';
import { opsSite, residentOps, siteRecord, type OpsSite } from '../operations/site';
import { problem } from '../society/handlers';
import { mayDeliverQueued, mayReadMessage } from './chat-policy';
import { audienceCodes, groupDefs, membershipsOf, rosterOf, type ChatMember, type GroupDef, type GroupFacts, type Membership } from './groups';
import { communityEvent as ev, communityState, communityStamp, nextCommunity, type CommunityState, type StoredChatMessage, type StoredChatReport } from './state';

/**
 * Gate D.3 community chat (CHAT-001…004, PORTAL-031/032), browser-only and fictional: no live
 * transport, push or delivery to real people. One set of rules for both apps:
 * - Residents enter through rule R (resident_portal + portal.use, a verified link in force, then the
 *   community_chat grant for the same site and flat); staff need community_chat for the site and
 *   `chat.use`. Group membership comes only from facts (groups.ts) and is checked on every call, so a
 *   move-out ends reading, posting and delivery at once (404, nothing about the group is revealed).
 * - Nothing can be read or posted until the society sets a retention period (D-25 (5)); messages
 *   older than it disappear, unless a report about them is still open.
 * - A member sees nothing written before they joined (D-25 (2)). Direct messages are off (D-25 (1)).
 * - Moderators see only reported messages (D-25 (4)); a removed message stays as a marker.
 * - A message written offline is re-authorised when it arrives (rejected if the membership ended).
 */

const PAGE = 40;

interface Chat {
  site: OpsSite;
  state: CommunityState;
  who: ChatMember;
  g: GroupFacts;
  defs: GroupDef[];
  mine: Map<string, Membership>;
}

function groupFacts(ctx: HandlerContext, site: OpsSite): GroupFacts {
  const grant = ctx.access?.grants.find((x) => x.module === 'community_chat' && (x.sites === 'all' || x.sites.includes(site.siteId)));
  return {
    site,
    facts: site.society?.view.facts ?? [],
    terms: site.society?.state.finance?.committee.terms ?? [],
    committee: !!ctx.access?.features.includes('residents.committee'),
    licensedFrom: grant?.from ?? ctx.at,
    on: ctx.at,
  };
}

function load(ctx: HandlerContext, site: OpsSite, who: ChatMember, staffMayChat: boolean): Chat {
  const state = communityState(ctx, site);
  const g = groupFacts(ctx, site);
  return { site, state, who, g, defs: groupDefs(state, g), mine: membershipsOf(state, g, who, staffMayChat) };
}

/** Rule R, then membership facts (a resident with no current occupancy has no groups). */
function residentChat(ctx: HandlerContext): Chat {
  const res = residentOps(ctx, { module: 'community_chat' });
  return load(ctx, res.site, { key: `party:${res.partyId}`, kind: 'resident', name: res.name, partyId: res.partyId, principalId: res.principalId }, false);
}

/** Staff: the office app only, community_chat licensed for the organisation's site. */
function officeSite(ctx: HandlerContext, permission?: Permission): OpsSite {
  if (ctx.persona?.app !== 'backoffice') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const site = opsSite(ctx);
  authorize(ctx, 'community_chat', siteRecord(site), permission);
  return site;
}

function officeChat(ctx: HandlerContext): Chat {
  const site = officeSite(ctx, 'chat.use');
  const p = ctx.persona!;
  return load(ctx, site, { key: `staff:${p.principalId}`, kind: 'office', name: p.displayName, principalId: p.principalId }, can(ctx, 'chat.use'));
}

const now = (ctx: HandlerContext) => communityStamp(ctx);

/** Opaque, stable sender key (never a party or principal id). */
export function senderKeyOf(m: Pick<StoredChatMessage, 'partyId' | 'principalId'>): string {
  const raw = m.partyId ? `p:${m.partyId}` : `s:${m.principalId ?? ''}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return `snd_${(h >>> 0).toString(36)}`;
}

const isMine = (c: Chat, m: StoredChatMessage) => (c.who.kind === 'resident' ? m.senderKind === 'resident' && m.partyId === c.who.partyId : m.senderKind === 'office' && m.principalId === c.who.principalId);
const reporterOf = (c: Chat) => c.who.partyId ?? c.who.principalId;
const DAY = 86_400_000;

/** Past the society's retention period (shown in no chat from then on, whatever its reports). */
export const pastRetention = (state: CommunityState, m: Pick<StoredChatMessage, 'at'>, at: string) => !!state.chat.retentionDays && Date.parse(at) - Date.parse(m.at) >= state.chat.retentionDays * DAY;

/** Reported messages past retention still kept as evidence because their report is open (moderators only). */
const evidenceHeld = (ctx: HandlerContext, state: CommunityState) => state.chat.reports.filter((r) => r.state === 'open' && pastRetention(state, state.chat.messages.find((m) => m.id === r.messageId)!, now(ctx)));

/**
 * What the reader may see of a group: from their join and within the retention period. An open
 * report never extends what members see (Issue #9): a message kept as evidence past the period is
 * shown only in the moderators' report queue, never in a conversation.
 */
function readable(ctx: HandlerContext, c: Chat, groupId: string): StoredChatMessage[] {
  const m = c.mine.get(groupId);
  const days = c.state.chat.retentionDays;
  if (!m || !days) return [];
  const at = now(ctx);
  return c.state.chat.messages
    .filter((x) => x.groupId === groupId && mayReadMessage({ enabled: true, memberships: [{ principalId: c.who.key, groupId, joinedAt: m.since }], principalId: c.who.key, groupId, message: { id: x.id, groupId, senderId: x.partyId ?? x.principalId ?? '', createdAt: x.at }, now: at, retention: { days, heldMessageIds: [] } }).allowed)
    .sort(byInstant((x) => x.at));
}

function viewOf(c: Chat, m: StoredChatMessage): ChatMessageView {
  const key = senderKeyOf(m);
  const me = isMine(c, m);
  const blocked = !me && m.senderKind === 'resident' && (c.state.chat.blocks[c.who.key] ?? []).includes(key);
  const state = m.removed ? 'removed' : blocked ? 'blocked' : 'visible';
  const reportedByMe = c.state.chat.reports.some((r) => r.messageId === m.id && r.reports.some((x) => x.by === reporterOf(c)));
  return { id: m.id, groupId: m.groupId, ...(state === 'visible' ? { text: m.text } : {}), state, sender: { key, name: m.senderName, kind: m.senderKind, isMe: me }, at: m.at, reportedByMe };
}

function canPost(c: Chat, d: GroupDef): boolean {
  return !!c.state.chat.retentionDays && c.mine.has(d.id) && (d.postingPolicy === 'everyone' || c.who.kind === 'office');
}

function summaryOf(ctx: HandlerContext, c: Chat, d: GroupDef): ChatGroupSummary {
  const views = readable(ctx, c, d.id).map((m) => viewOf(c, m));
  const since = c.mine.get(d.id)!.since;
  const last = c.state.chat.reads[`${c.who.key}|${d.id}`] ?? since;
  const unread = views.filter((v) => v.state === 'visible' && !v.sender.isMe && Date.parse(v.at) > Date.parse(last)).length;
  const lastMsg = views.at(-1);
  return {
    id: d.id,
    kind: d.kind,
    ...(d.code ? { code: d.code } : {}),
    ...(d.name ? { name: d.name } : {}),
    unread,
    muted: (c.state.chat.mutes[c.who.key] ?? []).includes(d.id),
    readOnly: !canPost(c, d),
    canLeave: d.kind === 'custom' && c.who.kind === 'resident',
    ...(lastMsg ? { last: { at: lastMsg.at, senderName: lastMsg.sender.isMe ? '' : lastMsg.sender.name, preview: lastMsg.text ? lastMsg.text.slice(0, 90) : '', removed: lastMsg.state === 'removed' } } : {}),
  };
}

const groupOrder = (d: GroupDef) => ['site', 'block', 'floor', 'committee', 'staff', 'custom'].indexOf(d.kind);

function groupsOf(ctx: HandlerContext, c: Chat): ChatGroups {
  const days = c.state.chat.retentionDays ?? null;
  const defs = c.defs.filter((d) => c.mine.has(d.id)).sort((a, b) => groupOrder(a) - groupOrder(b) || (a.code ?? a.name ?? '').localeCompare(b.code ?? b.name ?? '', 'en', { numeric: true }));
  const left = (c.state.chat.left[c.who.key] ?? [])
    .filter((l) => !l.rejoinedAt)
    .map((l) => c.defs.find((d) => d.id === l.groupId))
    .filter((d): d is GroupDef => !!d && d.enabled);
  return {
    available: !!days,
    ...(days ? {} : { reason: 'retention_not_set' as const }),
    directMessages: false,
    retentionDays: days,
    groups: days ? defs.map((d) => summaryOf(ctx, c, d)) : [],
    left: left.map((d) => ({ id: d.id, name: d.name ?? '' })),
  };
}

function needsRetention(ctx: HandlerContext, c: Chat): number {
  const days = c.state.chat.retentionDays;
  if (!days) problem(ctx, 409, 'chat_retention_not_set', 'community:errors.retentionNotSet');
  return days;
}

/** A group the reader is in today (anything else is "not found": nothing about it is revealed). */
function groupOf(ctx: HandlerContext, c: Chat): GroupDef {
  const d = c.defs.find((x) => x.id === ctx.params.id);
  if (!d || !c.mine.has(d.id)) notFound(ctx);
  return d;
}

function conversationOf(ctx: HandlerContext, c: Chat, d: GroupDef): ChatConversation {
  const days = needsRetention(ctx, c);
  const all = readable(ctx, c, d.id);
  const before = typeof ctx.req.query?.before === 'string' ? ctx.req.query.before : undefined;
  const found = before ? all.findIndex((m) => m.id === before) : -1;
  const upto = found >= 0 ? found : all.length;
  const page = all.slice(Math.max(0, upto - PAGE), upto);
  const blocked = [...new Set(c.state.chat.blocks[c.who.key] ?? [])]
    .map((key) => ({ key, name: c.state.chat.messages.find((m) => senderKeyOf(m) === key)?.senderName ?? '' }))
    .filter((b) => b.name);
  return {
    group: summaryOf(ctx, c, d),
    visibleFrom: c.mine.get(d.id)!.since,
    retentionDays: days,
    messages: page.map((m) => viewOf(c, m)),
    hasMore: upto - PAGE > 0,
    canPost: canPost(c, d),
    etiquette: c.state.chat.etiquette,
    blocked,
  };
}

function send(ctx: HandlerContext, c: Chat): ChatSendResult {
  needsRetention(ctx, c);
  const d = groupOf(ctx, c);
  const body = (ctx.req.body ?? {}) as { text?: unknown; clientKey?: unknown; queuedAt?: unknown };
  const at = now(ctx);
  // Written offline: delivered only if the writer is still a member when it arrives (D-25 (3)).
  const m0 = c.mine.get(d.id)!;
  const decision = mayDeliverQueued({ enabled: true, memberships: [{ principalId: c.who.key, groupId: d.id, joinedAt: m0.since }], senderId: c.who.key, groupId: d.id, now: at, retention: { days: c.state.chat.retentionDays!, heldMessageIds: [] } });
  if (!decision.allowed) notFound(ctx);
  if (!canPost(c, d)) problem(ctx, 403, 'posting_restricted', 'community:errors.postingRestricted');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) invalid(ctx, 'text', 'forms:errors.required');
  if (text.length > 1000) invalid(ctx, 'text', 'community:errors.maxLength', { max: '1000' });
  const key = body.clientKey;
  if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(key))) invalid(ctx, 'clientKey', 'community:errors.invalid');
  if (body.queuedAt !== undefined && (typeof body.queuedAt !== 'string' || Number.isNaN(Date.parse(body.queuedAt)))) invalid(ctx, 'queuedAt', 'community:errors.invalid');
  const old = typeof key === 'string' ? c.state.chat.messages.find((m) => m.groupId === d.id && m.clientKey === key && isMine(c, m)) : undefined;
  if (old) return { message: viewOf(c, old), duplicate: true };
  const { id } = nextCommunity(c.state, c.site, 'message');
  const m: StoredChatMessage = {
    id,
    groupId: d.id,
    senderKind: c.who.kind,
    senderName: c.who.name,
    ...(c.who.partyId ? { partyId: c.who.partyId } : {}),
    principalId: c.who.principalId,
    text,
    at,
    ...(typeof key === 'string' ? { clientKey: key } : {}),
    ...(typeof body.queuedAt === 'string' ? { queuedAt: body.queuedAt } : {}),
  };
  c.state.chat.messages.push(m);
  // Your own message is read by you.
  c.state.chat.reads[`${c.who.key}|${d.id}`] = at;
  ctx.demo.save();
  return { message: viewOf(c, m), duplicate: false };
}

function markRead(ctx: HandlerContext, c: Chat) {
  needsRetention(ctx, c);
  const d = groupOf(ctx, c);
  const latest = readable(ctx, c, d.id).at(-1);
  if (latest) c.state.chat.reads[`${c.who.key}|${d.id}`] = latest.at;
  ctx.demo.save();
  return { ok: true };
}

function mute(ctx: HandlerContext, c: Chat) {
  const d = groupOf(ctx, c);
  const on = (ctx.req.body as { muted?: unknown } | undefined)?.muted;
  if (typeof on !== 'boolean') invalid(ctx, 'muted', 'forms:errors.required');
  const list = new Set(c.state.chat.mutes[c.who.key] ?? []);
  if (on) list.add(d.id);
  else list.delete(d.id);
  c.state.chat.mutes[c.who.key] = [...list];
  ctx.demo.save();
  return { muted: on };
}

function report(ctx: HandlerContext, c: Chat): { id: string; state: ChatReportState } {
  needsRetention(ctx, c);
  const m = c.state.chat.messages.find((x) => x.id === ctx.params.id);
  // Only a message the reporter can see now (member, after joining, within retention).
  if (!m || m.removed || !readable(ctx, c, m.groupId).some((x) => x.id === m.id)) notFound(ctx);
  if (isMine(c, m)) problem(ctx, 409, 'own_message', 'community:errors.ownMessage');
  const body = (ctx.req.body ?? {}) as { reason?: unknown; note?: unknown };
  if (!CHAT_REPORT_REASONS.includes(body.reason as ChatReportReason)) invalid(ctx, 'reason', 'forms:errors.required');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) invalid(ctx, 'note', 'community:errors.maxLength', { max: '500' });
  if (body.reason === 'other' && note.length < 5) invalid(ctx, 'note', 'community:errors.minLength', { min: '5' });
  const by = reporterOf(c);
  const at = now(ctx);
  let r = c.state.chat.reports.find((x) => x.messageId === m.id && x.state === 'open');
  if (r?.reports.some((x) => x.by === by)) return { id: r.id, state: r.state };
  if (!r) {
    const next = nextCommunity(c.state, c.site, 'report');
    r = { id: next.id, ref: next.ref, messageId: m.id, groupId: m.groupId, state: 'open', reports: [], history: [] };
    c.state.chat.reports.push(r);
  }
  r.reports.push({ by, reason: body.reason as ChatReportReason, ...(note ? { note } : {}), at });
  // Reporters are never named, to the author or to moderators.
  r.history.push(ev(at, '', c.who.kind === 'office' ? 'staff' : 'resident', 'reported'));
  ctx.demo.save();
  return { id: r.id, state: r.state };
}

function block(ctx: HandlerContext, c: Chat) {
  const body = (ctx.req.body ?? {}) as { key?: unknown; blocked?: unknown };
  if (typeof body.key !== 'string' || typeof body.blocked !== 'boolean') invalid(ctx, 'key', 'forms:errors.required');
  const key = body.key as string;
  const blocked = body.blocked as boolean;
  // Only a resident who wrote in one of your groups (never the office, never yourself).
  const known = c.state.chat.messages.some((m) => m.senderKind === 'resident' && senderKeyOf(m) === key && c.mine.has(m.groupId) && !isMine(c, m));
  if (!known) notFound(ctx);
  const list = new Set(c.state.chat.blocks[c.who.key] ?? []);
  if (blocked) list.add(key);
  else list.delete(key);
  c.state.chat.blocks[c.who.key] = [...list];
  ctx.demo.save();
  return { blocked };
}

function leave(ctx: HandlerContext, c: Chat) {
  const d = groupOf(ctx, c);
  if (d.kind !== 'custom') problem(ctx, 409, 'smart_group', 'community:errors.smartGroup');
  const list = (c.state.chat.left[c.who.key] ??= []);
  const existing = list.find((l) => l.groupId === d.id);
  if (existing) {
    existing.at = now(ctx);
    delete existing.rejoinedAt;
  } else list.push({ groupId: d.id, at: now(ctx) });
  ctx.demo.save();
  return { left: true };
}

function rejoin(ctx: HandlerContext, c: Chat) {
  const l = (c.state.chat.left[c.who.key] ?? []).find((x) => x.groupId === ctx.params.id && !x.rejoinedAt);
  if (!l) notFound(ctx);
  // Join again only if the group's audience still includes you; the history in between stays hidden.
  const probe = membershipsOf({ ...c.state, chat: { ...c.state.chat, left: {} } }, c.g, c.who, false);
  if (!probe.has(l.groupId)) notFound(ctx);
  l.rejoinedAt = now(ctx);
  ctx.demo.save();
  return { rejoined: true };
}

/** The same endpoints for residents (portal) and the office (CHAT-001). */
function memberEndpoints(prefix: '/portal/chat' | '/ops/chat', access: HandlerAccess, chat: (ctx: HandlerContext) => Chat, resident: boolean): Handler[] {
  const p = prefix.replace(/\//g, '\\/');
  const id = '(?<id>[\\w:-]+)';
  const r = (s: string) => new RegExp(`^${p}${s}$`);
  const list: Handler[] = [
    { method: 'GET', pattern: r('\\/groups'), access, handle: (ctx) => groupsOf(ctx, chat(ctx)) },
    {
      method: 'GET',
      pattern: r(`\\/groups\\/${id}\\/messages`),
      access,
      handle: (ctx) => {
        const c = chat(ctx);
        return conversationOf(ctx, c, groupOf(ctx, c));
      },
    },
    { method: 'POST', pattern: r(`\\/groups\\/${id}\\/messages`), access, handle: (ctx) => send(ctx, chat(ctx)) },
    { method: 'POST', pattern: r(`\\/groups\\/${id}\\/read`), access, handle: (ctx) => markRead(ctx, chat(ctx)) },
    { method: 'POST', pattern: r(`\\/groups\\/${id}\\/mute`), access, handle: (ctx) => mute(ctx, chat(ctx)) },
    { method: 'POST', pattern: r('\\/messages\\/(?<id>[\\w-]+)\\/report'), access, handle: (ctx) => report(ctx, chat(ctx)) },
  ];
  if (resident) {
    list.push(
      { method: 'POST', pattern: r(`\\/groups\\/${id}\\/leave`), access, handle: (ctx) => leave(ctx, chat(ctx)) },
      { method: 'POST', pattern: r(`\\/groups\\/${id}\\/rejoin`), access, handle: (ctx) => rejoin(ctx, chat(ctx)) },
      { method: 'POST', pattern: r('\\/blocks'), access, handle: (ctx) => block(ctx, chat(ctx)) },
    );
  }
  return list;
}

// ---------------------------------------------------------------------------------------------
// Office: groups and policy (chat.groups.manage), reports (chat.moderate)
// ---------------------------------------------------------------------------------------------

function manage(ctx: HandlerContext, permission: Permission) {
  const site = officeSite(ctx, permission);
  const state = communityState(ctx, site);
  const g = groupFacts(ctx, site);
  return { site, state, g };
}

function ruleOf(m: ReturnType<typeof manage>, d: GroupDef): ChatRuleView {
  return {
    id: d.id,
    kind: d.kind,
    ...(d.code ? { code: d.code } : {}),
    ...(d.name ? { name: d.name } : {}),
    enabled: d.enabled,
    postingPolicy: d.postingPolicy,
    memberCount: rosterOf(m.state, m.g, d.id).length,
    ...(d.custom ? { audience: { ...d.custom.audience, label: audienceCodes(m.site, d.custom.audience) }, createdByName: d.custom.createdByName, createdAt: d.custom.createdAt } : {}),
  };
}

const ROLES: readonly AudienceRole[] = ['owner', 'occupant', 'payer'];

/** An audience as typed by the office: the whole site or chosen blocks, and the relationships. */
export function readAudience(ctx: HandlerContext, site: OpsSite, raw: unknown): { scope: 'site' | 'blocks'; ids: string[]; roles: AudienceRole[] } {
  const a = (raw ?? {}) as { scope?: unknown; ids?: unknown; roles?: unknown };
  if (a.scope !== 'site' && a.scope !== 'blocks') invalid(ctx, 'audience', 'forms:errors.required');
  const ids = Array.isArray(a.ids) ? a.ids.filter((x): x is string => typeof x === 'string') : [];
  if (a.scope === 'blocks' && (!ids.length || ids.some((x) => !site.buildings.some((b) => b.id === x)))) invalid(ctx, 'audience', 'community:errors.chooseBlock');
  const roles = Array.isArray(a.roles) ? a.roles.filter((x): x is AudienceRole => ROLES.includes(x as AudienceRole)) : [];
  if (!roles.length) invalid(ctx, 'roles', 'community:errors.chooseRole');
  return { scope: a.scope as 'site' | 'blocks', ids: a.scope === 'site' ? [] : [...new Set(ids)], roles: [...new Set(roles)] };
}

function reportView(ctx: HandlerContext, state: CommunityState, r: StoredChatReport): ChatReportView {
  const m = state.chat.messages.find((x) => x.id === r.messageId)!;
  const parts = r.groupId.split(':');
  const kind = (parts[0] === 'custom' ? 'custom' : parts[0]) as ChatReportView['group']['kind'];
  const custom = kind === 'custom' ? state.chat.custom.find((c) => `custom:${c.id}` === r.groupId) : undefined;
  return {
    id: r.id,
    ref: r.ref,
    state: r.state,
    reasons: [...new Set(r.reports.map((x) => x.reason))],
    notes: r.reports.map((x) => x.note).filter((x): x is string => !!x),
    reporters: r.reports.length,
    reportedAt: r.reports[0]?.at ?? '',
    group: { id: r.groupId, kind, ...(custom ? { name: custom.name } : {}) },
    // Past the period, the text is kept only as evidence while the report is open; once decided it is
    // not shown again (the decision, its note and who reported how many times remain).
    message: (() => {
      const past = pastRetention(state, m, now(ctx));
      return { id: m.id, text: past && r.state !== 'open' ? null : m.text, senderName: m.senderName, at: m.at, pastRetention: past, evidenceHold: past && r.state === 'open' };
    })(),
    ...(r.decision ? { decision: { at: r.decision.at, byName: r.decision.byName, note: r.decision.note } } : {}),
    history: r.history,
  };
}

function decideReport(ctx: HandlerContext, action: 'hide' | 'warn' | 'dismiss'): ChatReportView {
  const m = manage(ctx, 'chat.moderate');
  const r = m.state.chat.reports.find((x) => x.id === ctx.params.id);
  if (!r) notFound(ctx);
  if (r.state !== 'open') problem(ctx, 409, 'already_decided', 'community:errors.alreadyDecided');
  const me = ctx.persona!;
  const msg = m.state.chat.messages.find((x) => x.id === r.messageId)!;
  // A moderator does not decide on a report they made, or on their own message.
  if (r.reports.some((x) => x.by === me.principalId || (!!me.partyId && x.by === me.partyId))) problem(ctx, 409, 'separation_of_duties', 'community:errors.ownReport');
  if (msg.principalId === me.principalId || (!!me.partyId && msg.partyId === me.partyId)) problem(ctx, 409, 'separation_of_duties', 'community:errors.ownMessageDecision');
  const raw = (ctx.req.body as { note?: unknown } | undefined)?.note;
  const note = typeof raw === 'string' ? raw.trim() : '';
  if (note.length < 5) invalid(ctx, 'note', 'community:errors.minLength', { min: '5' });
  if (note.length > 500) invalid(ctx, 'note', 'community:errors.maxLength', { max: '500' });
  const at = now(ctx);
  r.state = action === 'hide' ? 'hidden' : action === 'warn' ? 'warned' : 'dismissed';
  r.decision = { at, by: me.principalId, byName: me.displayName, note };
  r.history.push(ev(at, me.displayName, 'staff', r.state, { note }));
  if (action === 'hide') msg.removed = { at, byName: me.displayName, reportId: r.id };
  // The author is told in the app (simulated); never who reported it.
  if ((action === 'hide' || action === 'warn') && msg.partyId) {
    notify(ctx, { site: m.site, ops: opsOf(ctx, m.site) }, { partyIds: [msg.partyId], module: 'community_chat', kind: 'chat', key: action === 'hide' ? 'chatRemoved' : 'chatWarned', values: {}, href: '/customer/portal/chat' });
  }
  ctx.demo.save();
  return reportView(ctx, m.state, r);
}

const MANAGE = requires('community_chat', 'chat.groups.manage', 'operational');
const MODERATE = requires('community_chat', 'chat.moderate', 'operational');

function policyOf(ctx: HandlerContext, state: CommunityState): ChatPolicy {
  return {
    retentionDays: state.chat.retentionDays ?? null,
    directMessages: false,
    etiquette: state.chat.etiquette,
    versions: [...state.chat.versions].reverse(),
    held: evidenceHeld(ctx, state).length,
    actions: { manage: can(ctx, 'chat.groups.manage') },
  };
}

const OFFICE_HANDLERS: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/chat\/rules$/,
    access: MANAGE,
    handle: (ctx): ChatRules => {
      const m = manage(ctx, 'chat.groups.manage');
      return { groups: groupDefs(m.state, m.g).map((d) => ruleOf(m, d)), blocks: m.site.buildings.map((b) => ({ id: b.id, code: b.code })) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/chat\/rules\/(?<id>[\w:-]+)\/preview$/,
    access: MANAGE,
    handle: (ctx): ChatRulePreview => {
      const m = manage(ctx, 'chat.groups.manage');
      const d = groupDefs(m.state, m.g).find((x) => x.id === ctx.params.id);
      if (!d) notFound(ctx);
      return { group: ruleOf(m, d), asOf: ctx.at, members: rosterOf(m.state, m.g, d.id) };
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/ops\/chat\/rules\/(?<id>[\w:-]+)$/,
    access: MANAGE,
    handle: (ctx): ChatRuleView => {
      const m = manage(ctx, 'chat.groups.manage');
      const d = groupDefs(m.state, m.g).find((x) => x.id === ctx.params.id);
      if (!d) notFound(ctx);
      const body = (ctx.req.body ?? {}) as { enabled?: unknown; postingPolicy?: unknown };
      if (body.enabled !== undefined && typeof body.enabled !== 'boolean') invalid(ctx, 'enabled', 'community:errors.invalid');
      if (body.postingPolicy !== undefined && body.postingPolicy !== 'everyone' && body.postingPolicy !== 'office_only') invalid(ctx, 'postingPolicy', 'community:errors.invalid');
      // The office team's own group is always on (it is how staff coordinate).
      if (d.kind === 'staff' && body.enabled === false) problem(ctx, 409, 'staff_group', 'community:errors.staffGroup');
      const next = { enabled: (body.enabled as boolean | undefined) ?? d.enabled, postingPolicy: (body.postingPolicy as GroupDef['postingPolicy'] | undefined) ?? d.postingPolicy };
      m.state.chat.rules[d.id] = next;
      ctx.demo.save();
      return ruleOf(m, { ...d, ...next });
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/chat\/custom$/,
    access: MANAGE,
    handle: (ctx): ChatRuleView => {
      const m = manage(ctx, 'chat.groups.manage');
      const body = (ctx.req.body ?? {}) as { name?: unknown; audience?: unknown; postingPolicy?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 3) invalid(ctx, 'name', 'community:errors.minLength', { min: '3' });
      if (name.length > 60) invalid(ctx, 'name', 'community:errors.maxLength', { max: '60' });
      if (m.state.chat.custom.some((c) => c.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'))) invalid(ctx, 'name', 'community:errors.nameTaken');
      const audience = readAudience(ctx, m.site, body.audience);
      const postingPolicy = body.postingPolicy === 'office_only' ? 'office_only' : 'everyone';
      const { id } = nextCommunity(m.state, m.site, 'custom');
      m.state.chat.custom.push({ id, name, audience, postingPolicy, createdByName: ctx.persona!.displayName, createdAt: now(ctx) });
      m.state.chat.rules[`custom:${id}`] = { enabled: true, postingPolicy };
      ctx.demo.save();
      return ruleOf(m, groupDefs(m.state, m.g).find((d) => d.id === `custom:${id}`)!);
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/chat\/policy$/,
    access: requires('community_chat', ['chat.groups.manage', 'chat.moderate'], 'operational'),
    handle: (ctx): ChatPolicy => policyOf(ctx, communityState(ctx, officeSite(ctx))),
  },
  {
    method: 'PATCH',
    pattern: /^\/ops\/chat\/policy$/,
    access: MANAGE,
    handle: (ctx): ChatPolicy => {
      const m = manage(ctx, 'chat.groups.manage');
      const body = (ctx.req.body ?? {}) as { retentionDays?: unknown; etiquette?: unknown; legalReviewConfirmed?: unknown };
      const days = body.retentionDays;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 30 || days > 3650) invalid(ctx, 'retentionDays', 'community:errors.retentionRange', { min: '30', max: '3650' });
      const etiquette = typeof body.etiquette === 'string' ? body.etiquette.trim() : '';
      if (etiquette.length < 20) invalid(ctx, 'etiquette', 'community:errors.minLength', { min: '20' });
      if (etiquette.length > 600) invalid(ctx, 'etiquette', 'community:errors.maxLength', { max: '600' });
      // No statutory period is presumed: the society confirms it checked what applies to it (D-25 (5)).
      if (body.legalReviewConfirmed !== true) invalid(ctx, 'legalReviewConfirmed', 'community:errors.confirmReview');
      m.state.chat.retentionDays = days as number;
      m.state.chat.etiquette = etiquette;
      m.state.chat.versions.push({ version: m.state.chat.versions.length + 1, retentionDays: days as number, etiquette, changedByName: ctx.persona!.displayName, changedAt: now(ctx) });
      ctx.demo.save();
      return policyOf(ctx, m.state);
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/chat\/reports$/,
    access: MODERATE,
    handle: (ctx): ChatReports => {
      const m = manage(ctx, 'chat.moderate');
      const status = String(ctx.req.query?.status ?? 'open');
      const all = m.state.chat.reports.map((r) => reportView(ctx, m.state, r)).sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt));
      const counts = Object.fromEntries((['open', 'hidden', 'warned', 'dismissed'] as const).map((s) => [s, all.filter((r) => r.state === s).length])) as ChatReports['counts'];
      return { items: status === 'closed' ? all.filter((r) => r.state !== 'open') : all.filter((r) => r.state === 'open'), counts };
    },
  },
  { method: 'POST', pattern: /^\/ops\/chat\/reports\/(?<id>[\w-]+)\/hide$/, access: MODERATE, handle: (ctx) => decideReport(ctx, 'hide') },
  { method: 'POST', pattern: /^\/ops\/chat\/reports\/(?<id>[\w-]+)\/warn$/, access: MODERATE, handle: (ctx) => decideReport(ctx, 'warn') },
  { method: 'POST', pattern: /^\/ops\/chat\/reports\/(?<id>[\w-]+)\/dismiss$/, access: MODERATE, handle: (ctx) => decideReport(ctx, 'dismiss') },
];

/** Unread messages across a resident's groups (Community home); throws like the chat itself would. */
export function residentChatSummary(ctx: HandlerContext): { available: boolean; unread: number } {
  const c = residentChat(ctx);
  const g = groupsOf(ctx, c);
  return { available: g.available, unread: g.groups.filter((x) => !x.muted).reduce((n, x) => n + x.unread, 0) };
}

export const COMMUNITY_CHAT_HANDLERS: readonly Handler[] = [
  ...memberEndpoints('/portal/chat', requires('resident_portal', 'portal.use', 'operational'), residentChat, true),
  ...OFFICE_HANDLERS,
  ...memberEndpoints('/ops/chat', requires('community_chat', 'chat.use', 'operational'), officeChat, false),
];
