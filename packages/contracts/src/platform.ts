import type { EffectiveAccess, FeatureKey, ModuleKey, TenantStatus, TenantType } from './access';
import type { Permission } from './permissions';
import type { Money } from './money';

/**
 * Platform HQ (central plane) contracts, Gate B (A6 §3, A3). Everything here is about the SaaS
 * operator and its tenants' licences and prices; nothing here may carry tenant people or finance
 * records. Prices are calculated by the mock server (fixtures), never in components.
 */

// ---------------------------------------------------------------- catalogue

export const EDITIONS = ['developer', 'community', 'portfolio', 'custom'] as const;
export type EditionKey = (typeof EDITIONS)[number];

export const EDITION_TENANT_TYPE: Record<EditionKey, TenantType> = {
  developer: 'developer',
  community: 'association',
  portfolio: 'portfolio_manager',
  custom: 'custom',
};

export type ModuleCategory = 'foundation' | 'sales' | 'property' | 'finance' | 'community' | 'people' | 'channels';

export interface ModuleCatalogEntry {
  key: ModuleKey;
  category: ModuleCategory;
  /** 'site' modules can be granted to selected sites only. */
  scope: 'tenant' | 'site';
  /** Core is always granted and never priced on its own. */
  alwaysOn: boolean;
  requires: readonly ModuleKey[];
  integrates: readonly ModuleKey[];
  features: readonly FeatureKey[];
  /** Editions whose preset includes the module. */
  includedIn: readonly EditionKey[];
  /** Editions that may add it as a priced add-on. */
  addonFor: readonly EditionKey[];
}

export interface EditionPreset {
  key: EditionKey;
  tenantType: TenantType;
  modules: readonly ModuleKey[];
  /** Rate-card lines pre-filled in the pricing builder. */
  components: readonly string[];
}

export interface ModuleCatalog {
  version: string;
  modules: readonly ModuleCatalogEntry[];
  presets: readonly EditionPreset[];
}

/** A draft grant in the tenant-creation wizard. */
export interface ModuleSelection {
  module: ModuleKey;
  sites: 'all' | readonly string[];
  /** In force from this date (a scheduled change); otherwise from the licence start. */
  from?: string;
}

export interface DependencyIssue {
  module: ModuleKey;
  requires: ModuleKey;
  /** 'missing': required module absent; 'site_gap': granted, but not for every site the dependant uses. */
  kind: 'missing' | 'site_gap';
  sites: 'all' | readonly string[];
}

export interface DependencyCheckResult {
  ok: boolean;
  issues: DependencyIssue[];
  /** Modules (with sites) that would resolve every issue. */
  fixes: ModuleSelection[];
  /** Soft links that will light up because both sides are granted. */
  integrations: Array<{ module: ModuleKey; with: ModuleKey }>;
}

// ---------------------------------------------------------------- pricing

