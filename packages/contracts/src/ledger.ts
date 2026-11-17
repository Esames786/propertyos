import type { BankLine } from './collections';
import type { FiscalPeriod } from './finance';
import type { Money } from './money';

/**
 * Gate E.7 (provisional, Wave 1): the developer general ledger and the bank statement import
 * (ACC-001…010, BANK-005). Prototype contracts over fictional money only.
 *
 * Rules the mock server enforces (packages/fixtures/src/developer/ledger):
 * - every journal balances (debits = credits, whole paisa), and only posted lines reach a balance or a report;
 * - a posted journal is never edited: a correction is a reversal journal, linked both ways;
 * - approving and posting a journal are done by someone other than its maker (by principal);
 * - every record belongs to one legal entity; nothing reads, totals or posts across entities;
 * - a closed period refuses postings; trial balance, profit and loss and balance sheet come from the
 *   same posted lines and tie exactly;
 * - posting rules stay proposed until an accounting adviser decides E-15…E-17; no rule creates a journal;
 * - imported statement lines are unmatched statement lines, never receipts; only holders of the bank
 *   permission see them, the bank accounts' identifiers or anything derived from them.
 */

// ---------------------------------------------------------------------------------------------
// Legal entities, cost centres (seeded read-only: configured by administration, E-37)
// ---------------------------------------------------------------------------------------------

export interface LedgerEntityRef {
  id: string;
  name: string;
  /** Short code used in references ("LKE-JV-2026-0001"). */
  code: string;
}

export interface LedgerCostCentre {
  id: string;
  entityId: string;
  code: string;
  /** Translation key of the seeded name. */
  labelKey: string;
}

/** Every ledger read names the entity it is for and the entities the reader may switch to. */
export interface LedgerScope {
  entity: LedgerEntityRef;
  entities: LedgerEntityRef[];
  /** The demo's business date. */
  today: string;
}

