import type {
  BillSummary,
  BillView,
  BudgetSummary,
  BudgetVersionView,
  BudgetView,
  CashCountView,
  CostCentreRef,
  DeveloperState,
  DevLegalEntity,
  ExpenseSummary,
  ExpenseView,
  PayablesEvent,
  PayEntityRef,
  PaymentSummary,
  PaymentView,
  PayScope,
  PettyCashFloatView,
  Permission,
  SupplierBankView,
  SupplierSummary,
  TopUpView,
} from '@repo/contracts';
import { can as holds, notFound, type HandlerContext } from '../../handler-types';
import { projectHistory, wholeOnly } from '../../projection';
import { seesBank as seesBankFor } from '../ledger/scope';
import { costCentreVisible, entityVisible, entityWhole, type ScopeNeed } from '../scope';
import { developerState } from '../state';
import { approvedVersion, BILL_FROM, BUDGET_FROM, can, EXPENSE_FROM, instructable, instructedOn, lineTotal, LIVE_PAYMENTS, money, openVersion, PAYMENT_FROM, sum, paisa } from './rules';
import { payablesState, payablesStateForWrite, type PayablesState, type StoredBill, type StoredBudget, type StoredEvent, type StoredExpense, type StoredFloat, type StoredPayment, type StoredSupplier } from './state';

/**
 * Gate E.8 read models, worked out per request from the reader's current access (a revoked or narrowed
 * grant applies at once), with E.0's canonical helpers only:
 * - **Scope** (`developer/scope.ts`). Suppliers are legal-entity records (`entityVisible`). A bill is
 *   visible only when the reader sees its entity and **every** cost centre its lines touch
 *   (`costCentreVisible`): a reader never gets part of a bill. An expense, a petty-cash float and a budget
 *   each belong to one cost centre. Anything else is treated as never issued (404, left out of lists
 *   and counts).
 * - **Projection** (`projection.ts`). Entity-wide totals are `wholeOnly` (withheld from a partial reader,
 *   never recomputed); a supplier's activity is projected with `projectHistory` (an event about a bill
 *   the reader cannot see is left out).
 * - **Bank boundary** (Wave 2 integration: E.7's canonical one, `ledger/scope.ts` `seesBank`). A supplier's
 *   payee account (masked, last four only) and the paying account appear only to a reader who holds
 *   `bank.view` (or `bank.reconcile`) over the WHOLE legal entity, on the banking module, exactly as E.7's
 *   ledger and statement screens decide it; nothing else in payables names a bank. The paying account is
 *   E.0's registered collection account (masked at the source, the account E.7 imports as `dca_lsp_01`).
 * - The header project filter is a view of projects; payables are scoped by legal entity and cost centre
 *   (register scope), so it is not applied here.
 */

export const SUP_VIEW: ScopeNeed = { module: 'payables', permission: 'supplier.view' };
export const SUP_MANAGE: ScopeNeed = { module: 'payables', permission: 'supplier.manage' };
export const BILL_APPROVE: ScopeNeed = { module: 'payables', permission: 'supplier_bill.approve' };
export const PAY_APPROVE: ScopeNeed = { module: 'payables', permission: 'supplier_payment.approve' };
export const EXP_VIEW: ScopeNeed = { module: 'payables', permission: 'expense.view' };
export const EXP_CREATE: ScopeNeed = { module: 'payables', permission: 'expense.create' };
export const EXP_APPROVE: ScopeNeed = { module: 'payables', permission: 'expense.approve' };
export const BUD_MANAGE: ScopeNeed = { module: 'payables', permission: 'budget.manage' };
export const BUD_APPROVE: ScopeNeed = { module: 'payables', permission: 'budget.approve' };

export interface Px {
  ctx: HandlerContext;
  st: PayablesState;
  dev: DeveloperState;
}

/** The reader's payables context (reads never store anything). Another kind of organisation has no records: 404. */
export function readPx(ctx: HandlerContext): Px {
  const dev = developerState(ctx);
  if (!dev) notFound(ctx);
  return { ctx, st: payablesState(ctx), dev };
}

