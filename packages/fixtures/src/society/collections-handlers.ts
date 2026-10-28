import {
  type AgingReport,
  type BankFeed,
  type Beneficiary,
  type BeneficiaryChange,
  type CollectionSettings,
  type CollectionsSummary,
  type CreditRow,
  type DocumentKind,
  type MethodRule,
  type Money,
  type PaymentDetail,
  type PaymentList,
  type PaymentSubmission,
  type Receipt,
  type ReconciliationSummary,
  type SubmissionDetail,
  type SubmissionQueue,
  type SubmissionState,
  type MatchReason,
  SUBMISSION_STATES,
} from '@repo/contracts';
import { can, matches, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { tenantRole } from '../role-templates';
import { fromPaisa, toPaisa } from '../portal';
import { ALNOOR_ENTITY, DUE_DAY, ISSUE_DAY } from './alnoor';
import { allocateOldestFirst, checkAllocation, isRuleAllocation, linesOf, openLinesFor, toAllocationLines, type Allocation, type OpenLine } from './allocate';
import { applyCredit, recordPayment } from './collections';
import { agingReport, candidatesOf, collectionsSummary, creditRows, paymentRow, PENDING_STATES, possibleDuplicates, reconciliation, scopeOf, submissionRow } from './collections-read';
import { actor, invalidField, log, problem, save, siteOf, society, stamp, type Society } from './handlers';
import { fingerprint } from './import';
import { destinationOf, newLines, usable } from './matching';
import { DOCUMENT_KINDS, patternProblem } from './numbering';
import { declaredAccount, sampleBankStatements, statementFrom } from './scenario';
import { beneficiaryOn } from './state';

/**
 * Collections endpoints for staff (Gate C.2, A6 §5.4). Same fail-closed declarations as C.1. The
 * invariants are enforced here, not in forms:
 * - only independent settlement evidence creates a payment: a statement line of the issuing entity's
 *   account in force on the value date (fully matching; or partly matching through an exception a
 *   second person approves), or cash at the counter. A reviewer's note never settles anything: the
 *   proof waits for its bank line ("awaiting bank evidence"), not settled, allocated or receipted;
 * - statements are bound to the verified account the officer chooses (a file of another account is
 *   refused); a line that reached another account or entity never settles a proof;
 * - a bank transaction settles one payment (account, source and the bank's id decide; a shared
 *   reference never does);
 * - an allocation settles only the paying party's lines of the same entity and account; an edited
 *   allocation needs a reason; cross-payer and cross-entity allocations are refused;
 * - a new collection account needs a second person, then waits out the cooling-off period before
 *   residents see it; office cash follows the site's method rules and the staff permission.
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<T>;
const text = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

const READ_PROOFS = ['finance.evidence.review', 'collections.view'] as const;
const READ_MONEY = ['invoice.view', 'collections.view'] as const;

function amountIn(ctx: HandlerContext, field: string, raw: unknown): bigint {
  const v = String(raw ?? '').trim().replace(/,/g, '');
  if (!AMOUNT.test(v) || toPaisa(v) <= 0n) invalidField(ctx, field, 'collections:problems.amount');
  return toPaisa(v);
}

function submissionOf(ctx: HandlerContext, s: Society): PaymentSubmission {
  const sub = s.state.submissions.find((x) => x.id === ctx.params.submissionId);
  if (!sub || sub.siteId !== s.siteId) notFound(ctx);
  return sub;
}

const payerOf = (sub: Pick<PaymentSubmission, 'payerPartyId' | 'legalEntityId' | 'billingAccountId'>) => ({ partyId: sub.payerPartyId, legalEntityId: sub.legalEntityId, billingAccountId: sub.billingAccountId });

/** Every line of the tenant (to recognise and refuse lines of another payer or entity). */
const allLines = (s: Society) => linesOf(s.view.invoices);

function previewOf(lines: readonly OpenLine[], amount: bigint, allocations: readonly Allocation[], unapplied: bigint, edited: boolean) {
  void lines;
  return { amount: money(amount), lines: toAllocationLines(allocations), unapplied: money(unapplied), rule: 'oldest_first' as const, edited };
}

/** The allocation asked for: the rule's proposal, or an edited one checked against every boundary. */
function allocationFor(ctx: HandlerContext, s: Society, payer: ReturnType<typeof payerOf>, amount: bigint, raw: unknown, reasonRaw: unknown) {
  const open = openLinesFor(allLines(s), payer);
  if (!Array.isArray(raw)) {
    const rule = allocateOldestFirst(amount, open);
    return { ...rule, edited: false, overrideReason: undefined as string | undefined };
  }
  const proposed = (raw as Array<{ lineId?: string; amount?: unknown }>).map((p) => {
    const v = String(p.amount ?? '0').trim().replace(/,/g, '') || '0';
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) invalidField(ctx, `allocations.${p.lineId ?? ''}`, 'collections:problems.amount');
    return { lineId: String(p.lineId ?? ''), amount: toPaisa(v) };
  });
  const checked = checkAllocation(proposed, amount, allLines(s), payer);
  if (!checked.ok) {
    const status = checked.problem === 'cross_payer_forbidden' || checked.problem === 'cross_entity_forbidden' || checked.problem === 'cross_account_forbidden' ? 403 : 422;
    problem(ctx, status, checked.problem, `collections:problems.${checked.problem}`, checked.lineId ? { [`allocations.${checked.lineId}`]: [{ code: `collections:problems.${checked.problem}` }] } : undefined);
  }
  const edited = !isRuleAllocation(checked.allocations, amount, open);
  const reason = text(reasonRaw, 300);
  if (edited && reason.length < 5) invalidField(ctx, 'overrideReason', 'collections:problems.overrideReason');
  return { allocations: checked.allocations, unapplied: checked.unapplied, edited, overrideReason: edited ? reason : undefined };
}

/** States a reviewer can still decide from (an exception waiting for approval is decided by someone else). */
const WORKABLE: readonly SubmissionState[] = ['submitted', 'under_review', 'awaiting_bank_evidence'];

