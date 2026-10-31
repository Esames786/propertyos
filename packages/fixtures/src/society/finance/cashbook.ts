import {
  RECEIPT_CATEGORIES,
  type CashbookCategory,
  type CashbookEvidence,
  type CashbookLine,
  type CashbookSource,
  type CashbookTotals,
  type CashbookView,
  type FinanceAccount,
  type FundsTransfer,
  type PendingItem,
  type PeriodState,
} from '@repo/contracts';
import { PENDING_STATES } from '../collections-read';
import { beneficiaryOn, type SocietyState } from '../state';
import { money, OFFICE_CASH, paisa, periodOf, sum } from './model';
import { FIN_ROUTES } from './routes';
import { cashOfBatch } from './pending-cash';

/**
 * The cashbook (BANK-007, D-34): a view over settled source events, never a second ledger. Settled
 * cash changes only through confirmed payments (and their approved reversals), posted cash vouchers
 * and settlement confirmations of transfer legs (I-26). Each event counts once by
 * (source type, source id, posting version, leg) (I-28). Instructions, cheques and proofs that wait
 * for evidence are listed apart and never enter a balance.
 */

// ---------------------------------------------------------------------------------------------
// Accounts: bank accounts are BILL-010's verified beneficiaries; cash accounts are S.1's
// ---------------------------------------------------------------------------------------------

export function financeAccounts(state: SocietyState, today: string): FinanceAccount[] {
  const f = state.finance;
  const banks: FinanceAccount[] = state.beneficiaries
    .filter((b) => b.verifiedOn !== undefined)
    .map((b) => ({
      id: b.id,
      kind: 'bank',
      legalEntityId: b.legalEntityId,
      legalEntityName: b.legalEntityName,
      siteId: b.siteId,
      name: f.bankNames[b.id] ?? b.accountTitle,
      beneficiaryId: b.id,
      bankName: b.bankName,
      branch: b.branch,
      accountTitle: b.accountTitle,
      iban: b.iban,
      receivesDues: beneficiaryOn(state, b.legalEntityId, today)?.id === b.id,
      status: 'active',
      purpose: 'operating',
      openedOn: b.verifiedOn!,
    }));
  const entity = state.beneficiaries[0];
  const cash: FinanceAccount[] = f.cashAccounts.map((c) => ({
    id: c.id,
    kind: c.kind,
    legalEntityId: entity?.legalEntityId ?? '',
    legalEntityName: entity?.legalEntityName ?? '',
    siteId: entity?.siteId ?? '',
    name: c.name,
    receivesDues: false,
    status: 'active',
    purpose: 'operating',
    custodian: c.custodian,
    openedOn: c.openedOn,
  }));
  return [...banks, ...cash];
}

// ---------------------------------------------------------------------------------------------
// Periods: one lock per legal entity and month (I-27)
// ---------------------------------------------------------------------------------------------

export function periodState(state: SocietyState, period: string): PeriodState {
  return state.finance.periods.find((p) => p.period === period)?.state ?? 'open';
}

/** A posting dated in a closed month is refused (a reopened month accepts postings again). */
export const isLocked = (state: SocietyState, date: string) => periodState(state, periodOf(date)) === 'closed';

/** Months the society has books for: from the first opening balance to the current month. */
export function knownPeriods(state: SocietyState, today: string): Array<{ period: string; state: PeriodState }> {
  const first = [...state.finance.openings.map((o) => o.on), ...state.finance.periods.map((p) => `${p.period}-01`), today].sort()[0]!;
  const out: Array<{ period: string; state: PeriodState }> = [];
  for (let p = periodOf(first); p <= periodOf(today); ) {
    out.push({ period: p, state: periodState(state, p) });
    const d = new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 1));
    p = d.toISOString().slice(0, 7);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Source events
// ---------------------------------------------------------------------------------------------

