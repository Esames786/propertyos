import type { CashCount, CloseCheck, FinanceAccountRow, FinanceOverview, Money } from '@repo/contracts';
import { PENDING_STATES } from '../collections-read';
import { isPosted } from '../billing-run';
import { balances, type SocietyView } from '../state';
import { balanceOn, cashbookView, cashEvents, financeAccounts, inTransitOf, knownPeriods, periodState, type CashEvent } from './cashbook';
import { lastDayOf, money, paisa, periodOf, sum } from './model';
import { FIN_ROUTES } from './routes';

/** FIN-001, BANK-001 and BANK-008: figures derived from the same events as the cashbook. */

const signed = (e: CashEvent) => (e.direction === 'in' ? e.amount : -e.amount);

export function accountRows(view: SocietyView, today: string, period: string): FinanceAccountRow[] {
  const { state } = view;
  const events = cashEvents(state);
  return financeAccounts(state, today).map((a) => {
    const own = events.filter((e) => e.accountId === a.id && periodOf(e.date) === period && e.category !== 'opening');
    const lines = state.bank.lines.filter((l) => l.beneficiaryId === a.id && l.state === 'unmatched');
    const pending = sum([
      ...state.finance.transfers.filter((t) => ['awaiting_approval', 'approved_instruction', 'in_transit'].includes(t.status) && (t.fromAccountId === a.id || t.toAccountId === a.id)).map((t) => paisa(t.amount)),
      ...state.finance.cheques.filter((c) => ['deposited', 'exception_pending'].includes(c.status) && c.deposit?.accountId === a.id).map((c) => paisa(c.amount)),
    ]);
    return {
      ...a,
      balance: money(balanceOn(events, a.id, today)),
      inflow: money(sum(own.filter((e) => e.direction === 'in').map((e) => e.amount))),
      outflow: money(sum(own.filter((e) => e.direction === 'out').map((e) => e.amount))),
      unreconciled: lines.length,
      pending: money(pending),
      href: FIN_ROUTES.account(a.id),
    };
  });
}

/**
 * BANK-008: what stands between a month and its close. Blocking items stop the close; warnings are
 * shown and acknowledged. Every check opens its records. Cash accounts need a witnessed count dated
 * on or after the month's last day that agrees with the cashbook on its date.
 */
