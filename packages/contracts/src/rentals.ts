import type { Money } from './money';

/**
 * Gate S.3 rentals (RNT-001…009, PORTAL-037): an optional, site-licensed `rentals` add-on for a
 * property manager. Fictional records are seeded for Riverbend Estate Managers (Demo) only, on two of
 * its three sites (Riverbend Heights and Riverbend Court; Riverbend Villas is not licensed).
 *
 * The issuing model comes from each owner's management agreement and is never assumed (D-33, open
 * until a legal and tax adviser rules before Gate H):
 * - **agent**: the manager issues as agent for the owner, into a client-money account with an owner
 *   sub-ledger;
 * - **principal**: the owner's own client legal entity issues, into the owner's own verified account.
 * Both are labelled fictional alternatives.
 *
 * Five things never mix:
 * - a **lease** (a contract) and its **rent schedule** (what the tenant owes, by version);
 * - an **approved rent roll** (a demand schedule) and an **invoice** (none exist: the shared C.1/C.2
 *   invoice engine has no lease billing subject yet, so posting is refused and nothing is created);
 * - an invoice, **collected rent** and **bank-settled cash** (no settlement evidence path exists in
 *   this gate: every amount stays "not settled — no evidence");
 * - **deposits** (a liability held for the tenant, never owner income or distributable cash);
 * - an **owner payout instruction** (prepared, approved, never sent or paid here) and a settlement
 *   (only a matched statement line on the paying client-money account could settle it; no such route).
 * The owner payable is worked out on settled money only, so it stays 0.00 until evidence exists.
 * Rent is its own billing kind with its own payer account (kind `lease`), never the society
 * maintenance-dues account. Money is a decimal string with its currency.
 */

export const LEASE_STATES = ['draft', 'review', 'active', 'ended', 'terminated', 'cancelled'] as const;
export type LeaseState = (typeof LEASE_STATES)[number];

/** The lease list's filters: active, active and ending within 60 days, drafts (draft or review), ended (ended or terminated). */
export const LEASE_FILTERS = ['all', 'active', 'ending', 'draft', 'ended'] as const;
export type LeaseFilter = (typeof LEASE_FILTERS)[number];

export const ISSUING_MODELS = ['agent', 'principal'] as const;
export type IssuingModel = (typeof ISSUING_MODELS)[number];

/** What stops a lease in review from being activated (each is explained and fixed elsewhere first). */
export const LEASE_BLOCKERS = ['agreement_missing', 'agreement_unsigned', 'no_collection_authority', 'account_unverified', 'mixed_models', 'model_mismatch', 'authority_missing', 'overlap', 'shares', 'not_owner', 'starts_too_early'] as const;
export type LeaseBlocker = (typeof LEASE_BLOCKERS)[number];

/** Rent and settlement: nothing in this gate is ever settled. */
export type RentSettlement = 'not_settled';

/** Where an agreed deposit is held (a liability for the tenant in either case). */
export const DEPOSIT_HOLDINGS = ['client_deposit_account', 'owner_account'] as const;
export type DepositHolding = (typeof DEPOSIT_HOLDINGS)[number];

export const ROLL_STATES = ['not_prepared', 'draft', 'approved'] as const;
export type RollState = (typeof ROLL_STATES)[number];

export const STATEMENT_STATES = ['draft', 'issued'] as const;
export type StatementState = (typeof STATEMENT_STATES)[number];

/** An owner payout instruction: prepared → approved ("Approved instruction — not sent"), or rejected / cancelled. */
export const PAYOUT_STATES = ['awaiting_approval', 'approved', 'rejected', 'cancelled'] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

/** Why an owner has nothing that can be instructed. */
export const PAYOUT_HOLDS = ['no_settled_money', 'principal_model', 'no_collection_authority', 'beneficiary_unverified', 'other_sites'] as const;
export type PayoutHold = (typeof PAYOUT_HOLDS)[number];

export const AGREEMENT_VERSION_STATES = ['draft', 'scheduled', 'active', 'superseded'] as const;
export type AgreementVersionState = (typeof AGREEMENT_VERSION_STATES)[number];

/** Read-only notice templates of the settings screen (fictional samples). */
export const RENT_TEMPLATES = ['renewal_reminder', 'termination_notice', 'statement_cover'] as const;
export type RentTemplate = (typeof RENT_TEMPLATES)[number];

/** Why rent cannot be posted to invoices (RNT-004 PARTIAL). */
export const POSTING_NEEDS = ['lease_subject', 'payer_account', 'numbering', 'idempotent_source'] as const;
/** What an outgoing settlement would need (RNT-006 PARTIAL). */
export const SETTLEMENT_NEEDS = ['client_account', 'statement_line', 'match', 'exception', 'reversal'] as const;