export interface CashEvent {
  key: string;
  accountId: string;
  date: string;
  /** When it was recorded (orders events of one day). */
  at: string;
  direction: 'in' | 'out';
  amount: bigint;
  category: CashbookCategory;
  source: CashbookSource;
  sourceId: string;
  sourceRef: string;
  postingVersion: number;
  counterparty?: string;
  flats?: string[];
  describe: CashbookLine['describe'];
  evidence: CashbookEvidence;
  href: string;
}

const approverNames = (state: SocietyState, approvalId?: string) =>
  state.finance.approvals
    .find((a) => a.id === approvalId)
    ?.decisions.filter((d) => d.decision === 'approve')
    .map((d) => d.byName)
    .join(', ') ?? '';

const legCategory = (t: FundsTransfer): CashbookCategory => (t.kind === 'deposit' ? 'deposit' : t.kind === 'withdrawal' ? 'withdrawal' : 'transfer');

/** Every settled source event of the society, each exactly once. */
export function cashEvents(state: SocietyState): CashEvent[] {
  const f = state.finance;
  const out = new Map<string, CashEvent>();
  const add = (e: CashEvent) => {
    // Idempotent by construction: the same source, version and leg can never count twice.
    if (!out.has(e.key)) out.set(e.key, e);
  };
  for (const o of f.openings) {
    add({
      key: `opening_balance|${o.id}|1|in`,
      accountId: o.accountId,
      date: o.on,
      at: o.at,
      direction: 'in',
      amount: paisa(o.amount),
      category: 'opening',
      source: 'opening_balance',
      sourceId: o.id,
      sourceRef: o.document,
      postingVersion: 1,
      describe: { key: 'opening' },
      evidence: { kind: 'handover', document: o.document, approvedByName: o.approvedByName },
      href: FIN_ROUTES.account(o.accountId),
    });
  }
  for (const p of state.payments) {
    const line = p.bankLineId ? state.bank.lines.find((l) => l.id === p.bankLineId) : undefined;
    const viaBank = p.verification === 'bank_matched' || p.verification === 'exception_approved';
    // C.2 verification decides the account: the receiving bank account, or the office cash box.
    const accountId = viaBank ? line?.beneficiaryId : OFFICE_CASH;
    if (!accountId) continue;
    const flats = [...new Set(p.allocations.map((a) => a.unitCode))];
    const evidence: CashbookEvidence = viaBank
      ? { kind: 'statement_line', bankLineId: p.bankLineId!, bankTxnId: p.bankTxnId ?? '', ...(p.verification === 'exception_approved' ? { exception: true } : {}) }
      : p.verification === 'witnessed'
        ? { kind: 'witnessed_count', countedByName: p.verifiedByName, witnessedByName: p.witness?.byName ?? '' }
        : { kind: 'counter', byName: p.verifiedByName };
    add({
      key: `payment|${p.id}|1|in`,
      accountId,
      date: viaBank ? (line?.valueDate ?? p.receivedOn) : p.receivedOn,
      at: p.verifiedAt,
      direction: 'in',
      amount: paisa(p.amount),
      category: p.method === 'cheque' ? 'cheque' : 'resident_dues',
      source: 'payment',
      sourceId: p.id,
      sourceRef: p.ref,
      postingVersion: 1,
      counterparty: p.payerName,
      flats,
      describe: { key: p.method === 'cheque' ? 'cheque' : p.method === 'office_cash' ? 'office_cash' : 'transfer', values: { receipt: p.receiptRef } },
      evidence,
      href: FIN_ROUTES.payment(p.id),
    });
    if (p.reversal) {
      const debit = p.reversal.bankLineId ? state.bank.lines.find((l) => l.id === p.reversal!.bankLineId) : undefined;
      add({
        key: `payment_reversal|${p.id}|1|out`,
        accountId,
        date: p.reversal.on,
        at: p.reversal.at,
        direction: 'out',
        amount: paisa(p.amount),
        category: 'reversal',
        source: 'payment_reversal',
        sourceId: p.id,
        sourceRef: p.reversal.approvalRef,
        postingVersion: 1,
        counterparty: p.payerName,
        flats,
        describe: { key: 'reversal', values: { receipt: p.receiptRef } },
        evidence: debit ? { kind: 'statement_line', bankLineId: debit.id, bankTxnId: debit.bankTxnId } : { kind: 'approval', approvalRef: p.reversal.approvalRef, approvedByName: p.reversal.approvedByName },
        href: FIN_ROUTES.payment(p.id),
      });
    }
  }
  for (const v of f.vouchers.filter((x) => x.status === 'posted')) {
    add({
      key: `cash_voucher|${v.id}|1|${v.direction === 'receipt' ? 'in' : 'out'}`,
      accountId: v.accountId,
      date: v.onDate,
      at: v.postedAt ?? v.preparedAt,
      direction: v.direction === 'receipt' ? 'in' : 'out',
      amount: paisa(v.amount),
      category: v.reversalOf ? 'reversal' : RECEIPT_CATEGORIES.includes(v.category) ? 'other_income' : 'expense',
      source: 'cash_voucher',
      sourceId: v.id,
      sourceRef: v.ref,
      postingVersion: 1,
      counterparty: v.counterparty.name,
      describe: { key: v.reversalOf ? 'voucher_reversal' : 'voucher', values: { purpose: v.purpose, category: v.category, original: v.reversalOf?.ref ?? '' } },
      evidence: { kind: 'voucher', evidenceName: v.evidence.name, approvedByName: approverNames(state, v.approvalId) },
      href: FIN_ROUTES.voucher(v.id),
    });
  }
  for (const st of f.settlements.filter((x) => x.subjectType === 'transfer_leg')) {
    const t = f.transfers.find((x) => x.id === st.subjectId);
    const leg = t?.legs.find((l) => l.leg === st.leg);
    if (!t || !leg) continue;
    const other = t.legs.find((l) => l.leg !== st.leg);
    add({
      key: `transfer_leg|${t.id}|1|${leg.leg}`,
      accountId: leg.accountId,
      date: st.settledOn,
      at: st.at,
      direction: leg.leg === 'out' ? 'out' : 'in',
      amount: paisa(t.amount),
      category: legCategory(t),
      source: 'transfer_leg',
      sourceId: t.id,
      sourceRef: t.ref,
      postingVersion: 1,
      counterparty: other?.accountName,
      describe: { key: leg.leg === 'out' ? 'leg_out' : 'leg_in', values: { kind: t.kind, other: other?.accountName ?? '' } },
      evidence: st.evidenceType === 'statement_line' ? { kind: 'statement_line', bankLineId: st.bankLineId!, bankTxnId: st.bankTxnId ?? '', ...(st.exception ? { exception: true } : {}) } : { kind: 'witnessed_slip', slipNo: st.slipNo ?? '', witnessedByName: st.confirmedByName },
      href: FIN_ROUTES.transfer(t.id),
    });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key));
}

