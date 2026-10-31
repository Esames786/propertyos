import type { FeatureKey } from './access';
import type { ChargeCategoryKey, SocietyDashboard } from './billing';
import type { AllocationLine, BankLine, CollectionMethod, MatchReason } from './collections';
import type { Money } from './money';

/**
 * Society finance and governance (Gate S.1, V3.2 F05/F10–F13/F20/F21). Tenant money only (I-15).
 * The invariants the mock server enforces:
 * - settled cash changes only through confirmed payments, posted cash vouchers and settlement
 *   confirmations (I-26). The cashbook is derived from them: there are no stored cashbook rows, and
 *   each source event counts once by (source type, source id, posting version, leg) (I-28);
 * - an approved instruction is not a settlement: a bank leg settles only on a matched statement line
 *   of the verified account (a partial match through a second person's exception); a cash leg only
 *   on a witnessed deposit slip (I-38);
 * - an uncleared cheque settles nothing and yields no final receipt (I-29);
 * - a closed period refuses postings dated in it; reopening is an approval under the policy in force (I-27);
 * - no approval policy, delegation or draft lets a person approve their own request (I-35). Checks
 *   use stable principal ids, never names.
 */

/** Licensed features of S.1 (catalogue keys; Al-Noor holds them through its S.1 amendment). */
export const S1_FEATURES = {
  cashbook: 'banking.cashbook',
  bulkCollection: 'receivables.bulk_office_collection',
  officeCollections: 'receivables.office_collections',
  reminders: 'receivables.reminders',
  committee: 'residents.committee',
  transferClearance: 'residents.transfer_clearance',
} as const satisfies Record<string, FeatureKey>;

// ---------------------------------------------------------------------------------------------
// Accounts (BANK-001/002): bank accounts are the verified beneficiaries of BILL-010, never copies
// ---------------------------------------------------------------------------------------------

export const FINANCE_ACCOUNT_KINDS = ['bank', 'cash', 'petty_cash'] as const;
export type FinanceAccountKind = (typeof FINANCE_ACCOUNT_KINDS)[number];

export interface FinanceAccount {
  id: string;
  kind: FinanceAccountKind;
  legalEntityId: string;
  legalEntityName: string;
  siteId: string;
  /** As the society calls it ("Association account", "Office cash box"). */
  name: string;
  /** Bank accounts: the verified beneficiary record itself (BILL-010). */
  beneficiaryId?: string;
  bankName?: string;
  branch?: string;
  accountTitle?: string;
  iban?: string;
  /** Receives residents' dues today (the beneficiary in force). */
  receivesDues: boolean;
  status: 'active' | 'retired';
  purpose: 'operating';
  /** Cash accounts: who keeps the cash. */
  custodian?: { principalId: string; name: string };
  openedOn: string;
  retiredOn?: string;
}

export interface FinanceAccountRow extends FinanceAccount {
  balance: Money;
  /** Settled movements this period. */
  inflow: Money;
  outflow: Money;
  /** Bank: statement lines not matched to anything. */
  unreconciled: number;
  /** Instructions and cheques waiting for evidence on this account. */
  pending: Money;
  href: string;
}

export interface FinanceAccountDetail {
  account: FinanceAccountRow;
  /** Bank: the beneficiary history (verification, activation, retirement). */
  history: Array<{ at: string; byName: string; action: string; note?: string }>;
  /** Statement imports for this account (BANK-003), newest first. */
  statements: Array<{ id: string; fileName: string; from: string; to: string; lines: number; importedAt: string; importedByName: string }>;
  lines: BankLine[];
  lastCount?: CashCount;
  actions: { voucher: boolean; transfer: boolean; count: boolean; importStatement: boolean };
}

// ---------------------------------------------------------------------------------------------
// The cashbook (BANK-007): a derived view over settled source events
// ---------------------------------------------------------------------------------------------

export const CASHBOOK_SOURCES = ['opening_balance', 'payment', 'payment_reversal', 'cash_voucher', 'transfer_leg'] as const;
export type CashbookSource = (typeof CASHBOOK_SOURCES)[number];

export const CASHBOOK_CATEGORIES = ['opening', 'resident_dues', 'cheque', 'other_income', 'expense', 'transfer', 'deposit', 'withdrawal', 'reversal'] as const;
export type CashbookCategory = (typeof CASHBOOK_CATEGORIES)[number];

/** What proves a line: the evidence it was settled on. */
export type CashbookEvidence =
  | { kind: 'statement_line'; bankLineId: string; bankTxnId: string; exception?: boolean }
  | { kind: 'witnessed_count'; witnessedByName: string; countedByName: string }
  | { kind: 'witnessed_slip'; slipNo: string; witnessedByName: string }
  | { kind: 'counter'; byName: string }
  | { kind: 'voucher'; evidenceName: string; approvedByName: string }
  | { kind: 'handover'; document: string; approvedByName: string }
  /** A reversal approved by a second person (a cash line corrected). */
  | { kind: 'approval'; approvalRef: string; approvedByName: string };