/** The live section, for a handler whose every check has passed. */
export function writePx(p: Px): Px {
  return { ...p, st: payablesStateForWrite(p.ctx) };
}

export const may = (p: Px, permission: Permission) => holds(p.ctx, permission);
export const me = (p: Px) => ({ principalId: p.ctx.persona?.principalId ?? '', name: p.ctx.persona?.displayName ?? '' });
/** E.7's bank boundary for one legal entity (a narrowed or revoked grant applies at once). */
export const seesBank = (p: Px, entityId: string) => seesBankFor(p.ctx, entityId);

export const entityRef = (e: DevLegalEntity): PayEntityRef => ({ id: e.id, name: e.name, code: e.code });
export const entityOf = (p: Px, id: string): PayEntityRef => entityRef(p.dev.legalEntities.find((e) => e.id === id)!);

export function ccRef(p: Px, id: string): CostCentreRef {
  const c = p.dev.costCentres.find((x) => x.id === id);
  if (!c) return { id, code: id, name: id, kind: 'head_office' };
  return { id: c.id, code: c.code, name: c.name, kind: c.kind, ...(c.projectId ? { projectId: c.projectId } : {}) };
}
const projectName = (p: Px, id: string | undefined) => (id ? p.ctx.data.projects.find((x) => x.id === id)?.name : undefined);

/** The entity a list is for: `?entity=` (a hidden, unknown or other organisation's entity answers 404) or the reader's first. */
export function scopeOf(p: Px, need: ScopeNeed): PayScope {
  const visible = p.dev.legalEntities.filter((e) => entityVisible(p.ctx, e.id, need));
  const raw = p.ctx.req.query?.entity;
  const named = raw === undefined || raw === '' ? undefined : String(raw);
  const entity = named !== undefined ? visible.find((e) => e.id === named) : visible[0];
  if (!entity) notFound(p.ctx);
  return { entity: entityRef(entity), entities: visible.map(entityRef), scopeLimited: !entityWhole(p.ctx, entity.id, need) };
}

// ---- visibility -------------------------------------------------------------------------------

export const supplierVisible = (p: Px, s: StoredSupplier, need: ScopeNeed = SUP_VIEW) => entityVisible(p.ctx, s.legalEntityId, need);
export const billVisible = (p: Px, b: StoredBill, need: ScopeNeed = SUP_VIEW) =>
  entityVisible(p.ctx, b.legalEntityId, need) && b.lines.length > 0 && b.lines.every((l) => costCentreVisible(p.ctx, p.dev, l.costCentreId, need) && p.dev.costCentres.find((c) => c.id === l.costCentreId)?.legalEntityId === b.legalEntityId);
export const paymentVisible = (p: Px, x: StoredPayment, need: ScopeNeed = SUP_VIEW) => {
  const b = p.st.bills.find((y) => y.id === x.billId);
  return !!b && billVisible(p, b, need);
};
export const expenseVisible = (p: Px, e: StoredExpense, need: ScopeNeed = EXP_VIEW) => costCentreVisible(p.ctx, p.dev, e.costCentreId, need) && ccEntity(p, e.costCentreId) === e.legalEntityId;
export const floatVisible = (p: Px, f: StoredFloat, need: ScopeNeed = EXP_VIEW) => costCentreVisible(p.ctx, p.dev, f.costCentreId, need) && ccEntity(p, f.costCentreId) === f.legalEntityId;
export const budgetVisible = (p: Px, b: StoredBudget, need: ScopeNeed = EXP_VIEW) => costCentreVisible(p.ctx, p.dev, b.costCentreId, need) && ccEntity(p, b.costCentreId) === b.legalEntityId;
export const ccEntity = (p: Px, ccId: string) => p.dev.costCentres.find((c) => c.id === ccId)?.legalEntityId;

/** The cost centres of an entity the reader may use for a need (pickers: never one outside scope). */
export const usableCostCentres = (p: Px, entityId: string, need: ScopeNeed): CostCentreRef[] =>
  p.dev.costCentres.filter((c) => c.legalEntityId === entityId && costCentreVisible(p.ctx, p.dev, c.id, need)).map((c) => ccRef(p, c.id));