function submissionDetail(ctx: HandlerContext, s: Society, sub: PaymentSubmission): SubmissionDetail {
  const open = openLinesFor(allLines(s), payerOf(sub));
  const amount = toPaisa(sub.current.amount.amount);
  const rule = allocateOldestFirst(amount, open);
  const reviewer = can(ctx, 'finance.evidence.review');
  const workable = WORKABLE.includes(sub.state);
  const approver = can(ctx, 'payment_exception.approve');
  const mine = sub.exception?.requestedBy === ctx.persona?.principalId;
  const pending = sub.state === 'exception_pending';
  const reason = pending
    ? approver && mine
      ? ('maker_checker_required' as const)
      : approver
        ? undefined
        : ('permission_missing' as const)
    : !reviewer
      ? ('permission_missing' as const)
      : !workable
        ? ('invalid_state' as const)
        : undefined;
  return {
    submission: sub,
    candidates: candidatesOf(s.state, sub),
    allocation: previewOf(open, amount, rule.allocations, rule.unapplied, false),
    openLines: toAllocationLines(open.map((line) => ({ line, amount: 0n }))),
    possibleDuplicates: possibleDuplicates(s.state, sub).map((d) => ({ id: d.id, ref: d.ref, state: d.state })),
    beneficiary: beneficiaryOn(s.state, sub.legalEntityId, sub.current.transferDate),
    actions: {
      startReview: reviewer && sub.state === 'submitted',
      verify: reviewer && workable,
      awaitBank: reviewer && (sub.state === 'submitted' || sub.state === 'under_review'),
      requestException: reviewer && workable,
      decideException: approver && pending && !mine,
      requestInformation: reviewer && workable,
      reject: reviewer && workable,
      ...(reason ? { reason } : {}),
    },
  };
}

/**
 * The statement line a proof is to be settled against, checked on the server: it exists, is free (not
 * matched, excluded or held for another proof's exception), reached the issuing entity's account in
 * force on its value date, and carries the amount received. Returns the line and what it does not match.
 */
function settlementLine(ctx: HandlerContext, s: Society, sub: PaymentSubmission, lineId: string, amount: bigint) {
  const line = s.state.bank.lines.find((l) => l.id === lineId);
  if (!line) notFound(ctx);
  // The bank's transaction settles one payment, ever: a second match is refused, whoever asks.
  if (line.state === 'matched') {
    problem(ctx, 409, 'bank_line_already_matched', 'collections:problems.bankLineAlreadyMatched', { bankLineId: [{ code: 'collections:problems.bankLineAlreadyMatched', params: { payment: line.paymentRef ?? '', txn: line.bankTxnId } }] });
  }
  if (line.state === 'excluded') problem(ctx, 409, 'bank_line_excluded', 'collections:problems.bankLineExcluded');
  if (line.heldFor && line.heldFor.submissionId !== sub.id) {
    problem(ctx, 409, 'bank_line_held', 'collections:problems.bankLineHeld', { bankLineId: [{ code: 'collections:problems.bankLineHeld', params: { ref: line.heldFor.submissionRef } }] });
  }
  const destination = destinationOf(line, scopeOf(s.state, sub.legalEntityId));
  if (destination === 'wrong_entity') problem(ctx, 403, 'cross_entity_forbidden', 'collections:problems.cross_entity_forbidden');
  if (destination === 'wrong_account') {
    problem(ctx, 422, 'wrong_destination', 'collections:problems.wrongDestination', { bankLineId: [{ code: 'collections:problems.wrongDestination', params: { iban: line.accountIban, txn: line.bankTxnId } }] });
  }
  if (toPaisa(line.amount.amount) !== amount) invalidField(ctx, 'amount', 'collections:problems.amountMismatch', { bank: line.amount.amount });
  const candidate = candidatesOf(s.state, sub).find((c) => c.bankLine.id === line.id);
  const missing: MatchReason[] = candidate ? candidate.missing : ['amount', 'date', 'reference', 'name'];
  return { line, missing };
}

function paymentDetail(s: Society, paymentId: string, ctx: HandlerContext): PaymentDetail {
  const payment = s.state.payments.find((p) => p.id === paymentId);
  if (!payment) notFound(ctx);
  const receipt = s.state.receipts.find((r) => r.id === payment.receiptId)!;
  const submission = payment.source.kind === 'submission' ? s.state.submissions.find((x) => x.id === (payment.source as { submissionId: string }).submissionId) : undefined;
  const bankLine = payment.bankLineId ? s.state.bank.lines.find((l) => l.id === payment.bankLineId) : undefined;
  const targets = openLinesFor(allLines(s), { partyId: payment.payerPartyId, legalEntityId: payment.legalEntityId, billingAccountId: payment.billingAccountId });
  const balance = viewBalance(s, payment.billingAccountId);
  return {
    payment,
    receipt,
    ...(submission ? { submission } : {}),
    ...(bankLine ? { bankLine } : {}),
    accountBalance: money(balance),
    creditTargets: toAllocationLines(targets.map((line) => ({ line, amount: 0n }))),
    actions: { applyCredit: can(ctx, 'finance.evidence.review') && toPaisa(payment.unapplied.amount) > 0n && targets.length > 0 },
  };
}

function viewBalance(s: Society, accountId: string): bigint {
  const open = allLines(s).filter((l) => l.billingAccountId === accountId).reduce((n, l) => n + l.open, 0n);
  const credit = s.state.payments.filter((p) => p.billingAccountId === accountId).reduce((n, p) => n + toPaisa(p.unapplied.amount), 0n);
  return open - credit;
}

const decided = (sub: PaymentSubmission, ctx: HandlerContext, action: PaymentSubmission['history'][number]['action'], note?: string) => {
  const { by, byName } = actor(ctx);
  sub.history.push({ at: stamp(ctx), by, byName, byKind: 'staff', action, ...(note ? { note } : {}) });
};

/** Records the payment and receipt for a proof against its statement line (after every check passed). */
function settle(
  ctx: HandlerContext,
  s: Society,
  sub: PaymentSubmission,
  line: Society['state']['bank']['lines'][number],
  amount: bigint,
  a: ReturnType<typeof allocationFor>,
  verification: 'bank_matched' | 'exception_approved',
  exception?: NonNullable<PaymentDetail['payment']['exception']>,
) {
  const { by, byName } = actor(ctx);
  const { payment, receipt } = recordPayment(s.state, {
    at: stamp(ctx),
    receivedOn: line.valueDate,
    by: { principalId: by, name: byName },
    account: { id: sub.billingAccountId, accountNo: sub.accountNo },
    payer: { partyId: sub.payerPartyId, name: sub.payerName },
    flats: sub.flats,
    method: 'bank_transfer',
    amount,
    allocations: a.allocations,
    unapplied: a.unapplied,
    source: { kind: 'submission', submissionId: sub.id, submissionRef: sub.ref },
    verification,
    ...(exception ? { exception } : {}),
    ...(a.overrideReason ? { overrideReason: a.overrideReason } : {}),
    bankLine: line,
    bankReference: sub.current.bankReference,
  });
  Object.assign(sub, { state: 'verified', paymentId: payment.id, paymentRef: payment.ref, receiptId: receipt.id, receiptRef: receipt.ref });
  delete sub.request;
  delete sub.exception;
  decided(sub, ctx, 'verified');
  log(ctx, s, verification === 'bank_matched' ? 'proofVerified' : 'paymentExceptionApproved', { kind: 'submission', id: sub.id, label: sub.ref }, {
    flats: sub.flats,
    values: { amount: payment.amount.amount, payment: payment.ref, receipt: receipt.ref, bank: line.bankTxnId, account: line.accountIban, ...(exception ? { reason: exception.reason, missing: exception.missing.join(', ') } : {}), ...(a.overrideReason ? { override: a.overrideReason } : {}), unapplied: payment.unapplied.amount },
  });
  save(ctx);
  return payment;
}

