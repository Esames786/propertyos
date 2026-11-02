import type { CommitteeTerm, FlatFact, OpsFlat, PollOption, PollResults } from '@repo/contracts';
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

type Tally = Record<string, Record<string, number>>;
type Audience = { site: number; blocks: Record<string, number> };
type Threshold = { minCount: number; minAudience: number };
type PollCase = {
  name: string;
  tally?: unknown;
  audience?: unknown;
  generate?: Array<{ code?: string; count?: number; prefix?: string; tally: Record<string, number>; households: number }>;
  options?: PollOption[];
  threshold?: Threshold;
  expect: { shown: boolean; reason?: string; total?: number; options?: Record<string, number> | null; blocks?: Record<string, number>; blocksShown?: number; hidden?: string[]; maxMs?: number };
};
const D47: Threshold = { minCount: 3, minAudience: 5 };
const total = (c: readonly number[]) => c.reduce((n, x) => n + x, 0);

/** The compact form: `count` blocks named prefix001, prefix002, … or one named block; the audience is their households. */
function expand(c: PollCase): { tally: Tally; audience: Audience } {
  if (!c.generate) return { tally: c.tally as Tally, audience: c.audience as Audience };
  const tally: Tally = {};
  const blocks: Record<string, number> = {};
  for (const g of c.generate) {
    const codes = g.code ? [g.code] : Array.from({ length: g.count! }, (_, i) => `${g.prefix}${String(i + 1).padStart(3, '0')}`);
    for (const code of codes) {
      if (Object.keys(g.tally).length) tally[code] = { ...g.tally };
      blocks[code] = g.households;
    }
  }
  return { tally, audience: { site: total(Object.values(blocks)), blocks } };
}

/**
 * The reader's side, written apart from `polls.ts`: a group may be disclosed only if none of its
 * figures could point at one or two people (or show that a group stayed silent). Either empty (no
 * households, no answers), or at least `minCount` answers among at least `minAudience` households with
 * every option count, and the answers outside it, 0 or at least `minCount`.
 */
function safeGroup(counts: readonly number[], households: number, t: Threshold): boolean {
  const all = total(counts);
  const small = (n: number) => n > 0 && n < t.minCount;
  if (all === 0) return households === 0;
  return !small(all) && households >= t.minAudience && !counts.some((n) => small(n) || small(all - n));
}

/** Every set of shown blocks, recursively (tests only, for small results). */
function* subsets<T>(items: readonly T[], from = 0, chosen: T[] = []): Generator<T[]> {
  if (from === items.length) {
    yield chosen;
    return;
  }
  yield* subsets(items, from + 1, chosen);
  yield* subsets(items, from + 1, [...chosen, items[from]!]);
}

/**
 * Attacks a result as a reader would, knowing every block's households. The shown figures must be the
 * true ones. Then every group the reader can compute must be safe: each shown block and the audience
 * minus it, the remainder (the audience minus every shown block) and, with `enumerate`, every sum of
 * shown blocks and the audience minus that sum. Returns the first leak found, or null.
 */
function attack(r: PollResults, tally: Tally, audience: Audience, options: readonly PollOption[], t: Threshold, enumerate: boolean): string | null {
  if (!r.shown) return null;
  const truth = (code: string) => options.map((o) => tally[code]?.[o.id] ?? 0);
  const codes = [...new Set([...Object.keys(tally), ...Object.keys(audience.blocks)])];
  const site = options.map((_, i) => total(codes.map((code) => truth(code)[i]!)));
  if (r.total !== total(site)) return `total ${r.total} is not ${total(site)}`;
  if (!safeGroup([r.total], audience.site, t)) return `turnout ${r.total} of ${audience.site}`;
  if (r.options === null) return r.blocks.length ? 'blocks shown with a withheld breakdown' : null;
  if (r.options.map((o) => o.count).join() !== site.join()) return 'site counts are not the true ones';
  const shown = r.blocks.map((b) => ({ code: b.code, counts: b.options.map((o) => o.count), households: audience.blocks[b.code] ?? 0 }));
  for (const b of shown) if (b.counts.join() !== truth(b.code).join()) return `block ${b.code} counts are not the true ones`;
  const groups = enumerate ? subsets(shown) : [...shown.map((b) => [b]), shown];
  for (const set of groups) {
    const counts = options.map((_, i) => total(set.map((b) => b.counts[i]!)));
    const households = total(set.map((b) => b.households));
    const name = set.map((b) => b.code).join('+') || '(none)';
    if (!safeGroup(counts, households, t)) return `${name}: ${counts.join('–')} among ${households}`;
    const rest = site.map((n, i) => n - counts[i]!);
    if (!safeGroup(rest, audience.site - households, t)) return `audience − ${name}: ${rest.join('–')} among ${audience.site - households}`;
  }
  return null;
}