// ---- finders: an id out of scope answers exactly like an id never issued ------------------------

export function findSupplier(p: Px, id: string | undefined, need: ScopeNeed = SUP_VIEW): StoredSupplier {
  const s = id ? p.st.suppliers.find((x) => x.id === id) : undefined;
  if (!s || !supplierVisible(p, s, need)) notFound(p.ctx);
  return s;
}
export function findBill(p: Px, id: string | undefined, need: ScopeNeed = SUP_VIEW): StoredBill {
  const b = id ? p.st.bills.find((x) => x.id === id) : undefined;
  if (!b || !billVisible(p, b, need)) notFound(p.ctx);
  return b;
}
export function findPayment(p: Px, id: string | undefined, need: ScopeNeed = SUP_VIEW): StoredPayment {
  const x = id ? p.st.payments.find((y) => y.id === id) : undefined;
  if (!x || !paymentVisible(p, x, need)) notFound(p.ctx);
  return x;
}
export function findExpense(p: Px, id: string | undefined, need: ScopeNeed = EXP_VIEW): StoredExpense {
  const e = id ? p.st.expenses.find((x) => x.id === id) : undefined;
  if (!e || !expenseVisible(p, e, need)) notFound(p.ctx);
  return e;
}
export function findFloat(p: Px, id: string | undefined, need: ScopeNeed = EXP_VIEW): StoredFloat {
  const f = id ? p.st.floats.find((x) => x.id === id) : undefined;
  if (!f || !floatVisible(p, f, need)) notFound(p.ctx);
  return f;
}
export function findBudget(p: Px, id: string | undefined, need: ScopeNeed = EXP_VIEW): StoredBudget {
  const b = id ? p.st.budgets.find((x) => x.id === id) : undefined;
  if (!b || !budgetVisible(p, b, need)) notFound(p.ctx);
  return b;
}

// ---- views --------------------------------------------------------------------------------------

const event = (e: StoredEvent): PayablesEvent => ({ at: e.at, ...(e.by ? { by: e.by } : {}), ...(e.byName ? { byName: e.byName } : {}), action: e.action, ...(e.values ? { values: e.values } : {}), ...(e.note ? { note: e.note } : {}) });

export const billTotal = (b: StoredBill) => money(lineTotal(b.lines));

export function billSummary(p: Px, b: StoredBill): BillSummary {
  const s = p.st.suppliers.find((x) => x.id === b.supplierId);
  return {
    id: b.id,
    ref: b.ref,
    kind: b.kind,
    supplierId: b.supplierId,
    supplierName: s?.name ?? '',
    supplierInvoiceNo: b.supplierInvoiceNo,
    invoiceDate: b.invoiceDate,
    dueDate: b.dueDate,
    total: billTotal(b),
    state: b.state,
    posting: 'planned',
    settlement: 'not_settled',
    instructed: money(instructedOn(p.st.payments, b.id)),
    costCentres: [...new Set(b.lines.map((l) => l.costCentreId))],
    ...(b.utility ? { utility: b.utility } : {}),
    demo: b.demo,
  };
}

export function paymentSummary(p: Px, x: StoredPayment): PaymentSummary {
  const b = p.st.bills.find((y) => y.id === x.billId);
  return {
    id: x.id,
    ref: x.ref,
    billId: x.billId,
    billRef: b?.ref ?? '',
    supplierId: x.supplierId,
    supplierName: p.st.suppliers.find((s) => s.id === x.supplierId)?.name ?? '',
    amount: money(paisa({ amount: x.amount, currency: 'PKR' })),
    state: x.state,
    settlement: 'not_settled',
    preparedByName: x.preparedByName,
    preparedAt: x.preparedAt,
  };
}

const bankOf = (s: StoredSupplier): SupplierBankView | undefined => (s.bank ? { bankName: s.bank.bankName, title: s.bank.title, last4: s.bank.last4, sample: true } : undefined);

