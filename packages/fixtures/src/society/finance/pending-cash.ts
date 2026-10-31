import type { CashAwaitingCount, Money, OfficeCollectionBatch } from '@repo/contracts';
import type { SocietyState } from '../state';
import { money, paisa, sum } from './model';

/**
 * Office cash recorded but not yet counted by a second person (owner decision D-46, D.1/S.1
 * integration): a batch submitted for confirmation, or returned to its collector. Nothing of it is a
 * payment yet: no allocation, no receipt, no Paid status.
 */
const waiting = (b: OfficeCollectionBatch) => b.status === 'submitted' || b.status === 'returned';

export function cashAwaitingCount(state: SocietyState, filter: { accountId?: string; partyId?: string } = {}): CashAwaitingCount[] {
  return state.finance.batches.filter(waiting).flatMap((b) =>
    b.lines
      .filter((l) => l.method === 'office_cash' && !l.outcome && (!filter.accountId || l.billingAccountId === filter.accountId) && (!filter.partyId || l.payerPartyId === filter.partyId))
      .map((l) => ({ batchId: b.id, batchRef: b.ref, amount: l.amount, payerName: l.payerName, recordedOn: b.collectedOn, recordedByName: b.collectedByName })),
  );
}

/** The cash of one batch (its office cash lines). */
export const cashOfBatch = (b: Pick<OfficeCollectionBatch, 'lines'>): Money => money(sum(b.lines.filter((l) => l.method === 'office_cash').map((l) => paisa(l.amount))));

/** Office collections a second person can count and confirm now (cash, cheques, or a single payment). */
export const batchesToCount = (state: SocietyState) => state.finance.batches.filter((b) => b.status === 'submitted');
