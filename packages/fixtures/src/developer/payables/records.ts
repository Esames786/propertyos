import type { ActivityGroup, ActivityItem, ModuleKey, RecordRef, RelatedGroup, TaskItem, TaskKind, TaskUrgency, WorkspaceRecordType } from '@repo/contracts';
import { can, matches, type HandlerContext } from '../../handler-types';
import { developerState } from '../state';
import type { RecordProvider } from '../workspace/records';
import { fiscalYearOf, openVersion } from './rules';
import { payablesState, type StoredBill, type StoredBudget, type StoredEvent, type StoredExpense, type StoredPayment, type StoredSupplier } from './state';
import { BILL_APPROVE, billVisible, BUD_APPROVE, budgetVisible, ccRef, EXP_APPROVE, expenseBlock, expenseVisible, PAY_APPROVE, paymentVisible, seesBank, supplierVisible, type Px } from './views';

/**
 * Wave 2 integration (canonical seam notes §6): Gate E.8's records in E.13's record registry, so unified
 * search, related records, favourites, recent records, tasks and projected activity reach them.
 *
 * Eligible kinds (each has a record screen of its own, at `?record=<id>`):
 *   supplier (`sup_`, SUP-002 Supplier 360) · supplier_bill (`sbl_`, SUP-004 bill workspace) ·
 *   supplier_payment (`spi_`, SUP-006 payment instruction drawer) · expense (`exp_`, EXP-003) ·
 *   budget (`bud_`, EXP-008).
 * Not registered: petty-cash floats (`pcf_`), counts (`pcc_`) and top-ups (`pct_`). They have no record
 * address of their own (they live on EXP-005, chosen inside the page), so nothing could open them as a
 * record; their witness and top-up approvals stay on EXP-005.
 *
 * Every answer uses E.8's own record rule, which is E.0's canonical scope (`views.ts`): a supplier is a
 * legal-entity record (`entityVisible`); a bill, and so its payment instructions, needs the entity and EVERY
 * cost centre its lines touch (`costCentreVisible`); an expense and a budget follow their one cost centre.
 * `resolve` returns null for an id never issued and for one the reader may not open alike (no oracle), and
 * it is worked out per request, so a revoked grant or a narrowed scope hides every search hit, favourite,
 * recent record, task and activity entry at once. Each organisation's payables are its own section of the
 * demo store, so another tenant's id is simply unknown.
 *
 * A reference names the record's own facts only (reference, supplier name or description, state). It never
 * carries a bank name, account title, last digits or any other bank detail (E.7's boundary stays with the
 * screens that check `seesBank`), and no amount: a card or search hit is not a money view.
 */

const READ: HandlerContext['suspension'] = 'history_read';

/** The reader's payables, read for a record question (reads store nothing; another kind of organisation has none). */
function pxOf(ctx: HandlerContext): Px | null {
  const dev = developerState(ctx);
  return dev ? { ctx: { ...ctx, suspension: READ }, st: payablesState(ctx), dev } : null;
}

const HREF = {
  supplier: (id: string) => `/backoffice/sup/supplier-360-workspace?record=${id}`,
  bill: (id: string) => `/backoffice/sup/supplier-bill-workspace?record=${id}`,
  payment: (id: string) => `/backoffice/sup/supplier-payment-drawer?record=${id}`,
  expense: (id: string) => `/backoffice/exp/expense-workspace?record=${id}`,
  budget: (id: string) => `/backoffice/exp/budget-workspace?record=${id}`,
};

const supplierName = (p: Px, id: string) => p.st.suppliers.find((s) => s.id === id)?.name ?? '';