export function billView(p: Px, b: StoredBill): BillView {
  const who = me(p).principalId;
  const mine = b.createdBy === who || b.submittedBy === who;
  const decider = may(p, 'supplier_bill.approve') && billVisible(p, b, BILL_APPROVE);
  const maker = may(p, 'supplier.manage') && billVisible(p, b, SUP_MANAGE);
  const left = instructable(b, p.st.payments);
  const blocked = b.state === 'submitted' && decider && mine ? 'own_bill' : b.state === 'submitted' && !decider ? 'no_permission' : undefined;
  return {
    ...billSummary(p, b),
    legalEntity: entityOf(p, b.legalEntityId),
    lines: b.lines.map((l) => {
      const cc = ccRef(p, l.costCentreId);
      const pn = projectName(p, cc.projectId);
      return { id: l.id, description: l.description, category: l.category, costCentre: cc, ...(pn ? { projectName: pn } : {}), amount: money(paisa({ amount: l.amount, currency: 'PKR' })) };
    }),
    ...(b.evidence ? { evidence: b.evidence } : {}),
    createdByName: b.createdByName,
    createdAt: b.createdAt,
    ...(b.submittedByName ? { submittedByName: b.submittedByName, submittedAt: b.submittedAt! } : {}),
    ...(b.decidedByName ? { decidedByName: b.decidedByName, decidedAt: b.decidedAt! } : {}),
    ...(b.decisionNote ? { decisionNote: b.decisionNote } : {}),
    payments: p.st.payments.filter((x) => x.billId === b.id).map((x) => paymentSummary(p, x)),
    instructable: money(left),
    history: b.history.map(event),
    actions: {
      submit: maker && can(BILL_FROM, 'submit', b.state),
      approve: decider && !mine && can(BILL_FROM, 'approve', b.state),
      reject: decider && !mine && can(BILL_FROM, 'reject', b.state),
      cancel: maker && can(BILL_FROM, 'cancel', b.state),
      instruct: maker && left > 0n,
      attach: maker && b.state === 'draft' && b.createdBy === who,
    },
    ...(blocked ? { blocked } : {}),
  };
}

export function paymentView(p: Px, x: StoredPayment): PaymentView {
  const b = p.st.bills.find((y) => y.id === x.billId)!;
  const s = p.st.suppliers.find((y) => y.id === x.supplierId);
  const bank = seesBank(p, x.legalEntityId);
  const acct = p.dev.collectionAccounts.find((a) => a.legalEntityId === x.legalEntityId);
  const approver = may(p, 'supplier_payment.approve') && paymentVisible(p, x, PAY_APPROVE);
  const maker = may(p, 'supplier.manage') && paymentVisible(p, x, SUP_MANAGE);
  const own = x.preparedBy === me(p).principalId;
  const payee = s && bank ? bankOf(s) : undefined;
  return {
    ...paymentSummary(p, x),
    legalEntity: entityOf(p, x.legalEntityId),
    billTotal: billTotal(b),
    ...(x.note ? { note: x.note } : {}),
    ...(payee ? { payee } : {}),
    ...(bank && acct ? { payFrom: { title: acct.title, maskedNumber: acct.maskedNumber, sample: true as const } } : {}),
    bankHidden: !bank,
    ...(x.approvedByName ? { approvedByName: x.approvedByName, approvedAt: x.approvedAt! } : {}),
    ...(x.sentByName ? { sentByName: x.sentByName, sentAt: x.sentAt! } : {}),
    ...(x.cancelledByName ? { cancelledByName: x.cancelledByName, cancelledAt: x.cancelledAt!, ...(x.cancelReason ? { cancelReason: x.cancelReason } : {}) } : {}),
    history: x.history.map(event),
    actions: {
      approve: approver && !own && can(PAYMENT_FROM, 'approve', x.state),
      send: maker && can(PAYMENT_FROM, 'send', x.state),
      cancel: (maker || approver) && can(PAYMENT_FROM, 'cancel', x.state),
    },
    ...(x.state === 'prepared' && approver && own ? { blocked: 'own_instruction' as const } : x.state === 'prepared' && !approver ? { blocked: 'no_permission' as const } : {}),
  };
}

