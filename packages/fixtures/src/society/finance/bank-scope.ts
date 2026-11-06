import type { CashbookEvidence, ChequeInstrument, CloseCheck, CollectionPayment, FinanceAccountRow, FundsTransfer, PaymentSubmission, SettlementConfirmation, SocietyAuditEntry } from '@repo/contracts';
import { can, type HandlerContext } from '../../handler-types';

/**
 * GitHub Issue #18 (FIN-01, P0): the bank feed is a confidentiality boundary (owner ruling).
 *
 * Statement lines and statement imports, the bank's transaction ids and line ids, counterparties,
 * full account numbers (IBANs), match candidates and every count or amount derived from the lines
 * reach only holders of `bank.view` or `bank.reconcile`. `cashbook.view`, `collections.view`,
 * `funds_transfer.create` and read-only proof access do not authorise any of it: those readers keep
 * the operational records (the cashbook, balances, transfers, cheques, proofs and payments) with the
 * bank details taken out on the server, before anything is returned. Every read model of S.1 and C.2
 * passes through the projections below; a bank line id offered by such a reader answers exactly like
 * one never issued.
 */
export const seesBankFeed = (ctx: HandlerContext): boolean => can(ctx, 'bank.view', 'history_read') || can(ctx, 'bank.reconcile', 'history_read');

/** "•••• 7890": the last four characters only, never the full account number. */
export const maskIban = (iban: string): string => `•••• ${iban.replace(/\s/g, '').slice(-4)}`;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/** An account as a reader without the bank feed sees it: no full IBAN, no unmatched statement lines. */
export function accountRow<T extends FinanceAccountRow>(ctx: HandlerContext, row: T): T {
  if (seesBankFeed(ctx)) return row;
  return { ...row, ...(row.iban ? { iban: maskIban(row.iban) } : {}), unreconciled: 0 };
}

/** A cashbook line's evidence: "settled on a statement line", without the line or the bank's id. */
export function evidence(ctx: HandlerContext, e: CashbookEvidence): CashbookEvidence {
  if (e.kind !== 'statement_line' || seesBankFeed(ctx)) return e;
  return { kind: 'statement_line', ...(e.exception ? { exception: true } : {}) };
}

/** A settlement exception (proof, leg or cheque) without the line it names. */
function exceptionOf<T extends { bankLineId?: string; bankTxnId?: string }>(e: T): Omit<T, 'bankLineId' | 'bankTxnId'> {
  const { bankLineId: _line, bankTxnId: _txn, ...rest } = e;
  return rest;
}

export function transfer(ctx: HandlerContext, t: FundsTransfer): FundsTransfer {
  if (seesBankFeed(ctx)) return t;
  return { ...t, legs: t.legs.map((l) => (l.exception ? { ...l, exception: exceptionOf(l.exception) } : l)) };
}

export function settlement(ctx: HandlerContext, st: SettlementConfirmation): SettlementConfirmation {
  return seesBankFeed(ctx) ? st : exceptionOf(st);
}

export function cheque(ctx: HandlerContext, c: ChequeInstrument): ChequeInstrument {
  if (seesBankFeed(ctx)) return c;
  const { exception, reversal, history, ...rest } = c;
  return {
    ...rest,
    ...(exception ? { exception: exceptionOf(exception) } : {}),
    ...(reversal ? { reversal: exceptionOf(reversal) } : {}),
    // "Cleared" is noted with the bank's transaction id: the event stays, the id does not.
    history: history.map((h) => (h.action === 'cleared' && h.note !== undefined ? (({ note: _n, ...e }) => e)(h) : h)),
  };
}

/** A proof without the line its exception names, and with the account it was paid to masked. */
export function submission(ctx: HandlerContext, sub: PaymentSubmission): PaymentSubmission {
  if (seesBankFeed(ctx)) return sub;
  return { ...sub, ...(sub.exception ? { exception: exceptionOf(sub.exception) } : {}), ...(sub.paidTo ? { paidTo: { ...sub.paidTo, iban: maskIban(sub.paidTo.iban) } } : {}) };
}

/** The collection account a proof was meant for: named, its IBAN masked without the bank feed. */
export function payee<T extends { iban: string }>(ctx: HandlerContext, b: T): T {
  return seesBankFeed(ctx) ? b : { ...b, iban: maskIban(b.iban) };
}

export function payment(ctx: HandlerContext, p: CollectionPayment): CollectionPayment {
  if (seesBankFeed(ctx)) return p;
  const { bankLineId: _line, bankTxnId: _txn, reversal, ...rest } = p;
  return { ...rest, ...(reversal ? { reversal: exceptionOf(reversal) } : {}) };
}

/**
 * BANK-008 "bank lines reconciled": a reader without the bank feed learns only whether the check
 * passes (why the month cannot close yet), never how many lines or how much, nor a link to them.
 */
export function closeCheck(ctx: HandlerContext, c: CloseCheck): CloseCheck {
  if (c.key !== 'unreconciled_lines' || seesBankFeed(ctx)) return c;
  return { key: c.key, outcome: c.outcome, count: 0, restricted: true };
}

/**
 * The society's audit trail (and its export) for a reader without the bank feed: entries about a
 * statement or a line are left out; on any other entry a bank transaction id is removed and a full
 * IBAN (a value or a collection-account label) is masked.
 */
export function auditEntries<T extends Pick<SocietyAuditEntry, 'target' | 'values'>>(ctx: HandlerContext, entries: readonly T[]): T[] {
  if (seesBankFeed(ctx)) return [...entries];
  const mask = (v: string) => (IBAN.test(v) ? maskIban(v) : v);
  return entries
    .filter((e) => e.target.kind !== 'bank')
    .map((e) => ({
      ...e,
      target: { ...e.target, label: mask(e.target.label) },
      ...(e.values ? { values: Object.fromEntries(Object.entries(e.values).filter(([k]) => k !== 'bank').map(([k, v]) => [k, mask(String(v))])) } : {}),
    }));
}
