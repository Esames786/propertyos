import {
  BILL_FILTERS,
  BILL_KINDS,
  BUDGET_VERSION_STATES,
  CASH_NOTES,
  EXPENSE_FILTERS,
  EXPENSE_KINDS,
  FISCAL_YEARS,
  PAID_VIA,
  PAYMENT_FILTERS,
  SPEND_CATEGORIES,
  SUPPLIER_CATEGORIES,
  UTILITY_SERVICES,
  type ApprovalItem,
  type BillFilter,
  type BillOptions,
  type BillsList,
  type BillView,
  type BudgetsList,
  type BudgetVsActual,
  type BudgetView,
  type BvaBudget,
  type ExpenseApprovals,
  type ExpenseFilter,
  type ExpenseOptions,
  type ExpensesList,
  type ExpenseView,
  type FiscalYear,
  type PayablesEvidence,
  type PaymentFilter,
  type PaymentsList,
  type PaymentView,
  type Permission,
  type PettyCashFloatView,
  type PettyCashList,
  type SpendCategory,
  type Supplier360,
  type SupplierCategory,
  type SupplierLedgerView,
  type SuppliersList,
  type UtilityRegister,
  type UtilityService,
} from '@repo/contracts';
import { can as holds, matches, notFound, refused, requires, type Handler, type HandlerContext } from '../../handler-types';
import { remember, replayOf } from '../../idempotency';
import { wholeOnly } from '../../projection';
import { PERSONAS } from '../../people';
import { problem, stamp } from '../../society/handlers';
import { costCentreVisible, entityVisible, entityWhole, requireEntity, type ScopeNeed } from '../scope';
import { AMOUNT, approvedVersion, BILL_FROM, BUDGET_FROM, budgetVsActual, can, countTotal, EXPENSE_FROM, fiscalYearBounds, instructable, isDate, lineTotal, money, openVersion, paisa, PAYMENT_FROM, sum, validNotes } from './rules';
import { nextRef, type StoredBill, type StoredBudget, type StoredEvent, type StoredExpense, type StoredPayment, type StoredSupplier } from './state';
import {
  BILL_APPROVE,
  billSummary,
  billView,
  billVisible,
  BUD_APPROVE,
  BUD_MANAGE,
  budgetSummary,
  budgetView,
  budgetVisible,
  ccEntity,
  ccRef,
  entityOf,
  EXP_APPROVE,
  EXP_CREATE,
  EXP_VIEW,
  expenseBlock,
  expenseSummary,
  expenseView,
  expenseVisible,
  findBill,
  findBudget,
  findExpense,
  findFloat,
  findPayment,
  findSupplier,
  floatView,
  floatVisible,
  may,
  me,
  PAY_APPROVE,
  paymentSummary,
  paymentView,
  paymentVisible,
  readPx,
  scopeOf,
  SUP_MANAGE,
  SUP_VIEW,
  supplier360,
  supplierSummary,
  supplierVisible,
  usableCostCentres,
  writePx,
  type Px,
} from './views';

/**
 * Gate E.8 mock API (plan §6 E.8 "Mock API"): suppliers, supplier bills, payment instructions, the
 * supplier ledger, utility bills, expenses and claims, approvals, petty cash and budgets.
 *
 * The transport checks the `payables` module, the permission and the suspension class first. Every
 * changing handler then follows the plan §4.2 order: (1) practice mode and the area's read permission
 * (a maker must be able to see what they make); (2) authority over the scope (legal entity, cost
 * centre); (3) the record's state; (4) ids from the path or body, where out of scope answers exactly
 * like never issued (404 for the path, the same field problem for the body); (5) maker ≠ checker by
 * principal; (6) validation of every field, all problems at once; then the bound replay check (E.0
 * `idempotency.ts`) just before the state-dependent checks (duplicates, amounts left); (7) mutate, then
 * audit. A refusal changes nothing (every negative test compares the store byte for byte).
 *
 * There is no posting, settlement, transfer or bank route: `POST /supplier-bills/:id/post` answers
 * 409 `posting_planned` (E-17), and nothing here sets anything settled (E-18).
 */