function supplierRef(s: StoredSupplier): RecordRef {
  return { type: 'supplier', id: s.id, ref: s.ref, title: s.name, subtitleKey: `payables:supplierCategory.${s.category}`, href: HREF.supplier(s.id), module: 'payables', favouritable: true };
}
function billRef(p: Px, b: StoredBill): RecordRef {
  return { type: 'supplier_bill', id: b.id, ref: b.ref, title: supplierName(p, b.supplierId), subtitleKey: `payables:billState.${b.state}`, href: HREF.bill(b.id), module: 'payables', favouritable: true };
}
function paymentRef(p: Px, x: StoredPayment): RecordRef {
  return { type: 'supplier_payment', id: x.id, ref: x.ref, title: supplierName(p, x.supplierId), subtitleKey: `payables:paymentState.${x.state}`, href: HREF.payment(x.id), module: 'payables', favouritable: true };
}
function expenseRef(e: StoredExpense): RecordRef {
  return { type: 'expense', id: e.id, ref: e.ref, title: e.description, subtitleKey: `payables:expenseState.${e.state}`, href: HREF.expense(e.id), module: 'payables', favouritable: true };
}
function budgetRef(p: Px, b: StoredBudget): RecordRef {
  return { type: 'budget', id: b.id, ref: b.ref, title: `${ccRef(p, b.costCentreId).name} · ${b.year}`, subtitle: ccRef(p, b.costCentreId).code, href: HREF.budget(b.id), module: 'payables', favouritable: true };
}

// ---- what the reader may open (E.8's own rule, with the record-screen permission) ------------------

const suppliersOf = (p: Px) => p.st.suppliers.filter((s) => supplierVisible(p, s));
const billsOf = (p: Px) => p.st.bills.filter((b) => billVisible(p, b));
const paymentsOf = (p: Px) => p.st.payments.filter((x) => paymentVisible(p, x));
const expensesOf = (p: Px) => p.st.expenses.filter((e) => expenseVisible(p, e));
const budgetsOf = (p: Px) => p.st.budgets.filter((b) => budgetVisible(p, b));

const readsSuppliers = (ctx: HandlerContext) => can(ctx, 'supplier.view', READ);
const readsExpenses = (ctx: HandlerContext) => can(ctx, 'expense.view', READ);

type Kind = 'supplier' | 'supplier_bill' | 'supplier_payment' | 'expense' | 'budget';
/** One record, as the reader may see it, or null (never issued and hidden answer alike). */
function resolveIn(p: Px, kind: Kind, id: string): RecordRef | null {
  if (kind === 'supplier') {
    const s = suppliersOf(p).find((x) => x.id === id);
    return s ? supplierRef(s) : null;
  }
  if (kind === 'supplier_bill') {
    const b = billsOf(p).find((x) => x.id === id);
    return b ? billRef(p, b) : null;
  }
  if (kind === 'supplier_payment') {
    const x = paymentsOf(p).find((y) => y.id === id);
    return x ? paymentRef(p, x) : null;
  }
  if (kind === 'expense') {
    const e = expensesOf(p).find((x) => x.id === id);
    return e ? expenseRef(e) : null;
  }
  const b = budgetsOf(p).find((x) => x.id === id);
  return b ? budgetRef(p, b) : null;
}

const PREFIX: Record<Kind, string> = { supplier: 'sup_', supplier_bill: 'sbl_', supplier_payment: 'spi_', expense: 'exp_', budget: 'bud_' };
const kindOf = (id: string): Kind | undefined => (Object.keys(PREFIX) as Kind[]).find((k) => id.startsWith(PREFIX[k]));

/** A payables record for the reader (the registry's answer for these prefixes), or null. */
export function resolvePayable(ctx: HandlerContext, id: string): RecordRef | null {
  const kind = kindOf(id);
  const p = kind ? pxOf(ctx) : null;
  return kind && p ? resolveIn(p, kind, id) : null;
}

// ---- related records: each one resolved for the reader --------------------------------------------

const RELATED_LIMIT = 5;
const group = (type: WorkspaceRecordType, relation: string, refs: ReadonlyArray<RecordRef | null>): RelatedGroup[] => {
  const items = refs.filter((r): r is RecordRef => !!r);
  return items.length ? [{ type, relationKey: `workspace:hub.related.rel.${relation}`, items: items.slice(0, RELATED_LIMIT), more: items.length > RELATED_LIMIT }] : [];
};
const newestFirst = <T extends { ref: string }>(xs: readonly T[]) => [...xs].sort((a, b) => b.ref.localeCompare(a.ref));
/** The budgets a cost centre's spend in a fiscal year counts against. */
const budgetsFor = (p: Px, costCentreIds: readonly string[], date: string) => {
  const year = fiscalYearOf(date);
  return p.st.budgets.filter((b) => costCentreIds.includes(b.costCentreId) && b.year === year);
};

