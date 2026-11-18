import type { FinanceAccountKind } from './finance';
import type { Money } from './money';

/**
 * Gate E.8 (Wave 2): suppliers, payables and expenses for developer organisations (plan §6 E.8,
 * SUP-001…008 and EXP-001…009). Everything here is fictional demo data.
 *
 * Money truth (plan §4.6, D-48, owner directive for Wave 2):
 * - **Approval, posting and settlement are three separate states** (V2.1 01 §9). An approved bill or
 *   expense is an obligation, never "paid".
 * - **Posting** to the general ledger waits on E.7's posting rules (owner decision E-17): every record
 *   reads "Planned (E.7 posting rules, E-17)", and nothing is posted.
 * - **Settlement** needs a matched debit line of the paying verified account (owner decision E-18, to
 *   reuse S.3's payout settlement): until then a payment is an instruction only, "Not settled — no
 *   evidence", and no supplier balance goes down.
 * - **Approvals** happen only through a real, in-session maker-checker action by a second person. The
 *   seed holds drafts and submitted records backed by fictional demo documents, never approvals.
 * - **Budget vs actual**: actual = posted only (none can be posted yet); approved-but-unposted
 *   obligations are shown apart and never counted as actual; commitments (open purchase orders) come
 *   with E.9.
 */

/** Spending categories shared by bill lines, expenses and budget lines (illustrative, E-37: set by administration). */
export const SPEND_CATEGORIES = ['materials', 'contractors', 'professional_fees', 'utilities', 'site_running', 'travel', 'office', 'marketing', 'other'] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const SUPPLIER_CATEGORIES = ['materials', 'contractor', 'services', 'utilities', 'professional'] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export const UTILITY_SERVICES = ['electricity', 'water', 'gas', 'telecom'] as const;
export type UtilityService = (typeof UTILITY_SERVICES)[number];

export const BILL_KINDS = ['standard', 'utility'] as const;
export type BillKind = (typeof BILL_KINDS)[number];

/** Approval state of a supplier bill. Posting and settlement are separate fields. */
export const BILL_STATES = ['draft', 'submitted', 'approved', 'rejected', 'cancelled'] as const;
export type BillState = (typeof BILL_STATES)[number];
/** `in_progress` (Wave 2 integration): drafts and bills awaiting approval, the ones still being worked on. */
export const BILL_IN_PROGRESS: readonly BillState[] = ['draft', 'submitted'];
export const BILL_FILTERS = ['all', 'in_progress', ...BILL_STATES] as const;
export type BillFilter = (typeof BILL_FILTERS)[number];

/** A supplier payment is an instruction: prepared → approved → sent (simulated); settlement is never set here (E-18). */
export const PAYMENT_STATES = ['prepared', 'approved', 'sent_simulated', 'cancelled'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];
export const PAYMENT_FILTERS = ['all', ...PAYMENT_STATES] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

/** Posting (E-17) and settlement (E-18) are not available in this wave: the only values the API returns. */
export type PostingState = 'planned';
export type SettlementState = 'not_settled';

export const EXPENSE_KINDS = ['business', 'claim'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];
export const EXPENSE_STATES = ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'] as const;
export type ExpenseState = (typeof EXPENSE_STATES)[number];
export const EXPENSE_FILTERS = ['all', ...EXPENSE_STATES] as const;
export type ExpenseFilter = (typeof EXPENSE_FILTERS)[number];
/** How a business expense is to be paid: an obligation to the payee, or out of a petty-cash float. Claims are reimbursed to the employee. */
export const PAID_VIA = ['payable', 'petty_cash'] as const;
export type PaidVia = (typeof PAID_VIA)[number];

export const COUNT_STATES = ['awaiting_witness', 'witnessed', 'disputed'] as const;
export type CountState = (typeof COUNT_STATES)[number];
export const TOPUP_STATES = ['prepared', 'approved', 'cancelled'] as const;
export type TopUpState = (typeof TOPUP_STATES)[number];
/** Notes counted in a petty-cash count (the S.1 BANK-008 denominations). */
export const CASH_NOTES = ['5000', '1000', '500', '100', '50', '20', '10'] as const;