const signed = (e: CashEvent) => (e.direction === 'in' ? e.amount : -e.amount);

/** An account's settled balance at the end of a day (every account when `accountId` is null). */
export function balanceOn(events: readonly CashEvent[], accountId: string | null, date: string): bigint {
  return sum(events.filter((e) => (accountId === null || e.accountId === accountId) && e.date <= date).map(signed));
}

const totalsOf = (events: readonly CashEvent[], opening: bigint): CashbookTotals => {
  const receipts = sum(events.filter((e) => e.direction === 'in').map((e) => e.amount));
  const payments = sum(events.filter((e) => e.direction === 'out').map((e) => e.amount));
  return { opening: money(opening), receipts: money(receipts), payments: money(payments), closing: money(opening + receipts - payments), net: money(receipts - payments) };
};

const inPeriod = (e: { date: string }, period: string) => periodOf(e.date) === period;
/** The opening of a period counts every settled event before its first day; handover balances are opening, not movement. */
const isOpeningOf = (e: CashEvent, period: string) => e.date < `${period}-01` || (e.category === 'opening' && inPeriod(e, period));

// ---------------------------------------------------------------------------------------------
// Pending (never in a balance) and cash in transit
// ---------------------------------------------------------------------------------------------

/** Deposits and transfers whose money left one account and has not arrived at the other. */
export function inTransitOf(state: SocietyState): bigint {
  return sum(
    state.finance.transfers
      .filter((t) => t.status === 'in_transit')
      .filter((t) => t.legs.find((l) => l.leg === 'out')?.status === 'settled' && t.legs.find((l) => l.leg === 'in')?.status !== 'settled')
      .map((t) => paisa(t.amount)),
  );
}

