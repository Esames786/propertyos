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