type Body = Record<string, unknown>;
const body = (ctx: HandlerContext): Body => (ctx.req.body && typeof ctx.req.body === 'object' ? (ctx.req.body as Body) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const q = (ctx: HandlerContext, key: string) => {
  const v = ctx.req.query?.[key];
  return v === undefined ? '' : String(v).trim();
};
const save = (p: Px) => p.ctx.demo.save();
const stampOf = (p: Px) => stamp(p.ctx);
const who = (p: Px) => ({ by: me(p).principalId, byName: me(p).name });

/** A route: `:id` and `:sub` become named groups (the transport passes `match.groups` as params). */
const path = (s: string) => new RegExp(`^${s.replace(':id', '(?<id>[\\w-]+)').replace(':sub', '(?<sub>[\\w-]+)')}$`);

// ---- refusals -----------------------------------------------------------------------------------

function refuse(ctx: HandlerContext, status: number, code: string, key: string, field?: string): never {
  problem(ctx, status, code, `payables:problems.${key}`, field ? { [field]: [{ code: `payables:problems.${key}` }] } : undefined);
}

/** Practice mode has no payables records: every change is refused (reads stay open). */
function official(ctx: HandlerContext): void {
  if (ctx.req.training) refuse(ctx, 403, 'training_not_supported', 'trainingNotSupported');
}

/** A change also needs the area's read permission (and module): a maker sees what they make. */
function alsoNeeds(ctx: HandlerContext, ...permissions: Permission[]): void {
  for (const permission of permissions) if (!holds(ctx, permission)) refused({ allowed: false, reason: 'permission_missing' }, ctx.correlationId);
}

const stateConflict = (ctx: HandlerContext): never => refuse(ctx, 409, 'state_conflict', 'stateConflict');

/** Every field problem of a request, reported together (inline validation shows each one at its field). */
class Problems {
  readonly errors: Record<string, Array<{ code: string; params?: Record<string, string> }>> = {};
  add(field: string, code: string, params?: Record<string, string>) {
    (this.errors[field] ??= []).push({ code, ...(params ? { params } : {}) });
  }
  has(field: string) {
    return !!this.errors[field];
  }
  throwIfAny(ctx: HandlerContext) {
    if (Object.keys(this.errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', this.errors);
  }
}

function text(pr: Problems, field: string, raw: unknown, min: number, max: number, optional = false): string {
  const v = str(raw);
  if (!v && optional) return '';
  if (!v) pr.add(field, 'forms:errors.required');
  else if (v.length < min) pr.add(field, 'payables:errors.minLength', { min: String(min) });
  else if (v.length > max) pr.add(field, 'payables:errors.maxLength', { max: String(max) });
  return v;
}

function amountOf(pr: Problems, field: string, raw: unknown): string {
  const v = str(typeof raw === 'number' ? String(raw) : raw).replace(/,/g, '');
  if (!v) {
    pr.add(field, 'forms:errors.required');
    return '0.00';
  }
  if (!AMOUNT.test(v) || paisa({ amount: v, currency: 'PKR' }) <= 0n) {
    pr.add(field, 'payables:errors.amount');
    return '0.00';
  }
  return money(paisa({ amount: v, currency: 'PKR' })).amount;
}

function dateOf(pr: Problems, field: string, raw: unknown, today: string, notAfterToday = true): string {
  const v = str(raw);
  if (!v) pr.add(field, 'forms:errors.required');
  else if (!isDate(v)) pr.add(field, 'payables:errors.date');
  else if (notAfterToday && v > today) pr.add(field, 'payables:errors.futureDate');
  return v;
}

function oneOf<T extends string>(pr: Problems, field: string, raw: unknown, list: readonly T[], code: string): T {
  const v = str(raw);
  if (!v) pr.add(field, 'forms:errors.required');
  else if (!(list as readonly string[]).includes(v)) pr.add(field, code);
  return v as T;
}

/** Demo evidence: a file's name and size (the prototype keeps no file), or the labelled sample. */
function evidenceOf(pr: Problems, raw: unknown): PayablesEvidence | undefined {
  if (raw === undefined || raw === null) return undefined;
  const e = raw as Record<string, unknown>;
  const name = str(e.name);
  const kind = str(e.kind);
  if (!name || name.length > 120 || !['invoice', 'receipt', 'count_sheet', 'other'].includes(kind)) {
    pr.add('evidence', 'payables:errors.evidence');
    return undefined;
  }
  return { name, kind: kind as PayablesEvidence['kind'], size: Math.max(0, Math.min(Number(e.size) || 0, 10_000_000)), sample: e.sample === true };
}

const reasonOf = (ctx: HandlerContext, required: boolean): string => {
  const pr = new Problems();
  const v = text(pr, 'reason', body(ctx).reason, required ? 3 : 0, 300, !required);
  pr.throwIfAny(ctx);
  return v;
};

// ---- shared pieces ------------------------------------------------------------------------------

/** A cost centre named in a body: unknown and hidden answer alike; a visible one of another entity is cross-entity. */
function costCentreFor(p: Px, pr: Problems, field: string, raw: unknown, entityId: string, need: ScopeNeed, crossEntity: string[]): string {
  const id = str(raw);
  if (!id) {
    pr.add(field, 'forms:errors.required');
    return id;
  }
  if (!costCentreVisible(p.ctx, p.dev, id, need)) {
    pr.add(field, 'payables:errors.unknownCostCentre');
    return id;
  }
  if (ccEntity(p, id) !== entityId) crossEntity.push(field);
  return id;
}

function crossEntityRefusal(ctx: HandlerContext, fields: string[]): void {
  if (fields.length) problem(ctx, 422, 'cross_entity_forbidden', 'payables:problems.crossEntity', Object.fromEntries(fields.map((f) => [f, [{ code: 'payables:errors.crossEntity' }]])));
}

function supplierEvent(p: Px, supplierId: string, e: StoredEvent) {
  p.st.suppliers.find((s) => s.id === supplierId)?.history.push(e);
}

function newId(p: Px, prefix: string): string {
  const key = `id:${prefix}`;
  const n = (p.st.seq[key] ?? 0) + 1;
  p.st.seq[key] = n;
  return `${prefix}_n${String(n).padStart(4, '0')}`;
}

const ownBill = (p: Px, b: StoredBill) => b.createdBy === me(p).principalId || b.submittedBy === me(p).principalId;

// ---- suppliers ----------------------------------------------------------------------------------

function suppliersList(ctx: HandlerContext): SuppliersList {
  const p = readPx(ctx);
  const scope = scopeOf(p, SUP_VIEW);
  const term = q(ctx, 'q');
  const cat = q(ctx, 'category');
  const base = p.st.suppliers.filter((s) => s.legalEntityId === scope.entity.id && supplierVisible(p, s) && (!term || matches(term, s.name, s.ref, s.taxRef)));
  const counts = Object.fromEntries([['all', base.length], ...SUPPLIER_CATEGORIES.map((c) => [c, base.filter((s) => s.category === c).length])]) as SuppliersList['counts'];
  const items = base.filter((s) => !cat || cat === 'all' || s.category === cat).sort((a, b) => a.name.localeCompare(b.name));
  const canCreate = may(p, 'supplier.manage') && entityWhole(ctx, scope.entity.id, SUP_MANAGE);
  // Project choices only for someone who may add a supplier (they govern the whole entity).
  const projects = canCreate ? ctx.data.projects.filter((x) => x.legalEntityId === scope.entity.id).map((x) => ({ id: x.id, name: x.name })) : [];
  return { scope, items: items.map((s) => supplierSummary(p, s)), counts, canCreate, projects };
}

function createSupplier(ctx: HandlerContext): Supplier360 {
  official(ctx);
  alsoNeeds(ctx, 'supplier.view');
  const p0 = readPx(ctx);
  const b = body(ctx);
  const entityId = requireEntity(ctx, str(b.legalEntityId) || undefined, SUP_MANAGE);
  if (!entityWhole(ctx, entityId, SUP_MANAGE)) refuse(ctx, 403, 'scope_partial', 'scopePartial');
  const pr = new Problems();
  const name = text(pr, 'name', b.name, 3, 80);
  const category = oneOf<SupplierCategory>(pr, 'category', b.category, SUPPLIER_CATEGORIES, 'payables:errors.category');
  const taxRef = text(pr, 'taxRef', b.taxRef, 3, 30, true);
  const contactName = text(pr, 'contactName', b.contactName, 3, 60);
  const phone = str(b.phone);
  if (!phone) pr.add('phone', 'forms:errors.required');
  else if (!/^\+?[0-9][0-9 -]{6,19}$/.test(phone)) pr.add('phone', 'payables:errors.phone');
  const email = str(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) pr.add('email', 'payables:errors.email');
  const raw = Array.isArray(b.projectIds) ? b.projectIds.map(str).filter(Boolean) : [];
  const projectIds = [...new Set(raw)];
  for (const id of projectIds) {
    const proj = ctx.data.projects.find((x) => x.id === id);
    if (!proj || proj.legalEntityId !== entityId) pr.add('projectIds', 'payables:errors.unknownProject');
  }
  pr.throwIfAny(ctx);
  const input = { entityId, name, category, taxRef, contactName, phone, email, projectIds: [...projectIds].sort() };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.supplier.create', target: entityId, input, stillAuthorized: () => entityWhole(ctx, entityId, SUP_MANAGE) });
  if (again) return supplier360(p0, findSupplier(p0, again)) as Supplier360;
  if (p0.st.suppliers.some((s) => s.legalEntityId === entityId && s.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'))) refuse(ctx, 409, 'duplicate_supplier', 'duplicateSupplier', 'name');
  const p = writePx(p0);
  const at = stampOf(p);
  const s: StoredSupplier = {
    id: newId(p, 'sup'),
    ref: nextRef(p.st, p.dev, entityId, 'supplier', ctx.at),
    legalEntityId: entityId,
    name,
    category,
    ...(taxRef ? { taxRef } : {}),
    contactName,
    phone,
    ...(email ? { email } : {}),
    projectIds,
    createdBy: me(p).principalId,
    createdByName: me(p).name,
    createdAt: at,
    demo: false,
    history: [{ at, ...who(p), action: 'supplier_created' }],
  };
  p.st.suppliers.push(s);
  remember(ctx, p.st.idempotency, { op: 'payables.supplier.create', target: entityId, input }, s.id);
  save(p);
  return supplier360(p, s) as Supplier360;
}

function ledgerOf(ctx: HandlerContext): SupplierLedgerView {
  const p = readPx(ctx);
  const s = findSupplier(p, ctx.params.id);
  const whole = entityWhole(ctx, s.legalEntityId, SUP_VIEW);
  const bills = p.st.bills.filter((b) => b.supplierId === s.id && billVisible(p, b));
  const approved = p.st.bills.filter((b) => b.supplierId === s.id && b.state === 'approved');
  // Ledger = approved bills − credit notes − settled payments. No credit note or settlement exists in this wave (E-18).
  let running = 0n;
  const rows = [...approved]
    .sort((a, b) => (a.invoiceDate === b.invoiceDate ? a.ref.localeCompare(b.ref) : a.invoiceDate < b.invoiceDate ? -1 : 1))
    .map((b) => {
      const t = lineTotal(b.lines);
      running += t;
      return { date: b.invoiceDate, kind: 'bill' as const, ref: b.ref, billId: b.id, description: b.lines.map((l) => l.description).join(' · '), obligation: money(t), balance: money(running) };
    });
  const balance = wholeOnly(whole, money(running));
  return {
    supplier: { id: s.id, ref: s.ref, name: s.name },
    legalEntity: entityOf(p, s.legalEntityId),
    rows: whole ? rows : [],
    ...(balance ? { balance } : {}),
    awaitingApproval: bills.filter((b) => b.state === 'submitted').map((b) => billSummary(p, b)),
    instructions: p.st.payments.filter((x) => x.supplierId === s.id && paymentVisible(p, x)).map((x) => paymentSummary(p, x)),
    posting: 'planned',
    scopeLimited: !whole,
  };
}

// ---- bills --------------------------------------------------------------------------------------

function billsList(ctx: HandlerContext, kindOnly?: 'utility'): BillsList {
  const p = readPx(ctx);
  const scope = scopeOf(p, SUP_VIEW);
  const term = q(ctx, 'q');
  const supplier = q(ctx, 'supplier');
  const kind = kindOnly ?? q(ctx, 'kind');
  const raw = q(ctx, 'state');
  const state: BillFilter = (BILL_FILTERS as readonly string[]).includes(raw) ? (raw as BillFilter) : 'all';
  const base = p.st.bills.filter(
    (b) =>
      b.legalEntityId === scope.entity.id &&
      billVisible(p, b) &&
      (!supplier || b.supplierId === supplier) &&
      (!kind || kind === 'all' || b.kind === kind) &&
      (!term || matches(term, b.ref, b.supplierInvoiceNo, p.st.suppliers.find((s) => s.id === b.supplierId)?.name, b.utility?.consumerNo)),
  );
  const counts = Object.fromEntries(BILL_FILTERS.map((f) => [f, f === 'all' ? base.length : base.filter((b) => b.state === f).length])) as BillsList['counts'];
  const items = base.filter((b) => state === 'all' || b.state === state).sort((a, b) => (a.invoiceDate === b.invoiceDate ? b.ref.localeCompare(a.ref) : a.invoiceDate < b.invoiceDate ? 1 : -1));
  return { scope, items: items.map((b) => billSummary(p, b)), counts, canCreate: may(p, 'supplier.manage') && entityVisible(ctx, scope.entity.id, SUP_MANAGE) };
}

function billOptions(ctx: HandlerContext): BillOptions {
  alsoNeeds(ctx, 'supplier.view');
  const p = readPx(ctx);
  const scope = scopeOf(p, SUP_MANAGE);
  return {
    scope,
    suppliers: p.st.suppliers.filter((s) => s.legalEntityId === scope.entity.id && supplierVisible(p, s, SUP_MANAGE)).map((s) => ({ id: s.id, name: s.name, category: s.category, legalEntityId: s.legalEntityId })).sort((a, b) => a.name.localeCompare(b.name)),
    costCentres: usableCostCentres(p, scope.entity.id, SUP_MANAGE),
    today: ctx.at,
    canCreate: true,
  };
}

function createBill(ctx: HandlerContext): BillView {
  official(ctx);
  alsoNeeds(ctx, 'supplier.view');
  const p0 = readPx(ctx);
  const b = body(ctx);
  // (2) authority over the entity: hidden, unknown and another organisation's entity answer alike (404).
  const entityId = requireEntity(ctx, str(b.legalEntityId) || undefined, SUP_MANAGE);
  const pr = new Problems();
  const cross: string[] = [];
  // (4) ids in the body: a supplier or cost centre out of scope is the same field problem as one never issued.
  const supplierId = str(b.supplierId);
  const supplier = supplierId ? p0.st.suppliers.find((s) => s.id === supplierId && supplierVisible(p0, s, SUP_MANAGE)) : undefined;
  if (!supplierId) pr.add('supplierId', 'forms:errors.required');
  else if (!supplier) pr.add('supplierId', 'payables:errors.unknownSupplier');
  else if (supplier.legalEntityId !== entityId) cross.push('supplierId');
  const rawLines = Array.isArray(b.lines) ? (b.lines as Body[]) : [];
  if (!rawLines.length) pr.add('lines', 'payables:errors.noLines');
  if (rawLines.length > 20) pr.add('lines', 'payables:errors.tooManyLines');
  const lines = rawLines.slice(0, 20).map((l, i) => ({
    description: text(pr, `lines.${i}.description`, l?.description, 3, 120),
    category: oneOf<SpendCategory>(pr, `lines.${i}.category`, l?.category, SPEND_CATEGORIES, 'payables:errors.category'),
    costCentreId: costCentreFor(p0, pr, `lines.${i}.costCentreId`, l?.costCentreId, entityId, SUP_MANAGE, cross),
    amount: amountOf(pr, `lines.${i}.amount`, l?.amount),
  }));
  crossEntityRefusal(ctx, cross);
  // (6) every other field.
  const kind = oneOf(pr, 'kind', b.kind ?? 'standard', BILL_KINDS, 'payables:errors.kind');
  const supplierInvoiceNo = text(pr, 'supplierInvoiceNo', b.supplierInvoiceNo, 1, 40);
  const invoiceDate = dateOf(pr, 'invoiceDate', b.invoiceDate, ctx.at);
  const dueDate = dateOf(pr, 'dueDate', b.dueDate, ctx.at, false);
  if (!pr.has('invoiceDate') && !pr.has('dueDate') && dueDate < invoiceDate) pr.add('dueDate', 'payables:errors.dueBeforeInvoice');
  let utility: StoredBill['utility'];
  if (kind === 'utility') {
    const u = (b.utility ?? {}) as Body;
    const service = oneOf<UtilityService>(pr, 'utility.service', u.service, UTILITY_SERVICES, 'payables:errors.service');
    const consumerNo = text(pr, 'utility.consumerNo', u.consumerNo, 4, 30);
    const periodFrom = dateOf(pr, 'utility.periodFrom', u.periodFrom, ctx.at);
    const periodTo = dateOf(pr, 'utility.periodTo', u.periodTo, ctx.at);
    if (!pr.has('utility.periodFrom') && !pr.has('utility.periodTo') && periodTo < periodFrom) pr.add('utility.periodTo', 'payables:errors.periodOrder');
    utility = { service, consumerNo, periodFrom, periodTo };
  }
  const evidence = evidenceOf(pr, b.evidence);
  pr.throwIfAny(ctx);
  const input = { entityId, supplierId, kind, supplierInvoiceNo, invoiceDate, dueDate, utility: utility ?? null, lines, evidence: evidence ?? null };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.bill.create', target: entityId, input, stillAuthorized: () => entityVisible(ctx, entityId, SUP_MANAGE) });
  if (again) return billView(p0, findBill(p0, again));
  // State-dependent: the same supplier invoice number twice (a live bill) is a duplicate.
  if (p0.st.bills.some((x) => x.supplierId === supplierId && x.state !== 'cancelled' && x.supplierInvoiceNo.toLocaleLowerCase('en') === supplierInvoiceNo.toLocaleLowerCase('en'))) refuse(ctx, 409, 'duplicate_invoice', 'duplicateInvoice', 'supplierInvoiceNo');
  const p = writePx(p0);
  const at = stampOf(p);
  const id = newId(p, 'sbl');
  const ref = nextRef(p.st, p.dev, entityId, 'supplier_bill', invoiceDate);
  const bill: StoredBill = {
    id,
    ref,
    legalEntityId: entityId,
    supplierId,
    kind,
    supplierInvoiceNo,
    invoiceDate,
    dueDate,
    ...(utility ? { utility } : {}),
    lines: lines.map((l, i) => ({ id: `${id}_l${i + 1}`, ...l })),
    ...(evidence ? { evidence } : {}),
    state: 'draft',
    createdBy: me(p).principalId,
    createdByName: me(p).name,
    createdAt: at,
    demo: false,
    history: [],
  };
  const e: StoredEvent = { at, ...who(p), action: 'bill_created', values: { ref, amount: money(lineTotal(bill.lines)).amount } };
  bill.history.push(e);
  p.st.bills.push(bill);
  supplierEvent(p, supplierId, { ...e, billId: id });
  remember(ctx, p.st.idempotency, { op: 'payables.bill.create', target: entityId, input }, id);
  save(p);
  return billView(p, bill);
}

function billAction(action: 'submit' | 'approve' | 'reject' | 'cancel') {
  return (ctx: HandlerContext): BillView => {
    official(ctx);
    alsoNeeds(ctx, 'supplier.view');
    const p0 = readPx(ctx);
    const need = action === 'approve' || action === 'reject' ? BILL_APPROVE : SUP_MANAGE;
    // (2)+(4) the bill must be in the person's scope for this action: otherwise exactly like never issued.
    const b0 = findBill(p0, ctx.params.id, need);
    // (3) state.
    if (!can(BILL_FROM, action, b0.state)) stateConflict(ctx);
    // (5) maker ≠ checker, by principal.
    if ((action === 'approve' || action === 'reject') && ownBill(p0, b0)) refuse(ctx, 403, 'separation_of_duties', 'ownBill');
    // (6) validation.
    const note = reasonOf(ctx, action === 'reject' || (action === 'cancel' && b0.state !== 'draft'));
    if (action === 'submit') {
      const pr = new Problems();
      if (!b0.evidence) pr.add('evidence', 'payables:errors.evidenceRequired');
      pr.throwIfAny(ctx);
    }
    // (7) mutate, then audit.
    const p = writePx(p0);
    const b = findBill(p, ctx.params.id, need);
    const at = stampOf(p);
    const total = money(lineTotal(b.lines)).amount;
    if (action === 'submit') Object.assign(b, { state: 'submitted', submittedBy: me(p).principalId, submittedByName: me(p).name, submittedAt: at });
    if (action === 'approve') Object.assign(b, { state: 'approved', decidedBy: me(p).principalId, decidedByName: me(p).name, decidedAt: at, ...(note ? { decisionNote: note } : {}) });
    if (action === 'reject') Object.assign(b, { state: 'rejected', decidedBy: me(p).principalId, decidedByName: me(p).name, decidedAt: at, decisionNote: note });
    if (action === 'cancel') Object.assign(b, { state: 'cancelled' });
    const e: StoredEvent = { at, ...who(p), action: `bill_${action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'}`, values: { ref: b.ref, amount: total }, ...(note ? { note } : {}) };
    b.history.push(e);
    supplierEvent(p, b.supplierId, { ...e, billId: b.id });
    save(p);
    return billView(p, b);
  };
}

/** A draft's demo document (attached before submitting). Only the maker, only while it is a draft. */
function attachBillEvidence(ctx: HandlerContext): BillView {
  official(ctx);
  alsoNeeds(ctx, 'supplier.view');
  const p0 = readPx(ctx);
  const b0 = findBill(p0, ctx.params.id, SUP_MANAGE);
  if (b0.state !== 'draft') stateConflict(ctx);
  if (b0.createdBy !== me(p0).principalId) refuse(ctx, 403, 'not_maker', 'notMaker');
  const pr = new Problems();
  const evidence = evidenceOf(pr, body(ctx).evidence);
  if (!evidence && !pr.has('evidence')) pr.add('evidence', 'payables:errors.evidenceRequired');
  pr.throwIfAny(ctx);
  const p = writePx(p0);
  const b = findBill(p, b0.id, SUP_MANAGE);
  const at = stampOf(p);
  b.evidence = evidence;
  b.history.push({ at, ...who(p), action: 'evidence_attached', values: { name: evidence!.name } });
  save(p);
  return billView(p, b);
}

/** Posting to the ledger waits on E.7's posting rules (E-17): refused after the scope checks, nothing changes. */
function postBill(ctx: HandlerContext): never {
  official(ctx);
  alsoNeeds(ctx, 'supplier.view');
  const p = readPx(ctx);
  findBill(p, ctx.params.id, SUP_MANAGE);
  refuse(ctx, 409, 'posting_planned', 'postingPlanned');
}

// ---- payment instructions -------------------------------------------------------------------------

function createPayment(ctx: HandlerContext): PaymentView {
  official(ctx);
  // A payment instruction names the payee's account: preparing one also needs the bank permission.
  alsoNeeds(ctx, 'supplier.view', 'bank.view');
  const p0 = readPx(ctx);
  const bill = findBill(p0, ctx.params.id, SUP_MANAGE);
  if (bill.state !== 'approved') stateConflict(ctx);
  const b = body(ctx);
  const pr = new Problems();
  const amount = amountOf(pr, 'amount', b.amount);
  const note = text(pr, 'note', b.note, 3, 200, true);
  pr.throwIfAny(ctx);
  const input = { billId: bill.id, amount, note };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.payment.create', target: bill.id, input, stillAuthorized: () => billVisible(p0, bill, SUP_MANAGE) });
  if (again) return paymentView(p0, findPayment(p0, again));
  const supplier = p0.st.suppliers.find((s) => s.id === bill.supplierId)!;
  if (!supplier.bank) refuse(ctx, 409, 'payee_account_missing', 'payeeAccountMissing');
  if (paisa({ amount, currency: 'PKR' }) > instructable(bill, p0.st.payments)) {
    const pr2 = new Problems();
    pr2.add('amount', 'payables:errors.aboveInstructable', { amount: money(instructable(bill, p0.st.payments)).amount });
    pr2.throwIfAny(ctx);
  }
  const p = writePx(p0);
  const at = stampOf(p);
  const x: StoredPayment = {
    id: newId(p, 'spi'),
    ref: nextRef(p.st, p.dev, bill.legalEntityId, 'payment_voucher', ctx.at),
    legalEntityId: bill.legalEntityId,
    supplierId: bill.supplierId,
    billId: bill.id,
    amount,
    ...(note ? { note } : {}),
    state: 'prepared',
    preparedBy: me(p).principalId,
    preparedByName: me(p).name,
    preparedAt: at,
    history: [],
  };
  const e: StoredEvent = { at, ...who(p), action: 'payment_prepared', values: { ref: x.ref, amount } };
  x.history.push(e);
  p.st.payments.push(x);
  const stored = p.st.bills.find((y) => y.id === bill.id)!;
  stored.history.push(e);
  supplierEvent(p, bill.supplierId, { ...e, billId: bill.id });
  remember(ctx, p.st.idempotency, { op: 'payables.payment.create', target: bill.id, input }, x.id);
  save(p);
  return paymentView(p, x);
}

function paymentAction(action: 'approve' | 'send' | 'cancel') {
  return (ctx: HandlerContext): PaymentView => {
    official(ctx);
    alsoNeeds(ctx, 'supplier.view', 'bank.view');
    const p0 = readPx(ctx);
    const need = action === 'approve' ? PAY_APPROVE : action === 'send' ? SUP_MANAGE : may(p0, 'supplier.manage') ? SUP_MANAGE : PAY_APPROVE;
    const x0 = findPayment(p0, ctx.params.id, need);
    if (!can(PAYMENT_FROM, action, x0.state)) stateConflict(ctx);
    if (action === 'approve' && x0.preparedBy === me(p0).principalId) refuse(ctx, 403, 'separation_of_duties', 'ownInstruction');
    const reason = reasonOf(ctx, action === 'cancel');
    const p = writePx(p0);
    const x = findPayment(p, ctx.params.id, need);
    const at = stampOf(p);
    if (action === 'approve') Object.assign(x, { state: 'approved', approvedBy: me(p).principalId, approvedByName: me(p).name, approvedAt: at });
    // "Sent (simulated) — not settled": nothing leaves any account, and the bill's obligation is unchanged.
    if (action === 'send') Object.assign(x, { state: 'sent_simulated', sentBy: me(p).principalId, sentByName: me(p).name, sentAt: at });
    if (action === 'cancel') Object.assign(x, { state: 'cancelled', cancelledBy: me(p).principalId, cancelledByName: me(p).name, cancelledAt: at, cancelReason: reason });
    const e: StoredEvent = { at, ...who(p), action: `payment_${action === 'approve' ? 'approved' : action === 'send' ? 'sent' : 'cancelled'}`, values: { ref: x.ref, amount: x.amount }, ...(reason ? { note: reason } : {}) };
    x.history.push(e);
    p.st.bills.find((y) => y.id === x.billId)?.history.push(e);
    supplierEvent(p, x.supplierId, { ...e, billId: x.billId });
    save(p);
    return paymentView(p, x);
  };
}

function paymentsList(ctx: HandlerContext): PaymentsList {
  const p = readPx(ctx);
  const scope = scopeOf(p, SUP_VIEW);
  const raw = q(ctx, 'state');
  const state: PaymentFilter = (PAYMENT_FILTERS as readonly string[]).includes(raw) ? (raw as PaymentFilter) : 'all';
  const base = p.st.payments.filter((x) => x.legalEntityId === scope.entity.id && paymentVisible(p, x));
  const counts = Object.fromEntries(PAYMENT_FILTERS.map((f) => [f, f === 'all' ? base.length : base.filter((x) => x.state === f).length])) as PaymentsList['counts'];
  return { scope, items: base.filter((x) => state === 'all' || x.state === state).reverse().map((x) => paymentSummary(p, x)), counts };
}

function utilityRegister(ctx: HandlerContext): UtilityRegister {
  const list = billsList(ctx, 'utility');
  const p = readPx(ctx);
  const all = p.st.bills.filter((b) => b.kind === 'utility' && b.legalEntityId === list.scope.entity.id && billVisible(p, b));
  const service = q(ctx, 'service');
  const items = list.items.filter((b) => !service || service === 'all' || b.utility?.service === service);
  const byService = Object.fromEntries(UTILITY_SERVICES.map((s) => [s, { count: all.filter((b) => b.utility?.service === s).length, awaitingApproval: all.filter((b) => b.utility?.service === s && b.state === 'submitted').length }])) as UtilityRegister['byService'];
  return { scope: list.scope, items, byService, canCreate: list.canCreate };
}

// ---- expenses -----------------------------------------------------------------------------------

const staffOf = (ctx: HandlerContext) => PERSONAS.filter((x) => x.tenantId === ctx.tenantId && x.app === 'backoffice' && !x.unlisted);

function expensesList(ctx: HandlerContext): ExpensesList {
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_VIEW);
  const cc = q(ctx, 'costCentre');
  // A cost centre named in the filter that the reader cannot see answers like one never issued.
  if (cc && !(costCentreVisible(ctx, p.dev, cc, EXP_VIEW) && ccEntity(p, cc) === scope.entity.id)) notFound(ctx);
  const kind = q(ctx, 'kind');
  const term = q(ctx, 'q');
  const raw = q(ctx, 'state');
  const state: ExpenseFilter = (EXPENSE_FILTERS as readonly string[]).includes(raw) ? (raw as ExpenseFilter) : 'all';
  const base = p.st.expenses.filter((e) => e.legalEntityId === scope.entity.id && expenseVisible(p, e) && (!cc || e.costCentreId === cc) && (!kind || kind === 'all' || e.kind === kind) && (!term || matches(term, e.ref, e.description, e.payee, e.claimantName)));
  const counts = Object.fromEntries(EXPENSE_FILTERS.map((f) => [f, f === 'all' ? base.length : base.filter((e) => e.state === f).length])) as ExpensesList['counts'];
  const items = base.filter((e) => state === 'all' || e.state === state).sort((a, b) => (a.incurredOn === b.incurredOn ? b.ref.localeCompare(a.ref) : a.incurredOn < b.incurredOn ? 1 : -1));
  return { scope, items: items.map((e) => expenseSummary(p, e)), counts, costCentres: usableCostCentres(p, scope.entity.id, EXP_VIEW), canCreate: may(p, 'expense.create') && usableCostCentres(p, scope.entity.id, EXP_CREATE).length > 0 };
}

function expenseOptions(ctx: HandlerContext): ExpenseOptions {
  alsoNeeds(ctx, 'expense.view');
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_CREATE);
  return {
    scope,
    costCentres: usableCostCentres(p, scope.entity.id, EXP_CREATE),
    floats: p.st.floats.filter((f) => f.legalEntityId === scope.entity.id && floatVisible(p, f, EXP_CREATE)).map((f) => ({ id: f.id, name: f.name, costCentreId: f.costCentreId })),
    claimants: staffOf(ctx).map((x) => ({ id: x.principalId, name: x.displayName, roleKey: x.roleKey })),
    today: ctx.at,
    canCreate: true,
  };
}

function createExpense(ctx: HandlerContext): ExpenseView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const b = body(ctx);
  const entityId = requireEntity(ctx, str(b.legalEntityId) || undefined, EXP_CREATE);
  const pr = new Problems();
  const cross: string[] = [];
  const costCentreId = costCentreFor(p0, pr, 'costCentreId', b.costCentreId, entityId, EXP_CREATE, cross);
  const kind = oneOf(pr, 'kind', b.kind ?? 'business', EXPENSE_KINDS, 'payables:errors.kind');
  let floatId: string | undefined;
  let paidVia: StoredExpense['paidVia'];
  let claimant: { id: string; name: string } | undefined;
  if (kind === 'business') {
    paidVia = oneOf(pr, 'paidVia', b.paidVia ?? 'payable', PAID_VIA, 'payables:errors.paidVia');
    if (paidVia === 'petty_cash') {
      const fid = str(b.floatId);
      const f = fid ? p0.st.floats.find((x) => x.id === fid && floatVisible(p0, x, EXP_CREATE)) : undefined;
      if (!fid) pr.add('floatId', 'forms:errors.required');
      else if (!f) pr.add('floatId', 'payables:errors.unknownFloat');
      else if (f.legalEntityId !== entityId) cross.push('floatId');
      else if (!pr.has('costCentreId') && f.costCentreId !== costCentreId) pr.add('floatId', 'payables:errors.floatCostCentre');
      floatId = f?.id;
    }
  } else {
    const cid = str(b.claimantId);
    const c = staffOf(ctx).find((x) => x.principalId === cid);
    if (!cid) pr.add('claimantId', 'forms:errors.required');
    else if (!c) pr.add('claimantId', 'payables:errors.unknownClaimant');
    claimant = c ? { id: c.principalId, name: c.displayName } : undefined;
  }
  crossEntityRefusal(ctx, cross);
  const category = oneOf<SpendCategory>(pr, 'category', b.category, SPEND_CATEGORIES, 'payables:errors.category');
  const description = text(pr, 'description', b.description, 3, 140);
  const amount = amountOf(pr, 'amount', b.amount);
  const incurredOn = dateOf(pr, 'incurredOn', b.incurredOn, ctx.at);
  const payee = kind === 'claim' ? (claimant?.name ?? '') : text(pr, 'payee', b.payee, 2, 80);
  if (floatId && !pr.has('amount')) {
    const f = p0.st.floats.find((x) => x.id === floatId)!;
    if (paisa({ amount, currency: 'PKR' }) > paisa({ amount: f.imprest, currency: 'PKR' })) pr.add('amount', 'payables:errors.aboveFloat', { amount: f.imprest });
  }
  const evidence = evidenceOf(pr, b.evidence);
  pr.throwIfAny(ctx);
  const input = { entityId, kind, costCentreId, category, description, amount, incurredOn, payee, paidVia: paidVia ?? null, floatId: floatId ?? null, claimantId: claimant?.id ?? null, evidence: evidence ?? null };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.expense.create', target: costCentreId, input, stillAuthorized: () => costCentreVisible(ctx, p0.dev, costCentreId, EXP_CREATE) });
  if (again) return expenseView(p0, findExpense(p0, again));
  const p = writePx(p0);
  const at = stampOf(p);
  const ref = nextRef(p.st, p.dev, entityId, kind === 'claim' ? 'claim' : 'expense', incurredOn);
  const e: StoredExpense = {
    id: newId(p, 'exp'),
    ref,
    kind,
    legalEntityId: entityId,
    costCentreId,
    category,
    description,
    amount,
    incurredOn,
    payee,
    ...(paidVia ? { paidVia } : {}),
    ...(floatId ? { floatId } : {}),
    ...(claimant ? { claimantId: claimant.id, claimantName: claimant.name } : {}),
    ...(evidence ? { evidence } : {}),
    state: 'draft',
    createdBy: me(p).principalId,
    createdByName: me(p).name,
    createdAt: at,
    demo: false,
    history: [{ at, ...who(p), action: 'expense_created', values: { ref, amount } }],
  };
  p.st.expenses.push(e);
  if (floatId) p.st.floats.find((f) => f.id === floatId)!.history.push({ at, ...who(p), action: 'expense_charged', values: { ref, amount } });
  remember(ctx, p.st.idempotency, { op: 'payables.expense.create', target: costCentreId, input }, e.id);
  save(p);
  return expenseView(p, e);
}

function expenseAction(action: 'submit' | 'approve' | 'reject' | 'withdraw') {
  return (ctx: HandlerContext): ExpenseView => {
    official(ctx);
    alsoNeeds(ctx, 'expense.view');
    const p0 = readPx(ctx);
    const deciding = action === 'approve' || action === 'reject';
    const e0 = findExpense(p0, ctx.params.id, deciding ? EXP_APPROVE : EXP_CREATE);
    if (!can(EXPENSE_FROM, action, e0.state)) stateConflict(ctx);
    if (deciding) {
      // Approver ≠ maker ≠ claimant, by principal (a claimant never approves their own reimbursement).
      const block = expenseBlock(p0, e0);
      if (block) refuse(ctx, 403, 'separation_of_duties', block === 'own_claim' ? 'ownClaim' : 'ownExpense');
    } else if (e0.createdBy !== me(p0).principalId) refuse(ctx, 403, 'not_maker', 'notMaker');
    const note = reasonOf(ctx, action === 'reject');
    if (action === 'submit') {
      const pr = new Problems();
      if (!e0.evidence) pr.add('evidence', 'payables:errors.evidenceRequired');
      pr.throwIfAny(ctx);
    }
    const p = writePx(p0);
    const e = findExpense(p, ctx.params.id, deciding ? EXP_APPROVE : EXP_CREATE);
    const at = stampOf(p);
    if (action === 'submit') Object.assign(e, { state: 'submitted', submittedBy: me(p).principalId, submittedByName: me(p).name, submittedAt: at });
    if (action === 'withdraw') Object.assign(e, { state: 'withdrawn' });
    if (deciding) Object.assign(e, { state: action === 'approve' ? 'approved' : 'rejected', decidedBy: me(p).principalId, decidedByName: me(p).name, decidedAt: at, ...(note ? { decisionNote: note } : {}) });
    e.history.push({ at, ...who(p), action: `expense_${action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'withdrawn'}`, values: { ref: e.ref, amount: e.amount }, ...(note ? { note } : {}) });
    save(p);
    return expenseView(p, e);
  };
}

function attachExpenseEvidence(ctx: HandlerContext): ExpenseView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const e0 = findExpense(p0, ctx.params.id, EXP_CREATE);
  if (e0.state !== 'draft') stateConflict(ctx);
  if (e0.createdBy !== me(p0).principalId) refuse(ctx, 403, 'not_maker', 'notMaker');
  const pr = new Problems();
  const evidence = evidenceOf(pr, body(ctx).evidence);
  if (!evidence && !pr.has('evidence')) pr.add('evidence', 'payables:errors.evidenceRequired');
  pr.throwIfAny(ctx);
  const p = writePx(p0);
  const e = findExpense(p, e0.id, EXP_CREATE);
  const at = stampOf(p);
  e.evidence = evidence;
  e.history.push({ at, ...who(p), action: 'evidence_attached', values: { name: evidence!.name } });
  save(p);
  return expenseView(p, e);
}

function approvals(ctx: HandlerContext): ExpenseApprovals {
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_VIEW);
  const decider = may(p, 'expense.approve');
  const item = (e: StoredExpense, blocked?: ApprovalItem['blocked']): ApprovalItem => ({
    id: e.id,
    ref: e.ref,
    kind: e.kind,
    description: e.description,
    amount: money(paisa({ amount: e.amount, currency: 'PKR' })),
    costCentre: ccRef(p, e.costCentreId),
    ...(e.claimantName ? { claimantName: e.claimantName } : {}),
    submittedByName: e.submittedByName ?? e.createdByName,
    submittedAt: e.submittedAt ?? e.createdAt,
    ...(blocked ? { blocked } : {}),
  });
  const visible = p.st.expenses.filter((e) => e.legalEntityId === scope.entity.id && expenseVisible(p, e));
  const submitted = visible.filter((e) => e.state === 'submitted');
  const canDecide = (e: StoredExpense) => decider && expenseVisible(p, e, EXP_APPROVE) && !expenseBlock(p, e);
  return {
    scope,
    toDecide: submitted.filter(canDecide).map((e) => item(e)),
    waiting: submitted.filter((e) => !canDecide(e)).map((e) => item(e, !decider || !expenseVisible(p, e, EXP_APPROVE) ? 'no_permission' : expenseBlock(p, e))),
    recent: visible
      .filter((e) => (e.state === 'approved' || e.state === 'rejected') && e.decidedAt)
      .sort((a, b) => (a.decidedAt! < b.decidedAt! ? 1 : -1))
      .slice(0, 10)
      .map((e) => ({ ...item(e), state: e.state, decidedByName: e.decidedByName!, decidedAt: e.decidedAt! })),
    canDecide: decider,
  };
}

