import type {
  ActiveHoldRow,
  AvailabilityBucket,
  AvailabilitySnapshot,
  BucketCounts,
  UnitDeliveryState,
  InventoryEvent,
  InventoryGroupRow,
  MatrixCell,
  MatrixGroup,
  Money,
  ProjectSetupRecord,
  ProjectSummary,
  ProjectUnitFigures,
  StorageUnitView,
  Unit,
  UnitHoldView,
  UnitInventoryDetail,
  UnitMatrix,
  UnitType,
  ProjectState,
  Project,
} from '@repo/contracts';
import { ALL_PERSONAS } from '../../people';
import { can, type HandlerContext } from '../../handler-types';
import { directoryTenant } from '../../tenant-directory';
import { activeHolds, bucketOf, countBuckets, dimensionsOf, emptyBuckets, lapsedHolds, legacyOf, mayRelease, requestNow, type HoldRecord } from './rules';
import { inventoryVisible, leadVisible, setupVisible, tenantProject, withheld } from './scope';
import type { EventRecord, InventoryState, SetupRecordState, StorageRecord } from './state';

/**
 * Gate E.2 read models. Every figure is computed from the tenant's records at the moment of the request
 * (never stored counts), for the projects the reader may see, and every embedded history is projected for
 * the reader before it is returned (§4.4): a hold's lead reference only for readers who may see that lead.
 */

export const ROUTES = {
  project360: (id: string) => `/backoffice/prj/project-360-workspace?record=${id}`,
  matrix: (q: Record<string, string> = {}) => `/backoffice/inv/unit-matrix${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`,
} as const;

export const holdsOf = (ctx: HandlerContext) => ctx.demo.holds() as Readonly<Record<string, HoldRecord>>;
/** The holds in force for this request (one clock reading per request). */
export const liveHolds = (ctx: HandlerContext) => activeHolds(holdsOf(ctx), requestNow(ctx.req));

/** Display name of a staff principal of this tenant (never another organisation's). */
export function staffName(ctx: HandlerContext, principalId: string | undefined): string | undefined {
  if (!principalId) return undefined;
  return ALL_PERSONAS.find((p) => p.principalId === principalId && p.tenantId === ctx.tenantId)?.displayName;
}

const money = (amount: number): Money => ({ amount: `${Math.round(amount)}.00`, currency: 'PKR' });

export interface UnitFacts {
  unit: Unit;
  dims: ReturnType<typeof dimensionsOf>;
  bucket: AvailabilityBucket;
  live?: HoldRecord;
}

export function factsOf(unit: Unit, live: Readonly<Record<string, HoldRecord>>): UnitFacts {
  const dims = dimensionsOf(unit.status);
  const hold = live[unit.id];
  // A hold in force on stock that is no longer available cannot exist through these endpoints; if the CRM
  // path ever left one, the seeded state wins (never double counted).
  const heldLive = !!hold && dims.inventory === 'available';
  return { unit, dims, bucket: bucketOf(dims, heldLive), ...(heldLive ? { live: hold } : {}) };
}

/** A hold as the reader may see it (§4.4: the lead only for readers who may see that lead). */
export function holdView(ctx: HandlerContext, f: UnitFacts): UnitHoldView | undefined {
  if (f.live) {
    const lead = ctx.demo.leads(ctx.data.leads).find((l) => l.id === f.live!.leadId);
    const showLead = !!lead && leadVisible(ctx, lead.projectId);
    const holder = staffName(ctx, f.live.principalId);
    return {
      source: 'live',
      until: f.live.until,
      ...(holder ? { holderName: holder } : {}),
      mine: mayRelease(f.live, ctx.persona?.principalId, requestNow(ctx.req)),
      ...(showLead ? { leadRef: f.live.leadRef, leadId: f.live.leadId } : {}),
    };
  }
  if (f.dims.inventory === 'held') return { source: 'seed', mine: false };
  return undefined;
}

/** Units of the projects the reader may see in inventory, with the header filter applied (lists). */
export function listedProjects(ctx: HandlerContext): Project[] {
  return ctx.data.projects.filter((p) => ctx.allowsProject(p.id) && inventoryVisible(ctx, p.id));
}

const unitsOf = (ctx: HandlerContext, projectId: string) => ctx.data.units.filter((u) => u.projectId === projectId);

function floorLevel(ctx: HandlerContext, unit: Unit): number | undefined {
  return unit.floorId ? ctx.data.floors.find((f) => f.id === unit.floorId)?.level : undefined;
}