function relatedOf(ctx: HandlerContext, id: string): RelatedGroup[] {
  const kind = kindOf(id);
  const p = kind ? pxOf(ctx) : null;
  if (!kind || !p || !resolveIn(p, kind, id)) return [];
  if (kind === 'supplier') {
    const bills = newestFirst(p.st.bills.filter((b) => b.supplierId === id));
    const pays = newestFirst(p.st.payments.filter((x) => x.supplierId === id));
    return [...group('supplier_bill', 'bills', bills.map((b) => resolveIn(p, 'supplier_bill', b.id))), ...group('supplier_payment', 'paymentInstructions', pays.map((x) => resolveIn(p, 'supplier_payment', x.id)))];
  }
  if (kind === 'supplier_bill') {
    const b = p.st.bills.find((x) => x.id === id)!;
    const pays = newestFirst(p.st.payments.filter((x) => x.billId === id));
    return [
      ...group('supplier', 'supplier', [resolveIn(p, 'supplier', b.supplierId)]),
      ...group('supplier_payment', 'paymentInstructions', pays.map((x) => resolveIn(p, 'supplier_payment', x.id))),
      ...group('budget', 'budgets', budgetsFor(p, [...new Set(b.lines.map((l) => l.costCentreId))], b.invoiceDate).map((x) => resolveIn(p, 'budget', x.id))),
    ];
  }
  if (kind === 'supplier_payment') {
    const x = p.st.payments.find((y) => y.id === id)!;
    return [...group('supplier_bill', 'bill', [resolveIn(p, 'supplier_bill', x.billId)]), ...group('supplier', 'supplier', [resolveIn(p, 'supplier', x.supplierId)])];
  }
  if (kind === 'expense') {
    const e = p.st.expenses.find((x) => x.id === id)!;
    return group('budget', 'budget', budgetsFor(p, [e.costCentreId], e.incurredOn).map((b) => resolveIn(p, 'budget', b.id)));
  }
  const b = p.st.budgets.find((x) => x.id === id)!;
  const inYear = (d: string) => fiscalYearOf(d) === b.year;
  const expenses = newestFirst(p.st.expenses.filter((e) => e.costCentreId === b.costCentreId && inYear(e.incurredOn)));
  const bills = newestFirst(p.st.bills.filter((x) => inYear(x.invoiceDate) && x.lines.some((l) => l.costCentreId === b.costCentreId)));
  return [...group('expense', 'expenses', expenses.map((e) => resolveIn(p, 'expense', e.id))), ...group('supplier_bill', 'bills', bills.map((x) => resolveIn(p, 'supplier_bill', x.id)))];
}

// ---- the providers ----------------------------------------------------------------------------------

function provider(type: Kind, readable: (ctx: HandlerContext) => boolean, list: (p: Px) => RecordRef[], terms: (p: Px, r: RecordRef) => Array<string | undefined>): RecordProvider {
  return {
    type,
    owns: (id) => id.startsWith(PREFIX[type]),
    resolve: (ctx, id) => {
      const p = pxOf(ctx);
      return p ? resolveIn(p, type, id) : null;
    },
    searchable: (ctx) => readable(ctx) && !!developerState(ctx),
    search: (ctx, q, limit) => {
      const p = pxOf(ctx);
      return p ? list(p).filter((r) => matches(q, ...terms(p, r))).slice(0, limit) : [];
    },
    related: relatedOf,
  };
}

const find = <T extends { id: string }>(xs: readonly T[], id: string) => xs.find((x) => x.id === id)!;

export const PAYABLES_RECORD_PROVIDERS: readonly RecordProvider[] = [
  // Name, reference and tax reference (never a bank detail: searching by one finds nothing).
  provider('supplier', readsSuppliers, (p) => suppliersOf(p).map(supplierRef), (p, r) => [r.title, r.ref, find(p.st.suppliers, r.id).taxRef]),
  provider('supplier_bill', readsSuppliers, (p) => newestFirst(billsOf(p)).map((b) => billRef(p, b)), (p, r) => {
    const b = find(p.st.bills, r.id);
    return [b.ref, b.supplierInvoiceNo, r.title, b.utility?.consumerNo];
  }),
  provider('supplier_payment', readsSuppliers, (p) => newestFirst(paymentsOf(p)).map((x) => paymentRef(p, x)), (p, r) => {
    const x = find(p.st.payments, r.id);
    return [x.ref, r.title, p.st.bills.find((b) => b.id === x.billId)?.ref];
  }),
  provider('expense', readsExpenses, (p) => newestFirst(expensesOf(p)).map(expenseRef), (p, r) => {
    const e = find(p.st.expenses, r.id);
    return [e.ref, e.description, e.payee, e.claimantName];
  }),
  provider('budget', readsExpenses, (p) => newestFirst(budgetsOf(p)).map((b) => budgetRef(p, b)), (p, r) => {
    const b = find(p.st.budgets, r.id);
    return [b.ref, b.year, ccRef(p, b.costCentreId).name, ccRef(p, b.costCentreId).code];
  }),
];

