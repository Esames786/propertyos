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
