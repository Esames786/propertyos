import type { Money } from './money';

/**
 * Gate E.3 INV-006, read-only prototype.
 *
 * The legacy fixture contains a single listed price per unit, NOT a version history.
 * We must never invent price changes, dates, approval actors or a quoted/settled amount.
 */
export interface UnitPricePickerItem {
  id: string;
  ref: string;
  projectId: string;
  projectName: string;
  currentListedPrice: Money;
}

export interface UnitPricePickerResponse {
  items: UnitPricePickerItem[];
  total: number; // count of visible items only
}

export interface UnitPriceRevision {
  id: string;
  price: Money;
  approvedAt: string;
  effectiveFrom: string;
  approvedBy: string;
  sourceVersion: number;
}

export interface UnitPriceHistory {
  unit: UnitPricePickerItem;
  baseline: { price: Money; source: 'fictional_seed'; dateKnown: false };
  /** Empty until the separately approved E.3 pricing change workflow supplies real evidence. */
  revisions: UnitPriceRevision[];
  canEdit: false;
  recordState: 'baseline_only';
}

/**
 * COM-002: a single-request, read-only preview. One basis point = 0.01%.
 * This does not create a template, price version, quote or receivable.
 */
export type PlanAllocationKind = 'down_payment' | 'instalments' | 'on_possession' | 'balloon' | 'construction_linked';

export interface PlanAllocationInput {
  kind: PlanAllocationKind;
  shareBps: number;
  /** Required for instalments, omitted for other allocation kinds. */
  count?: number;
  /** Required for construction-linked lines. No date is inferred from this key. */
  milestoneKey?: string;
}

export interface PlanPreviewInput {
  unitId: string;
  allocations: PlanAllocationInput[];
}

export interface PlanPreviewRow {
  rowKey: string;
  kind: PlanAllocationKind;
  shareBps: number;
  amount: Money;
  /** Optional fictional construction milestone, never a due date. */
  milestoneKey?: string;
  instalmentNumber?: number;
  instalmentCount?: number;
}

export interface PlanPreview {
  unit: UnitPricePickerItem;
  totalPrice: Money;
  lines: PlanPreviewRow[];
  totalAllocated: Money;
  totalShareBps: 10000;
  difference: Money;
  previewOnly: true;
  postingAllowed: false;
  priceSource: 'fictional_seed';
  policyStatus: 'not_approved';
  hasScheduledDates: false;
}

/** COM-001: user-authored drafts; no approved/scheduled/published template exists in this prototype. */
export interface PaymentPlanTemplateVersion {
  version: number;
  title: string;
  allocations: PlanAllocationInput[];
  createdAt: string;
  createdBy: string;
  state: 'draft';
}

export interface PaymentPlanTemplate {
  id: string;
  tenantId: string;
  projectId: string;
  creatorPrincipalId: string;
  currentVersion: number;
  versions: PaymentPlanTemplateVersion[];
  state: 'draft';
  approvalAllowed: false;
  postingAllowed: false;
}

export interface PaymentPlanTemplateSummary {
  id: string;
  projectId: string;
  title: string;
  currentVersion: number;
  state: 'draft';
}

export interface PaymentPlanTemplateList {
  items: PaymentPlanTemplateSummary[];
  total: number;
}

/** COM-003 policies are private, non-effective drafts. No approved unit-price rule exists yet. */
export interface PricingPolicyRule {
  unitType: 'residential' | 'commercial' | 'mixed';
  baseRate: Money;
  floorRiseBps: number;
  cornerPremiumBps: number;
  parkFacingPremiumBps: number;
}
export interface PricingPolicyDraftVersion {
  version: number;
  title: string;
  rules: PricingPolicyRule[];
  createdAt: string;
  createdBy: string;
  state: 'draft';
}
export interface PricingPolicyDraft {
  id: string;
  tenantId: string;
  projectId: string;
  creatorPrincipalId: string;
  currentVersion: number;
  versions: PricingPolicyDraftVersion[];
  state: 'draft';
  effective: false;
  approvalAllowed: false;
}
export interface PricingPolicyDraftList {
  items: Array<{ id: string; projectId: string; title: string; currentVersion: number; state: 'draft' }>;
  total: number;
}

/**
 * COM-004. These are illustrations, not adopted commercial or statutory rules.
 * Basis points are hundredths of one percent, applied to the fictional listed
 * unit price. Discounts are always bounded by an explicit PKR cap.
 */
export type CommercialFeeMode = 'fixed' | 'rate_bps';
export interface CommercialFeeRule {
  code: string;
  label: string;
  mode: CommercialFeeMode;
  /** Required for fixed fees; absent for a rate-based fee. */
  amount?: Money;
  /** Required for rate-based fees; absent for a fixed fee. */
  rateBps?: number;
}
export interface CommercialDiscountRule {
  code: string;
  label: string;
  rateBps: number;
  maxAmount: Money;
}
export interface CommercialRulesDraftVersion {
  version: number;
  title: string;
  fees: CommercialFeeRule[];
  discounts: CommercialDiscountRule[];
  createdAt: string;
  createdBy: string;
  state: 'draft';
}
export interface CommercialRulesDraft {
  id: string;
  tenantId: string;
  projectId: string;
  creatorPrincipalId: string;
  currentVersion: number;
  versions: CommercialRulesDraftVersion[];
  state: 'draft';
  effective: false;
  approvalAllowed: false;
}
export interface CommercialRulesDraftList {
  items: Array<{ id: string; projectId: string; title: string; currentVersion: number; state: 'draft' }>;
  total: number;
}
export interface CommercialPreviewLine {
  code: string;
  label: string;
  kind: 'fee' | 'discount';
  amount: Money;
}
export interface CommercialRulesPreview {
  unit: UnitPricePickerItem;
  listedPrice: Money;
  lines: CommercialPreviewLine[];
  totalFees: Money;
  totalDiscounts: Money;
  illustrativePayable: Money;
  previewOnly: true;
  policyStatus: 'not_approved';
  postingAllowed: false;
}
