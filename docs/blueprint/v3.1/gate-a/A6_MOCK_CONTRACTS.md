# A6. Proposed mock types, services and API contract

**Gate A output item 7.**
- These are **proposals for Gate B/C**. Nothing here is implemented yet.
- They extend the existing seam from ADR-0001 §2.3, unchanged: pages take typed props, data comes through `ApiTransport`, and the in-process `MockTransport` stands in for the future Laravel API.
- All calculations and state transitions live in the **mock "server"** (`packages/fixtures`), never in React components. The backend owns them later (V2.1 §14).

## 1. Where things go

| Package | New files (proposed) | Contents |
|---|---|---|
| `packages/contracts` | `access.ts` | Module keys, grants, scopes, deny reasons, and the pure `decide()` function |
| | `platform.ts` | Tenant, licensed site, catalogue, contract, components, usage, quote, preview session, audit |
| | `sites.ts` | Site, building, floor, unit core, unit type, ownership/occupancy periods |
| | `billing.ts` | Billing account, charges, rules, billing run, customer invoice (generalized), statement |
| | `payments.ts` | Payment submission, verification, payment, allocation, receipt, bank transaction, beneficiary |
| `packages/fixtures` | `platform/` | Catalogue, rate card, tenants, `pricing.ts` engine + `pricing.vectors.json`, platform handlers |
| | `tenants/alnoor/` | 80-flat society generator (deterministic seed), people, accounts, rules, opening balances, bank feed |
| | `engines/` | `charges.ts` (which rule wins), `billing-run.ts` (state machine, idempotent post), `allocation.ts`, `statement.ts`. Pure functions with unit tests |
| | `handlers/` | `PLATFORM_HANDLERS`, `SITE_HANDLERS`, `BILLING_HANDLERS`, `PAYMENT_HANDLERS`, `PORTAL_DUES_HANDLERS` |
| `apps/platform-hq` | New Vite app (D-1) | HQ shell, routes `/hq/*`, `platform` i18n namespace |

**Compatibility**
- Existing types stay. New ones extend them.
- `Persona.projectScope` stays as a deprecated alias derived from `scopes`.
- Larkspur receives every module grant, so **all 134 existing E2E tests must stay green without edits to their assertions**.

## 2. Access model (`packages/contracts/src/access.ts`)

```ts
export const MODULE_KEYS = [
  'core', 'crm', 'projects', 'inventory', 'sales', 'construction', 'handover', 'receivables', 'dues',
  'residents', 'resident_portal', 'online_payments', 'banking', 'accounting', 'payables', 'procurement',
  'hr', 'payroll', 'maintenance', 'visitors', 'parking', 'amenities', 'communications', 'reports',
  'public_website', 'white_label', 'api_access',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type FeatureKey = `${ModuleKey}.${string}`;

export type TenantType = 'developer' | 'association' | 'portfolio_manager' | 'custom';
export type TenantStatus = 'draft' | 'trial' | 'active' | 'grace' | 'suspended' | 'cancelled' | 'archived';

export interface ModuleGrant {
  module: ModuleKey;
  sites: 'all' | readonly string[];          // 'all' = current and future sites
  from: string;                              // ISO date, inclusive
  to?: string;                               // ISO date, exclusive
  source: 'preset' | 'addon' | 'trial' | 'override';
}

export type AccessScope =
  | { type: 'all' }
  | { type: 'legal_entity' | 'site' | 'building' | 'project' | 'team'; ids: readonly string[] }
  | { type: 'assigned' }                                                   // records assigned to the user
  | { type: 'party'; partyId: string; units: readonly string[]; billingAccounts: readonly string[] }; // residents (verified links only)

export interface EffectiveAccess {
  tenant: { id: string; type: TenantType; status: TenantStatus };
  grants: readonly ModuleGrant[];
  features: readonly FeatureKey[];
  permissions: readonly Permission[];
  scopes: readonly AccessScope[];
  userId: string;
}

export type DenyReason =
  | 'tenant_inactive' | 'tenant_suspended' | 'module_not_licensed' | 'site_not_licensed' | 'feature_not_licensed'
  | 'permission_missing' | 'out_of_scope' | 'state_locked' | 'separation_of_duties';

export interface AccessRequest {
  module: ModuleKey;
  feature?: FeatureKey;
  permission?: Permission;
  siteId?: string;
  record?: { siteId?: string; projectId?: string; buildingId?: string; assignedTo?: string; billingAccountId?: string; unitId?: string };
  state?: { locked?: boolean; makerUserId?: string };   // e.g. posted invoice; billing run creator
  at: string;                                             // evaluation date (effective-dated grants)
  /** Suspension class (A1 §4): undeclared = 'operational' = blocked while suspended. */
  suspension?: 'history_read' | 'settlement' | 'operational';
}
// EffectiveAccess.tenant also carries `suspensionPolicy: { allowSettlement: boolean }` (D-20).

/** Pure, table-tested. Evaluates layers 1–6 in order (A1 §4); the first failure is the reason. */
export declare function decide(access: EffectiveAccess, req: AccessRequest):
  { allowed: true } | { allowed: false; reason: DenyReason };
```

