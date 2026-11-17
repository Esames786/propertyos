import type { ProjectKind, UnitStatus, UnitType } from './entities';
import type { Money } from './money';

/**
 * Gate E.2 (projects and inventory, wave 1, PROVISIONAL until E.0 is accepted and integrated):
 * PRJ-001 projects list, PRJ-002 Project 360, PRJ-003 project setup, INV-001 unit matrix, INV-002 unit
 * quick view, INV-008 live availability and INV-010 storage inventory.
 *
 * The unit status follows A2 §4.2 and decision E-10: three independent dimensions (inventory, delivery,
 * occupancy). In this wave they are derived from the demo seed's 12-value `UnitStatus` (which stays the
 * legacy status the Stage 1.5 screens read); E.0's developer state replaces the derivation at integration.
 * Reserved and booked states come only from that seed (labelled "demo seed"): no reservation, booking,
 * payment or ownership record exists in this wave (E.4 and E.5 create them).
 */

// ---------------------------------------------------------------------------------------------------
// Unit dimensions and availability (E-10)
// ---------------------------------------------------------------------------------------------------

export const INVENTORY_STATES = ['draft', 'available', 'held', 'reserved', 'booked', 'allocated', 'blocked', 'withdrawn', 'disputed'] as const;
export type InventoryState = (typeof INVENTORY_STATES)[number];

export const UNIT_DELIVERY_STATES = ['planned', 'under_construction', 'handover_ready', 'handed_over'] as const;
export type UnitDeliveryState = (typeof UNIT_DELIVERY_STATES)[number];

/** A2 §4.2 occupancy, plus "occupied — kind not recorded" for seeded occupied units (no occupancy record exists). */
export const OCCUPANCY_STATES = ['vacant', 'owner_occupied', 'tenant_occupied', 'occupied_unrecorded'] as const;
export type OccupancyState = (typeof OCCUPANCY_STATES)[number];

export interface UnitDimensions {
  inventory: InventoryState;
  delivery: UnitDeliveryState;
  occupancy: OccupancyState;
}

/**
 * Live availability buckets (INV-008). `held` counts only holds in force (an expired hold is not held);
 * `booked` covers every sold unit (booked or allocated, before or after handover); `unavailable` is draft,
 * blocked, withdrawn or disputed stock. The dashboard's buckets map onto these exactly (vectors).
 */
export const AVAILABILITY_BUCKETS = ['available', 'held', 'reserved', 'booked', 'unavailable'] as const;
export type AvailabilityBucket = (typeof AVAILABILITY_BUCKETS)[number];

export type BucketCounts = Record<AvailabilityBucket, number>;

/** Where a unit's hold comes from: a live session hold (with an expiry) or the demo seed (no hold record). */
export type HoldSource = 'live' | 'seed';

export interface UnitHoldView {
  source: HoldSource;
  /** Live holds only: the instant the hold lapses (the demo clock that created it decides). */
  until?: string;
  /** The holder's name (staff); absent for seeded holds. */
  holderName?: string;
  /** The reader placed this hold (only they may release it). */
  mine: boolean;
  /** The lead the unit is held for; only for readers who may see that lead (history projection, §4.4). */
  leadRef?: string;
  leadId?: string;
}

// ---------------------------------------------------------------------------------------------------
// Projects (PRJ-001, PRJ-002)
// ---------------------------------------------------------------------------------------------------

