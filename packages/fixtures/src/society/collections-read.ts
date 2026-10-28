import {
  AGING_BUCKETS,
  type AgingReport,
  type AgingRow,
  type BankLine,
  type CollectionPayment,
  type CollectionsSummary,
  type CreditRow,
  type Money,
  type PaymentRow,
  type PaymentSubmission,
  type ReconciliationSummary,
  type SubmissionRow,
} from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { ALNOOR_ENTITY, ALNOOR_SITE } from './alnoor';
import { linesOf, openLinesFor, type OpenLine } from './allocate';
import { agingByAccount, bucketOf, emptyBuckets } from './aging';
import { isPosted } from './billing-run';
import { candidatesFor, matchSignal, normRef } from './matching';
import { creditByAccount, type SocietyState, type SocietyView } from './state';

/**
 * Collections read model (COL-001/005, FIN-005/008/011, BANK-004). Every figure is derived from the
 * same invoices, payments and bank lines the records show, and carries the address of the records
 * behind it (never a decorative number).
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const sum = (xs: Iterable<bigint>) => [...xs].reduce((s, v) => s + v, 0n);

export const ROUTES = {
  collections: '/backoffice/col/collections-dashboard',
  inbox: '/backoffice/fin/unverified-transfers-queue',
  review: (id: string) => `/backoffice/fin/transfer-proof-review?record=${id}`,
  payments: '/backoffice/fin/payment-list',
  payment: (id: string) => `/backoffice/fin/payment-workspace?record=${id}`,
  credits: '/backoffice/fin/customer-credit-overpayments',
  aging: '/backoffice/col/aging-breakdown',
  statement: (accountId: string) => `/backoffice/col/customer-statement?account=${accountId}`,
  bankFeed: '/backoffice/bank/bank-transaction-feed',
  reconciliation: '/backoffice/bank/reconciliation-workspace',
  invoices: '/backoffice/fin/invoices-list',
  accounts: '/backoffice/billing/accounts',
} as const;

export const PENDING_STATES: readonly PaymentSubmission['state'][] = ['submitted', 'under_review', 'needs_information'];

/** The latest posted billing period (what "this month" means for collections). */
export function collectionPeriod(state: SocietyState): string | null {
  return [...state.runs].filter((r) => isPosted(r.state)).sort((a, b) => b.period.localeCompare(a.period))[0]?.period ?? null;
}

export function submissionRow(state: SocietyState, sub: PaymentSubmission): SubmissionRow {
  const candidates = candidatesFor({ amount: sub.current.amount.amount, transferDate: sub.current.transferDate, bankReference: sub.current.bankReference, payerName: sub.payerName }, state.bank.lines);
  return {
    id: sub.id,
    ref: sub.ref,
    state: sub.state,
    accountNo: sub.accountNo,
    billingAccountId: sub.billingAccountId,
    payerName: sub.payerName,
    flats: sub.flats,
    amount: sub.current.amount,
    transferDate: sub.current.transferDate,
    bankReference: sub.current.bankReference,
    submittedAt: sub.current.submittedAt,
    versions: sub.versions.length,
    match: sub.state === 'verified' ? 'exact' : matchSignal(candidates),
    ...((d) => (d.length ? { possibleDuplicateOf: d.map((x) => x.ref) } : {}))(possibleDuplicates(state, sub)),
    ...(sub.reviewer ? { reviewer: sub.reviewer.name } : {}),
  };
}

/**
 * Another submission of the same payer with the same file, or the same amount, transfer date and
 * reference. Shown as a warning to the reviewer; the bank line decides (never the reference alone).
 */
export function possibleDuplicates(state: SocietyState, sub: PaymentSubmission): PaymentSubmission[] {
  return state.submissions.filter(
    (o) =>
      o.id !== sub.id &&
      o.payerPartyId === sub.payerPartyId &&
      o.state !== 'rejected' &&
      (o.versions.some((v) => sub.versions.some((w) => w.file.fingerprint === v.file.fingerprint)) ||
        (o.current.amount.amount === sub.current.amount.amount && o.current.transferDate === sub.current.transferDate && normRef(o.current.bankReference) === normRef(sub.current.bankReference))),
  );
}