export function closeChecks(view: SocietyView, period: string, today: string): { checks: CloseCheck[]; cashAccounts: Array<{ id: string; name: string; expected: Money; counted?: CashCount }> } {
  const { state } = view;
  const f = state.finance;
  const end = lastDayOf(period);
  const events = cashEvents(state);
  const check = (key: CloseCheck['key'], items: readonly bigint[], severity: 'blocking' | 'warning', href?: string): CloseCheck => ({
    key,
    outcome: items.length ? severity : 'passed',
    count: items.length,
    ...(items.length ? { amount: money(sum(items)) } : {}),
    ...(href ? { href } : {}),
  });
  const lines = state.bank.lines.filter((l) => l.state === 'unmatched' && l.valueDate <= end);
  const proofs = state.submissions.filter((x) => PENDING_STATES.includes(x.state) && x.current.transferDate <= end);
  const exceptions = [...f.transfers.flatMap((t) => t.legs.filter((l) => l.status === 'exception_pending').map(() => paisa(t.amount))), ...f.cheques.filter((c) => c.status === 'exception_pending').map((c) => paisa(c.amount))];
  const runs = state.runs.filter((r) => r.period <= period && !isPosted(r.state) && r.state !== 'CANCELLED');
  const vouchers = f.vouchers.filter((v) => (v.status === 'submitted' || v.status === 'approved') && v.onDate <= end);
  const transit = f.transfers.filter((t) => t.status === 'in_transit' && t.preparedAt.slice(0, 10) <= end);
  const instructions = f.transfers.filter((t) => (t.status === 'approved_instruction' || t.status === 'awaiting_approval') && t.preparedAt.slice(0, 10) <= end);
  const cheques = f.cheques.filter((c) => ['received', 'deposited'].includes(c.status) && c.receivedOn <= end);
  const batches = f.batches.filter((b) => b.status === 'submitted' && b.collectedOn <= end);
  const cashAccounts = financeAccounts(state, today)
    .filter((a) => a.kind !== 'bank')
    .map((a) => {
      const counted = [...f.cashCounts].filter((c) => c.accountId === a.id && c.status === 'witnessed' && c.onDate >= end).sort((x, y) => y.countedAt.localeCompare(x.countedAt))[0];
      return { id: a.id, name: a.name, expected: money(balanceOn(events, a.id, counted?.onDate ?? end)), ...(counted ? { counted } : {}) };
    });
  const uncounted = cashAccounts.filter((c) => !c.counted || paisa(c.counted.counted) !== paisa(c.expected));
  return {
    checks: [
      { key: 'period_ended', outcome: today > end ? 'passed' : 'blocking', count: today > end ? 0 : 1 },
      check('unreconciled_lines', lines.map((l) => paisa(l.amount)), 'blocking', FIN_ROUTES.bankFeed('unmatched')),
      check('proofs_waiting', proofs.map((x) => paisa(x.current.amount)), 'blocking', FIN_ROUTES.inbox('pending')),
      check('open_exceptions', exceptions, 'blocking', FIN_ROUTES.transfers('in_transit')),
      check('unposted_runs', runs.map((r) => paisa(r.totals?.amount)), 'warning', FIN_ROUTES.runs),
      check('vouchers_open', vouchers.map((v) => paisa(v.amount)), 'blocking', FIN_ROUTES.cashbook({ period })),
      check('cash_in_transit', transit.map((t) => paisa(t.amount)), 'blocking', FIN_ROUTES.transfers('in_transit')),
      check('unsettled_instructions', instructions.map((t) => paisa(t.amount)), 'blocking', FIN_ROUTES.transfers('approved_instruction')),
      check('cheques_pending', cheques.map((c) => paisa(c.amount)), 'warning', FIN_ROUTES.cheques()),
      check('batches_open', batches.map((b) => sum(b.lines.map((l) => paisa(l.amount)))), 'blocking', FIN_ROUTES.batches('submitted')),
      check('cash_counted', uncounted.map((c) => paisa(c.expected)), 'blocking'),
    ],
    cashAccounts,
  };
}