**How it is used**
- **Handlers declare their requirement:** `{ method, pattern, requires: { module, permission?, feature? }, handle }`.
  - `MockTransport` evaluates layers 1–4 before calling a handler. Handlers evaluate layers 5–6 with the record in hand.
  - A refusal raises `ApiProblem { status: 403 | 404, code: <DenyReason>, messageKey }`. `out_of_scope` maps to 404 so other records' existence is not confirmed.
- **UI declarations:**
  - Nav items, Quick create entries, dashboard widgets, palette commands and tour steps declare `requires`.
  - `useAccess()` (in `@repo/ui`) runs the same `decide()` against `GET /access/me` to decide what to render.
  - GLOBAL-012 renders the reason.
- **Exhaustive testing.** `access.vectors.json` holds the table of cases (tenant status × grant × site × permission × scope × state). Those vectors later become the Laravel policy tests.

**Mock context grows from `{ personaId, projectId }` to:**

```ts
export interface MockContext {
  plane: 'platform' | 'tenant';
  tenantId?: string;                         // tenant plane
  personaId: string | null;
  contextId: string;                         // 'all' | site id | project id (header context)
  preview?: { tenantId: string; roleKey: string };   // HQ "preview as role": grants of tenantId, no records
}
```

**DemoStore per tenant**
- Larkspur keeps `demo:store:v1`, so existing sessions and tests behave the same.
- Other tenants use `demo:store:v1:<tenantId>`.
- The platform plane uses `demo:platform:v1`.
- "Reset demo data" resets the current plane and tenant.

## 3. Platform contracts (`platform.ts`, Gate B)