export function paymentRow(p: CollectionPayment, lines: readonly BankLine[]): PaymentRow {
  const allocated = sum(p.allocations.map((a) => toPaisa(a.amount.amount)));
  return {
    id: p.id,
    ref: p.ref,
    receivedOn: p.receivedOn,
    method: p.method,
    verification: p.verification,
    payerName: p.payerName,
    accountNo: p.accountNo,
    billingAccountId: p.billingAccountId,
    flats: [...new Set(p.allocations.map((a) => a.unitCode))],
    amount: p.amount,
    allocated: money(allocated),
    unapplied: p.unapplied,
    receiptRef: p.receiptRef,
    reconciled: p.bankLineId !== undefined && lines.some((l) => l.id === p.bankLineId && l.state === 'matched'),
  };
}

const href = (base: string, q: Record<string, string>) => `${base}?${new URLSearchParams(q).toString()}`;

export function agingReport(view: SocietyView, today: string): AgingReport {
  const lines = linesOf(view.invoices);
  const byAccount = agingByAccount(lines, today);
  const credit = creditByAccount(view.state);
  const rows: AgingRow[] = [...new Set([...byAccount.keys(), ...credit.keys()])]
    .map((accountId) => {
      const a = view.model.accounts.find((x) => x.id === accountId);
      const b = byAccount.get(accountId) ?? emptyBuckets();
      return {
        billingAccountId: accountId,
        accountNo: a?.accountNo ?? '',
        holderName: a?.holderName ?? '',
        flats: view.model.flats.filter((f) => f.billingAccountId === accountId).map((f) => f.code),
        buckets: Object.fromEntries(AGING_BUCKETS.map((k) => [k, money(b[k])])) as AgingRow['buckets'],
        total: money(sum(Object.values(b))),
        credit: money(credit.get(accountId) ?? 0n),
      };
    })
    .sort((a, b) => toPaisa(b.total.amount) > toPaisa(a.total.amount) ? 1 : toPaisa(b.total.amount) < toPaisa(a.total.amount) ? -1 : a.accountNo.localeCompare(b.accountNo));
  const buckets = AGING_BUCKETS.map((key) => {
    const amounts = [...byAccount.values()].map((b) => b[key]).filter((v) => v > 0n);
    return { key, amount: money(sum(amounts)), accounts: amounts.length, href: href(ROUTES.aging, { bucket: key }) };
  });
  return {
    asOf: today,
    buckets,
    rows,
    total: money(sum([...byAccount.values()].map((b) => sum(Object.values(b))))),
    credit: { amount: money(sum(credit.values())), accounts: credit.size, href: ROUTES.credits },
  };
}

