import {
  S1_FEATURES,
  type BankLine,
  type BatchDetail,
  type BatchLine,
  type BatchList,
  type BatchTotals,
  type ChequeDetail,
  type ChequeInstrument,
  type ChequeList,
  type ChequeStatus,
  type CollectionCandidate,
  type CollectionPayment,
  type OfficeCashRecorded,
  type OfficeCollectionBatch,
  type SettlementExceptionRequest,
} from '@repo/contracts';
import { can, matches, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { pad } from '../../seed';
import { allocateOldestFirst, linesOf, openLinesFor, toAllocationLines } from '../allocate';
import { recordPayment } from '../collections';
import { PENDING_STATES } from '../collections-read';
import { invalidField, log, problem, save, siteOf, stamp, type Society } from '../handlers';
import { factOn } from '../model';
import { nextRef, viewOf } from '../state';
import { raiseApproval } from './approvals';
import { amountField, assertOpen, body, me, query, refuse, remember, replay, required, text } from './common';
import { financeAccounts } from './cashbook';
import { addDays, DATE, money, paisa, sum } from './model';
import { FIN_ROUTES } from './routes';
import { chequeCandidates, chequeReversalCandidates, lineCheck, consumeLine } from './settle';

/**
 * Bulk office collection (FIN-013/014), cheques (FIN-007 extension, BILL-012 cheque rules) and
 * payment reversals (Gate S.1, D-35, D-46). Cash and cheques behave differently on purpose:
 * - cash lines: the counted total equals the lines; a second person confirms by counting it again;
 *   only then are payments, allocations (each payer's own lines) and receipts created;
 * - cheque lines: confirmation only acknowledges the cheque ("Cheque received — not a receipt of
 *   payment"); it settles nothing until a statement line of the deposit account clears it (C.2
 *   matching); a returned cheque settles nothing; a cleared cheque later reversed reverses its
 *   payment, allocation and receipt (never deleted) and the lines reopen.
 */

const BULK = S1_FEATURES.bulkCollection;
const site = (ctx: HandlerContext) => siteOf(ctx, 'receivables');

// ---------------------------------------------------------------------------------------------
// Who can be collected from
// ---------------------------------------------------------------------------------------------

function payersOf(s: Society, accountId: string, on: string) {
  const facts = s.view.facts.filter((f) => f.role === 'payer' && f.billingAccountId === accountId && factOn(f, on));
  const ids = [...new Set(facts.map((f) => f.partyId))];
  const lines = linesOf(s.view.invoices);
  return ids.map((partyId) => {
    const open = openLinesFor(lines, { partyId, legalEntityId: s.legalEntityId, billingAccountId: accountId });
    return {
      partyId,
      name: facts.find((f) => f.partyId === partyId)!.partyName,
      flats: facts.filter((f) => f.partyId === partyId).map((f) => s.view.model.flats.find((x) => x.id === f.flatId)?.code ?? '').filter(Boolean),
      open: money(sum(open.map((l) => l.open))),
      overdue: money(sum(open.filter((l) => l.dueOn < on).map((l) => l.open))),
      ...(open[0] ? { oldestDue: open[0].dueOn } : {}),
    };
  });
}

function candidates(ctx: HandlerContext, s: Society): CollectionCandidate[] {
  const { q, unpaid } = query(ctx);
  return s.view.model.accounts
    .map((a) => {
      const payers = payersOf(s, a.id, ctx.at);
      const flats = s.view.model.flats.filter((f) => f.billingAccountId === a.id);
      return {
        billingAccountId: a.id,
        accountNo: a.accountNo,
        flats: flats.map((f) => f.code),
        buildingCode: flats[0]?.code.slice(0, 1) ?? '',
        payers,
        open: money(sum(payers.map((p) => paisa(p.open)))),
        pendingProof: s.state.submissions.some((x) => x.billingAccountId === a.id && PENDING_STATES.includes(x.state)),
        pendingCheque: s.state.finance.cheques.some((c) => c.billingAccountId === a.id && ['received', 'deposited', 'exception_pending'].includes(c.status)),
      };
    })
    .filter((c) => c.payers.length > 0)
    .filter((c) => unpaid !== '1' || paisa(c.open) > 0n)
    .filter((c) => !q || !q.trim() || matches(q.trim(), c.accountNo, ...c.flats, ...c.payers.map((p) => p.name)));
}

// ---------------------------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------------------------

const totalsOf = (b: Pick<OfficeCollectionBatch, 'lines'>): BatchTotals => {
  const cash = b.lines.filter((l) => l.method === 'office_cash');
  const cheques = b.lines.filter((l) => l.method === 'cheque');
  const c = sum(cash.map((l) => paisa(l.amount)));
  const q = sum(cheques.map((l) => paisa(l.amount)));
  return { cash: money(c), cheques: money(q), cashLines: cash.length, chequeLines: cheques.length, total: money(c + q) };
};

const normBank = (s: string) => s.toLocaleUpperCase('en').replace(/[^A-Z0-9]/g, '');
/** A cheque is the same cheque when the drawer's bank and its number are the same. */
const sameCheque = (a: { drawerBank: string; number: string }, b: { drawerBank: string; chequeNumber?: string; number?: string }) => normBank(a.drawerBank) === normBank(b.drawerBank) && a.number === (b.chequeNumber ?? b.number);
const LIVE_CHEQUE: readonly ChequeStatus[] = ['received', 'deposited', 'exception_pending', 'cleared', 'reversed'];

/** Blocking problems and shown warnings of a batch's lines (the server's own check, never the form's). */
function review(ctx: HandlerContext, s: Society, b: OfficeCollectionBatch) {
  const cashRule = s.state.methods.find((m) => m.method === 'office_cash');
  const chequeRule = s.state.methods.find((m) => m.method === 'cheque');
  const problems: BatchDetail['problems'] = [];
  const warnings: BatchDetail['warnings'] = [];
  if (!b.lines.length) problems.push({ code: 'batch_empty' });
  b.lines.forEach((l, i) => {
    const payers = payersOf(s, l.billingAccountId, b.collectedOn);
    const payer = payers.find((p) => p.partyId === l.payerPartyId);
    if (!payer) problems.push({ lineId: l.id, code: 'payer_not_liable', values: { account: l.accountNo } });
    if (l.method === 'office_cash') {
      if (!cashRule?.enabled) problems.push({ lineId: l.id, code: 'cash_not_allowed' });
      if (cashRule?.maxAmount && paisa(l.amount) > paisa(cashRule.maxAmount)) problems.push({ lineId: l.id, code: 'over_cash_limit', values: { limit: cashRule.maxAmount.amount } });
    } else {
      if (!chequeRule?.enabled) problems.push({ lineId: l.id, code: 'cheque_not_allowed' });
      const c = l.cheque;
      if (!c || c.drawerBank.length < 2 || !/^\d{6,10}$/.test(c.number) || !DATE.test(c.date)) problems.push({ lineId: l.id, code: 'cheque_details' });
      else {
        if (c.date > addDays(b.collectedOn, chequeRule?.cheque?.maxPostDatedDays ?? 0)) problems.push({ lineId: l.id, code: 'cheque_post_dated' });
        if (c.date < addDays(b.collectedOn, -180)) problems.push({ lineId: l.id, code: 'cheque_stale' });
        const dupe = s.state.finance.cheques.find((x) => LIVE_CHEQUE.includes(x.status) && sameCheque(c, x));
        if (dupe) problems.push({ lineId: l.id, code: 'cheque_duplicate', values: { ref: dupe.ref } });
        if (b.lines.some((o, j) => j < i && o.cheque && sameCheque(c, o.cheque))) problems.push({ lineId: l.id, code: 'cheque_duplicate_in_batch' });
      }
    }
    if (payer && paisa(l.amount) > paisa(payer.open)) warnings.push({ lineId: l.id, code: 'more_than_owed', values: { open: payer.open.amount } });
    if (s.state.submissions.some((x) => x.billingAccountId === l.billingAccountId && x.payerPartyId === l.payerPartyId && PENDING_STATES.includes(x.state))) warnings.push({ lineId: l.id, code: 'proof_pending' });
    if (b.lines.some((o, j) => j < i && o.billingAccountId === l.billingAccountId && o.payerPartyId === l.payerPartyId && o.method === l.method)) warnings.push({ lineId: l.id, code: 'same_payer_twice' });
  });
  return { problems, warnings, cashLimit: cashRule?.maxAmount, methods: { cash: !!cashRule?.enabled, cheque: !!chequeRule?.enabled } };
}

function batchOf(ctx: HandlerContext, s: Society): OfficeCollectionBatch {
  const b = s.state.finance.batches.find((x) => x.id === ctx.params.batchId);
  if (!b) notFound(ctx);
  return b!;
}

function batchDetail(ctx: HandlerContext, s: Society, b: OfficeCollectionBatch): BatchDetail {
  s.view = viewOf(s.state, ctx.at);
  const who = me(ctx);
  const r = review(ctx, s, b);
  const collector = b.collectedBy === who.principalId;
  const confirmer = can(ctx, 'payment.batch.confirm');
  const editable = b.status === 'draft' || b.status === 'returned';
  return {
    batch: b,
    totals: totalsOf(b),
    ...r,
    actions: {
      edit: collector && editable && can(ctx, 'payment.receive'),
      submit: collector && editable && can(ctx, 'payment.receive') && !r.problems.length,
      confirm: confirmer && !collector && b.status === 'submitted',
      return: confirmer && !collector && b.status === 'submitted',
      // The collector never confirms their own batch, whether or not they hold the confirm permission.
      ...(b.status === 'submitted' && collector ? { reason: 'maker_checker_required' as const } : !confirmer && !can(ctx, 'payment.receive') ? { reason: 'permission_missing' as const } : {}),
    },
  };
}

function lineOf(ctx: HandlerContext, s: Society, raw: Record<string, unknown>, index: number): BatchLine {
  const account = s.view.model.accounts.find((a) => a.id === raw.billingAccountId);
  if (!account) refuse(ctx, 422, 'account_unknown', `lines.${index}.billingAccountId`);
  const payer = payersOf(s, account!.id, ctx.at).find((p) => p.partyId === raw.payerPartyId);
  // Only the person liable on this account (per-unit liability): never another account's payer.
  if (!payer) refuse(ctx, 422, 'payer_not_liable', `lines.${index}.payerPartyId`, { account: account!.accountNo });
  const method = raw.method === 'cheque' ? 'cheque' : 'office_cash';
  const amount = amountField(ctx, `lines.${index}.amount`, raw.amount);
  const c = (raw.cheque ?? {}) as Record<string, unknown>;
  return {
    id: `ocl_${index + 1}`,
    billingAccountId: account!.id,
    accountNo: account!.accountNo,
    payerPartyId: payer!.partyId,
    payerName: payer!.name,
    flats: payer!.flats,
    method,
    amount: money(amount),
    ...(method === 'cheque' ? { cheque: { drawerBank: text(c.drawerBank, 60), number: text(c.number, 12).replace(/\s/g, ''), date: text(c.date, 10) } } : {}),
  };
}

/** What a single office payment would settle if it were confirmed now (oldest first). */
function recordedOf(s: Society, b: OfficeCollectionBatch, replayed: boolean): OfficeCashRecorded {
  const line = b.lines[0]!;
  const view = viewOf(s.state, b.collectedOn);
  const rule = allocateOldestFirst(paisa(line.amount), openLinesFor(linesOf(view.invoices), { partyId: line.payerPartyId, legalEntityId: b.legalEntityId, billingAccountId: line.billingAccountId }));
  return {
    status: 'awaiting_count',
    batch: { id: b.id, ref: b.ref },
    amount: line.amount,
    accountNo: line.accountNo,
    payerName: line.payerName,
    flats: line.flats,
    recordedByName: b.collectedByName,
    recordedAt: b.submittedAt ?? b.history[0]!.at,
    settles: { lines: toAllocationLines(rule.allocations), unapplied: money(rule.unapplied) },
    replayed,
  };
}

// ---------------------------------------------------------------------------------------------
// Cheques
// ---------------------------------------------------------------------------------------------

function chequeOf(ctx: HandlerContext, s: Society): ChequeInstrument {
  const c = s.state.finance.cheques.find((x) => x.id === ctx.params.chequeId);
  if (!c) notFound(ctx);
  return c!;
}

function newCheque(s: Society, input: Omit<ChequeInstrument, 'id' | 'ref' | 'legalEntityId' | 'siteId' | 'status' | 'history'>, at: string): ChequeInstrument {
  const f = s.state.finance;
  const c: ChequeInstrument = {
    id: `chq_anr_${pad(f.cheques.length + 1, 4)}`,
    ref: nextRef(s.state, 'cheque', input.receivedOn),
    legalEntityId: s.legalEntityId,
    siteId: s.siteId,
    status: 'received',
    ...input,
    history: [{ at, by: input.receivedBy, byName: input.receivedByName, action: 'received' }],
  };
  f.cheques.push(c);
  return c;
}

function chequeDetail(ctx: HandlerContext, s: Society, c: ChequeInstrument): ChequeDetail {
  const who = me(ctx);
  const reversal = s.state.finance.reversals.find((r) => r.chequeId === c.id && r.status === 'pending');
  const banks = financeAccounts(s.state, ctx.at).filter((a) => a.kind === 'bank' && a.receivesDues);
  return {
    cheque: c,
    candidates: c.status === 'deposited' ? chequeCandidates(s.state, c) : c.status === 'cleared' && !reversal ? chequeReversalCandidates(s.state, c) : [],
    depositAccounts: banks.map((a) => ({ id: a.id, name: a.name })),
    actions: {
      deposit: can(ctx, 'cheque.manage') && c.status === 'received',
      clear: can(ctx, 'bank.reconcile') && c.status === 'deposited',
      decideException: can(ctx, 'payment_exception.approve') && c.status === 'exception_pending' && c.exception?.requestedBy !== who.principalId,
      return: can(ctx, 'cheque.manage') && ['received', 'deposited', 'exception_pending'].includes(c.status),
      cancel: can(ctx, 'cheque.manage') && c.status === 'received',
      requestReversal: (can(ctx, 'cheque.manage') || can(ctx, 'bank.reconcile')) && c.status === 'cleared' && !reversal,
      ...(c.status === 'exception_pending' && c.exception?.requestedBy === who.principalId ? { reason: 'maker_checker_required' as const } : {}),
    },
  };
}

/** A cheque cleared by its statement line: the payment, its allocation (this payer's lines) and the receipt. */
function clearCheque(ctx: HandlerContext, s: Society, c: ChequeInstrument, line: BankLine, exception?: CollectionPayment['exception']) {
  assertOpen(ctx, s, line.valueDate, 'payment');
  const view = viewOf(s.state, ctx.at);
  const open = openLinesFor(linesOf(view.invoices), { partyId: c.payerPartyId, legalEntityId: c.legalEntityId, billingAccountId: c.billingAccountId });
  const rule = allocateOldestFirst(paisa(c.amount), open);
  const who = me(ctx);
  const { payment, receipt } = recordPayment(s.state, {
    at: stamp(ctx),
    receivedOn: line.valueDate,
    by: { principalId: who.principalId, name: who.name },
    account: { id: c.billingAccountId, accountNo: c.accountNo },
    payer: { partyId: c.payerPartyId, name: c.payerName },
    flats: c.flats,
    method: 'cheque',
    amount: paisa(c.amount),
    allocations: rule.allocations,
    unapplied: rule.unapplied,
    source: { kind: 'cheque', chequeId: c.id, chequeRef: c.ref },
    verification: exception ? 'exception_approved' : 'bank_matched',
    ...(exception ? { exception } : {}),
    bankLine: line,
    bankReference: line.reference,
  });
  const f = s.state.finance;
  const st = { id: `stl_anr_${pad(f.settlements.length + 1, 4)}`, subjectType: 'cheque' as const, subjectId: c.id, evidenceType: 'statement_line' as const, bankLineId: line.id, bankTxnId: line.bankTxnId, ...(exception ? { exception } : {}), settledOn: line.valueDate, confirmedBy: who.principalId, confirmedByName: who.name, at: stamp(ctx) };
  f.settlements.push(st);
  Object.assign(c, { status: 'cleared', settlementId: st.id, paymentId: payment.id, paymentRef: payment.ref, receiptId: receipt.id, receiptRef: receipt.ref });
  delete c.exception;
  c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'cleared', note: line.bankTxnId });
  for (const b of f.batches) for (const l of b.lines) if (l.outcome?.kind === 'cheque' && l.outcome.chequeId === c.id) l.outcome.status = 'cleared';
  log(ctx, s, 'chequeCleared', { kind: 'cheque', id: c.id, label: c.ref }, { flats: c.flats, values: { amount: c.amount.amount, payment: payment.ref, receipt: receipt.ref, bank: line.bankTxnId } });
}

