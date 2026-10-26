import type { Money } from './money';
import type { UnitType } from './entities';

/**
 * HOME-001 management dashboard read model (Stage 1.5 reference screen 1).
 * One request returns every section the persona may see; a section the persona lacks the
 * permission for is `null`, so the page composes itself by role without hiding-as-security.
 * All figures are fictional fixtures. Money stays a decimal string; counts and ratios are numbers.
 */
export const DASHBOARD_RANGES = ['3m', '6m', 'ytd', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export type KpiId =
  | 'salesBooked'
  | 'collected'
  | 'available'
  | 'pipeline'
  | 'conversion'
  | 'receivables'
  | 'verifications';

export interface DashboardKpi {
  id: KpiId;
  format: 'money' | 'count' | 'percent';
  /** Decimal string: money in PKR ("1240000000.00"), counts ("142"), ratios ("0.124"). */
  value: string;
  /** Same measure for the previous equal-length period; null for snapshots without history. */
  previous: string | null;
  /** Optional reference figure: scheduled amount (collected), total units (available), open leads (pipeline). */
  reference: { kind: 'target' | 'total' | 'openLeads'; value: string } | null;
  /** Twelve monthly points ending with the current month (sparkline). */
  trend: number[];
  /** Whether a rise is good news (drives the delta's wording, icon and colour). */
  better: 'up' | 'down';
  href: string;
}

export interface CollectionsPoint {
  /** First day of the month, YYYY-MM-DD. */
  period: string;
  collected: string;
  scheduled: string;
  /** The current month is still in progress (figures to date). */
  partial: boolean;
}

export const INVENTORY_BUCKETS = ['available', 'onHold', 'sold', 'handedOver'] as const;
export type InventoryBucket = (typeof INVENTORY_BUCKETS)[number];

export interface InventoryRow {
  id: string;
  projectId: string;
  /** Tower letter or phase label, as stored ("A", "Phase 1"); the UI adds the translated noun. */
  label: string;
  kind: 'tower' | 'phase';
  counts: Record<InventoryBucket, number>;
  /** Blocked or otherwise not for sale; shown in the table and total, not as a bar segment. */
  other: number;
  href: string;
}

export const FUNNEL_STAGES = ['enquiries', 'contacted', 'visits', 'qualified', 'booked'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface ProjectMilestone {
  key: 'land' | 'foundation' | 'structure' | 'facade' | 'interiors' | 'handover' | 'roads' | 'utilities' | 'landscaping' | 'possession';
  /** 0..1 */
  progress: number;
  date: string;
}

export interface ProjectShowcase {
  id: string;
  ref: string;
  name: string;
  city: string;
  kind: 'towers' | 'plots';
  imageKey: string;
  /** Overall construction progress 0..1. */
  progress: number;
  completion: string;
  milestones: ProjectMilestone[];
  units: { total: number; available: number; sold: number };
  /** Value of units sold to date. */
  salesValue: Money;
  /** Starting price of available inventory. */
  fromPrice: Money;
  href: string;
}

export interface ResidenceSummary {
  type: UnitType;
  projectId: string;
  projectName: string;
  total: number;
  available: number;
  fromPrice: Money;
  avgArea: number;
  imageKey: string | null;
  href: string;
}

export type AttentionKind = 'verification' | 'followUp' | 'hold' | 'overdue';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  ref: string;
  /** Party or unit display name, as entered (never translated). */
  name: string;
  amount: Money | null;
  /** When it is due, expires or was submitted (ISO instant). */
  at: string;
  urgent: boolean;
  href: string;
}

export interface ConstructionUpdate {
  id: string;
  projectId: string;
  projectName: string;
  /** Translation key + params: site reports are system text in this prototype. */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  imageKey: string;
  at: string;
  progress: number;
  href: string;
}

export interface DashboardSummary {
  range: DashboardRange;
  /** ISO instant the figures are "as of" (fixture clock). */
  asOf: string;
  /** First day of the range and of the comparison period (YYYY-MM-DD). */
  period: { start: string; end: string; previousStart: string; previousEnd: string };
  kpis: DashboardKpi[];
  collections: CollectionsPoint[] | null;
  inventory: InventoryRow[] | null;
  funnel: Array<{ stage: FunnelStage; count: number }> | null;
  projects: ProjectShowcase[];
  residences: ResidenceSummary[] | null;
  attention: Partial<Record<AttentionKind, AttentionItem[]>>;
  construction: ConstructionUpdate | null;
}