export function creditRows(view: SocietyView): CreditRow[] {
  const lines = linesOf(view.invoices);
  const byKey = new Map<string, CollectionPayment[]>();
  for (const p of view.state.payments.filter((x) => toPaisa(x.unapplied.amount) > 0n)) {
    const k = `${p.billingAccountId}|${p.payerPartyId}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  return [...byKey.values()].map((ps) => {
    const p = ps[0]!;
    return {
      billingAccountId: p.billingAccountId,
      accountNo: p.accountNo,
      payerPartyId: p.payerPartyId,
      payerName: p.payerName,
      flats: view.model.flats.filter((f) => f.billingAccountId === p.billingAccountId).map((f) => f.code),
      credit: money(sum(ps.map((x) => toPaisa(x.unapplied.amount)))),
      openLines: openLinesFor(lines, { partyId: p.payerPartyId, legalEntityId: p.legalEntityId, billingAccountId: p.billingAccountId }).length,
      payments: ps.map((x) => ({ id: x.id, ref: x.ref, unapplied: x.unapplied, receivedOn: x.receivedOn })),
    };
  });
}

/** Who a bank line probably belongs to: a waiting proof (amount and reference), else an account by payer name. */
function suggestionFor(view: SocietyView, line: BankLine): ReconciliationSummary['lines'][number]['suggestion'] {
  if (line.state !== 'unmatched') return undefined;
  // A waiting proof claims a line only when that line is its best free match: two transfers with the
  // same reference words ("MAINTENANCE NOV") are never both pinned on one proof.
  const sub = view.state.submissions.find((s) => {
    if (!PENDING_STATES.includes(s.state)) return false;
    const best = candidatesFor({ amount: s.current.amount.amount, transferDate: s.current.transferDate, bankReference: s.current.bankReference, payerName: s.payerName }, view.state.bank.lines).find((c) => !c.alreadyMatched);
    return best?.bankLine.id === line.id && best.reasons.includes('amount') && (best.reasons.includes('reference') || best.reasons.includes('name'));
  });
  if (sub) return { kind: 'submission', id: sub.id, label: sub.ref, href: ROUTES.review(sub.id) };
  const tokens = new Set(line.counterpartyName.toLocaleUpperCase('en').split(/\s+/).filter((w) => w.length > 1));
  const payer = view.facts.find((f) => f.role === 'payer' && f.to === undefined && f.partyName.toLocaleUpperCase('en').split(/\s+/).filter((w) => w.length > 1).every((w) => tokens.has(w)));
  if (payer?.billingAccountId) {
    const account = view.model.accounts.find((a) => a.id === payer.billingAccountId);
    return { kind: 'account', id: payer.billingAccountId, label: `${account?.accountNo ?? ''} · ${payer.partyName}`, href: ROUTES.statement(payer.billingAccountId) };
  }
  return undefined;
}

export function reconciliation(view: SocietyView): ReconciliationSummary {
  const { state } = view;
  const lines = state.bank.lines.map((l) => {
    const suggestion = suggestionFor(view, l);
    return suggestion ? { ...l, suggestion } : l;
  });
  const total = (ls: readonly BankLine[]) => ({ amount: money(sum(ls.map((l) => toPaisa(l.amount.amount)))), count: ls.length });
  const unmatched = lines.filter((l) => l.state === 'unmatched');
  const unidentified = unmatched.filter((l) => !('suggestion' in l));
  const awaiting = state.payments.filter((p) => !p.bankLineId && p.method === 'bank_transfer');
  return {
    statementCredits: money(sum(state.bank.statements.map((s) => toPaisa(s.credits.amount)))),
    matched: total(lines.filter((l) => l.state === 'matched')),
    unmatched: total(unmatched),
    unidentified: total(unidentified),
    excluded: total(lines.filter((l) => l.state === 'excluded')),
    awaitingBankLine: { amount: money(sum(awaiting.map((p) => toPaisa(p.amount.amount)))), count: awaiting.length },
    lines,
    payments: state.payments.map((p) => ({ id: p.id, ref: p.ref, amount: p.amount, method: p.method, verification: p.verification, payerName: p.payerName, accountNo: p.accountNo, receivedOn: p.receivedOn, ...(p.bankLineId ? { bankLineId: p.bankLineId } : {}) })),
  };
}

/** COL-001 and the manager's dashboard: billed, collected, pending, owed, arrears, credit, aging. */
export function collectionsSummary(s: { view: SocietyView }, today: string, opts: { bank: boolean }): CollectionsSummary {
  const { view } = s;
  const { state } = view;
  const period = collectionPeriod(state) ?? '';
  const lines = linesOf(view.invoices);
  const periodLines = lines.filter((l) => l.source === 'billing_run' && l.period === period);
  const periodLineIds = new Set(periodLines.map((l) => l.lineId));
  const billedOf = (ls: readonly OpenLine[]) => sum(ls.map((l) => toPaisa(view.invoices.find((i) => i.id === l.invoiceId)!.lines.find((x) => x.id === l.lineId)!.amount.amount)));
  const billed = billedOf(periodLines);
  const allocations = state.payments.flatMap((p) => p.allocations);
  const collectedForPeriod = sum(allocations.filter((a) => periodLineIds.has(a.lineId)).map((a) => toPaisa(a.amount.amount)));
  const received = sum(state.payments.map((p) => toPaisa(p.amount.amount)));

  const openByAccount = new Map<string, bigint>();
  const overdueByAccount = new Map<string, bigint>();
  for (const l of lines.filter((x) => x.open > 0n)) {
    openByAccount.set(l.billingAccountId, (openByAccount.get(l.billingAccountId) ?? 0n) + l.open);
    if (bucketOf(l.dueOn, today) !== 'current') overdueByAccount.set(l.billingAccountId, (overdueByAccount.get(l.billingAccountId) ?? 0n) + l.open);
  }
  const credit = creditByAccount(state);
  const pending = state.submissions.filter((x) => PENDING_STATES.includes(x.state));
  const aging = agingReport(view, today);
  const invoicesOfPeriod = view.invoices.filter((i) => i.source === 'billing_run' && i.period === period);

  return {
    site: { id: ALNOOR_SITE.id, name: ALNOOR_SITE.name, legalEntityName: ALNOOR_ENTITY.name },
    period,
    billed: { amount: money(billed), invoices: invoicesOfPeriod.length, href: href(ROUTES.invoices, { period, source: 'billing_run' }) },
    collected: { amount: money(received), payments: state.payments.length, href: ROUTES.payments },
    rate: billed > 0n ? Number((collectedForPeriod * 10000n) / billed) / 10000 : 0,
    progress: ((): CollectionsSummary['progress'] => {
      const left = billed - collectedForPeriod;
      const waiting = sum(pending.map((x) => toPaisa(x.current.amount.amount)));
      const pendingShare = waiting < left ? waiting : left;
      return { collected: money(collectedForPeriod), pending: money(pendingShare), owed: money(left - pendingShare) };
    })(),
    pending: { amount: money(sum(pending.map((x) => toPaisa(x.current.amount.amount)))), submissions: pending.length, href: ROUTES.inbox },
    outstanding: { amount: money(sum(openByAccount.values())), accounts: openByAccount.size, href: href(ROUTES.accounts, { status: 'owing' }) },
    arrears: { amount: money(sum(overdueByAccount.values())), accounts: overdueByAccount.size, href: href(ROUTES.accounts, { status: 'arrears' }) },
    credit: { amount: money(sum(credit.values())), accounts: credit.size, href: ROUTES.credits },
    aging: aging.buckets,
    queue: {
      toReview: state.submissions.filter((x) => x.state === 'submitted' || x.state === 'under_review').length,
      needsInformation: state.submissions.filter((x) => x.state === 'needs_information').length,
      href: href(ROUTES.inbox, { state: 'to_review' }),
      reviewHref: ((first) => (first ? ROUTES.review(first.id) : ROUTES.inbox))(state.submissions.find((x) => x.state === 'submitted' || x.state === 'under_review')),
    },
    bank: opts.bank
      ? {
          unmatched: state.bank.lines.filter((l) => l.state === 'unmatched').length,
          unidentified: reconciliation(view).unidentified.count,
          ...(state.bank.statements.length ? { lastImport: state.bank.statements.at(-1)!.importedAt } : {}),
          href: href(ROUTES.bankFeed, { state: 'unmatched' }),
        }
      : { unmatched: 0, unidentified: 0, href: '' },
    byBuilding: view.model.buildings.map((b) => {
      const flatIds = new Set(view.model.flats.filter((f) => f.buildingId === b.id).map((f) => f.id));
      const here = periodLines.filter((l) => flatIds.has(l.unitId));
      const hereIds = new Set(here.map((l) => l.lineId));
      const billedHere = billedOf(here);
      const collectedHere = sum(allocations.filter((a) => hereIds.has(a.lineId)).map((a) => toPaisa(a.amount.amount)));
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        billed: money(billedHere),
        collected: money(collectedHere),
        outstanding: money(sum(lines.filter((l) => flatIds.has(l.unitId) && l.open > 0n).map((l) => l.open))),
        rate: billedHere > 0n ? Number((collectedHere * 10000n) / billedHere) / 10000 : 0,
        href: href(ROUTES.accounts, { building: b.id, status: 'owing' }),
      };
    }),
    recent: [...state.payments].sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)).slice(0, 5).map((p) => paymentRow(p, state.bank.lines)),
  };
}
