import type { QuotationDraftSnapshot, UnitPricePickerItem } from '@repo/contracts';
import { allocationsOf, calculatePlanPreview } from '../pricing/calculator';

/**
 * E.4 CRM-013 pure illustrative quotation calculation (no customer record).
 *
 * The caller must separately authorize a specific lead/opportunity AND unit
 * before using this helper in a CRM endpoint. It intentionally cannot issue,
 * persist, reserve, submit, send or approve quotations; E.3 has no accepted
 * price version, effective discount or approved payment-plan version.
 *
 * Important: never infer "approval" or "availability" from the existence of
 * a fictional listed price. Zero-value plan rows are retained explicitly.
 */
export function illustrativeQuotationSnapshot(
  authorizedUnit: UnitPricePickerItem,
  untrustedAllocations: unknown,
): QuotationDraftSnapshot {
  const allocations = allocationsOf(untrustedAllocations);
  // calculatePlanPreview validates PKR money, exact total shares, row counts
  // and safe integer-paisa rounding. No floating point currency arithmetic.
  const plan = calculatePlanPreview(authorizedUnit.currentListedPrice, allocations);
  const unit = structuredClone(authorizedUnit);
  return {
    unit,
    priceSource: 'fictional_seed',
    approvedPriceVersionId: null,
    approvedPlanVersionId: null,
    allocations: structuredClone(allocations),
    lines: structuredClone(plan.lines),
    listedPrice: { ...unit.currentListedPrice },
    totalAllocated: { ...plan.totalAllocated },
    status: 'illustrative_draft',
    canSend: false,
    canAccept: false,
    canReserve: false,
    postingAllowed: false,
  };
}
