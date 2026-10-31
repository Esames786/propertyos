import type { Beneficiary, CollectionMethod, CollectionsSummary } from './collections';
import type { Money } from './money';
import type { OccupancyStatus, SetupStep, SocietyDemoMode, UnitTypeCode } from './sites';

/**
 * Monthly maintenance billing (Gate C.1, A4 §2–4 and A6 §4). Tenant money only: SaaS fees and unit
 * meters live in the platform plane and never appear here (I-15). Every engine behind these shapes
 * is deterministic and idempotent; posted invoices are never edited (credit notes correct them).
 */

export const CHARGE_CATEGORIES = [
  'maintenance',
  'security',
  'lift',
  'water',
  'generator',
  'parking',
  'common_electricity',
  'sinking_fund',
  'one_time_assessment',
  'repair',
  'late_fee',
  // Gate S.1: a society transfer's fee (versioned rate with a bylaw reference; one invoice per transfer).
  'transfer_fee',
] as const;
export type ChargeCategoryKey = (typeof CHARGE_CATEGORIES)[number];

/** Categories offered in Gate C.1 (the others are later gates and shown as such). */
export const C1_CATEGORIES: readonly ChargeCategoryKey[] = ['maintenance', 'security', 'lift', 'water'];

export type RuleScope = { level: 'site' } | { level: 'building'; id: string } | { level: 'unit_type'; id: string } | { level: 'unit'; id: string };

/** Most specific wins: site default → building → unit type → flat override (A4 §2). */
export const SCOPE_RANK: Record<RuleScope['level'], number> = { site: 0, building: 1, unit_type: 2, unit: 3 };

