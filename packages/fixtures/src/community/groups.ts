import type { ChatAudience, ChatGroupKind, ChatMemberReason, ChatPostingPolicy, CommitteeTerm, FlatFact } from '@repo/contracts';
import { members as audienceMembers } from '../operations/audience';
import type { OpsSite } from '../operations/site';
import { principalsOfParty, staffOf } from '../society/finance/approvals';
import { factOn } from '../society/model';
import type { CommunityState, StoredCustomGroup } from './state';

/**
 * Who is in which chat group (D-25), from facts only: verified register facts in force (current
 * occupants of the site, a block or a floor), committee terms in force, staff roles that may chat,
 * and for custom groups the audience the office chose (part of the site and relationship to the
 * flat). Nobody is added by hand, so a move-out, an ended term or a changed role ends the membership
 * at once. A member sees a group only from the moment they joined it (`since`). Pure.
 */
export interface GroupDef {
  id: string;
  kind: ChatGroupKind;
  code?: string;
  name?: string;
  enabled: boolean;
  postingPolicy: ChatPostingPolicy;
  custom?: StoredCustomGroup;
}

/** A reader: a resident (by party) in the resident app, or a staff sign-in in the office app. */
export interface ChatMember {
  /** Stable key for reads, mutes, blocks and leaving: `party:<id>` or `staff:<principal>`. */
  key: string;
  kind: 'resident' | 'office';
  name: string;
  partyId?: string;
  principalId: string;
}

export interface Membership {
  groupId: string;
  /** The reader sees nothing written before this instant. */
  since: string;
  reasons: Array<{ reason: ChatMemberReason; flat?: string; since?: string }>;
}

export interface GroupFacts {
  site: OpsSite;
  facts: readonly FlatFact[];
  terms: readonly CommitteeTerm[];
  /** The committee group exists only with the committee feature (S.1). */
  committee: boolean;
  /** When the chat add-on started for the site (staff membership starts then). */
  licensedFrom: string;
  on: string;
}

const startOf = (date: string) => `${date}T00:00:00+05:00`;
const later = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b);
const termOn = (t: Pick<CommitteeTerm, 'from' | 'to'>, on: string) => t.from <= on && (t.to === undefined || on < t.to);

export function groupDefs(state: CommunityState, g: Pick<GroupFacts, 'site' | 'committee'>): GroupDef[] {
  const rule = (id: string) => state.chat.rules[id] ?? { enabled: true, postingPolicy: 'everyone' as const };
  const defs: GroupDef[] = [{ id: 'site', kind: 'site', ...rule('site') }];
  for (const b of g.site.buildings) {
    defs.push({ id: `block:${b.id}`, kind: 'block', code: b.code, ...rule(`block:${b.id}`) });
    for (const f of g.site.floors.filter((x) => x.buildingId === b.id).sort((x, y) => x.level - y.level)) defs.push({ id: `floor:${b.id}:${f.level}`, kind: 'floor', code: `${b.code}-${f.level}`, ...rule(`floor:${b.id}:${f.level}`) });
  }
  if (g.committee) defs.push({ id: 'committee', kind: 'committee', ...rule('committee') });
  defs.push({ id: 'staff', kind: 'staff', ...rule('staff') });
  for (const c of state.chat.custom) defs.push({ id: `custom:${c.id}`, kind: 'custom', name: c.name, custom: c, ...rule(`custom:${c.id}`) });
  return defs;
}

const occupancy = (g: GroupFacts) => g.facts.filter((f) => f.role === 'occupant' && f.occupancyKind !== 'association' && factOn(f, g.on));