export const BUDGET_VERSION_STATES = ['draft', 'submitted', 'approved', 'rejected', 'superseded', 'withdrawn'] as const;
export type BudgetVersionState = (typeof BUDGET_VERSION_STATES)[number];
/** Fiscal years of the demo (July–June). */
export const FISCAL_YEARS = ['FY2026-27', 'FY2027-28'] as const;
export type FiscalYear = (typeof FISCAL_YEARS)[number];

/** A document attached as evidence. Demo only: the name and size of the chosen file, or the labelled sample. */
export interface PayablesEvidence {
  name: string;
  kind: 'invoice' | 'receipt' | 'count_sheet' | 'other';
  size: number;
  /** Seeded or sample documents are fictional and labelled so. */
  sample: boolean;
}

/** One entry of a record's history (who, when, what). Values are display text (amounts as "1234.00"). */
export interface PayablesEvent {
  at: string;
  by?: string;
  byName?: string;
  action: string;
  values?: Record<string, string>;
  note?: string;
}

export interface PayEntityRef {
  id: string;
  name: string;
  code: string;
}

export interface CostCentreRef {
  id: string;
  code: string;
  name: string;
  kind: 'head_office' | 'project' | 'sales' | 'construction';
  projectId?: string;
}

/** Which entity a list is for, and the others the reader may choose (E-37: configured by administration). */
export interface PayScope {
  entity: PayEntityRef;
  entities: PayEntityRef[];
  /** The reader sees part of the entity only (some cost centres): entity-wide totals are withheld. */
  scopeLimited: boolean;
}

/** A supplier's payee account, masked (last four digits only) and returned only to holders of `bank.view`. */
export interface SupplierBankView {
  bankName: string;
  title: string;
  last4: string;
  /** Fictional demo account: "verified" means recorded by administration in the demo, never a real check. */
  sample: true;
}

export interface SupplierSummary {
  id: string;
  ref: string;
  name: string;
  category: SupplierCategory;
  legalEntityId: string;
  projectNames: string[];
  /**
   * Bills of this supplier the reader may see that are still in progress: drafts and bills awaiting approval
   * (`BILL_IN_PROGRESS`). Wave 2 integration: was `openBills`, a misleading name (an approved bill is still
   * owed, yet it was not counted).
   */
  inProgressBills: number;
  /** Of those, the ones awaiting approval. */
  awaitingApproval: number;
  /** Approved obligation (approved bills; nothing is settled): only for whole-entity readers. */
  approvedObligation?: Money;
  demo: boolean;
}

export interface SuppliersList {
  scope: PayScope;
  items: SupplierSummary[];
  counts: Record<'all' | SupplierCategory, number>;
  canCreate: boolean;
  /** The entity's projects a new supplier may serve (names only). */
  projects: Array<{ id: string; name: string }>;
}

export interface SupplierInput {
  legalEntityId: string;
  name: string;
  category: SupplierCategory;
  taxRef?: string;
  contactName: string;
  phone: string;
  email?: string;
  projectIds: string[];
}

export interface BillSummary {
  id: string;
  ref: string;
  kind: BillKind;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  total: Money;
  state: BillState;
  posting: PostingState;
  settlement: SettlementState;
  /** Instructions live on this bill (prepared, approved or sent): never a payment. */
  instructed: Money;
  costCentres: string[];
  utility?: UtilityDetails;
  demo: boolean;
}

export interface UtilityDetails {
  service: UtilityService;
  /** The utility's consumer or account number (fictional). */
  consumerNo: string;
  periodFrom: string;
  periodTo: string;
}

export interface BillLineView {
  id: string;
  description: string;
  category: SpendCategory;
  costCentre: CostCentreRef;
  projectName?: string;
  amount: Money;
}

export interface PaymentSummary {
  id: string;
  ref: string;
  billId: string;
  billRef: string;
  supplierId: string;
  supplierName: string;
  amount: Money;
  state: PaymentState;
  settlement: SettlementState;
  preparedByName: string;
  preparedAt: string;
}

/**
 * Wave 2 integration (owner money rule, GPT's E.8 review): the four money states of a payable, never merged
 * into one figure. Approved is an obligation (not paid). Posted needs E.7's posting rules (planned, E-17), so it
 * is 0.00 today. Instructed is what live payment instructions ask for (not a transfer). Settled needs matched
 * bank evidence (E-18), so it is 0.00 today.
 */
