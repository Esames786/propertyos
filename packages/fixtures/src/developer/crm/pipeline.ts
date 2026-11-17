import { LOST_REASONS, OPEN_STAGES, OPPORTUNITY_STAGES, type LeadStatus, type LostReason, type OpenStage, type OpportunityStage, type StageSummary } from '@repo/contracts';

/**
 * Gate E.1: the opportunity stage rules, pure and deterministic (golden vectors in
 * `crm-pipeline.vectors.json`). A stage records where the sales conversation is; it never creates a
 * quotation, hold, reservation or booking. `won` needs a booking, which Gate E.5 brings: until then a
 * move to `won` is refused (`booking_required`) and no opportunity is ever won in this wave.
 */

export const isOpen = (stage: OpportunityStage): stage is OpenStage => (OPEN_STAGES as readonly string[]).includes(stage);

export type StageAction =
  | { kind: 'move'; to: string }
  | { kind: 'lose'; reason: string; note?: string }
  | { kind: 'reopen'; note?: string };

export type StageRefusal = 'invalid_stage' | 'booking_required' | 'use_lost' | 'not_open' | 'same_stage' | 'invalid_reason' | 'note_required' | 'not_lost';

export type StageResult = { ok: true; stage: OpportunityStage; lostFrom?: OpenStage } | { ok: false; code: StageRefusal };

/** The next stage of an opportunity after an action, or why the action is refused. */
export function transition(current: { stage: OpportunityStage; lostFrom?: OpenStage }, action: StageAction): StageResult {
  if (action.kind === 'move') {
    if (!(OPPORTUNITY_STAGES as readonly string[]).includes(action.to)) return { ok: false, code: 'invalid_stage' };
    const to = action.to as OpportunityStage;
    if (to === 'won') return { ok: false, code: 'booking_required' };
    if (to === 'lost') return { ok: false, code: 'use_lost' };
    if (!isOpen(current.stage)) return { ok: false, code: 'not_open' };
    if (to === current.stage) return { ok: false, code: 'same_stage' };
    return { ok: true, stage: to };
  }
  if (action.kind === 'lose') {
    if (!isOpen(current.stage)) return { ok: false, code: 'not_open' };
    if (!(LOST_REASONS as readonly string[]).includes(action.reason)) return { ok: false, code: 'invalid_reason' };
    if ((action.reason as LostReason) === 'other' && !action.note?.trim()) return { ok: false, code: 'note_required' };
    return { ok: true, stage: 'lost', lostFrom: current.stage };
  }
  if (current.stage !== 'lost') return { ok: false, code: 'not_lost' };
  if (!action.note?.trim()) return { ok: false, code: 'note_required' };
  return { ok: true, stage: current.lostFrom ?? 'qualified' };
}

export type ConvertRefusal = 'not_qualified' | 'already_converted';

/** A lead converts once, and only while it is qualified. */
export function canConvert(lead: { status: LeadStatus }, hasOpportunity: boolean): { ok: true } | { ok: false; code: ConvertRefusal } {
  if (hasOpportunity) return { ok: false, code: 'already_converted' };
  if (lead.status !== 'qualified') return { ok: false, code: 'not_qualified' };
  return { ok: true };
}

/** Exact sum of PKR amounts ("12500000.00"), in paisa, back to a two-decimal string. */
export function sumAmounts(amounts: readonly string[]): string {
  const paisa = amounts.reduce((acc, a) => {
    const [whole, frac = ''] = a.split('.');
    return acc + BigInt(whole!) * 100n + BigInt((frac + '00').slice(0, 2));
  }, 0n);
  return `${paisa / 100n}.${String(paisa % 100n).padStart(2, '0')}`;
}

/** Items of one stage filter: every stage, the open ones, or exactly one stage. */
export function byStage<T extends { stage: OpportunityStage }>(items: readonly T[], stage: OpportunityStage | 'all' | 'open'): T[] {
  if (stage === 'all') return [...items];
  if (stage === 'open') return items.filter((i) => isOpen(i.stage));
  return items.filter((i) => i.stage === stage);
}

/** Count and expected value per stage. Each count is the length of `byStage(items, stage)`. */
export function stageSummaries(items: ReadonlyArray<{ stage: OpportunityStage; value: { amount: string } }>): StageSummary[] {
  return OPPORTUNITY_STAGES.map((stage) => {
    const inStage = byStage(items, stage);
    return { stage, count: inStage.length, value: { amount: sumAmounts(inStage.map((i) => i.value.amount)), currency: 'PKR' } };
  });
}
