import type { InventoryEventKind, ProjectState, SetupBasics, SetupEvent, SetupSite, ProjectSetupStep, SetupStructure, StorageKind, StorageLocation, StorageState } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';

/**
 * Gate E.2 module-local, versioned demo state (provisional; replace with E.0's `developer/state.ts`
 * section at Wave 1 integration). It lives in the tenant's own demo partition, so another organisation
 * never reads it, and `/demo/reset` discards it with the rest of the session. A stored state of another
 * version is dropped and seeded again.
 *
 * - Storage units (INV-010) are separate assets (V2.1 01 §9), seeded per project from the fictional table
 *   below; none starts allocated, so every allocation in the history was made in this session.
 * - Project setup records (PRJ-003) and the module's audit entries are created by the demo session only.
 * - Holds are not kept here: they stay in the CRM hold store (`ctx.demo.holds()`), the one place both the
 *   CRM screens and these screens read and write, so a unit can never be held twice.
 */

export const INVENTORY_SECTION = 'developer.inventory';
export const INVENTORY_VERSION = 1;

export interface StorageRecord {
  id: string;
  ref: string;
  projectId: string;
  kind: StorageKind;
  location: StorageLocation;
  areaSqft: number;
  state: StorageState;
  /** Translation key of the reason a unit is out of service (demo seed). */
  outOfServiceKey?: string;
  allocation?: { unitId: string; at: string; byPrincipal: string; byName: string; note?: string };
  history: Array<{ at: string; action: 'allocated' | 'released'; byPrincipal: string; byName: string; unitId: string; note?: string }>;
}

export interface SetupRecordState {
  id: string;
  ref: string;
  state: ProjectState;
  basics: SetupBasics | null;
  site: SetupSite | null;
  structure: SetupStructure | null;
  completed: ProjectSetupStep[];
  makerPrincipal: string;
  makerName: string;
  createdAt: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  returnReason?: string;
  history: SetupEvent[];
}

export interface EventRecord {
  id: string;
  at: string;
  kind: InventoryEventKind;
  projectId: string;
  actorPrincipal: string;
  actorName: string;
  unitId?: string;
  unitRef?: string;
  storageId?: string;
  storageRef?: string;
  setupId?: string;
  setupRef?: string;
  /** The lead a hold was for: kept for readers who may see leads, removed for the others. */
  leadId?: string;
  leadRef?: string;
  note?: string;
}

export interface IdemEntry {
  op: string;
  principal: string;
  target: string;
  fingerprint: string;
  result: unknown;
}

export interface InventoryState {
  version: typeof INVENTORY_VERSION;
  seq: number;
  storage: StorageRecord[];
  setup: SetupRecordState[];
  events: EventRecord[];
  idempotency: Record<string, IdemEntry>;
}

interface StorageSeed {
  id: string;
  ref: string;
  kind: StorageKind;
  location: StorageLocation;
  areaSqft: number;
  outOfServiceKey?: string;
}

const locker = (prefix: string, refPrefix: string, tower: string, n: number, area: number): StorageSeed => ({
  id: `stg_${prefix}${tower.toLowerCase()}${String(n).padStart(2, '0')}`,
  ref: `${refPrefix}-ST-${tower}${String(n).padStart(2, '0')}`,
  kind: 'locker',
  location: { tower, basement: 1 },
  areaSqft: area,
});

/** Fictional storage per project (ids stable; Plaza's are never reachable: its inventory is not licensed). */
const STORAGE_SEEDS: Readonly<Record<string, readonly StorageSeed[]>> = {
  prj_heights: [
    ...[28, 28, 32, 32, 36, 40].map((a, i) => locker('lh_', 'LH', 'A', i + 1, a)),
    ...[28, 32, 32, 36].map((a, i) => ({ ...locker('lh_', 'LH', 'B', i + 1, a), ...(i === 3 ? { outOfServiceKey: 'projects:storage.outOfService.damp' } : {}) })),
    ...[30, 34, 38].map((a, i) => locker('lh_', 'LH', 'C', i + 1, a)),
    ...[96, 110, 120].map((a, i): StorageSeed => ({ id: `stg_lh_r${String(i + 1).padStart(2, '0')}`, ref: `LH-ST-R${String(i + 1).padStart(2, '0')}`, kind: 'storeroom', location: { tower: 'A', basement: 2 }, areaSqft: a })),
  ],
  prj_gardens: [1, 2].flatMap((phase) =>
    [120, 135, 150].map((a, i): StorageSeed => ({ id: `stg_lg_p${phase}_${String(i + 1).padStart(2, '0')}`, ref: `LG-ST-P${phase}-${String(i + 1).padStart(2, '0')}`, kind: 'storeroom', location: { block: `Phase ${phase}` }, areaSqft: a })),
  ),
  prj_cb_towers: [...[30, 30, 36].map((a, i) => locker('cb_', 'CB', 'A', i + 1, a)), ...[30, 36].map((a, i) => locker('cb_', 'CB', 'B', i + 1, a))],
  prj_cb_plaza: [locker('cb_', 'CB', 'P', 1, 60), locker('cb_', 'CB', 'P', 2, 60)],
};

function seed(ctx: HandlerContext): InventoryState {
  const storage = ctx.data.projects.flatMap((p) =>
    (STORAGE_SEEDS[p.id] ?? []).map((s): StorageRecord => ({ ...s, projectId: p.id, state: s.outOfServiceKey ? 'out_of_service' : 'available', history: [] })),
  );
  return { version: INVENTORY_VERSION, seq: 0, storage, setup: [], events: [], idempotency: {} };
}

/** The tenant's E.2 state, created (or re-seeded after a version change) on first use. */
export function inventoryState(ctx: HandlerContext): InventoryState {
  const s = ctx.demo.section<InventoryState>(INVENTORY_SECTION, () => seed(ctx));
  if (s.version !== INVENTORY_VERSION) {
    ctx.demo.resetSection(INVENTORY_SECTION);
    return ctx.demo.section<InventoryState>(INVENTORY_SECTION, () => seed(ctx));
  }
  return s;
}

export const saveState = (ctx: HandlerContext) => ctx.demo.save();

/** The demo clock for this module's audit (the same browser clock as holds, Issue #23). */
export const nowIso = () => new Date().toISOString();

export function nextSeq(s: InventoryState): number {
  s.seq += 1;
  return s.seq;
}

export function addEvent(ctx: HandlerContext, s: InventoryState, e: Omit<EventRecord, 'id' | 'at' | 'actorPrincipal' | 'actorName'>): void {
  s.events.unshift({ id: `ive_${nextSeq(s)}`, at: nowIso(), actorPrincipal: ctx.persona?.principalId ?? '', actorName: ctx.persona?.displayName ?? '', ...e });
}
