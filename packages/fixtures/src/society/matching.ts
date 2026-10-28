import type { BankLine, MatchCandidate, SubmissionRow } from '@repo/contracts';
import { toPaisa } from '../portal';

/**
 * Bank matching (A4 §6, AC-11). A bank transaction is identified by the bank's own transaction id:
 * one that already settles a payment is never matched again, whatever is uploaded. The reference
 * text is only a hint: two genuine transfers may carry the same words ("MAINTENANCE NOV"), so a
 * shared reference never makes a transfer a duplicate. Candidates are scored on amount, date,
 * reference and name, and every reason is shown to the person deciding.
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

/** Scored candidates for a claimed transfer, best first. Excluded lines are never proposed. */
export function candidatesFor(claim: Claim, lines: readonly BankLine[]): MatchCandidate[] {
  const amount = toPaisa(claim.amount);
  const ref = normRef(claim.bankReference);
  const who = nameTokens(claim.payerName);
  const out: MatchCandidate[] = [];
  for (const line of lines) {
    if (line.state === 'excluded') continue;
    const reasons: MatchCandidate['reasons'] = [];
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
    const sharing = lineRef.length >= 4 ? lines.filter((o) => o.id !== line.id && normRef(o.reference) === lineRef).map((o) => o.id) : [];
    out.push({
      bankLine: line,
      score,
      reasons,
      ...(line.state === 'matched' && line.paymentId ? { alreadyMatched: { paymentId: line.paymentId, paymentRef: line.paymentRef ?? '' } } : {}),
      ...(sharing.length ? { sharesReferenceWith: sharing } : {}),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.bankLine.valueDate.localeCompare(b.bankLine.valueDate) || a.bankLine.bankTxnId.localeCompare(b.bankLine.bankTxnId));
}

/** The inbox signal for a submission: an exact free match, a possible one, only taken ones, or none. */
export function matchSignal(candidates: readonly MatchCandidate[]): SubmissionRow['match'] {
  const free = candidates.filter((c) => !c.alreadyMatched);
  const exact = free.find((c) => c.reasons.includes('amount') && c.reasons.includes('date') && (c.reasons.includes('reference') || c.reasons.includes('name')));
  if (exact) return 'exact';
  // The same amount with the same reference or name already settles a payment: most likely sent again.
  if (candidates.some((c) => c.alreadyMatched && c.reasons.includes('amount') && (c.reasons.includes('reference') || c.reasons.includes('name')))) return 'already_matched';
  // Many residents pay the same amount in the same week: an amount needs a reference or name beside it.
  if (free.some((c) => c.reasons.includes('amount') && (c.reasons.includes('reference') || c.reasons.includes('name')))) return 'possible';
  return 'none';
}

/** Lines of a statement new to the feed (the bank's id decides): re-importing creates nothing. */
export function newLines(existing: readonly BankLine[], incoming: readonly BankLine[]): BankLine[] {
  const known = new Set(existing.map((l) => l.bankTxnId));
  const seen = new Set<string>();
  return incoming.filter((l) => {
    if (known.has(l.bankTxnId) || seen.has(l.bankTxnId)) return false;
    seen.add(l.bankTxnId);
    return true;
  });
}