// ---- petty cash ---------------------------------------------------------------------------------

function pettyCash(ctx: HandlerContext): PettyCashList {
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_VIEW);
  return { scope, floats: p.st.floats.filter((f) => f.legalEntityId === scope.entity.id && floatVisible(p, f)).map((f) => floatView(p, f)) };
}

function recordCount(ctx: HandlerContext): PettyCashFloatView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const f0 = findFloat(p0, ctx.params.id, EXP_CREATE);
  const b = body(ctx);
  const pr = new Problems();
  const notes = (b.notes && typeof b.notes === 'object' ? b.notes : {}) as Record<string, unknown>;
  if (!validNotes(notes)) pr.add('notes', 'payables:errors.notes');
  const clean = Object.fromEntries(CASH_NOTES.filter((n) => Number(notes[n] ?? 0) > 0).map((n) => [n, Number(notes[n])]));
  const total = validNotes(notes) ? countTotal(clean) : 0n;
  if (!pr.has('notes') && total === 0n) pr.add('notes', 'payables:errors.emptyCount');
  const note = text(pr, 'note', b.note, 3, 200, true);
  const evidence = evidenceOf(pr, b.evidence);
  if (!evidence) pr.add('evidence', 'payables:errors.evidenceRequired');
  pr.throwIfAny(ctx);
  const input = { floatId: f0.id, notes: clean, note, evidence: evidence ?? null };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.count.create', target: f0.id, input, stillAuthorized: () => floatVisible(p0, f0, EXP_CREATE) });
  if (again) return floatView(p0, findFloat(p0, f0.id));
  // One count awaits its witness at a time.
  if (f0.counts.some((c) => c.state === 'awaiting_witness')) refuse(ctx, 409, 'count_pending', 'countPending');
  const p = writePx(p0);
  const f = findFloat(p, f0.id, EXP_CREATE);
  const at = stampOf(p);
  const id = newId(p, 'pcc');
  f.counts.push({ id, countedOn: ctx.at, notes: clean, amount: money(total).amount, countedBy: me(p).principalId, countedByName: me(p).name, countedAt: at, state: 'awaiting_witness', ...(note ? { note } : {}), ...(evidence ? { evidence } : {}) });
  f.history.push({ at, ...who(p), action: 'count_recorded', values: { amount: money(total).amount } });
  remember(ctx, p.st.idempotency, { op: 'payables.count.create', target: f.id, input }, id);
  save(p);
  return floatView(p, f);
}

