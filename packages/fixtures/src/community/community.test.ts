import type { CommitteeTerm, FlatFact, OpsFlat, PollOption } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import type { OpsSite } from '../operations/site';
import { membershipsOf, type ChatMember } from './groups';
import membership from './chat-membership.vectors.json';
import { pollResults } from './polls';
import polls from './polls.vectors.json';
import { seedCommunity, type CommunityState } from './state';

/**
 * Gate D.3 pure rules against the vectors the V3.2 plan names: chat membership (join, leave,
 * visibility from the join, committee, staff, custom audiences) and poll results (D-47 thresholds and
 * differencing across groupings).
 */
const site = { tenantId: 'tnt_test', siteId: 'site_test', legalEntityId: 'le_test', name: 'Test', code: 'TST', areas: [], ...membership.site, flats: membership.site.flats as OpsFlat[] } satisfies OpsSite;

type Case = (typeof membership.cases)[number] & { terms?: Array<{ partyId: string; from: string; to?: string }>; custom?: { id: string; audience: { scope: 'site' | 'blocks'; ids: string[]; roles: Array<'owner' | 'occupant' | 'payer'> }; createdAt: string }; left?: Array<{ groupId: string; at: string; rejoinedAt?: string }>; rules?: Record<string, { enabled: boolean; postingPolicy: 'everyone' | 'office_only' }> };

describe('chat membership vectors (D-25)', () => {
  for (const c of membership.cases as Case[]) {
    it(c.name, () => {
      const state: CommunityState = seedCommunity(site);
      if (c.custom) state.chat.custom.push({ id: c.custom.id, name: 'Group', audience: c.custom.audience, postingPolicy: 'everyone', createdByName: 'Office', createdAt: c.custom.createdAt });
      if (c.rules) state.chat.rules = c.rules;
      const reader = c.reader as { kind: 'resident' | 'office'; partyId?: string; principalId?: string; mayChat?: boolean };
      const who: ChatMember = reader.kind === 'resident' ? { key: `party:${reader.partyId}`, kind: 'resident', name: 'Reader', partyId: reader.partyId!, principalId: '' } : { key: `staff:${reader.principalId}`, kind: 'office', name: 'Staff', principalId: reader.principalId! };
      if (c.left) state.chat.left[who.key] = c.left;
      const facts = c.facts.map((f, i) => ({ id: `f${i}`, flatCode: '', partyName: f.partyId, ...f }) as FlatFact);
      const terms = (c.terms ?? []).map((t, i) => ({ id: `t${i}`, office: 'member', member: { name: t.partyId, partyId: t.partyId }, from: t.from, ...(t.to ? { to: t.to } : {}), appointedBy: 'election', state: 'active' }) as CommitteeTerm);
      const mine = membershipsOf(state, { site, facts, terms, committee: true, licensedFrom: '2026-10-21', on: membership.on }, who, reader.mayChat ?? false);
      for (const [groupId, since] of Object.entries(c.in)) expect(mine.get(groupId)?.since, groupId).toBe(since);
      for (const groupId of c.notIn) expect(mine.has(groupId), groupId).toBe(false);
      expect(mine.size).toBe(Object.keys(c.in).length);
    });
  }
});

describe('poll result vectors (D-47)', () => {
  for (const c of polls.cases as Array<(typeof polls.cases)[number] & { threshold?: { minCount: number; minAudience: number } }>) {
    it(c.name, () => {
      const r = pollResults(c.tally as unknown as Record<string, Record<string, number>>, polls.options as PollOption[], c.audience as unknown as { site: number; blocks: Record<string, number> }, c.threshold);
      const e = c.expect as { shown: boolean; reason?: string; total?: number; options?: Record<string, number>; blocks?: Record<string, number> };
      expect(r.shown).toBe(e.shown);
      if (!r.shown) return expect(r.reason).toBe(e.reason);
      expect(r.total).toBe(e.total);
      expect(Object.fromEntries(r.options.map((o) => [o.id, o.count]))).toEqual(e.options);
      expect(Object.fromEntries(r.blocks.map((b) => [b.code, b.total]))).toEqual(e.blocks);
      // A shown block's option counts add up to its total.
      for (const b of r.blocks) expect(b.options.reduce((n, o) => n + o.count, 0)).toBe(b.total);
    });
  }
});