export interface MoneyStates {
  approved: Money;
  posted: Money;
  instructed: Money;
  settled: Money;
}

/**
 * The bill's ACTUAL balance beside a clearly labelled SIMULATION, in the payment instruction drawer. The
 * simulation is arithmetic only: no instruction lowers what is owed, and nothing simulated is a balance, a
 * payment or a settlement.
 */
export interface PaymentBalance {
  /** ACTUAL: owed on the bill now (supplier-ledger rule: approved − credit notes − settled). */
  actualOwed: Money;
  /** The bill's money states, side by side. */
  states: MoneyStates;
  /** SIMULATION only: what would remain owed if this instruction were later settled in full. Absent once cancelled. */
  simulatedAfterThis?: Money;
  /** The actual balance, derived again through the supplier-ledger rule, agrees with `actualOwed` (and the simulation left it unchanged). */
  ledgerCheck: 'matches' | 'differs';
}

export interface BillView extends BillSummary {
  legalEntity: PayEntityRef;
  lines: BillLineView[];
  evidence?: PayablesEvidence;
  createdByName: string;
  createdAt: string;
  submittedByName?: string;
  submittedAt?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  payments: PaymentSummary[];
  /** What may still be instructed: approved total − live instructions (never reduced by a settlement here). */
  instructable: Money;
  /** Wave 2 integration: approved, posted, instructed and settled, apart. */
  money: MoneyStates;
  history: PayablesEvent[];
  actions: { submit: boolean; approve: boolean; reject: boolean; cancel: boolean; instruct: boolean; attach: boolean };
  /** Why the reader cannot decide (shown in words, never a silent missing button). */
  blocked?: 'own_bill' | 'not_submitted' | 'no_permission';
}

export interface BillsList {
  scope: PayScope;
  items: BillSummary[];
  counts: Record<BillFilter, number>;
  canCreate: boolean;
}

export interface BillLineInput {
  description: string;
  category: SpendCategory;
  costCentreId: string;
  amount: string;
}

export interface BillInput {
  legalEntityId: string;
  supplierId: string;
  kind: BillKind;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  utility?: UtilityDetails;
  lines: BillLineInput[];
  evidence?: PayablesEvidence;
}

export interface SupplierOption {
  id: string;
  name: string;
  category: SupplierCategory;
  legalEntityId: string;
}

export interface BillOptions {
  scope: PayScope;
  suppliers: SupplierOption[];
  costCentres: CostCentreRef[];
  today: string;
  canCreate: boolean;
}

export interface PaymentView extends PaymentSummary {
  legalEntity: PayEntityRef;
  billTotal: Money;
  note?: string;
  /** Masked payee and paying accounts, only for holders of `bank.view`. */
  payee?: SupplierBankView;
  payFrom?: { title: string; maskedNumber: string; sample: true };
  bankHidden: boolean;
  /** Wave 2 integration: the bill's actual balance and the instruction's simulation, kept apart. */
  balance: PaymentBalance;
  approvedByName?: string;
  approvedAt?: string;
  sentByName?: string;
  sentAt?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: PayablesEvent[];
  actions: { approve: boolean; send: boolean; cancel: boolean };
  blocked?: 'own_instruction' | 'no_permission';
}

export interface PaymentsList {
  scope: PayScope;
  items: PaymentSummary[];
  counts: Record<PaymentFilter, number>;
}

export interface Supplier360 {
  supplier: SupplierSummary & { taxRef?: string; contactName: string; phone: string; email?: string; createdByName: string; createdAt: string };
  legalEntity: PayEntityRef;
  /** Masked payee account for `bank.view` holders; `bankHidden` says why it is missing otherwise. */
  bank?: SupplierBankView;
  bankHidden: boolean;
  bankOnFile: boolean | null;
  /** Entity-wide totals: only for whole-entity readers (withheld, never recalculated, for others). */
  totals?: { approvedObligation: Money; awaitingApproval: Money; instructed: Money; settled: Money; /** Wave 2 integration: 0.00 until E.7's posting rules (E-17). */ posted: Money };
  bills: BillSummary[];
  payments: PaymentSummary[];
  projects: Array<{ id: string; name: string }>;
  documents: Array<{ billId: string; billRef: string; evidence: PayablesEvidence }>;
  activity: PayablesEvent[];
  scopeLimited: boolean;
  canCreateBill: boolean;
}