function settings(ctx: HandlerContext, s: Society): CollectionSettings {
  const payee = beneficiaryOn(s.state, s.legalEntityId, ctx.at);
  const eligible = ['administrator', 'treasurer', 'accounts_officer']
    .map((id) => {
      try {
        const r = tenantRole(ctx.tenantId!, id);
        return r.permissions.includes('billing_run.post') ? { id: r.id, labelKey: r.labelKey } : null;
      } catch {
        return null;
      }
    })
    .filter((r): r is { id: string; labelKey: string } => r !== null);
  return {
    siteId: s.siteId,
    legalEntityId: s.legalEntityId,
    legalEntityName: ALNOOR_ENTITY.name,
    issueDay: ISSUE_DAY,
    dueDay: DUE_DAY,
    graceDays: 0,
    allocation: 'oldest_first',
    invoiceGrouping: 'account_payer',
    lateFees: 'not_configured',
    reminders: 'later',
    payee,
    history: s.state.beneficiaries.filter((b) => b.id !== payee?.id).sort((a, b) => (b.activeFrom ?? '').localeCompare(a.activeFrom ?? '')),
    changes: [...s.state.beneficiaryChanges].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt)),
    coolingOffDays: s.state.coolingOffDays,
    methods: s.state.methods,
    numbering: s.state.numbering,
    posting: { ...s.state.posting, eligibleRoles: eligible },
    actions: {
      proposeBeneficiary: can(ctx, 'beneficiary.manage'),
      approveBeneficiary: can(ctx, 'beneficiary.approve'),
      manageMethods: can(ctx, 'payment_methods.manage'),
      manageNumbering: can(ctx, 'billing_policy.manage'),
      managePosting: can(ctx, 'billing_policy.manage'),
    },
  };
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Fictional accounts only: Pakistani IBAN shape with the DEMO bank code (a real bank code is refused). */
const IBAN = /^PK\d{2}DEMO\d{16}$/;

