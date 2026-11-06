import type { EmploymentType, HrDepartment, HrRole } from './hr';
import type { Money } from './money';

/**
 * Gate S.2b society payroll (PAY-001…007): an optional `payroll` add-on that needs `hr`. It builds
 * on the S.2a employees, their dated site allocations and legal entities, their leave, attendance
 * and approved advances. Fictional pay terms are seeded for Al-Noor Residency (Demo) only.
 *
 * Three things never mix (V3.2, D-48):
 * - **A run is an obligation.** Preparing it calculates what is owed; approving it (finalising)
 *   freezes an approved obligation. Neither pays anyone.
 * - **A disbursement is an instruction.** Preparing, approving or marking it "sent (simulated)" moves
 *   no money and changes no liability.
 * - **A settlement is evidenced movement of funds.** No settlement route exists in this gate: an
 *   outgoing payroll payment cannot yet be bound to a verified account, a statement line and a
 *   single use (dependency recorded in docs/status/gate-s2b). Every line stays `not_settled`.
 *
 * No statutory rule is assumed. Income tax, EOBI and social security are placeholders that are never
 * calculated; overtime, unpaid leave and absence deductions need a policy nobody has adopted, so they
 * are never deducted (unpaid leave holds the line). Money is a decimal string with its currency.
 */

export const PAY_PERIOD_STATES = ['draft', 'open', 'closed'] as const;
export type PayPeriodState = (typeof PAY_PERIOD_STATES)[number];

/** draft → submitted → approved (finalised, frozen) → reversed. A returned or withdrawn run is a draft again. */
export const PAY_RUN_STATES = ['draft', 'submitted', 'approved', 'reversed'] as const;
export type PayRunState = (typeof PAY_RUN_STATES)[number];

export const PAY_BASES = ['monthly', 'daily'] as const;
export type PayBasis = (typeof PAY_BASES)[number];