function witnessCount(ctx: HandlerContext): PettyCashFloatView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const f0 = findFloat(p0, ctx.params.id, EXP_APPROVE);
  const c0 = f0.counts.find((c) => c.id === ctx.params.sub);
  if (!c0) notFound(ctx);
  if (c0.state !== 'awaiting_witness') stateConflict(ctx);
  if (c0.countedBy === me(p0).principalId) refuse(ctx, 403, 'separation_of_duties', 'ownCount');
  const b = body(ctx);
  const pr = new Problems();
  const decision = oneOf(pr, 'decision', b.decision, ['confirm', 'dispute'] as const, 'payables:errors.decision');
  const note = text(pr, 'note', b.note, decision === 'dispute' ? 3 : 0, 200, decision !== 'dispute');
  pr.throwIfAny(ctx);
  const p = writePx(p0);
  const f = findFloat(p, f0.id, EXP_APPROVE);
  const c = f.counts.find((x) => x.id === c0.id)!;
  const at = stampOf(p);
  Object.assign(c, { state: decision === 'confirm' ? 'witnessed' : 'disputed', witnessedBy: me(p).principalId, witnessedByName: me(p).name, witnessedAt: at, ...(note ? { note } : {}) });
  f.history.push({ at, ...who(p), action: decision === 'confirm' ? 'count_witnessed' : 'count_disputed', values: { amount: c.amount }, ...(note ? { note } : {}) });
  save(p);
  return floatView(p, f);
}