```ts
export interface LicensedSite { id: string; name: string; kind: 'residential' | 'mixed' | 'commercial'; licensedUnits: number; city: string }
export interface TenantSummary {
  id: string; displayName: string; legalName: string; type: TenantType; status: TenantStatus;
  billingStatus: 'current' | 'overdue' | 'disputed' | 'none';
  sites: number; units: { registered: number; eligible: number }; modules: number; mrr: Money; createdAt: string;
}
export interface ModuleCatalogEntry {
  key: ModuleKey; nameKey: string; scope: 'tenant' | 'site'; sellable: boolean;
  requires: readonly ModuleKey[]; integrates: readonly ModuleKey[]; features: readonly FeatureKey[];
  presets: ReadonlyArray<'developer' | 'community' | 'portfolio'>;
}
export interface DependencyCheckResult {
  ok: boolean;
  missing: Array<{ module: ModuleKey; requiredBy: ModuleKey; sites: 'all' | string[] }>;
  suggestions: Array<{ add: ModuleKey; reasonKey: string }>;
}
export interface GrantImpact { usersLosingAccess: number; openItems: Array<{ kindKey: string; count: number }>; jobsStopping: string[] }

export type ComponentType = 'FREE' | 'TRIAL' | 'ONE_TIME' | 'FIXED_RECURRING' | 'PER_SITE' | 'PER_BUILDING' | 'PER_UNIT'
  | 'PER_SEAT' | 'PER_MODULE' | 'PER_FEATURE' | 'TIERED' | 'USAGE' | 'DISCOUNT' | 'MINIMUM' | 'CAP' | 'ALLOWANCE';
export type UsageDimension = 'units.registered' | 'units.active' | 'units.occupied' | 'units.eligible' | 'units.licensed_capacity'
  | 'sites.licensed' | 'buildings.active' | 'seats.staff_active' | 'sms.sent' | 'whatsapp.sent' | 'push.sent'
  | 'storage.gb_month' | 'gateway.authorized_events' | 'api.calls';

export interface PricingComponent {
  id: string; type: ComponentType; labelKey: string;
  dimension?: UsageDimension; scope: { kind: 'tenant' } | { kind: 'site'; siteIds: string[] } | { kind: 'module'; module: ModuleKey };
  method?: 'flat' | 'per_unit' | 'graduated' | 'volume' | 'usage';
  unitPrice?: Money; tiers?: Array<{ upTo: number | null; unitPrice: Money }>;
  allowance?: number; minimum?: Money; cap?: Money;
  cadence: 'once' | 'monthly' | 'quarterly' | 'annual'; timing: 'advance' | 'arrears';
  proration: 'actual_days' | 'thirty_day' | 'none'; taxCode?: string;
  effectiveFrom: string; effectiveTo?: string;
  rateCardLineId?: string; overrideReason?: string;
}
export interface SubscriptionContract {
  id: string; tenantId: string; version: number; status: 'draft' | 'pending_approval' | 'active' | 'superseded' | 'ended' | 'cancelled';
  term: { start: string; end?: string }; components: PricingComponent[];
  discounts: Array<{ id: string; target: string | 'contract'; kind: 'percent' | 'amount' | 'free_months'; value: string; from: string; to?: string }>;
  supersedesId?: string; activatedAt?: string;
}
export interface UsageSnapshot { id: string; tenantId: string; dimension: UsageDimension; period: string; value: number; definitionVersion: string; capturedAt: string; status: 'captured' | 'disputed' | 'corrected' }
export interface MeterEvidence { snapshotId: string; counted: Array<{ unitCode: string; siteName: string }>; excluded: Array<{ unitCode: string; reasonKey: string }>; definitionVersion: string } // no personal data
export interface QuoteLine {
  componentId: string; labelKey: string; basisKey: string; dimension?: UsageDimension; snapshotId?: string;
  quantity: string; unitPrice?: Money; prorationFactor?: string; allowance?: number;
  discount: Money; tax: Money; total: Money; explanationKey: string; params: Record<string, string>;
}
export interface QuotePreview {
  nonAuthoritative: true; period: { start: string; end: string };
  lines: QuoteLine[]; subtotal: Money; discounts: Money; tax: Money; total: Money;
  nextPeriod?: { period: { start: string; end: string }; total: Money };
}
export interface PreviewSession { tenantId: string; roleKey: string; readOnly: true; containsTenantRecords: false; expiresAt: string }

// Commercial approvals (D-14, A3 §7.1)
export interface ApprovalCheck { required: boolean; reasons: Array<{ ruleKey: string; params: Record<string, string> }>; policyVersion: string }
export interface ContractApproval { id: string; contractId: string; contractVersion: number; reasons: ApprovalCheck['reasons']; requestedBy: string; requestedAt: string; status: 'pending' | 'approved' | 'returned'; decidedBy?: string; decidedAt?: string; comment?: string }

// Onboarding policies (D-8, A1 §8)
export type SignupPolicy = 'self_service_trial' | 'approval_required' | 'invitation_only' | 'sales_assisted';
export interface WorkspaceRequest { id: string; kind: 'approval' | 'sales' | 'trial'; organisation: string; contactName: string; edition: 'developer' | 'community' | 'portfolio' | 'custom'; expectedUnits?: number; city: string; receivedAt: string; status: 'new' | 'contacted' | 'approved' | 'declined' | 'converted' }
export interface PlatformAuditEvent { id: string; at: string; actor: string; action: string; tenantId: string; before?: unknown; after?: unknown; reason?: string }
```