/** Every group's memberships of one reader (enabled groups only; disabled ones vanish for everyone). */
export function membershipsOf(state: CommunityState, g: GroupFacts, who: ChatMember, staffMayChat: boolean): Map<string, Membership> {
  const out = new Map<string, Membership>();
  const add = (groupId: string, since: string, reason: Membership['reasons'][number]) => {
    const m = out.get(groupId);
    if (!m) out.set(groupId, { groupId, since, reasons: [reason] });
    else {
      // Several facts (two flats on the floor): the earliest start that is still in force.
      if (Date.parse(since) < Date.parse(m.since)) m.since = since;
      m.reasons.push(reason);
    }
  };
  const defs = groupDefs(state, g);
  const enabled = new Set(defs.filter((d) => d.enabled).map((d) => d.id));
  if (who.kind === 'resident' && who.partyId) {
    for (const f of occupancy(g).filter((x) => x.partyId === who.partyId)) {
      const flat = g.site.flats.find((x) => x.id === f.flatId);
      if (!flat) continue;
      const reason = { reason: 'occupant' as const, flat: flat.code, since: f.from };
      add('site', startOf(f.from), reason);
      add(`block:${flat.buildingId}`, startOf(f.from), reason);
      add(`floor:${flat.buildingId}:${flat.floor}`, startOf(f.from), reason);
    }
    for (const d of defs.filter((x) => x.custom)) {
      const c = d.custom!;
      const member = audienceMembers(g.site, g.facts, c.audience, g.on).find((m) => m.partyId === who.partyId);
      if (!member) continue;
      const since = g.facts.filter((f) => f.partyId === who.partyId && member.flatIds.includes(f.flatId) && c.audience.roles.includes(f.role as never) && factOn(f, g.on)).map((f) => startOf(f.from)).sort()[0] ?? c.createdAt;
      for (const role of member.roles) add(d.id, later(since, c.createdAt), { reason: role, flat: member.flatCodes[0] });
    }
  }
  if (g.committee) {
    for (const t of g.terms.filter((x) => termOn(x, g.on))) {
      const mine = who.kind === 'resident' ? t.member.partyId === who.partyId : t.member.principalId === who.principalId;
      if (mine) add('committee', startOf(t.from), { reason: 'committee', since: t.from });
    }
  }
  if (who.kind === 'office' && staffMayChat) {
    const since = startOf(g.licensedFrom);
    add('site', since, { reason: 'staff' });
    add('staff', since, { reason: 'staff' });
    // The office runs custom groups (it may post in an office-only one).
    for (const d of defs.filter((x) => x.custom)) add(d.id, later(since, d.custom!.createdAt), { reason: 'staff' });
  }
  // Custom groups the reader left (until they join again, from then on).
  for (const l of state.chat.left[who.key] ?? []) {
    const m = out.get(l.groupId);
    if (!m) continue;
    if (!l.rejoinedAt) out.delete(l.groupId);
    else m.since = later(m.since, l.rejoinedAt);
  }
  for (const id of [...out.keys()]) if (!enabled.has(id)) out.delete(id);
  return out;
}

/** Everyone in a group today and why (the office's live preview of a rule). */
export function rosterOf(state: CommunityState, g: GroupFacts, groupId: string): Array<{ name: string; reasons: Membership['reasons'] }> {
  const residents = new Map<string, string>();
  for (const f of g.facts) if (factOn(f, g.on) && f.occupancyKind !== 'association') residents.set(f.partyId, f.partyName);
  for (const t of g.terms) if (t.member.partyId && !residents.has(t.member.partyId)) residents.set(t.member.partyId, t.member.name);
  const out: Array<{ name: string; reasons: Membership['reasons'] }> = [];
  const def = groupDefs(state, g).find((d) => d.id === groupId);
  if (!def) return out;
  // The rule as written (a disabled group still previews who it would hold).
  const probe: CommunityState = { ...state, chat: { ...state.chat, rules: { ...state.chat.rules, [groupId]: { ...def, enabled: true } }, left: {} } };
  // One person once: a resident who also has a staff sign-in (the committee secretary) is one entry.
  const byPrincipal = new Map<string, { name: string; reasons: Membership['reasons'] }>();
  for (const [partyId, name] of residents) {
    const m = membershipsOf(probe, g, { key: `party:${partyId}`, kind: 'resident', name, partyId, principalId: '' }, false).get(groupId);
    if (!m) continue;
    const entry = { name, reasons: m.reasons };
    out.push(entry);
    for (const p of principalsOfParty(partyId)) byPrincipal.set(p, entry);
  }
  for (const s of staffOf(g.site.tenantId)) {
    const m = membershipsOf(probe, g, { key: `staff:${s.principalId}`, kind: 'office', name: s.name, principalId: s.principalId }, s.permissions.includes('chat.use')).get(groupId);
    if (!m) continue;
    const same = byPrincipal.get(s.principalId);
    if (same) {
      for (const r of m.reasons) if (!same.reasons.some((x) => x.reason === r.reason)) same.reasons.push(r);
    } else out.push({ name: s.name, reasons: m.reasons });
  }
  return out.sort((a, b) => (a.reasons[0]?.flat ?? '~').localeCompare(b.reasons[0]?.flat ?? '~') || a.name.localeCompare(b.name));
}

/** A custom group's audience in words ("A, B" and roles) is built by the screens from these codes. */
export function audienceCodes(site: OpsSite, audience: ChatAudience): string {
  return audience.scope === 'site' ? '' : site.buildings.filter((b) => audience.ids.includes(b.id)).map((b) => b.code).join(', ');
}