export interface LedgerEvent {
  at: string;
  by: string;
  byName: string;
  action: string;
  note?: string;
  values?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Chart of accounts (ACC-001, ACC-002; decision E-16)
// ---------------------------------------------------------------------------------------------

export const GL_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type GlAccountType = (typeof GL_ACCOUNT_TYPES)[number];
export type GlNormalSide = 'debit' | 'credit';
export const normalSideOf = (type: GlAccountType): GlNormalSide => (type === 'asset' || type === 'expense' ? 'debit' : 'credit');

export const GL_ACCOUNT_STATES = ['active', 'draft', 'rejected'] as const;
export type GlAccountState = (typeof GL_ACCOUNT_STATES)[number];

/**
 * Why an account takes no manual journal line:
 * - `cash_evidence`: cash at bank changes only from confirmed payments or settlement confirmations
 *   (E-17); none exists in this gate, so these accounts stay at what was posted.
 * - `revenue_policy`: no revenue is recognised until the revenue recognition policy is set (E-15).
 */
export type GlAccountLock = 'cash_evidence' | 'revenue_policy';

/** The bank account behind a cash-at-bank ledger account: only for readers with the bank permission. */
export interface LedgerBankAccountRef {
  id: string;
  name: string;
  bankName: string;
  /** "•••• 7890": never the full account number. */
  ibanMasked: string;
  verified: boolean;
}

export interface GlAccountView {
  id: string;
  entityId: string;
  code: string;
  /** Seeded accounts carry a translation key; drafted accounts their name as entered. */
  labelKey?: string;
  name: string;
  type: GlAccountType;
  normal: GlNormalSide;
  state: GlAccountState;
  lock?: GlAccountLock;
  /** Debit-positive balance of posted lines (credit balances are negative). */
  balance: Money;
  /** The same on the account's normal side ("150,000,000.00 credit" reads 150,000,000.00). */
  normalBalance: Money;
  postedLines: number;
  /** Lines of journals not posted yet (never in the balance). */
  pendingLines: number;
  /** Chart version that added it (active accounts). */
  sinceVersion?: number;
  bank?: LedgerBankAccountRef;
  draftedByName?: string;
  approvedByName?: string;
  rejectedByName?: string;
  rejectReason?: string;
  actions: { approve: boolean; reject: boolean };
  /** Why the reader cannot decide a draft (when they could otherwise). */
  blocked?: 'own_draft';
}

export interface ChartVersionView {
  version: number;
  at: string;
  byName: string;
  approvedByName?: string;
  /** What changed: 'seeded' or the account added. */
  change: 'seeded' | 'account_added';
  accountCode?: string;
}

export interface ChartView extends LedgerScope {
  chartVersion: number;
  versions: ChartVersionView[];
  accounts: GlAccountView[];
  canDraft: boolean;
}

export interface GlAccountInput {
  entityId: string;
  code: string;
  name: string;
  type: GlAccountType;
}

export interface GlAccountLineView {
  journalId: string;
  journalRef: string;
  date: string;
  memo: string;
  lineMemo?: string;
  debit: Money;
  credit: Money;
  /** Running debit-positive balance after the line. */
  running: Money;
  kind: JournalKind;
}

export interface GlAccountWorkspace extends LedgerScope {
  account: GlAccountView;
  lines: GlAccountLineView[];
  pending: Array<{ journalId: string; journalRef: string; date: string; state: JournalState; debit: Money; credit: Money }>;
  history: LedgerEvent[];
  /** Bank readers only: unmatched statement lines of the linked bank account (never a balance). */
  statementLines?: { count: number; credits: Money; debits: Money };
}

// ---------------------------------------------------------------------------------------------
// Journals (ACC-003, ACC-004, ACC-005)
// ---------------------------------------------------------------------------------------------

export const JOURNAL_STATES = ['draft', 'submitted', 'approved', 'posted', 'rejected', 'cancelled'] as const;
export type JournalState = (typeof JOURNAL_STATES)[number];
export type JournalKind = 'manual' | 'reversal';

export const JOURNAL_FILTERS = ['all', 'draft', 'awaiting', 'approved', 'posted', 'reversed', 'closed'] as const;
export type JournalFilter = (typeof JOURNAL_FILTERS)[number];

export interface JournalLineView {
  n: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountLabelKey?: string;
  debit: Money;
  credit: Money;
  memo?: string;
  costCentreId?: string;
  costCentreLabelKey?: string;
}

export interface JournalLink {
  id: string;
  ref: string;
  state: JournalState;
}

export interface JournalSummary {
  id: string;
  ref: string;
  entityId: string;
  date: string;
  period: string;
  memo: string;
  kind: JournalKind;
  state: JournalState;
  /** A posted journal whose reversal is posted. */
  reversed: boolean;
  /** The reversal of this journal (pending or posted). */
  reversal?: JournalLink;
  /** The journal this one reverses. */
  reversalOf?: JournalLink;
  total: Money;
  makerName: string;
  /** Seeded demo journal (fictional, entered through the same journal path). */
  demo: boolean;
}

export type JournalBlock = 'own_journal' | 'period_closed' | 'permission_missing' | 'already_reversed' | 'reversal_not_reversible';

export interface JournalView extends JournalSummary, LedgerScope {
  lines: JournalLineView[];
  totals: { debit: Money; credit: Money };
  balanced: boolean;
  periodState: FiscalPeriod['state'];
  submittedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
  postedByName?: string;
  postedAt?: string;
  rejectedByName?: string;
  rejectReason?: string;
  reverseReason?: string;
  history: LedgerEvent[];
  actions: { edit: boolean; submit: boolean; cancel: boolean; approve: boolean; reject: boolean; post: boolean; reverse: boolean };
  /** Why the main next step is not offered to this reader. */
  blocked?: JournalBlock;
}

export interface JournalsList extends LedgerScope {
  items: JournalSummary[];
  counts: Record<JournalFilter, number>;
  canCreate: boolean;
}

export interface JournalLineInput {
  accountId: string;
  debit?: string;
  credit?: string;
  memo?: string;
  costCentreId?: string;
}

export interface JournalInput {
  entityId: string;
  date: string;
  memo: string;
  lines: JournalLineInput[];
  /** Submit for approval straight away (otherwise saved as a draft). */
  submit?: boolean;
}

export interface JournalReverseInput {
  date: string;
  reason: string;
}

/** What the journal form may use: the entity's active accounts (locked ones marked), cost centres, open periods. */
export interface JournalFormOptions extends LedgerScope {
  accounts: Array<Pick<GlAccountView, 'id' | 'code' | 'name' | 'labelKey' | 'type' | 'lock'>>;
  costCentres: LedgerCostCentre[];
  openPeriods: string[];
  policy: JournalPolicy;
}

/** Versioned maker-checker policy for manual journals (no thresholds: D-29, no default amounts). */
export interface JournalPolicy {
  version: number;
  effectiveFrom: string;
  approval: 'always';
  approverNotMaker: true;
  posterNotMaker: true;
}

// ---------------------------------------------------------------------------------------------
// Reports (ACC-006, ACC-007, ACC-008): derived from posted lines only
// ---------------------------------------------------------------------------------------------

export interface LedgerReportRow {
  accountId: string;
  code: string;
  name: string;
  labelKey?: string;
  type: GlAccountType;
}

export interface TrialBalanceRow extends LedgerReportRow {
  debit: Money;
  credit: Money;
}

export interface TrialBalance extends LedgerScope {
  period: string;
  asOf: string;
  periods: string[];
  rows: TrialBalanceRow[];
  totals: { debit: Money; credit: Money };
  balanced: boolean;
  postedJournals: number;
}

export interface StatementSection {
  rows: Array<LedgerReportRow & { amount: Money }>;
  total: Money;
}

export interface ProfitAndLoss extends LedgerScope {
  from: string;
  to: string;
  period: string;
  periods: string[];
  income: StatementSection;
  expenses: StatementSection;
  /** Income − expenses for the range. */
  result: Money;
  /** E-15: management view; no revenue recognition policy is set. */
  revenuePolicy: 'not_set';
}

export interface BalanceSheet extends LedgerScope {
  asOf: string;
  period: string;
  periods: string[];
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Income − expenses posted up to the date (not closed to retained earnings). */
  currentResult: Money;
  liabilitiesEquityResult: Money;
  /** Assets = liabilities + equity + current result. */
  balances: boolean;
  /** The current result equals the profit and loss for the same fiscal year to date. */
  resultMatchesProfitAndLoss: boolean;
  trialBalanceBalanced: boolean;
}

// ---------------------------------------------------------------------------------------------
// Accounting periods (ACC-009): one FiscalPeriod (the S.1 type) per legal entity and month
// ---------------------------------------------------------------------------------------------

export type LedgerPeriodCheckKey = 'period_ended' | 'journals_unposted';

export interface LedgerPeriodView extends FiscalPeriod {
  postedJournals: number;
  checks: Array<{ key: LedgerPeriodCheckKey; outcome: 'passed' | 'blocking'; count: number }>;
  reopenRequest?: { byName: string; at: string; reason: string };
  actions: { close: boolean; requestReopen: boolean; approveReopen: boolean; rejectReopen: boolean };
  blocked?: 'own_request' | 'blocking_checks';
}

export interface LedgerPeriodsView extends LedgerScope {
  periods: LedgerPeriodView[];
  policy: JournalPolicy;
}

// ---------------------------------------------------------------------------------------------
// Posting rules (ACC-010; decisions E-15, E-16, E-17): proposed, never applied
// ---------------------------------------------------------------------------------------------

export const POSTING_EVENTS = ['instalment_invoiced', 'buyer_payment_confirmed', 'supplier_bill_approved', 'supplier_payment_settled', 'payroll_approved'] as const;
export type PostingEvent = (typeof POSTING_EVENTS)[number];

/** Decisions an accounting adviser must take before a rule may post anything. */
export const POSTING_DECISIONS = ['E-15', 'E-16', 'E-17', 'E-18', 'E-33'] as const;
export type PostingDecision = (typeof POSTING_DECISIONS)[number];

export interface PostingRuleVersionView {
  n: number;
  effectiveFrom: string;
  debit: { id: string; code: string; name: string; labelKey?: string };
  credit: { id: string; code: string; name: string; labelKey?: string };
  state: 'proposed';
  draftedByName: string;
  draftedAt: string;
  note?: string;
}

export interface PostingRuleView {
  id: string;
  ref: string;
  entityId: string;
  event: PostingEvent;
  /** The slice whose records would raise the event (none exists in Wave 1). */
  sourceSlice: 'E.6' | 'E.8' | 'E.14';
  blockedBy: PostingDecision[];
  versions: PostingRuleVersionView[];
  /** The version that would apply on the demo date (by effective date), if any. */
  versionToday?: number;
  history: LedgerEvent[];
  actions: { draftVersion: boolean };
}

export interface PostingRulesView extends LedgerScope {
  rules: PostingRuleView[];
  /** Source events waiting to be proposed as journals: none, no source slice exists yet. */
  proposedEvents: number;
  canDraft: boolean;
}

export interface PostingRuleVersionInput {
  effectiveFrom: string;
  debitAccountId: string;
  creditAccountId: string;
  note?: string;
}

export interface PostingRulePreview {
  ruleId: string;
  version: number;
  amount: Money;
  lines: JournalLineView[];
  balanced: boolean;
}

// ---------------------------------------------------------------------------------------------
// Bank statement import (BANK-005): preview, validation, duplicates, approval
// ---------------------------------------------------------------------------------------------

export const BANK_IMPORT_STATES = ['preview', 'awaiting_approval', 'committed', 'rejected', 'discarded'] as const;
export type BankImportState = (typeof BANK_IMPORT_STATES)[number];

export const BANK_IMPORT_ROW_STATUSES = ['new', 'duplicate_in_file', 'duplicate_prior', 'invalid'] as const;
export type BankImportRowStatus = (typeof BANK_IMPORT_ROW_STATUSES)[number];

export type BankImportRowProblem = 'txn_missing' | 'date_invalid' | 'date_future' | 'amount_invalid' | 'columns';

export interface BankImportRow {
  n: number;
  bankTxnId: string;
  valueDate: string;
  amount: Money;
  direction: 'credit' | 'debit';
  narration: string;
  reference: string;
  counterparty: string;
  status: BankImportRowStatus;
  problems: BankImportRowProblem[];
}

export interface BankImportCounts {
  rows: number;
  new: number;
  duplicateInFile: number;
  duplicatePrior: number;
  invalid: number;
}

export interface BankImportSummary {
  id: string;
  ref: string;
  entityId: string;
  account: LedgerBankAccountRef;
  fileName: string;
  sample: boolean;
  state: BankImportState;
  counts: BankImportCounts;
  credits: Money;
  debits: Money;
  preparedByName: string;
  preparedAt: string;
  approvedByName?: string;
  committedLines?: number;
}

export type BankImportBlock = 'own_import' | 'permission_missing';

export interface BankImportView extends BankImportSummary, LedgerScope {
  rows: BankImportRow[];
  rejectReason?: string;
  rejectedByName?: string;
  history: LedgerEvent[];
  actions: { submit: boolean; approve: boolean; reject: boolean; discard: boolean };
  blocked?: BankImportBlock;
}

export type LedgerStatementLine = Pick<BankLine, 'id' | 'bankTxnId' | 'valueDate' | 'amount' | 'narration' | 'reference' | 'counterpartyName' | 'state'> & {
  direction: 'credit' | 'debit';
  importRef: string;
  accountId: string;
};

export interface BankImportSample {
  n: number;
  accountId: string;
  fileName: string;
  /** Translation key of the sample's label ("Sample: …"). */
  labelKey: string;
  content: string;
}

export interface BankImportsView extends LedgerScope {
  accounts: LedgerBankAccountRef[];
  imports: BankImportSummary[];
  lines: LedgerStatementLine[];
  samples: BankImportSample[];
  canImport: boolean;
  canApprove: boolean;
}

export interface BankImportInput {
  entityId: string;
  accountId: string;
  /** A labelled sample file (1-based), or the file's own name and text. */
  sample?: number;
  fileName?: string;
  content?: string;
}