**Engine:** `priceContract(contract, snapshots, period): QuotePreview`
- Follows the calculation order in A3 §6.
- Uses integer paisa arithmetic.
- Proven by `pricing.vectors.json` (A3 §9).

## 4. Site, billing and payment contracts (`sites.ts`, `billing.ts`, `payments.ts`, Gate C)

```ts
export interface ManagedSite { id: string; name: string; legalEntityId: string; city: string; buildings: number; units: number }
export interface UnitCore {
  id: string; siteId: string; buildingId?: string; floorId?: string; code: string; typeId: string; areaSqft: number;
  active: 'active' | 'merged' | 'demolished' | 'archived'; occupancy: 'vacant' | 'owner_occupied' | 'tenant_occupied';
}
export interface UnitLiability {
  partyId: string; displayName: string; role: 'primary_payer' | 'co_payer' | 'guarantor';
  liabilityType: 'proportional' | 'joint'; share?: string;   // proportional shares sum to 100 per unit and period
  from: string; to?: string;
}
export interface BillingAccount {
  id: string; accountNo: string; kind: 'dues' | 'sales_contract' | 'service'; siteId: string; legalEntityId: string;
  // Liability is per covered unit (A2 §4.5): no account-wide percentages.
  units: Array<{ unitId: string; unitCode: string; from: string; to?: string; liabilities: UnitLiability[] }>;
  balance: Money; credit: Money;
}

export type ChargeCategoryKey = 'maintenance' | 'security' | 'lift' | 'water' | 'generator' | 'parking' | 'common_electricity'
  | 'sinking_fund' | 'one_time_assessment' | 'repair' | 'late_fee';
export interface ChargeRule {
  id: string; versionId: string; siteId: string; category: ChargeCategoryKey;
  scope: { level: 'site' } | { level: 'building'; id: string } | { level: 'unit_type'; id: string } | { level: 'unit'; id: string };
  basis: 'fixed' | 'per_sqft' | 'percent_of'; amount?: Money; rate?: string; percentOf?: ChargeCategoryKey;
  frequency: 'monthly' | 'quarterly' | 'annual'; from: string; to?: string;
}
export interface ResolvedCharge { category: ChargeCategoryKey; amount: Money; winner: ChargeRule; overridden: ChargeRule[]; exemption?: { id: string; percent: string; reasonKey: string } }

export type BillingRunState = 'DRAFT' | 'PREVIEWED' | 'APPROVAL_PENDING' | 'APPROVED' | 'POSTED' | 'NOTIFIED' | 'CANCELLED';
export interface BillingRun {
  id: string; siteId: string; period: string; state: BillingRunState; postingVersion: number;
  createdBy: string; approvedBy?: string; stale: boolean;
  totals: { accounts: number; flats: number; exempt: number; amount: Money };
  history: Array<{ at: string; by: string; from: BillingRunState; to: BillingRunState; noteKey?: string }>;
}
export interface BillingRunItem { id: string; unitId: string; unitCode: string; billingAccountId: string; lines: ResolvedCharge[]; total: Money; idempotencyKey: string }

/** Generalizes the existing `Invoice` (entities.ts); existing fields keep their meaning. */
export interface CustomerInvoice {
  id: string; ref: string; legalEntityId: string; billingAccountId: string; siteId: string;
  source: 'installment_schedule' | 'billing_run' | 'opening_balance' | 'manual' | 'service' | 'penalty';
  period?: string; issuedOn: string; dueOn: string; issuance: 'draft' | 'issued' | 'cancelled';
  lines: Array<{ category?: ChargeCategoryKey; unitCode?: string; labelKey: string; amount: Money; sourceId: string }>;
  total: Money; allocated: Money; credited: Money;
  settlement: 'unpaid' | 'partially_paid' | 'paid';   // derived
  overdue: boolean;                                     // derived
}
export interface Statement {
  billingAccountId: string; from: string; to: string; openingBalance: Money;
  entries: Array<{ on: string; kind: 'invoice' | 'credit_note' | 'payment' | 'refund'; ref: string; debit?: Money; credit?: Money }>;
  closingBalance: Money; unappliedCredit: Money;
}

export type SubmissionState = 'SUBMITTED' | 'UNDER_REVIEW' | 'NEEDS_INFORMATION' | 'REJECTED' | 'VERIFIED';
export interface PaymentSubmission {
  id: string; ref: string; billingAccountId: string; beneficiaryProfileId: string;
  method: 'bank_transfer' | 'cheque' | 'cash_deposit'; amount: Money; paidOn: string; reference: string; files: string[];
  state: SubmissionState; supersedesId?: string; messages: Array<{ at: string; by: 'resident' | 'finance'; textKey?: string; text?: string }>;
}
export interface VerificationDecision { submissionId: string; decision: 'verified' | 'rejected' | 'needs_information'; bankTransactionId?: string; reasonKey?: string; by: string; at: string }
export interface Payment {
  id: string; ref: string; legalEntityId: string; billingAccountId: string; payerPartyId?: string; amount: Money; receivedOn: string;
  source: 'submission' | 'gateway' | 'office'; bankTransactionId?: string; receiptId: string;
  allocations: Array<{ invoiceId: string; invoiceLineId: string; unitCode: string; amount: Money }>;   // line level, same entity only
  unapplied: Money;
}
export interface BankTransaction {
  id: string; bankAccountId: string; legalEntityId: string;
  // Identity is scoped to the account (A2 §5.2): provider id, or an import fingerprint when there is none.
  identity: { source: 'provider_feed'; providerTransactionId: string } | { source: 'statement_import'; fingerprint: string; importBatchId: string; lineSequence: number };
  bookedOn: string; amount: Money; direction: 'credit' | 'debit'; narrative: string;   // narrative/reference = matching hint only
  status: 'unmatched' | 'suggested' | 'matched'; matchedPaymentId?: string;            // one transaction confirms at most one payment
}
export interface BeneficiaryProfile {
  id: string; siteId: string; legalEntityName: string; bankName: string; accountTitle: string;
  iban: string;                      // fictional: bank code DEMO, enforced by fixtures.test
  referenceFormat: string; qrPayload?: string;
  status: 'draft' | 'pending_verification' | 'verified' | 'retired'; verifiedOn?: string; changedOn?: string;
}
```