export interface CashbookLine {
  /** (source type, source id, posting version, leg): every event counts once. */
  key: string;
  accountId: string;
  date: string;
  period: string;
  direction: 'in' | 'out';
  amount: Money;
  category: CashbookCategory;
  source: CashbookSource;
  sourceId: string;
  /** The source record's reference (payment, voucher, transfer …). */
  sourceRef: string;
  postingVersion: number;
  /** Who paid or was paid, as recorded (free text, never translated). */
  counterparty?: string;
  /** Flats the movement concerns (resident dues). */
  flats?: string[];
  /** Translation key under `finance:cashbook.describe` and its values. */
  describe: { key: string; values?: Record<string, string> };
  evidence: CashbookEvidence;
  /** Opens the source record. */
  href: string;
  /** Running balance of the account after this line. */
  balance: Money;
}

/** Something on its way: shown apart, never in a settled balance. */
export interface PendingItem {
  kind: 'cash_in_transit' | 'approved_instruction' | 'awaiting_approval' | 'cheque_received' | 'cheque_deposited' | 'proof_pending' | 'voucher_approved' | 'cash_awaiting_count';
  id: string;
  ref: string;
  amount: Money;
  accountId?: string;
  since: string;
  /** Translation key under `finance:pending.describe`. */
  describe: { key: string; values?: Record<string, string> };
  href: string;
}

export interface CashbookTotals {
  opening: Money;
  receipts: Money;
  payments: Money;
  closing: Money;
  net: Money;
}

export interface CashbookView {
  period: string;
  /** null = all accounts. */
  accountId: string | null;
  accounts: Array<Pick<FinanceAccount, 'id' | 'kind' | 'name' | 'status'> & { balance: Money }>;
  periods: Array<{ period: string; state: PeriodState }>;
  totals: CashbookTotals;
  byAccount: Array<{ accountId: string; name: string; kind: FinanceAccountKind } & CashbookTotals>;
  byCategory: Array<{ category: CashbookCategory; direction: 'in' | 'out'; amount: Money; count: number }>;
  lines: CashbookLine[];
  /** Cash that left a cash account for a bank deposit whose bank leg is not settled yet. */
  inTransit: Money;
  pending: PendingItem[];
  /** Bank accounts: the cashbook against the account's imported statement lines for the period. */
  reconciliation: Array<{ accountId: string; name: string; cashbookMovement: Money; statementMovement: Money; unmatchedLines: number; unmatchedAmount: Money; difference: Money; reconciled: boolean; href: string }>;
  periodState: PeriodState;
  actions: { voucher: boolean; transfer: boolean; close: boolean; count: boolean };
}

// ---------------------------------------------------------------------------------------------
// Cash vouchers (BANK-009)
// ---------------------------------------------------------------------------------------------

export const VOUCHER_CATEGORIES = ['other_income', 'hall_booking', 'scrap_sale', 'repairs', 'utilities', 'cleaning', 'security_services', 'office_supplies', 'events', 'misc_expense'] as const;
export type VoucherCategory = (typeof VOUCHER_CATEGORIES)[number];
/** Receipts (other income); everything else is an expense (disabled when `payables` is granted). */
export const RECEIPT_CATEGORIES: readonly VoucherCategory[] = ['other_income', 'hall_booking', 'scrap_sale'];

export type VoucherStatus = 'draft' | 'submitted' | 'approved' | 'posted' | 'rejected' | 'withdrawn';

export interface VoucherEvent {
  at: string;
  by: string;
  byName: string;
  action: 'prepared' | 'edited' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'withdrawn' | 'reversal_prepared' | 'reversed';
  note?: string;
}

export interface CashVoucher {
  id: string;
  ref: string;
  legalEntityId: string;
  siteId: string;
  accountId: string;
  accountName: string;
  direction: 'receipt' | 'payment';
  category: VoucherCategory;
  amount: Money;
  /** The date the money moved (decides the period). */
  onDate: string;
  /** As entered. */
  purpose: string;
  /** Who was paid or who paid (a member of the association, a supplier …). */
  counterparty: { name: string; partyId?: string };
  evidence: { name: string; kind: 'bill' | 'receipt' | 'quotation' | 'other'; size: number };
  status: VoucherStatus;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  approvalId?: string;
  approvalRef?: string;
  postedBy?: string;
  postedByName?: string;
  postedAt?: string;
  /** A reversal voucher: the posted voucher it cancels (opposite direction, same amount). */
  reversalOf?: { id: string; ref: string };
  /** A posted voucher later cancelled by this reversal (the original is never edited). */
  reversedBy?: { id: string; ref: string };
  history: VoucherEvent[];
}

export interface VoucherList {
  items: CashVoucher[];
  counts: Record<VoucherStatus, number>;
}

export interface VoucherDetail {
  voucher: CashVoucher;
  approval?: ApprovalRequest;
  periodState: PeriodState;
  actions: { edit: boolean; submit: boolean; post: boolean; reverse: boolean; withdraw: boolean; reason?: 'permission_missing' | 'period_closed' | 'invalid_state' | 'maker_checker_required' };
}