/** Blocks that are safe on their own but were not shown (returned to the remainder). */
function returned(r: PollResults, tally: Tally, audience: Audience, options: readonly PollOption[], t: Threshold): number {
  if (!r.shown || r.options === null) return 0;
  const codes = [...new Set([...Object.keys(tally), ...Object.keys(audience.blocks)])];
  if (codes.length < 2) return 0;
  const safe = codes.filter((code) => {
    const counts = options.map((o) => tally[code]?.[o.id] ?? 0);
    return total(counts) > 0 && safeGroup(counts, audience.blocks[code] ?? 0, t);
  });
  return safe.length - r.blocks.length;
}

/** A seeded generator (Park–Miller), so a failing case can be replayed. */
function random(seed: number) {
  return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}
const between = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

describe('poll result vectors (D-47, Issues #9 and #10)', () => {
  for (const c of polls.cases as PollCase[]) {
    it(c.name, () => {
      const options = c.options ?? (polls.options as PollOption[]);
      const { tally, audience } = expand(c);
      const started = performance.now();
      const r = pollResults(tally, options, audience, c.threshold);
      const ms = performance.now() - started;
      const e = c.expect;
      if (e.maxMs !== undefined) expect(ms).toBeLessThan(e.maxMs);
      expect(r.shown).toBe(e.shown);
      if (!r.shown) return expect(r.reason).toBe(e.reason);
      expect(r.total).toBe(e.total);
      const t = c.threshold ?? D47;
      expect(attack(r, tally, audience, options, t, r.blocks.length <= 14)).toBeNull();
      expect(returned(r, tally, audience, options, t)).toBeLessThanOrEqual(2 * options.length + 2);
      if (e.options === null) {
        // Withheld: no option count, no block, nothing to subtract from the total.
        expect(r.options).toBeNull();
        expect(r.blocks).toEqual([]);
        return;
      }
      expect(Object.fromEntries((r.options ?? []).map((o) => [o.id, o.count]))).toEqual(e.options);
      if (e.blocks) expect(Object.fromEntries(r.blocks.map((b) => [b.code, b.total]))).toEqual(e.blocks);
      if (e.blocksShown !== undefined) expect(r.blocks.length).toBe(e.blocksShown);
      for (const code of e.hidden ?? []) expect(r.blocks.map((b) => b.code)).not.toContain(code);
      // Everything shown is safe: every option count, and every complement, is 0 or at least the threshold.
      const min = c.threshold?.minCount ?? 3;
      const safe = (counts: number[]) => counts.every((n) => n === 0 || n >= min) && counts.every((n) => r.total - n === 0 || r.total - n >= min || counts.length === 0);
      expect(safe((r.options ?? []).map((o) => o.count))).toBe(true);
      for (const b of r.blocks) {
        const counts = b.options.map((o) => o.count);
        expect(counts.reduce((n, x) => n + x, 0)).toBe(b.total);
        expect(counts.every((n) => n === 0 || n >= min)).toBe(true);
        // site − block is safe too.
        const rest = (r.options ?? []).map((o, i) => o.count - counts[i]!);
        expect(rest.every((n) => n === 0 || n >= min)).toBe(true);
      }
    });
  }
});