export function supplierSummary(p: Px, s: StoredSupplier): SupplierSummary {
  const bills = p.st.bills.filter((b) => b.supplierId === s.id && billVisible(p, b));
  const whole = entityWhole(p.ctx, s.legalEntityId, SUP_VIEW);
  const approved = wholeOnly(whole, money(sum(p.st.bills.filter((b) => b.supplierId === s.id && b.state === 'approved').map((b) => lineTotal(b.lines)))));
  return {
    id: s.id,
    ref: s.ref,
    name: s.name,
    category: s.category,
    legalEntityId: s.legalEntityId,
    projectNames: s.projectIds.map((id) => projectName(p, id)).filter((x): x is string => !!x),
    openBills: bills.filter((b) => b.state === 'draft' || b.state === 'submitted').length,
    awaitingApproval: bills.filter((b) => b.state === 'submitted').length,
    ...(approved ? { approvedObligation: approved } : {}),
    demo: s.demo,
  };
}

/** Supplier 360's own facts, bank (masked, `bank.view` only), totals (whole readers only) and projected activity. */
export function supplier360(p: Px, s: StoredSupplier) {
  const whole = entityWhole(p.ctx, s.legalEntityId, SUP_VIEW);
  const bills = p.st.bills.filter((b) => b.supplierId === s.id && billVisible(p, b));
  const visibleBills = new Set(bills.map((b) => b.id));
  const all = p.st.bills.filter((b) => b.supplierId === s.id);
  const pays = p.st.payments.filter((x) => x.supplierId === s.id && visibleBills.has(x.billId));
  const bank = seesBank(p, s.legalEntityId);
  const totals = wholeOnly(whole, {
    approvedObligation: money(sum(all.filter((b) => b.state === 'approved').map((b) => lineTotal(b.lines)))),
    awaitingApproval: money(sum(all.filter((b) => b.state === 'submitted').map((b) => lineTotal(b.lines)))),
    instructed: money(sum(p.st.payments.filter((x) => x.supplierId === s.id && LIVE_PAYMENTS.includes(x.state)).map((x) => paisa({ amount: x.amount, currency: 'PKR' })))),
    settled: money(0n),
  });
  const activity = projectHistory<StoredEvent>(s.history, { whole, about: (e) => e.billId, sees: (id) => visibleBills.has(id), internal: ['billId'] });
  return {
    supplier: {
      ...supplierSummary(p, s),
      ...(s.taxRef ? { taxRef: s.taxRef } : {}),
      contactName: s.contactName,
      phone: s.phone,
      ...(s.email ? { email: s.email } : {}),
      createdByName: s.createdByName,
      createdAt: s.createdAt,
    },
    legalEntity: entityOf(p, s.legalEntityId),
    ...(bank && s.bank ? { bank: bankOf(s)! } : {}),
    bankHidden: !bank,
    bankOnFile: bank ? !!s.bank : null,
    ...(totals ? { totals } : {}),
    bills: bills.map((b) => billSummary(p, b)),
    payments: pays.map((x) => paymentSummary(p, x)),
    projects: s.projectIds.map((id) => ({ id, name: projectName(p, id) ?? '' })).filter((x) => x.name),
    documents: bills.filter((b) => b.evidence).map((b) => ({ billId: b.id, billRef: b.ref, evidence: b.evidence! })),
    activity: activity.map((e) => event(e as StoredEvent)).reverse(),
    scopeLimited: !whole,
    canCreateBill: may(p, 'supplier.manage') && entityVisible(p.ctx, s.legalEntityId, SUP_MANAGE),
  };
}

export function expenseSummary(p: Px, e: StoredExpense): ExpenseSummary {
  const f = e.floatId ? p.st.floats.find((x) => x.id === e.floatId) : undefined;
  return {
    id: e.id,
    ref: e.ref,
    kind: e.kind,
    legalEntityId: e.legalEntityId,
    costCentre: ccRef(p, e.costCentreId),
    category: e.category,
    description: e.description,
    amount: money(paisa({ amount: e.amount, currency: 'PKR' })),
    incurredOn: e.incurredOn,
    payee: e.payee,
    ...(e.paidVia ? { paidVia: e.paidVia } : {}),
    ...(f ? { floatName: f.name } : {}),
    ...(e.claimantId ? { claimant: { id: e.claimantId, name: e.claimantName ?? '' } } : {}),
    state: e.state,
    posting: 'planned',
    settlement: 'not_settled',
    createdByName: e.createdByName,
    demo: e.demo,
  };
}