/** Storage allocated to each unit (unit id → count). */
function storageByUnit(s: InventoryState): Map<string, number> {
  const out = new Map<string, number>();
  for (const st of s.storage) if (st.state === 'allocated' && st.allocation) out.set(st.allocation.unitId, (out.get(st.allocation.unitId) ?? 0) + 1);
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Unit matrix
// ---------------------------------------------------------------------------------------------------

export interface MatrixFilters {
  tower?: string;
  block?: string;
  floor?: number;
  type?: UnitType;
  bucket?: AvailabilityBucket;
  delivery?: UnitDeliveryState;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
}

const passes = (ctx: HandlerContext, f: UnitFacts, flt: MatrixFilters): boolean => {
  const u = f.unit;
  if (flt.tower && u.towerId !== flt.tower) return false;
  if (flt.block && u.block !== flt.block) return false;
  if (flt.floor !== undefined && floorLevel(ctx, u) !== flt.floor) return false;
  if (flt.type && u.type !== flt.type) return false;
  if (flt.bucket && f.bucket !== flt.bucket) return false;
  if (flt.delivery && f.dims.delivery !== flt.delivery) return false;
  if (flt.q && !u.ref.toLowerCase().replace(/[\s-]/g, '').includes(flt.q.toLowerCase().replace(/[\s-]/g, ''))) return false;
  const price = Number(u.price.amount);
  if (flt.minPrice !== undefined && price < flt.minPrice) return false;
  if (flt.maxPrice !== undefined && price > flt.maxPrice) return false;
  if (flt.minArea !== undefined && u.areaSqft < flt.minArea) return false;
  if (flt.maxArea !== undefined && u.areaSqft > flt.maxArea) return false;
  return true;
};

export function buildMatrix(ctx: HandlerContext, s: InventoryState, project: Project | undefined, projects: Project[], flt: MatrixFilters): UnitMatrix {
  const asOf = new Date(requestNow(ctx.req)).toISOString();
  if (!project) return { project: null, projects: projects.map((p) => ({ id: p.id, name: p.name })), groups: [], counts: emptyBuckets(), total: 0, matched: 0, types: [], asOf };
  const live = liveHolds(ctx);
  const storage = storageByUnit(s);
  const units = unitsOf(ctx, project.id);
  const facts = units.map((u) => factsOf(u, live));
  const cell = (f: UnitFacts, position: number): MatrixCell => {
    const hold = holdView(ctx, f);
    const level = floorLevel(ctx, f.unit);
    return {
      id: f.unit.id,
      ref: f.unit.ref,
      type: f.unit.type,
      areaSqft: f.unit.areaSqft,
      price: f.unit.price,
      position,
      ...(level !== undefined ? { floor: level } : {}),
      ...(f.unit.towerId ? { towerId: f.unit.towerId } : {}),
      ...(f.unit.block ? { block: f.unit.block } : {}),
      bucket: f.bucket,
      dimensions: f.dims,
      legacy: legacyOf(f.dims),
      ...(hold ? { hold } : {}),
      storage: storage.get(f.unit.id) ?? 0,
      match: passes(ctx, f, flt),
    };
  };
  const byRef = (a: UnitFacts, b: UnitFacts) => a.unit.ref.localeCompare(b.unit.ref);
  const groups: MatrixGroup[] = [];
  for (const tower of ctx.data.towers.filter((t) => t.projectId === project.id)) {
    const inTower = facts.filter((f) => f.unit.towerId === tower.id);
    const floors = ctx.data.floors
      .filter((fl) => fl.towerId === tower.id)
      .sort((a, b) => b.level - a.level)
      .map((fl) => ({ level: fl.level, id: fl.id, cells: inTower.filter((f) => f.unit.floorId === fl.id).sort(byRef).map((f, i) => cell(f, i + 1)) }));
    groups.push({ id: tower.id, kind: 'tower', label: tower.name, floors, counts: countBuckets(inTower.map((f) => f.bucket)) });
  }
  for (const block of ctx.data.blocks.filter((b) => b.projectId === project.id)) {
    const inBlock = facts.filter((f) => f.unit.block === block.label).sort(byRef);
    groups.push({ id: block.id, kind: 'phase', label: block.label, cells: inBlock.map((f, i) => cell(f, i + 1)), counts: countBuckets(inBlock.map((f) => f.bucket)) });
  }
  const matched = facts.filter((f) => passes(ctx, f, flt)).length;
  return {
    project: { id: project.id, ref: project.ref, name: project.name, kind: project.kind },
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    groups,
    counts: countBuckets(facts.map((f) => f.bucket)),
    total: facts.length,
    matched,
    types: [...new Set(units.map((u) => u.type))],
    asOf,
  };
}

// ---------------------------------------------------------------------------------------------------
// Audit projection
// ---------------------------------------------------------------------------------------------------

/** One stored entry as the reader may see it: the lead reference only for readers who may see leads. */
export function projectEvent(ctx: HandlerContext, e: EventRecord): InventoryEvent {
  const showLead = !!e.leadRef && leadVisible(ctx, e.projectId);
  return {
    id: e.id,
    at: e.at,
    kind: e.kind,
    projectId: e.projectId,
    actorName: e.actorName,
    refs: {
      ...(e.unitRef ? { unit: e.unitRef, unitId: e.unitId! } : {}),
      ...(e.storageRef ? { storage: e.storageRef, storageId: e.storageId! } : {}),
      ...(e.setupRef ? { setup: e.setupRef } : {}),
      ...(showLead ? { lead: e.leadRef! } : {}),
    },
    ...(e.note ? { note: e.note } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------
// Unit quick view (INV-002)
// ---------------------------------------------------------------------------------------------------

export function buildUnitDetail(ctx: HandlerContext, s: InventoryState, unit: Unit): UnitInventoryDetail {
  const live = liveHolds(ctx);
  const f = factsOf(unit, live);
  const project = tenantProject(ctx, unit.projectId)!;
  const tower = unit.towerId ? ctx.data.towers.find((t) => t.id === unit.towerId) : undefined;
  const level = floorLevel(ctx, unit);
  const hold = holdView(ctx, f);
  const canHold = can(ctx, 'unit.hold', 'operational') && f.bucket === 'available';
  return {
    id: unit.id,
    ref: unit.ref,
    project: { id: project.id, name: project.name, kind: project.kind },
    ...(tower ? { towerId: tower.id, towerName: tower.name } : {}),
    ...(level !== undefined ? { floor: level } : {}),
    ...(unit.block ? { block: unit.block } : {}),
    type: unit.type,
    areaSqft: unit.areaSqft,
    price: unit.price,
    dimensions: f.dims,
    legacy: legacyOf(f.dims),
    bucket: f.bucket,
    ...(hold ? { hold } : {}),
    canHold,
    canRelease: !!hold?.mine && can(ctx, 'unit.hold', 'operational'),
    storage: s.storage
      .filter((st) => st.state === 'allocated' && st.allocation?.unitId === unit.id)
      .map((st) => ({ storageId: st.id, storageRef: st.ref, location: st.location, allocatedAt: st.allocation!.at, byName: st.allocation!.byName })),
    history: s.events.filter((e) => e.unitId === unit.id).map((e) => projectEvent(ctx, e)),
    asOf: new Date(requestNow(ctx.req)).toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------
// Live availability (INV-008)
// ---------------------------------------------------------------------------------------------------

export function groupRows(ctx: HandlerContext, project: Project, facts: UnitFacts[]): InventoryGroupRow[] {
  const rows: InventoryGroupRow[] = [];
  for (const t of ctx.data.towers.filter((x) => x.projectId === project.id)) {
    const own = facts.filter((f) => f.unit.towerId === t.id);
    rows.push({ id: t.id, label: t.name, kind: 'tower', floors: t.floorCount, total: own.length, buckets: countBuckets(own.map((f) => f.bucket)), href: ROUTES.matrix({ project: project.id, tower: t.id }) });
  }
  for (const b of ctx.data.blocks.filter((x) => x.projectId === project.id)) {
    const own = facts.filter((f) => f.unit.block === b.label);
    rows.push({ id: b.id, label: b.label, kind: 'phase', total: own.length, buckets: countBuckets(own.map((f) => f.bucket)), href: ROUTES.matrix({ project: project.id, block: b.label }) });
  }
  return rows;
}

export function buildAvailability(ctx: HandlerContext, projects: Project[]): AvailabilitySnapshot {
  const now = requestNow(ctx.req);
  const all = holdsOf(ctx);
  const live = activeHolds(all, now);
  const visibleIds = new Set(projects.map((p) => p.id));
  const out = projects.map((p) => {
    const facts = unitsOf(ctx, p.id).map((u) => factsOf(u, live));
    return { projectId: p.id, name: p.name, kind: p.kind, rows: groupRows(ctx, p, facts), counts: countBuckets(facts.map((f) => f.bucket)), total: facts.length, facts };
  });
  const counts = emptyBuckets();
  for (const p of out) for (const k of Object.keys(counts) as AvailabilityBucket[]) counts[k] += p.counts[k];
  const holds: ActiveHoldRow[] = out
    .flatMap((p) => p.facts.filter((f) => f.live))
    .map((f) => {
      const view = holdView(ctx, f)!;
      return {
        unitId: f.unit.id,
        unitRef: f.unit.ref,
        projectId: f.unit.projectId,
        projectName: tenantProject(ctx, f.unit.projectId)!.name,
        until: f.live!.until,
        holderName: view.holderName ?? '',
        mine: view.mine,
        ...(view.leadRef ? { leadRef: view.leadRef } : {}),
      };
    })
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until));
  const lapsed = Object.entries(lapsedHolds(all, now))
    .map(([unitId, h]) => ({ unit: ctx.data.units.find((u) => u.id === unitId), h }))
    .filter((x): x is { unit: Unit; h: HoldRecord } => !!x.unit && visibleIds.has(x.unit.projectId))
    .map(({ unit, h }) => ({ unitId: unit.id, unitRef: unit.ref, projectName: tenantProject(ctx, unit.projectId)!.name, until: h.until }))
    .sort((a, b) => Date.parse(b.until) - Date.parse(a.until));
  const seededFacts = out.flatMap((p) => p.facts);
  return {
    asOf: new Date(now).toISOString(),
    projects: out.map(({ facts: _f, ...p }) => p),
    counts,
    total: out.reduce((n, p) => n + p.total, 0),
    holds,
    lapsed,
    seeded: {
      held: seededFacts.filter((f) => f.dims.inventory === 'held').length,
      reserved: seededFacts.filter((f) => f.dims.inventory === 'reserved').length,
      booked: seededFacts.filter((f) => f.bucket === 'booked').length,
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Projects (PRJ-001, PRJ-002)
// ---------------------------------------------------------------------------------------------------

export function unitFigures(ctx: HandlerContext, projectId: string): ProjectUnitFigures {
  const live = liveHolds(ctx);
  const facts = unitsOf(ctx, projectId).map((u) => factsOf(u, live));
  const available = facts.filter((f) => f.bucket === 'available').map((f) => Number(f.unit.price.amount));
  return {
    total: facts.length,
    buckets: countBuckets(facts.map((f) => f.bucket)),
    fromPrice: available.length ? money(Math.min(...available)) : null,
    soldListValue: money(facts.filter((f) => f.bucket === 'booked').reduce((n, f) => n + Number(f.unit.price.amount), 0)),
  };
}

const legalEntityName = (ctx: HandlerContext, id: string) => {
  const t = ctx.tenantId ? directoryTenant(ctx.tenantId) : undefined;
  return t && t.id && id ? t.legalName : id;
};

const siteName = (ctx: HandlerContext, siteId: string) => (ctx.tenantId ? directoryTenant(ctx.tenantId)?.sites.find((x) => x.id === siteId)?.name : undefined) ?? siteId;

export function projectSummary(ctx: HandlerContext, s: InventoryState, p: Project): ProjectSummary {
  const invWithheld = withheld(ctx, 'inventory', p.id, 'unit.view');
  const leadsWithheld = withheld(ctx, 'crm', p.id, 'lead.view');
  const leads = leadsWithheld ? null : ctx.demo.leads(ctx.data.leads).filter((l) => l.projectId === p.id);
  const storage = s.storage.filter((x) => x.projectId === p.id);
  return {
    id: p.id,
    ref: p.ref,
    name: p.name,
    city: p.city,
    kind: p.kind,
    state: 'active',
    siteId: p.siteId,
    siteName: siteName(ctx, p.siteId),
    legalEntityId: p.legalEntityId,
    legalEntityName: legalEntityName(ctx, p.legalEntityId),
    units: invWithheld ? null : unitFigures(ctx, p.id),
    ...(invWithheld ? { unitsWithheld: invWithheld } : {}),
    leads: leads ? { open: leads.filter((l) => !['converted', 'lost', 'unqualified', 'dormant'].includes(l.status)).length, total: leads.length } : null,
    ...(leadsWithheld ? { leadsWithheld } : {}),
    storage: invWithheld ? null : { total: storage.length, allocated: storage.filter((x) => x.state === 'allocated').length },
    structure: {
      towers: ctx.data.towers.filter((t) => t.projectId === p.id).length,
      phases: ctx.data.blocks.filter((b) => b.projectId === p.id).length,
      floors: ctx.data.towers.filter((t) => t.projectId === p.id).reduce((n, t) => n + t.floorCount, 0),
    },
    href: ROUTES.project360(p.id),
  };
}

/** A project activated through setup in this session: active, with its planned structure and no units yet. */
export function setupSummary(ctx: HandlerContext, r: SetupRecordState): ProjectSummary {
  const towers = r.structure?.towers ?? [];
  return {
    id: r.id,
    ref: r.basics?.code ?? r.ref,
    name: r.basics?.name ?? r.ref,
    city: r.basics?.city ?? '',
    kind: r.basics?.kind ?? 'towers',
    state: r.state,
    siteId: r.site?.siteId ?? '',
    siteName: r.site ? siteName(ctx, r.site.siteId) : '',
    legalEntityId: r.site?.legalEntityId ?? '',
    legalEntityName: r.site ? legalEntityName(ctx, r.site.legalEntityId) : '',
    units: { total: 0, buckets: emptyBuckets(), fromPrice: null, soldListValue: money(0) },
    leads: null,
    leadsWithheld: 'not_in_plan',
    storage: { total: 0, allocated: 0 },
    structure: { towers: towers.length, phases: r.structure?.phases.length ?? 0, floors: towers.reduce((n, t) => n + t.floors, 0) },
    setupRecordId: r.id,
    href: ROUTES.project360(r.id),
  };
}

// ---------------------------------------------------------------------------------------------------
// Project setup (PRJ-003)
// ---------------------------------------------------------------------------------------------------

export const plannedUnits = (r: Pick<SetupRecordState, 'structure'>) =>
  (r.structure?.towers ?? []).reduce((n, t) => n + t.floors * t.unitsPerFloor, 0) + (r.structure?.phases ?? []).reduce((n, p) => n + p.plots, 0);

export function setupView(ctx: HandlerContext, r: SetupRecordState): ProjectSetupRecord {
  const me = ctx.persona?.principalId ?? '';
  const mine = r.makerPrincipal === me;
  const editable: ProjectState[] = ['draft', 'returned'];
  const approver = can(ctx, 'project.approve', 'operational');
  return {
    id: r.id,
    ref: r.ref,
    state: r.state,
    basics: r.basics,
    site: r.site,
    structure: r.structure,
    completed: [...r.completed],
    makerName: r.makerName,
    createdAt: r.createdAt,
    ...(r.submittedAt ? { submittedAt: r.submittedAt } : {}),
    ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}),
    ...(r.decidedByName ? { decidedByName: r.decidedByName } : {}),
    ...(r.returnReason ? { returnReason: r.returnReason } : {}),
    history: [...r.history].reverse(),
    plannedUnits: plannedUnits(r),
    mine,
    canEdit: mine && editable.includes(r.state) && can(ctx, 'project.manage', 'operational'),
    canSubmit: mine && editable.includes(r.state) && can(ctx, 'project.manage', 'operational') && (['basics', 'site', 'structure'] as const).every((x) => r.completed.includes(x)),
    canDecide: approver && !mine && r.state === 'submitted',
    ...(approver && mine && r.state === 'submitted' ? { decideBlocked: 'own_request' as const } : {}),
  };
}

export const visibleSetup = (ctx: HandlerContext, s: InventoryState) => s.setup.filter((r) => setupVisible(ctx, r));

// ---------------------------------------------------------------------------------------------------
// Storage (INV-010)
// ---------------------------------------------------------------------------------------------------

export function storageView(ctx: HandlerContext, st: StorageRecord): StorageUnitView {
  const unitRef = (id: string) => ctx.data.units.find((u) => u.id === id)?.ref ?? id;
  return {
    id: st.id,
    ref: st.ref,
    projectId: st.projectId,
    projectName: tenantProject(ctx, st.projectId)?.name ?? st.projectId,
    kind: st.kind,
    location: st.location,
    areaSqft: st.areaSqft,
    state: st.state,
    ...(st.outOfServiceKey ? { outOfServiceKey: st.outOfServiceKey } : {}),
    ...(st.allocation ? { allocation: { unitId: st.allocation.unitId, unitRef: unitRef(st.allocation.unitId), at: st.allocation.at, byName: st.allocation.byName, ...(st.allocation.note ? { note: st.allocation.note } : {}) } } : {}),
    history: [...st.history].reverse().map((h) => ({ at: h.at, action: h.action, byName: h.byName, unitRef: unitRef(h.unitId), ...(h.note ? { note: h.note } : {}) })),
  };
}

/** Bucket counts over a set of facts (exported for the vectors). */
export const bucketsOf = (facts: UnitFacts[]): BucketCounts => countBuckets(facts.map((f) => f.bucket));

