import type { BankLine, CollectionMethod, CollectionPayment, Money, PaymentSubmission, ProofFile, Receipt, SubmissionVersion } from '@repo/contracts';
import { fromPaisa } from '../portal';
import { pad } from '../seed';
import { ALNOOR_ENTITY, ALNOOR_SITE } from './alnoor';
import { toPaymentAllocations, type Allocation } from './allocate';
import { fingerprint } from './import';
import { nextRef, type SocietyState } from './state';

/**
 * Collection operations on the society state, shared by the mock server and the seeded scenario so
 * both follow the same rules. Only `recordPayment` creates money: it is called by verification
 * (with a bank match or a stated reason) and by the office counter, never by an upload.
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

export const proofFile = (file: { name: string; type: string; size: number }, look?: ProofFile['look']): ProofFile => ({
  name: file.name,
  type: file.type,
  size: file.size,
  fingerprint: fingerprint(`${file.name}|${file.size}|${file.type}`),
  ...(look ? { look } : {}),
});

export interface NewSubmission {
  at: string;
  account: { id: string; accountNo: string };
  payer: { partyId: string; name: string };
  flats: string[];
  version: Omit<SubmissionVersion, 'n' | 'submittedAt'>;
}

export function createSubmission(state: SocietyState, input: NewSubmission): PaymentSubmission {
  const n = state.submissions.length + 1;
  const version: SubmissionVersion = { n: 1, submittedAt: input.at, ...input.version };
  const submission: PaymentSubmission = {
    id: `psb_${state.numbering.code.toLowerCase()}_${pad(n, 4)}`,
    ref: nextRef(state, 'submission', input.at.slice(0, 10)),
    siteId: ALNOOR_SITE.id,
    legalEntityId: ALNOOR_ENTITY.id,
    billingAccountId: input.account.id,
    accountNo: input.account.accountNo,
    payerPartyId: input.payer.partyId,
    payerName: input.payer.name,
    flats: input.flats,
    method: 'bank_transfer',
    state: 'submitted',
    current: version,
    versions: [version],
    history: [{ at: input.at, by: input.payer.partyId, byName: input.payer.name, byKind: 'resident', action: 'submitted' }],
  };
  state.submissions.push(submission);
  return submission;
}

export interface NewPayment {
  at: string;
  receivedOn: string;
  by: { principalId: string; name: string };
  account: { id: string; accountNo: string };
  payer: { partyId: string; name: string };
  flats: string[];
  method: CollectionMethod;
  amount: bigint;
  allocations: readonly Allocation[];
  unapplied: bigint;
  source: CollectionPayment['source'];
  verification: CollectionPayment['verification'];
  manualReason?: string;
  overrideReason?: string;
  bankLine?: BankLine;
  bankReference?: string;
}

/** Creates the payment and its receipt, and marks the bank line it came from as matched. */
export function recordPayment(state: SocietyState, input: NewPayment): { payment: CollectionPayment; receipt: Receipt } {
  const code = state.numbering.code.toLowerCase();
  const n = state.payments.length + 1;
  const id = `pay_${code}_${pad(n, 4)}`;
  const ref = nextRef(state, 'payment', input.receivedOn);
  const receiptId = `rct_${code}_${pad(n, 4)}`;
  const receiptRef = nextRef(state, 'receipt', input.receivedOn);
  const allocations = toPaymentAllocations(input.allocations);
  const payment: CollectionPayment = {
    id,
    ref,
    siteId: ALNOOR_SITE.id,
    legalEntityId: ALNOOR_ENTITY.id,
    legalEntityName: ALNOOR_ENTITY.name,
    billingAccountId: input.account.id,
    accountNo: input.account.accountNo,
    payerPartyId: input.payer.partyId,
    payerName: input.payer.name,
    method: input.method,
    amount: money(input.amount),
    receivedOn: input.receivedOn,
    source: input.source,
    verification: input.verification,
    ...(input.manualReason ? { manualReason: input.manualReason } : {}),
    ...(input.bankLine ? { bankLineId: input.bankLine.id, bankTxnId: input.bankLine.bankTxnId } : {}),
    verifiedBy: input.by.principalId,
    verifiedByName: input.by.name,
    verifiedAt: input.at,
    allocations,
    unapplied: money(input.unapplied),
    ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
    receiptId,
    receiptRef,
  };
  const receipt: Receipt = {
    id: receiptId,
    ref: receiptRef,
    paymentId: id,
    paymentRef: ref,
    issuedAt: input.at,
    legalEntityName: ALNOOR_ENTITY.name,
    siteName: ALNOOR_SITE.name,
    payerName: input.payer.name,
    accountNo: input.account.accountNo,
    flats: input.flats,
    method: input.method,
    amount: money(input.amount),
    receivedOn: input.receivedOn,
    ...(input.bankReference ? { bankReference: input.bankReference } : {}),
    allocations,
    unapplied: money(input.unapplied),
  };
  if (input.bankLine) {
    const line = state.bank.lines.find((l) => l.id === input.bankLine!.id);
    if (line) Object.assign(line, { state: 'matched', paymentId: id, paymentRef: ref });
  }
  state.payments.push(payment);
  state.receipts.push(receipt);
  return { payment, receipt };
}

/** Applies part of a payment's unapplied credit to open lines (appended; earlier allocations never change). */
export function applyCredit(payment: CollectionPayment, allocations: readonly Allocation[], unappliedAfter: bigint, at: string): void {
  payment.allocations.push(...toPaymentAllocations(allocations, at));
  payment.unapplied = money(unappliedAfter);
}