export const COMPONENT_TYPES = [
  'FREE',
  'TRIAL',
  'ONE_TIME',
  'FIXED_RECURRING',
  'PER_SITE',
  'PER_BUILDING',
  'PER_UNIT',
  'PER_SEAT',
  'PER_MODULE',
  'TIERED',
  'USAGE',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const USAGE_DIMENSIONS = [
  'units.registered',
  'units.active',
  'units.occupied',
  'units.eligible',
  'units.licensed_capacity',
  'sites.licensed',
  'buildings.active',
  'seats.staff_active',
  'sms.sent',
  'storage.gb_month',
  'gateway.authorized_events',
  'api.calls',
] as const;
export type UsageDimension = (typeof USAGE_DIMENSIONS)[number];

export type Cadence = 'once' | 'monthly' | 'quarterly' | 'annual';
export type ProrationRule = 'actual_days' | 'thirty_day' | 'none';

export interface PriceTier {
  /** Inclusive upper bound of the band; null = no upper bound. */
  upTo: number | null;
  unitPrice: Money;
}

export interface RateCardLine {
  id: string;
  type: ComponentType;
  dimension?: UsageDimension;
  module?: ModuleKey;
  tierMethod?: 'graduated' | 'volume';
  unitPrice?: Money;
  tiers?: readonly PriceTier[];
  allowance?: number;
  cadence: Cadence;
  /** Lowest unit price allowed without commercial approval (A3 §7.1). */
  floorPrice?: Money;
  editions: readonly EditionKey[];
  /** For TRIAL lines: length in days. */
  trialDays?: number;
}

export interface RateCard {
  id: string;
  version: number;
  effectiveFrom: string;
  currency: 'PKR';
  lines: readonly RateCardLine[];
}

export interface PricingComponent {
  id: string;
  type: ComponentType;
  /** Rate-card line it came from (defaults and floor price). */
  rateCardLineId?: string;
  dimension?: UsageDimension;
  module?: ModuleKey;
  /** Site-scoped component (e.g. an add-on for one site): count only these sites. */
  siteIds?: readonly string[];
  unitPrice?: Money;
  tierMethod?: 'graduated' | 'volume';
  tiers?: readonly PriceTier[];
  allowance?: number;
  /** Fixed or declared quantity (before go-live, counts are declared estimates; A3 §4). */
  quantity?: number;
  cadence: Cadence;
  proration: ProrationRule;
  effectiveFrom: string;
  effectiveTo?: string;
  /** For TRIAL components: length in days. */
  trialDays?: number;
  overrideReason?: string;
}

export interface ContractDiscount {
  id: string;
  /** A component id, or 'recurring' (all recurring components), or 'contract'. */
  target: string;
  kind: 'percent' | 'amount';
  value: string;
  from: string;
  to?: string;
  reason?: string;
}

export interface ContractTerms {
  start: string;
  /** Months; null = rolling. */
  termMonths: number | null;
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  timing: 'advance' | 'arrears';
  minimumMonthly?: Money;
  capMonthly?: Money;
  /** Tax code and rate (percent string) for the quote; configured, never hard-coded (D-10). */
  tax: { code: string; ratePct: string };
}

export interface ContractDraft {
  terms: ContractTerms;
  components: PricingComponent[];
  discounts: ContractDiscount[];
}

export type ContractStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'superseded' | 'ended' | 'cancelled' | 'returned';

export interface SubscriptionContract extends ContractDraft {
  id: string;
  tenantId: string;
  version: number;
  status: ContractStatus;
  createdBy: string;
  createdById: string;
  createdAt: string;
  activatedAt?: string;
  supersedesId?: string;
  /** An amendment applies from this date (version 1 applies from the contract start). */
  effectiveFrom?: string;
}

/** Quantities the engine priced, and where each came from. */
export interface QuoteQuantity {
  dimension: UsageDimension;
  value: number;
  source: 'declared' | 'snapshot' | 'scenario';
  snapshotId?: string;
}

export interface QuoteLine {
  componentId: string;
  type: ComponentType;
  dimension?: UsageDimension;
  module?: ModuleKey;
  quantity: string;
  /** Allowance subtracted before pricing (usage). */
  allowance?: number;
  unitPrice?: Money;
  tierMethod?: 'graduated' | 'volume';
  /** Graduated tiers: the band breakdown. */
  bands?: Array<{ quantity: number; unitPrice: Money; amount: Money }>;
  /** e.g. "15/30" when a recurring component covers part of the period. */
  proration?: { days: number; ofDays: number };
  gross: Money;
  discount: Money;
  net: Money;
  tax: Money;
  total: Money;
}

export interface QuotePeriod {
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, exclusive. */
  end: string;
  lines: QuoteLine[];
  /** Σ gross. */
  subtotal: Money;
  /** Σ discounts (positive amount). */
  discounts: Money;
  adjustments: Array<{ kind: 'minimum' | 'cap'; amount: Money; tax: Money }>;
  /** Σ net + adjustments, before tax. */
  net: Money;
  tax: Money;
  total: Money;
}

export interface QuotePreview {
  /** A preview is never an invoice. */
  nonAuthoritative: true;
  /** The billing period containing the contract start. */
  firstPeriod: QuotePeriod;
  /** The period immediately after the first one. */
  nextPeriod: QuotePeriod;
  /** The first full period without one-time charges: "a typical month". */
  regularPeriod: QuotePeriod;
  /** Totals for the first twelve billing periods (simulator timeline). */
  schedule: Array<{ start: string; end: string; net: Money; total: Money; oneTime: boolean }>;
  /** Twelve months from the start (first period + 11 regular ones), before tax. */
  firstYearValue: Money;
  quantities: QuoteQuantity[];
  approval: ApprovalCheck;
}

// ---------------------------------------------------------------- commercial approvals (D-14)

export const COMMERCIAL_RULES = [
  'discount_above_limit',
  'price_below_floor',
  'free_beyond_trial',
  'onboarding_reduced',
  'term_too_long',
  'first_year_below_minimum',
] as const;
export type CommercialRuleKey = (typeof COMMERCIAL_RULES)[number];

export interface CommercialPolicy {
  version: string;
  maxDiscountPct: number;
  /** A unit price more than this far below the rate-card list price needs approval (unless the line sets its own floor). */
  maxBelowRateCardPct: number;
  maxFreeDays: number;
  maxOnboardingReductionPct: number;
  maxTermMonths: number;
  minFirstYearValue: Money;
}

export interface ApprovalCheck {
  required: boolean;
  reasons: Array<{ rule: CommercialRuleKey; params: Record<string, string> }>;
  policyVersion: string;
}

export interface ContractApproval {
  id: string;
  tenantId: string;
  contractId: string;
  contractVersion: number;
  reasons: ApprovalCheck['reasons'];
  /** Display name at the time, for reading; decisions compare `requestedById`. */
  requestedBy: string;
  /** Principal who asked for approval (maker). */
  requestedById: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'returned';
  decidedBy?: string;
  /** Principal who decided (checker); never the maker. */
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
}

// ---------------------------------------------------------------- tenants

export interface LicensedSite {
  id: string;
  name: string;
  city: string;
  kind: 'residential' | 'mixed' | 'commercial' | 'plots';
  buildings: number;
  /** Declared before go-live (estimate); snapshots replace it afterwards. */
  declaredUnits: number;
}

export type TenantOrigin = 'hq' | 'self_service' | 'request' | 'sales' | 'invitation';

export interface TenantSummary {
  id: string;
  displayName: string;
  legalName: string;
  type: TenantType;
  edition: EditionKey;
  status: TenantStatus;
  contractStatus: ContractStatus | 'none';
  billingStatus: 'current' | 'overdue' | 'disputed' | 'none';
  city: string;
  siteCount: number;
  units: { declared: number; eligible: number | null };
  modules: ModuleKey[];
  mrr: Money;
  createdAt: string;
  trialEndsOn?: string;
  origin: TenantOrigin;
  /** Created in this demo session (not a seeded fixture). */
  createdInSession?: boolean;
}

export interface TenantListResponse {
  items: TenantSummary[];
  total: number;
  counts: Record<TenantStatus | 'awaiting_approval', number>;
}

export interface TenantDetail extends TenantSummary {
  organisation: TenantOrganisation;
  sites: LicensedSite[];
  grants: ModuleSelection[];
  contract: SubscriptionContract | null;
  quote: QuotePreview | null;
  approval: ContractApproval | null;
  audit: PlatformAuditEvent[];
}

export interface TenantOrganisation {
  displayName: string;
  legalName: string;
  city: string;
  timezone: 'Asia/Karachi';
  currency: 'PKR';
  language: 'en-PK' | 'ur-PK';
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/** Wizard state, saved by the mock server step by step so Back, refresh and language changes keep it. */
export interface TenantDraft {
  id: string;
  edition: EditionKey | null;
  organisation: TenantOrganisation | null;
  sites: LicensedSite[];
  modules: ModuleSelection[];
  contract: ContractDraft | null;
  /** Declared quantities before go-live (estimates; snapshots replace them later, A3 §4). */
  quantities: Partial<Record<UsageDimension, number>>;
  /** Wizard step last saved, so "Resume setup" returns to it. */
  step: string;
  updatedAt: string;
}

export interface ActivationResult {
  tenantId: string;
  status: TenantStatus;
  contractStatus: Extract<ContractStatus, 'active' | 'pending_approval'>;
  approvalId?: string;
}

// ---------------------------------------------------------------- onboarding policies (D-8)

export const SIGNUP_POLICIES = ['self_service_trial', 'approval_required', 'invitation_only', 'sales_assisted'] as const;
export type SignupPolicy = (typeof SIGNUP_POLICIES)[number];

export interface WorkspaceRequest {
  id: string;
  kind: 'approval' | 'sales' | 'trial';
  organisation: string;
  contactName: string;
  edition: EditionKey;
  expectedUnits?: number;
  city: string;
  receivedAt: string;
  status: 'new' | 'contacted' | 'approved' | 'declined' | 'converted';
}

// ---------------------------------------------------------------- dashboard, audit, usage

export interface PlatformAuditEvent {
  id: string;
  at: string;
  actorName: string;
  /** Principal id, or 'system' for automatic events. */
  actorId: string;
  /** Translation key under platform:audit.* */
  action: string;
  tenantId?: string;
  tenantName?: string;
  params: Record<string, string>;
  /** What changed, field by field (commercial audit trail). */
  changes?: ReadonlyArray<{ path: string; before: string; after: string }>;
}

export interface HqAttentionItem {
  id: string;
  kind: 'approval' | 'trial_ending' | 'grace' | 'suspended' | 'request' | 'draft';
  tenantId?: string;
  title: string;
  /** Translation key under platform:attention.* plus params. */
  detailKey: string;
  params: Record<string, string>;
  href: string;
  tone: 'warning' | 'danger' | 'info';
}

export interface HqOverview {
  asOf: string;
  tenants: { total: number; byStatus: Record<TenantStatus, number>; byType: Record<TenantType, number>; awaitingApproval: number };
  subscriptions: { paying: number; trials: number; free: number; mrr: Money; arr: Money; mrrPrevious: Money };
  revenue: {
    /** Illustrative platform figures from fixtures (platform finance is Gate G). */
    months: Array<{ month: string; invoiced: Money; collected: Money }>;
    outstanding: Money;
  };
  trials: Array<{ tenantId: string; name: string; endsOn: string; daysLeft: number }>;
  requests: WorkspaceRequest[];
  modules: Array<{ module: ModuleKey; tenants: number }>;
  usage: { sites: number; declaredUnits: number; eligibleUnits: number; staffSeats: number; smsThisMonth: number };
  attention: HqAttentionItem[];
  activity: PlatformAuditEvent[];
  signupPolicy: SignupPolicy;
}

/** Simulator input: a contract plus what-if quantities; the server never stores it. */
export interface PriceScenario {
  contract: ContractDraft;
  quantities: Partial<Record<UsageDimension, number>>;
  edition: EditionKey;
}

/**
 * A contract component pre-filled from a rate-card line (no price arithmetic: the server prices).
 * Used by the builder's "Add component" and by edition presets.
 */
export function componentFromLine(line: RateCardLine, id: string, effectiveFrom: string): PricingComponent {
  return {
    id,
    type: line.type,
    rateCardLineId: line.id,
    ...(line.dimension ? { dimension: line.dimension } : {}),
    ...(line.module ? { module: line.module } : {}),
    ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}),
    ...(line.tierMethod ? { tierMethod: line.tierMethod } : {}),
    ...(line.tiers ? { tiers: line.tiers } : {}),
    ...(line.allowance !== undefined ? { allowance: line.allowance } : {}),
    ...(line.trialDays !== undefined ? { trialDays: line.trialDays } : {}),
    cadence: line.cadence,
    proration: line.cadence === 'once' ? 'none' : 'actual_days',
    effectiveFrom,
  };
}