describe('poll results under attack (Issue #10)', () => {
  it('the Issue #10 counterexample no longer works: the audience minus the 31 shown blocks is X with one more block (5–4), never X (2–1)', () => {
    const c = (polls.cases as PollCase[]).find((x) => x.name.startsWith('Issue #10 counterexample'))!;
    const { tally, audience } = expand(c);
    const r = pollResults(tally, polls.options as PollOption[], audience);
    if (!r.shown || !r.options) throw new Error('expected a breakdown');
    const left = r.options.map((o, i) => o.count - total(r.blocks.map((b) => b.options[i]!.count)));
    expect(left).toEqual([5, 4]);
    expect(left).not.toEqual([2, 1]);
    // Any other combination is a sum of whole shown blocks, each 3–3, or the audience minus such a sum.
    expect(attack(r, tally, audience, polls.options as PollOption[], D47, false)).toBeNull();
  });

  it('safe groups stay safe when added together (the lemma the algorithm rests on): 20,000 random pairs', () => {
    const rnd = random(20261103);
    let pairs = 0;
    while (pairs < 20_000) {
      const t = [D47, { minCount: 4, minAudience: 5 }, { minCount: 5, minAudience: 8 }][between(rnd, 0, 2)]!;
      const k = between(rnd, 2, 5);
      const group = () => ({ counts: Array.from({ length: k }, () => (rnd() < 0.4 ? 0 : between(rnd, 1, 12))), households: between(rnd, 0, 30) });
      const a = group();
      const b = group();
      if (!safeGroup(a.counts, a.households, t) || !safeGroup(b.counts, b.households, t)) continue;
      pairs++;
      expect(safeGroup(a.counts.map((n, i) => n + b.counts[i]!), a.households + b.households, t), JSON.stringify({ a, b, t })).toBe(true);
    }
  });

  it('5,000 random small polls: every sum of shown blocks, and the audience minus it, is safe; results are deterministic', () => {
    const rnd = random(10);
    const seen = { blocks: 0, hidden: 0, returned: 0, withheld: 0, notShown: 0 };
    for (let i = 0; i < 5_000; i++) {
      const k = between(rnd, 2, 4);
      const options = Array.from({ length: k }, (_, j) => ({ id: `opt_${j + 1}`, label: `Option ${j + 1}` }));
      const t = [D47, { minCount: 4, minAudience: 5 }, { minCount: 5, minAudience: 8 }][between(rnd, 0, 2)]!;
      const tally: Tally = {};
      const blocks: Record<string, number> = {};
      const n = between(rnd, 1, 9);
      for (let b = 0; b < n; b++) {
        const code = String.fromCharCode(65 + b);
        // Mostly small counts, where differences matter; some blocks with no answers, or (a resident
        // who answered, then moved out) with answers but no eligible household left.
        const counts = options.map(() => (rnd() < 0.35 ? 0 : between(rnd, 1, rnd() < 0.7 ? 4 : 9)));
        if (total(counts) > 0) tally[code] = Object.fromEntries(options.flatMap((o, j) => (counts[j] ? [[o.id, counts[j]!]] : [])));
        if (rnd() > 0.05) blocks[code] = between(rnd, rnd() < 0.2 ? 1 : 5, 30);
      }
      // Sometimes households that do not add up (more in the audience than in its blocks): refused.
      const extra = rnd() < 0.1 ? between(rnd, 1, 6) : 0;
      const audience = { site: total(Object.values(blocks)) + extra, blocks };
      const r = pollResults(tally, options, audience, t);
      const replay = JSON.stringify({ i, tally, audience, t });
      if (extra) expect(r, replay).toEqual({ shown: false, reason: 'unavailable' });
      expect(attack(r, tally, audience, options, t, true), replay).toBeNull();
      expect(returned(r, tally, audience, options, t), replay).toBeLessThanOrEqual(2 * k + 2);
      // The same answers listed in another order give the same result.
      const reversed = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).reverse());
      expect(pollResults(reversed(tally) as Tally, options, { site: audience.site, blocks: reversed(blocks) as Record<string, number> }, t), replay).toEqual(r);
      if (!r.shown) seen.notShown++;
      else if (!r.options) seen.withheld++;
      else {
        seen.blocks += r.blocks.length ? 1 : 0;
        seen.hidden += r.blocks.length && r.blocks.length < new Set([...Object.keys(tally), ...Object.keys(blocks)]).size ? 1 : 0;
        seen.returned += returned(r, tally, audience, options, t) ? 1 : 0;
      }
    }
    // The random polls reach every outcome, including blocks shown beside hidden ones and safe blocks returned.
    for (const [outcome, count] of Object.entries(seen)) expect(count, outcome).toBeGreaterThan(50);
  });

  it('a society where every block is safe on its own and every household is in a block shows every block', () => {
    const rnd = random(77);
    for (let i = 0; i < 500; i++) {
      const n = between(rnd, 2, 40);
      const tally: Tally = {};
      const blocks: Record<string, number> = {};
      for (let b = 0; b < n; b++) {
        const code = `B${String(b + 1).padStart(3, '0')}`;
        tally[code] = { opt_1: rnd() < 0.3 ? 0 : between(rnd, 3, 20), opt_2: between(rnd, 3, 20) };
        blocks[code] = between(rnd, 5, 60);
      }
      const r = pollResults(tally, polls.options as PollOption[], { site: total(Object.values(blocks)), blocks });
      expect(r.shown && r.blocks.length).toBe(n);
    }
  });
});