**Engines (pure, unit-tested)**

| Engine | What it does |
|---|---|
| `resolveCharges(unit, rules, exemptions, period)` | → `ResolvedCharge[]`. Most specific wins (A4 §2) |
| `billingRun` | Transition table with guards: stale preview, maker ≠ checker, one open run per period. **Idempotent `post()`** keyed by `idempotencyKey` |
| `allocate(payment, openInvoices, policy)` | Oldest due first; manual override; unapplied remainder |
| `statement(account, from, to)` | Derived; never stored |

**Golden vectors** in `dues.vectors.json`:
- A-101: 4,200 charges + 1,000 arrears = 5,200 payable;
- payments of 5,200, 3,000 and 6,000 allocated as in A4 §4;
- A-501 penthouse 4,500 wins over the site rate;
- A-108 exempt;
- a double post produces no duplicates.

## 5. Mock API endpoints

Each row lists the `requires` (module / permission) that `MockTransport` checks before the handler runs. The handler checks scope and state.

### 5.1 Platform plane (Gate B)

| Method + path | Request → response | Requires |
|---|---|---|
| GET `/platform/overview` | → `{ byStatus, byType, pendingRequests, draftContracts }` | `platform.dashboard.view` |
| GET `/platform/tenants?status=&type=&q=` | → `TenantSummary[]` | `platform.tenants.view` |
| POST `/platform/tenants` | draft basics → `{ id }` | `platform.tenants.create` |
| PATCH `/platform/tenants/:id/draft` | step data → saved draft | `platform.tenants.create` |
| GET `/platform/tenants/:id` | → `Tenant360` (summary, sites, grants, contract versions, usage, audit) | `platform.tenants.view` |
| GET `/platform/catalog` | → `ModuleCatalogEntry[]` + presets | `platform.catalog.view` |
| POST `/platform/entitlements/check` | grants → `DependencyCheckResult` | `platform.grants.manage` |
| GET `/platform/tenants/:id/grants/impact?change=` | → `GrantImpact` | `platform.grants.manage` |
| POST `/platform/tenants/:id/grants` | change + impact acknowledgement → new grants + audit | `platform.grants.manage` |
| GET `/platform/rate-cards/current` | → rate card | `platform.pricing.view` |
| POST `/platform/quotes/preview` | contract draft + period → `QuotePreview` | `platform.contracts.manage` |
| POST `/platform/simulations/price` | scenario → `QuotePreview` (**never writes**; the mutation log proves it) | `platform.pricing.simulate` |
| GET `/platform/tenants/:id/usage?period=` | → `UsageSnapshot[]` (all unit dimensions side by side) | `platform.usage.view` |
| GET `/platform/usage/snapshots/:id/evidence` | → `MeterEvidence` | `platform.usage.view` |
| POST `/platform/tenants/:id/contracts` | amendment → new `SubscriptionContract` version | `platform.contracts.manage` |
| POST `/platform/tenants/:id/activate` | → tenant `trial`/`active` (**simulated**; no DB is provisioned) | `platform.tenants.lifecycle` |
| POST `/platform/tenants/:id/preview-session` | `{ roleKey }` → `PreviewSession` | `platform.preview.use` |
| GET `/platform/tenants/:id/audit` | → `PlatformAuditEvent[]` | `platform.audit.view` |
| GET `/platform/tenants/:id/records/*` | **always 403 `support_grant_required`** (proof that HQ cannot read tenant records) | — |

