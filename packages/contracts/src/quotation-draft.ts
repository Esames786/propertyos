import type { Money } from './money';
import type { PlanAllocationInput, PlanPreviewRow, UnitPricePickerItem } from './pricing';

/** E.4 provisional quotation draft. A fictional listed price is not an approved price version. */
export interface QuotationDraftSnapshot {
  unit: UnitPricePickerItem;
  priceSource: 'fictional_seed';
  approvedPriceVersionId: null;
  approvedPlanVersionId: null;
  allocations: PlanAllocationInput[];
  lines: PlanPreviewRow[];
  listedPrice: Money;
  totalAllocated: Money;
  status: 'illustrative_draft';
  canSend: false;
  canAccept: false;
  canReserve: false;
  postingAllowed: false;
}

/** No quotation is issued or reserved by this pure preview. */
export interface QuotationDraftPreviewInput {
  unitId: string;
  allocations: PlanAllocationInput[];
}
