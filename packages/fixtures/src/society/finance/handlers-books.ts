import {
  RECEIPT_CATEGORIES,
  S1_FEATURES,
  TRANSFER_KINDS,
  VOUCHER_CATEGORIES,
  type CashCount,
  type CashVoucher,
  type CashbookView,
  type CloseChecklist,
  type DemoStatementFile,
  type DemoStatementItem,
  type DemoStatementOptions,
  type FinanceAccountDetail,
  type FinanceAccountRow,
  type FinanceOverview,
  type FundsTransfer,
  type SettlementConfirmation,
  type TransferDetail,
  type TransferKind,
  type TransferLeg,
  type TransferList,
  type VoucherCategory,
  type VoucherDetail,
  type VoucherList,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { pad } from '../../seed';
import { ALNOOR_SITE } from '../alnoor';
import { log, save, siteOf, stamp, type Society } from '../handlers';
import { nextRef } from '../state';
import { evaluate, principalsOfParty, raiseApproval } from './approvals';
import { amountField, assertOpen, body, licensed, me, query, refuse, remember, replay, required, text } from './common';
import { balanceOn, cashbookView, cashEvents, financeAccounts, periodState } from './cashbook';
import { DATE, lastDayOf, money, paisa, periodOf, sum } from './model';
import { accountRows, closeChecks, financeOverview } from './overview';
import { FIN_ROUTES } from './routes';
import { legCandidates, lineCheck, consumeLine } from './settle';

/**
 * Cashbook, accounts, vouchers, deposits and transfers, and month close (Gate S.1: BANK-001/002/
 * 006/007/008/009, FIN-001). Every endpoint declares its module, permission, suspension class and
 * the `banking.cashbook` feature; the workflow rules are checked here, never only in forms.
 */

const F = S1_FEATURES.cashbook;

const periodParam = (ctx: HandlerContext): string => (/^\d{4}-(0[1-9]|1[0-2])$/.test(ctx.params.period ?? '') ? ctx.params.period! : notFound(ctx));
const BOOKS = (permission: Parameters<typeof requires>[1], suspension: Parameters<typeof requires>[2]) => requires('banking', permission, suspension, F);

const fin = (ctx: HandlerContext) => siteOf(ctx, 'banking');
const accountsOf = (ctx: HandlerContext, s: Society) => financeAccounts(s.state, ctx.at).filter((a) => a.legalEntityId === s.legalEntityId);

function accountOf(ctx: HandlerContext, s: Society, id: unknown, field = 'accountId') {
  const a = accountsOf(ctx, s).find((x) => x.id === id);
  // Another entity's account (or none) is unknown here: money never moves across legal entities (I-19).
  if (!a) refuse(ctx, 422, 'account_unknown', field);
  return a!;
}

/** S.1 approvals waiting for the signed-in person, and all that wait (for dashboard figures). */
export function approvalCounts(ctx: HandlerContext, s: Society) {
  const pending = s.state.finance.approvals.filter((a) => a.status === 'pending');
  const yours = pending.filter((a) => evaluate(s.state, ctx.tenantId!, a, me(ctx), ctx.at).you.canDecide);
  return { pending: pending.length, yours: yours.length, href: FIN_ROUTES.approvals() };
}

// ---------------------------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------------------------

function voucherOf(ctx: HandlerContext, s: Society): CashVoucher {
  const v = s.state.finance.vouchers.find((x) => x.id === ctx.params.voucherId);
  if (!v) notFound(ctx);
  return v!;
}

function voucherDetail(ctx: HandlerContext, s: Society, v: CashVoucher): VoucherDetail {
  const who = me(ctx);
  const preparer = can(ctx, 'cash_voucher.prepare');
  const closed = periodState(s.state, periodOf(v.onDate)) === 'closed';
  const mine = v.preparedBy === who.principalId;
  const approval = s.state.finance.approvals.find((a) => a.id === v.approvalId);
  const reason = !preparer ? ('permission_missing' as const) : closed && (v.status === 'approved' || v.status === 'draft') ? ('period_closed' as const) : undefined;
  return {
    voucher: v,
    ...(approval ? { approval } : {}),
    periodState: periodState(s.state, periodOf(v.onDate)),
    actions: {
      edit: preparer && mine && v.status === 'draft',
      submit: preparer && mine && v.status === 'draft' && !closed,
      post: preparer && v.status === 'approved' && !closed,
      reverse: preparer && v.status === 'posted' && !v.reversedBy && !v.reversalOf,
      withdraw: preparer && mine && (v.status === 'draft' || v.status === 'submitted'),
      ...(reason ? { reason } : {}),
    },
  };
}

interface VoucherFields {
  accountId: string;
  direction: CashVoucher['direction'];
  category: VoucherCategory;
  amount: bigint;
  onDate: string;
  purpose: string;
  counterparty: { name: string; partyId?: string };
  evidence: CashVoucher['evidence'];
}

/** Checks a voucher as entered: a cash account, a category no other module owns, a dated, evidenced amount. */
function voucherFields(ctx: HandlerContext, s: Society, input: Record<string, unknown>): VoucherFields {
  const account = accountOf(ctx, s, input.accountId);
  // Cash vouchers are for cash accounts only: bank movements are proved by statement lines.
  if (account.kind === 'bank') refuse(ctx, 422, 'voucher_cash_only', 'accountId');
  const direction = input.direction === 'receipt' ? 'receipt' : 'payment';
  const category = String(input.category ?? '') as VoucherCategory;
  if (!VOUCHER_CATEGORIES.includes(category)) refuse(ctx, 422, 'category', 'category');
  if (RECEIPT_CATEGORIES.includes(category) !== (direction === 'receipt')) refuse(ctx, 422, 'category_direction', 'category');
  // D-34: with payables granted, expenses belong to payables; expense vouchers are disabled.
  if (direction === 'payment' && licensed(ctx, 'payables')) refuse(ctx, 409, 'expense_owned_by_payables', 'category');
  const amount = amountField(ctx, 'amount', input.amount);
  const onDate = String(input.onDate ?? '');
  if (!DATE.test(onDate) || onDate > ctx.at || onDate < '2026-09-01') refuse(ctx, 422, 'voucher_date', 'onDate');
  const purpose = required(ctx, 'purpose', text(input.purpose, 200), 5);
  const counterparty = required(ctx, 'counterparty', text(input.counterparty, 120), 2);
  const ev = (input.evidence ?? {}) as { name?: string; kind?: string; size?: number };
  const evidenceName = text(ev.name, 120);
  if (!evidenceName) refuse(ctx, 422, 'evidence_required', 'evidence');
  const kind = (['bill', 'receipt', 'quotation', 'other'] as const).find((k) => k === ev.kind) ?? 'other';
  const partyId = text(input.counterpartyPartyId, 40);
  return { accountId: account.id, direction, category, amount, onDate, purpose, counterparty: { name: counterparty, ...(partyId ? { partyId } : {}) }, evidence: { name: evidenceName, kind, size: Number(ev.size ?? 0) || 0 } };
}

function submitVoucher(ctx: HandlerContext, s: Society, v: CashVoucher) {
  const who = me(ctx);
  const approval = raiseApproval(s.state, {
    subject: 'cash_voucher',
    subjectId: v.id,
    subjectRef: v.ref,
    amount: paisa(v.amount),
    summary: { key: v.reversalOf ? 'voucher_reversal' : v.direction === 'receipt' ? 'voucher_receipt' : 'voucher_payment', values: { purpose: v.purpose, account: v.accountName } },
    href: FIN_ROUTES.voucher(v.id),
    requester: { principalId: who.principalId, name: who.name },
    // The person paid never approves the payment (a committee member reimbursed, for example).
    conflicted: principalsOfParty(v.counterparty.partyId),
    // The policy in force when approval is asked for governs (a late voucher is approved under today's rules).
    on: ctx.at,
    at: stamp(ctx),
  });
  if (!approval) refuse(ctx, 409, 'no_policy_rule');
  Object.assign(v, { status: 'submitted', approvalId: approval!.id, approvalRef: approval!.ref });
  v.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'submitted' });
  log(ctx, s, 'voucherSubmitted', { kind: 'voucher', id: v.id, label: v.ref }, { values: { amount: v.amount.amount, approval: approval!.ref } });
}