// ---- tasks (HOME-002 / HOME-004): approvals waiting for someone other than their maker ------------

type Scope = 'mine' | 'team';
interface PayablesTaskProvider {
  kind: TaskKind;
  module: ModuleKey;
  available: (ctx: HandlerContext) => boolean;
  collect: (ctx: HandlerContext, scope: Scope) => TaskItem[];
}
type UrgencyOf = (today: string, due: string | undefined) => TaskUrgency;

/** The decider's context: deciding is operational work (E.8's write endpoints), reading the record is not. */
function deciderPx(ctx: HandlerContext): Px | null {
  const dev = developerState(ctx);
  return dev ? { ctx: { ...ctx, suspension: 'operational' }, st: payablesState(ctx), dev } : null;
}

/**
 * The approvals of E.8 as tasks, for the people who may decide them (the checker's permission over the
 * record's whole scope, as the approve endpoint asks). "Mine" is work the reader may decide: never their own
 * bill, instruction, expense or claim, or budget version (maker ≠ checker by principal, as the endpoints
 * refuse it). The team queue lists the same work for every decider in scope, with `mine: false` on one's own.
 * `urgencyOf` is E.13's (passed in, so this module does not import the task registry).
 */
export function payablesTaskProviders(urgencyOf: UrgencyOf): readonly PayablesTaskProvider[] {
  const who = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
  return [
    {
      kind: 'bill_approval',
      module: 'payables',
      available: (ctx) => can(ctx, 'supplier_bill.approve', 'operational') && can(ctx, 'supplier.view', READ),
      collect: (ctx, scope) => {
        const p = deciderPx(ctx);
        const r = pxOf(ctx);
        if (!p || !r) return [];
        return p.st.bills.flatMap((b): TaskItem[] => {
          if (b.state !== 'submitted' || !billVisible(p, b, BILL_APPROVE)) return [];
          const mine = b.createdBy !== who(ctx) && b.submittedBy !== who(ctx);
          if (scope === 'mine' && !mine) return [];
          const record = resolveIn(r, 'supplier_bill', b.id);
          if (!record) return [];
          return [{ id: `bill_approval:${b.id}`, kind: 'bill_approval', module: 'payables', urgency: urgencyOf(ctx.at, b.dueDate), due: b.dueDate, record, actionHref: record.href, owner: { name: b.submittedByName ?? b.createdByName, mine } }];
        });
      },
    },
    {
      kind: 'payment_approval',
      module: 'payables',
      available: (ctx) => can(ctx, 'supplier_payment.approve', 'operational') && can(ctx, 'supplier.view', READ) && can(ctx, 'bank.view', 'operational'),
      collect: (ctx, scope) => {
        const p = deciderPx(ctx);
        const r = pxOf(ctx);
        if (!p || !r) return [];
        return p.st.payments.flatMap((x): TaskItem[] => {
          // Approving an instruction also needs E.7's bank boundary over the entity (the endpoint asks the same).
          if (x.state !== 'prepared' || !paymentVisible(p, x, PAY_APPROVE) || !seesBank(p, x.legalEntityId)) return [];
          const mine = x.preparedBy !== who(ctx);
          if (scope === 'mine' && !mine) return [];
          const record = resolveIn(r, 'supplier_payment', x.id);
          if (!record) return [];
          const due = p.st.bills.find((b) => b.id === x.billId)?.dueDate;
          return [{ id: `payment_approval:${x.id}`, kind: 'payment_approval', module: 'payables', urgency: urgencyOf(ctx.at, due), ...(due ? { due } : {}), record, actionHref: record.href, owner: { name: x.preparedByName, mine } }];
        });
      },
    },
    {
      kind: 'expense_approval',
      module: 'payables',
      available: (ctx) => can(ctx, 'expense.approve', 'operational') && can(ctx, 'expense.view', READ),
      collect: (ctx, scope) => {
        const p = deciderPx(ctx);
        const r = pxOf(ctx);
        if (!p || !r) return [];
        return p.st.expenses.flatMap((e): TaskItem[] => {
          if (e.state !== 'submitted' || !expenseVisible(p, e, EXP_APPROVE)) return [];
          // Their own expense (maker or submitter) or their own claim is never theirs to decide.
          const mine = !expenseBlock(p, e);
          if (scope === 'mine' && !mine) return [];
          const record = resolveIn(r, 'expense', e.id);
          if (!record) return [];
          return [{ id: `expense_approval:${e.id}`, kind: 'expense_approval', module: 'payables', urgency: 'soon', record, actionHref: record.href, owner: { name: e.submittedByName ?? e.createdByName, mine } }];
        });
      },
    },
    {
      kind: 'budget_approval',
      module: 'payables',
      available: (ctx) => can(ctx, 'budget.approve', 'operational') && can(ctx, 'expense.view', READ),
      collect: (ctx, scope) => {
        const p = deciderPx(ctx);
        const r = pxOf(ctx);
        if (!p || !r) return [];
        return p.st.budgets.flatMap((b): TaskItem[] => {
          const v = openVersion(b.versions);
          if (!v || v.state !== 'submitted' || !budgetVisible(p, b, BUD_APPROVE)) return [];
          const mine = v.preparedBy !== who(ctx);
          if (scope === 'mine' && !mine) return [];
          const record = resolveIn(r, 'budget', b.id);
          if (!record) return [];
          return [{ id: `budget_approval:${b.id}:v${v.n}`, kind: 'budget_approval', module: 'payables', urgency: 'soon', record, actionHref: record.href, owner: { name: v.preparedByName, mine }, detail: { version: String(v.n) } }];
        });
      },
    },
  ];
}