/** A project's lifecycle in this wave: the seeded projects are active; new ones go draft → submitted → active (or returned). */
export const PROJECT_STATES = ['draft', 'submitted', 'returned', 'active'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

/** Why a block of figures is not shown: the module is not licensed for the project's site, or the reader lacks the permission. */
export type Withheld = 'not_in_plan' | 'no_permission';

export interface ProjectUnitFigures {
  total: number;
  buckets: BucketCounts;
  /** Lowest list price of available stock (null when nothing is available). */
  fromPrice: Money | null;
  /** List value of sold stock (booked or allocated, demo seed); never a payment. */
  soldListValue: Money;
}

export interface ProjectSummary {
  id: string;
  ref: string;
  name: string;
  city: string;
  kind: ProjectKind;
  state: ProjectState;
  siteId: string;
  siteName: string;
  legalEntityId: string;
  legalEntityName: string;
  /** Inventory figures (null with a reason when withheld). */
  units: ProjectUnitFigures | null;
  unitsWithheld?: Withheld;
  /** Open leads of the project (null with a reason when withheld). */
  leads: { open: number; total: number } | null;
  leadsWithheld?: Withheld;
  storage: { total: number; allocated: number } | null;
  /** Structure counts (towers or phases), from the project's records. */
  structure: { towers: number; phases: number; floors: number };
  /** Created through project setup in this demo session (no units exist until unit creation lands). */
  setupRecordId?: string;
  href: string;
}

export const PROJECT_SORTS = ['name', 'units', 'available', 'sold'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export const PROJECT_FILTERS = ['all', 'towers', 'plots', 'commercial'] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];

export interface ProjectsPortfolio {
  items: ProjectSummary[];
  /** Sums over the listed projects whose figures the reader may see (every KPI opens its records). */
  totals: { projects: number; units: number; buckets: BucketCounts };
  cities: string[];
  counts: Record<ProjectFilter, number>;
  /** The reader may prepare a new project (project.manage). */
  canSetUp: boolean;
  /** Projects in setup the reader may see (drafts, submitted, returned). */
  inSetup: number;
}

export const PROJECT_360_TABS = ['overview', 'leads', 'units', 'bookings', 'collections', 'finance', 'expenses', 'suppliers', 'construction', 'handover', 'residents', 'maintenance', 'documents', 'analytics', 'activity'] as const;
export type Project360Tab = (typeof PROJECT_360_TABS)[number];

/** What a tab shows: live data, a planned slice (with its gate), not licensed for the site, or no permission. */
export type TabState = 'live' | 'planned' | 'not_in_plan' | 'no_permission';

export interface Project360TabInfo {
  id: Project360Tab;
  state: TabState;
  /** For planned tabs: the Gate E slice that builds it ("E.5"), or a decision reference ("E-24"). */
  gate?: string;
}

export interface InventoryGroupRow {
  id: string;
  label: string;
  kind: 'tower' | 'phase';
  floors?: number;
  total: number;
  buckets: BucketCounts;
  /** Opens the unit matrix filtered to this tower or phase. */
  href: string;
}

export interface ProjectLeadRow {
  id: string;
  ref: string;
  name: string;
  status: string;
  ownerName: string;
  budget: Money;
  createdAt: string;
}

export type InventoryEventKind =
  | 'setup_created'
  | 'setup_saved'
  | 'setup_submitted'
  | 'setup_returned'
  | 'setup_activated'
  | 'unit_held'
  | 'unit_released'
  | 'storage_allocated'
  | 'storage_released';

/**
 * One audit entry of the projects and inventory module. Readers see entries of the projects they may
 * see only; a lead reference stays only for readers who may see leads (projection, §4.4).
 */
export interface InventoryEvent {
  id: string;
  at: string;
  kind: InventoryEventKind;
  projectId: string;
  actorName: string;
  /** Record references the entry is about (unit, storage, setup); free text is never translated. */
  refs: { unit?: string; unitId?: string; storage?: string; storageId?: string; setup?: string; lead?: string };
  note?: string;
}

export interface Project360 {
  project: ProjectSummary;
  tabs: Project360TabInfo[];
  /** Overview and Units tabs: inventory by tower or phase (null when withheld). */
  inventory: InventoryGroupRow[] | null;
  /** Leads tab: the newest leads of the project the reader may see (null when withheld). */
  leads: { items: ProjectLeadRow[]; total: number; byStatus: Record<string, number> } | null;
  /** Documents tab: the project's documents (none exist in the demo yet; E.13 owns the module). */
  documents: { items: Array<{ id: string; title: string; kind: string; updatedAt: string }>; owner: 'E.13' };
  /** Activity tab: the module's audit entries for this project, newest first. */
  activity: InventoryEvent[];
  /** The setup record behind a project created in this session. */
  setup?: { id: string; ref: string; state: ProjectState };
}

// ---------------------------------------------------------------------------------------------------
// Project setup (PRJ-003): draft → submitted → active (by someone else) | returned
// ---------------------------------------------------------------------------------------------------

export const PROJECT_SETUP_STEPS = ['basics', 'site', 'structure', 'review'] as const;
export type ProjectSetupStep = (typeof PROJECT_SETUP_STEPS)[number];

export interface SetupBasics {
  name: string;
  /** Short project code (2–5 capital letters or digits), unique in the organisation. */
  code: string;
  city: string;
  kind: ProjectKind;
}

export interface SetupSite {
  siteId: string;
  /** Exactly one legal entity (A2 §4.3); configured by administration (read-only, decision E-37). */
  legalEntityId: string;
}

export interface SetupTower {
  name: string;
  floors: number;
  unitsPerFloor: number;
}

export interface SetupPhase {
  label: string;
  plots: number;
}

export interface SetupStructure {
  towers: SetupTower[];
  phases: SetupPhase[];
}

export interface SetupEvent {
  at: string;
  action: 'created' | 'saved' | 'submitted' | 'returned' | 'activated';
  byName: string;
  step?: ProjectSetupStep;
  note?: string;
}

export interface ProjectSetupRecord {
  id: string;
  ref: string;
  state: ProjectState;
  basics: SetupBasics | null;
  site: SetupSite | null;
  structure: SetupStructure | null;
  /** Steps whose content passed the server's validation. */
  completed: ProjectSetupStep[];
  makerName: string;
  createdAt: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedByName?: string;
  returnReason?: string;
  history: SetupEvent[];
  /** Totals the structure would create once unit creation lands (nothing is created now). */
  plannedUnits: number;
  /** The reader's own record (the maker). */
  mine: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  /** The reader may approve this request (holds project.approve, is not the maker, state submitted). */
  canDecide: boolean;
  /** Why the reader cannot decide a submitted request they could otherwise approve. */
  decideBlocked?: 'own_request';
}

export interface ProjectSetupList {
  items: ProjectSetupRecord[];
  canCreate: boolean;
  canApprove: boolean;
  /** Sites the reader may attach a new project to (inventory licensed there), with their legal entity. */
  sites: Array<{ id: string; name: string; city: string; legalEntityId: string; legalEntityName: string }>;
}

// ---------------------------------------------------------------------------------------------------
// Unit matrix (INV-001) and unit quick view (INV-002)
// ---------------------------------------------------------------------------------------------------

export interface MatrixCell {
  id: string;
  ref: string;
  type: UnitType;
  areaSqft: number;
  price: Money;
  /** Position on its floor (1…n) or plot number in its phase. */
  position: number;
  floor?: number;
  towerId?: string;
  block?: string;
  bucket: AvailabilityBucket;
  dimensions: UnitDimensions;
  /** Legacy 12-value status derived from the dimensions (unchanged for Stage 1.5 screens). */
  legacy: UnitStatus;
  hold?: UnitHoldView;
  /** Storage units allocated to this unit. */
  storage: number;
  /** The unit passes the current filters (cells that do not stay in the grid, dimmed, so the floor keeps its shape). */
  match: boolean;
}

export interface MatrixFloor {
  level: number;
  id: string;
  cells: MatrixCell[];
}

export interface MatrixGroup {
  id: string;
  kind: 'tower' | 'phase';
  label: string;
  /** Towers: floors from the top down. */
  floors?: MatrixFloor[];
  /** Phases: plots in order. */
  cells?: MatrixCell[];
  counts: BucketCounts;
}

export interface UnitMatrix {
  /** The project shown (null when the reader may open no project's inventory). */
  project: { id: string; ref: string; name: string; kind: ProjectKind } | null;
  /** Projects the reader may open in the matrix (inventory licensed and in scope). */
  projects: Array<{ id: string; name: string }>;
  groups: MatrixGroup[];
  /** Counts of the whole project (unfiltered) and of the filtered units. */
  counts: BucketCounts;
  total: number;
  matched: number;
  types: UnitType[];
  /** The demo clock the hold expiry was evaluated against. */
  asOf: string;
}

/** Where a storage unit is: a tower basement, or a phase's service lane (fictional). */
export interface StorageLocation {
  tower?: string;
  basement?: number;
  block?: string;
}

export interface StorageAllocationView {
  storageId: string;
  storageRef: string;
  location: StorageLocation;
  allocatedAt: string;
  byName: string;
}

export interface UnitInventoryDetail {
  id: string;
  ref: string;
  project: { id: string; name: string; kind: ProjectKind };
  towerId?: string;
  towerName?: string;
  floor?: number;
  block?: string;
  type: UnitType;
  areaSqft: number;
  price: Money;
  dimensions: UnitDimensions;
  legacy: UnitStatus;
  bucket: AvailabilityBucket;
  hold?: UnitHoldView;
  /** The reader may place a hold now (unit.hold, unit available, no hold in force). */
  canHold: boolean;
  /** The reader placed the hold in force (owner-only release, Issue #23 rule). */
  canRelease: boolean;
  storage: StorageAllocationView[];
  /** This unit's audit entries (projected for the reader). */
  history: InventoryEvent[];
  asOf: string;
}

export interface HoldLeadOption {
  id: string;
  ref: string;
  name: string;
  status: string;
}

// ---------------------------------------------------------------------------------------------------
// Live availability (INV-008)
// ---------------------------------------------------------------------------------------------------

export interface AvailabilityProject {
  projectId: string;
  name: string;
  kind: ProjectKind;
  rows: InventoryGroupRow[];
  counts: BucketCounts;
  total: number;
}

export interface ActiveHoldRow {
  unitId: string;
  unitRef: string;
  projectId: string;
  projectName: string;
  until: string;
  holderName: string;
  mine: boolean;
  leadRef?: string;
}

export interface AvailabilitySnapshot {
  asOf: string;
  projects: AvailabilityProject[];
  counts: BucketCounts;
  total: number;
  /** Live holds in force, soonest expiry first. */
  holds: ActiveHoldRow[];
  /** Live holds that lapsed (history: they no longer count as held). */
  lapsed: Array<{ unitId: string; unitRef: string; projectName: string; until: string }>;
  /** Units held, reserved or booked by the demo seed (no hold, reservation or booking record exists). */
  seeded: { held: number; reserved: number; booked: number };
}

// ---------------------------------------------------------------------------------------------------
// Storage inventory (INV-010): separate assets with an allocation history (V2.1 01 §9)
// ---------------------------------------------------------------------------------------------------

export const STORAGE_STATES = ['available', 'allocated', 'out_of_service'] as const;
export type StorageState = (typeof STORAGE_STATES)[number];

export const STORAGE_KINDS = ['locker', 'storeroom'] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export interface StorageEvent {
  at: string;
  action: 'allocated' | 'released';
  byName: string;
  unitRef: string;
  note?: string;
}

export interface StorageUnitView {
  id: string;
  ref: string;
  projectId: string;
  projectName: string;
  kind: StorageKind;
  location: StorageLocation;
  areaSqft: number;
  state: StorageState;
  /** Translation key of why a unit is out of service (demo seed). */
  outOfServiceKey?: string;
  allocation?: { unitId: string; unitRef: string; at: string; byName: string; note?: string };
  history: StorageEvent[];
}

export const STORAGE_FILTERS = ['all', 'available', 'allocated', 'out_of_service'] as const;
export type StorageFilter = (typeof STORAGE_FILTERS)[number];

export interface StorageList {
  items: StorageUnitView[];
  counts: Record<StorageFilter, number>;
  projects: Array<{ id: string; name: string }>;
  /** The reader may allocate and release (storage.manage) in at least one listed project. */
  canManage: boolean;
}

/** A unit storage may be allocated to: sold stock of the same project (booked or allocated, demo seed). */
export interface StorageTarget {
  unitId: string;
  unitRef: string;
  inventory: InventoryState;
  /** Storage already allocated to it. */
  storage: number;
}