function requestTopUp(ctx: HandlerContext): PettyCashFloatView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const f0 = findFloat(p0, ctx.params.id, EXP_CREATE);
  const b = body(ctx);
  const pr = new Problems();
  const amount = amountOf(pr, 'amount', b.amount);
  const reason = text(pr, 'reason', b.reason, 3, 200);
  if (!pr.has('amount') && paisa({ amount, currency: 'PKR' }) > paisa({ amount: f0.imprest, currency: 'PKR' })) pr.add('amount', 'payables:errors.aboveImprest', { amount: f0.imprest });
  pr.throwIfAny(ctx);
  const input = { floatId: f0.id, amount, reason };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.topup.create', target: f0.id, input, stillAuthorized: () => floatVisible(p0, f0, EXP_CREATE) });
  if (again) return floatView(p0, findFloat(p0, f0.id));
  if (f0.topUps.some((x) => x.state === 'prepared')) refuse(ctx, 409, 'top_up_pending', 'topUpPending');
  const p = writePx(p0);
  const f = findFloat(p, f0.id, EXP_CREATE);
  const at = stampOf(p);
  const id = newId(p, 'pct');
  const ref = nextRef(p.st, p.dev, f.legalEntityId, 'top_up', ctx.at);
  f.topUps.push({ id, ref, amount, reason, state: 'prepared', requestedBy: me(p).principalId, requestedByName: me(p).name, requestedAt: at });
  f.history.push({ at, ...who(p), action: 'topup_prepared', values: { ref, amount } });
  remember(ctx, p.st.idempotency, { op: 'payables.topup.create', target: f.id, input }, id);
  save(p);
  return floatView(p, f);
}