function newVoucher(ctx: HandlerContext, s: Society, fields: VoucherFields, extra: Partial<CashVoucher> = {}): CashVoucher {
  const who = me(ctx);
  const f = s.state.finance;
  const account = accountOf(ctx, s, fields.accountId);
  const v: CashVoucher = {
    id: `cvr_anr_${pad(f.vouchers.length + 1, 4)}`,
    ref: nextRef(s.state, 'voucher', fields.onDate),
    legalEntityId: s.legalEntityId,
    siteId: s.siteId,
    accountId: account.id,
    accountName: account.name,
    direction: fields.direction,
    category: fields.category,
    amount: money(fields.amount),
    onDate: fields.onDate,
    purpose: fields.purpose,
    counterparty: fields.counterparty,
    evidence: fields.evidence,
    status: 'draft',
    preparedBy: who.principalId,
    preparedByName: who.name,
    preparedAt: stamp(ctx),
    history: [{ at: stamp(ctx), by: who.principalId, byName: who.name, action: extra.reversalOf ? 'reversal_prepared' : 'prepared' }],
    ...extra,
  };
  f.vouchers.push(v);
  return v;
}

// ---------------------------------------------------------------------------------------------
// Deposits and transfers
// ---------------------------------------------------------------------------------------------

function transferOf(ctx: HandlerContext, s: Society): FundsTransfer {
  const t = s.state.finance.transfers.find((x) => x.id === ctx.params.transferId);
  if (!t) notFound(ctx);
  return t!;
}

const KINDS: Record<TransferKind, [from: 'bank' | 'cash', to: 'bank' | 'cash']> = { deposit: ['cash', 'bank'], withdrawal: ['bank', 'cash'], transfer: ['bank', 'bank'], cash_transfer: ['cash', 'cash'] };
const side = (kind: string) => (kind === 'bank' ? 'bank' : 'cash');

/** What can still leave an account: its settled balance less instructions already taking money out of it. */
function available(ctx: HandlerContext, s: Society, accountId: string): bigint {
  const committed = s.state.finance.transfers
    .filter((t) => t.fromAccountId === accountId && ['awaiting_approval', 'approved_instruction', 'in_transit'].includes(t.status) && t.legs.find((l) => l.leg === 'out')?.status !== 'settled')
    .map((t) => paisa(t.amount));
  return balanceOn(cashEvents(s.state), accountId, ctx.at) - sum(committed);
}

function legOf(ctx: HandlerContext, t: FundsTransfer): TransferLeg {
  const leg = t.legs.find((l) => l.leg === ctx.params.leg);
  if (!leg) notFound(ctx);
  return leg!;
}

function transferDetail(ctx: HandlerContext, s: Society, t: FundsTransfer): TransferDetail {
  const who = me(ctx);
  const live = t.status === 'approved_instruction' || t.status === 'in_transit';
  const preparer = t.preparedBy === who.principalId;
  const legsWhere = (pred: (l: TransferLeg) => boolean) => (live ? t.legs.filter(pred).map((l) => l.leg) : []);
  const cashFirst = (l: TransferLeg) => !(t.kind === 'deposit' && l.leg === 'in' && t.legs.find((x) => x.leg === 'out')?.status !== 'settled');
  const reconciler = can(ctx, 'bank.reconcile') && !preparer;
  return {
    transfer: t,
    ...(t.approvalId ? { approval: s.state.finance.approvals.find((a) => a.id === t.approvalId)! } : {}),
    settlements: s.state.finance.settlements.filter((x) => x.subjectType === 'transfer_leg' && x.subjectId === t.id),
    candidates: {
      out: t.legs[0]!.evidence === 'statement_line' && live ? legCandidates(s.state, t, t.legs[0]!) : [],
      in: t.legs[1]!.evidence === 'statement_line' && live ? legCandidates(s.state, t, t.legs[1]!) : [],
    },
    actions: {
      submit: false,
      cancel: (preparer || can(ctx, 'funds_transfer.approve')) && ['awaiting_approval', 'approved_instruction'].includes(t.status),
      recordSlip: can(ctx, 'funds_transfer.create') ? legsWhere((l) => l.evidence === 'witnessed_slip' && l.status === 'pending') : [],
      witnessSlip: can(ctx, 'funds_transfer.approve') || can(ctx, 'payment.batch.confirm') ? legsWhere((l) => l.status === 'slip_recorded' && l.slip?.recordedBy !== who.principalId) : [],
      match: reconciler ? legsWhere((l) => l.evidence === 'statement_line' && l.status === 'pending' && cashFirst(l)) : [],
      decideException: can(ctx, 'settlement_exception.approve') && !preparer ? legsWhere((l) => l.status === 'exception_pending' && l.exception?.requestedBy !== who.principalId) : [],
      reverse: can(ctx, 'funds_transfer.create') && t.status === 'settled' && !t.reversedBy && !t.reversalOf,
      ...(live && can(ctx, 'bank.reconcile') && preparer ? { reason: 'maker_checker_required' as const } : !can(ctx, 'funds_transfer.create') && !can(ctx, 'bank.reconcile') ? { reason: 'permission_missing' as const } : {}),
    },
  };
}