/** Why the reader may not decide an expense: their own (maker or submitter) or their own claim. */
export function expenseBlock(p: Px, e: StoredExpense): 'own_expense' | 'own_claim' | undefined {
  const who = me(p).principalId;
  if (e.claimantId === who) return 'own_claim';
  if (e.createdBy === who || e.submittedBy === who) return 'own_expense';
  return undefined;
}

export function expenseView(p: Px, e: StoredExpense): ExpenseView {
  const decider = may(p, 'expense.approve') && expenseVisible(p, e, EXP_APPROVE);
  const maker = may(p, 'expense.create') && expenseVisible(p, e, EXP_CREATE);
  const block = expenseBlock(p, e);
  const own = e.createdBy === me(p).principalId;
  return {
    ...expenseSummary(p, e),
    legalEntity: entityOf(p, e.legalEntityId),
    ...(e.floatId ? { floatId: e.floatId } : {}),
    ...(e.evidence ? { evidence: e.evidence } : {}),
    createdAt: e.createdAt,
    ...(e.submittedByName ? { submittedByName: e.submittedByName, submittedAt: e.submittedAt! } : {}),
    ...(e.decidedByName ? { decidedByName: e.decidedByName, decidedAt: e.decidedAt! } : {}),
    ...(e.decisionNote ? { decisionNote: e.decisionNote } : {}),
    history: e.history.map(event),
    actions: {
      submit: maker && own && can(EXPENSE_FROM, 'submit', e.state),
      withdraw: maker && own && can(EXPENSE_FROM, 'withdraw', e.state),
      approve: decider && !block && can(EXPENSE_FROM, 'approve', e.state),
      reject: decider && !block && can(EXPENSE_FROM, 'reject', e.state),
      attach: maker && own && e.state === 'draft',
    },
    ...(e.state === 'submitted' ? (decider && block ? { blocked: block } : !decider ? { blocked: 'no_permission' as const } : {}) : {}),
  };
}

export function countView(p: Px, f: StoredFloat, c: StoredFloat['counts'][number]): CashCountView {
  const witness = may(p, 'expense.approve') && floatVisible(p, f, EXP_APPROVE);
  const own = c.countedBy === me(p).principalId;
  return {
    id: c.id,
    countedOn: c.countedOn,
    amount: money(paisa({ amount: c.amount, currency: 'PKR' })),
    notes: c.notes,
    countedByName: c.countedByName,
    state: c.state,
    ...(c.witnessedByName ? { witnessedByName: c.witnessedByName, witnessedAt: c.witnessedAt! } : {}),
    ...(c.note ? { note: c.note } : {}),
    ...(c.evidence ? { evidence: c.evidence } : {}),
    canWitness: witness && !own && c.state === 'awaiting_witness',
    ...(c.state === 'awaiting_witness' ? (witness && own ? { blocked: 'own_count' as const } : !witness ? { blocked: 'no_permission' as const } : {}) : {}),
  };
}

export function topUpView(p: Px, f: StoredFloat, x: StoredFloat['topUps'][number]): TopUpView {
  const approver = may(p, 'expense.approve') && floatVisible(p, f, EXP_APPROVE);
  const maker = may(p, 'expense.create') && floatVisible(p, f, EXP_CREATE);
  const own = x.requestedBy === me(p).principalId;
  return {
    id: x.id,
    ref: x.ref,
    amount: money(paisa({ amount: x.amount, currency: 'PKR' })),
    reason: x.reason,
    state: x.state,
    settlement: 'not_settled',
    requestedByName: x.requestedByName,
    requestedAt: x.requestedAt,
    ...(x.approvedByName ? { approvedByName: x.approvedByName, approvedAt: x.approvedAt! } : {}),
    ...(x.cancelledByName ? { cancelledByName: x.cancelledByName } : {}),
    canApprove: approver && !own && x.state === 'prepared',
    canCancel: (maker || approver) && (x.state === 'prepared' || x.state === 'approved'),
    ...(x.state === 'prepared' ? (approver && own ? { blocked: 'own_request' as const } : !approver ? { blocked: 'no_permission' as const } : {}) : {}),
  };
}

