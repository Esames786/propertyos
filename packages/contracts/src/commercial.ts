import type { ModuleKey, TenantStatus } from './access';
import type { Money } from './money';
import type {
  CommercialPolicy,
  CommercialRuleKey,
  ContractApproval,
  ContractDraft,
  DependencyCheckResult,
  EditionKey,
  ModuleCatalogEntry,
  ModuleSelection,
  QuoteLine,
  QuotePreview,
  RateCard,
  SignupPolicy,
  SubscriptionContract,
  UsageDimension,
} from './platform';

/**
 * Gate B (remaining scope, owner review of checkpoint 2): commercial configuration that Platform HQ
 * versions instead of hard-coding. Rate cards, the commercial approval policy, the module catalogue
 * and the signup policy are each a series of versions. Supreme Admin drafts and schedules a version;
 * a different person approves it (principal ids compared); a version applies from its effective date,
 * and the builder, quote, simulator, contract and entitlement checks all read the version in force
 * on the relevant date. Every threshold here is ILLUSTRATIVE seed data, never a constant in code.
 */
export const CONFIG_KINDS = ['rate_card', 'commercial_policy', 'catalogue', 'signup_policy'] as const;
export type ConfigKind = (typeof CONFIG_KINDS)[number];

/** A different limit for one edition, until a date (e.g. longer free terms for associations). */
export interface PolicyException {
  id: string;
  edition: EditionKey;
  rule: CommercialRuleKey;
  /** The limit that replaces the policy's for this edition (same unit as the rule). */
  limit: number;
  until?: string;
  reason: string;
}

export interface CommercialPolicyConfig extends CommercialPolicy {
  /** Platform roles whose holders may approve a flagged contract (never its own author). */
  approverRoles: readonly string[];
  exceptions: readonly PolicyException[];
}

export interface SignupPolicyConfig {
  /** How each edition's workspaces start (D-8). */
  byEdition: Record<EditionKey, SignupPolicy>;
  /** Length of a self-service trial. */
  trialDays: number;
  /** Self-service trials above this many units go to approval instead. */
  maxSelfServiceUnits: number;
  requireVerifiedEmail: boolean;
}

export type ConfigPayload =
  | { kind: 'rate_card'; rateCard: RateCard }
  | { kind: 'commercial_policy'; policy: CommercialPolicyConfig }
  | { kind: 'catalogue'; modules: readonly ModuleCatalogEntry[] }
  | { kind: 'signup_policy'; signup: SignupPolicyConfig };

/** Stored lifecycle; what a reader sees as "scheduled / in force / superseded" is derived from dates. */
export type ConfigState = 'draft' | 'pending_approval' | 'approved' | 'returned' | 'withdrawn';
export type ConfigDisplayStatus = 'draft' | 'pending_approval' | 'returned' | 'withdrawn' | 'scheduled' | 'in_force' | 'superseded';

export interface ConfigChange {
  /** Dotted path of what changed (e.g. `lines.rc_site.unitPrice`, `maxDiscountPct`). */
  path: string;
  before: string;
  after: string;
}

export interface ConfigVersion {
  id: string;
  kind: ConfigKind;
  version: number;
  /** Readable label, e.g. "cp-2026.11-2". */
  label: string;
  state: ConfigState;
  status: ConfigDisplayStatus;
  effectiveFrom: string;
  payload: ConfigPayload;
  /** Why the change is made (required to submit). */
  reason: string;
  /** Version this one was drafted from. */
  basedOn: string | null;
  changes: readonly ConfigChange[];
  createdBy: string;
  createdById: string;
  createdAt: string;
  submittedAt?: string;
  decidedBy?: string;
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
}

export interface ConfigOverview {
  kind: ConfigKind;
  /** The version in force today. */
  current: ConfigVersion;
  versions: readonly ConfigVersion[];
  /** The signed-in person may draft, submit and withdraw (Supreme Admin). */
  canManage: boolean;
  /** The signed-in person may approve or return versions they did not author. */
  canApprove: boolean;
}

// ---------------------------------------------------------------- workspace requests (D-8)

export interface WorkspaceRequestDecision {
  decision: 'contacted' | 'approved' | 'declined' | 'converted';
  note?: string;
}

export interface WorkspaceRequestDetail {
  id: string;
  status: 'new' | 'contacted' | 'approved' | 'declined' | 'converted';
  /** What the signup policy in force says should happen with a request like this one. */
  policyOutcome: SignupPolicy;
  /** Tenant draft created when the request was approved (continues in the creation wizard). */
  draftId?: string;
  history: ReadonlyArray<{ at: string; actorName: string; actorId: string; status: string; note?: string }>;
}