export interface RentEvent {
  at: string;
  by: string;
  byName: string;
  /** Key under `rentals:history.*`. */
  action: string;
  /** Free text exactly as typed (never translated). */
  note?: string;
  values?: Record<string, string>;
}

export interface RentSite {
  id: string;
  name: string;
  code: string;
}

export interface LeaseLandlord {
  ownerId: string;
  name: string;
  /** Percentage share of the rent, "50.00". */
  share: string;
}

export interface LeaseSummary {
  id: string;
  ref: string;
  state: LeaseState;
  /** Active and ending (or terminating) within 60 days. */
  ending: boolean;
  unitId: string;
  unitCode: string;
  siteId: string;
  siteName: string;
  tenantName: string;
  landlords: LeaseLandlord[];
  model: IssuingModel;
  rent: Money;
  from: string;
  to: string;
  terminationDate?: string;
  deposit: Money;
}

export interface LeasesList {
  items: LeaseSummary[];
  counts: Record<LeaseFilter, number>;
  kpis: {
    active: number;
    /** Monthly rent of active leases (a contract figure, never money received). */
    rentUnderManagement: Money;
    /** The current month's approved rent roll: a demand, not invoiced and not collected. */
    dueThisMonth: Money;
    dueMonth: string;
    rollState: RollState;
    /** Owner payable on a settled basis (settled money only): 0.00 while nothing can be settled. */
    ownerPayableSettled: Money;
    /** Payout instructions awaiting approval or approved (not sent). */
    pendingPayouts: number;
  };
  /** The rentals sites the reader may see (the site filter). */
  sites: RentSite[];
  /** The reader sees some of the licensed rentals sites only. */
  scopeLimited: boolean;
  canCreate: boolean;
  today: string;
}

export interface LeaseExport {
  scopeLimited: boolean;
  rows: Array<{ ref: string; state: LeaseState; unit: string; site: string; tenant: string; landlords: string; model: IssuingModel; rent: string; from: string; to: string; deposit: string }>;
}

export interface LeaseVersionView {
  n: number;
  from: string;
  to: string;
  rent: Money;
  dueDay: number;
  /** Key under `rentals:version.*`. */
  reason: 'created' | 'renewed';
  byName: string;
  at: string;
  /** The agreement version each landlord's terms were bound to (a later agreement version never rewrites it). */
  agreements: Array<{ ref: string; version: number; ownerName: string }>;
}

export interface ScheduleLine {
  period: string;
  dueDate: string;
  amount: Money;
  version: number;
  /** Whether a rent roll for the period holds the line (an approved roll is a demand, not an invoice). */
  roll: RollState;
  settlement: RentSettlement;
}

export interface LeaseAgreementRef {
  ownerId: string;
  ownerName: string;
  share: string;
  agreementId?: string;
  agreementRef?: string;
  version?: number;
  model?: IssuingModel;
  signed: boolean;
}

export interface LeaseIssuing {
  model: IssuingModel;
  /** Who issues: the manager (as agent for the owners) or the owner's own client legal entity. */
  entityName: string;
  account: { kind: 'client_money' | 'owner_account'; label: string; last4: string; verified: boolean };
  /** Agent model: the owners' sub-ledger references inside the client-money account. */
  subLedgers: string[];
}

export interface LeaseView {
  id: string;
  ref: string;
  state: LeaseState;
  ending: boolean;
  unit: { id: string; code: string; siteId: string; siteName: string; kind: 'flat' | 'plot' };
  tenant: { partyId: string; name: string };
  landlords: LeaseAgreementRef[];
  terms: { from: string; to: string; rent: Money; dueDay: number; deposit: Money; terminationDate?: string; terminationReason?: string };
  issuing: LeaseIssuing | null;
  /** The lease's own payer account (kind lease), never the society maintenance account. */
  billingAccount: { ref: string; kind: 'lease' } | null;
  authority?: { reference: string; date: string; recordedByName: string; at: string };
  versions: LeaseVersionView[];
  schedule: ScheduleLine[];
  /** Posted invoices: none can exist (posting is not connected). */
  invoices: never[];
  deposit: { agreed: Money; heldEvidenced: Money; holding: DepositHolding | null; state: 'awaiting_evidence' | 'none'; refund: { due: boolean; refundable: Money; reason: 'no_evidence' | 'not_due' } };
  subLedger: { applicable: boolean; refs: string[]; settled: Money };
  /** Other leases of the same unit (the unit's letting history). */
  unitLeases: Array<{ id: string; ref: string; state: LeaseState; tenantName: string; from: string; to: string }>;
  draftedByName: string;
  draftedAt: string;
  submittedByName?: string;
  activatedByName?: string;
  activatedAt?: string;
  history: RentEvent[];
  blockers: LeaseBlocker[];
  actions: { submit: boolean; activate: boolean; cancel: boolean; renew: boolean; terminate: boolean; authority: boolean };
  /** Why an action the reader could otherwise take is not available. */
  blocked?: 'own_draft' | 'blockers' | 'not_active';
}