// ---------------------------------------------------------------- tenant workspace: plan (ADM-023)

/** "Your plan & modules": what a tenant's subscription includes, read-only, from the tenant's side. */
export interface WorkspacePlan {
  tenant: { id: string; name: string; edition: EditionKey; status: TenantStatus; licensedFrom: string };
  sites: ReadonlyArray<{ id: string; name: string; city: string; declaredUnits: number }>;
  modules: ReadonlyArray<{
    key: ModuleKey;
    category: ModuleCategory;
    licensed: boolean;
    alwaysOn: boolean;
    /** Sites the grant covers ('all' = every site); null when not licensed. */
    sites: 'all' | readonly string[] | null;
    /** Licensed by an approved change that starts later (not in force yet). */
    scheduledFrom: string | null;
  }>;
}

/**
 * "My access" (owner decision, CP2 review): what the signed-in staff member can use, for people who
 * are not workspace administrators. No edition, price, contract or unlicensed module is included.
 */
export interface MyAccess {
  organisation: { id: string; name: string; status: TenantStatus };
  person: { displayName: string; roleKey: string };
  /** Areas the person can use: a licensed module in which they hold at least one permission. */
  areas: ReadonlyArray<{
    module: ModuleKey;
    /** 'all' or the sites (by name) the organisation licenses this area for. */
    sites: 'all' | ReadonlyArray<{ id: string; name: string }>;
    permissions: readonly Permission[];
  }>;
  /** Where the person's work is limited to (all projects, or named ones). */
  scope: { kind: 'all' } | { kind: 'projects'; names: readonly string[] } | { kind: 'own' };
}

