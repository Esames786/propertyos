import type { ChargeCategoryKey, InvoiceSource } from './billing';
import type { Money } from './money';

/**
 * Resident collections (Gate C.2, A4 §5–7 and A6 §5.4). Tenant money only: the platform's own
 * account never appears here (I-15). Invariants the mock server enforces:
 * - a proof is evidence, never a payment: only verification against independent settlement evidence
 *   creates a payment and a receipt (I-9). Evidence is a line of an imported statement of the
 *   association's verified account in force on the value date, or cash confirmed at the counter. A
 *   reviewer's note is not evidence: without a line the proof waits ("awaiting bank evidence");
 * - a line that matches only in part (amount, date, reference or name) settles a payment only
 *   through an exception approved by someone other than the requester;
 * - a bank transaction settles at most one payment (identity = receiving account, statement source
 *   and the bank's transaction id; never the reference text two different transfers may share);
 * - an allocation settles only lines the paying party is liable for, of the same legal entity
 *   (per-unit liability; cross-payer and cross-entity allocations are refused, not warned);
 * - residents are shown only the verified beneficiary in force for the issuing legal entity.
 */

export const COLLECTION_METHODS = ['bank_transfer', 'office_cash', 'cheque', 'online'] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

// ---------------------------------------------------------------------------------------------
// Payment submissions (resident proof of a transfer; FIN-008/009, PORTAL-008/028)
// ---------------------------------------------------------------------------------------------

/**
 * - awaiting_bank_evidence: reviewed, but no statement line shows the money yet. Not settled, not
 *   allocated, no receipt; verified when the line arrives.
 * - exception_pending: a partly matching line was proposed with a reason; waiting for a second person.
 */