/** The new-lease wizard's choices (units and people the reader may use). */
export interface LeaseOptions {
  units: Array<{
    id: string;
    code: string;
    siteId: string;
    siteName: string;
    owners: Array<{ ownerId: string; name: string; share: string; agreement?: { ref: string; model: IssuingModel; signed: boolean; inForce: boolean } }>;
    /** An active or proposed lease already covers the unit (its reference). */
    current?: { ref: string; to: string };
  }>;
  tenants: Array<{ partyId: string; name: string; ref: string }>;
  today: string;
}

export interface LeaseDraftInput {
  unitId: string;
  landlords: Array<{ ownerId: string; share: string }>;
  tenantPartyId: string;
  model: IssuingModel;
  from: string;
  to: string;
  rent: string;
  dueDay: number;
  deposit: string;
  authority?: { reference: string; date: string; confirmed: boolean };
}

export interface LeaseRenewInput {
  to: string;
  rent: string;
  reason: string;
}

export interface LeaseTerminateInput {
  date: string;
  reason: string;
}

export interface LeaseAuthorityInput {
  reference: string;
  date: string;
  confirmed: boolean;
}

export interface RollLineView {
  /** Idempotency of a rent line: lease, period and schedule version. */
  key: string;
  leaseId: string;
  leaseRef: string;
  unitCode: string;
  siteId: string;
  siteName: string;
  tenantName: string;
  landlords: string[];
  model: IssuingModel;
  amount: Money;
  dueDate: string;
  leaseVersion: number;
  billingKind: 'rent';
  payerAccountRef: string;
  settlement: RentSettlement;
}

export interface RentRollView {
  period: string;
  state: RollState;
  version: number;
  /** Leases changed since the roll was previewed: preview again before approval. */
  stale: boolean;
  lines: RollLineView[];
  totals: { amount: Money; lines: number };
  scopeLimited: boolean;
  preparedByName?: string;
  preparedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNote?: string;
  makers: string[];
  posting: { available: false; needs: readonly string[] };
  history: RentEvent[];
  actions: { preview: boolean; approve: boolean };
  blocked?: 'other_sites' | 'own_roll' | 'stale' | 'period_not_allowed';
  periods: Array<{ period: string; state: RollState }>;
  today: string;
}

export const STATEMENT_LINE_KINDS = ['rent_due', 'rent_settled', 'management_fee', 'owner_expense', 'deposit_held', 'payout_pending', 'payout_settled'] as const;
export type StatementLineKind = (typeof STATEMENT_LINE_KINDS)[number];

export interface StatementLineView {
  kind: StatementLineKind;
  siteId: string;
  siteName: string;
  unitCode?: string;
  leaseId?: string;
  leaseRef?: string;
  /** Settled lines count toward the closing payable; memo lines never do. */
  basis: 'settled' | 'memo';
  amount: Money;
  /** The record behind the line (every line opens its source). */
  source: { kind: 'rent_roll' | 'lease' | 'expense' | 'payout'; id: string; ref: string };
  /** Free text of the source (an expense's description), exactly as recorded. */
  text?: string;
  /** Key under `rentals:statement.state.*`. */
  state: 'approved_demand' | 'settled' | 'approved_unpaid' | 'awaiting_evidence' | 'approved_not_sent' | 'awaiting_approval';
}

export interface StatementBody {
  owner: { id: string; name: string; ref: string };
  period: string;
  model: IssuingModel;
  agreement: { ref: string; version: number; feePct: string };
  lines: StatementLineView[];
  /** Settled basis: closing = opening + settled rent − fees − settled expenses − settled payouts. */
  totals: { opening: Money; settledRent: Money; fees: Money; settledExpenses: Money; settledPayouts: Money; closing: Money };
  /** Shown apart, never in the closing payable. */
  memo: { rentDue: Money; expensesApproved: Money; depositsAgreed: Money; depositsHeld: Money; pendingPayouts: Money };
}

