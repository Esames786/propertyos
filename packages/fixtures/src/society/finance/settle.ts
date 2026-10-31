import type { BankLine, ChequeInstrument, FundsTransfer, LegCandidate, MatchReason, TransferLeg } from '@repo/contracts';
import { candidatesFor, type Claim } from '../matching';
import type { SocietyState } from '../state';
import { FIN_ROUTES } from './routes';

/**
 * Settlement on evidence (D-48, I-38), with C.2's matching. A bank leg, a cheque's clearance and a
 * cheque returned after clearing are each proved by a line of a statement imported for the verified
 * account the leg names: compared on amount, date, reference and name; only a full match settles
 * directly; a partial match only through an exception a second person approves; a line settles one
 * subject once. A cash leg is proved by a deposit slip recorded by one person and witnessed by another.
 */

/** Who the bank shows on the other side of a leg (the words on the statement line). */
export function expectedName(t: FundsTransfer, leg: TransferLeg): string {
  const other = t.legs.find((l) => l.leg !== leg.leg)!;
  if (t.kind === 'deposit' && leg.leg === 'in') return 'CASH DEPOSIT';
  if (t.kind === 'withdrawal' && leg.leg === 'out') return 'CASH WITHDRAWAL';
  return other.accountTitle ?? other.accountName;
}

/** The date the bank should show: the slip's date for a deposit, the approval date otherwise. */
export function legClaim(state: SocietyState, t: FundsTransfer, leg: TransferLeg): Claim {
  const cashSide = t.legs.find((l) => l.evidence === 'witnessed_slip');
  const approvedOn = state.finance.approvals.find((a) => a.id === t.approvalId)?.decidedAt?.slice(0, 10) ?? t.preparedAt.slice(0, 10);
  return { amount: t.amount.amount, transferDate: cashSide?.slip?.on ?? approvedOn, bankReference: t.bankReference, payerName: expectedName(t, leg) };
}

const takenOf = (state: SocietyState, line: BankLine, subjectId: string): LegCandidate['taken'] =>
  line.paymentId
    ? { kind: 'payment', ref: line.paymentRef ?? '' }
    : line.settlementId
      ? { kind: 'settlement', ref: line.settlementRef ?? '' }
      : line.heldFor
        ? { kind: 'held', ref: line.heldFor.submissionRef }
        : line.heldBy && line.heldBy.id !== subjectId
          ? { kind: 'held', ref: line.heldBy.ref }
          : undefined;

function scored(state: SocietyState, claim: Claim, lines: readonly BankLine[], direction: 'credit' | 'debit', subjectId: string): LegCandidate[] {
  return candidatesFor(claim, lines, undefined, direction).map((c) => {
    const taken = takenOf(state, c.bankLine, subjectId);
    return { bankLine: c.bankLine, reasons: c.reasons, missing: c.missing, strength: c.strength, ...(taken ? { taken } : {}) };
  });
}

/** Statement lines of the leg's own account that could prove it (money out for the out leg, in for the in leg). */
export function legCandidates(state: SocietyState, t: FundsTransfer, leg: TransferLeg): LegCandidate[] {
  if (leg.evidence !== 'statement_line') return [];
  const lines = state.bank.lines.filter((l) => l.beneficiaryId === leg.accountId);
  return scored(state, legClaim(state, t, leg), lines, leg.leg === 'out' ? 'debit' : 'credit', t.id);
}

export const chequeClaim = (c: ChequeInstrument, on?: string): Claim => ({ amount: c.amount.amount, transferDate: on ?? c.deposit?.on ?? c.receivedOn, bankReference: c.chequeNumber, payerName: c.payerName });

/** Credit lines of the deposit account that could clear the cheque. */
export function chequeCandidates(state: SocietyState, c: ChequeInstrument): LegCandidate[] {
  if (!c.deposit) return [];
  return scored(state, chequeClaim(c), state.bank.lines.filter((l) => l.beneficiaryId === c.deposit!.accountId), 'credit', c.id);
}

/** Debit lines of the deposit account that could show the bank taking a cleared cheque back. */
export function chequeReversalCandidates(state: SocietyState, c: ChequeInstrument): LegCandidate[] {
  if (!c.deposit) return [];
  const clearedOn = state.bank.lines.find((l) => l.paymentId === c.paymentId)?.valueDate ?? c.receivedOn;
  return scored(state, chequeClaim(c, clearedOn), state.bank.lines.filter((l) => l.beneficiaryId === c.deposit!.accountId), 'debit', c.id).filter((x) => x.bankLine.valueDate >= clearedOn);
}

/** Whether a chosen line may be used now, and what it does not match. */
export function lineCheck(candidates: readonly LegCandidate[], lineId: string): { ok: true; missing: MatchReason[]; line: BankLine } | { ok: false; problem: 'line_unknown' | 'line_taken' } {
  const c = candidates.find((x) => x.bankLine.id === lineId);
  if (!c) return { ok: false, problem: 'line_unknown' };
  if (c.taken || c.bankLine.state !== 'unmatched') return { ok: false, problem: 'line_taken' };
  return { ok: true, missing: c.missing, line: c.bankLine };
}

/** Marks a line as proving a settlement (it can never prove anything else). */
export function consumeLine(state: SocietyState, lineId: string, settlement: { id: string; ref: string }): void {
  const line = state.bank.lines.find((l) => l.id === lineId);
  if (!line) return;
  Object.assign(line, { state: 'matched', settlementId: settlement.id, settlementRef: settlement.ref });
  delete line.heldBy;
}

/** Reconciliation hint for an unmatched line: a pending leg or a deposited cheque it fully proves. */
export function s1SuggestionFor(state: SocietyState, line: BankLine): { kind: 'transfer' | 'cheque'; id: string; label: string; href: string } | undefined {
  if (line.state !== 'unmatched') return undefined;
  for (const t of state.finance.transfers.filter((x) => x.status === 'approved_instruction' || x.status === 'in_transit')) {
    for (const leg of t.legs.filter((l) => l.evidence === 'statement_line' && l.status === 'pending' && l.accountId === line.beneficiaryId)) {
      if (legCandidates(state, t, leg).some((c) => c.bankLine.id === line.id && c.reasons.includes('amount'))) return { kind: 'transfer', id: t.id, label: t.ref, href: FIN_ROUTES.transfer(t.id) };
    }
  }
  for (const c of state.finance.cheques.filter((x) => x.status === 'deposited' || x.status === 'cleared')) {
    const list = c.status === 'deposited' ? chequeCandidates(state, c) : chequeReversalCandidates(state, c);
    if (list.some((x) => x.bankLine.id === line.id && x.reasons.includes('amount') && x.reasons.includes('reference'))) return { kind: 'cheque', id: c.id, label: c.ref, href: FIN_ROUTES.cheque(c.id) };
  }
  return undefined;
}