export const SUBMISSION_STATES = ['submitted', 'under_review', 'awaiting_bank_evidence', 'exception_pending', 'needs_information', 'verified', 'rejected'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

/** What a statement line is compared on; a full match has all four. */
export const MATCH_REASONS = ['amount', 'date', 'reference', 'name'] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

/** The uploaded file as the prototype keeps it: its description only (no file is stored). */
export interface ProofFile {
  name: string;
  /** MIME type as reported by the browser. */
  type: string;
  size: number;
  /** Fingerprint of name, size and type: the same file sent twice is recognised. */
  fingerprint: string;
  /** What the demo shows in place of the image (fixtures describe their screenshots). */
  look?: 'transfer_slip' | 'blurry' | 'other_account' | 'document';
}

export interface SubmissionVersion {
  n: number;
  submittedAt: string;
  amount: Money;
  /** The date the resident says the transfer was made. */
  transferDate: string;
  /** As entered by the resident (free text, never translated). */
  bankReference: string;
  payerBank?: string;
  file: ProofFile;
  note?: string;
}

export interface SubmissionEvent {
  at: string;
  by: string;
  byName: string;
  byKind: 'resident' | 'staff';
  action:
    | 'submitted'
    | 'resubmitted'
    | 'review_started'
    | 'awaiting_bank_evidence'
    | 'exception_requested'
    | 'exception_approved'
    | 'exception_rejected'
    | 'information_requested'
    | 'verified'
    | 'rejected';
  /** As entered (a request for information, a rejection reason, a review note, an exception reason). */
  note?: string;
}

/** A partly matching statement line proposed for a proof, decided by someone other than the requester. */
export interface SettlementException {
  bankLineId: string;
  bankTxnId: string;
  /** What the line does not match (amount, date, reference, name). */
  missing: MatchReason[];
  reason: string;
  /** An edited allocation and its reason, when the requester changed the rule's proposal. */
  allocations?: Array<{ lineId: string; amount: string }>;
  overrideReason?: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
}

export interface PaymentSubmission {
  id: string;
  ref: string;
  siteId: string;
  legalEntityId: string;
  billingAccountId: string;
  accountNo: string;
  /** The resident who sent it; the payment can only settle what this party is liable for. */
  payerPartyId: string;
  payerName: string;
  flats: string[];
  method: 'bank_transfer';
  state: SubmissionState;
  current: SubmissionVersion;
  /** Every version sent, oldest first (a resubmission never overwrites history). */
  versions: SubmissionVersion[];
  history: SubmissionEvent[];
  /** Staff reviewing it now (a second reviewer sees who). */
  reviewer?: { principalId: string; name: string };
  /** The association's account the resident was shown when sending it (in force on the transfer date). */
  paidTo?: { beneficiaryId: string; iban: string };
  /** Reviewed, waiting for the bank line: who decided and the note (never a settlement). */
  awaiting?: { by: string; byName: string; at: string; note: string };
  /** A partly matching line proposed for approval (state exception_pending). */
  exception?: SettlementException;
  /** Shown to the resident: what finance needs (needs information) or why it was rejected. */
  request?: string;
  rejectionReason?: string;
  paymentId?: string;
  paymentRef?: string;
  receiptId?: string;
  receiptRef?: string;
}

export interface SubmissionRow {
  id: string;
  ref: string;
  state: SubmissionState;
  accountNo: string;
  billingAccountId: string;
  payerName: string;
  flats: string[];
  amount: Money;
  transferDate: string;
  bankReference: string;
  submittedAt: string;
  versions: number;
  /** Best bank match found (for the inbox's "ready to verify" signal). */
  match: 'exact' | 'possible' | 'none' | 'already_matched';
  /** Same file, or same amount, date and reference as another submission of this payer. */
  possibleDuplicateOf?: string[];
  reviewer?: string;
}

export interface SubmissionQueue {
  items: SubmissionRow[];
  counts: Record<SubmissionState, number>;
  /** Amount awaiting a decision (submitted, under review, needs information). */
  pending: Money;
}

/** One bank transaction as a candidate for a submission, with the reasons it was proposed. */
export interface MatchCandidate {
  bankLine: BankLine;
  score: number;
  reasons: MatchReason[];
  /** What the line does not match; empty for a full match. */
  missing: MatchReason[];
  /** 'full': verify directly. 'partial': only through an exception approved by someone else. */
  strength: 'full' | 'partial';
  /**
   * Whether the money reached the issuing entity's account in force on the value date. Anything
   * else ('wrong_account': another or a retired account; 'wrong_entity') can never settle the proof.
   */
  destination: 'ok' | 'wrong_account' | 'wrong_entity';
  /** Held for an exception waiting on another proof. */
  heldFor?: { submissionId: string; submissionRef: string };
  /** Already settles another payment: proposing it is refused (never a second settlement). */
  alreadyMatched?: { paymentId: string; paymentRef: string };
  /** Another bank transaction has the same reference text: shown so it is not mistaken for a duplicate. */
  sharesReferenceWith?: string[];
}

export interface AllocationLine {
  invoiceId: string;
  invoiceRef: string;
  lineId: string;
  unitId: string;
  unitCode: string;
  period: string;
  kind: 'charge' | 'opening_balance';
  category?: ChargeCategoryKey;
  source: InvoiceSource;
  dueOn: string;
  /** Open before this allocation. */
  open: Money;
  amount: Money;
}

export interface AllocationPreview {
  amount: Money;
  lines: AllocationLine[];
  unapplied: Money;
  /** The proposal follows the site rule (oldest first); an edited one needs a reason. */
  rule: 'oldest_first';
  edited: boolean;
}

export interface SubmissionDetail {
  submission: PaymentSubmission;
  candidates: MatchCandidate[];
  /** Default allocation of the amount received (oldest first, the payer's own lines only). */
  allocation: AllocationPreview;
  /** The payer's open lines (what an edited allocation may choose from). */
  openLines: AllocationLine[];
  /** Another submission of this payer with the same file or the same amount, date and reference. */
  possibleDuplicates: Array<{ id: string; ref: string; state: SubmissionState }>;
  /** Where the money was meant to go: the verified beneficiary in force on the transfer date. */
  beneficiary: Beneficiary | null;
  actions: {
    startReview: boolean;
    /** Verify against a fully matching line (or, after approval, the exception's line). */
    verify: boolean;
    /** Mark reviewed and wait for the bank line (nothing is settled). */
    awaitBank: boolean;
    /** Propose a partly matching line for approval by someone else. */
    requestException: boolean;
    /** Approve or reject the pending exception (a second person holding payment_exception.approve). */
    decideException: boolean;
    requestInformation: boolean;
    reject: boolean;
    reason?: 'permission_missing' | 'invalid_state' | 'tenant_suspended' | 'maker_checker_required';
  };
}

// ---------------------------------------------------------------------------------------------
// Bank feed and reconciliation (BANK-003/004)
// ---------------------------------------------------------------------------------------------

/** Where a statement came from (provider or channel); part of a transaction's identity. */
export type BankStatementSource = 'demo_bank_csv';

export interface BankStatement {
  id: string;
  fileName: string;
  /** Fingerprint of the file: importing the same statement again creates nothing. */
  fileHash: string;
  /** The association's account the statement belongs to, chosen at import (never assumed). */
  beneficiaryId: string;
  legalEntityId: string;
  iban: string;
  source: BankStatementSource;
  from: string;
  to: string;
  lines: number;
  credits: Money;
  importedBy: string;
  importedByName: string;
  importedAt: string;
}

export interface BankLine {
  id: string;
  statementId: string;
  /** The receiving account (from the statement): the money reached this account, of this entity. */
  beneficiaryId: string;
  legalEntityId: string;
  accountIban: string;
  source: BankStatementSource;
  /**
   * The bank's own id for the transaction. Identity against duplicates is (account, source, id):
   * the same id on another account is another transaction.
   */
  bankTxnId: string;
  valueDate: string;
  amount: Money;
  /** As printed by the bank. */
  narration: string;
  reference: string;
  counterpartyName: string;
  /** Masked, as the statement shows it. */
  counterpartyAccount: string;
  state: 'unmatched' | 'matched' | 'excluded';
  paymentId?: string;
  paymentRef?: string;
  /** Held while an exception for one proof waits for approval (no other proof may use it). */
  heldFor?: { submissionId: string; submissionRef: string };
  /** Why it was set aside (not a resident payment), as entered. */
  excludedReason?: string;
}

export interface BankFeed {
  statements: BankStatement[];
  /** The entity's verified accounts (in force, waiting out cooling-off, retired): a statement is imported for one of them. */
  accounts: Beneficiary[];
  lines: BankLine[];
  counts: { all: number; unmatched: number; matched: number; excluded: number; unidentified: number };
}

export interface ReconciliationSummary {
  /** Credits on the imported statements. */
  statementCredits: Money;
  matched: { amount: Money; count: number };
  unmatched: { amount: Money; count: number };
  /** Unmatched lines with no submission or account they could belong to. */
  unidentified: { amount: Money; count: number };
  excluded: { amount: Money; count: number };
  /** Proofs reviewed and waiting for their bank line (nothing settled yet). */
  awaitingBankLine: { amount: Money; count: number };
  awaitingProofs: Array<{ id: string; ref: string; amount: Money; payerName: string; flats: string[]; transferDate: string; reviewedBy: string }>;
  lines: Array<BankLine & { suggestion?: { kind: 'submission' | 'account'; id: string; label: string; href: string } }>;
  payments: Array<{ id: string; ref: string; amount: Money; method: CollectionMethod; verification: CollectionPayment['verification']; payerName: string; accountNo: string; receivedOn: string; bankLineId?: string }>;
}

// ---------------------------------------------------------------------------------------------
// Payments, receipts and unapplied credit (FIN-005/006/007/011)
// ---------------------------------------------------------------------------------------------

export interface PaymentAllocation {
  invoiceId: string;
  invoiceRef: string;
  lineId: string;
  unitId: string;
  unitCode: string;
  period: string;
  kind: 'charge' | 'opening_balance';
  category?: ChargeCategoryKey;
  amount: Money;
  /** Applied later from the payment's unapplied credit. */
  appliedAt?: string;
}

export interface CollectionPayment {
  id: string;
  ref: string;
  siteId: string;
  legalEntityId: string;
  legalEntityName: string;
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  method: CollectionMethod;
  amount: Money;
  receivedOn: string;
  source: { kind: 'submission'; submissionId: string; submissionRef: string } | { kind: 'office'; note?: string };
  /**
   * How the money was confirmed: a fully matching statement line, a partly matching line through an
   * approved exception, or cash at the counter. There is no settlement on a reviewer's word alone.
   */
  verification: 'bank_matched' | 'exception_approved' | 'counter';
  /** The approved exception: why the partly matching line was accepted, and by whom. */
  exception?: { missing: MatchReason[]; reason: string; requestedBy: string; requestedByName: string; approvedBy: string; approvedByName: string; approvedAt: string };
  bankLineId?: string;
  bankTxnId?: string;
  verifiedBy: string;
  verifiedByName: string;
  verifiedAt: string;
  allocations: PaymentAllocation[];
  /** Received but not settling any line yet (paid ahead or more than owed). */
  unapplied: Money;
  /** The allocation differed from the site rule (oldest first): the reason given. */
  overrideReason?: string;
  receiptId: string;
  receiptRef: string;
}

export interface Receipt {
  id: string;
  ref: string;
  paymentId: string;
  paymentRef: string;
  issuedAt: string;
  legalEntityName: string;
  siteName: string;
  payerName: string;
  accountNo: string;
  flats: string[];
  method: CollectionMethod;
  amount: Money;
  receivedOn: string;
  bankReference?: string;
  allocations: PaymentAllocation[];
  unapplied: Money;
}

export interface PaymentRow {
  id: string;
  ref: string;
  receivedOn: string;
  method: CollectionMethod;
  verification: CollectionPayment['verification'];
  payerName: string;
  accountNo: string;
  billingAccountId: string;
  flats: string[];
  amount: Money;
  allocated: Money;
  unapplied: Money;
  receiptRef: string;
  reconciled: boolean;
}

export interface PaymentList {
  items: PaymentRow[];
  totals: { amount: Money; allocated: Money; unapplied: Money; count: number };
}

export interface PaymentDetail {
  payment: CollectionPayment;
  receipt: Receipt;
  submission?: PaymentSubmission;
  bankLine?: BankLine;
  /** The account's position after the payment (statement closing balance today). */
  accountBalance: Money;
  /** Open lines of the same payer the unapplied credit could settle now. */
  creditTargets: AllocationLine[];
  actions: { applyCredit: boolean };
}

export interface CreditRow {
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  flats: string[];
  credit: Money;
  /** Open lines of the same payer the credit could settle now. */
  openLines: number;
  payments: Array<{ id: string; ref: string; unapplied: Money; receivedOn: string }>;
}

// ---------------------------------------------------------------------------------------------
// Collection destination and method rules (BILL-010, BILL-012)
// ---------------------------------------------------------------------------------------------

export interface BankDetails {
  bankName: string;
  branch: string;
  accountTitle: string;
  /** Fictional: bank code DEMO (fixtures.test). */
  iban: string;
}

/** A collection account of one issuing legal entity. Residents only ever see the verified one in force. */
export interface Beneficiary extends BankDetails {
  id: string;
  siteId: string;
  legalEntityId: string;
  legalEntityName: string;
  /** Payment reference residents are asked to quote ({flat}, {period} are filled in per bill). */
  referenceFormat: string;
  status: 'pending_verification' | 'verified' | 'retired';
  verifiedOn?: string;
  /** First and last day it receives residents' money. */
  activeFrom?: string;
  activeTo?: string;
}

export interface BeneficiaryChange {
  id: string;
  siteId: string;
  legalEntityId: string;
  proposed: BankDetails;
  /** As entered (why the account changes). */
  reason: string;
  /** Account verification evidence (simulated: the bank's confirmation letter was checked). */
  verification: 'bank_letter_checked' | 'not_checked';
  state: 'pending_approval' | 'cooling_off' | 'active' | 'rejected' | 'cancelled';
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
  /** First day residents see the new account (approval + cooling-off). */
  effectiveOn?: string;
  beneficiaryId?: string;
}

export interface MethodRule {
  method: CollectionMethod;
  enabled: boolean;
  /** Offered in a later gate (online gateway: D). */
  gate?: string;
  /** Office cash: the most one receipt may take, and where and when residents can pay. */
  maxAmount?: Money;
  counter?: string;
}

export interface NumberingScheme {
  /** Short code of the issuing legal entity at this site (e.g. ANR). */
  code: string;
  /** Patterns: {code}, {yyyy}, {yyyymm}, {seq:N} (N digits). Changes apply to new documents only. */
  invoice: string;
  opening: string;
  creditNote: string;
  payment: string;
  receipt: string;
  submission: string;
  run: string;
}

export type DocumentKind = keyof Omit<NumberingScheme, 'code'>;

/** Who may post an approved billing run (configurable; the preparer never may). */
export interface PostingPolicy {
  /** Role ids (of the tenant's roles that hold billing_run.post) allowed to post. */
  roles: string[];
  /** Roles that hold the permission and could be allowed. */
  eligibleRoles: Array<{ id: string; labelKey: string }>;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

/** How a run groups lines into invoices. Only the default is offered in Gate C. */
export type InvoiceGrouping = 'account_payer' | 'flat' | 'payer';

export interface CollectionSettings {
  siteId: string;
  legalEntityId: string;
  legalEntityName: string;
  issueDay: number;
  dueDay: number;
  graceDays: number;
  allocation: 'oldest_first';
  invoiceGrouping: InvoiceGrouping;
  lateFees: 'not_configured';
  reminders: 'later';
  /** The verified account in force: the only one residents see. */
  payee: Beneficiary | null;
  /** Earlier accounts (retired), newest first. */
  history: Beneficiary[];
  changes: BeneficiaryChange[];
  coolingOffDays: number;
  methods: MethodRule[];
  numbering: NumberingScheme;
  posting: PostingPolicy;
  actions: {
    proposeBeneficiary: boolean;
    approveBeneficiary: boolean;
    manageMethods: boolean;
    manageNumbering: boolean;
    managePosting: boolean;
  };
}

// ---------------------------------------------------------------------------------------------
// Liability (payer) changes with approval (owner decision, C.1 review)
// ---------------------------------------------------------------------------------------------

export interface LiabilityChange {
  id: string;
  flatId: string;
  flatCode: string;
  /** Liable before the change on its date (as resolved when requested). */
  previousPartyId?: string;
  previousName?: string;
  partyId: string;
  partyName: string;
  /** First day of the new liability (always the first of an unbilled month). */
  from: string;
  /** As entered. */
  reason: string;
  state: 'pending_approval' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
  /** The change this one corrects (approving it supersedes that one). */
  corrects?: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
}

// ---------------------------------------------------------------------------------------------
// Collections reporting (COL-001/004/005)
// ---------------------------------------------------------------------------------------------

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgingBucketKey = (typeof AGING_BUCKETS)[number];

export interface AgingRow {
  billingAccountId: string;
  accountNo: string;
  holderName: string;
  flats: string[];
  buckets: Record<AgingBucketKey, Money>;
  total: Money;
  credit: Money;
}

export interface AgingReport {
  asOf: string;
  buckets: Array<{ key: AgingBucketKey; amount: Money; accounts: number; href: string }>;
  rows: AgingRow[];
  total: Money;
  /** Unapplied credit is shown separately, never netted into a bucket. */
  credit: { amount: Money; accounts: number; href: string };
}

export interface CollectionsSummary {
  site: { id: string; name: string; legalEntityName: string };
  period: string;
  billed: { amount: Money; invoices: number; href: string };
  collected: { amount: Money; payments: number; href: string };
  /** Collected against the period's invoices / billed for the period (0–1). */
  rate: number;
  /** The period's bill split three ways (sums to billed): settled, waiting for verification, still owed. */
  progress: { collected: Money; pending: Money; owed: Money };
  pending: { amount: Money; submissions: number; href: string };
  outstanding: { amount: Money; accounts: number; href: string };
  arrears: { amount: Money; accounts: number; href: string };
  credit: { amount: Money; accounts: number; href: string };
  aging: AgingReport['buckets'];
  queue: { toReview: number; needsInformation: number; awaitingBank: number; exceptions: number; href: string; reviewHref: string };
  bank: { unmatched: number; unidentified: number; lastImport?: string; href: string };
  byBuilding: Array<{ id: string; code: string; name: string; billed: Money; collected: Money; outstanding: Money; rate: number; href: string }>;
  recent: PaymentRow[];
}

// ---------------------------------------------------------------------------------------------
// Resident portal, dues edition (PORTAL-001/004/005/007/008/010/028/029)
// ---------------------------------------------------------------------------------------------

export type ResidentBillStatus = 'unpaid' | 'overdue' | 'partially_paid' | 'paid' | 'pending_verification' | 'nothing_due';

export interface ResidentChargeLine {
  lineId: string;
  unitCode: string;
  kind: 'charge' | 'opening_balance';
  category?: ChargeCategoryKey;
  amount: Money;
  credited: Money;
  paid: Money;
  open: Money;
}

export interface ResidentBill {
  invoiceId: string;
  ref: string;
  period: string;
  source: InvoiceSource;
  issuedOn: string;
  dueOn: string;
  flats: string[];
  lines: ResidentChargeLine[];
  /** This bill's charges (the resident's lines only). */
  total: Money;
  credited: Money;
  paid: Money;
  open: Money;
  settlement: 'unpaid' | 'partially_paid' | 'paid' | 'credited';
  overdue: boolean;
}

/** What the resident owes now: this month's bill + the earlier balance − credit = the exact total. */
export interface ResidentPosition {
  current: ResidentBill | null;
  previousBalance: Money;
  credit: Money;
  totalPayable: Money;
  /** Part of the total already past its due date. */
  overdue: Money;
  /** Sent and not yet verified: shown as pending, never deducted as paid. */
  pendingVerification: Money;
  status: ResidentBillStatus;
  dueOn?: string;
}

export interface ResidentPayee {
  legalEntityName: string;
  bankName: string;
  branch: string;
  accountTitle: string;
  iban: string;
  /** The reference to quote for this bill. */
  reference: string;
  amount: Money;
  /** Payment instruction encoded in the QR (fictional; never a real account). */
  qrPayload: string;
  verifiedOn?: string;
  /** The account changed recently: residents are told, with the date. */
  changedOn?: string;
}

export interface ResidentMethods {
  bankTransfer: boolean;
  officeCash: { enabled: boolean; counter?: string; maxAmount?: Money };
  online: { available: false; gate: string };
}

export interface ResidentSubmissionSummary {
  id: string;
  ref: string;
  state: SubmissionState;
  amount: Money;
  transferDate: string;
  submittedAt: string;
  request?: string;
  rejectionReason?: string;
  receiptId?: string;
  receiptRef?: string;
}

export interface ResidentReceiptSummary {
  id: string;
  ref: string;
  amount: Money;
  receivedOn: string;
  method: CollectionMethod;
}

export interface DuesHome {
  resident: { partyId: string; name: string };
  property: { tenantName: string; siteName: string; legalEntityName: string; buildingName: string; flats: Array<{ id: string; code: string; role: 'owner' | 'occupant' | 'payer' }>; accountNo: string };
  position: ResidentPosition;
  payee: ResidentPayee | null;
  methods: ResidentMethods;
  submissions: ResidentSubmissionSummary[];
  receipts: ResidentReceiptSummary[];
}

export interface DuesBills {
  position: ResidentPosition;
  bills: ResidentBill[];
  submissions: ResidentSubmissionSummary[];
  receipts: ResidentReceiptSummary[];
  payments: Array<{ id: string; ref: string; amount: Money; receivedOn: string; method: CollectionMethod; receiptId: string; receiptRef: string; allocated: Money; unapplied: Money }>;
}

export interface DuesBillDetail {
  bill: ResidentBill;
  position: ResidentPosition;
  payee: ResidentPayee | null;
  payments: Array<{ paymentRef: string; receiptId: string; receiptRef: string; amount: Money; receivedOn: string }>;
}

export interface DuesPayInfo {
  position: ResidentPosition;
  payee: ResidentPayee | null;
  methods: ResidentMethods;
  /** Proofs already waiting: the resident is told before sending another. */
  pending: ResidentSubmissionSummary[];
}

export interface ResidentSubmissionDetail {
  submission: ResidentSubmissionSummary & { accountNo: string; flats: string[]; bankReference: string; versions: Array<Pick<SubmissionVersion, 'n' | 'submittedAt' | 'amount' | 'transferDate' | 'bankReference' | 'note'> & { fileName: string }> };
  /** The resident's own view of what happened (staff names are not shown). */
  timeline: Array<{ at: string; step: 'submitted' | 'resubmitted' | 'under_review' | 'awaiting_bank_evidence' | 'information_requested' | 'verified' | 'rejected'; note?: string }>;
  canResubmit: boolean;
}

export interface SubmitProofDuesInput {
  amount: string;
  transferDate: string;
  bankReference: string;
  payerBank?: string;
  note?: string;
  file: { name: string; type: string; size: number };
}