export interface LedgerRow {
  date: string;
  kind: 'bill' | 'credit_note' | 'settled_payment';
  ref: string;
  billId?: string;
  description: string;
  /** Increases what is owed (an approved bill). */
  obligation?: Money;
  /** Reduces it (credit notes and settled payments; none exist in this wave). */
  reduction?: Money;
  balance: Money;
}

export interface SupplierLedgerView {
  supplier: { id: string; ref: string; name: string };
  legalEntity: PayEntityRef;
  /** Empty for a partial reader: the ledger is an entity-wide statement, withheld rather than recalculated. */
  rows: LedgerRow[];
  /** Approved bills − credit notes − settled payments (only approved bills exist; nothing is settled). Whole readers only. */
  balance?: Money;
  /** Shown apart, never part of the balance. */
  awaitingApproval: BillSummary[];
  instructions: PaymentSummary[];
  posting: PostingState;
  scopeLimited: boolean;
}

export interface UtilityRegister {
  scope: PayScope;
  items: BillSummary[];
  byService: Record<UtilityService, { count: number; awaitingApproval: number }>;
  canCreate: boolean;
}

export interface ExpenseSummary {
  id: string;
  ref: string;
  kind: ExpenseKind;
  legalEntityId: string;
  costCentre: CostCentreRef;
  category: SpendCategory;
  description: string;
  amount: Money;
  incurredOn: string;
  payee: string;
  paidVia?: PaidVia;
  floatName?: string;
  claimant?: { id: string; name: string };
  state: ExpenseState;
  posting: PostingState;
  settlement: SettlementState;
  createdByName: string;
  demo: boolean;
}

export interface ExpenseView extends ExpenseSummary {
  legalEntity: PayEntityRef;
  floatId?: string;
  evidence?: PayablesEvidence;
  createdAt: string;
  submittedByName?: string;
  submittedAt?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  history: PayablesEvent[];
  actions: { submit: boolean; withdraw: boolean; approve: boolean; reject: boolean; attach: boolean };
  blocked?: 'own_expense' | 'own_claim' | 'not_submitted' | 'no_permission';
  /** Wave 2 integration: the fiscal year the expense counts in, and that year's budget of its cost centre when the reader may open it. */
  fiscalYear: FiscalYear;
  budget?: { id: string; ref: string };
}

export interface ExpensesList {
  scope: PayScope;
  items: ExpenseSummary[];
  counts: Record<ExpenseFilter, number>;
  costCentres: CostCentreRef[];
  canCreate: boolean;
}

export interface ExpenseInput {
  kind: ExpenseKind;
  legalEntityId: string;
  costCentreId: string;
  category: SpendCategory;
  description: string;
  amount: string;
  incurredOn: string;
  payee: string;
  paidVia?: PaidVia;
  floatId?: string;
  claimantId?: string;
  evidence?: PayablesEvidence;
}

export interface ClaimantOption {
  id: string;
  name: string;
  roleKey: string;
}

export interface ExpenseOptions {
  scope: PayScope;
  costCentres: CostCentreRef[];
  floats: Array<{ id: string; name: string; costCentreId: string }>;
  claimants: ClaimantOption[];
  today: string;
  canCreate: boolean;
}

export interface ApprovalItem {
  id: string;
  ref: string;
  kind: ExpenseKind;
  description: string;
  amount: Money;
  costCentre: CostCentreRef;
  claimantName?: string;
  submittedByName: string;
  submittedAt: string;
  /** Why the reader cannot decide this one (still listed so the queue is complete). */
  blocked?: 'own_expense' | 'own_claim' | 'no_permission';
}

export interface ExpenseApprovals {
  scope: PayScope;
  toDecide: ApprovalItem[];
  waiting: ApprovalItem[];
  recent: Array<ApprovalItem & { state: ExpenseState; decidedByName: string; decidedAt: string }>;
  canDecide: boolean;
}