/**
 * Executes an approved reversal: the payment stops settling anything (its lines reopen), the receipt is
 * marked reversed (never deleted), a cheque becomes "reversed" and the bank's debit line is used up.
 */
export function executeReversal(ctx: HandlerContext, s: Society, reversalId: string, approver: { name: string }) {
  const f = s.state.finance;
  const r = f.reversals.find((x) => x.id === reversalId);
  if (!r || r.status !== 'pending') return;
  const payment = s.state.payments.find((p) => p.id === r.paymentId);
  if (!payment || payment.reversal) return;
  const approval = f.approvals.find((a) => a.id === r.approvalId)!;
  const line = r.bankLineId ? s.state.bank.lines.find((l) => l.id === r.bankLineId) : undefined;
  const on = line?.valueDate ?? ctx.at;
  assertOpen(ctx, s, on, 'reversal');
  payment.reversal = { on, at: stamp(ctx), reason: r.reason, approvalId: approval.id, approvalRef: approval.ref, requestedByName: r.requestedByName, approvedByName: approver.name, ...(line ? { bankLineId: line.id } : {}) };
  const receipt = s.state.receipts.find((x) => x.id === payment.receiptId);
  if (receipt) receipt.reversed = { on, reason: r.reason };
  if (line) consumeLine(s.state, line.id, { id: r.id, ref: approval.ref });
  r.status = 'approved';
  if (r.chequeId) {
    const c = f.cheques.find((x) => x.id === r.chequeId);
    if (c) {
      c.status = 'reversed';
      c.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: approver.name, action: 'reversed', note: r.reason });
      for (const b of f.batches) for (const l of b.lines) if (l.outcome?.kind === 'cheque' && l.outcome.chequeId === c.id) l.outcome.status = 'reversed';
    }
  }
  for (const b of f.batches) for (const l of b.lines) if (l.outcome?.kind === 'payment' && l.outcome.paymentId === payment.id) l.outcome.reversed = true;
  log(ctx, s, 'paymentReversed', { kind: 'payment', id: payment.id, label: payment.ref }, { flats: [...new Set(payment.allocations.map((a) => a.unitCode))], values: { amount: payment.amount.amount, receipt: payment.receiptRef, approval: approval.ref, reason: r.reason } });
}

