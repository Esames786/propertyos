import type { LeadStatus, OpenStage, OpportunityStage } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { byStage, canConvert, stageSummaries, sumAmounts, transition, type StageAction } from './pipeline';
import vectors from './crm-pipeline.vectors.json';

/** Gate E.1 golden vectors: stage transitions, conversion once, won/lost, counts equal lists. */
describe('crm-pipeline vectors', () => {
  for (const v of vectors.transitions) {
    it(`transition: ${v.name}`, () => {
      const result = transition(v.from as { stage: OpportunityStage; lostFrom?: OpenStage }, v.action as StageAction);
      expect(result).toEqual(v.expect);
    });
  }

  for (const v of vectors.conversion) {
    it(`conversion: ${v.name}`, () => {
      expect(canConvert({ status: v.leadStatus as LeadStatus }, v.hasOpportunity)).toEqual(v.expect);
    });
  }

  it('counts and values per stage equal the filtered lists', () => {
    const items = vectors.counts.items as Array<{ stage: OpportunityStage; value: { amount: string } }>;
    const summaries = stageSummaries(items);
    for (const s of summaries) {
      const expected = vectors.counts.expect[s.stage];
      expect({ count: s.count, value: s.value.amount }, s.stage).toEqual(expected);
      expect(byStage(items, s.stage)).toHaveLength(s.count);
      expect(sumAmounts(byStage(items, s.stage).map((i) => i.value.amount))).toBe(s.value.amount);
    }
    expect(byStage(items, 'open')).toHaveLength(vectors.counts.open.count);
    expect(byStage(items, 'all')).toHaveLength(vectors.counts.all.count);
    // The stages partition the list: no opportunity is counted twice or lost.
    expect(summaries.reduce((n, s) => n + s.count, 0)).toBe(items.length);
  });

  it('a sequence: converted once, moved, lost, reopened, never won', () => {
    expect(canConvert({ status: vectors.sequence.start.leadStatus as LeadStatus }, vectors.sequence.start.hasOpportunity)).toEqual({ ok: true });
    let state: { stage: OpportunityStage; lostFrom?: OpenStage } = { stage: 'qualified' };
    let versions = 0;
    for (const step of vectors.sequence.steps) {
      const r = transition(state, step.action as StageAction);
      expect(r).toEqual(step.expect);
      if (r.ok) {
        state = { stage: r.stage, ...(r.lostFrom ? { lostFrom: r.lostFrom } : {}) };
        versions += 1;
      }
    }
    expect(versions + 1).toBe(vectors.sequence.versions);
    expect(canConvert({ status: 'qualified' }, true)).toEqual({ ok: false, code: 'already_converted' });
    expect(state.stage).not.toBe('won');
  });

  it('sums are exact to the paisa', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['99999999999.99', '0.01'])).toBe('100000000000.00');
    expect(sumAmounts([])).toBe('0.00');
  });
});