function topUpAction(action: 'approve' | 'cancel') {
  return (ctx: HandlerContext): PettyCashFloatView => {
    official(ctx);
    alsoNeeds(ctx, 'expense.view');
    const p0 = readPx(ctx);
    const need = action === 'approve' ? EXP_APPROVE : may(p0, 'expense.create') ? EXP_CREATE : EXP_APPROVE;
    const f0 = findFloat(p0, ctx.params.id, need);
    const x0 = f0.topUps.find((x) => x.id === ctx.params.sub);
    if (!x0) notFound(ctx);
    if (action === 'approve' ? x0.state !== 'prepared' : x0.state === 'cancelled') stateConflict(ctx);
    if (action === 'approve' && x0.requestedBy === me(p0).principalId) refuse(ctx, 403, 'separation_of_duties', 'ownRequest');
    const reason = reasonOf(ctx, action === 'cancel');
    const p = writePx(p0);
    const f = findFloat(p, f0.id, need);
    const x = f.topUps.find((y) => y.id === x0.id)!;
    const at = stampOf(p);
    // An approved top-up is an instruction ("Approved instruction — not sent"): the float's cash does not change.
    if (action === 'approve') Object.assign(x, { state: 'approved', approvedBy: me(p).principalId, approvedByName: me(p).name, approvedAt: at });
    else Object.assign(x, { state: 'cancelled', cancelledBy: me(p).principalId, cancelledByName: me(p).name, cancelledAt: at });
    f.history.push({ at, ...who(p), action: action === 'approve' ? 'topup_approved' : 'topup_cancelled', values: { ref: x.ref, amount: x.amount }, ...(reason ? { note: reason } : {}) });
    save(p);
    return floatView(p, f);
  };
}

// ---- budgets ------------------------------------------------------------------------------------

const yearOf = (raw: string): FiscalYear => ((FISCAL_YEARS as readonly string[]).includes(raw) ? (raw as FiscalYear) : 'FY2026-27');