/** Settles one leg on its evidence (once: a second confirmation of the same leg returns the first, I-28). */
function settleLeg(ctx: HandlerContext, s: Society, t: FundsTransfer, leg: TransferLeg, evidence: Omit<SettlementConfirmation, 'id' | 'subjectType' | 'subjectId' | 'leg' | 'confirmedBy' | 'confirmedByName' | 'at'>): SettlementConfirmation {
  const f = s.state.finance;
  const existing = f.settlements.find((x) => x.subjectType === 'transfer_leg' && x.subjectId === t.id && x.leg === leg.leg);
  if (existing) return existing;
  assertOpen(ctx, s, evidence.settledOn, 'settlement');
  const who = me(ctx);
  const st: SettlementConfirmation = { id: `stl_anr_${pad(f.settlements.length + 1, 4)}`, subjectType: 'transfer_leg', subjectId: t.id, leg: leg.leg, ...evidence, confirmedBy: who.principalId, confirmedByName: who.name, at: stamp(ctx) };
  f.settlements.push(st);
  if (st.bankLineId) consumeLine(s.state, st.bankLineId, { id: st.id, ref: `${t.ref} · ${leg.leg}` });
  Object.assign(leg, { status: 'settled', settlementId: st.id, settledOn: st.settledOn });
  delete leg.exception;
  t.status = t.legs.every((l) => l.status === 'settled') ? 'settled' : 'in_transit';
  t.history.push({ at: st.at, by: who.principalId, byName: who.name, action: t.status === 'settled' ? 'settled' : 'leg_matched', leg: leg.leg });
  log(ctx, s, 'legSettled', { kind: 'transfer', id: t.id, label: t.ref }, { values: { leg: leg.leg, evidence: st.evidenceType, account: leg.accountName, amount: t.amount.amount } });
  return st;
}

// ---------------------------------------------------------------------------------------------
// Demo statement (never settles)
// ---------------------------------------------------------------------------------------------

function demoItems(s: Society, accountId: string): DemoStatementItem[] {
  const f = s.state.finance;
  const items: DemoStatementItem[] = [];
  for (const t of f.transfers.filter((x) => x.status === 'approved_instruction' || x.status === 'in_transit')) {
    for (const leg of t.legs.filter((l) => l.accountId === accountId && l.evidence === 'statement_line' && l.status === 'pending')) {
      // The bank can only show a cash deposit after the cash left the office (its slip is witnessed).
      if (t.kind === 'deposit' && leg.leg === 'in' && t.legs[0]!.status !== 'settled') continue;
      items.push({ id: t.id, kind: 'transfer_leg', leg: leg.leg, ref: t.ref, amount: t.amount, direction: leg.leg === 'out' ? 'debit' : 'credit', describe: { key: `leg_${leg.leg}`, values: { kind: t.kind, purpose: t.purpose } }, variants: ['full', 'partial', 'skip'] });
    }
  }
  for (const c of f.cheques.filter((x) => x.deposit?.accountId === accountId)) {
    if (c.status === 'deposited') items.push({ id: c.id, kind: 'cheque', ref: c.ref, amount: c.amount, direction: 'credit', describe: { key: 'cheque', values: { number: c.chequeNumber, payer: c.payerName } }, variants: ['full', 'partial', 'skip'] });
    if (c.status === 'cleared') items.push({ id: c.id, kind: 'cheque_return', ref: c.ref, amount: c.amount, direction: 'debit', describe: { key: 'cheque_return', values: { number: c.chequeNumber, payer: c.payerName } }, variants: ['skip', 'returned_after_clearing'] });
  }
  return items;
}

const csvCell = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