export interface OwnerStatementView extends StatementBody {
  id?: string;
  ref?: string;
  state: StatementState;
  scopeLimited: boolean;
  issuedByName?: string;
  issuedAt?: string;
  history: RentEvent[];
  /** `issue` needs `owner_statement.issue` (Issue #17, R4): reading a statement never publishes it. */
  actions: { issue: boolean };
  /** `issue_permission`: the statement could be issued, but not by this reader (they may read and print it). */
  blocked?: 'other_sites' | 'future_period' | 'already_issued' | 'issue_permission';
}

export interface OwnerStatementsList {
  owners: Array<{ id: string; ref: string; name: string; model: IssuingModel | null; sites: string[]; scopeLimited: boolean; issued: Array<{ id: string; ref: string; period: string }> }>;
  periods: string[];
  today: string;
}

export interface OwnerStatementIssueInput {
  ownerId: string;
  period: string;
}

export interface PayoutView {
  id: string;
  ref: string;
  ownerId: string;
  ownerName: string;
  amount: Money;
  /** The owner's masked account: for those who prepare or approve payouts only (Issue #18: bank details are confidential). */
  beneficiary?: { bankName: string; last4: string; verified: boolean };
  state: PayoutState;
  settlement: RentSettlement;
  note: string;
  preparedByName: string;
  preparedAt: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectReason?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: RentEvent[];
  actions: { approve: boolean; reject: boolean; cancel: boolean };
  blocked?: 'own_instruction' | 'own_record' | 'exceeds_available';
}

export interface PayoutsView {
  owners: Array<{
    id: string;
    ref: string;
    name: string;
    model: IssuingModel | null;
    /** Whole-owner money: absent for a reader who sees only some of the owner's sites. */
    closing?: Money;
    pending?: Money;
    available?: Money;
    holds: PayoutHold[];
    canPrepare: boolean;
    beneficiary?: { bankName: string; last4: string; verified: boolean };
  }>;
  instructions: PayoutView[];
  counts: Record<PayoutState, number>;
  /** Outgoing settlement: not available in this gate (no evidence path). */
  settlementAvailable: false;
  scopeLimited: boolean;
}

export interface PayoutInput {
  ownerId: string;
  amount: string;
  note: string;
}

export interface AgreementVersionView {
  n: number;
  state: AgreementVersionState;
  effectiveFrom: string;
  model: IssuingModel;
  signed: { reference: string; date: string } | null;
  collectOnBehalf: boolean;
  feePct: string;
  depositHolding: DepositHolding;
  depositMaxMonths: number;
  account: { kind: 'client_money' | 'owner_account'; label: string; last4: string; verified: boolean };
  subLedger?: string;
  issuingEntityName: string;
  draftedByName: string;
  draftedAt: string;
  approvedByName?: string;
  approvedAt?: string;
  note?: string;
  /** Leases whose terms are bound to this version (later versions never rewrite them). */
  boundLeases: string[];
}

export interface AgreementView {
  id: string;
  ref: string;
  owner: { id: string; name: string };
  sites: string[];
  versions: AgreementVersionView[];
  scopeLimited: boolean;
  actions: { draft: boolean; approve: boolean };
  blocked?: 'other_sites' | 'own_draft';
}

export interface RentalSettings {
  agreements: AgreementView[];
  templates: RentTemplate[];
  /** The fee rules (feature rentals.management_fees). */
  feesLicensed: boolean;
  canConfigure: boolean;
  today: string;
}

export interface AgreementVersionInput {
  effectiveFrom: string;
  model: IssuingModel;
  feePct: string;
  depositHolding: DepositHolding;
  depositMaxMonths: number;
  collectOnBehalf: boolean;
  signedReference: string;
  signedDate: string;
  note: string;
}

export interface LandlordProperty {
  unitId: string;
  unitCode: string;
  siteName: string;
  share: string;
  lease?: { ref: string; tenantName: string; from: string; to: string; rent: Money; period: string; roll: RollState; settlement: RentSettlement };
  deposit?: { agreed: Money; heldEvidenced: Money };
}

/**
 * PORTAL-037: a landlord's own verified, let properties and their issued statements (Rule R). Issue #17
 * (P0): for an owner some of whose rentals sites this landlord may not see here, a statement is a
 * labelled partial statement (`scopeLimited`: the permitted sites' lines and totals only), a statement
 * with no permitted site is not listed at all, and no owner-wide figure (payout instructions) is sent.
 */
export interface LandlordView {
  name: string;
  properties: LandlordProperty[];
  statements: Array<{ id: string; ref: string; period: string; closing: Money; issuedAt: string; scopeLimited: boolean }>;
  payouts: { settled: never[]; pending: Array<{ ref: string; amount: Money; state: PayoutState }> };
  today: string;
}