export const PAY_METHODS = ['bank', 'cash'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/** Fixed monthly allowances of the fictional pay terms. */
export const PAY_ALLOWANCES = ['conveyance', 'mobile'] as const;
export type PayAllowance = (typeof PAY_ALLOWANCES)[number];

/** What stops a line from being submitted (resolve it, or exclude the person from the run). */
export const PAY_LINE_BLOCKERS = ['missing_pay', 'days_unconfirmed', 'unpaid_leave_policy', 'suspended_policy'] as const;
export type PayLineBlocker = (typeof PAY_LINE_BLOCKERS)[number];

/** What the approver should know about a line (nothing here changes the amount). */
export const PAY_LINE_WARNINGS = ['partial_month', 'advance_held', 'absences', 'bank_unverified', 'leave_pending'] as const;
export type PayLineWarning = (typeof PAY_LINE_WARNINGS)[number];

/** What stops the whole run from being submitted or approved. */
export const PAY_RUN_BLOCKERS = ['stale', 'no_lines', 'line_blockers', 'period_not_open'] as const;
export type PayRunBlocker = (typeof PAY_RUN_BLOCKERS)[number];

/** Policies payroll would need. `demo_rule` is a fictional placeholder rule; `not_configured` is never applied. */
export const PAY_POLICY_KEYS = ['proration', 'statutory', 'overtime', 'unpaid_leave', 'absences', 'advance_recovery'] as const;
export type PayPolicyKey = (typeof PAY_POLICY_KEYS)[number];
export type PayPolicyState = 'demo_rule' | 'not_configured';

/** Statutory deductions: placeholders only, never calculated. */
export const PAY_STATUTORY = ['income_tax', 'eobi', 'social_security'] as const;
export type PayStatutory = (typeof PAY_STATUTORY)[number];

export const PAY_INSTRUCTION_STATES = ['prepared', 'approved', 'sent_simulated', 'cancelled'] as const;
export type PayInstructionState = (typeof PAY_INSTRUCTION_STATES)[number];

/** The only settlement status in this gate: nothing can be verified as paid. */
export type PaySettlement = 'not_settled';

/** Why nothing can be posted to a ledger or cashbook (PAY-007). */
export const PAY_POSTING_GAPS = ['no_ledger', 'no_category', 'no_settlement'] as const;
export type PayPostingGap = (typeof PAY_POSTING_GAPS)[number];

/** Proposed accounts of the payroll journal (illustrative names; no approved chart exists). */
export const PAY_ACCOUNTS = ['salaries_expense', 'salaries_payable'] as const;
export type PayAccount = (typeof PAY_ACCOUNTS)[number];

export interface PayEvent {
  at: string;
  by: string;
  byName: string;
  /** Key under `payroll:history.*`. */
  action: string;
  /** Free text exactly as typed (never translated). */
  note?: string;
  values?: Record<string, string>;
}

export interface PayPolicy {
  key: PayPolicyKey;
  state: PayPolicyState;
}

export interface PayRunRef {
  id: string;
  ref: string;
  state: PayRunState;
  version: number;
  net: Money;
  included: number;
}

export interface PayPeriodView {
  id: string;
  ref: string;
  /** "2026-10". */
  month: string;
  from: string;
  to: string;
  payDate: string;
  legalEntityId: string;
  legalEntityName: string;
  state: PayPeriodState;
  /** The period's live run (or the last reversed one). */
  run?: PayRunRef;
  createdByName: string;
  createdAt: string;
  openedByName?: string;
  openedAt?: string;
  closedByName?: string;
  closedAt?: string;
  history: PayEvent[];
  actions: { open: boolean; close: boolean; prepareRun: boolean };
  /** Why an action the reader could otherwise take is not available. */
  blocked?: 'another_open' | 'run_not_approved' | 'other_sites';
}

export interface PayPeriodsList {
  items: PayPeriodView[];
  counts: Record<PayPeriodState, number>;
  canCreate: boolean;
  /** The next period the reader may create (in order, never before the payroll licence). */
  next?: { legalEntityId: string; legalEntityName: string; month: string; from: string; to: string; payDate: string };
  today: string;
  /** The reader sees only some sites of an employer: the amounts shown cover the staff of those sites only (Issue #16). */
  scopeLimited: boolean;
}

export interface PayPeriodInput {
  legalEntityId: string;
  month: string;
  payDate: string;
}

export interface PayLineSummary {
  employeeId: string;
  employeeName: string;
  code: string;
  role: HrRole;
  department: HrDepartment;
  basis: PayBasis | null;
  state: 'included' | 'excluded';
  gross: Money;
  deductions: Money;
  net: Money;
  blockers: PayLineBlocker[];
  warnings: PayLineWarning[];
  /** The reader's own pay line (they can see it, never change or approve it). */
  own: boolean;
}

export interface PayVersion {
  n: number;
  at: string;
  byName: string;
  /** Key under `payroll:version.*` (`changed`: about someone the reader may not see). */
  reason: string;
  /** The person it was about (a name, never an id), only when the reader may see them. */
  about?: string;
  /**
   * The employer-wide net and head count of the version. Left out for a reader with only some of the
   * employer's sites (Issue #16): no per-version totals of their lines exist, and none are made up.
   */
  net?: Money;
  included?: number;
}

export interface PayRunView {
  id: string;
  ref: string;
  periodId: string;
  periodRef: string;
  month: string;
  from: string;
  to: string;
  payDate: string;
  legalEntityName: string;
  periodState: PayPeriodState;
  state: PayRunState;
  version: number;
  /** HR records changed since this version was calculated: recalculate before submitting. */
  stale: boolean;
  /** The reader sees only some of the legal entity's sites: lines and totals cover those only. */
  scopeLimited: boolean;
  totals: { gross: Money; deductions: Money; net: Money; included: number; excluded: number; blocked: number };
  lines: PayLineSummary[];
  runBlockers: PayRunBlocker[];
  policies: PayPolicy[];
  versions: PayVersion[];
  preparedByName: string;
  preparedAt: string;
  submittedByName?: string;
  submittedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNote?: string;
  reversedByName?: string;
  reversedAt?: string;
  reversalReason?: string;
  /** People who prepared, recalculated, changed or submitted this run (none of them may approve it). */
  makers: string[];
  instruction?: { id: string; ref: string; state: PayInstructionState };
  history: PayEvent[];
  actions: { recompute: boolean; edit: boolean; submit: boolean; withdraw: boolean; approve: boolean; return: boolean; reverse: boolean; instruct: boolean; export: boolean };
  blocked?: 'own_run' | 'own_line' | 'other_sites' | 'instruction_live' | 'period_closed';
}

export interface PayRunsList {
  items: Array<PayRunRef & { periodRef: string; month: string; legalEntityName: string; submittedByName?: string; submittedAt?: string; approvedByName?: string; approvedAt?: string; reversedAt?: string; stale: boolean; canApprove: boolean; blocked?: PayRunView['blocked'] }>;
  /** The reader sees only some sites of an employer: the amounts shown cover the staff of those sites only (Issue #16). */
  scopeLimited: boolean;
}

export interface PayEarning {
  /** `base`, or `allowance` with the allowance key. */
  kind: 'base' | 'allowance';
  allowance?: PayAllowance;
  /** The full monthly amount (or the daily rate) before proration. */
  rate: Money;
  amount: Money;
  /** Pro rata: days employed of days in the period (monthly), or days worked (daily). */
  days?: { counted: number; of: number };
}

export interface PayBonus {
  id: string;
  label: string;
  amount: Money;
  reason: string;
  addedByName: string;
  addedAt: string;
}

export interface PayHeldDeduction {
  advanceId: string;
  ref: string;
  kind: 'advance' | 'loan';
  instalment: number;
  of: number;
  amount: Money;
  /** Why it is not deducted: the advance was approved, but its payment to the employee is not verified. */
  reason: 'advance_unverified';
}

export interface PayBreakdown {
  run: { id: string; ref: string; state: PayRunState; version: number; month: string; from: string; to: string; stale: boolean };
  employee: { id: string; name: string; code: string; role: HrRole; department: HrDepartment; employmentType: EmploymentType; legalEntityName: string; startDate: string; endDate?: string };
  state: 'included' | 'excluded';
  basis: PayBasis | null;
  /** Days of the period the person was employed, and the period's calendar days. */
  employedDays: number;
  periodDays: number;
  /** Daily wage: days worked as confirmed by the preparer, and what HR attendance recorded. */
  days?: { confirmed?: { days: number; reason: string; byName: string; at: string }; recorded: number; recordedFrom?: string };
  earnings: PayEarning[];
  bonuses: PayBonus[];
  deductions: {
    applied: never[];
    held: PayHeldDeduction[];
    statutory: Array<{ key: PayStatutory; state: 'not_configured' }>;
    unpaidLeaveDays: number;
    absences: number;
  };
  gross: Money;
  deductionsTotal: Money;
  net: Money;
  exclusion?: { reason: string; byName: string; at: string };
  blockers: PayLineBlocker[];
  warnings: PayLineWarning[];
  /** Masked: the last four characters of the account only. */
  payment: { method: PayMethod | null; account?: string; accountVerified?: boolean };
  own: boolean;
  /** Other runs this person has a line in (the reader's scope only). */
  otherRuns: Array<{ id: string; ref: string; month: string; state: PayRunState }>;
  history: PayEvent[];
  actions: { confirmDays: boolean; addBonus: boolean; removeBonus: boolean; exclude: boolean; include: boolean };
  blocked?: 'own_line' | 'frozen' | 'submitted' | 'other_sites';
}

export interface PayDaysInput {
  days: number;
  reason: string;
}

export interface PayBonusInput {
  label: string;
  amount: string;
  reason: string;
}

export interface PayInstructionLine {
  employeeId: string;
  employeeName: string;
  method: PayMethod;
  account?: string;
  amount: Money;
  settlement: PaySettlement;
}

export interface PayInstructionView {
  id: string;
  ref: string;
  runId: string;
  runRef: string;
  month: string;
  legalEntityName: string;
  state: PayInstructionState;
  total: Money;
  lines: PayInstructionLine[];
  /** Approved pay that cannot be instructed yet (a bank account not verified), never dropped silently. */
  held: Array<{ employeeId: string; employeeName: string; amount: Money; reason: 'bank_unverified' | 'zero_net' }>;
  scopeLimited: boolean;
  preparedByName: string;
  preparedAt: string;
  approvedByName?: string;
  approvedAt?: string;
  sentByName?: string;
  sentAt?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: PayEvent[];
  actions: { approve: boolean; send: boolean; cancel: boolean };
  blocked?: 'own_instruction' | 'own_line' | 'other_sites';
}

export interface PayDisbursements {
  /** Approved runs and their instruction (if any): obligation, instruction and settlement side by side. */
  runs: Array<{ runId: string; runRef: string; month: string; payDate: string; state: PayRunState; net: Money; instruction?: PayInstructionView; canInstruct: boolean; blocked?: 'other_sites' | 'instruction_live' }>;
  /** Earlier instructions of those runs (cancelled ones stay in the history). */
  cancelled: PayInstructionView[];
  settlementAvailable: false;
  /** The reader sees only some sites of an employer: the amounts shown cover the staff of those sites only (Issue #16). */
  scopeLimited: boolean;
}

export interface PayJournalLine {
  account: PayAccount;
  side: 'debit' | 'credit';
  amount: Money;
}

export interface PayAccounting {
  runs: Array<{
    runId: string;
    runRef: string;
    month: string;
    state: 'approved' | 'reversed';
    /** What would be recorded when the run was approved (never posted). */
    proposed: PayJournalLine[];
    /** For a reversed run: the proposed reversal of the same lines. */
    reversal?: PayJournalLine[];
    balanced: boolean;
    scopeLimited: boolean;
    /** Statutory payables that would be needed: not calculated. */
    statutory: PayStatutory[];
  }>;
  /** Posted, evidenced entries: always none in this gate. */
  posted: never[];
  gaps: PayPostingGap[];
  obligation: { approved: Money; instructed: Money; settledVerified: null };
}

export interface PayDashboard {
  today: string;
  legalEntityName: string;
  scopeLimited: boolean;
  period?: { id: string; ref: string; month: string; state: PayPeriodState; payDate: string };
  nextPeriod?: { id: string; ref: string; month: string; state: PayPeriodState };
  run?: PayRunRef & { stale: boolean; blocked: number; submittedByName?: string };
  kpis: {
    staffInRun: number;
    blockedLines: number;
    /** Approved obligations (approved, not reversed): owed, never paid. */
    approvedObligation: Money;
    /** Approved or sent (simulated) instructions: instructed, never paid. */
    instructed: Money;
    /** Verified settlements: not available in this gate. */
    settledVerified: null;
    awaitingMe: number;
  };
  attention: Array<{ kind: 'blocked_lines' | 'stale' | 'awaiting_run' | 'awaiting_instruction' | 'held_bank' | 'statutory'; count?: number; href: string }>;
  canPrepare: boolean;
  canApprove: boolean;
}

export interface PayExport {
  runRef: string;
  month: string;
  version: number;
  state: PayRunState;
  scopeLimited: boolean;
  rows: Array<{ code: string; name: string; role: HrRole; state: 'included' | 'excluded'; gross: string; deductions: string; net: string }>;
}