### 5.2 Tenant plane: sites and people (Gate C)

| Method + path | Requires |
|---|---|
| GET `/access/me` → `EffectiveAccess` (also used inside an HQ preview) | signed in |
| GET `/sites`, GET `/sites/:id`, GET `/sites/:id/checklist` | `core` / `site.view` |
| GET `/sites/:id/structure`; POST `/sites/:id/buildings`; POST `/sites/:id/units` | `core` / `site.view`, `site.manage` |
| POST `/sites/:id/imports/units/preview` → `{ importId, rows, errors[], duplicates[] }`; POST `/sites/:id/imports/units/:importId/commit` | `core` / `site.units.import` |
| POST `/sites/:id/imports/opening-balances/{preview,commit}` | `receivables` / `receivables.opening_balances` |
| GET `/unit-types?site=`; GET `/sites/:siteId/units/:unitId` | `core` / `unit.view` |
| GET `/people?role=&site=&q=`; GET `/people/:id` | `core` / `party.view` |
| GET `/billing-accounts?site=&q=`; GET `/billing-accounts/:id`; POST `/billing-accounts/:id/parties` | `receivables` / `billing_account.view`, `billing_account.manage` |

### 5.3 Tenant plane: charges, runs, invoices, payments (Gate C)

| Method + path | Requires |
|---|---|
| GET `/charges/categories`; GET `/charges/rules?site=`; POST `/charges/rules`; POST `/charges/rules/:id/versions`; GET `/charges/resolve?unit=` | `dues` / `charges.manage` (read: `billing_run.view`) |
| POST `/exemptions`; POST `/exemptions/:id/approve` | `dues` / `charges.exemptions` (approve: `billing_run.approve`) |
| GET `/billing-runs?site=&period=`; POST `/billing-runs`; GET `/billing-runs/:id` | `dues` / `billing_run.view`, `billing_run.create` |
| POST `/billing-runs/:id/preview`, `/submit`, `/cancel` | `dues` / `billing_run.create` |
| POST `/billing-runs/:id/return`, `/approve` | `dues` / `billing_run.approve` + maker ≠ checker |
| POST `/billing-runs/:id/post`, `/notify` | `dues` / `billing_run.post` (idempotent) |
| GET `/invoices?site=&status=&source=`; GET `/invoices/:id`; POST `/invoices/:id/credit-notes` | `receivables` / `invoice.view`, `credit_note.create` |
| GET `/statements/:billingAccountId?from=&to=` | `receivables` / `invoice.view` |
| GET `/payment-submissions?state=&site=`; GET `/payment-submissions/:id` | `receivables` / `finance.evidence.review` |
| POST `/payment-submissions/:id/start-review`, `/verify` `{ bankTransactionId, allocations }`, `/reject` `{ reasonKey }`, `/request-info` `{ message }` | `receivables` / `finance.evidence.review` |
| POST `/payments/office` | `receivables` + feature `receivables.office_collections` / `payment.receive.office` + site method rule |
| GET `/payments?site=`; GET `/payments/:id`; GET `/receipts/:id` | `receivables` / `invoice.view` |
| GET `/bank-transactions?account=&status=`; POST `/bank-reconciliation/matches` | `banking` / `bank.view`, `bank.reconcile` |
| GET `/collections/summary?site=&period=`; GET `/collections/aging?site=` | `receivables` / `collections.view` |
| GET `/beneficiaries?site=`; POST `/beneficiaries`; POST `/beneficiaries/:id/approve` | `banking` / `beneficiary.manage` + maker ≠ checker |
| GET / PATCH `/sites/:id/payment-methods` | `receivables` / `payment_methods.manage` |

