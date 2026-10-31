import type { BankLine, MatchCandidate, MatchReason, SubmissionRow } from '@repo/contracts';
import { MATCH_REASONS } from '@repo/contracts';
import { toPaisa } from '../portal';

/**
 * Bank matching (A4 §6, AC-11; C.2 review). A bank transaction is identified by its receiving
 * account, the statement's source and the bank's own transaction id: one that already settles a
 * payment is never matched again, whatever is uploaded, and the same id on another account is
 * another transaction. The reference text is only a hint: two genuine transfers may carry the same
 * words ("MAINTENANCE NOV"), so a shared reference never makes a transfer a duplicate.
 *
 * Candidates are compared on amount, date, reference and name, and every reason is shown. Only a
 * full match (all four) on the issuing entity's account in force on the value date can be verified
 * directly; a partial match needs an exception approved by a second person; a line that reached
 * another account or entity can never settle the proof.
 */

/** Days a transfer may sit before (or after) the date the resident gives: weekends, cut-off times. */
export const DATE_WINDOW = { before: 3, after: 5 } as const;

export const normRef = (s: string) => s.toLocaleUpperCase('en').replace(/[^A-Z0-9]/g, '');
const nameTokens = (s: string) => new Set(s.toLocaleUpperCase('en').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface Claim {
  amount: string;
  transferDate: string;
  bankReference: string;
  payerName: string;
}

/**
 * Where the money had to arrive: the issuing legal entity, and its account in force on a date (the
 * verified beneficiary residents were shown then). Without it every line counts as on the right account.
 */
export interface DestinationScope {
  legalEntityId: string;
  accountOn: (date: string) => string | null;
}

/** Transaction identity: receiving account, source, the bank's id. */
export const lineKey = (l: Pick<BankLine, 'source' | 'beneficiaryId' | 'bankTxnId'>) => `${l.source}|${l.beneficiaryId}|${l.bankTxnId}`;

export function destinationOf(line: BankLine, scope?: DestinationScope): MatchCandidate['destination'] {
  if (!scope) return 'ok';
  if (line.legalEntityId !== scope.legalEntityId) return 'wrong_entity';
  return scope.accountOn(line.valueDate) === line.beneficiaryId ? 'ok' : 'wrong_account';
}

/**
 * Scored candidates for a claimed transfer, best first. Excluded lines are never proposed. Gate S.1
 * compares a transfer leg or a cheque reversal against money leaving the account (`direction: 'debit'`).
 */
export function candidatesFor(claim: Claim, lines: readonly BankLine[], scope?: DestinationScope, direction: 'credit' | 'debit' = 'credit'): MatchCandidate[] {
  const amount = toPaisa(claim.amount);
  const ref = normRef(claim.bankReference);
  const who = nameTokens(claim.payerName);
  const out: MatchCandidate[] = [];
  for (const line of lines) {
    // Money leaving the account (Gate S.1 debits) never proves a resident's payment.
    if (line.state === 'excluded' || (line.direction ?? 'credit') !== direction) continue;
    const reasons: MatchReason[] = [];
    let score = 0;
    if (toPaisa(line.amount.amount) === amount) {
      reasons.push('amount');
      score += 50;
    }
    const gap = days(claim.transferDate, line.valueDate);
    if (gap >= -DATE_WINDOW.before && gap <= DATE_WINDOW.after) {
      reasons.push('date');
      score += 20 - Math.min(10, Math.abs(gap) * 2);
    }
    const lineRef = normRef(line.reference);
    if (ref.length >= 4 && lineRef.length >= 4 && (lineRef === ref || lineRef.includes(ref) || ref.includes(lineRef))) {
      reasons.push('reference');
      score += 20;
    }
    // Every word of the shorter name in the longer one (a shared surname alone is not the same person).
    const theirs = nameTokens(line.counterpartyName);
    const [short, long] = theirs.size <= who.size ? [theirs, who] : [who, theirs];
    if (short.size > 0 && [...short].every((w) => long.has(w))) {
      reasons.push('name');
      score += 10;
    }
    // A candidate needs the amount or the reference: a date alone proposes nothing.
    if (!reasons.includes('amount') && !reasons.includes('reference')) continue;
    const missing = MATCH_REASONS.filter((r) => !reasons.includes(r));
    const destination = destinationOf(line, scope);
    // The right account first: a line elsewhere is listed (so it is understood) but never preferred.
    if (destination !== 'ok') score -= 100;
    const sharing = lineRefSharing(line, lines);
    out.push({
      bankLine: line,
      score,
      reasons,
      missing,
      strength: missing.length ? 'partial' : 'full',
      destination,
      ...(line.heldFor ? { heldFor: line.heldFor } : line.heldBy ? { heldFor: { submissionId: line.heldBy.id, submissionRef: line.heldBy.ref } } : {}),
      ...(line.state === 'matched' && line.paymentId ? { alreadyMatched: { paymentId: line.paymentId, paymentRef: line.paymentRef ?? '' } } : {}),
      // Gate S.1: a line that settled a deposit, transfer leg or cheque reversal is taken as well.
      ...(line.state === 'matched' && !line.paymentId && line.settlementId ? { alreadyMatched: { paymentId: line.settlementId, paymentRef: line.settlementRef ?? '' } } : {}),
      ...(sharing.length ? { sharesReferenceWith: sharing } : {}),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.bankLine.valueDate.localeCompare(b.bankLine.valueDate) || a.bankLine.bankTxnId.localeCompare(b.bankLine.bankTxnId));
}

function lineRefSharing(line: BankLine, lines: readonly BankLine[]): string[] {
  const ref = normRef(line.reference);
  return ref.length >= 4 ? lines.filter((o) => o.id !== line.id && normRef(o.reference) === ref).map((o) => o.id) : [];
}

/** A line this proof may use now: free, not held for another proof, on the right account. */
export const usable = (c: MatchCandidate, submissionId?: string) =>
  !c.alreadyMatched && c.destination === 'ok' && (!c.heldFor || c.heldFor.submissionId === submissionId);

/** The inbox signal for a submission: an exact free match, a possible one, only taken ones, or none. */
export function matchSignal(candidates: readonly MatchCandidate[]): SubmissionRow['match'] {
  const free = candidates.filter((c) => usable(c));
  if (free.some((c) => c.strength === 'full')) return 'exact';
  // The same amount with the same reference or name already settles a payment: most likely sent again.
  if (candidates.some((c) => c.alreadyMatched && c.reasons.includes('amount') && (c.reasons.includes('reference') || c.reasons.includes('name')))) return 'already_matched';
  // Many residents pay the same amount in the same week: an amount needs a reference or name beside it.
  if (free.some((c) => c.reasons.includes('amount') && (c.reasons.includes('reference') || c.reasons.includes('name')))) return 'possible';
  return 'none';
}

/** Lines of a statement new to the feed (account, source and the bank's id decide): re-importing creates nothing. */
export function newLines(existing: readonly BankLine[], incoming: readonly BankLine[]): BankLine[] {
  const known = new Set(existing.map(lineKey));
  const seen = new Set<string>();
  return incoming.filter((l) => {
    const key = lineKey(l);
    if (known.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