export function financeOverview(view: SocietyView, today: string, period: string, extras: { approvals: FinanceOverview['approvals'] }): Omit<FinanceOverview, 'site'> {
  const { state } = view;
  const f = state.finance;
  const book = cashbookView(state, today, null, period);
  const events = cashEvents(state);
  const accounts = financeAccounts(state, today);
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  const split = (pred: (e: CashEvent) => boolean) => ({ cash: money(sum(events.filter((e) => pred(e) && kindOf.get(e.accountId) !== 'bank').map(signed))), bank: money(sum(events.filter((e) => pred(e) && kindOf.get(e.accountId) === 'bank').map(signed))) });
  const start = `${period}-01`;
  const end = lastDayOf(period);
  const moves = events.filter((e) => periodOf(e.date) === period && e.category !== 'opening');
  const of = (cats: readonly string[], dir: 'in' | 'out') => moves.filter((e) => cats.includes(e.category) && e.direction === dir);
  const collected = of(['resident_dues', 'cheque'], 'in');
  const reversed = of(['reversal'], 'out').filter((e) => e.source === 'payment_reversal');
  const outstandingByAccount = [...balances(view).values()].filter((v) => v > 0n);
  const pendingProofs = state.submissions.filter((x) => PENDING_STATES.includes(x.state));
  const cheques = f.cheques.filter((c) => ['received', 'deposited', 'exception_pending'].includes(c.status));
  const awaiting = f.transfers.filter((t) => t.status === 'approved_instruction' || t.status === 'awaiting_approval');
  const unmatched = state.bank.lines.filter((l) => l.state === 'unmatched');
  const billed = view.invoices.filter((i) => i.period === period);
  const live = state.payments.filter((p) => !p.reversal && periodOf(p.receivedOn) === period);
  const cashReceived = live.filter((p) => p.verification === 'counter' || p.verification === 'witnessed');
  const bankSettled = moves.filter((e) => kindOf.get(e.accountId) === 'bank' && e.direction === 'in' && (e.source === 'payment' || (e.source === 'transfer_leg' && e.category === 'deposit')));
  const close = closeChecks(view, period, today);
  return {
    period,
    periodState: periodState(state, period),
    periods: knownPeriods(state, today),
    opening: { amount: book.totals.opening, ...split((e) => e.date < start || (e.category === 'opening' && periodOf(e.date) === period)), href: FIN_ROUTES.cashbook({ period }) },
    collected: { amount: money(sum(collected.map((e) => e.amount)) - sum(reversed.map((e) => e.amount))), count: collected.length, href: FIN_ROUTES.payments() },
    otherIncome: { amount: money(sum(of(['other_income'], 'in').map((e) => e.amount))), count: of(['other_income'], 'in').length, href: FIN_ROUTES.cashbook({ period, category: 'other_income' }) },
    expenses: { amount: money(sum(of(['expense'], 'out').map((e) => e.amount))), count: of(['expense'], 'out').length, href: FIN_ROUTES.cashbook({ period, category: 'expense' }) },
    outstanding: { amount: money(sum(outstandingByAccount)), accounts: outstandingByAccount.length, href: FIN_ROUTES.aging() },
    pendingVerification: { amount: money(sum(pendingProofs.map((x) => paisa(x.current.amount)))), count: pendingProofs.length, href: FIN_ROUTES.inbox('pending') },
    cashInTransit: { amount: money(inTransitOf(state)), count: f.transfers.filter((t) => t.status === 'in_transit').length, href: FIN_ROUTES.transfers('in_transit') },
    chequesPending: { amount: money(sum(cheques.map((c) => paisa(c.amount)))), count: cheques.length, href: FIN_ROUTES.cheques('pending') },
    transfersAwaiting: { amount: money(sum(awaiting.map((t) => paisa(t.amount)))), count: awaiting.length, href: FIN_ROUTES.transfers('approved_instruction') },
    netMovement: { amount: book.totals.net, count: book.lines.length, href: FIN_ROUTES.cashbook({ period }) },
    closing: { amount: book.totals.closing, ...split((e) => e.date <= end), href: FIN_ROUTES.cashbook({ period }) },
    unreconciled: { amount: money(sum(unmatched.map((l) => (l.direction === 'debit' ? -paisa(l.amount) : paisa(l.amount))))), count: unmatched.length, href: FIN_ROUTES.bankFeed('unmatched') },
    ladder: {
      billed: { amount: money(sum(billed.map((i) => paisa(i.total)))), count: billed.length, href: FIN_ROUTES.invoices({ period }) },
      collected: { amount: money(sum(live.map((p) => paisa(p.amount)))), count: live.length, href: FIN_ROUTES.payments() },
      cashReceived: { amount: money(sum(cashReceived.map((p) => paisa(p.amount)))), count: cashReceived.length, href: FIN_ROUTES.payments({ method: 'office_cash' }) },
      bankSettled: { amount: money(sum(bankSettled.map((e) => e.amount))), count: bankSettled.length, href: FIN_ROUTES.bankFeed('matched') },
    },
    accounts: accountRows(view, today, period),
    approvals: extras.approvals,
    close: { state: periodState(state, period), blocking: close.checks.filter((c) => c.outcome === 'blocking').length, href: FIN_ROUTES.close(period) },
    byCategory: book.byCategory,
  };
}
