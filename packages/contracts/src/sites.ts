import type { LiabilityChange } from './collections';
import type { Money } from './money';

/**
 * Society setup (Gate C.1, A2 §4 and A6 §4). The physical hierarchy is rooted at the managed site,
 * never a developer project: site → building (block) → floor → flat. Booking, ownership, occupancy
 * and the responsible payer are four separate, effective-dated facts, and liability is held per flat
 * (never as an account-wide share), so one billing account can cover flats with different payers.
 */

export const OCCUPANCY_STATUSES = ['owner_occupied', 'tenant_occupied', 'vacant', 'association_use'] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUSES)[number];

export type UnitTypeCode = 'standard' | 'penthouse';

export interface SiteBuilding {
  id: string;
  siteId: string;
  /** Short code used in flat numbers ("A" in A-101). */
  code: string;
  name: string;
  floors: number;
  flatsPerFloor: number;
}

export interface SiteFloor {
  id: string;
  buildingId: string;
  level: number;
}

export interface SiteUnitType {
  id: string;
  siteId: string;
  code: UnitTypeCode;
  /** As entered by the society (free text, never translated). */
  name: string;
  areaSqft: number;
  flats: number;
}

/** A flat: physical and operational facts only (no sales status, D-4). */
export interface SocietyFlat {
  id: string;
  siteId: string;
  buildingId: string;
  floorId: string;
  code: string;
  typeId: string;
  areaSqft: number;
  occupancy: OccupancyStatus;
  billingAccountId: string;
}

/** A person or organisation known to the society, with the facts that link them to flats. */
export interface SocietyPerson {
  id: string;
  ref: string;
  kind: 'individual' | 'organisation';
  /** As entered (free text keeps its script). */
  displayName: string;
  phone?: string;
  email?: string;
}

export type PersonRole = 'owner' | 'occupant' | 'payer';

/** One effective-dated fact: ownership, occupancy or liability for a flat. */
export interface FlatFact {
  id: string;
  role: PersonRole;
  flatId: string;
  flatCode: string;
  partyId: string;
  partyName: string;
  from: string;
  to?: string;
  /** Ownership share (percent, as text); occupancy kind; liability role. */
  sharePct?: string;
  occupancyKind?: 'owner' | 'tenant' | 'association';
  liability?: 'primary_payer' | 'co_payer' | 'guarantor';
  billingAccountId?: string;
}

export interface SiteSummary {
  id: string;
  name: string;
  city: string;
  legalEntityName: string;
  buildings: number;
  /** Registered flats (imported). */
  flats: number;
  occupied: number;
  vacant: number;
  /** Flats that can be billed (exempt flats are eligible and assessed zero). */
  eligible: number;
  /** Declared at contract time (Platform HQ); the import is checked against it. */
  declaredFlats: number;
  setupDone: number;
  setupTotal: number;
}

export const SETUP_STEPS = ['site', 'structure', 'flats', 'people', 'opening_balances', 'payee', 'charges', 'first_run', 'invitations'] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];

/** SITE-008 onboarding checklist: one step per A4 §1 row, each linked to its screen. */
export interface SetupStep {
  key: SetupStepKey;
  state: 'done' | 'next' | 'todo' | 'blocked' | 'later';
  href: string;
  /** Count shown with the step (flats imported, accounts with balances …). */
  count?: number;
  /** The step it waits for, when blocked. */
  waitsFor?: SetupStepKey;
  /** Gate in which a later step arrives (honest future state). */
  gate?: string;
}

export interface SiteOverview {
  site: SiteSummary;
  checklist: SetupStep[];
  buildings: Array<{ id: string; code: string; name: string; floors: number; flats: number; occupied: number; vacant: number; arrearsAccounts: number }>;
  types: SiteUnitType[];
  mode: SocietyDemoMode;
}

/** How the society demo starts: empty (onboarding from import), set up and ready to bill, or billed with collections open. */
export type SocietyDemoMode = 'fresh' | 'ready' | 'collecting';

/** A flat as the structure explorer shows it. */
export interface FlatTile {
  id: string;
  code: string;
  type: UnitTypeCode;
  occupancy: OccupancyStatus;
  ownerName?: string;
  payerName?: string;
  balance: Money;
  exempt: boolean;
}

export interface SiteStructure {
  siteId: string;
  buildings: Array<SiteBuilding & { levels: Array<{ floor: SiteFloor; flats: FlatTile[] }> }>;
}