// ---------------------------------------------------------------- contract amendments (HQ-011, HQ-008)

export interface AmendmentInput {
  /** Grants after the change (modules per site). */
  modules: ModuleSelection[];
  /** Pricing after the change. */
  contract: ContractDraft;
  /** When the change takes effect (a scheduled change when in the future). */
  effectiveFrom: string;
  reason: string;
}

/** Who gains or loses an area, by the tenant's own roles (same evaluation as Preview as client). */
export interface AccessImpact {
  roleId: string;
  roleLabelKey: string;
  holders: number;
  gained: readonly ModuleKey[];
  lost: readonly ModuleKey[];
}

export interface AmendmentImpact {
  dependencies: DependencyCheckResult;
  added: ReadonlyArray<ModuleSelection>;
  removed: ReadonlyArray<ModuleSelection>;
  /** Changed site coverage of a module kept on both sides. */
  resited: ReadonlyArray<{ module: ModuleKey; before: ModuleSelection['sites']; after: ModuleSelection['sites'] }>;
  before: QuotePreview;
  after: QuotePreview;
  /** Regular monthly net, after minus before. */
  delta: Money;
  access: readonly AccessImpact[];
  /** Records of removed modules are kept read-only, never deleted (retention). */
  retention: readonly ModuleKey[];
  /** Policy and rate card versions the impact was evaluated with. */
  evaluatedWith: { policy: string; rateCard: string; catalogue: string };
}

export interface ContractVersionEntry {
  contract: SubscriptionContract;
  /** Grants this version licenses. */
  modules: readonly ModuleSelection[];
  effectiveFrom: string;
  /** Derived for reading: in force today, scheduled for later, or replaced. */
  display: 'in_force' | 'scheduled' | 'superseded' | 'pending_approval' | 'returned' | 'withdrawn';
  reason?: string;
  /** Differences from the version before. */
  changes: readonly ConfigChange[];
  approval?: ContractApproval;
  monthlyNet: Money;
}

export interface ContractHistory {
  tenantId: string;
  versions: readonly ContractVersionEntry[];
}

// ---------------------------------------------------------------- usage meters (HQ-014, HQ-015)

export interface UsageSnapshot {
  id: string;
  tenantId: string;
  dimension: UsageDimension;
  /** Billing month the snapshot belongs to (YYYY-MM). */
  period: string;
  capturedAt: string;
  value: number;
  /** Declared before go-live, or counted by the metering job. */
  source: 'declared' | 'counted';
  status: 'captured' | 'disputed' | 'corrected';
  /** Meter definition version the count followed. */
  definition: string;
  correction?: { from: number; to: number; reason: string; by: string };
}

/** Counted and excluded items behind a count: codes and reasons only, never personal data. */
export interface MeterEvidence {
  snapshotId: string;
  dimension: UsageDimension;
  definition: string;
  definitionTextKey: string;
  counted: ReadonlyArray<{ code: string; site: string }>;
  excluded: ReadonlyArray<{ code: string; site: string; reasonKey: string }>;
  /** Other counts of the same flats, side by side (registered / active / occupied / eligible). */
  sideBySide: ReadonlyArray<{ dimension: UsageDimension | 'units.occupied'; value: number }>;
}

export interface BillingCalculation {
  period: { start: string; end: string };
  lines: readonly QuoteLine[];
  net: Money;
  tax: Money;
  total: Money;
  /** Quantities the calculation used and where each came from. */
  quantities: ReadonlyArray<{ dimension: UsageDimension; value: number; snapshotId: string | null; declared: number | null }>;
  /** Calculated with the same engine and versions as quotes. */
  evaluatedWith: { contract: string; rateCard: string; policy: string };
  nonAuthoritative: true;
}

export interface TenantUsage {
  tenantId: string;
  status: TenantStatus;
  meters: ReadonlyArray<{ dimension: UsageDimension; latest: UsageSnapshot | null; declared: number | null; priced: boolean }>;
  snapshots: readonly UsageSnapshot[];
  billing: BillingCalculation | null;
}

// ---------------------------------------------------------------- commercial audit

export const AUDIT_CATEGORIES = ['tenants', 'contracts', 'grants', 'approvals', 'configuration', 'requests', 'usage', 'previews'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