### 5.4 Resident portal, dues (Gate C)

| Method + path | Notes |
|---|---|
| GET `/portal/home` | **Edition-aware.** Returns `{ variant: 'instalments' \| 'dues', … }`. The existing instalments payload is unchanged |
| GET `/portal/accounts` | Billing accounts reached through **verified** party links |
| GET `/portal/bills?account=`; GET `/portal/bills/:invoiceId` | Charges by category; the opening balance is separate |
| GET `/portal/payee?invoice=` | The verified beneficiary of the invoice's issuing entity and site + structured reference + QR payload |
| POST `/portal/bills/:invoiceId/proof` | Mirrors the existing `/portal/instalments/:id/proof`; creates a `PaymentSubmission` (SUBMITTED) |
| GET `/portal/submissions`; GET `/portal/submissions/:id` | Status timeline. Never "paid" before VERIFIED |
| GET `/portal/statements?account=` | Only the periods this person is liable for |
| GET `/portal/receipts/:id` | Existing endpoint; dues receipts added |

## 6. Errors and events

**New `ApiProblem.code` values**
- the `DenyReason` set;
- `support_grant_required`, `invalid_transition`, `stale_preview`, `duplicate_period`;
- `maker_checker_required`, `bank_transaction_already_matched`, `allocation_exceeds_payment`, `cross_entity_forbidden`;
- `tenant_suspended`, `approval_required`, `invitation_invalid`, `signup_policy_closed`;
- `method_not_allowed_for_site`, `beneficiary_unverified`, `import_has_errors`.

Each has a translation key and states whether anything changed (`changed: false` unless stated).

**Domain events.** These are recorded in the mock activity log now and become outbox events later:
- `tenant.activated`, `grants.changed`, `contract.activated`, `usage.snapshot.captured`;
- `billing_run.posted`, `payment_submission.verified`, `payment.allocated`, `beneficiary.verified`.

## 7. Fictional-data rules (extended `fixtures.test.ts`)

| Data | Rule |
|---|---|
| Phones, CNICs, e-mails | Existing rules: unallocated `+92 399`, CNIC starting with 9, `example.com` |
| IBANs | Use the bank code `DEMO`, never a real bank's code |
| Platform and society names | Always carry "(Demo)" |
| Meter evidence | No names |
| Platform plane | Fixtures contain **no** tenant person data |