/** One version of a recurring charge rule. Versions are immutable and effective-dated by period. */
export interface ChargeRule {
  id: string;
  /** Stable across versions. */
  ruleId: string;
  version: number;
  siteId: string;
  category: ChargeCategoryKey;
  scope: RuleScope;
  /** Readable scope ("Penthouse", "Block A", "A-108"). */
  scopeName: string;
  basis: 'fixed';
  amount: Money;
  frequency: 'monthly';
  /** First billing period (YYYY-MM), inclusive. */
  from: string;
  /** First period it no longer applies to, exclusive. */
  to?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface Exemption {
  id: string;
  siteId: string;
  unitId: string;
  unitCode: string;
  categories: 'all' | readonly ChargeCategoryKey[];
  /** Whole percent (100 = fully exempt). */
  percent: number;
  /** As entered. */
  reason: string;
  from: string;
  to?: string;
  state: 'pending_approval' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
}

export interface RuleRef {
  id: string;
  ruleId: string;
  version: number;
  category: ChargeCategoryKey;
  scope: RuleScope;
  scopeName: string;
  amount: Money;
}

/** One category for one flat and period: what applies, which rule won and what it overrode. */
export interface ResolvedCharge {
  category: ChargeCategoryKey;
  /** The winning rule's amount before any exemption. */
  base: Money;
  amount: Money;
  winner: RuleRef;
  overridden: RuleRef[];
  exemption?: { id: string; percent: number; reason: string };
}

export const BILLING_RUN_STATES = ['DRAFT', 'PREVIEWED', 'APPROVAL_PENDING', 'APPROVED', 'POSTED', 'NOTIFIED', 'CANCELLED'] as const;
export type BillingRunState = (typeof BILLING_RUN_STATES)[number];
export type BillingRunAction = 'preview' | 'submit' | 'return' | 'approve' | 'post' | 'notify' | 'cancel';

export interface BillingRunEvent {
  at: string;
  by: string;
  byName: string;
  action: 'create' | BillingRunAction;
  from: BillingRunState | null;
  to: BillingRunState;
  /** As entered (a return comment, a cancellation reason). */
  note?: string;
  /** Posting replays (double click, retry) are recorded, and change nothing. */
  replay?: boolean;
}

export interface BillingRunTotals {
  invoices: number;
  flats: number;
  exempt: number;
  accounts: number;
  amount: Money;
  byCategory: Array<{ category: ChargeCategoryKey; amount: Money; flats: number }>;
  byType: Array<{ type: UnitTypeCode; flats: number; amount: Money }>;
}

export interface BillingRun {
  id: string;
  ref: string;
  siteId: string;
  siteName: string;
  /** YYYY-MM */
  period: string;
  state: BillingRunState;
  postingVersion: number;
  issueDate: string;
  dueDate: string;
  createdBy: string;
  createdByName: string;
  submittedBy?: string;
  approvedBy?: string;
  approvedByName?: string;
  /** Rules, exemptions, flats or payers changed after the preview: it must be generated again. */
  stale: boolean;
  previewedAt?: string;
  totals: BillingRunTotals | null;
  history: BillingRunEvent[];
  postedAt?: string;
  notified?: { notices: number; at: string };
}

export interface BillingRunItem {
  id: string;
  unitId: string;
  unitCode: string;
  buildingCode: string;
  type: UnitTypeCode;
  occupancy: OccupancyStatus;
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  lines: ResolvedCharge[];
  total: Money;
  exempt: boolean;
  /** hash(site, account, unit, period, rules, posting version): posting it twice is a no-op. */
  idempotencyKey: string;
  invoiceId?: string;
  invoiceRef?: string;
}

/** A check shown before submit or approval (each links to what it is about). */
export interface RunCheck {
  key: 'flats_billed' | 'exempt' | 'no_payer' | 'opening_balances' | 'stale' | 'declared_flats' | 'rules';
  state: 'ok' | 'warn' | 'block';
  count?: number;
}

export interface BillingRunDetail {
  run: BillingRun;
  items: BillingRunItem[];
  checks: RunCheck[];
  /** What the signed-in person may do now, and why not (server-decided, never only hidden). */
  actions: Partial<Record<BillingRunAction, { allowed: boolean; reason?: 'maker_checker_required' | 'stale_preview' | 'permission_missing' | 'invalid_transition' | 'posting_policy' }>>;
}

export interface BillingRunCreateResult {
  run: BillingRun;
}

export interface PostResult {
  run: BillingRun;
  invoiceIds: string[];
  /** True when this call found the run already posted and returned the same invoices. */
  replayed: boolean;
}

// ---------------------------------------------------------------------------------------------
// Invoices, credit notes and statements (shared receivables engine, A2 §5)
// ---------------------------------------------------------------------------------------------

export type InvoiceSource = 'billing_run' | 'opening_balance' | 'installment_schedule' | 'manual' | 'service' | 'penalty' | 'transfer_fee';

export interface InvoiceLine {
  id: string;
  kind: 'charge' | 'opening_balance';
  category?: ChargeCategoryKey;
  unitId: string;
  unitCode: string;
  period: string;
  amount: Money;
  credited: Money;
  /** Settled by payments (derived when read; stored lines never change). */
  allocated: Money;
  /** The account this flat's line is billed to (an invoice may group lines of several accounts). */
  billingAccountId: string;
  sourceType: InvoiceSource;
  sourceId: string;
  postingVersion: number;
  idempotencyKey: string;
  /** Liable party for this flat on the line's period (resolved per unit, I-5). */
  payerPartyId: string;
  payerName: string;
  /** Which rule produced the line (billing runs). */
  rule?: RuleRef;
}

export interface CustomerInvoice {
  id: string;
  ref: string;
  legalEntityId: string;
  legalEntityName: string;
  siteId: string;
  billingAccountId: string;
  accountNo: string;
  payerPartyId: string;
  payerName: string;
  source: InvoiceSource;
  runId?: string;
  runRef?: string;
  period: string;
  issuedOn: string;
  dueOn: string;
  issuance: 'issued';
  lines: InvoiceLine[];
  total: Money;
  credited: Money;
  /** Settled by verified payments (derived when read from their allocations). */
  allocated: Money;
  outstanding: Money;
  settlement: 'unpaid' | 'partially_paid' | 'paid' | 'credited';
  overdue: boolean;
}

export interface CreditNote {
  id: string;
  ref: string;
  invoiceId: string;
  invoiceRef: string;
  billingAccountId: string;
  on: string;
  amount: Money;
  lines: Array<{ invoiceLineId: string; category?: ChargeCategoryKey; unitCode: string; amount: Money }>;
  /** As entered (required). */
  reason: string;
  createdBy: string;
  createdByName: string;
}

export interface InvoiceRow {
  id: string;
  ref: string;
  source: InvoiceSource;
  period: string;
  accountNo: string;
  billingAccountId: string;
  flats: string[];
  payerName: string;
  total: Money;
  credited: Money;
  outstanding: Money;
  settlement: CustomerInvoice['settlement'];
  issuedOn: string;
  dueOn: string;
  overdue: boolean;
}

export interface InvoiceList {
  items: InvoiceRow[];
  total: number;
  totals: { billed: Money; credited: Money; outstanding: Money };
}

export interface InvoiceDetail {
  invoice: CustomerInvoice;
  creditNotes: CreditNote[];
  payee: Beneficiary | null;
  /** Verified payments that settle this invoice's lines. */
  payments: Array<{ id: string; ref: string; receiptId: string; receiptRef: string; amount: Money; receivedOn: string; method: CollectionMethod }>;
  /** The account's statement balance today (the previous balance is not an invoice line). */
  accountBalance: Money;
  actions: { creditNote: boolean; edit: false };
}

export interface StatementEntry {
  on: string;
  /** Gate S.1: 'payment_reversal' re-charges a reversed payment (a cheque returned after clearing). */
  kind: 'opening_balance' | 'invoice' | 'credit_note' | 'payment' | 'payment_reversal';
  ref: string;
  refId: string;
  period?: string;
  flats: string[];
  payerName?: string;
  method?: CollectionMethod;
  debit?: Money;
  credit?: Money;
  balance: Money;
}

/** Derived, never stored (A2 §5). The previous balance stays separate from the period's charges. */
export interface Statement {
  billingAccountId: string;
  accountNo: string;
  holderName: string;
  /** Restricted to one payer's lines (per-unit liability), when asked. */
  payer?: { partyId: string; name: string };
  /** Restricted to one flat's lines, when asked (Flat 360). */
  flat?: { id: string; code: string };
  from: string;
  to: string;
  previousBalance: Money;
  entries: StatementEntry[];
  periodCharges: Money;
  periodCredits: Money;
  closingBalance: Money;
}

// ---------------------------------------------------------------------------------------------
// Society dashboard (HOME-001 society composition)
// ---------------------------------------------------------------------------------------------

/** A dashboard figure: always linked to its records, or explicitly a later gate (never decorative). */
export type DashboardLink = { href: string } | { later: string };

export interface SocietyTask {
  key:
    | 'import_flats'
    | 'approve_opening_balances'
    | 'approve_exemptions'
    | 'create_run'
    | 'preview_run'
    | 'submit_run'
    | 'approve_run'
    | 'post_run'
    | 'notify_run'
    | 'stale_run'
    | 'returned_run'
    | 'finish_setup'
    | 'review_proofs'
    | 'proofs_waiting_resident'
    | 'reconcile_bank'
    | 'approve_beneficiary'
    | 'approve_payer_changes'
    | 'approve_payment_exceptions'
    | 'proofs_awaiting_bank'
    | 'apply_credit'
    // Gate D.1: exports waiting for a second person, invitations that ran out, household requests.
    | 'approve_data_exports'
    | 'portal_invitations_expired'
    | 'household_requests'
    // D.1/S.1 integration (D-46): office cash waiting for a second person's count.
    | 'count_office_cash';
  urgency: 'urgent' | 'normal';
  count?: number;
  /** Who acts: the signed-in person can act, or waits for another person. */
  yours: boolean;
  href: string;
  period?: string;
}

export interface SocietyDashboard {
  site: { id: string; name: string; legalEntityName: string };
  period: string;
  mode: SocietyDemoMode;
  billing: {
    run: { id: string; ref: string; state: BillingRunState; stale: boolean } | null;
    billed: Money;
    invoices: number;
    exempt: number;
    href: string;
  };
  outstanding: { amount: Money; accounts: number; href: string };
  arrears: { amount: Money; accounts: number; href: string };
  /** Collections (C.2): every figure opens its filtered records. Null when the person may not see money. */
  collections: CollectionsSummary | null;
  approvals: { count: number; yours: number; href: string; items: Array<{ kind: 'billing_run' | 'exemption' | 'opening_balances' | 'payer_change' | 'beneficiary' | 'payment_exception' | 'data_export' | 'approval_request' | 'cash_count'; id: string; label: string; href: string; yours: boolean }> };
  occupancy: { registered: number; occupied: number; ownerOccupied: number; tenantOccupied: number; vacant: number; association: number; declared: number; href: string };
  buildings: Array<{ id: string; code: string; name: string; flats: number; occupied: number; vacant: number; ownerOccupied: number; tenantOccupied: number; association: number; outstanding: Money; arrearsAccounts: number; href: string }>;
  tasks: SocietyTask[];
  topArrears: Array<{ accountId: string; accountNo: string; holderName: string; flats: string[]; amount: Money; href: string }>;
  setup: { done: number; total: number; next?: SetupStep };
  /** Areas of a society that arrive in later gates, listed honestly with their gate. */
  later: Array<{ key: 'online_payments' | 'maintenance' | 'visitors' | 'notices' | 'late_fees'; gate: string }>;
}

/** One entry of the society's audit trail (who did what, to which record, with the values used). */
export interface SocietyAuditEntry {
  id: string;
  at: string;
  by: string;
  byName: string;
  /** Translation key under `billing:audit.actions`. */
  action: string;
  target: { kind: 'site' | 'flat' | 'account' | 'run' | 'invoice' | 'rule' | 'exemption' | 'import' | 'opening_balances' | 'submission' | 'payment' | 'bank' | 'beneficiary' | 'settings' | 'payer_change' | 'voucher' | 'transfer' | 'cheque' | 'batch' | 'period' | 'cash_count' | 'approval' | 'policy' | 'delegation' | 'committee' | 'reminder' | 'ownership_transfer' | 'certificate'; id: string; label: string };
  flats?: string[];
  /** Values for the message (as entered or formatted by the server). */
  values?: Record<string, string>;
}