// ---------------------------------------------------------------- HQ-009 preview as a tenant role

/** A role a tenant's people can hold (template), used to preview what that role sees. */
/** Starter role sets offered when a workspace is created (owner decision, CP2 review). */
export const STARTER_ROLE_SETS = {
  developer: ['administration', 'sales', 'project_management', 'inventory', 'finance', 'construction'],
  society: ['administrator', 'manager', 'treasurer', 'maintenance', 'technician', 'security'],
} as const;
export type StarterRoleKey = (typeof STARTER_ROLE_SETS)[keyof typeof STARTER_ROLE_SETS][number];

/**
 * A role a tenant defines for its staff. Every workspace starts from a starter set for its kind of
 * organisation and then owns its roles: it may rename them, change what they include, or add its
 * own. The permissions here are what the role's holders get, so Platform HQ's preview of a role is
 * the effective access of its people, never a separate allow-list. Portal (resident) roles are not
 * staff roles; they are previewed in the customer PWA gate.
 */
export interface TenantRoleTemplate {
  /** Unique within the tenant (used in preview addresses: ?role=sales). */
  id: string;
  tenantId: string;
  /** The starter it came from, or null for a role the tenant defined itself. */
  starter: StarterRoleKey | null;
  /** Translation key for the role title (tenant-defined names are free text in production). */
  labelKey: string;
  permissions: readonly Permission[];
  /** Staff holding the role in the demo (their permissions are this role's). */
  holders: readonly string[];
}

/**
 * HQ-009 "Preview as client": a tenant's licence evaluated for one of its roles. It carries the
 * effective access only, so Platform HQ can draw the client's real menus and availability; it never
 * contains tenant records (AB-8), and nobody is signed in as the client.
 */
export interface PreviewSession {
  tenant: { id: string; name: string; type: TenantType; edition: EditionKey; status: TenantStatus };
  role: TenantRoleTemplate;
  roles: readonly TenantRoleTemplate[];
  access: EffectiveAccess;
  /** The modules were changed for a what-if; nothing is saved and the tenant is unchanged. */
  whatIf: boolean;
  /** Dependency check of the previewed modules (a what-if may break a requirement). */
  dependencies: DependencyCheckResult;
  /** Always false: a preview never loads tenant records. */
  containsTenantRecords: false;
  /** Evaluation date for effective-dated grants. */
  at: string;
}