export interface VoucherInput {
  accountId: string;
  direction: 'receipt' | 'payment';
  category: VoucherCategory;
  amount: string;
  onDate: string;
  purpose: string;
  counterparty: string;
  counterpartyPartyId?: string;
  evidence: { name: string; kind: 'bill' | 'receipt' | 'quotation' | 'other'; size: number };
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------------------------
// Deposits and transfers (BANK-006): instructions, settled leg by leg on evidence
// ---------------------------------------------------------------------------------------------

export const TRANSFER_KINDS = ['deposit', 'transfer', 'withdrawal', 'cash_transfer'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

export type TransferStatus = 'draft' | 'awaiting_approval' | 'approved_instruction' | 'in_transit' | 'settled' | 'rejected' | 'cancelled';

/** One side of a movement: money leaves `from` (out) and arrives at `to` (in). */
export interface TransferLeg {
  leg: 'out' | 'in';
  accountId: string;
  accountName: string;
  accountKind: FinanceAccountKind;
  /** Bank accounts: the title the bank prints (what the other side's statement line shows). */
  accountTitle?: string;
  /** A bank side settles on a statement line; a cash side on a witnessed slip. */
  evidence: 'statement_line' | 'witnessed_slip';
  status: 'pending' | 'slip_recorded' | 'exception_pending' | 'settled';
  /** Cash side: the slip recorded by one person, witnessed by another. */
  slip?: { number: string; on: string; recordedBy: string; recordedByName: string; recordedAt: string; witnessedBy?: string; witnessedByName?: string; witnessedAt?: string };
  /** Bank side: a partly matching line waiting for a second person. */
  exception?: SettlementExceptionRequest;
  settlementId?: string;
  settledOn?: string;
}

export interface SettlementExceptionRequest {
  bankLineId: string;
  bankTxnId: string;
  missing: MatchReason[];
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
}

export interface TransferEvent {
  at: string;
  by: string;
  byName: string;
  action:
    | 'prepared'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'slip_recorded'
    | 'slip_witnessed'
    | 'leg_matched'
    | 'exception_requested'
    | 'exception_approved'
    | 'exception_rejected'
    | 'settled'
    | 'reversal_prepared';
  leg?: 'out' | 'in';
  note?: string;
}

export interface FundsTransfer {
  id: string;
  ref: string;
  legalEntityId: string;
  siteId: string;
  kind: TransferKind;
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
  /** As entered. */
  purpose: string;
  /** The reference the bank will show (deposit slip or transfer reference). */
  bankReference: string;
  status: TransferStatus;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  approvalId?: string;
  approvalRef?: string;
  legs: TransferLeg[];
  /** A reversing instruction: the settled transfer it moves back. */
  reversalOf?: { id: string; ref: string };
  reversedBy?: { id: string; ref: string };
  history: TransferEvent[];
}

export interface SettlementConfirmation {
  id: string;
  subjectType: 'transfer_leg' | 'cheque';
  subjectId: string;
  leg?: 'out' | 'in';
  evidenceType: 'statement_line' | 'witnessed_deposit_slip';
  bankLineId?: string;
  bankTxnId?: string;
  exception?: { missing: MatchReason[]; reason: string; requestedBy: string; requestedByName: string; approvedBy: string; approvedByName: string };
  slipNo?: string;
  settledOn: string;
  confirmedBy: string;
  confirmedByName: string;
  at: string;
}

export interface TransferList {
  items: FundsTransfer[];
  counts: Record<TransferStatus, number>;
  inTransit: Money;
}

export interface TransferDetail {
  transfer: FundsTransfer;
  approval?: ApprovalRequest;
  settlements: SettlementConfirmation[];
  /** Per bank leg: statement lines of the leg's account that could prove it (C.2 matching). */
  candidates: Record<'out' | 'in', LegCandidate[]>;
  actions: {
    submit: boolean;
    cancel: boolean;
    recordSlip: Array<'out' | 'in'>;
    witnessSlip: Array<'out' | 'in'>;
    match: Array<'out' | 'in'>;
    decideException: Array<'out' | 'in'>;
    reverse: boolean;
    reason?: 'permission_missing' | 'maker_checker_required' | 'period_closed' | 'invalid_state';
  };
}

/** A statement line proposed for a leg or a cheque, compared like C.2 proofs. */
export interface LegCandidate {
  bankLine: BankLine;
  reasons: MatchReason[];
  missing: MatchReason[];
  strength: 'full' | 'partial';
  /** Another subject already settled on it, or it is held for another exception. */
  taken?: { kind: 'payment' | 'settlement' | 'held'; ref: string };
}

export interface TransferInput {
  kind: TransferKind;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  purpose: string;
  bankReference?: string;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------------------------
// Cheques (FIN-007/FIN-013 cheque lines, BILL-012 cheque rules)
// ---------------------------------------------------------------------------------------------

export type ChequeStatus = 'received' | 'deposited' | 'exception_pending' | 'cleared' | 'returned' | 'cancelled' | 'reversed';

export interface ChequeEvent {
  at: string;
  by: string;
  byName: string;
  action: 'received' | 'deposited' | 'exception_requested' | 'exception_approved' | 'exception_rejected' | 'cleared' | 'returned' | 'cancelled' | 'reversal_requested' | 'reversed';
  note?: string;
}

export interface ChequeInstrument {
  id: string;
  /** The acknowledgement's reference ("Cheque received — not a receipt of payment"). */
  ref: string;
  legalEntityId: string;
  siteId: string;
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  flats: string[];
  drawerBank: string;
  chequeNumber: string;
  chequeDate: string;
  amount: Money;
  source: { kind: 'batch'; batchId: string; batchRef: string; lineId: string } | { kind: 'office' };
  status: ChequeStatus;
  receivedOn: string;
  receivedBy: string;
  receivedByName: string;
  deposit?: { accountId: string; accountName: string; slipNo: string; on: string; byName: string };
  exception?: SettlementExceptionRequest;
  settlementId?: string;
  paymentId?: string;
  paymentRef?: string;
  receiptId?: string;
  receiptRef?: string;
  returned?: { reason: string; memo: string; on: string; byName: string };
  reversal?: { approvalId: string; approvalRef: string; reason: string; bankLineId?: string; on?: string };
  history: ChequeEvent[];
}

export interface ChequeList {
  items: ChequeInstrument[];
  counts: Record<ChequeStatus, number>;
  /** Received or deposited, not cleared: pending clearance, never in a balance. */
  pending: Money;
}

export interface ChequeDetail {
  cheque: ChequeInstrument;
  candidates: LegCandidate[];
  depositAccounts: Array<Pick<FinanceAccount, 'id' | 'name'>>;
  actions: { deposit: boolean; clear: boolean; decideException: boolean; return: boolean; cancel: boolean; requestReversal: boolean; reason?: 'permission_missing' | 'maker_checker_required' | 'period_closed' | 'invalid_state' };
}

/** Site rules for cheques (BILL-012 extension). */
export interface ChequeRule {
  /** As printed on the bill ("Cheques payable to …"). */
  payableTo: string;
  /** Verified bank account cheques are deposited into. */
  depositAccountId: string;
  /** How far ahead a cheque may be dated (post-dated cheques are refused beyond this). */
  maxPostDatedDays: number;
}

/** D-46: when single office cash (FIN-007) counts as received. Batches always need a second person. */
export type CashWitnessPolicy = 'single_counter' | 'second_person';

// ---------------------------------------------------------------------------------------------
// Bulk office collection (FIN-013, FIN-014)
// ---------------------------------------------------------------------------------------------

export type BatchStatus = 'draft' | 'submitted' | 'confirmed' | 'returned';

export interface BatchLine {
  id: string;
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  flats: string[];
  method: Extract<CollectionMethod, 'office_cash' | 'cheque'>;
  amount: Money;
  cheque?: { drawerBank: string; number: string; date: string };
  /** After confirmation: a payment and receipt (cash), or a cheque acknowledgement. */
  outcome?: { kind: 'payment'; paymentId: string; paymentRef: string; receiptId: string; receiptRef: string; reversed?: boolean } | { kind: 'cheque'; chequeId: string; chequeRef: string; status: ChequeStatus };
}

export interface BatchEvent {
  at: string;
  by: string;
  byName: string;
  action: 'created' | 'lines_changed' | 'submitted' | 'confirmed' | 'returned' | 'resubmitted';
  note?: string;
}

export interface OfficeCollectionBatch {
  id: string;
  ref: string;
  siteId: string;
  legalEntityId: string;
  collectedBy: string;
  collectedByName: string;
  collectedOn: string;
  /** Cash counted by the collector (must equal the cash lines). */
  declaredCash?: Money;
  status: BatchStatus;
  lines: BatchLine[];
  submittedAt?: string;
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  /** The second person's own count of the cash at confirmation. */
  confirmedCash?: Money;
  returnedReason?: string;
  history: BatchEvent[];
  /**
   * 'single': one office cash payment recorded at the counter (FIN-007). Owner decision D-46 (D.1/S.1
   * integration): it waits for a second person's count like any batch; no payment or receipt before.
   */
  origin?: 'single';
  /** The collector's note on a single payment (shown with the batch). */
  note?: string;
}

/** POST /payments/office: the cash is recorded and waits for a second person's count (D-46). */
export interface OfficeCashRecorded {
  status: 'awaiting_count';
  batch: { id: string; ref: string };
  amount: Money;
  accountNo: string;
  payerName: string;
  flats: string[];
  recordedByName: string;
  recordedAt: string;
  /** What the cash would settle if confirmed now (oldest first; computed again at confirmation). */
  settles: { lines: AllocationLine[]; unapplied: Money };
  replayed: boolean;
}

/** Office cash handed in for an account and still waiting for its second count (staff and resident views). */
export interface CashAwaitingCount {
  batchId: string;
  batchRef: string;
  amount: Money;
  payerName: string;
  recordedOn: string;
  recordedByName: string;
}

export interface BatchTotals {
  cash: Money;
  cheques: Money;
  cashLines: number;
  chequeLines: number;
  total: Money;
}

export interface BatchList {
  items: Array<OfficeCollectionBatch & { totals: BatchTotals }>;
  counts: Record<BatchStatus, number>;
}

export interface BatchDetail {
  batch: OfficeCollectionBatch;
  totals: BatchTotals;
  /** Problems that block submitting or confirming, as translation keys with values. */
  problems: Array<{ lineId?: string; code: string; values?: Record<string, string> }>;
  /** Shown, not blocking (a proof already waiting for the same account, more than is owed …). */
  warnings: Array<{ lineId?: string; code: string; values?: Record<string, string> }>;
  cashLimit?: Money;
  methods: { cash: boolean; cheque: boolean };
  actions: { edit: boolean; submit: boolean; confirm: boolean; return: boolean; reason?: 'permission_missing' | 'maker_checker_required' | 'invalid_state' | 'period_closed' };
}

/** A billing account that can be collected from: its liable payers and what each owes. */
export interface CollectionCandidate {
  billingAccountId: string;
  accountNo: string;
  flats: string[];
  buildingCode: string;
  payers: Array<{ partyId: string; name: string; flats: string[]; open: Money; overdue: Money; oldestDue?: string }>;
  open: Money;
  /** A proof is waiting: collecting again could take the money twice. */
  pendingProof: boolean;
  /** An uncleared cheque of this account. */
  pendingCheque: boolean;
}

export interface BatchLineInput {
  billingAccountId: string;
  payerPartyId: string;
  method: 'office_cash' | 'cheque';
  amount: string;
  cheque?: { drawerBank: string; number: string; date: string };
}

// ---------------------------------------------------------------------------------------------
// Financial periods and month close (BANK-008)
// ---------------------------------------------------------------------------------------------

export type PeriodState = 'open' | 'closing' | 'closed' | 'reopened';

export interface PeriodEvent {
  at: string;
  by: string;
  byName: string;
  action: 'closed' | 'reopen_requested' | 'reopened' | 'reopen_rejected' | 'posting_refused';
  note?: string;
}

export interface FiscalPeriod {
  id: string;
  legalEntityId: string;
  period: string;
  state: PeriodState;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  /** The witnessed cash counts the close relied on. */
  cashCountIds?: string[];
  reopenApprovalId?: string;
  history: PeriodEvent[];
}

export interface CashCount {
  id: string;
  accountId: string;
  accountName: string;
  onDate: string;
  counted: Money;
  /** What the cashbook says the account holds on that date. */
  expected: Money;
  denominations: Array<{ note: string; count: number }>;
  countedBy: string;
  countedByName: string;
  countedAt: string;
  witnessedBy?: string;
  witnessedByName?: string;
  witnessedAt?: string;
  status: 'awaiting_witness' | 'witnessed';
}

export type CloseCheckKey =
  | 'period_ended'
  | 'unreconciled_lines'
  | 'proofs_waiting'
  | 'open_exceptions'
  | 'unposted_runs'
  | 'vouchers_open'
  | 'cash_in_transit'
  | 'unsettled_instructions'
  | 'cheques_pending'
  | 'batches_open'
  | 'cash_counted';

export interface CloseCheck {
  key: CloseCheckKey;
  outcome: 'passed' | 'blocking' | 'warning';
  count: number;
  amount?: Money;
  href?: string;
}

export interface CloseChecklist {
  period: FiscalPeriod;
  checks: CloseCheck[];
  counts: CashCount[];
  /** Cash accounts that need a witnessed count dated on or after the period's last day. */
  cashAccounts: Array<{ id: string; name: string; expected: Money; counted?: CashCount }>;
  canClose: boolean;
  actions: { close: boolean; count: boolean; witness: boolean; requestReopen: boolean; reason?: 'permission_missing' | 'invalid_state' | 'blocking_checks' };
  reopenApproval?: ApprovalRequest;
}

// ---------------------------------------------------------------------------------------------
// Approvals (APR-001…005): versioned policies, requests, decisions, delegation
// ---------------------------------------------------------------------------------------------

export const APPROVAL_SUBJECTS = ['cash_voucher', 'funds_transfer', 'period_reopen', 'payment_reversal', 'clearance_waiver', 'approval_policy'] as const;
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];

export const COMMITTEE_OFFICES = ['president', 'vice_president', 'general_secretary', 'treasurer', 'joint_secretary', 'member'] as const;
export type CommitteeOffice = (typeof COMMITTEE_OFFICES)[number];

export type ApproverRef = { kind: 'office'; office: CommitteeOffice } | { kind: 'role'; roleId: string };

export interface ApprovalRule {
  id: string;
  subject: ApprovalSubject;
  /** Amount band (inclusive from, exclusive to); no amount = every request of the subject. */
  minAmount?: Money;
  maxAmount?: Money;
  approvers: ApproverRef[];
  /** Distinct people who must approve (each from the approvers). */
  approvalsRequired: number;
}

export type PolicyStatus = 'draft' | 'pending' | 'active' | 'retired' | 'rejected';

export interface ApprovalPolicyVersion {
  id: string;
  legalEntityId: string;
  version: number;
  status: PolicyStatus;
  effectiveFrom: string;
  /** The next version took over (retired). */
  effectiveTo?: string;
  rules: ApprovalRule[];
  /** Why this version (as entered). */
  note: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  approvalId?: string;
  approvalRef?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ApprovalDecision {
  by: string;
  byName: string;
  decision: 'approve' | 'reject';
  /** As entered. */
  reason: string;
  at: string;
  /** How this person was eligible: as an office holder, a role holder, or a delegate. */
  as: { kind: 'office'; office: CommitteeOffice } | { kind: 'role'; roleId: string } | { kind: 'delegate'; office?: CommitteeOffice; roleId?: string; forPrincipalId: string; forName: string; delegationId: string };
}

export interface ApprovalRequest {
  id: string;
  ref: string;
  subject: ApprovalSubject;
  subjectId: string;
  subjectRef: string;
  amount?: Money;
  /** Translation key under `approvals:summary` and its values. */
  summary: { key: string; values?: Record<string, string> };
  href: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  /** The policy version in force when requested, and the rule applied (snapshotted). */
  policy: { versionId: string; version: number };
  rule: ApprovalRule;
  /** People who may not decide (requester, the person paid, a person named in the request). */
  conflicted: string[];
  status: ApprovalStatus;
  decisions: ApprovalDecision[];
  decidedAt?: string;
}

/** Who could decide a request and why someone cannot. */
export interface ApprovalEvaluation {
  eligible: Array<{ principalId: string; name: string; as: ApprovalDecision['as'] }>;
  /** For the signed-in person: may they decide, and if not, why. */
  you: { canDecide: boolean; reason?: 'own_request' | 'conflict_of_interest' | 'already_decided' | 'not_an_approver' | 'permission_missing' | 'not_pending' | 'delegate_own_request' };
  remaining: number;
}

export interface ApprovalRow extends ApprovalRequest {
  yours: boolean;
  remaining: number;
}

/** Approvals C.1/C.2/D.1 already raise, listed in the inbox; each keeps its own maker-checker. */
export interface FixedApprovalRow {
  kind: Exclude<SocietyDashboard['approvals']['items'][number]['kind'], 'approval_request'>;
  id: string;
  label: string;
  href: string;
  yours: boolean;
}

export interface ApprovalInbox {
  /** Waiting for the signed-in person. */
  mine: ApprovalRow[];
  /** Raised by the signed-in person. */
  requested: ApprovalRow[];
  /** Everything else (history, others' requests) the person may see. */
  others: ApprovalRow[];
  fixed: FixedApprovalRow[];
  counts: { mine: number; requested: number; fixed: number };
}

export interface ApprovalDetail {
  request: ApprovalRequest;
  evaluation: ApprovalEvaluation;
  policy: ApprovalPolicyVersion;
  /** The record the request is about, summarised. */
  subject: { label: string; href: string; facts: Array<{ key: string; value: string }> };
  audit: Array<{ at: string; byName: string; action: string; note?: string }>;
}

export interface Delegation {
  id: string;
  fromPrincipalId: string;
  fromName: string;
  toPrincipalId: string;
  toName: string;
  subjects: ApprovalSubject[];
  from: string;
  to: string;
  /** As entered. */
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  endedAt?: string;
  endedByName?: string;
  state: 'scheduled' | 'active' | 'ended' | 'expired';
}

export interface PolicyOverview {
  versions: ApprovalPolicyVersion[];
  active: ApprovalPolicyVersion;
  /** People who could approve under each office and role today. */
  holders: Array<{ ref: ApproverRef; people: Array<{ principalId: string; name: string }> }>;
  roles: Array<{ id: string; labelKey: string }>;
  actions: { draft: boolean; submit: boolean };
}

export interface PolicyDraftInput {
  rules: Array<Omit<ApprovalRule, 'id' | 'minAmount' | 'maxAmount'> & { minAmount?: string; maxAmount?: string }>;
  effectiveFrom: string;
  note: string;
}

// ---------------------------------------------------------------------------------------------
// Committee 360 (RES-008)
// ---------------------------------------------------------------------------------------------

export interface CommitteeMember {
  name: string;
  partyId?: string;
  /** A staff sign-in, if this member has one (office powers act only through it). */
  principalId?: string;
  flats?: string[];
}

export interface CommitteeOfficeSetting {
  office: CommitteeOffice;
  singleHolder: boolean;
  /** Staff role an office holder works through (permissions come from the role, never the title). */
  roleId?: string;
  /** Spending authority, from the approval policy in force (read-only here). */
  authority: Array<{ subject: ApprovalSubject; upTo?: Money; withOthers: number }>;
}

export interface CommitteeTerm {
  id: string;
  office: CommitteeOffice;
  member: CommitteeMember;
  from: string;
  to?: string;
  appointedBy: 'election' | 'co_option' | 'resolution';
  /** The resolution that appointed them. */
  decisionRef?: string;
  endedReason?: string;
  state: 'active' | 'ended' | 'scheduled';
}

export interface CommitteeMeeting {
  id: string;
  ref: string;
  on: string;
  title: string;
  attendees: string[];
  quorum: boolean;
  /** As recorded. */
  minutes: string;
  recordedByName: string;
}

export interface CommitteeDecision {
  id: string;
  ref: string;
  meetingId?: string;
  meetingRef?: string;
  on: string;
  /** As recorded. */
  subject: string;
  outcome: 'approved' | 'rejected' | 'noted';
  votes: { for: number; against: number; abstain: number };
  recordedByName: string;
  /** Residents see only published resolutions (D-38). */
  published: boolean;
  linked?: { kind: 'approval' | 'policy' | 'term'; ref: string; href: string };
}

export interface Committee360 {
  committee: { id: string; name: string; legalEntityName: string; termEnds: string };
  offices: CommitteeOfficeSetting[];
  terms: CommitteeTerm[];
  meetings: CommitteeMeeting[];
  decisions: CommitteeDecision[];
  policy: Pick<ApprovalPolicyVersion, 'id' | 'version' | 'effectiveFrom'>;
  delegations: Delegation[];
  approvals: { pending: number; href: string };
  audit: Array<{ at: string; byName: string; action: string; label: string }>;
  roles: Array<{ id: string; labelKey: string }>;
  /** Owners and residents who can hold an office. */
  candidates: Array<{ partyId: string; name: string; flats: string[]; principalId?: string }>;
  actions: { manage: boolean };
}

// ---------------------------------------------------------------------------------------------
// Reminders (COL-007/009) and printing (BILL-018, COL-008)
// ---------------------------------------------------------------------------------------------

export const REMINDER_CHANNELS = ['in_app', 'sms', 'whatsapp'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export interface ReminderStep {
  /** Days relative to the due date (−3 = three days before, 0 = on the day, 7 = a week late). */
  offsetDays: number;
  channels: ReminderChannel[];
}

export interface ReminderPolicy {
  id: string;
  siteId: string;
  version: number;
  status: 'draft' | 'active' | 'retired' | 'paused';
  steps: ReminderStep[];
  quietHours: { from: string; to: string };
  monthlyCap: number;
  /** No late-fee wording unless late fees are enabled (D-11: off). */
  lateFeeWording: false;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  activatedByName?: string;
  activatedAt?: string;
  note: string;
}

export type ReminderSkip = 'not_due_yet' | 'paid' | 'proof_pending' | 'needs_information' | 'cheque_pending' | 'no_consent' | 'quiet_hours' | 'monthly_cap' | 'already_sent' | 'nothing_due' | 'channel_not_licensed';

export interface ReminderEvent {
  id: string;
  at: string;
  policyVersion: number;
  step?: number;
  billingAccountId: string;
  accountNo: string;
  partyId: string;
  payerName: string;
  flats: string[];
  channel: ReminderChannel;
  outcome: 'sent' | 'skipped' | 'deferred';
  skip?: ReminderSkip;
  amount: Money;
  /** The send this event belongs to (the same key never sends twice). */
  sendKey: string;
  byName: string;
}

export interface ReminderPreviewRow {
  billingAccountId: string;
  accountNo: string;
  partyId: string;
  payerName: string;
  flats: string[];
  amount: Money;
  overdue: Money;
  channels: Array<{ channel: ReminderChannel; outcome: 'send' | 'skip' | 'defer'; skip?: ReminderSkip }>;
}

export interface ReminderPreview {
  policyVersion: number;
  at: string;
  quietNow: boolean;
  rows: ReminderPreviewRow[];
  counts: { send: number; skip: number; defer: number };
  bySkip: Partial<Record<ReminderSkip, number>>;
}

export interface ReminderOverview {
  policies: ReminderPolicy[];
  active: ReminderPolicy | null;
  history: ReminderEvent[];
  counts: { sent: number; skipped: number; deferred: number };
  channels: Record<ReminderChannel, boolean>;
  actions: { manage: boolean; send: boolean };
}

export interface ReminderSendResult {
  sendKey: string;
  /** True when this key was already used: nothing was sent again. */
  replayed: boolean;
  sent: number;
  skipped: number;
  deferred: number;
  events: ReminderEvent[];
}

/** One printable document of a pack (an invoice or a dues notice), addressed to its liable payer. */
export interface PrintDocument {
  id: string;
  kind: 'invoice' | 'dues_notice';
  ref: string;
  accountNo: string;
  payerName: string;
  flats: string[];
  issuedOn: string;
  dueOn?: string;
  lines: Array<{ label: string; category?: ChargeCategoryKey; unitCode: string; period: string; amount: Money; open: Money }>;
  total: Money;
  open: Money;
  overdue?: Money;
  /** Where to pay: the verified account in force (never another). */
  payee: { legalEntityName: string; bankName: string; accountTitle: string; iban: string; reference: string } | null;
}

export interface PrintPack {
  kind: 'billing_run' | 'dues_notices';
  title: string;
  siteName: string;
  legalEntityName: string;
  generatedAt: string;
  /** Run packs: the run and how many posted invoices it has (the pack has exactly these). */
  run?: { id: string; ref: string; period: string; invoices: number };
  documents: PrintDocument[];
  total: Money;
}

// ---------------------------------------------------------------------------------------------
// Society transfers and clearance (OWN-003/004/006)
// ---------------------------------------------------------------------------------------------

export type OwnershipTransferStatus = 'requested' | 'dues_blocked' | 'fee_invoiced' | 'clearance_pending' | 'approved' | 'completed' | 'rejected' | 'withdrawn';

export interface TransferFeeRate {
  version: number;
  amount: Money;
  from: string;
  to?: string;
  /** The bylaw clause that allows the fee (D-42). */
  bylawRef: string;
}

export interface DuesCheck {
  checkedAt: string;
  /** Every liability of the outgoing payer on this flat. */
  lines: Array<{ invoiceId: string; invoiceRef: string; period: string; label: string; open: Money }>;
  outstanding: Money;
  /** Proofs or cheques still pending for this account (they are not counted as paid). */
  pending: Money;
}

export interface OwnershipTransferEvent {
  at: string;
  byName: string;
  action: 'requested' | 'dues_checked' | 'fee_invoiced' | 'waiver_requested' | 'waiver_decided' | 'approved' | 'rejected' | 'certificate_issued' | 'payer_change_raised' | 'withdrawn';
  note?: string;
}

export interface OwnershipTransfer {
  id: string;
  ref: string;
  siteId: string;
  legalEntityId: string;
  flatId: string;
  flatCode: string;
  billingAccountId: string;
  accountNo: string;
  from: { partyId: string; name: string };
  to: { name: string; phone?: string; partyId?: string };
  /** First day the new owner holds the flat (and becomes liable). */
  effectiveOn: string;
  /** As entered (sale deed, gift, inheritance …). */
  reason: string;
  status: OwnershipTransferStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  dues?: DuesCheck;
  fee?: { rateVersion: number; amount: Money; bylawRef: string; invoiceId: string; invoiceRef: string };
  waiver?: { approvalId: string; approvalRef: string; amount: Money; reason: string; status: ApprovalStatus };
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  certificate?: ClearanceCertificate;
  payerChange?: { id: string; state: string };
  history: OwnershipTransferEvent[];
}

export interface ClearanceCertificate {
  id: string;
  ref: string;
  transferId: string;
  flatCode: string;
  accountNo: string;
  ownerName: string;
  incomingName: string;
  issuedOn: string;
  validUntil: string;
  balanceCheckedAt: string;
  outstanding: Money;
  waived?: Money;
  issuedBy: string;
  issuedByName: string;
  legalEntityName: string;
}

export interface OwnershipTransferRow {
  id: string;
  ref: string;
  flatCode: string;
  fromName: string;
  toName: string;
  effectiveOn: string;
  status: OwnershipTransferStatus;
  fee: 'none' | 'invoiced' | 'paid';
  clearance: 'not_issued' | 'issued';
  outstanding?: Money;
}

export interface OwnershipTransferDetail {
  transfer: OwnershipTransfer;
  /** The fee invoice as read today (open or paid). */
  feeInvoice?: { id: string; ref: string; total: Money; open: Money; settlement: string };
  rate: TransferFeeRate | null;
  waiverApproval?: ApprovalRequest;
  actions: { checkDues: boolean; invoiceFee: boolean; requestWaiver: boolean; approve: boolean; reject: boolean; issueCertificate: boolean; withdraw: boolean; reason?: 'permission_missing' | 'maker_checker_required' | 'balance_not_zero' | 'invalid_state' };
}

export interface OwnershipTransferInput {
  flatId: string;
  toName: string;
  toPhone?: string;
  effectiveOn: string;
  reason: string;
}

// ---------------------------------------------------------------------------------------------
// Finance dashboard (FIN-001): every figure opens its records
// ---------------------------------------------------------------------------------------------

export interface FinanceFigure {
  amount: Money;
  count?: number;
  href: string;
}

export interface FinanceOverview {
  site: { id: string; name: string; legalEntityName: string };
  period: string;
  periodState: PeriodState;
  periods: Array<{ period: string; state: PeriodState }>;
  opening: FinanceFigure & { cash: Money; bank: Money };
  /** Receipted resident payments (all methods) in the period. */
  collected: FinanceFigure;
  /** Other income (posted receipt vouchers). */
  otherIncome: FinanceFigure;
  /** Expenses and outgoing payments (posted payment vouchers, settled outgoing legs to outside). */
  expenses: FinanceFigure;
  outstanding: FinanceFigure & { accounts: number };
  pendingVerification: FinanceFigure;
  cashInTransit: FinanceFigure;
  /** D-46: office collections (single payments included) waiting for a second person's count. */
  cashAwaitingCount: FinanceFigure;
  chequesPending: FinanceFigure;
  transfersAwaiting: FinanceFigure;
  netMovement: FinanceFigure;
  closing: FinanceFigure & { cash: Money; bank: Money };
  unreconciled: FinanceFigure;
  /** Billed ≠ collected ≠ cash received ≠ bank settled: four different numbers, each explained. */
  ladder: { billed: FinanceFigure; collected: FinanceFigure; cashReceived: FinanceFigure; bankSettled: FinanceFigure };
  accounts: FinanceAccountRow[];
  approvals: { pending: number; yours: number; href: string };
  close: { state: PeriodState; blocking: number; href: string };
  byCategory: CashbookView['byCategory'];
}

// ---------------------------------------------------------------------------------------------
// Demo helper (D-48): generates a labelled sample statement for what waits on bank evidence.
// It never settles anything: the file is imported for the verified account and matched like C.2.
// ---------------------------------------------------------------------------------------------

export type DemoLineVariant = 'full' | 'partial' | 'skip' | 'returned_after_clearing';

export interface DemoStatementItem {
  id: string;
  kind: 'transfer_leg' | 'cheque' | 'cheque_return';
  leg?: 'out' | 'in';
  ref: string;
  amount: Money;
  direction: 'credit' | 'debit';
  /** Translation key under `finance:demo.items` and its values. */
  describe: { key: string; values?: Record<string, string> };
  variants: DemoLineVariant[];
}

export interface DemoStatementOptions {
  account: { id: string; name: string; iban: string };
  items: DemoStatementItem[];
}

export interface DemoStatementFile {
  fileName: string;
  from: string;
  to: string;
  content: string;
  lines: number;
}