export interface CashCountView {
  id: string;
  countedOn: string;
  amount: Money;
  notes: Record<string, number>;
  countedByName: string;
  state: CountState;
  witnessedByName?: string;
  witnessedAt?: string;
  note?: string;
  evidence?: PayablesEvidence;
  canWitness: boolean;
  blocked?: 'own_count' | 'no_permission';
}

export interface TopUpView {
  id: string;
  ref: string;
  amount: Money;
  reason: string;
  state: TopUpState;
  settlement: SettlementState;
  requestedByName: string;
  requestedAt: string;
  approvedByName?: string;
  approvedAt?: string;
  cancelledByName?: string;
  canApprove: boolean;
  canCancel: boolean;
  blocked?: 'own_request' | 'no_permission';
}

export interface PettyCashFloatView {
  id: string;
  name: string;
  kind: Extract<FinanceAccountKind, 'petty_cash'>;
  legalEntityId: string;
  costCentre: CostCentreRef;
  custodianName: string;
  /** The authorised float (illustrative, configured by administration; E-37). */
  imprest: Money;
  /** The last count a second person witnessed: the only evidence of cash on hand. */
  lastWitnessed?: CashCountView;
  counts: CashCountView[];
  topUps: TopUpView[];
  /** Expenses paid from this float (any state), so the custodian sees what to account for. */
  expenses: ExpenseSummary[];
  history: PayablesEvent[];
  canCount: boolean;
  canRequestTopUp: boolean;
}

export interface PettyCashList {
  scope: PayScope;
  floats: PettyCashFloatView[];
}

export interface BudgetLineView {
  category: SpendCategory;
  amount: Money;
}

export interface BudgetVersionView {
  n: number;
  state: BudgetVersionState;
  lines: BudgetLineView[];
  total: Money;
  reason: string;
  preparedByName: string;
  preparedAt: string;
  submittedAt?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface BudgetSummary {
  id: string;
  ref: string;
  legalEntityId: string;
  costCentre: CostCentreRef;
  year: FiscalYear;
  approved?: { n: number; total: Money };
  open?: { n: number; state: BudgetVersionState; total: Money };
  demo: boolean;
}

export interface BudgetView extends BudgetSummary {
  legalEntity: PayEntityRef;
  versions: BudgetVersionView[];
  history: PayablesEvent[];
  actions: { newVersion: boolean; submit: boolean; withdraw: boolean; approve: boolean; reject: boolean };
  blocked?: 'own_version' | 'no_permission';
}

export interface BudgetsList {
  scope: PayScope;
  items: BudgetSummary[];
  costCentres: CostCentreRef[];
  canCreate: boolean;
}

export interface BudgetInput {
  legalEntityId: string;
  costCentreId: string;
  year: FiscalYear;
  reason: string;
  lines: Array<{ category: SpendCategory; amount: string }>;
}

export interface BvaRow {
  category: SpendCategory;
  budget: Money;
  /** Posted actuals only. Nothing can be posted in this wave (E-17), so this is always 0.00 with `postingPlanned`. */
  actualPosted: Money;
  /** Approved bills and expenses not posted: shown apart, never counted as actual. */
  approvedNotPosted: Money;
  /** Budget − posted actual. */
  remaining: Money;
}

export interface BvaBudget {
  budgetId: string;
  budgetRef: string;
  costCentre: CostCentreRef;
  year: FiscalYear;
  version: number;
  /** Approved supplier bills count in `approvedNotPosted` only for readers who may see bills (`supplier.view`). */
  billsIncluded: boolean;
  rows: BvaRow[];
  totals: { budget: Money; actualPosted: Money; approvedNotPosted: Money; remaining: Money };
}

export interface BudgetVsActual {
  scope: PayScope;
  year: FiscalYear;
  budgets: BvaBudget[];
  /** Cost centres the reader sees with no approved budget version for the year. */
  withoutApproved: Array<{ costCentre: CostCentreRef; budgetId?: string; openState?: BudgetVersionState }>;
  /** Entity totals across every cost centre: whole-entity readers only. */
  entityTotals?: { budget: Money; actualPosted: Money; approvedNotPosted: Money; remaining: Money };
  postingPlanned: true;
  /** Commitments from open purchase orders arrive with E.9 (procurement). */
  commitments: 'planned';
}
