/**
 * Gate D.3 — pure policy foundation for fictional community conversations.
 * No network, persistence, notifications or real messaging. The UI/typed mock
 * endpoints MUST enforce the same checks on every read and write.
 */
export interface ChatMembership {
  principalId: string;
  groupId: string;
  /** ISO instant at which the member was admitted; older history is inaccessible. */
  joinedAt: string;
  /** Exclusive; leaving terminates API access and queued delivery. */
  leftAt?: string;
}
export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  createdAt: string;
  deletedAt?: string;
}
export interface RetentionRule {
  /** Tenant-specified days, no implicit legal/default retention choice. */
  days: number;
  /** IDs preserved by authorized legal hold or open moderation report. */
  heldMessageIds: readonly string[];
}
export type ChatRefusal =
  | 'chat_disabled' | 'missing_membership' | 'membership_expired'
  | 'before_join' | 'outside_group' | 'retention_expired' | 'deleted';
export type ChatDecision = { allowed: true } | { allowed: false; reason: ChatRefusal };
const reject = (reason: ChatRefusal): ChatDecision => ({ allowed: false, reason });
const ms = (iso: string) => {
  const result = Date.parse(iso);
  if (!Number.isFinite(result)) throw new RangeError('Invalid ISO timestamp');
  return result;
};
const DAY = 86_400_000;

/** Reads, posts, sync and delivery all require an in-force membership. */
export function memberAt(memberships: readonly ChatMembership[], principalId: string, groupId: string, now: string): ChatDecision {
  const current = ms(now);
  const member = memberships.find(m => m.principalId === principalId && m.groupId === groupId && ms(m.joinedAt) <= current && (!m.leftAt || current < ms(m.leftAt)));
  if (member) return { allowed: true };
  const past = memberships.some(m => m.principalId === principalId && m.groupId === groupId);
  return reject(past ? 'membership_expired' : 'missing_membership');
}

/** Uses the latest active membership segment, never a previous period of residence. */
export function mayReadMessage(args: {
  enabled: boolean;
  memberships: readonly ChatMembership[];
  principalId: string;
  groupId: string;
  message: ChatMessage;
  now: string;
  retention: RetentionRule | undefined;
}): ChatDecision {
  if (!args.enabled || !args.retention || !(args.retention.days > 0) || !Number.isFinite(args.retention.days)) return reject('chat_disabled');
  if (args.message.groupId !== args.groupId) return reject('outside_group');
  const allowed = memberAt(args.memberships, args.principalId, args.groupId, args.now);
  if (!allowed.allowed) return allowed;
  const now = ms(args.now);
  const joined = args.memberships.filter(m => m.principalId === args.principalId && m.groupId === args.groupId && ms(m.joinedAt) <= now && (!m.leftAt || now < ms(m.leftAt))).sort((a,b) => ms(b.joinedAt) - ms(a.joinedAt))[0]!;
  const created = ms(args.message.createdAt);
  if (created < ms(joined.joinedAt)) return reject('before_join');
  if (args.message.deletedAt) return reject('deleted');
  if (created > now) return reject('before_join');
  if (!args.retention.heldMessageIds.includes(args.message.id) && now - created >= args.retention.days * DAY) return reject('retention_expired');
  return { allowed: true };
}

/** A queued message submitted while disconnected is re-authorized at sync time. */
export function mayDeliverQueued(args: {
  enabled: boolean;
  memberships: readonly ChatMembership[];
  senderId: string;
  groupId: string;
  now: string;
  retention: RetentionRule | undefined;
}): ChatDecision {
  if (!args.enabled || !args.retention || !(args.retention.days > 0)) return reject('chat_disabled');
  return memberAt(args.memberships, args.senderId, args.groupId, args.now);
}