/** A rejected reversal changes nothing; a held debit line is released. */
export function rejectReversal(s: Society, approvalId: string) {
  const r = s.state.finance.reversals.find((x) => x.approvalId === approvalId && x.status === 'pending');
  if (!r) return;
  r.status = 'rejected';
  if (r.bankLineId) {
    const line = s.state.bank.lines.find((l) => l.id === r.bankLineId);
    if (line && line.heldBy?.id === r.chequeId) delete line.heldBy;
  }
}

function requestReversal(ctx: HandlerContext, s: Society, payment: CollectionPayment, reason: string, extra: { chequeId?: string; bankLineId?: string }) {
  const f = s.state.finance;
  const who = me(ctx);
  const id = `rvq_anr_${pad(f.reversals.length + 1, 4)}`;
  const approval = raiseApproval(s.state, {
    subject: 'payment_reversal',
    subjectId: payment.id,
    subjectRef: payment.ref,
    amount: paisa(payment.amount),
    summary: { key: extra.chequeId ? 'reversal_cheque' : 'reversal_cash', values: { payer: payment.payerName, receipt: payment.receiptRef, reason } },
    href: FIN_ROUTES.payment(payment.id),
    requester: { principalId: who.principalId, name: who.name },
    on: ctx.at,
    at: stamp(ctx),
  });
  if (!approval) refuse(ctx, 409, 'no_policy_rule');
  f.reversals.push({ id, approvalId: approval!.id, paymentId: payment.id, ...extra, reason, requestedBy: who.principalId, requestedByName: who.name, at: stamp(ctx), status: 'pending' });
  log(ctx, s, 'reversalRequested', { kind: 'payment', id: payment.id, label: payment.ref }, { values: { reason, approval: approval!.ref } });
  return approval!;
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

export const FINANCE_COLLECT_HANDLERS: readonly Handler[] = [
  {
    // FIN-007 under owner decision D-46 (D.1/S.1 integration): cash handed over at the office is
    // recorded by one person and settles only after a second person has counted it. It is kept as an
    // office collection of one line, confirmed in FIN-014: no payment, allocation, receipt or Paid
    // status before that. The site's method rule (allowed, maximum) still decides what may be taken.
    method: 'POST',
    pattern: /^\/payments\/office$/,
    access: requires('receivables', 'payment.receive', 'operational'),
    handle: (ctx): OfficeCashRecorded => {
      const s = site(ctx);
      const rule = s.state.methods.find((m) => m.method === 'office_cash');
      if (!rule?.enabled) problem(ctx, 409, 'method_not_allowed', 'collections:problems.methodNotAllowed');
      assertOpen(ctx, s, ctx.at, 'payment');
      const input = body<{ accountId: string; payerPartyId: string; amount: string; note: string; allocations: unknown; idempotencyKey: string }>(ctx);
      const key = text(input.idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return recordedOf(s, s.state.finance.batches.find((b) => b.id === seen)!, true);
      // The allocation is decided when the cash is counted (oldest first), not at the counter.
      if (input.allocations !== undefined) invalidField(ctx, 'allocations', 'finance:problems.allocationAtCount');
      const account = s.view.model.accounts.find((a) => a.id === input.accountId);
      if (!account) invalidField(ctx, 'accountId', 'collections:problems.account');
      if (!payersOf(s, account!.id, ctx.at).some((p) => p.partyId === input.payerPartyId)) invalidField(ctx, 'payerPartyId', 'collections:problems.payer');
      const amount = amountField(ctx, 'amount', input.amount);
      if (rule!.maxAmount && amount > paisa(rule!.maxAmount)) invalidField(ctx, 'amount', 'collections:problems.overCashLimit', { limit: rule!.maxAmount.amount });
      const line = lineOf(ctx, s, { billingAccountId: account!.id, payerPartyId: input.payerPartyId, method: 'office_cash', amount: input.amount }, 0);
      const who = me(ctx);
      const at = stamp(ctx);
      const note = text(input.note, 200);
      const f = s.state.finance;
      const b: OfficeCollectionBatch = {
        id: `ocb_anr_${pad(f.batches.length + 1, 4)}`,
        ref: nextRef(s.state, 'batch', ctx.at),
        siteId: s.siteId,
        legalEntityId: s.legalEntityId,
        collectedBy: who.principalId,
        collectedByName: who.name,
        collectedOn: ctx.at,
        status: 'submitted',
        lines: [line],
        declaredCash: line.amount,
        submittedAt: at,
        origin: 'single',
        ...(note ? { note } : {}),
        history: [
          { at, by: who.principalId, byName: who.name, action: 'created' },
          { at, by: who.principalId, byName: who.name, action: 'submitted', note: line.amount.amount },
        ],
      };
      f.batches.push(b);
      remember(s, key, b.id);
      log(ctx, s, 'officeCashRecorded', { kind: 'batch', id: b.id, label: b.ref }, { flats: line.flats, values: { amount: line.amount.amount, account: line.accountNo, payer: line.payerName } });
      save(ctx);
      return recordedOf(s, b, false);
    },
  },
  {
    method: 'GET',
    pattern: /^\/office-collections\/candidates$/,
    access: requires('receivables', 'payment.receive', 'history_read', BULK),
    handle: (ctx): CollectionCandidate[] => candidates(ctx, site(ctx)),
  },
  {
    method: 'GET',
    pattern: /^\/office-collections$/,
    access: requires('receivables', ['payment.receive', 'payment.batch.confirm'], 'history_read', BULK),
    handle: (ctx): BatchList => {
      const s = site(ctx);
      const { status } = query(ctx);
      const all = s.state.finance.batches;
      const counts = Object.fromEntries((['draft', 'submitted', 'confirmed', 'returned'] as const).map((k) => [k, all.filter((b) => b.status === k).length])) as BatchList['counts'];
      return { items: [...all].filter((b) => !status || status === 'all' || b.status === status).reverse().map((b) => ({ ...b, totals: totalsOf(b) })), counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/office-collections\/(?<batchId>[\w-]+)$/,
    access: requires('receivables', ['payment.receive', 'payment.batch.confirm'], 'history_read', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      return batchDetail(ctx, s, batchOf(ctx, s));
    },
  },
  {
    method: 'POST',
    pattern: /^\/office-collections$/,
    access: requires('receivables', 'payment.receive', 'operational', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      const key = text(body<{ idempotencyKey: string }>(ctx).idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return batchDetail(ctx, s, s.state.finance.batches.find((b) => b.id === seen)!);
      const f = s.state.finance;
      const who = me(ctx);
      const b: OfficeCollectionBatch = {
        id: `ocb_anr_${pad(f.batches.length + 1, 4)}`,
        ref: nextRef(s.state, 'batch', ctx.at),
        siteId: s.siteId,
        legalEntityId: s.legalEntityId,
        collectedBy: who.principalId,
        collectedByName: who.name,
        collectedOn: ctx.at,
        status: 'draft',
        lines: [],
        history: [{ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'created' }],
      };
      f.batches.push(b);
      remember(s, key, b.id);
      log(ctx, s, 'batchCreated', { kind: 'batch', id: b.id, label: b.ref });
      save(ctx);
      return batchDetail(ctx, s, b);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/office-collections\/(?<batchId>[\w-]+)\/lines$/,
    access: requires('receivables', 'payment.receive', 'operational', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      const b = batchOf(ctx, s);
      if (b.collectedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_collector');
      if (b.status !== 'draft' && b.status !== 'returned') refuse(ctx, 409, 'invalid_state');
      const raw = body<{ lines: Array<Record<string, unknown>> }>(ctx).lines;
      if (!Array.isArray(raw) || raw.length > 40) refuse(ctx, 422, 'batch_lines', 'lines');
      b.lines = raw!.map((l, i) => lineOf(ctx, s, l, i));
      b.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'lines_changed', note: String(b.lines.length) });
      save(ctx);
      return batchDetail(ctx, s, b);
    },
  },
  {
    // The collector counts the cash and submits: the counted total must equal the cash lines.
    method: 'POST',
    pattern: /^\/office-collections\/(?<batchId>[\w-]+)\/submit$/,
    access: requires('receivables', 'payment.receive', 'operational', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      const b = batchOf(ctx, s);
      if (b.status === 'submitted') return batchDetail(ctx, s, b);
      if (b.collectedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_collector');
      if (b.status !== 'draft' && b.status !== 'returned') refuse(ctx, 409, 'invalid_state');
      const r = review(ctx, s, b);
      if (r.problems.length) refuse(ctx, 409, 'batch_problems');
      const totals = totalsOf(b);
      const declared = totals.cashLines ? amountField(ctx, 'declaredCash', body<{ declaredCash: string }>(ctx).declaredCash) : 0n;
      if (declared !== paisa(totals.cash)) refuse(ctx, 409, 'count_mismatch', 'declaredCash', { lines: totals.cash.amount });
      const who = me(ctx);
      const again = b.status === 'returned';
      Object.assign(b, { status: 'submitted', declaredCash: money(declared), submittedAt: stamp(ctx) });
      delete b.returnedReason;
      b.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: again ? 'resubmitted' : 'submitted', note: money(declared).amount });
      log(ctx, s, 'batchSubmitted', { kind: 'batch', id: b.id, label: b.ref }, { values: { cash: totals.cash.amount, cheques: totals.cheques.amount, lines: String(b.lines.length) } });
      save(ctx);
      return batchDetail(ctx, s, b);
    },
  },
  {
    // FIN-014: a second person counts the cash again and confirms. Only now do cash lines become
    // payments with receipts; cheque lines become acknowledgements (not receipts). Once only.
    method: 'POST',
    pattern: /^\/office-collections\/(?<batchId>[\w-]+)\/confirm$/,
    access: requires('receivables', 'payment.batch.confirm', 'operational', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      const b = batchOf(ctx, s);
      if (b.status === 'confirmed') return batchDetail(ctx, s, b);
      if (b.status !== 'submitted') refuse(ctx, 409, 'invalid_state');
      const who = me(ctx);
      if (b.collectedBy === who.principalId) refuse(ctx, 403, 'maker_checker_required');
      const r = review(ctx, s, b);
      if (r.problems.length) refuse(ctx, 409, 'batch_problems');
      const totals = totalsOf(b);
      const counted = totals.cashLines ? amountField(ctx, 'countedCash', body<{ countedCash: string }>(ctx).countedCash) : 0n;
      if (counted !== paisa(totals.cash)) refuse(ctx, 409, 'count_mismatch', 'countedCash', { lines: totals.cash.amount });
      assertOpen(ctx, s, b.collectedOn, 'payment');
      const at = stamp(ctx);
      for (const line of b.lines) {
        if (line.outcome) continue;
        if (line.method === 'office_cash') {
          // Each line allocates to its own payer's lines on its own account (never another payer's).
          const view = viewOf(s.state, ctx.at);
          const open = openLinesFor(linesOf(view.invoices), { partyId: line.payerPartyId, legalEntityId: b.legalEntityId, billingAccountId: line.billingAccountId });
          const rule = allocateOldestFirst(paisa(line.amount), open);
          const { payment, receipt } = recordPayment(s.state, {
            at,
            receivedOn: b.collectedOn,
            by: { principalId: b.collectedBy, name: b.collectedByName },
            account: { id: line.billingAccountId, accountNo: line.accountNo },
            payer: { partyId: line.payerPartyId, name: line.payerName },
            flats: line.flats,
            method: 'office_cash',
            amount: paisa(line.amount),
            allocations: rule.allocations,
            unapplied: rule.unapplied,
            source: { kind: 'batch', batchId: b.id, batchRef: b.ref, lineId: line.id },
            verification: 'witnessed',
          });
          payment.witness = { by: who.principalId, byName: who.name, at };
          line.outcome = { kind: 'payment', paymentId: payment.id, paymentRef: payment.ref, receiptId: receipt.id, receiptRef: receipt.ref };
        } else {
          const c = newCheque(
            s,
            {
              billingAccountId: line.billingAccountId,
              accountNo: line.accountNo,
              payerPartyId: line.payerPartyId,
              payerName: line.payerName,
              flats: line.flats,
              drawerBank: line.cheque!.drawerBank,
              chequeNumber: line.cheque!.number,
              chequeDate: line.cheque!.date,
              amount: line.amount,
              source: { kind: 'batch', batchId: b.id, batchRef: b.ref, lineId: line.id },
              receivedOn: b.collectedOn,
              receivedBy: b.collectedBy,
              receivedByName: b.collectedByName,
            },
            at,
          );
          line.outcome = { kind: 'cheque', chequeId: c.id, chequeRef: c.ref, status: c.status };
        }
      }
      Object.assign(b, { status: 'confirmed', confirmedBy: who.principalId, confirmedByName: who.name, confirmedAt: at, confirmedCash: money(counted) });
      b.history.push({ at, by: who.principalId, byName: who.name, action: 'confirmed', note: money(counted).amount });
      log(ctx, s, 'batchConfirmed', { kind: 'batch', id: b.id, label: b.ref }, { flats: [...new Set(b.lines.flatMap((l) => l.flats))], values: { cash: totals.cash.amount, cheques: totals.cheques.amount, receipts: String(totals.cashLines), acknowledgements: String(totals.chequeLines) } });
      save(ctx);
      return batchDetail(ctx, s, b);
    },
  },
  {
    method: 'POST',
    pattern: /^\/office-collections\/(?<batchId>[\w-]+)\/return$/,
    access: requires('receivables', 'payment.batch.confirm', 'operational', BULK),
    handle: (ctx): BatchDetail => {
      const s = site(ctx);
      const b = batchOf(ctx, s);
      if (b.status !== 'submitted') refuse(ctx, 409, 'invalid_state');
      const who = me(ctx);
      if (b.collectedBy === who.principalId) refuse(ctx, 403, 'maker_checker_required');
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 5);
      Object.assign(b, { status: 'returned', returnedReason: reason });
      b.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'returned', note: reason });
      log(ctx, s, 'batchReturned', { kind: 'batch', id: b.id, label: b.ref }, { values: { reason } });
      save(ctx);
      return batchDetail(ctx, s, b);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Cheques
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/cheques$/,
    access: requires('receivables', ['payment.receive', 'cheque.manage', 'collections.view'], 'history_read'),
    handle: (ctx): ChequeList => {
      const s = site(ctx);
      const { status, account } = query(ctx);
      const all = s.state.finance.cheques;
      const counts = Object.fromEntries((['received', 'deposited', 'exception_pending', 'cleared', 'returned', 'cancelled', 'reversed'] as const).map((k) => [k, all.filter((c) => c.status === k).length])) as ChequeList['counts'];
      const pendingStates: readonly ChequeStatus[] = ['received', 'deposited', 'exception_pending'];
      const items = [...all]
        .filter((c) => !status || status === 'all' || (status === 'pending' ? pendingStates.includes(c.status) : c.status === status))
        .filter((c) => !account || c.billingAccountId === account)
        .reverse();
      return { items, counts, pending: money(sum(all.filter((c) => pendingStates.includes(c.status)).map((c) => paisa(c.amount)))) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)$/,
    access: requires('receivables', ['payment.receive', 'cheque.manage', 'collections.view'], 'history_read'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      return chequeDetail(ctx, s, chequeOf(ctx, s));
    },
  },
  {
    // FIN-007 extension: one cheque handed in at the office is acknowledged, never receipted.
    method: 'POST',
    pattern: /^\/cheques$/,
    access: requires('receivables', 'payment.receive', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      const input = body<{ accountId: string; payerPartyId: string; amount: string; drawerBank: string; number: string; date: string; idempotencyKey: string }>(ctx);
      const key = text(input.idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return chequeDetail(ctx, s, s.state.finance.cheques.find((c) => c.id === seen)!);
      const draft: OfficeCollectionBatch = { id: 'single', ref: '', siteId: s.siteId, legalEntityId: s.legalEntityId, collectedBy: '', collectedByName: '', collectedOn: ctx.at, status: 'draft', lines: [], history: [] };
      draft.lines = [lineOf(ctx, s, { billingAccountId: input.accountId, payerPartyId: input.payerPartyId, method: 'cheque', amount: input.amount, cheque: { drawerBank: input.drawerBank, number: input.number, date: input.date } }, 0)];
      const r = review(ctx, s, draft);
      if (r.problems.length) refuse(ctx, 409, r.problems[0]!.code, 'cheque', r.problems[0]!.values);
      const line = draft.lines[0]!;
      const who = me(ctx);
      const c = newCheque(s, { billingAccountId: line.billingAccountId, accountNo: line.accountNo, payerPartyId: line.payerPartyId, payerName: line.payerName, flats: line.flats, drawerBank: line.cheque!.drawerBank, chequeNumber: line.cheque!.number, chequeDate: line.cheque!.date, amount: line.amount, source: { kind: 'office' }, receivedOn: ctx.at, receivedBy: who.principalId, receivedByName: who.name }, stamp(ctx));
      remember(s, key, c.id);
      log(ctx, s, 'chequeReceived', { kind: 'cheque', id: c.id, label: c.ref }, { flats: c.flats, values: { amount: c.amount.amount, number: c.chequeNumber } });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/deposit$/,
    access: requires('receivables', 'cheque.manage', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      const c = chequeOf(ctx, s);
      if (c.status === 'deposited') return chequeDetail(ctx, s, c);
      if (c.status !== 'received') refuse(ctx, 409, 'invalid_state');
      const input = body<{ accountId: string; slipNo: string }>(ctx);
      const rule = s.state.methods.find((m) => m.method === 'cheque')?.cheque;
      const account = financeAccounts(s.state, ctx.at).find((a) => a.id === (input.accountId || rule?.depositAccountId) && a.kind === 'bank' && a.legalEntityId === c.legalEntityId);
      // Into a verified account of the cheque's own legal entity, never anywhere else.
      if (!account) refuse(ctx, 422, 'account_unknown', 'accountId');
      const slipNo = required(ctx, 'slipNo', text(input.slipNo, 40), 3);
      assertOpen(ctx, s, ctx.at, 'cheque');
      const who = me(ctx);
      c.status = 'deposited';
      c.deposit = { accountId: account!.id, accountName: account!.name, slipNo, on: ctx.at, byName: who.name };
      c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'deposited', note: slipNo });
      for (const b of s.state.finance.batches) for (const l of b.lines) if (l.outcome?.kind === 'cheque' && l.outcome.chequeId === c.id) l.outcome.status = 'deposited';
      log(ctx, s, 'chequeDeposited', { kind: 'cheque', id: c.id, label: c.ref }, { values: { account: account!.name, slip: slipNo } });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    // Cleared only by a fully matching credit line of the deposit account (C.2 rules); a partial
    // match needs an exception approved by someone else.
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/clear$/,
    access: requires('receivables', 'collections.view', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      if (!can(ctx, 'bank.reconcile')) refuse(ctx, 403, 'permission_missing');
      const c = chequeOf(ctx, s);
      if (c.status === 'cleared') return chequeDetail(ctx, s, c);
      if (c.status !== 'deposited') refuse(ctx, 409, 'invalid_state');
      const lineId = text(body<{ bankLineId: string }>(ctx).bankLineId, 40);
      if (!lineId) refuse(ctx, 422, 'bank_evidence_required', 'bankLineId');
      const checked = lineCheck(chequeCandidates(s.state, c), lineId);
      if (!checked.ok) refuse(ctx, 409, checked.problem, 'bankLineId');
      if (checked.ok && checked.missing.length) refuse(ctx, 409, 'exception_required', 'bankLineId', { missing: checked.missing.join(', ') });
      if (checked.ok) clearCheque(ctx, s, c, checked.line);
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/exception$/,
    access: requires('receivables', 'collections.view', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      if (!can(ctx, 'bank.reconcile')) refuse(ctx, 403, 'permission_missing');
      const c = chequeOf(ctx, s);
      if (c.status !== 'deposited') refuse(ctx, 409, 'invalid_state');
      const input = body<{ bankLineId: string; reason: string }>(ctx);
      const checked = lineCheck(chequeCandidates(s.state, c), text(input.bankLineId, 40));
      if (!checked.ok) refuse(ctx, 409, checked.problem, 'bankLineId');
      if (checked.ok && !checked.missing.length) refuse(ctx, 409, 'full_match_use_match', 'bankLineId');
      const reason = required(ctx, 'reason', text(input.reason, 300), 10);
      if (!checked.ok) return chequeDetail(ctx, s, c);
      const who = me(ctx);
      const ex: SettlementExceptionRequest = { bankLineId: checked.line.id, bankTxnId: checked.line.bankTxnId, missing: checked.missing, reason, requestedBy: who.principalId, requestedByName: who.name, requestedAt: stamp(ctx) };
      Object.assign(c, { status: 'exception_pending', exception: ex });
      s.state.bank.lines.find((l) => l.id === checked.line.id)!.heldBy = { kind: 'cheque', id: c.id, ref: c.ref };
      c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_requested', note: reason });
      log(ctx, s, 'chequeExceptionRequested', { kind: 'cheque', id: c.id, label: c.ref }, { values: { missing: checked.missing.join(', '), reason } });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/exception\/(?<decision>[\w-]+)$/,
    access: requires('receivables', 'payment_exception.approve', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      const c = chequeOf(ctx, s);
      if (!['approve', 'reject'].includes(ctx.params.decision!)) notFound(ctx);
      if (c.status !== 'exception_pending' || !c.exception) refuse(ctx, 409, 'invalid_state');
      const who = me(ctx);
      if (c.exception!.requestedBy === who.principalId) refuse(ctx, 403, 'maker_checker_required');
      const ex = c.exception!;
      const line = s.state.bank.lines.find((l) => l.id === ex.bankLineId)!;
      const note = text(body<{ note: string }>(ctx).note, 300);
      if (ctx.params.decision === 'reject') {
        delete line.heldBy;
        c.status = 'deposited';
        delete c.exception;
        c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_rejected', note });
        log(ctx, s, 'chequeExceptionRejected', { kind: 'cheque', id: c.id, label: c.ref }, { values: { note } });
      } else {
        delete line.heldBy;
        c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_approved', note });
        clearCheque(ctx, s, c, line, { missing: ex.missing, reason: ex.reason, requestedBy: ex.requestedBy, requestedByName: ex.requestedByName, approvedBy: who.principalId, approvedByName: who.name, approvedAt: stamp(ctx) });
      }
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    // Returned by the bank (or before depositing): nothing was ever settled, so nothing is undone.
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/return$/,
    access: requires('receivables', 'cheque.manage', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      const c = chequeOf(ctx, s);
      if (c.status === 'returned') return chequeDetail(ctx, s, c);
      if (!['received', 'deposited', 'exception_pending'].includes(c.status)) refuse(ctx, 409, 'invalid_state');
      const input = body<{ reason: string; memo: string }>(ctx);
      const reason = required(ctx, 'reason', text(input.reason, 200), 5);
      const memo = text(input.memo, 80);
      const who = me(ctx);
      if (c.exception) {
        const line = s.state.bank.lines.find((l) => l.id === c.exception!.bankLineId);
        if (line) delete line.heldBy;
        delete c.exception;
      }
      c.status = 'returned';
      c.returned = { reason, memo, on: ctx.at, byName: who.name };
      c.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'returned', note: reason });
      for (const b of s.state.finance.batches) for (const l of b.lines) if (l.outcome?.kind === 'cheque' && l.outcome.chequeId === c.id) l.outcome.status = 'returned';
      log(ctx, s, 'chequeReturned', { kind: 'cheque', id: c.id, label: c.ref }, { flats: c.flats, values: { reason, payer: c.payerName } });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/cancel$/,
    access: requires('receivables', 'cheque.manage', 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      const c = chequeOf(ctx, s);
      if (c.status !== 'received') refuse(ctx, 409, 'invalid_state');
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 200), 5);
      c.status = 'cancelled';
      c.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'cancelled', note: reason });
      log(ctx, s, 'chequeCancelled', { kind: 'cheque', id: c.id, label: c.ref }, { values: { reason } });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    // The bank took a cleared cheque back: the debit line is the evidence; the reversal needs approval.
    method: 'POST',
    pattern: /^\/cheques\/(?<chequeId>[\w-]+)\/reversal-request$/,
    access: requires('receivables', ['cheque.manage', 'collections.view'], 'operational'),
    handle: (ctx): ChequeDetail => {
      const s = site(ctx);
      if (!can(ctx, 'cheque.manage') && !can(ctx, 'bank.reconcile')) refuse(ctx, 403, 'permission_missing');
      const c = chequeOf(ctx, s);
      if (c.status !== 'cleared' || !c.paymentId) refuse(ctx, 409, 'invalid_state');
      if (s.state.finance.reversals.some((r) => r.chequeId === c.id && r.status === 'pending')) return chequeDetail(ctx, s, c);
      const input = body<{ bankLineId: string; reason: string }>(ctx);
      const checked = lineCheck(chequeReversalCandidates(s.state, c), text(input.bankLineId, 40));
      if (!checked.ok) refuse(ctx, 409, checked.problem, 'bankLineId');
      // The debit must be this cheque's amount and number at least (the bank's return memo shows both).
      if (checked.ok && (checked.missing.includes('amount') || checked.missing.includes('reference'))) refuse(ctx, 409, 'reversal_line_mismatch', 'bankLineId');
      const reason = required(ctx, 'reason', text(input.reason, 300), 5);
      if (!checked.ok) return chequeDetail(ctx, s, c);
      assertOpen(ctx, s, checked.line.valueDate, 'reversal');
      const payment = s.state.payments.find((p) => p.id === c.paymentId)!;
      const approval = requestReversal(ctx, s, payment, reason, { chequeId: c.id, bankLineId: checked.line.id });
      s.state.bank.lines.find((l) => l.id === checked.line.id)!.heldBy = { kind: 'cheque', id: c.id, ref: c.ref };
      c.reversal = { approvalId: approval.id, approvalRef: approval.ref, reason, bankLineId: checked.line.id };
      c.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'reversal_requested', note: reason });
      save(ctx);
      return chequeDetail(ctx, s, c);
    },
  },
  {
    // A cash payment entered in error is corrected only by an approved reversal (never edited or deleted).
    method: 'POST',
    pattern: /^\/payments\/(?<paymentId>[\w-]+)\/reversal-request$/,
    access: requires('receivables', 'payment.receive', 'operational'),
    handle: (ctx) => {
      const s = site(ctx);
      const payment = s.state.payments.find((p) => p.id === ctx.params.paymentId);
      if (!payment) notFound(ctx);
      if (payment!.reversal) refuse(ctx, 409, 'already_reversed');
      // Bank transfers are refunds (a later gate); cheques are reversed on the bank's debit line.
      if (payment!.method !== 'office_cash') refuse(ctx, 409, 'reversal_not_supported');
      if (s.state.finance.reversals.some((r) => r.paymentId === payment!.id && r.status === 'pending')) refuse(ctx, 409, 'reversal_pending');
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 10);
      assertOpen(ctx, s, ctx.at, 'reversal');
      const approval = requestReversal(ctx, s, payment!, reason, {});
      save(ctx);
      return { approvalId: approval.id, approvalRef: approval.ref, href: FIN_ROUTES.approval(approval.id) };
    },
  },
];