function budgetsList(ctx: HandlerContext): BudgetsList {
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_VIEW);
  const year = q(ctx, 'year');
  const items = p.st.budgets.filter((b) => b.legalEntityId === scope.entity.id && budgetVisible(p, b) && (!year || b.year === year));
  return { scope, items: items.map((b) => budgetSummary(p, b)), costCentres: usableCostCentres(p, scope.entity.id, BUD_MANAGE).filter(() => may(p, 'budget.manage')), canCreate: may(p, 'budget.manage') && usableCostCentres(p, scope.entity.id, BUD_MANAGE).length > 0 };
}

function linesOf(pr: Problems, raw: unknown): Array<{ category: SpendCategory; amount: string }> {
  const list = Array.isArray(raw) ? (raw as Body[]) : [];
  if (!list.length) pr.add('lines', 'payables:errors.noLines');
  if (list.length > SPEND_CATEGORIES.length) pr.add('lines', 'payables:errors.tooManyLines');
  const lines = list.slice(0, SPEND_CATEGORIES.length).map((l, i) => ({ category: oneOf<SpendCategory>(pr, `lines.${i}.category`, l?.category, SPEND_CATEGORIES, 'payables:errors.category'), amount: amountOf(pr, `lines.${i}.amount`, l?.amount) }));
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    if (seen.has(l.category)) pr.add(`lines.${i}.category`, 'payables:errors.duplicateCategory');
    seen.add(l.category);
  });
  return lines;
}

function createBudget(ctx: HandlerContext): BudgetView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const b = body(ctx);
  const entityId = requireEntity(ctx, str(b.legalEntityId) || undefined, BUD_MANAGE);
  const pr = new Problems();
  const cross: string[] = [];
  const costCentreId = costCentreFor(p0, pr, 'costCentreId', b.costCentreId, entityId, BUD_MANAGE, cross);
  crossEntityRefusal(ctx, cross);
  const year = oneOf<FiscalYear>(pr, 'year', b.year, FISCAL_YEARS, 'payables:errors.year');
  const reason = text(pr, 'reason', b.reason, 3, 160);
  const lines = linesOf(pr, b.lines);
  pr.throwIfAny(ctx);
  const input = { entityId, costCentreId, year, reason, lines };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.budget.create', target: `${costCentreId}:${year}`, input, stillAuthorized: () => costCentreVisible(ctx, p0.dev, costCentreId, BUD_MANAGE) });
  if (again) return budgetView(p0, findBudget(p0, again));
  if (p0.st.budgets.some((x) => x.costCentreId === costCentreId && x.year === year)) refuse(ctx, 409, 'budget_exists', 'budgetExists', 'costCentreId');
  const p = writePx(p0);
  const at = stampOf(p);
  const total = money(lineTotal(lines)).amount;
  const budget: StoredBudget = {
    id: newId(p, 'bud'),
    ref: nextRef(p.st, p.dev, entityId, 'budget', ctx.at),
    legalEntityId: entityId,
    costCentreId,
    year,
    versions: [{ n: 1, state: 'draft', lines, reason, preparedBy: me(p).principalId, preparedByName: me(p).name, preparedAt: at }],
    demo: false,
    history: [{ at, ...who(p), action: 'version_created', values: { n: '1', amount: total } }],
  };
  p.st.budgets.push(budget);
  remember(ctx, p.st.idempotency, { op: 'payables.budget.create', target: `${costCentreId}:${year}`, input }, budget.id);
  save(p);
  return budgetView(p, budget);
}

function newVersion(ctx: HandlerContext): BudgetView {
  official(ctx);
  alsoNeeds(ctx, 'expense.view');
  const p0 = readPx(ctx);
  const b0 = findBudget(p0, ctx.params.id, BUD_MANAGE);
  const b = body(ctx);
  const pr = new Problems();
  const reason = text(pr, 'reason', b.reason, 3, 160);
  const lines = linesOf(pr, b.lines);
  pr.throwIfAny(ctx);
  const input = { budgetId: b0.id, reason, lines };
  const again = replayOf(ctx, p0.st.idempotency, { op: 'payables.budget.version', target: b0.id, input, stillAuthorized: () => budgetVisible(p0, b0, BUD_MANAGE) });
  if (again) return budgetView(p0, findBudget(p0, again));
  // Versions are never edited in place: one open (draft or submitted) version at a time.
  if (openVersion(b0.versions)) refuse(ctx, 409, 'version_open', 'versionOpen');
  const p = writePx(p0);
  const budget = findBudget(p, b0.id, BUD_MANAGE);
  const at = stampOf(p);
  const n = Math.max(...budget.versions.map((v) => v.n)) + 1;
  budget.versions.push({ n, state: 'draft', lines, reason, preparedBy: me(p).principalId, preparedByName: me(p).name, preparedAt: at });
  budget.history.push({ at, ...who(p), action: 'version_created', values: { n: String(n), amount: money(lineTotal(lines)).amount } });
  remember(ctx, p.st.idempotency, { op: 'payables.budget.version', target: budget.id, input }, budget.id);
  save(p);
  return budgetView(p, budget);
}

function versionAction(action: 'submit' | 'withdraw' | 'approve' | 'reject') {
  return (ctx: HandlerContext): BudgetView => {
    official(ctx);
    alsoNeeds(ctx, 'expense.view');
    const p0 = readPx(ctx);
    const deciding = action === 'approve' || action === 'reject';
    const b0 = findBudget(p0, ctx.params.id, deciding ? BUD_APPROVE : BUD_MANAGE);
    const v0 = b0.versions.find((v) => String(v.n) === ctx.params.sub);
    if (!v0) notFound(ctx);
    if (!can(BUDGET_FROM, action, v0.state)) stateConflict(ctx);
    if (deciding && v0.preparedBy === me(p0).principalId) refuse(ctx, 403, 'separation_of_duties', 'ownVersion');
    if (!deciding && v0.preparedBy !== me(p0).principalId) refuse(ctx, 403, 'not_maker', 'notMaker');
    const note = reasonOf(ctx, action === 'reject');
    const p = writePx(p0);
    const budget = findBudget(p, b0.id, deciding ? BUD_APPROVE : BUD_MANAGE);
    const v = budget.versions.find((x) => x.n === v0.n)!;
    const at = stampOf(p);
    const amount = money(lineTotal(v.lines)).amount;
    if (action === 'approve') {
      for (const old of budget.versions.filter((x) => x.state === 'approved')) {
        old.state = 'superseded';
        budget.history.push({ at, ...who(p), action: 'version_superseded', values: { n: String(old.n), amount: money(lineTotal(old.lines)).amount } });
      }
    }
    if (action === 'submit') Object.assign(v, { state: 'submitted', submittedAt: at });
    if (action === 'withdraw') Object.assign(v, { state: 'withdrawn' });
    if (deciding) Object.assign(v, { state: action === 'approve' ? 'approved' : 'rejected', decidedBy: me(p).principalId, decidedByName: me(p).name, decidedAt: at, ...(note ? { decisionNote: note } : {}) });
    budget.history.push({ at, ...who(p), action: `version_${action === 'submit' ? 'submitted' : action === 'withdraw' ? 'withdrawn' : action === 'approve' ? 'approved' : 'rejected'}`, values: { n: String(v.n), amount }, ...(note ? { note } : {}) });
    save(p);
    return budgetView(p, budget);
  };
}