// ---- activity (HOME-005): each record's own history, projected by the reader's scope -------------

interface PayablesActivitySource {
  group: ActivityGroup;
  available: (ctx: HandlerContext) => boolean;
  collect: (ctx: HandlerContext, from: string) => ActivityItem[];
}

/**
 * Each event is listed once, on the record it is about: a bill's own events (its payment events belong to
 * the instruction), a supplier's own events (its copies of bill events belong to the bill), an instruction's,
 * an expense's and a budget's. An entry exists only for a record the reader may open now, and carries only
 * that record's values (reference, amount, version, document name); never a note, a bank detail or anything
 * of another record.
 */
export const PAYABLES_ACTIVITY_SOURCE: PayablesActivitySource = {
  group: 'payables',
  available: (ctx) => (readsSuppliers(ctx) || readsExpenses(ctx)) && !!developerState(ctx),
  collect: (ctx, from) => {
    const p = pxOf(ctx);
    if (!p) return [];
    const me = ctx.persona?.principalId;
    const entries = (kind: Kind, id: string, events: readonly StoredEvent[], own: (e: StoredEvent) => boolean): ActivityItem[] => {
      const record = resolveIn(p, kind, id);
      if (!record) return [];
      return events.flatMap((e, i): ActivityItem[] =>
        own(e) && e.at.slice(0, 10) >= from
          ? [{ id: `pay:${id}:${i}`, at: e.at, actorName: e.byName ?? '', mine: !!me && e.by === me, group: 'payables', messageKey: `payables:history.${e.action}`, params: { ...(e.values ?? {}) }, record }]
          : [],
      );
    };
    const all = () => true;
    return [
      ...p.st.suppliers.flatMap((s) => entries('supplier', s.id, s.history, (e) => !e.billId)),
      ...p.st.bills.flatMap((b) => entries('supplier_bill', b.id, b.history, (e) => !e.action.startsWith('payment_'))),
      ...p.st.payments.flatMap((x) => entries('supplier_payment', x.id, x.history, all)),
      ...p.st.expenses.flatMap((e) => entries('expense', e.id, e.history, all)),
      ...p.st.budgets.flatMap((b) => entries('budget', b.id, b.history, all)),
    ];
  },
};