describe('poll results for large societies (Issue #10: no block limit)', () => {
  const two = polls.options as PollOption[];
  const many = (k: number) => Array.from({ length: k }, (_, j) => ({ id: `opt_${j + 1}`, label: `Option ${j + 1}` }));
  const society = (n: number, options: readonly PollOption[], seed: number) => {
    const rnd = random(seed);
    const tally: Tally = {};
    const blocks: Record<string, number> = {};
    for (let b = 0; b < n; b++) {
      const code = `B${String(b + 1).padStart(5, '0')}`;
      tally[code] = Object.fromEntries(options.map((o) => [o.id, rnd() < 0.25 ? between(rnd, 0, 2) : between(rnd, 0, 15)]));
      blocks[code] = between(rnd, 2, 80);
    }
    return { tally, audience: { site: total(Object.values(blocks)), blocks } };
  };
  const timed = (run: () => PollResults) => {
    const started = performance.now();
    const r = run();
    return { r, ms: performance.now() - started };
  };

  for (const [n, k, maxMs] of [[100, 2, 100], [1_000, 2, 250], [1_000, 6, 250], [10_000, 2, 1_000], [10_000, 6, 2_000]] as const) {
    it(`${n.toLocaleString('en')} blocks, ${k} options: every shown block and the remainder are safe, at most ${2 * k + 2} blocks returned, under ${maxMs} ms`, () => {
      const options = k === 2 ? two : many(k);
      const { tally, audience } = society(n, options, n + k);
      const { r, ms } = timed(() => pollResults(tally, options, audience));
      expect(r.shown && r.options).toBeTruthy();
      expect(attack(r, tally, audience, options, D47, false)).toBeNull();
      expect(returned(r, tally, audience, options, D47)).toBeLessThanOrEqual(2 * k + 2);
      expect(ms).toBeLessThan(maxMs);
    });
  }

  it('10,000 blocks built to force returns (U at 1 in each of 8 options, the rest 3 in one option each): one block returned per option, under 2,000 ms', () => {
    const options = many(8);
    const tally: Tally = { U: Object.fromEntries(options.map((o) => [o.id, 1])) };
    const blocks: Record<string, number> = { U: 20 };
    // Codes put every block for opt_1 first, so returning the smallest block each time would empty the result.
    for (let b = 0; b < 10_000; b++) {
      const code = `P${String(b + 1).padStart(5, '0')}`;
      tally[code] = { [options[Math.min(7, Math.floor(b / 1250))]!.id]: 3 };
      blocks[code] = 20;
    }
    const audience = { site: total(Object.values(blocks)), blocks };
    const { r, ms } = timed(() => pollResults(tally, options, audience));
    expect(attack(r, tally, audience, options, D47, false)).toBeNull();
    expect(r.shown && r.blocks.length).toBe(10_000 - 8);
    expect(r.shown && r.blocks.map((b) => b.code)).not.toContain('U');
    expect(ms).toBeLessThan(2_000);
  });
});