export const FINANCE_BOOK_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/finance\/overview$/,
    access: BOOKS('cashbook.view', 'history_read'),
    handle: (ctx): FinanceOverview => {
      const s = fin(ctx);
      const period = /^\d{4}-\d{2}$/.test(query(ctx).period ?? '') ? query(ctx).period! : periodOf(ctx.at);
      return { site: { id: s.siteId, name: ALNOOR_SITE.name, legalEntityName: s.state.beneficiaries[0]?.legalEntityName ?? '' }, ...financeOverview(s.view, ctx.at, period, { approvals: approvalCounts(ctx, s) }) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/finance\/accounts$/,
    access: BOOKS(['cashbook.view', 'bank.view'], 'history_read'),
    handle: (ctx): FinanceAccountRow[] => accountRows(fin(ctx).view, ctx.at, periodOf(ctx.at)),
  },
  {
    method: 'GET',
    pattern: /^\/finance\/accounts\/(?<accountId>[\w-]+)$/,
    access: BOOKS(['cashbook.view', 'bank.view'], 'history_read'),
    handle: (ctx): FinanceAccountDetail => {
      const s = fin(ctx);
      const row = accountRows(s.view, ctx.at, periodOf(ctx.at)).find((a) => a.id === ctx.params.accountId);
      if (!row) notFound(ctx);
      const change = s.state.beneficiaryChanges.filter((c) => c.beneficiaryId === row!.id);
      const history =
        row!.kind === 'bank'
          ? [
              ...change.flatMap((c) => [
                { at: c.proposedAt, byName: c.proposedByName, action: 'beneficiary_proposed', note: c.reason },
                ...(c.decidedAt ? [{ at: c.decidedAt, byName: c.decidedByName ?? '', action: 'beneficiary_approved', note: c.effectiveOn ?? '' }] : []),
              ]),
              ...s.state.finance.openings.filter((o) => o.accountId === row!.id).map((o) => ({ at: o.at, byName: o.approvedByName, action: 'opening_approved', note: o.document })),
              ...s.state.bank.statements.filter((st) => st.beneficiaryId === row!.id).map((st) => ({ at: st.importedAt, byName: st.importedByName, action: 'statement_imported', note: st.fileName })),
            ]
          : [
              ...s.state.finance.openings.filter((o) => o.accountId === row!.id).map((o) => ({ at: o.at, byName: o.approvedByName, action: 'opening_approved', note: o.document })),
              ...s.state.finance.cashCounts.filter((c) => c.accountId === row!.id).map((c) => ({ at: c.countedAt, byName: c.countedByName, action: c.status === 'witnessed' ? 'count_witnessed' : 'count_recorded', note: c.counted.amount })),
            ];
      const lastCount = [...s.state.finance.cashCounts].filter((c) => c.accountId === row!.id).sort((a, b) => Date.parse(b.countedAt) - Date.parse(a.countedAt))[0];
      return {
        account: row!,
        history: history.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
        statements: s.state.bank.statements.filter((st) => st.beneficiaryId === row!.id).map((st) => ({ id: st.id, fileName: st.fileName, from: st.from, to: st.to, lines: st.lines, importedAt: st.importedAt, importedByName: st.importedByName })).reverse(),
        lines: s.state.bank.lines.filter((l) => l.beneficiaryId === row!.id).sort((a, b) => b.valueDate.localeCompare(a.valueDate)),
        ...(lastCount ? { lastCount } : {}),
        actions: {
          voucher: row!.kind !== 'bank' && can(ctx, 'cash_voucher.prepare'),
          transfer: can(ctx, 'funds_transfer.create'),
          count: row!.kind !== 'bank' && (can(ctx, 'cash_voucher.prepare') || can(ctx, 'funds_transfer.create') || can(ctx, 'period.close')),
          importStatement: row!.kind === 'bank' && can(ctx, 'bank.reconcile'),
        },
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/finance\/cashbook$/,
    access: BOOKS('cashbook.view', 'history_read'),
    handle: (ctx): CashbookView => {
      const s = fin(ctx);
      const { account, period, category } = query(ctx);
      const p = /^\d{4}-\d{2}$/.test(period ?? '') ? period! : periodOf(ctx.at);
      const accountId = account && account !== 'all' ? accountOf(ctx, s, account, 'account').id : null;
      const view = cashbookView(s.state, ctx.at, accountId, p);
      const lines = category && category !== 'all' ? view.lines.filter((l) => l.category === category) : view.lines;
      return {
        ...view,
        lines,
        actions: {
          voucher: can(ctx, 'cash_voucher.prepare'),
          transfer: can(ctx, 'funds_transfer.create'),
          close: can(ctx, 'period.close'),
          count: can(ctx, 'cash_voucher.prepare') || can(ctx, 'funds_transfer.create') || can(ctx, 'period.close'),
        },
      };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Vouchers (BANK-009)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/finance\/vouchers$/,
    access: BOOKS('cashbook.view', 'history_read'),
    handle: (ctx): VoucherList => {
      const s = fin(ctx);
      const { status } = query(ctx);
      const all = s.state.finance.vouchers;
      const counts = Object.fromEntries((['draft', 'submitted', 'approved', 'posted', 'rejected', 'withdrawn'] as const).map((k) => [k, all.filter((v) => v.status === k).length])) as VoucherList['counts'];
      return { items: [...all].filter((v) => !status || status === 'all' || v.status === status).reverse(), counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)$/,
    access: BOOKS('cashbook.view', 'history_read'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      return voucherDetail(ctx, s, voucherOf(ctx, s));
    },
  },
  {
    // Prepare a voucher; `submit: true` sends it for approval at once. Dated in a closed month: refused.
    method: 'POST',
    pattern: /^\/finance\/vouchers$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const input = body<Record<string, unknown> & { submit: boolean; idempotencyKey: string }>(ctx);
      const key = text(input.idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return voucherDetail(ctx, s, s.state.finance.vouchers.find((v) => v.id === seen)!);
      const fields = voucherFields(ctx, s, input);
      assertOpen(ctx, s, fields.onDate, 'voucher');
      const v = newVoucher(ctx, s, fields);
      log(ctx, s, 'voucherPrepared', { kind: 'voucher', id: v.id, label: v.ref }, { values: { amount: v.amount.amount, account: v.accountName, purpose: v.purpose } });
      if (input.submit) submitVoucher(ctx, s, v);
      remember(s, key, v.id);
      save(ctx);
      return voucherDetail(ctx, s, v);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const v = voucherOf(ctx, s);
      // Only a draft changes, and only by the person who prepared it; a submitted voucher is withdrawn first.
      if (v.status !== 'draft') refuse(ctx, 409, 'invalid_state');
      if (v.preparedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      const fields = voucherFields(ctx, s, body<Record<string, unknown>>(ctx));
      assertOpen(ctx, s, fields.onDate, 'voucher');
      const account = accountOf(ctx, s, fields.accountId);
      Object.assign(v, { ...fields, amount: money(fields.amount), accountName: account.name });
      v.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'edited' });
      save(ctx);
      return voucherDetail(ctx, s, v);
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)\/submit$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const v = voucherOf(ctx, s);
      if (v.status === 'submitted') return voucherDetail(ctx, s, v);
      if (v.status !== 'draft') refuse(ctx, 409, 'invalid_state');
      if (v.preparedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      assertOpen(ctx, s, v.onDate, 'voucher');
      submitVoucher(ctx, s, v);
      save(ctx);
      return voucherDetail(ctx, s, v);
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)\/withdraw$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const v = voucherOf(ctx, s);
      if (v.status !== 'draft' && v.status !== 'submitted') refuse(ctx, 409, 'invalid_state');
      if (v.preparedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      const approval = s.state.finance.approvals.find((a) => a.id === v.approvalId && a.status === 'pending');
      if (approval) Object.assign(approval, { status: 'withdrawn', decidedAt: stamp(ctx) });
      v.status = 'withdrawn';
      v.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'withdrawn' });
      if (v.reversalOf) {
        const original = s.state.finance.vouchers.find((x) => x.id === v.reversalOf!.id);
        if (original?.reversedBy?.id === v.id) delete original.reversedBy;
      }
      log(ctx, s, 'voucherWithdrawn', { kind: 'voucher', id: v.id, label: v.ref });
      save(ctx);
      return voucherDetail(ctx, s, v);
    },
  },
  {
    // An approved voucher enters the cashbook on its date: once, in an open month, never below zero cash.
    method: 'POST',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)\/post$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const v = voucherOf(ctx, s);
      if (v.status === 'posted') return voucherDetail(ctx, s, v);
      if (v.status !== 'approved') refuse(ctx, 409, 'not_approved');
      assertOpen(ctx, s, v.onDate, 'voucher');
      if (v.direction === 'payment') {
        const events = cashEvents(s.state);
        const amount = paisa(v.amount);
        if (balanceOn(events, v.accountId, v.onDate) < amount || balanceOn(events, v.accountId, ctx.at) < amount) refuse(ctx, 409, 'insufficient_cash', 'amount');
      }
      const who = me(ctx);
      Object.assign(v, { status: 'posted', postedBy: who.principalId, postedByName: who.name, postedAt: stamp(ctx) });
      v.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'posted' });
      if (v.reversalOf) {
        const original = s.state.finance.vouchers.find((x) => x.id === v.reversalOf!.id);
        if (original) {
          original.reversedBy = { id: v.id, ref: v.ref };
          original.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'reversed', note: v.ref });
        }
      }
      log(ctx, s, 'voucherPosted', { kind: 'voucher', id: v.id, label: v.ref }, { values: { amount: v.amount.amount, account: v.accountName, date: v.onDate } });
      save(ctx);
      return voucherDetail(ctx, s, v);
    },
  },
  {
    // A posted voucher is never edited: a reversal voucher (opposite direction, same amount) cancels it,
    // dated today in an open month and approved like any voucher.
    method: 'POST',
    pattern: /^\/finance\/vouchers\/(?<voucherId>[\w-]+)\/reverse$/,
    access: BOOKS('cash_voucher.prepare', 'operational'),
    handle: (ctx): VoucherDetail => {
      const s = fin(ctx);
      const v = voucherOf(ctx, s);
      if (v.status !== 'posted' || v.reversalOf) refuse(ctx, 409, 'invalid_state');
      if (v.reversedBy) refuse(ctx, 409, 'already_reversed');
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 5);
      assertOpen(ctx, s, ctx.at, 'voucher');
      const reversal = newVoucher(
        ctx,
        s,
        { accountId: v.accountId, direction: v.direction === 'receipt' ? 'payment' : 'receipt', category: v.category, amount: paisa(v.amount), onDate: ctx.at, purpose: reason, counterparty: v.counterparty, evidence: v.evidence },
        { reversalOf: { id: v.id, ref: v.ref } },
      );
      v.reversedBy = { id: reversal.id, ref: reversal.ref };
      submitVoucher(ctx, s, reversal);
      log(ctx, s, 'voucherReversalPrepared', { kind: 'voucher', id: reversal.id, label: reversal.ref }, { values: { original: v.ref, reason } });
      save(ctx);
      return voucherDetail(ctx, s, reversal);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Deposits and transfers (BANK-006)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/finance\/transfers$/,
    access: BOOKS(['cashbook.view', 'bank.view'], 'history_read'),
    handle: (ctx): TransferList => {
      const s = fin(ctx);
      const { status } = query(ctx);
      const all = s.state.finance.transfers;
      const counts = Object.fromEntries((['draft', 'awaiting_approval', 'approved_instruction', 'in_transit', 'settled', 'rejected', 'cancelled'] as const).map((k) => [k, all.filter((t) => t.status === k).length])) as TransferList['counts'];
      const inTransit = sum(all.filter((t) => t.status === 'in_transit').map((t) => paisa(t.amount)));
      return { items: [...all].filter((t) => !status || status === 'all' || t.status === status).reverse(), counts, inTransit: money(inTransit) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)$/,
    access: BOOKS(['cashbook.view', 'bank.view'], 'history_read'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      return transferDetail(ctx, s, transferOf(ctx, s));
    },
  },
  {
    // An instruction is prepared and sent for approval. Approved, it is still only an instruction:
    // nothing moves in the cashbook until each leg is settled on evidence.
    method: 'POST',
    pattern: /^\/finance\/transfers$/,
    access: BOOKS('funds_transfer.create', 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const input = body<{ kind: string; fromAccountId: string; toAccountId: string; amount: string; purpose: string; bankReference: string; idempotencyKey: string; reversalOf: string }>(ctx);
      const key = text(input.idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return transferDetail(ctx, s, s.state.finance.transfers.find((t) => t.id === seen)!);
      const kind = TRANSFER_KINDS.find((k) => k === input.kind);
      if (!kind) refuse(ctx, 422, 'transfer_kind', 'kind');
      const from = accountOf(ctx, s, input.fromAccountId, 'fromAccountId');
      const to = accountOf(ctx, s, input.toAccountId, 'toAccountId');
      if (from.id === to.id) refuse(ctx, 422, 'same_account', 'toAccountId');
      // Both accounts of the instruction's own legal entity; never another entity's or the platform's (I-15, I-19).
      if (from.legalEntityId !== s.legalEntityId || to.legalEntityId !== s.legalEntityId) refuse(ctx, 403, 'cross_entity_forbidden', 'toAccountId');
      const [fromSide, toSide] = KINDS[kind!];
      if (side(from.kind) !== fromSide || side(to.kind) !== toSide) refuse(ctx, 422, 'transfer_accounts', 'toAccountId');
      const amount = amountField(ctx, 'amount', input.amount);
      if (amount > available(ctx, s, from.id)) refuse(ctx, 409, 'insufficient_funds', 'amount', { available: money(available(ctx, s, from.id)).amount });
      const purpose = required(ctx, 'purpose', text(input.purpose, 200), 5);
      assertOpen(ctx, s, ctx.at, 'transfer');
      const f = s.state.finance;
      const who = me(ctx);
      const id = `trf_anr_${pad(f.transfers.length + 1, 4)}`;
      const ref = nextRef(s.state, 'transfer', ctx.at);
      const leg = (l: 'out' | 'in', a: typeof from): TransferLeg => ({ leg: l, accountId: a.id, accountName: a.name, accountKind: a.kind, ...(a.accountTitle ? { accountTitle: a.accountTitle } : {}), evidence: a.kind === 'bank' ? 'statement_line' : 'witnessed_slip', status: 'pending' });
      const reversalOf = input.reversalOf ? f.transfers.find((t) => t.id === input.reversalOf) : undefined;
      const t: FundsTransfer = {
        id,
        ref,
        legalEntityId: s.legalEntityId,
        siteId: s.siteId,
        kind: kind!,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: money(amount),
        purpose,
        bankReference: text(input.bankReference, 40).toUpperCase() || ref,
        status: 'awaiting_approval',
        preparedBy: who.principalId,
        preparedByName: who.name,
        preparedAt: stamp(ctx),
        legs: [leg('out', from), leg('in', to)],
        ...(reversalOf ? { reversalOf: { id: reversalOf.id, ref: reversalOf.ref } } : {}),
        history: [{ at: stamp(ctx), by: who.principalId, byName: who.name, action: reversalOf ? 'reversal_prepared' : 'prepared' }],
      };
      const approval = raiseApproval(s.state, {
        subject: 'funds_transfer',
        subjectId: id,
        subjectRef: ref,
        amount,
        summary: { key: `transfer_${kind}`, values: { from: from.name, to: to.name, purpose } },
        href: FIN_ROUTES.transfer(id),
        requester: { principalId: who.principalId, name: who.name },
        on: ctx.at,
        at: stamp(ctx),
      });
      if (!approval) refuse(ctx, 409, 'no_policy_rule');
      Object.assign(t, { approvalId: approval!.id, approvalRef: approval!.ref });
      t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'submitted' });
      f.transfers.push(t);
      if (reversalOf) reversalOf.reversedBy = { id, ref };
      remember(s, key, id);
      log(ctx, s, 'transferPrepared', { kind: 'transfer', id, label: ref }, { values: { kind: kind!, from: from.name, to: to.name, amount: t.amount.amount, approval: approval!.ref } });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/cancel$/,
    access: BOOKS(['funds_transfer.create', 'funds_transfer.approve'], 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      if (!['awaiting_approval', 'approved_instruction'].includes(t.status) || t.legs.some((l) => l.status !== 'pending')) refuse(ctx, 409, 'invalid_state');
      if (t.preparedBy !== me(ctx).principalId && !can(ctx, 'funds_transfer.approve')) refuse(ctx, 403, 'not_preparer');
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 5);
      const approval = s.state.finance.approvals.find((a) => a.id === t.approvalId && a.status === 'pending');
      if (approval) Object.assign(approval, { status: 'withdrawn', decidedAt: stamp(ctx) });
      t.status = 'cancelled';
      t.history.push({ at: stamp(ctx), by: me(ctx).principalId, byName: me(ctx).name, action: 'cancelled', note: reason });
      if (t.reversalOf) {
        const original = s.state.finance.transfers.find((x) => x.id === t.reversalOf!.id);
        if (original?.reversedBy?.id === t.id) delete original.reversedBy;
      }
      log(ctx, s, 'transferCancelled', { kind: 'transfer', id: t.id, label: t.ref }, { values: { reason } });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    // Cash side: the slip is recorded by one person (who took or received the cash) …
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/legs\/(?<leg>[\w-]+)\/slip$/,
    access: BOOKS('funds_transfer.create', 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      const leg = legOf(ctx, t);
      if (!['approved_instruction', 'in_transit'].includes(t.status)) refuse(ctx, 409, 'not_approved');
      if (leg.evidence !== 'witnessed_slip' || leg.status !== 'pending') refuse(ctx, 409, 'invalid_state');
      const input = body<{ slipNo: string; on: string }>(ctx);
      const slipNo = required(ctx, 'slipNo', text(input.slipNo, 40), 3);
      const on = String(input.on ?? ctx.at);
      if (!DATE.test(on) || on > ctx.at || on < t.preparedAt.slice(0, 10)) refuse(ctx, 422, 'slip_date', 'on');
      assertOpen(ctx, s, on, 'settlement');
      const who = me(ctx);
      Object.assign(leg, { status: 'slip_recorded', slip: { number: slipNo, on, recordedBy: who.principalId, recordedByName: who.name, recordedAt: stamp(ctx) } });
      t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'slip_recorded', leg: leg.leg, note: slipNo });
      log(ctx, s, 'slipRecorded', { kind: 'transfer', id: t.id, label: t.ref }, { values: { leg: leg.leg, slip: slipNo } });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    // … and witnessed by another: only then does the cash leg settle (cash in transit for a deposit).
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/legs\/(?<leg>[\w-]+)\/witness$/,
    access: BOOKS(['funds_transfer.approve', 'payment.batch.confirm'], 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      const leg = legOf(ctx, t);
      if (leg.status === 'settled') return transferDetail(ctx, s, t);
      if (leg.status !== 'slip_recorded' || !leg.slip) refuse(ctx, 409, 'invalid_state');
      const who = me(ctx);
      if (leg.slip!.recordedBy === who.principalId) refuse(ctx, 403, 'witness_not_recorder');
      Object.assign(leg.slip!, { witnessedBy: who.principalId, witnessedByName: who.name, witnessedAt: stamp(ctx) });
      t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'slip_witnessed', leg: leg.leg });
      settleLeg(ctx, s, t, leg, { evidenceType: 'witnessed_deposit_slip', slipNo: leg.slip!.number, settledOn: leg.slip!.on });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    // Bank side: a fully matching statement line of the leg's own account settles it; nothing else does.
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/legs\/(?<leg>[\w-]+)\/match$/,
    access: BOOKS('bank.reconcile', 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      const leg = legOf(ctx, t);
      if (leg.status === 'settled') return transferDetail(ctx, s, t);
      if (!['approved_instruction', 'in_transit'].includes(t.status)) refuse(ctx, 409, 'not_approved');
      if (leg.evidence !== 'statement_line' || leg.status !== 'pending') refuse(ctx, 409, 'invalid_state');
      if (t.preparedBy === me(ctx).principalId) refuse(ctx, 403, 'maker_checker_required');
      if (t.kind === 'deposit' && leg.leg === 'in' && t.legs[0]!.status !== 'settled') refuse(ctx, 409, 'cash_leg_first');
      const lineId = text(body<{ bankLineId: string }>(ctx).bankLineId, 40);
      if (!lineId) refuse(ctx, 422, 'bank_evidence_required', 'bankLineId');
      const checked = lineCheck(legCandidates(s.state, t, leg), lineId);
      if (!checked.ok) refuse(ctx, 409, checked.problem, 'bankLineId');
      if (checked.ok && checked.missing.length) refuse(ctx, 409, 'exception_required', 'bankLineId', { missing: checked.missing.join(', ') });
      if (checked.ok) settleLeg(ctx, s, t, leg, { evidenceType: 'statement_line', bankLineId: checked.line.id, bankTxnId: checked.line.bankTxnId, settledOn: checked.line.valueDate });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    // A partly matching line: proposed with a reason and held; a second person decides.
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/legs\/(?<leg>[\w-]+)\/exception$/,
    access: BOOKS('bank.reconcile', 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      const leg = legOf(ctx, t);
      if (!['approved_instruction', 'in_transit'].includes(t.status) || leg.evidence !== 'statement_line' || leg.status !== 'pending') refuse(ctx, 409, 'invalid_state');
      if (t.preparedBy === me(ctx).principalId) refuse(ctx, 403, 'maker_checker_required');
      const input = body<{ bankLineId: string; reason: string }>(ctx);
      const checked = lineCheck(legCandidates(s.state, t, leg), text(input.bankLineId, 40));
      if (!checked.ok) refuse(ctx, 409, checked.problem, 'bankLineId');
      if (checked.ok && !checked.missing.length) refuse(ctx, 409, 'full_match_use_match', 'bankLineId');
      const reason = required(ctx, 'reason', text(input.reason, 300), 10);
      if (!checked.ok) return transferDetail(ctx, s, t);
      const who = me(ctx);
      leg.status = 'exception_pending';
      leg.exception = { bankLineId: checked.line.id, bankTxnId: checked.line.bankTxnId, missing: checked.missing, reason, requestedBy: who.principalId, requestedByName: who.name, requestedAt: stamp(ctx) };
      const line = s.state.bank.lines.find((l) => l.id === checked.line.id)!;
      line.heldBy = { kind: 'transfer', id: t.id, ref: t.ref };
      t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_requested', leg: leg.leg, note: reason });
      log(ctx, s, 'legExceptionRequested', { kind: 'transfer', id: t.id, label: t.ref }, { values: { leg: leg.leg, missing: checked.missing.join(', '), reason } });
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/legs\/(?<leg>[\w-]+)\/exception\/(?<decision>[\w-]+)$/,
    access: BOOKS('settlement_exception.approve', 'operational'),
    handle: (ctx): TransferDetail => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      const leg = legOf(ctx, t);
      if (!['approve', 'reject'].includes(ctx.params.decision!)) notFound(ctx);
      if (leg.status !== 'exception_pending' || !leg.exception) refuse(ctx, 409, 'invalid_state');
      const who = me(ctx);
      // Never the person who asked for the exception, nor the instruction's preparer.
      if (leg.exception!.requestedBy === who.principalId || t.preparedBy === who.principalId) refuse(ctx, 403, 'maker_checker_required');
      const note = text(body<{ note: string }>(ctx).note, 300);
      const ex = leg.exception!;
      const line = s.state.bank.lines.find((l) => l.id === ex.bankLineId)!;
      if (ctx.params.decision === 'reject') {
        delete line.heldBy;
        leg.status = 'pending';
        delete leg.exception;
        t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_rejected', leg: leg.leg, note });
        log(ctx, s, 'legExceptionRejected', { kind: 'transfer', id: t.id, label: t.ref }, { values: { leg: leg.leg, note } });
      } else {
        t.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'exception_approved', leg: leg.leg, note });
        leg.status = 'pending';
        settleLeg(ctx, s, t, leg, {
          evidenceType: 'statement_line',
          bankLineId: line.id,
          bankTxnId: line.bankTxnId,
          settledOn: line.valueDate,
          exception: { missing: ex.missing, reason: ex.reason, requestedBy: ex.requestedBy, requestedByName: ex.requestedByName, approvedBy: who.principalId, approvedByName: who.name },
        });
      }
      save(ctx);
      return transferDetail(ctx, s, t);
    },
  },
  {
    // A settled transfer is never edited: a reversing instruction moves the money back, approved and evidenced.
    method: 'POST',
    pattern: /^\/finance\/transfers\/(?<transferId>[\w-]+)\/reverse$/,
    access: BOOKS('funds_transfer.create', 'operational'),
    handle: (ctx): { reversalOf: string; kind: TransferKind; fromAccountId: string; toAccountId: string; amount: string } => {
      const s = fin(ctx);
      const t = transferOf(ctx, s);
      if (t.status !== 'settled' || t.reversalOf) refuse(ctx, 409, 'invalid_state');
      if (t.reversedBy) refuse(ctx, 409, 'already_reversed');
      const back: Record<TransferKind, TransferKind> = { deposit: 'withdrawal', withdrawal: 'deposit', transfer: 'transfer', cash_transfer: 'cash_transfer' };
      // The reversing instruction is prepared through the ordinary endpoint (same checks and approval).
      return { reversalOf: t.id, kind: back[t.kind], fromAccountId: t.toAccountId, toAccountId: t.fromAccountId, amount: t.amount.amount };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Cash counts and month close (BANK-008)
  // -------------------------------------------------------------------------------------------
  {
    method: 'POST',
    pattern: /^\/finance\/cash-counts$/,
    access: BOOKS(['cash_voucher.prepare', 'funds_transfer.create', 'period.close'], 'operational'),
    handle: (ctx): CashCount => {
      const s = fin(ctx);
      const input = body<{ accountId: string; denominations: Array<{ note: string; count: number }> }>(ctx);
      const account = accountOf(ctx, s, input.accountId);
      if (account.kind === 'bank') refuse(ctx, 422, 'count_cash_only', 'accountId');
      const notes = (Array.isArray(input.denominations) ? input.denominations : []).map((d) => ({ note: String(d.note), count: Math.max(0, Math.floor(Number(d.count) || 0)) })).filter((d) => /^\d{1,5}$/.test(d.note) && d.count > 0);
      const counted = sum(notes.map((d) => BigInt(d.note) * BigInt(d.count) * 100n));
      const who = me(ctx);
      const c: CashCount = {
        id: `cct_anr_${pad(s.state.finance.cashCounts.length + 1, 4)}`,
        accountId: account.id,
        accountName: account.name,
        onDate: ctx.at,
        counted: money(counted),
        expected: money(balanceOn(cashEvents(s.state), account.id, ctx.at)),
        denominations: notes,
        countedBy: who.principalId,
        countedByName: who.name,
        countedAt: stamp(ctx),
        status: 'awaiting_witness',
      };
      s.state.finance.cashCounts.push(c);
      log(ctx, s, 'cashCounted', { kind: 'cash_count', id: c.id, label: account.name }, { values: { counted: c.counted.amount, expected: c.expected.amount } });
      save(ctx);
      return c;
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/cash-counts\/(?<countId>[\w-]+)\/witness$/,
    access: BOOKS(['period.close', 'payment.batch.confirm'], 'operational'),
    handle: (ctx): CashCount => {
      const s = fin(ctx);
      const c = s.state.finance.cashCounts.find((x) => x.id === ctx.params.countId);
      if (!c) notFound(ctx);
      if (c!.status === 'witnessed') return c!;
      const who = me(ctx);
      if (c!.countedBy === who.principalId) refuse(ctx, 403, 'witness_not_recorder');
      Object.assign(c!, { status: 'witnessed', witnessedBy: who.principalId, witnessedByName: who.name, witnessedAt: stamp(ctx) });
      log(ctx, s, 'cashCountWitnessed', { kind: 'cash_count', id: c!.id, label: c!.accountName }, { values: { counted: c!.counted.amount, expected: c!.expected.amount } });
      save(ctx);
      return c!;
    },
  },
  {
    method: 'GET',
    pattern: /^\/finance\/periods\/(?<period>[\w-]+)\/checklist$/,
    access: BOOKS('cashbook.view', 'history_read'),
    handle: (ctx): CloseChecklist => closeChecklist(ctx, fin(ctx), periodParam(ctx)),
  },
  {
    // Closing locks the month: postings dated in it are refused until an approved reopening.
    method: 'POST',
    pattern: /^\/finance\/periods\/(?<period>[\w-]+)\/close$/,
    access: BOOKS('period.close', 'operational'),
    handle: (ctx): CloseChecklist => {
      const s = fin(ctx);
      const period = periodParam(ctx);
      const list = closeChecklist(ctx, s, period);
      if (list.period.state === 'closed') return list;
      if (!list.canClose) refuse(ctx, 409, 'blocking_checks');
      const who = me(ctx);
      const f = s.state.finance;
      let p = f.periods.find((x) => x.period === period);
      if (!p) {
        p = { id: `fpd_anr_${period.replace('-', '')}`, legalEntityId: s.legalEntityId, period, state: 'open', history: [] };
        f.periods.push(p);
      }
      Object.assign(p, { state: 'closed', closedBy: who.principalId, closedByName: who.name, closedAt: stamp(ctx), cashCountIds: list.cashAccounts.map((c) => c.counted?.id).filter((x): x is string => !!x) });
      p.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'closed', note: list.checks.filter((c) => c.outcome === 'warning').map((c) => c.key).join(', ') });
      log(ctx, s, 'periodClosed', { kind: 'period', id: p.id, label: period });
      save(ctx);
      return closeChecklist(ctx, s, period);
    },
  },
  {
    // Reopening a closed month is an approval under the policy in force (never by the person asking).
    method: 'POST',
    pattern: /^\/finance\/periods\/(?<period>[\w-]+)\/reopen-request$/,
    access: BOOKS('period.close', 'operational'),
    handle: (ctx): CloseChecklist => {
      const s = fin(ctx);
      const p = s.state.finance.periods.find((x) => x.period === ctx.params.period);
      if (!p || p.state !== 'closed') refuse(ctx, 409, 'not_closed');
      const pending = s.state.finance.approvals.find((a) => a.subject === 'period_reopen' && a.subjectId === p!.id && a.status === 'pending');
      if (pending) return closeChecklist(ctx, s, p!.period);
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 10);
      const who = me(ctx);
      const approval = raiseApproval(s.state, {
        subject: 'period_reopen',
        subjectId: p!.id,
        subjectRef: p!.period,
        summary: { key: 'period_reopen', values: { period: p!.period, reason } },
        href: FIN_ROUTES.close(p!.period),
        requester: { principalId: who.principalId, name: who.name },
        on: ctx.at,
        at: stamp(ctx),
      });
      if (!approval) refuse(ctx, 409, 'no_policy_rule');
      p!.reopenApprovalId = approval!.id;
      p!.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'reopen_requested', note: reason });
      log(ctx, s, 'reopenRequested', { kind: 'period', id: p!.id, label: p!.period }, { values: { reason, approval: approval!.ref } });
      save(ctx);
      return closeChecklist(ctx, s, p!.period);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Demo helper: a sample statement for what waits on bank evidence (never settles anything)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/finance\/demo-statement$/,
    access: BOOKS('bank.view', 'history_read'),
    handle: (ctx): DemoStatementOptions => {
      const s = fin(ctx);
      const account = accountOf(ctx, s, query(ctx).account, 'account');
      if (account.kind !== 'bank') refuse(ctx, 422, 'statement_bank_only', 'account');
      return { account: { id: account.id, name: account.name, iban: account.iban ?? '' }, items: demoItems(s, account.id) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/finance\/demo-statement$/,
    access: BOOKS('bank.view', 'history_read'),
    handle: (ctx): DemoStatementFile => {
      const s = fin(ctx);
      const input = body<{ accountId: string; choices: Array<{ id: string; leg?: string; kind: string; variant: string }> }>(ctx);
      const account = accountOf(ctx, s, input.accountId);
      if (account.kind !== 'bank') refuse(ctx, 422, 'statement_bank_only', 'accountId');
      const items = demoItems(s, account.id);
      const f = s.state.finance;
      const n = (s.state.counters['demo_statement'] = (s.state.counters['demo_statement'] ?? 0) + 1);
      const rows: string[][] = [];
      for (const choice of Array.isArray(input.choices) ? input.choices : []) {
        const item = items.find((i) => i.id === choice.id && i.kind === choice.kind && (i.leg ?? '') === (choice.leg ?? ''));
        if (!item || choice.variant === 'skip' || !item.variants.includes(choice.variant as never)) continue;
        const partial = choice.variant === 'partial';
        const txn = `DEMO-S1-${ctx.at.replace(/-/g, '')}-${pad(n, 2)}${pad(rows.length + 1, 2)}`;
        if (item.kind === 'transfer_leg') {
          const t = f.transfers.find((x) => x.id === item.id)!;
          const leg = t.legs.find((l) => l.leg === item.leg)!;
          const on = t.kind === 'deposit' && leg.leg === 'in' ? (t.legs[0]!.slip?.on ?? ctx.at) : ctx.at;
          const other = t.legs.find((l) => l.leg !== leg.leg)!;
          const name = t.kind === 'deposit' && leg.leg === 'in' ? `CASH DEPOSIT ${t.legs[0]!.slip?.number ?? ''}`.trim() : t.kind === 'withdrawal' && leg.leg === 'out' ? 'CASH WITHDRAWAL' : (other.accountTitle ?? other.accountName).toUpperCase();
          // A partial line leaves out the instruction's reference (the bank printed something else).
          const reference = partial ? 'INTERNAL TRF' : t.bankReference;
          rows.push([txn, on, `${leg.leg === 'out' ? '-' : ''}${t.amount.amount}`, `${leg.leg === 'out' ? 'DR' : 'CR'} ${name} ${reference}`, reference, name, '—']);
        } else {
          const c = f.cheques.find((x) => x.id === item.id)!;
          const on = item.kind === 'cheque' ? (c.deposit?.on ?? ctx.at) : ctx.at;
          const name = partial ? 'CLEARING' : c.payerName.toUpperCase();
          if (item.kind === 'cheque') rows.push([txn, on, c.amount.amount, `CHQ CLG ${c.chequeNumber} ${name}`, `CHQ ${c.chequeNumber}`, name, '—']);
          else rows.push([txn, on, `-${c.amount.amount}`, `RETURNED CHQ ${c.chequeNumber} ${c.payerName.toUpperCase()}`, `CHQ ${c.chequeNumber}`, c.payerName.toUpperCase(), '—']);
        }
      }
      const dates = rows.map((r) => r[1]!).sort();
      const content = [`#account=${account.iban}`, '#sample=Demo document, fictional data', 'txn_id,value_date,amount,narration,reference,counterparty,counterparty_account', ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
      save(ctx);
      return { fileName: `sample-statement-${(account.iban ?? '').slice(-4)}-${pad(n, 2)}.csv`, from: dates[0] ?? ctx.at, to: dates[dates.length - 1] ?? ctx.at, content, lines: rows.length };
    },
  },
];

export function closeChecklist(ctx: HandlerContext, s: Society, period: string): CloseChecklist {
  const f = s.state.finance;
  const stored = f.periods.find((p) => p.period === period) ?? { id: `fpd_anr_${period.replace('-', '')}`, legalEntityId: s.legalEntityId, period, state: periodState(s.state, period), history: [] };
  const { checks, cashAccounts } = closeChecks(s.view, period, ctx.at);
  const canClose = stored.state !== 'closed' && checks.every((c) => c.outcome !== 'blocking');
  const reopen = stored.reopenApprovalId ? f.approvals.find((a) => a.id === stored.reopenApprovalId) : undefined;
  const closer = can(ctx, 'period.close');
  const who = me(ctx);
  return {
    period: stored,
    checks,
    counts: f.cashCounts.filter((c) => c.onDate >= lastDayOf(period)).sort((a, b) => Date.parse(b.countedAt) - Date.parse(a.countedAt)),
    cashAccounts,
    canClose,
    actions: {
      close: closer && canClose,
      count: can(ctx, 'cash_voucher.prepare') || can(ctx, 'funds_transfer.create') || closer,
      witness: (closer || can(ctx, 'payment.batch.confirm')) && f.cashCounts.some((c) => c.status === 'awaiting_witness' && c.countedBy !== who.principalId),
      requestReopen: closer && stored.state === 'closed' && !(reopen && reopen.status === 'pending'),
      ...(!closer ? { reason: 'permission_missing' as const } : stored.state !== 'closed' && !canClose ? { reason: 'blocking_checks' as const } : {}),
    },
    ...(reopen ? { reopenApproval: reopen } : {}),
  };
}