export function pendingItems(state: SocietyState, accountId: string | null): PendingItem[] {
  const f = state.finance;
  const out: PendingItem[] = [];
  const touches = (t: FundsTransfer) => accountId === null || t.fromAccountId === accountId || t.toAccountId === accountId;
  for (const t of f.transfers.filter(touches)) {
    const base = { id: t.id, ref: t.ref, amount: t.amount, href: FIN_ROUTES.transfer(t.id), since: t.preparedAt.slice(0, 10) };
    const names = { from: t.legs[0]?.accountName ?? '', to: t.legs[1]?.accountName ?? '' };
    if (t.status === 'awaiting_approval') out.push({ ...base, kind: 'awaiting_approval', accountId: t.fromAccountId, describe: { key: 'transfer_awaiting', values: { ...names, kind: t.kind } } });
    if (t.status === 'approved_instruction') out.push({ ...base, kind: 'approved_instruction', accountId: t.fromAccountId, describe: { key: 'instruction', values: { ...names, kind: t.kind } } });
    if (t.status === 'in_transit') out.push({ ...base, kind: 'cash_in_transit', accountId: t.toAccountId, describe: { key: 'in_transit', values: { ...names, kind: t.kind } } });
  }
  for (const c of f.cheques.filter((x) => ['received', 'deposited', 'exception_pending'].includes(x.status))) {
    if (accountId !== null && c.deposit?.accountId !== accountId && !(c.status === 'received' && accountId === OFFICE_CASH)) continue;
    out.push({
      kind: c.status === 'received' ? 'cheque_received' : 'cheque_deposited',
      id: c.id,
      ref: c.ref,
      amount: c.amount,
      ...(c.deposit ? { accountId: c.deposit.accountId } : {}),
      since: c.receivedOn,
      describe: { key: c.status === 'received' ? 'cheque_received' : 'cheque_deposited', values: { payer: c.payerName, number: c.chequeNumber } },
      href: FIN_ROUTES.cheque(c.id),
    });
  }
  for (const v of f.vouchers.filter((x) => (x.status === 'approved' || x.status === 'submitted') && (accountId === null || x.accountId === accountId))) {
    out.push({ kind: v.status === 'approved' ? 'voucher_approved' : 'awaiting_approval', id: v.id, ref: v.ref, amount: v.amount, accountId: v.accountId, since: v.preparedAt.slice(0, 10), describe: { key: v.status === 'approved' ? 'voucher_approved' : 'voucher_awaiting', values: { purpose: v.purpose } }, href: FIN_ROUTES.voucher(v.id) });
  }
  // D-46: office cash recorded but not yet counted by a second person (it will enter the office cash box).
  if (accountId === null || accountId === OFFICE_CASH) {
    for (const b of f.batches.filter((x) => (x.status === 'submitted' || x.status === 'returned') && paisa(cashOfBatch(x)) > 0n)) {
      const payers = [...new Set(b.lines.filter((l) => l.method === 'office_cash').map((l) => l.payerName))].join(', ');
      out.push({ kind: 'cash_awaiting_count', id: b.id, ref: b.ref, amount: cashOfBatch(b), accountId: OFFICE_CASH, since: b.collectedOn, describe: { key: 'cash_awaiting_count', values: { name: b.collectedByName, payers } }, href: FIN_ROUTES.batch(b.id) });
    }
  }
  if (accountId === null || state.beneficiaries.some((b) => b.id === accountId)) {
    for (const s of state.submissions.filter((x) => PENDING_STATES.includes(x.state) && (accountId === null || x.paidTo?.beneficiaryId === accountId))) {
      out.push({ kind: 'proof_pending', id: s.id, ref: s.ref, amount: s.current.amount, ...(s.paidTo ? { accountId: s.paidTo.beneficiaryId } : {}), since: s.current.submittedAt.slice(0, 10), describe: { key: 'proof_pending', values: { payer: s.payerName, state: s.state } }, href: `/backoffice/fin/transfer-proof-review?record=${s.id}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

export function cashbookView(state: SocietyState, today: string, accountId: string | null, period: string): Omit<CashbookView, 'actions'> {
  const accounts = financeAccounts(state, today);
  const events = cashEvents(state);
  const scoped = events.filter((e) => accountId === null || e.accountId === accountId);
  const opening = sum(scoped.filter((e) => isOpeningOf(e, period)).map(signed));
  const moves = scoped.filter((e) => inPeriod(e, period) && !isOpeningOf(e, period));
  let running = opening;
  const lines: CashbookLine[] = moves.map((e) => {
    running += signed(e);
    return {
      key: e.key,
      accountId: e.accountId,
      date: e.date,
      period: periodOf(e.date),
      direction: e.direction,
      amount: money(e.amount),
      category: e.category,
      source: e.source,
      sourceId: e.sourceId,
      sourceRef: e.sourceRef,
      postingVersion: e.postingVersion,
      ...(e.counterparty ? { counterparty: e.counterparty } : {}),
      ...(e.flats?.length ? { flats: e.flats } : {}),
      describe: e.describe,
      evidence: e.evidence,
      href: e.href,
      balance: money(running),
    };
  });
  const byAccount = accounts.map((a) => {
    const own = events.filter((e) => e.accountId === a.id);
    return { accountId: a.id, name: a.name, kind: a.kind, ...totalsOf(own.filter((e) => inPeriod(e, period) && !isOpeningOf(e, period)), sum(own.filter((e) => isOpeningOf(e, period)).map(signed))) };
  });
  const categories = new Map<string, { category: CashbookCategory; direction: 'in' | 'out'; amount: bigint; count: number }>();
  for (const e of moves) {
    const k = `${e.category}|${e.direction}`;
    const c = categories.get(k) ?? { category: e.category, direction: e.direction, amount: 0n, count: 0 };
    c.amount += e.amount;
    c.count += 1;
    categories.set(k, c);
  }
  const reconciliation = accounts
    .filter((a) => a.kind === 'bank' && (accountId === null || a.id === accountId))
    .map((a) => {
      const cashbookMovement = sum(events.filter((e) => e.accountId === a.id && inPeriod(e, period) && e.category !== 'opening').map(signed));
      const periodLines = state.bank.lines.filter((l) => l.beneficiaryId === a.id && periodOf(l.valueDate) === period && l.state !== 'excluded');
      const statementMovement = sum(periodLines.map((l) => (l.direction === 'debit' ? -paisa(l.amount) : paisa(l.amount))));
      const unmatched = periodLines.filter((l) => l.state === 'unmatched');
      const unmatchedAmount = sum(unmatched.map((l) => (l.direction === 'debit' ? -paisa(l.amount) : paisa(l.amount))));
      const difference = statementMovement - cashbookMovement;
      return {
        accountId: a.id,
        name: a.name,
        cashbookMovement: money(cashbookMovement),
        statementMovement: money(statementMovement),
        unmatchedLines: unmatched.length,
        unmatchedAmount: money(unmatchedAmount),
        difference: money(difference),
        reconciled: difference === 0n && unmatched.length === 0,
        href: FIN_ROUTES.bankFeed('unmatched'),
      };
    });
  return {
    period,
    accountId,
    accounts: accounts.map((a) => ({ id: a.id, kind: a.kind, name: a.name, status: a.status, balance: money(balanceOn(events, a.id, today)) })),
    periods: knownPeriods(state, today),
    totals: totalsOf(moves, opening),
    byAccount,
    byCategory: [...categories.values()].map((c) => ({ category: c.category, direction: c.direction, amount: money(c.amount), count: c.count })),
    lines,
    inTransit: money(inTransitOf(state)),
    pending: pendingItems(state, accountId),
    reconciliation,
    periodState: periodState(state, period),
  };
}