export function floatView(p: Px, f: StoredFloat): PettyCashFloatView {
  const witnessed = [...f.counts].filter((c) => c.state === 'witnessed').sort((a, b) => (a.witnessedAt! < b.witnessedAt! ? 1 : -1))[0];
  const maker = may(p, 'expense.create') && floatVisible(p, f, EXP_CREATE);
  return {
    id: f.id,
    name: f.name,
    kind: 'petty_cash',
    legalEntityId: f.legalEntityId,
    costCentre: ccRef(p, f.costCentreId),
    custodianName: f.custodianName,
    imprest: money(paisa({ amount: f.imprest, currency: 'PKR' })),
    ...(witnessed ? { lastWitnessed: countView(p, f, witnessed) } : {}),
    counts: [...f.counts].reverse().map((c) => countView(p, f, c)),
    topUps: [...f.topUps].reverse().map((x) => topUpView(p, f, x)),
    expenses: p.st.expenses.filter((e) => e.floatId === f.id && expenseVisible(p, e)).map((e) => expenseSummary(p, e)),
    history: f.history.map(event),
    canCount: maker,
    canRequestTopUp: maker,
  };
}

const versionView = (v: StoredBudget['versions'][number]): BudgetVersionView => ({
  n: v.n,
  state: v.state,
  lines: v.lines.map((l) => ({ category: l.category, amount: money(paisa({ amount: l.amount, currency: 'PKR' })) })),
  total: money(lineTotal(v.lines)),
  reason: v.reason,
  preparedByName: v.preparedByName,
  preparedAt: v.preparedAt,
  ...(v.submittedAt ? { submittedAt: v.submittedAt } : {}),
  ...(v.decidedByName ? { decidedByName: v.decidedByName, decidedAt: v.decidedAt! } : {}),
  ...(v.decisionNote ? { decisionNote: v.decisionNote } : {}),
});

export function budgetSummary(p: Px, b: StoredBudget): BudgetSummary {
  const a = approvedVersion(b.versions);
  const o = openVersion(b.versions);
  return {
    id: b.id,
    ref: b.ref,
    legalEntityId: b.legalEntityId,
    costCentre: ccRef(p, b.costCentreId),
    year: b.year,
    ...(a ? { approved: { n: a.n, total: money(lineTotal(a.lines)) } } : {}),
    ...(o ? { open: { n: o.n, state: o.state, total: money(lineTotal(o.lines)) } } : {}),
    demo: b.demo,
  };
}

export function budgetView(p: Px, b: StoredBudget): BudgetView {
  const o = openVersion(b.versions);
  const maker = may(p, 'budget.manage') && budgetVisible(p, b, BUD_MANAGE);
  const approver = may(p, 'budget.approve') && budgetVisible(p, b, BUD_APPROVE);
  const own = !!o && o.preparedBy === me(p).principalId;
  return {
    ...budgetSummary(p, b),
    legalEntity: entityOf(p, b.legalEntityId),
    versions: [...b.versions].reverse().map(versionView),
    history: b.history.map(event),
    actions: {
      newVersion: maker && !o,
      submit: maker && !!o && own && can(BUDGET_FROM, 'submit', o.state),
      withdraw: maker && !!o && own && can(BUDGET_FROM, 'withdraw', o.state),
      approve: approver && !!o && !own && can(BUDGET_FROM, 'approve', o.state),
      reject: approver && !!o && !own && can(BUDGET_FROM, 'reject', o.state),
    },
    ...(o?.state === 'submitted' ? (approver && own ? { blocked: 'own_version' as const } : !approver ? { blocked: 'no_permission' as const } : {}) : {}),
  };
}