/** Flat 360 (SITE-006): every connected fact of one flat, each linked to its own record. */
export interface FlatDetail {
  flat: SocietyFlat;
  siteName: string;
  building: SiteBuilding;
  floor: SiteFloor;
  type: SiteUnitType;
  owners: FlatFact[];
  occupants: FlatFact[];
  payers: FlatFact[];
  account: { id: string; accountNo: string; holderName: string; flats: Array<{ id: string; code: string }> };
  /** Who is liable for this flat on the evaluation date. */
  currentPayer?: FlatFact;
  balance: Money;
  exempt: boolean;
  /** Neighbouring flats on the same floor, for moving along the floor without searching. */
  floorFlats: Array<{ id: string; code: string }>;
  /** Liability changes for this flat: pending, approved, corrected (newest first). */
  changes: LiabilityChange[];
  /** First month not billed yet: the earliest a liability change may start. */
  firstOpenPeriod: string;
}

// ---------------------------------------------------------------------------------------------
// Imports (SITE-004 flats, SITE-007 opening balances)
// ---------------------------------------------------------------------------------------------

export const FLAT_IMPORT_COLUMNS = [
  'flat',
  'block',
  'floor',
  'type',
  'area_sqft',
  'owner_name',
  'owner_phone',
  'owner_since',
  'occupancy',
  'occupant_name',
  'occupant_phone',
  'occupant_since',
  'payer',
  'account',
] as const;
export type FlatImportColumn = (typeof FLAT_IMPORT_COLUMNS)[number];

export interface ImportProblem {
  column: string;
  /** Translation key under `sites:import.problems`. */
  code: string;
}

export interface ImportRow {
  line: number;
  values: Record<string, string>;
  status: 'valid' | 'error' | 'duplicate';
  problems: ImportProblem[];
  /** Duplicates: the first line with the same key, or 'existing' when it is already registered. */
  duplicateOf?: number | 'existing';
  /** Suggested fix for an error (column → value), offered, never applied silently. */
  suggestion?: Record<string, string>;
}

export interface ImportPreview {
  importId: string;
  kind: 'flats' | 'opening_balances';
  fileName: string;
  /** Fingerprint of the file content; re-running the same file is recognised. */
  fileHash: string;
  rows: ImportRow[];
  counts: { rows: number; valid: number; errors: number; duplicates: number; existing: number };
  /** Opening balances: sum of valid rows. */
  total?: Money;
  /** This exact file was committed before: committing again creates nothing. */
  alreadyCommitted: boolean;
  canCommit: boolean;
}

export interface ImportCommitResult {
  created: number;
  unchanged: number;
  alreadyCommitted: boolean;
}

export interface OpeningBalanceBatch {
  id: string;
  state: 'pending_approval' | 'approved' | 'returned';
  fileName: string;
  accounts: number;
  total: Money;
  importedBy: string;
  importedByName: string;
  importedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
  rows: Array<{ accountId: string; accountNo: string; flatCode: string; amount: Money }>;
}

// ---------------------------------------------------------------------------------------------
// People and billing accounts (CUS-001/003, RES-002, BILL-001/002)
// ---------------------------------------------------------------------------------------------

export interface PersonRow {
  person: SocietyPerson;
  facts: FlatFact[];
  /** Roles held today. */
  roles: PersonRole[];
}

export interface PersonDetail extends PersonRow {
  accounts: Array<{ id: string; accountNo: string; balance: Money }>;
}

export interface BillingAccountRow {
  id: string;
  accountNo: string;
  holderName: string;
  flats: Array<{ id: string; code: string }>;
  payers: Array<{ partyId: string; name: string; flatCode: string }>;
  balance: Money;
  openInvoices: number;
  /** clear: nothing owed; due: owed, not yet overdue; arrears: something overdue; credit: paid ahead. */
  status: 'clear' | 'due' | 'arrears' | 'credit';
  overdue: Money;
}

export interface BillingAccountDetail extends BillingAccountRow {
  kind: 'dues';
  siteId: string;
  legalEntityName: string;
  /** Per flat: who is liable and since when (history kept, never rewritten). */
  liabilities: Array<{ flatId: string; flatCode: string; facts: FlatFact[] }>;
}

export interface OccupancyRow {
  flatId: string;
  flatCode: string;
  building: string;
  occupancy: OccupancyStatus;
  occupantNames: string[];
  ownerNames: string[];
  since?: string;
  payerName?: string;
}