export const COLLECTIONS_HANDLERS: readonly Handler[] = [
  // -------------------------------------------------------------------------------------------
  // Reporting (COL-001, COL-005, FIN-011)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/collections\/summary$/,
    access: requires('receivables', 'collections.view', 'history_read'),
    handle: (ctx): CollectionsSummary => collectionsSummary(siteOf(ctx, 'receivables'), ctx.at, { bank: can(ctx, 'bank.view', 'history_read') }),
  },
  {
    method: 'GET',
    pattern: /^\/collections\/aging$/,
    access: requires('receivables', 'collections.view', 'history_read'),
    handle: (ctx): AgingReport => {
      const s = siteOf(ctx, 'receivables');
      const report = agingReport(s.view, ctx.at);
      const { bucket, q } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const rows = report.rows
        .filter((r) => !bucket || bucket === 'all' || (bucket === 'credit' ? toPaisa(r.credit.amount) > 0n : toPaisa(r.buckets[bucket as keyof typeof r.buckets]?.amount ?? '0') > 0n))
        .filter((r) => !q || !q.trim() || matches(q.trim(), r.accountNo, r.holderName, ...r.flats));
      return { ...report, rows };
    },
  },
  {
    method: 'GET',
    pattern: /^\/collections\/credits$/,
    access: requires('receivables', READ_PROOFS, 'history_read'),
    handle: (ctx): CreditRow[] => creditRows(siteOf(ctx, 'receivables').view),
  },
  // -------------------------------------------------------------------------------------------
  // Proof inbox and review (FIN-008, FIN-009)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/payment-submissions$/,
    access: requires('receivables', READ_PROOFS, 'history_read'),
    handle: (ctx): SubmissionQueue => {
      if (!ctx.data.society) return { items: [], counts: Object.fromEntries(SUBMISSION_STATES.map((k) => [k, 0])) as SubmissionQueue['counts'], pending: money(0n) };
      const s = siteOf(ctx, 'receivables');
      const { state, q, account } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const wanted = (x: SubmissionState) =>
        !state || state === 'all' ? true : state === 'to_review' ? x === 'submitted' || x === 'under_review' : state === 'pending' ? PENDING_STATES.includes(x) : x === state;
      const counts = Object.fromEntries(SUBMISSION_STATES.map((k) => [k, s.state.submissions.filter((x) => x.state === k).length])) as SubmissionQueue['counts'];
      const items = s.state.submissions
        .filter((x) => wanted(x.state))
        .filter((x) => !account || x.billingAccountId === account)
        .filter((x) => !q || !q.trim() || matches(q.trim(), x.ref, x.accountNo, x.payerName, x.current.bankReference, ...x.flats))
        // Oldest first: the queue is worked in the order residents sent their proofs.
        .sort((a, b) => a.current.submittedAt.localeCompare(b.current.submittedAt))
        .map((x) => submissionRow(s.state, x));
      const pending = s.state.submissions.filter((x) => PENDING_STATES.includes(x.state)).reduce((n, x) => n + toPaisa(x.current.amount.amount), 0n);
      return { items, counts, pending: money(pending) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)$/,
    access: requires('receivables', READ_PROOFS, 'history_read'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      return submissionDetail(ctx, s, submissionOf(ctx, s));
    },
  },
  {
    // Opening a proof marks it as being reviewed (others see who); nothing about the money changes.
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/review$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (sub.state === 'submitted') {
        sub.state = 'under_review';
        sub.reviewer = { principalId: ctx.persona!.principalId, name: ctx.persona!.displayName };
        decided(sub, ctx, 'review_started');
        log(ctx, s, 'proofReviewStarted', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats });
        save(ctx);
      }
      return submissionDetail(ctx, s, sub);
    },
  },
  {
    // What a given amount would settle (the rule's proposal, or an edited allocation checked).
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/allocation$/,
    access: requires('receivables', 'finance.evidence.review', 'history_read'),
    handle: (ctx) => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      const input = body<{ amount: string; allocations: unknown; overrideReason: string }>(ctx);
      const amount = amountIn(ctx, 'amount', input.amount);
      const a = allocationFor(ctx, s, payerOf(sub), amount, input.allocations, input.overrideReason ?? 'preview');
      return previewOf([], amount, a.allocations, a.unapplied, a.edited);
    },
  },
  {
    // Settles a proof against a fully matching statement line of the right account. Nothing else does:
    // without a line the proof waits (await-bank); a partly matching line needs an approved exception.
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/verify$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): PaymentDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (sub.state === 'verified') problem(ctx, 409, 'already_verified', 'collections:problems.alreadyVerified');
      if (!WORKABLE.includes(sub.state)) problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const input = body<{ bankLineId: string; amount: string; allocations: unknown; overrideReason: string }>(ctx);
      // A typed reason is not evidence of funds: verification always names the bank line.
      if (!input.bankLineId) problem(ctx, 422, 'bank_evidence_required', 'collections:problems.bankEvidenceRequired', { bankLineId: [{ code: 'collections:problems.bankEvidenceRequired' }] });
      const amount = amountIn(ctx, 'amount', input.amount);
      const { line, missing } = settlementLine(ctx, s, sub, input.bankLineId!, amount);
      if (missing.length) {
        problem(ctx, 409, 'exception_required', 'collections:problems.exceptionRequired', { bankLineId: [{ code: 'collections:problems.exceptionRequired', params: { missing: missing.join(', ') } }] });
      }
      const a = allocationFor(ctx, s, payerOf(sub), amount, input.allocations, input.overrideReason);
      const payment = settle(ctx, s, sub, line, amount, a, 'bank_matched');
      return paymentDetail(society(ctx), payment.id, ctx);
    },
  },
  {
    // Reviewed, but the money is not on any imported statement yet: wait for the line. Nothing is
    // settled, allocated or receipted; the resident still sees "pending verification".
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/await-bank$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (sub.state !== 'submitted' && sub.state !== 'under_review') problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const note = text(body<{ note: string }>(ctx).note, 300);
      if (note.length < 10) invalidField(ctx, 'note', 'collections:problems.awaitNote');
      const { by, byName } = actor(ctx);
      sub.state = 'awaiting_bank_evidence';
      sub.awaiting = { by, byName, at: stamp(ctx), note };
      delete sub.reviewer;
      decided(sub, ctx, 'awaiting_bank_evidence', note);
      log(ctx, s, 'proofAwaitingBank', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { amount: sub.current.amount.amount, note } });
      save(ctx);
      return submissionDetail(ctx, s, sub);
    },
  },
  {
    // A partly matching line (another reference, name or date; or another amount than claimed) is
    // proposed with a reason and held for this proof until a second person decides.
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/exception$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (!WORKABLE.includes(sub.state)) problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const input = body<{ bankLineId: string; reason: string; allocations: unknown; overrideReason: string }>(ctx);
      if (!input.bankLineId) problem(ctx, 422, 'bank_evidence_required', 'collections:problems.bankEvidenceRequired', { bankLineId: [{ code: 'collections:problems.bankEvidenceRequired' }] });
      const target = s.state.bank.lines.find((l) => l.id === input.bankLineId);
      if (!target) notFound(ctx);
      const amount = toPaisa(target.amount.amount);
      const { line, missing } = settlementLine(ctx, s, sub, target.id, amount);
      if (!missing.length) problem(ctx, 409, 'exception_not_needed', 'collections:problems.exceptionNotNeeded');
      const reason = text(input.reason, 500);
      if (reason.length < 20) invalidField(ctx, 'reason', 'collections:problems.exceptionReason');
      // The allocation is checked now (and again at approval) against the payer's own lines.
      const a = allocationFor(ctx, s, payerOf(sub), amount, input.allocations, input.overrideReason);
      const { by, byName } = actor(ctx);
      sub.exception = {
        bankLineId: line.id,
        bankTxnId: line.bankTxnId,
        missing,
        reason,
        ...(a.edited ? { allocations: a.allocations.map((x) => ({ lineId: x.line.lineId, amount: fromPaisa(x.amount) })), overrideReason: a.overrideReason } : {}),
        requestedBy: by,
        requestedByName: byName,
        requestedAt: stamp(ctx),
      };
      sub.state = 'exception_pending';
      line.heldFor = { submissionId: sub.id, submissionRef: sub.ref };
      decided(sub, ctx, 'exception_requested', reason);
      log(ctx, s, 'paymentExceptionRequested', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { bank: line.bankTxnId, amount: line.amount.amount, missing: missing.join(', '), reason } });
      save(ctx);
      return submissionDetail(ctx, s, sub);
    },
  },
  {
    // A second person (never the requester) approves the exception, which settles the proof against
    // the held line, or rejects it, which releases the line and returns the proof to review.
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/exception\/(?<decision>[\w-]+)$/,
    access: requires('receivables', 'payment_exception.approve', 'operational'),
    handle: (ctx): SubmissionDetail | PaymentDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      const decision = ctx.params.decision!;
      if (decision !== 'approve' && decision !== 'reject') notFound(ctx);
      if (sub.state !== 'exception_pending' || !sub.exception) problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const exception = sub.exception!;
      if (exception.requestedBy === ctx.persona!.principalId) problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
      const line = s.state.bank.lines.find((l) => l.id === exception.bankLineId);
      if (decision === 'reject') {
        const note = text(body<{ note: string }>(ctx).note, 300);
        if (note.length < 5) invalidField(ctx, 'note', 'billing:errors.noteRequired');
        if (line?.heldFor?.submissionId === sub.id) delete line.heldFor;
        sub.state = sub.awaiting ? 'awaiting_bank_evidence' : 'under_review';
        delete sub.exception;
        decided(sub, ctx, 'exception_rejected', note);
        log(ctx, s, 'paymentExceptionRejected', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { bank: exception.bankTxnId, note } });
        save(ctx);
        return submissionDetail(ctx, s, sub);
      }
      if (!line) notFound(ctx);
      const amount = toPaisa(line.amount.amount);
      // Everything is checked again: the line may have been settled or excluded since the request.
      settlementLine(ctx, s, sub, line.id, amount);
      const a = allocationFor(ctx, s, payerOf(sub), amount, exception.allocations, exception.overrideReason);
      const { by, byName } = actor(ctx);
      decided(sub, ctx, 'exception_approved', exception.reason);
      const payment = settle(ctx, s, sub, line, amount, a, 'exception_approved', {
        missing: exception.missing,
        reason: exception.reason,
        requestedBy: exception.requestedBy,
        requestedByName: exception.requestedByName,
        approvedBy: by,
        approvedByName: byName,
        approvedAt: stamp(ctx),
      });
      return paymentDetail(society(ctx), payment.id, ctx);
    },
  },
  {
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/request-information$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (!WORKABLE.includes(sub.state)) problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const message = text(body<{ message: string }>(ctx).message, 300);
      if (message.length < 10) invalidField(ctx, 'message', 'collections:problems.messageRequired');
      sub.state = 'needs_information';
      sub.request = message;
      delete sub.reviewer;
      decided(sub, ctx, 'information_requested', message);
      log(ctx, s, 'proofInformationRequested', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { message } });
      save(ctx);
      return submissionDetail(ctx, s, sub);
    },
  },
  {
    method: 'POST',
    pattern: /^\/payment-submissions\/(?<submissionId>[\w-]+)\/reject$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): SubmissionDetail => {
      const s = siteOf(ctx, 'receivables');
      const sub = submissionOf(ctx, s);
      if (!WORKABLE.includes(sub.state)) problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const reason = text(body<{ reason: string }>(ctx).reason, 300);
      if (reason.length < 10) invalidField(ctx, 'reason', 'collections:problems.reasonRequired');
      sub.state = 'rejected';
      sub.rejectionReason = reason;
      delete sub.reviewer;
      decided(sub, ctx, 'rejected', reason);
      log(ctx, s, 'proofRejected', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { reason } });
      save(ctx);
      return submissionDetail(ctx, s, sub);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Payments, receipts, office cash, unapplied credit (FIN-005/006/007/011)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/payments$/,
    access: requires('receivables', READ_MONEY, 'history_read'),
    handle: (ctx): PaymentList => {
      if (!ctx.data.society) return { items: [], totals: { amount: money(0n), allocated: money(0n), unapplied: money(0n), count: 0 } };
      const s = siteOf(ctx, 'receivables');
      const { q, method, verification, account, credit } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const rows = s.state.payments
        .filter((p) => !method || method === 'all' || p.method === method)
        .filter((p) => !verification || verification === 'all' || p.verification === verification)
        .filter((p) => !account || p.billingAccountId === account)
        .filter((p) => credit !== '1' || toPaisa(p.unapplied.amount) > 0n)
        .filter((p) => !q || !q.trim() || matches(q.trim(), p.ref, p.receiptRef, p.accountNo, p.payerName, ...p.allocations.map((a) => a.unitCode)))
        .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.ref.localeCompare(a.ref))
        .map((p) => paymentRow(p, s.state.bank.lines));
      const total = (pick: (r: (typeof rows)[number]) => Money) => money(rows.reduce((n, r) => n + toPaisa(pick(r).amount), 0n));
      return { items: rows, totals: { amount: total((r) => r.amount), allocated: total((r) => r.allocated), unapplied: total((r) => r.unapplied), count: rows.length } };
    },
  },
  {
    method: 'GET',
    pattern: /^\/payments\/(?<paymentId>[\w-]+)$/,
    access: requires('receivables', READ_MONEY, 'history_read'),
    handle: (ctx): PaymentDetail => paymentDetail(siteOf(ctx, 'receivables'), ctx.params.paymentId!, ctx),
  },
  {
    method: 'GET',
    pattern: /^\/receipts\/(?<receiptId>[\w-]+)$/,
    access: requires('receivables', READ_MONEY, 'history_read'),
    handle: (ctx): Receipt => {
      const s = siteOf(ctx, 'receivables');
      return s.state.receipts.find((r) => r.id === ctx.params.receiptId) ?? notFound(ctx);
    },
  },
  {
    // What office cash would settle (the same rule verification uses), before anything is recorded.
    method: 'GET',
    pattern: /^\/payment-previews\/office$/,
    access: requires('receivables', 'payment.receive', 'history_read'),
    handle: (ctx) => {
      const s = siteOf(ctx, 'receivables');
      const { account, payer, amount } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      if (!s.view.model.accounts.some((a) => a.id === account)) notFound(ctx);
      const value = amountIn(ctx, 'amount', amount);
      const rule = allocateOldestFirst(value, openLinesFor(allLines(s), { partyId: String(payer ?? ''), legalEntityId: s.legalEntityId, billingAccountId: account! }));
      return previewOf([], value, rule.allocations, rule.unapplied, false);
    },
  },
  {
    // FIN-007: money handed over at the society office. The site's method rules and the staff
    // permission decide; the counter confirms the cash, so the receipt is issued at once.
    method: 'POST',
    pattern: /^\/payments\/office$/,
    access: requires('receivables', 'payment.receive', 'operational'),
    handle: (ctx): PaymentDetail => {
      const s = siteOf(ctx, 'receivables');
      const rule = s.state.methods.find((m) => m.method === 'office_cash');
      if (!rule?.enabled) problem(ctx, 409, 'method_not_allowed', 'collections:problems.methodNotAllowed');
      const input = body<{ accountId: string; payerPartyId: string; amount: string; allocations: unknown; overrideReason: string; note: string }>(ctx);
      const account = s.view.model.accounts.find((a) => a.id === input.accountId);
      if (!account) invalidField(ctx, 'accountId', 'collections:problems.account');
      const payers = new Set([...s.view.facts.filter((f) => f.role === 'payer' && f.billingAccountId === account!.id).map((f) => f.partyId)]);
      if (!input.payerPartyId || !payers.has(input.payerPartyId)) invalidField(ctx, 'payerPartyId', 'collections:problems.payer');
      const amount = amountIn(ctx, 'amount', input.amount);
      if (rule!.maxAmount && amount > toPaisa(rule!.maxAmount.amount)) invalidField(ctx, 'amount', 'collections:problems.overCashLimit', { limit: rule!.maxAmount.amount });
      const payer = { partyId: input.payerPartyId!, legalEntityId: s.legalEntityId, billingAccountId: account!.id };
      const a = allocationFor(ctx, s, payer, amount, input.allocations, input.overrideReason);
      const person = s.view.model.people.find((p) => p.id === input.payerPartyId)!;
      const { by, byName } = actor(ctx);
      const note = text(input.note, 200);
      const { payment } = recordPayment(s.state, {
        at: stamp(ctx),
        receivedOn: ctx.at,
        by: { principalId: by, name: byName },
        account: { id: account!.id, accountNo: account!.accountNo },
        payer: { partyId: person.id, name: person.displayName },
        flats: s.view.model.flats.filter((f) => f.billingAccountId === account!.id).map((f) => f.code),
        method: 'office_cash',
        amount,
        allocations: a.allocations,
        unapplied: a.unapplied,
        source: { kind: 'office', ...(note ? { note } : {}) },
        verification: 'counter',
        ...(a.overrideReason ? { overrideReason: a.overrideReason } : {}),
      });
      log(ctx, s, 'officeCashReceived', { kind: 'payment', id: payment.id, label: payment.ref }, { flats: [...new Set(payment.allocations.map((x) => x.unitCode))], values: { amount: payment.amount.amount, receipt: payment.receiptRef, account: account!.accountNo, unapplied: payment.unapplied.amount } });
      save(ctx);
      return paymentDetail(society(ctx), payment.id, ctx);
    },
  },
  {
    // Unapplied credit settles the same payer's open lines (oldest first, or as chosen with a reason).
    method: 'POST',
    pattern: /^\/payments\/(?<paymentId>[\w-]+)\/apply-credit$/,
    access: requires('receivables', 'finance.evidence.review', 'operational'),
    handle: (ctx): PaymentDetail => {
      const s = siteOf(ctx, 'receivables');
      const payment = s.state.payments.find((p) => p.id === ctx.params.paymentId);
      if (!payment) notFound(ctx);
      const credit = toPaisa(payment.unapplied.amount);
      if (credit <= 0n) problem(ctx, 409, 'no_credit', 'collections:problems.noCredit');
      const input = body<{ allocations: unknown; overrideReason: string }>(ctx);
      const a = allocationFor(ctx, s, { partyId: payment.payerPartyId, legalEntityId: payment.legalEntityId, billingAccountId: payment.billingAccountId }, credit, input.allocations, input.overrideReason);
      if (!a.allocations.length) problem(ctx, 409, 'nothing_open', 'collections:problems.nothingOpen');
      applyCredit(payment, a.allocations, a.unapplied, stamp(ctx));
      log(ctx, s, 'creditApplied', { kind: 'payment', id: payment.id, label: payment.ref }, { flats: [...new Set(a.allocations.map((x) => x.line.unitCode))], values: { amount: fromPaisa(credit - a.unapplied), left: payment.unapplied.amount } });
      save(ctx);
      return paymentDetail(society(ctx), payment.id, ctx);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Bank feed and reconciliation (BANK-003, BANK-004)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/bank\/feed$/,
    access: requires('banking', 'bank.view', 'history_read'),
    handle: (ctx): BankFeed => {
      if (!ctx.data.society) return { statements: [], lines: [], accounts: [], counts: { all: 0, unmatched: 0, matched: 0, excluded: 0, unidentified: 0 } };
      const s = siteOf(ctx);
      const rec = reconciliation(s.view);
      const { state, q } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const unidentified = new Set(rec.lines.filter((l) => l.state === 'unmatched' && !('suggestion' in l)).map((l) => l.id));
      const lines = rec.lines
        .filter((l) => !state || state === 'all' || (state === 'unidentified' ? unidentified.has(l.id) : l.state === state))
        .filter((l) => !q || !q.trim() || matches(q.trim(), l.bankTxnId, l.reference, l.narration, l.counterpartyName, l.paymentRef))
        .sort((a, b) => b.valueDate.localeCompare(a.valueDate) || a.bankTxnId.localeCompare(b.bankTxnId));
      const all = s.state.bank.lines;
      return {
        statements: [...s.state.bank.statements].reverse(),
        accounts: s.state.beneficiaries.filter((b) => b.legalEntityId === s.legalEntityId && b.verifiedOn !== undefined),
        lines,
        counts: { all: all.length, unmatched: all.filter((l) => l.state === 'unmatched').length, matched: all.filter((l) => l.state === 'matched').length, excluded: all.filter((l) => l.state === 'excluded').length, unidentified: unidentified.size },
      };
    },
  },
  {
    // Importing a statement twice, or a statement overlapping an earlier one, adds nothing twice.
    method: 'POST',
    pattern: /^\/bank\/statements$/,
    access: requires('banking', 'bank.reconcile', 'operational'),
    handle: (ctx) => {
      const s = siteOf(ctx);
      const input = body<{ sample: number; fileName: string; content: string; from: string; to: string; beneficiaryId: string }>(ctx);
      // The statement belongs to the account the officer chooses: one of this entity's verified accounts.
      const account = s.state.beneficiaries.find((b) => b.id === input.beneficiaryId && b.legalEntityId === s.legalEntityId && b.siteId === s.siteId && b.verifiedOn !== undefined);
      if (!account) invalidField(ctx, 'beneficiaryId', 'collections:problems.statementAccount');
      const sample = input.sample ? sampleBankStatements()[Number(input.sample) - 1] : undefined;
      const file = sample ?? { fileName: text(input.fileName, 120) || 'statement.csv', content: String(input.content ?? ''), from: String(input.from ?? ctx.at), to: String(input.to ?? ctx.at) };
      if (!file.content.trim()) invalidField(ctx, 'file', 'collections:problems.fileEmpty');
      if (!DATE.test(file.from) || !DATE.test(file.to)) invalidField(ctx, 'file', 'collections:problems.fileDates');
      // A statement that names another account is refused, never silently assigned.
      const declared = declaredAccount(file.content);
      if (declared && declared !== account!.iban) {
        problem(ctx, 422, 'statement_account_mismatch', 'collections:problems.statementAccountMismatch', { beneficiaryId: [{ code: 'collections:problems.statementAccountMismatch', params: { file: declared, chosen: account!.iban } }] });
      }
      const hash = fingerprint(file.content);
      const known = s.state.bank.statements.find((x) => x.fileHash === hash && x.beneficiaryId === account!.id);
      if (known) return { statement: known, created: 0, skipped: known.lines, alreadyImported: true, nowMatchable: [] };
      const { by, byName } = actor(ctx);
      const built = statementFrom(s.state, file, account!, stamp(ctx), { principalId: by, name: byName });
      if (built.lines.some((l) => !l.bankTxnId || !DATE.test(l.valueDate) || toPaisa(l.amount.amount) <= 0n)) invalidField(ctx, 'file', 'collections:problems.fileRows');
      const fresh = newLines(s.state.bank.lines, built.lines);
      const statement = { ...built.statement, lines: fresh.length, credits: money(fresh.reduce((n, l) => n + toPaisa(l.amount.amount), 0n)) };
      s.state.bank.statements.push(statement);
      s.state.bank.lines.push(...fresh);
      log(ctx, s, 'bankStatementImported', { kind: 'bank', id: statement.id, label: statement.fileName }, { values: { account: statement.iban, lines: String(fresh.length), credits: statement.credits.amount, skipped: String(built.lines.length - fresh.length) } });
      save(ctx);
      // Proofs waiting for their bank line that the new lines fully match (offered to the officer, never settled here).
      const freshIds = new Set(fresh.map((l) => l.id));
      const nowMatchable = s.state.submissions
        .filter((x) => WORKABLE.includes(x.state))
        .filter((x) => candidatesOf(s.state, x).some((c) => freshIds.has(c.bankLine.id) && usable(c, x.id) && c.strength === 'full'))
        .map((x) => ({ id: x.id, ref: x.ref, flats: x.flats, state: x.state }));
      return { statement, created: fresh.length, skipped: built.lines.length - fresh.length, alreadyImported: false, nowMatchable };
    },
  },
  {
    method: 'GET',
    pattern: /^\/bank\/reconciliation$/,
    access: requires('banking', 'bank.view', 'history_read'),
    handle: (ctx): ReconciliationSummary => reconciliation(siteOf(ctx).view),
  },
  {
    // Set aside a line that is not a resident payment (with the reason); it can be restored.
    method: 'POST',
    pattern: /^\/bank\/lines\/(?<lineId>[\w-]+)\/(?<decision>[\w-]+)$/,
    access: requires('banking', 'bank.reconcile', 'operational'),
    handle: (ctx) => {
      const s = siteOf(ctx);
      const line = s.state.bank.lines.find((l) => l.id === ctx.params.lineId);
      if (!line || !['exclude', 'restore'].includes(ctx.params.decision!)) notFound(ctx);
      if (line.state === 'matched') problem(ctx, 409, 'bank_line_already_matched', 'collections:problems.bankLineAlreadyMatched', { lineId: [{ code: 'collections:problems.bankLineAlreadyMatched', params: { payment: line.paymentRef ?? '', txn: line.bankTxnId } }] });
      if (ctx.params.decision === 'exclude') {
        const reason = text(body<{ reason: string }>(ctx).reason, 200);
        if (reason.length < 5) invalidField(ctx, 'reason', 'collections:problems.reasonRequired');
        Object.assign(line, { state: 'excluded', excludedReason: reason });
      } else {
        line.state = 'unmatched';
        delete line.excludedReason;
      }
      log(ctx, s, ctx.params.decision === 'exclude' ? 'bankLineExcluded' : 'bankLineRestored', { kind: 'bank', id: line.id, label: line.bankTxnId }, { values: { amount: line.amount.amount, ...(line.excludedReason ? { reason: line.excludedReason } : {}) } });
      save(ctx);
      return line;
    },
  },
  // -------------------------------------------------------------------------------------------
  // Collection account, method rules, numbering and posting policy (BILL-010, BILL-012)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/collection-settings$/,
    access: requires('receivables', ['invoice.view', 'site.view', 'collections.view'], 'history_read'),
    handle: (ctx): CollectionSettings => settings(ctx, siteOf(ctx, 'receivables')),
  },
  {
    // Propose a new collection account. Verified by a second person, shown to residents only after cooling-off.
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/beneficiary-changes$/,
    access: requires('banking', 'beneficiary.manage', 'operational'),
    handle: (ctx): CollectionSettings => {
      const s = siteOf(ctx);
      const input = body<{ bankName: string; branch: string; accountTitle: string; iban: string; reason: string; verification: string }>(ctx);
      const iban = String(input.iban ?? '').replace(/\s+/g, '').toUpperCase();
      const errors: Record<string, Array<{ code: string }>> = {};
      if (text(input.bankName, 80).length < 2) errors.bankName = [{ code: 'forms:errors.required' }];
      if (text(input.branch, 80).length < 2) errors.branch = [{ code: 'forms:errors.required' }];
      if (text(input.accountTitle, 120).length < 3) errors.accountTitle = [{ code: 'forms:errors.required' }];
      if (!IBAN.test(iban)) errors.iban = [{ code: 'collections:problems.iban' }];
      if (text(input.reason, 300).length < 10) errors.reason = [{ code: 'collections:problems.reasonRequired' }];
      if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
      const current = beneficiaryOn(s.state, s.legalEntityId, ctx.at);
      if (current?.iban === iban) invalidField(ctx, 'iban', 'collections:problems.ibanSame');
      if (s.state.beneficiaryChanges.some((c) => c.state === 'pending_approval' || c.state === 'cooling_off')) problem(ctx, 409, 'change_pending', 'collections:problems.changePending');
      const { by, byName } = actor(ctx);
      s.state.seq += 1;
      const change: BeneficiaryChange = {
        id: `bch_anr_s${s.state.seq}`,
        siteId: s.siteId,
        legalEntityId: s.legalEntityId,
        proposed: { bankName: text(input.bankName, 80), branch: text(input.branch, 80), accountTitle: text(input.accountTitle, 120), iban },
        reason: text(input.reason, 300),
        verification: input.verification === 'bank_letter_checked' ? 'bank_letter_checked' : 'not_checked',
        state: 'pending_approval',
        proposedBy: by,
        proposedByName: byName,
        proposedAt: stamp(ctx),
      };
      s.state.beneficiaryChanges.push(change);
      log(ctx, s, 'beneficiaryProposed', { kind: 'beneficiary', id: change.id, label: iban }, { values: { reason: change.reason } });
      save(ctx);
      return settings(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/beneficiary-changes\/(?<changeId>[\w-]+)\/(?<decision>[\w-]+)$/,
    access: requires('banking', ['beneficiary.approve', 'beneficiary.manage'], 'operational'),
    handle: (ctx): CollectionSettings => {
      const s = siteOf(ctx);
      const change = s.state.beneficiaryChanges.find((c) => c.id === ctx.params.changeId);
      if (!change || !['approve', 'reject', 'cancel', 'end-cooling-off'].includes(ctx.params.decision!)) notFound(ctx);
      const decision = ctx.params.decision!;
      const me = ctx.persona!.principalId;
      const { by, byName } = actor(ctx);
      const note = text(body<{ note: string }>(ctx).note, 300);
      const current = beneficiaryOn(s.state, s.legalEntityId, ctx.at);
      if (decision === 'approve' || decision === 'reject') {
        if (!can(ctx, 'beneficiary.approve')) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
        if (change.state !== 'pending_approval') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
        if (change.proposedBy === me) problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
        if (decision === 'reject') {
          if (note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
          Object.assign(change, { state: 'rejected', decidedBy: by, decidedByName: byName, decidedAt: stamp(ctx), note });
          log(ctx, s, 'beneficiaryRejected', { kind: 'beneficiary', id: change.id, label: change.proposed.iban }, { values: { note } });
        } else {
          if (change.verification !== 'bank_letter_checked') problem(ctx, 409, 'not_verified', 'collections:problems.accountNotVerified');
          const effectiveOn = addDays(ctx.at, s.state.coolingOffDays);
          s.state.seq += 1;
          const beneficiary: Beneficiary = {
            id: `ben_anr_s${s.state.seq}`,
            siteId: s.siteId,
            legalEntityId: s.legalEntityId,
            legalEntityName: ALNOOR_ENTITY.name,
            ...change.proposed,
            referenceFormat: current?.referenceFormat ?? `${s.state.numbering.code}-{flat}-{period}`,
            status: 'verified',
            verifiedOn: ctx.at,
            activeFrom: effectiveOn,
          };
          s.state.beneficiaries.push(beneficiary);
          if (current) current.activeTo = effectiveOn;
          Object.assign(change, { state: 'cooling_off', decidedBy: by, decidedByName: byName, decidedAt: stamp(ctx), effectiveOn, beneficiaryId: beneficiary.id, ...(note ? { note } : {}) });
          log(ctx, s, 'beneficiaryApproved', { kind: 'beneficiary', id: change.id, label: change.proposed.iban }, { values: { effectiveOn } });
        }
      } else if (decision === 'cancel') {
        if (change.state !== 'pending_approval' && change.state !== 'cooling_off') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
        if (note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
        if (change.state === 'cooling_off') {
          s.state.beneficiaries = s.state.beneficiaries.filter((b) => b.id !== change.beneficiaryId);
          const previous = s.state.beneficiaries.find((b) => b.activeTo === change.effectiveOn);
          if (previous) delete previous.activeTo;
        }
        Object.assign(change, { state: 'cancelled', note });
        log(ctx, s, 'beneficiaryCancelled', { kind: 'beneficiary', id: change.id, label: change.proposed.iban }, { values: { note } });
      } else {
        // Prototype only: the demo's clock is frozen, so the cooling-off period is ended by hand (labelled in the UI).
        if (!can(ctx, 'beneficiary.approve')) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
        if (change.state !== 'cooling_off') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
        const next = s.state.beneficiaries.find((b) => b.id === change.beneficiaryId)!;
        const previous = s.state.beneficiaries.find((b) => b.activeTo === change.effectiveOn && b.id !== next.id);
        next.activeFrom = ctx.at;
        if (previous) Object.assign(previous, { activeTo: ctx.at, status: 'retired' });
        Object.assign(change, { state: 'active', effectiveOn: ctx.at });
        log(ctx, s, 'beneficiaryActivated', { kind: 'beneficiary', id: change.id, label: change.proposed.iban }, { values: { simulated: 'true' } });
      }
      save(ctx);
      return settings(ctx, s);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/payment-methods$/,
    access: requires('receivables', 'payment_methods.manage', 'operational'),
    handle: (ctx): CollectionSettings => {
      const s = siteOf(ctx, 'receivables');
      const input = body<{ method: string; enabled: boolean; maxAmount: string; counter: string }>(ctx);
      const rule = s.state.methods.find((m) => m.method === input.method);
      if (!rule) invalidField(ctx, 'method', 'collections:problems.method');
      if (rule!.gate) problem(ctx, 409, 'method_later', 'collections:problems.methodLater');
      const patch: Partial<MethodRule> = input.enabled === undefined ? {} : { enabled: input.enabled === true };
      if (rule!.method === 'office_cash') {
        if (input.maxAmount !== undefined) patch.maxAmount = money(amountIn(ctx, 'maxAmount', input.maxAmount));
        if (input.counter !== undefined) {
          const counter = text(input.counter, 120);
          if (counter.length < 5) invalidField(ctx, 'counter', 'forms:errors.required');
          patch.counter = counter;
        }
      }
      if (rule!.method === 'bank_transfer' && patch.enabled === false) problem(ctx, 409, 'method_required', 'collections:problems.transferRequired');
      Object.assign(rule!, patch);
      log(ctx, s, 'methodChanged', { kind: 'settings', id: rule!.method, label: rule!.method }, { values: { method: rule!.method, enabled: String(rule!.enabled), ...(rule!.maxAmount ? { maxAmount: rule!.maxAmount.amount } : {}) } });
      save(ctx);
      return settings(ctx, s);
    },
  },
  {
    // New patterns apply to documents issued from now on; issued references never change.
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/numbering$/,
    access: requires('dues', 'billing_policy.manage', 'operational'),
    handle: (ctx): CollectionSettings => {
      const s = siteOf(ctx, 'dues');
      const input = body<Record<string, string>>(ctx);
      const errors: Record<string, Array<{ code: string }>> = {};
      const next = { ...s.state.numbering };
      if (input.code !== undefined) {
        const code = text(input.code, 8).toUpperCase();
        if (!/^[A-Z0-9]{2,8}$/.test(code)) errors.code = [{ code: 'collections:problems.code' }];
        else next.code = code;
      }
      for (const kind of DOCUMENT_KINDS) {
        const v = input[kind];
        if (v === undefined) continue;
        const p = patternProblem(kind as DocumentKind, v);
        if (p) errors[kind] = [{ code: `collections:problems.${p}` }];
        else next[kind as DocumentKind] = v.trim();
      }
      if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
      const changed = Object.keys(next).filter((k) => next[k as keyof typeof next] !== s.state.numbering[k as keyof typeof next]);
      s.state.numbering = next;
      if (changed.length) log(ctx, s, 'numberingChanged', { kind: 'settings', id: 'numbering', label: next.code }, { values: Object.fromEntries(changed.map((k) => [k, next[k as keyof typeof next]])) });
      save(ctx);
      return settings(ctx, s);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/posting-policy$/,
    access: requires('dues', 'billing_policy.manage', 'operational'),
    handle: (ctx): CollectionSettings => {
      const s = siteOf(ctx, 'dues');
      const input = body<{ roles: unknown; reason: string }>(ctx);
      const eligible = settings(ctx, s).posting.eligibleRoles.map((r) => r.id);
      const roles = Array.isArray(input.roles) ? [...new Set(input.roles.map(String))] : [];
      if (!roles.length) invalidField(ctx, 'roles', 'collections:problems.postingRoles');
      if (roles.some((r) => !eligible.includes(r))) invalidField(ctx, 'roles', 'collections:problems.postingRoleNotEligible');
      const reason = text(input.reason, 300);
      if (reason.length < 5) invalidField(ctx, 'reason', 'collections:problems.reasonRequired');
      const { by, byName } = actor(ctx);
      s.state.posting = { roles, updatedBy: by, updatedByName: byName, updatedAt: stamp(ctx) };
      log(ctx, s, 'postingPolicyChanged', { kind: 'settings', id: 'posting', label: 'posting' }, { values: { roles: roles.join(', '), reason } });
      save(ctx);
      return settings(ctx, s);
    },
  },
];