function bva(ctx: HandlerContext): BudgetVsActual {
  const p = readPx(ctx);
  const scope = scopeOf(p, EXP_VIEW);
  const year = yearOf(q(ctx, 'year'));
  const cc = q(ctx, 'costCentre');
  if (cc && !(costCentreVisible(ctx, p.dev, cc, EXP_VIEW) && ccEntity(p, cc) === scope.entity.id)) notFound(ctx);
  const { from, to } = fiscalYearBounds(year);
  const inYear = (d: string) => d >= from && d <= to;
  // Approved supplier bills count only for readers who may see bills (amounts only; never a supplier or reference).
  const billsIncluded = may(p, 'supplier.view');
  const spendOn = (ccId: string) => [
    ...p.st.expenses.filter((e) => e.costCentreId === ccId && e.state === 'approved' && inYear(e.incurredOn)).map((e) => ({ category: e.category, amount: e.amount })),
    ...(billsIncluded ? p.st.bills.filter((b) => b.state === 'approved' && inYear(b.invoiceDate)).flatMap((b) => b.lines.filter((l) => l.costCentreId === ccId).map((l) => ({ category: l.category, amount: l.amount }))) : []),
  ];
  const row = (b: StoredBudget): BvaBudget | undefined => {
    const v = approvedVersion(b.versions);
    if (!v) return undefined;
    // Actual = posted only. Nothing is posted until E.7's posting rules (E-17): no posted line exists.
    const r = budgetVsActual({ budget: v.lines, posted: [], approvedNotPosted: spendOn(b.costCentreId) });
    return {
      budgetId: b.id,
      budgetRef: b.ref,
      costCentre: ccRef(p, b.costCentreId),
      year: b.year,
      version: v.n,
      billsIncluded,
      rows: r.rows.map((x) => ({ category: x.category, budget: money(x.budget), actualPosted: money(x.actualPosted), approvedNotPosted: money(x.approvedNotPosted), remaining: money(x.remaining) })),
      totals: { budget: money(r.totals.budget), actualPosted: money(r.totals.actualPosted), approvedNotPosted: money(r.totals.approvedNotPosted), remaining: money(r.totals.remaining) },
    };
  };
  const inEntity = p.st.budgets.filter((b) => b.legalEntityId === scope.entity.id && b.year === year);
  const visible = inEntity.filter((b) => budgetVisible(p, b) && (!cc || b.costCentreId === cc));
  const budgets = visible.map(row).filter((x): x is BvaBudget => !!x);
  const centres = usableCostCentres(p, scope.entity.id, EXP_VIEW).filter((c) => !cc || c.id === cc);
  const withoutApproved = centres
    .filter((c) => !budgets.some((x) => x.costCentre.id === c.id))
    .map((c) => {
      const b = inEntity.find((x) => x.costCentreId === c.id);
      const o = b ? openVersion(b.versions) : undefined;
      return { costCentre: c, ...(b ? { budgetId: b.id } : {}), ...(o ? { openState: o.state } : {}) };
    });
  const whole = entityWhole(ctx, scope.entity.id, EXP_VIEW) && !cc;
  const all = inEntity.map(row).filter((x): x is BvaBudget => !!x);
  const tot = (k: 'budget' | 'actualPosted' | 'approvedNotPosted' | 'remaining') => money(sum(all.map((x) => paisa(x.totals[k]))));
  const entityTotals = wholeOnly(whole, { budget: tot('budget'), actualPosted: tot('actualPosted'), approvedNotPosted: tot('approvedNotPosted'), remaining: tot('remaining') });
  return { scope, year, budgets, withoutApproved, ...(entityTotals ? { entityTotals } : {}), postingPlanned: true, commitments: 'planned' };
}

// ---- registration -------------------------------------------------------------------------------

const read = (permission: Permission | readonly Permission[]) => requires('payables', permission, 'history_read');
const write = (permission: Permission | readonly Permission[]) => requires('payables', permission, 'operational');

export const PAYABLES_HANDLERS: readonly Handler[] = [
  { method: 'GET', pattern: path('/suppliers'), access: read('supplier.view'), handle: suppliersList },
  { method: 'POST', pattern: path('/suppliers'), access: write('supplier.manage'), handle: createSupplier },
  { method: 'GET', pattern: path('/suppliers/:id/ledger'), access: read('supplier.view'), handle: ledgerOf },
  { method: 'GET', pattern: path('/suppliers/:id'), access: read('supplier.view'), handle: (ctx) => supplier360(readPx(ctx), findSupplier(readPx(ctx), ctx.params.id)) },
  { method: 'GET', pattern: path('/supplier-bills/options'), access: read('supplier.manage'), handle: billOptions },
  { method: 'GET', pattern: path('/supplier-bills'), access: read('supplier.view'), handle: (ctx) => billsList(ctx) },
  { method: 'POST', pattern: path('/supplier-bills'), access: write('supplier.manage'), handle: createBill },
  { method: 'GET', pattern: path('/supplier-bills/:id'), access: read('supplier.view'), handle: (ctx) => billView(readPx(ctx), findBill(readPx(ctx), ctx.params.id)) },
  { method: 'POST', pattern: path('/supplier-bills/:id/submit'), access: write('supplier.manage'), handle: billAction('submit') },
  { method: 'POST', pattern: path('/supplier-bills/:id/approve'), access: write('supplier_bill.approve'), handle: billAction('approve') },
  { method: 'POST', pattern: path('/supplier-bills/:id/reject'), access: write('supplier_bill.approve'), handle: billAction('reject') },
  { method: 'POST', pattern: path('/supplier-bills/:id/cancel'), access: write('supplier.manage'), handle: billAction('cancel') },
  { method: 'POST', pattern: path('/supplier-bills/:id/evidence'), access: write('supplier.manage'), handle: attachBillEvidence },
  { method: 'POST', pattern: path('/supplier-bills/:id/post'), access: write('supplier.manage'), handle: postBill },
  { method: 'POST', pattern: path('/supplier-bills/:id/payments'), access: write('supplier.manage'), handle: createPayment },
  { method: 'GET', pattern: path('/supplier-payments'), access: read('supplier.view'), handle: paymentsList },
  { method: 'GET', pattern: path('/supplier-payments/:id'), access: read('supplier.view'), handle: (ctx) => paymentView(readPx(ctx), findPayment(readPx(ctx), ctx.params.id)) },
  { method: 'POST', pattern: path('/supplier-payments/:id/approve'), access: write('supplier_payment.approve'), handle: paymentAction('approve') },
  { method: 'POST', pattern: path('/supplier-payments/:id/send'), access: write('supplier.manage'), handle: paymentAction('send') },
  { method: 'POST', pattern: path('/supplier-payments/:id/cancel'), access: write(['supplier.manage', 'supplier_payment.approve']), handle: paymentAction('cancel') },
  { method: 'GET', pattern: path('/utility-bills'), access: read('supplier.view'), handle: utilityRegister },
  { method: 'GET', pattern: path('/expenses/options'), access: read('expense.create'), handle: expenseOptions },
  { method: 'GET', pattern: path('/expenses'), access: read('expense.view'), handle: expensesList },
  { method: 'POST', pattern: path('/expenses'), access: write('expense.create'), handle: createExpense },
  { method: 'GET', pattern: path('/expenses/:id'), access: read('expense.view'), handle: (ctx) => expenseView(readPx(ctx), findExpense(readPx(ctx), ctx.params.id)) },
  { method: 'POST', pattern: path('/expenses/:id/evidence'), access: write('expense.create'), handle: attachExpenseEvidence },
  { method: 'POST', pattern: path('/expenses/:id/submit'), access: write('expense.create'), handle: expenseAction('submit') },
  { method: 'POST', pattern: path('/expenses/:id/withdraw'), access: write('expense.create'), handle: expenseAction('withdraw') },
  { method: 'POST', pattern: path('/expenses/:id/approve'), access: write('expense.approve'), handle: expenseAction('approve') },
  { method: 'POST', pattern: path('/expenses/:id/reject'), access: write('expense.approve'), handle: expenseAction('reject') },
  { method: 'GET', pattern: path('/expense-approvals'), access: read('expense.view'), handle: approvals },
  { method: 'GET', pattern: path('/petty-cash'), access: read('expense.view'), handle: pettyCash },
  { method: 'POST', pattern: path('/petty-cash/:id/counts'), access: write('expense.create'), handle: recordCount },
  { method: 'POST', pattern: path('/petty-cash/:id/counts/:sub/witness'), access: write('expense.approve'), handle: witnessCount },
  { method: 'POST', pattern: path('/petty-cash/:id/top-ups'), access: write('expense.create'), handle: requestTopUp },
  { method: 'POST', pattern: path('/petty-cash/:id/top-ups/:sub/approve'), access: write('expense.approve'), handle: topUpAction('approve') },
  { method: 'POST', pattern: path('/petty-cash/:id/top-ups/:sub/cancel'), access: write(['expense.create', 'expense.approve']), handle: topUpAction('cancel') },
  { method: 'GET', pattern: path('/budgets'), access: read('expense.view'), handle: budgetsList },
  { method: 'POST', pattern: path('/budgets'), access: write('budget.manage'), handle: createBudget },
  { method: 'GET', pattern: path('/budgets/:id'), access: read('expense.view'), handle: (ctx) => budgetView(readPx(ctx), findBudget(readPx(ctx), ctx.params.id)) },
  { method: 'POST', pattern: path('/budgets/:id/versions'), access: write('budget.manage'), handle: newVersion },
  { method: 'POST', pattern: path('/budgets/:id/versions/:sub/submit'), access: write('budget.manage'), handle: versionAction('submit') },
  { method: 'POST', pattern: path('/budgets/:id/versions/:sub/withdraw'), access: write('budget.manage'), handle: versionAction('withdraw') },
  { method: 'POST', pattern: path('/budgets/:id/versions/:sub/approve'), access: write('budget.approve'), handle: versionAction('approve') },
  { method: 'POST', pattern: path('/budgets/:id/versions/:sub/reject'), access: write('budget.approve'), handle: versionAction('reject') },
  { method: 'GET', pattern: path('/budget-vs-actual'), access: read('expense.view'), handle: bva },
];

/** Unused export guard: the vocabulary this module serves (kept for the register's mock_api column). */
export const PAYABLES_BUDGET_STATES = BUDGET_VERSION_STATES;
