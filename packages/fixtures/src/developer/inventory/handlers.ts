import {
  AVAILABILITY_BUCKETS,
  UNIT_DELIVERY_STATES,
  PROJECT_360_TABS,
  PROJECT_FILTERS,
  PROJECT_SORTS,
  STORAGE_FILTERS,
  type AvailabilityBucket,
  type AvailabilitySnapshot,
  type UnitDeliveryState,
  type HoldLeadOption,
  type ModuleKey,
  type Party,
  type Permission,
  type Project360,
  type Project360Tab,
  type Project360TabInfo,
  type ProjectFilter,
  type ProjectKind,
  type ProjectSetupList,
  type ProjectSetupRecord,
  type ProjectSort,
  type ProjectsPortfolio,
  type SetupBasics,
  type ProjectSetupStep,
  type SetupStructure,
  type StorageFilter,
  type StorageList,
  type StorageTarget,
  type StorageUnitView,
  type Unit,
  type UnitInventoryDetail,
  type UnitMatrix,
  type UnitType,
} from '@repo/contracts';
import { ownerName } from '../../crm-data';
import { can, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { directoryTenant } from '../../tenant-directory';
import { remember, replayOf } from './idempotency';
import { addBuckets, dimensionsOf, emptyBuckets, holdUntil, isSold, mayRelease, requestNow, type HoldRecord } from './rules';
import { fieldProblem, inventoryVisible, leadVisible, licensedOnSite, organisationWide, problem, PROJECT_READERS, projectVisible, scopedUnit, setupVisible, tenantProject } from './scope';
import { addEvent, inventoryState, nextSeq, nowIso, saveState, type InventoryState, type SetupRecordState, type StorageRecord } from './state';
import { buildAvailability, buildMatrix, buildUnitDetail, factsOf, groupRows, holdsOf, listedProjects, liveHolds, projectEvent, projectSummary, setupSummary, setupView, storageView, visibleSetup, type MatrixFilters } from './views';

/**
 * Gate E.2 mock API (provisional; reconcile with E.0 at Wave 1 integration): projects (PRJ-001…003)
 * and inventory (INV-001, -002, -008, -010). Every changing handler follows plan §4.2:
 * 1. module, feature and permission (declared here, checked by the transport before the handler runs);
 * 2. authority over the scope (the project's site licence and the person's scope);
 * 3. ids from the path: out of scope answers exactly like never issued (404 `not_found`);
 *    then a bound idempotency replay (§4.5), only after authority was checked again;
 * 4. the record's state; 5. ids from the body (hidden and invented ids refused alike);
 * 6. maker ≠ checker by principal; 7. validation; then mutate and audit.
 * A refusal changes nothing: every write happens after the last check.
 */

const query = (ctx: HandlerContext) => (ctx.req.query ?? {}) as Record<string, string | undefined>;
const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<T> & Record<string, unknown>;
const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: string | undefined) => (v === undefined || v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

const UNIT_TYPES: readonly UnitType[] = ['apartment_1bed', 'apartment_2bed', 'apartment_3bed', 'penthouse', 'villa', 'plot', 'shop'];
const OPEN_LEAD: readonly string[] = ['new', 'assigned', 'contacted', 'qualified'];

// ---------------------------------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------------------------------

function partyName(ctx: HandlerContext, partyId: string): string {
  const session = ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties;
  return (session.find((p) => p.id === partyId) ?? ctx.data.parties.find((p) => p.id === partyId))?.displayName ?? '—';
}

/** Leads a unit may be held for: open leads of the unit's project the person may see. */
function holdLeads(ctx: HandlerContext, unit: Unit) {
  if (!leadVisible(ctx, unit.projectId)) return [];
  return ctx.demo.leads(ctx.data.leads).filter((l) => l.projectId === unit.projectId && OPEN_LEAD.includes(l.status));
}

/** A storage unit named in a path: of a project whose inventory the person may see, else like an unknown id. */
function scopedStorage(ctx: HandlerContext, s: InventoryState, id: string | undefined): StorageRecord {
  const st = id ? s.storage.find((x) => x.id === id) : undefined;
  if (!st || !inventoryVisible(ctx, st.projectId)) notFound(ctx);
  return st;
}

/** A setup record named in a path, visible to the person, else like an unknown id. */
function scopedSetup(ctx: HandlerContext, s: InventoryState, id: string | undefined): SetupRecordState {
  const r = id ? s.setup.find((x) => x.id === id) : undefined;
  if (!r || !setupVisible(ctx, r)) notFound(ctx);
  return r;
}

/** Sites a new project may attach to: this organisation's sites with inventory licensed, with the site's legal entity. */
function setupSites(ctx: HandlerContext): ProjectSetupList['sites'] {
  const tenant = ctx.tenantId ? directoryTenant(ctx.tenantId) : undefined;
  if (!tenant) return [];
  const fallbackEntity = ctx.data.projects[0]?.legalEntityId;
  return tenant.sites
    .filter((site) => licensedOnSite(ctx, 'inventory', site.id) && licensedOnSite(ctx, 'projects', site.id))
    .flatMap((site) => {
      const legalEntityId = ctx.data.projects.find((p) => p.siteId === site.id)?.legalEntityId ?? fallbackEntity;
      return legalEntityId ? [{ id: site.id, name: site.name, city: site.city, legalEntityId, legalEntityName: tenant.legalName }] : [];
    });
}

// ---------------------------------------------------------------------------------------------------
// Project setup validation (PRJ-003). Every field is checked before anything is stored.
// ---------------------------------------------------------------------------------------------------

const KINDS: readonly ProjectKind[] = ['towers', 'plots', 'commercial'];
const CODE = /^[A-Z0-9]{2,5}$/;
const CITY = /^[\p{L}][\p{L} .'-]{1,39}$/u;

function checkBasics(ctx: HandlerContext, s: InventoryState, raw: unknown, self?: string): SetupBasics {
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = text(b.name, 80);
  const code = text(b.code, 10).toUpperCase();
  const city = text(b.city, 60);
  const kind = oneOf(KINDS, typeof b.kind === 'string' ? b.kind : undefined);
  const errors: Record<string, Array<{ code: string; params?: Record<string, string> }>> = {};
  if (name.length < 3 || name.length > 60) errors.name = [{ code: 'projects:problems.nameLength' }];
  if (!CODE.test(code)) errors.code = [{ code: 'projects:problems.codeFormat' }];
  else if (ctx.data.projects.some((p) => p.ref.toUpperCase() === code) || s.setup.some((r) => r.id !== self && r.basics?.code === code)) errors.code = [{ code: 'projects:problems.codeTaken' }];
  if (!CITY.test(city)) errors.city = [{ code: 'projects:problems.city' }];
  if (!kind) errors.kind = [{ code: 'projects:problems.kind' }];
  if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
  return { name, code, city, kind: kind! };
}

function checkStructure(ctx: HandlerContext, kind: ProjectKind, raw: unknown): SetupStructure {
  const b = (raw ?? {}) as { towers?: unknown; phases?: unknown };
  const towers = Array.isArray(b.towers) ? b.towers : [];
  const phases = Array.isArray(b.phases) ? b.phases : [];
  const errors: Record<string, Array<{ code: string; params?: Record<string, string> }>> = {};
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN);
  const out: SetupStructure = { towers: [], phases: [] };
  if (kind === 'plots') {
    if (towers.length) errors.towers = [{ code: 'projects:problems.noTowersForPlots' }];
    if (phases.length < 1 || phases.length > 6) errors.phases = [{ code: 'projects:problems.phaseCount' }];
    const seen = new Set<string>();
    phases.slice(0, 6).forEach((p, i) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const label = text(x.label, 40);
      const plots = int(x.plots);
      if (label.length < 1 || label.length > 20) errors[`phases.${i}.label`] = [{ code: 'projects:problems.phaseLabel' }];
      else if (seen.has(label.toLowerCase())) errors[`phases.${i}.label`] = [{ code: 'projects:problems.duplicateName' }];
      seen.add(label.toLowerCase());
      if (!(plots >= 1 && plots <= 400)) errors[`phases.${i}.plots`] = [{ code: 'projects:problems.plotCount' }];
      out.phases.push({ label, plots });
    });
  } else {
    if (phases.length) errors.phases = [{ code: 'projects:problems.noPhasesForTowers' }];
    if (towers.length < 1 || towers.length > 6) errors.towers = [{ code: 'projects:problems.towerCount' }];
    const seen = new Set<string>();
    towers.slice(0, 6).forEach((t, i) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const name = text(x.name, 30);
      const floors = int(x.floors);
      const perFloor = int(x.unitsPerFloor);
      if (name.length < 1 || name.length > 12) errors[`towers.${i}.name`] = [{ code: 'projects:problems.towerName' }];
      else if (seen.has(name.toLowerCase())) errors[`towers.${i}.name`] = [{ code: 'projects:problems.duplicateName' }];
      seen.add(name.toLowerCase());
      if (!(floors >= 1 && floors <= 60)) errors[`towers.${i}.floors`] = [{ code: 'projects:problems.floorCount' }];
      if (!(perFloor >= 1 && perFloor <= 20)) errors[`towers.${i}.unitsPerFloor`] = [{ code: 'projects:problems.unitsPerFloor' }];
      out.towers.push({ name, floors, unitsPerFloor: perFloor });
    });
  }
  if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
  return out;
}

const STEP_EVENT: Record<'basics' | 'site' | 'structure', ProjectSetupStep> = { basics: 'basics', site: 'site', structure: 'structure' };

// ---------------------------------------------------------------------------------------------------
// Project 360 tabs (register: 15 tabs; E.2 builds overview, leads, units, documents, activity)
// ---------------------------------------------------------------------------------------------------

const TAB_PLAN: Record<Project360Tab, { module: ModuleKey; gate?: string; permission?: Permission }> = {
  overview: { module: 'projects' },
  leads: { module: 'crm', permission: 'lead.view' },
  units: { module: 'inventory', permission: 'unit.view' },
  bookings: { module: 'sales', gate: 'E.5' },
  collections: { module: 'receivables', gate: 'E.6' },
  finance: { module: 'accounting', gate: 'E.7' },
  expenses: { module: 'payables', gate: 'E.8' },
  suppliers: { module: 'procurement', gate: 'E.9' },
  construction: { module: 'construction', gate: 'E.10' },
  handover: { module: 'handover', gate: 'E.11' },
  residents: { module: 'residents', gate: 'E-24' },
  maintenance: { module: 'maintenance', gate: 'E-24' },
  // E.13 owns documents; no project document exists in the demo fixtures yet.
  documents: { module: 'core', gate: 'E.13' },
  analytics: { module: 'reports', gate: 'E.12' },
  activity: { module: 'projects' },
};

function tabsFor(ctx: HandlerContext, siteId: string, projectId: string | null): Project360TabInfo[] {
  return PROJECT_360_TABS.map((id) => {
    const plan = TAB_PLAN[id];
    if (!licensedOnSite(ctx, plan.module, siteId)) return { id, state: 'not_in_plan' };
    if (plan.gate) return { id, state: 'planned', gate: plan.gate };
    if (plan.permission && projectId) {
      const visible = id === 'units' ? inventoryVisible(ctx, projectId) : leadVisible(ctx, projectId);
      if (!visible) return { id, state: 'no_permission' };
    }
    if (plan.permission && !projectId && !can(ctx, plan.permission, 'operational')) return { id, state: 'no_permission' };
    return { id, state: 'live' };
  });
}

function project360(ctx: HandlerContext, s: InventoryState, projectId: string): Project360 {
  const project = tenantProject(ctx, projectId);
  if (project) {
    if (!projectVisible(ctx, project.id)) notFound(ctx);
    const summary = projectSummary(ctx, s, project);
    const tabs = tabsFor(ctx, project.siteId, project.id);
    const live = liveHolds(ctx);
    const invOk = tabs.find((t) => t.id === 'units')!.state === 'live';
    const leadsOk = tabs.find((t) => t.id === 'leads')!.state === 'live';
    const leads = leadsOk ? ctx.demo.leads(ctx.data.leads).filter((l) => l.projectId === project.id) : [];
    const byStatus: Record<string, number> = {};
    for (const l of leads) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    return {
      project: summary,
      tabs,
      inventory: invOk ? groupRows(ctx, project, ctx.data.units.filter((u) => u.projectId === project.id).map((u) => factsOf(u, live))) : null,
      leads: leadsOk
        ? {
            items: [...leads]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((l) => ({ id: l.id, ref: l.ref, name: partyName(ctx, l.partyId), status: l.status, ownerName: ownerName(l.ownerPersonaId), budget: l.budget, createdAt: l.createdAt })),
            total: leads.length,
            byStatus,
          }
        : null,
      documents: { items: [], owner: 'E.13' },
      activity: s.events.filter((e) => e.projectId === project.id).map((e) => projectEvent(ctx, e)),
    };
  }
  const r = scopedSetup(ctx, s, projectId);
  if (r.state !== 'active') notFound(ctx);
  return {
    project: setupSummary(ctx, r),
    tabs: tabsFor(ctx, r.site!.siteId, null),
    inventory: [],
    leads: { items: [], total: 0, byStatus: {} },
    documents: { items: [], owner: 'E.13' },
    activity: s.events.filter((e) => e.projectId === r.id).map((e) => projectEvent(ctx, e)),
    setup: { id: r.id, ref: r.ref, state: r.state },
  };
}

// ---------------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------------

interface HoldResult {
  unitId: string;
  unitRef: string;
  until: string;
}

export const DEV_INVENTORY_HANDLERS: readonly Handler[] = [
  // ----- PRJ-001 projects list -----
  {
    method: 'GET',
    pattern: /^\/projects\/portfolio$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx): ProjectsPortfolio => {
      const s = inventoryState(ctx);
      const qy = query(ctx);
      const kind = oneOf(PROJECT_FILTERS, qy.kind) ?? 'all';
      const sort = oneOf(PROJECT_SORTS, qy.sort) ?? 'name';
      const city = text(qy.city, 60);
      const needle = text(qy.q, 60).toLowerCase();
      const all = [
        ...ctx.data.projects.filter((p) => ctx.allowsProject(p.id) && projectVisible(ctx, p.id)).map((p) => projectSummary(ctx, s, p)),
        ...visibleSetup(ctx, s).filter((r) => r.state === 'active').map((r) => setupSummary(ctx, r)),
      ];
      const counts = Object.fromEntries(PROJECT_FILTERS.map((f) => [f, f === 'all' ? all.length : all.filter((p) => p.kind === f).length])) as Record<ProjectFilter, number>;
      const items = all
        .filter((p) => kind === 'all' || p.kind === kind)
        .filter((p) => !city || p.city === city)
        .filter((p) => !needle || [p.name, p.ref, p.city, p.siteName].some((f) => f.toLowerCase().includes(needle)));
      const by: Record<ProjectSort, (a: (typeof items)[number], b: (typeof items)[number]) => number> = {
        name: (a, b) => a.name.localeCompare(b.name),
        units: (a, b) => (b.units?.total ?? -1) - (a.units?.total ?? -1),
        available: (a, b) => (b.units?.buckets.available ?? -1) - (a.units?.buckets.available ?? -1),
        sold: (a, b) => (b.units?.buckets.booked ?? -1) - (a.units?.buckets.booked ?? -1),
      };
      items.sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name));
      const withUnits = items.filter((p) => p.units);
      return {
        items,
        totals: { projects: items.length, units: withUnits.reduce((n, p) => n + p.units!.total, 0), buckets: withUnits.reduce((acc, p) => addBuckets(acc, p.units!.buckets), emptyBuckets()) },
        cities: [...new Set(all.map((p) => p.city).filter(Boolean))].sort(),
        counts,
        canSetUp: can(ctx, 'project.manage') && organisationWide(ctx),
        inSetup: visibleSetup(ctx, s).filter((r) => r.state !== 'active').length,
      };
    },
  },
  // ----- PRJ-003 project setup -----
  {
    method: 'GET',
    pattern: /^\/projects\/setup$/,
    access: requires('projects', ['project.view', 'project.manage', 'project.approve'], 'operational'),
    handle: (ctx): ProjectSetupList => {
      const s = inventoryState(ctx);
      return {
        items: visibleSetup(ctx, s)
          .map((r) => setupView(ctx, r))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        canCreate: can(ctx, 'project.manage') && organisationWide(ctx),
        canApprove: can(ctx, 'project.approve'),
        sites: setupSites(ctx),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/projects$/,
    access: requires('projects', 'project.manage', 'operational'),
    handle: (ctx): ProjectSetupRecord => {
      // 2. A new project has no id a narrower scope could name: only an organisation-wide scope may start one.
      if (!organisationWide(ctx)) problem(ctx, 403, 'out_of_scope_create', 'projects:problems.scopeCreate');
      const s = inventoryState(ctx);
      const input = { basics: body<{ basics: unknown }>(ctx).basics ?? null };
      const replay = replayOf<string>(ctx, s, 'project.create', ctx.tenantId ?? '', input);
      if (replay) return setupView(ctx, scopedSetup(ctx, s, replay));
      const basics = checkBasics(ctx, s, input.basics);
      const seq = nextSeq(s);
      const at = nowIso();
      const who = ctx.persona!;
      const r: SetupRecordState = {
        id: `psu_${seq}`,
        ref: `PS-${String(seq).padStart(3, '0')}`,
        state: 'draft',
        basics,
        site: null,
        structure: null,
        completed: ['basics'],
        makerPrincipal: who.principalId,
        makerName: who.displayName,
        createdAt: at,
        history: [{ at, action: 'created', byName: who.displayName, step: 'basics' }],
      };
      s.setup.push(r);
      addEvent(ctx, s, { kind: 'setup_created', projectId: r.id, setupId: r.id, setupRef: r.ref });
      remember(ctx, s, 'project.create', ctx.tenantId ?? '', input, r.id);
      saveState(ctx);
      return setupView(ctx, r);
    },
  },
  {
    method: 'GET',
    pattern: /^\/projects\/(?<id>[\w-]+)\/setup$/,
    access: requires('projects', ['project.view', 'project.manage', 'project.approve'], 'operational'),
    handle: (ctx): ProjectSetupRecord => setupView(ctx, scopedSetup(ctx, inventoryState(ctx), ctx.params.id)),
  },
  {
    method: 'POST',
    pattern: /^\/projects\/(?<id>[\w-]+)\/setup\/(?<step>[\w-]+)$/,
    access: requires('projects', 'project.manage', 'operational'),
    handle: (ctx): ProjectSetupRecord => {
      const s = inventoryState(ctx);
      const r = scopedSetup(ctx, s, ctx.params.id);
      const step = oneOf(['basics', 'site', 'structure'] as const, ctx.params.step);
      if (!step) notFound(ctx);
      const input = { step, value: body<{ value: unknown }>(ctx).value ?? null };
      const replay = replayOf<string>(ctx, s, 'project.save', r.id, input);
      if (replay) return setupView(ctx, r);
      if (r.state !== 'draft' && r.state !== 'returned') problem(ctx, 409, 'setup_locked', 'projects:problems.setupLocked');
      if (r.makerPrincipal !== ctx.persona?.principalId) problem(ctx, 403, 'not_maker', 'projects:problems.notMaker');
      if (step === 'basics') {
        const basics = checkBasics(ctx, s, input.value, r.id);
        // A change of kind invalidates a structure drawn for the other kind.
        const keepStructure = r.basics?.kind === basics.kind || (r.basics?.kind !== 'plots' && basics.kind !== 'plots');
        r.basics = basics;
        if (!keepStructure) {
          r.structure = null;
          r.completed = r.completed.filter((c) => c !== 'structure');
        }
      } else if (step === 'site') {
        const v = (input.value ?? {}) as Record<string, unknown>;
        const site = setupSites(ctx).find((x) => x.id === text(v.siteId, 60));
        if (!site) fieldProblem(ctx, 'siteId', 'projects:problems.site');
        const entity = text(v.legalEntityId, 60);
        if (entity && entity !== site.legalEntityId) fieldProblem(ctx, 'legalEntityId', 'projects:problems.entityFixed');
        r.site = { siteId: site.id, legalEntityId: site.legalEntityId };
      } else {
        if (!r.basics) fieldProblem(ctx, 'step', 'projects:problems.basicsFirst');
        r.structure = checkStructure(ctx, r.basics.kind, input.value);
      }
      if (!r.completed.includes(STEP_EVENT[step])) r.completed.push(STEP_EVENT[step]);
      r.history.push({ at: nowIso(), action: 'saved', byName: ctx.persona!.displayName, step });
      addEvent(ctx, s, { kind: 'setup_saved', projectId: r.id, setupId: r.id, setupRef: r.ref, note: step });
      remember(ctx, s, 'project.save', r.id, input, r.id);
      saveState(ctx);
      return setupView(ctx, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/projects\/(?<id>[\w-]+)\/submit$/,
    access: requires('projects', 'project.manage', 'operational'),
    handle: (ctx): ProjectSetupRecord => {
      const s = inventoryState(ctx);
      const r = scopedSetup(ctx, s, ctx.params.id);
      const replay = replayOf<string>(ctx, s, 'project.submit', r.id, {});
      if (replay) return setupView(ctx, r);
      if (r.state !== 'draft' && r.state !== 'returned') problem(ctx, 409, 'setup_locked', 'projects:problems.setupLocked');
      if (r.makerPrincipal !== ctx.persona?.principalId) problem(ctx, 403, 'not_maker', 'projects:problems.notMaker');
      const missing = (['basics', 'site', 'structure'] as const).filter((x) => !r.completed.includes(x));
      if (missing.length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', Object.fromEntries(missing.map((m) => [m, [{ code: `projects:problems.stepMissing.${m}` }]])));
      r.state = 'submitted';
      r.submittedAt = nowIso();
      delete r.returnReason;
      r.history.push({ at: r.submittedAt, action: 'submitted', byName: ctx.persona!.displayName });
      addEvent(ctx, s, { kind: 'setup_submitted', projectId: r.id, setupId: r.id, setupRef: r.ref });
      remember(ctx, s, 'project.submit', r.id, {}, r.id);
      saveState(ctx);
      return setupView(ctx, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/projects\/(?<id>[\w-]+)\/(?<decision>activate|return)$/,
    access: requires('projects', 'project.approve', 'operational'),
    handle: (ctx): ProjectSetupRecord => {
      const s = inventoryState(ctx);
      const r = scopedSetup(ctx, s, ctx.params.id);
      const activate = ctx.params.decision === 'activate';
      const reason = text(body<{ reason: string }>(ctx).reason, 400);
      const input = activate ? {} : { reason };
      const op = activate ? 'project.activate' : 'project.return';
      const replay = replayOf<string>(ctx, s, op, r.id, input);
      if (replay) return setupView(ctx, r);
      if (r.state !== 'submitted') problem(ctx, 409, 'setup_not_submitted', 'projects:problems.notSubmitted');
      // 5. Maker ≠ checker, by principal (never by name): nobody approves a project they prepared.
      if (r.makerPrincipal === ctx.persona?.principalId) problem(ctx, 403, 'separation_of_duties', 'projects:problems.ownRequest');
      if (!activate && (reason.length < 10 || reason.length > 300)) fieldProblem(ctx, 'reason', 'projects:problems.returnReason');
      const at = nowIso();
      const who = ctx.persona!;
      r.state = activate ? 'active' : 'returned';
      r.decidedAt = at;
      r.decidedBy = who.principalId;
      r.decidedByName = who.displayName;
      if (!activate) r.returnReason = reason;
      r.history.push({ at, action: activate ? 'activated' : 'returned', byName: who.displayName, ...(activate ? {} : { note: reason }) });
      addEvent(ctx, s, { kind: activate ? 'setup_activated' : 'setup_returned', projectId: r.id, setupId: r.id, setupRef: r.ref, ...(activate ? {} : { note: reason }) });
      remember(ctx, s, op, r.id, input, r.id);
      saveState(ctx);
      return setupView(ctx, r);
    },
  },
  // ----- PRJ-002 Project 360 (seeded projects and projects activated through setup) -----
  {
    method: 'GET',
    pattern: /^\/projects\/(?<id>[\w-]+)$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx): Project360 => project360(ctx, inventoryState(ctx), ctx.params.id!),
  },
  // ----- INV-001 unit matrix -----
  {
    method: 'GET',
    pattern: /^\/inventory\/matrix$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitMatrix => {
      const qy = query(ctx);
      const projects = listedProjects(ctx);
      // A tower or phase named without a project (the dashboard's inventory rows) opens its own project.
      const towerProject = qy.tower ? ctx.data.towers.find((t) => t.id === qy.tower)?.projectId : undefined;
      const blockRow = qy.block ? ctx.data.blocks.find((b) => (b.id === qy.block || b.label === qy.block) && (!qy.project || b.projectId === qy.project)) : undefined;
      const wanted = qy.project ?? towerProject ?? blockRow?.projectId;
      const project = wanted ? projects.find((p) => p.id === wanted) : projects[0];
      // Out of scope, unlicensed and unknown answer alike.
      if ((wanted || qy.tower || qy.block) && !project) notFound(ctx);
      if (qy.tower && towerProject !== project?.id) notFound(ctx);
      if (qy.block && blockRow?.projectId !== project?.id) notFound(ctx);
      const filters: MatrixFilters = {
        ...(qy.tower ? { tower: qy.tower } : {}),
        ...(blockRow ? { block: blockRow.label } : {}),
        ...(num(qy.floor) !== undefined ? { floor: num(qy.floor)! } : {}),
        ...(oneOf(UNIT_TYPES, qy.type) ? { type: oneOf(UNIT_TYPES, qy.type)! } : {}),
        ...(oneOf(AVAILABILITY_BUCKETS, qy.bucket) ? { bucket: oneOf(AVAILABILITY_BUCKETS, qy.bucket) as AvailabilityBucket } : {}),
        ...(oneOf(UNIT_DELIVERY_STATES, qy.delivery) ? { delivery: oneOf(UNIT_DELIVERY_STATES, qy.delivery) as UnitDeliveryState } : {}),
        ...(text(qy.q, 40) ? { q: text(qy.q, 40) } : {}),
        ...(num(qy.minPrice) !== undefined ? { minPrice: num(qy.minPrice)! } : {}),
        ...(num(qy.maxPrice) !== undefined ? { maxPrice: num(qy.maxPrice)! } : {}),
        ...(num(qy.minArea) !== undefined ? { minArea: num(qy.minArea)! } : {}),
        ...(num(qy.maxArea) !== undefined ? { maxArea: num(qy.maxArea)! } : {}),
      };
      return buildMatrix(ctx, inventoryState(ctx), project, projects, filters);
    },
  },
  // ----- INV-002 unit quick view, hold and release -----
  {
    method: 'GET',
    pattern: /^\/inventory\/units\/(?<unitId>[\w-]+)$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitInventoryDetail => {
      const unit = scopedUnit(ctx, ctx.params.unitId);
      return buildUnitDetail(ctx, inventoryState(ctx), unit);
    },
  },
  {
    method: 'GET',
    pattern: /^\/inventory\/units\/(?<unitId>[\w-]+)\/hold-leads$/,
    access: requires('sales', 'unit.hold', 'operational'),
    handle: (ctx): HoldLeadOption[] => {
      const unit = scopedUnit(ctx, ctx.params.unitId);
      const needle = text(query(ctx).q, 40).toLowerCase();
      return holdLeads(ctx, unit)
        .map((l) => ({ id: l.id, ref: l.ref, name: partyName(ctx, l.partyId), status: l.status }))
        .filter((l) => !needle || l.ref.toLowerCase().includes(needle) || l.name.toLowerCase().includes(needle))
        .slice(0, 50);
    },
  },
  {
    method: 'POST',
    pattern: /^\/inventory\/units\/(?<unitId>[\w-]+)\/hold$/,
    access: requires('sales', 'unit.hold', 'operational'),
    handle: (ctx): HoldResult => {
      const unit = scopedUnit(ctx, ctx.params.unitId);
      const s = inventoryState(ctx);
      const input = { leadId: text(body<{ leadId: string }>(ctx).leadId, 60) };
      const replay = replayOf<HoldResult>(ctx, s, 'unit.hold', unit.id, input);
      if (replay) return replay;
      // 4. State: one hold in force per unit, and only on available stock (no double allocation).
      if (factsOf(unit, liveHolds(ctx)).bucket !== 'available') problem(ctx, 409, 'unit_unavailable', 'projects:problems.unitUnavailable');
      // 5. The lead: an open lead of the unit's project the person may see; a hidden or invented id is refused alike.
      if (!input.leadId) fieldProblem(ctx, 'leadId', 'projects:problems.leadRequired');
      const lead = holdLeads(ctx, unit).find((l) => l.id === input.leadId);
      if (!lead) fieldProblem(ctx, 'leadId', 'projects:problems.leadNotEligible');
      const who = ctx.persona!;
      const until = holdUntil(requestNow(ctx.req));
      const record: HoldRecord = { leadId: lead.id, leadRef: lead.ref, until, principalId: who.principalId };
      ctx.demo.hold(unit.id, record);
      ctx.demo.addActivity(lead.id, { id: ctx.demo.nextId('act'), at: nowIso(), actorName: who.displayName, messageKey: 'activity.unitHeld', params: { unit: unit.ref, until }, kind: 'status' });
      addEvent(ctx, s, { kind: 'unit_held', projectId: unit.projectId, unitId: unit.id, unitRef: unit.ref, leadId: lead.id, leadRef: lead.ref, note: until });
      const result: HoldResult = { unitId: unit.id, unitRef: unit.ref, until };
      remember(ctx, s, 'unit.hold', unit.id, input, result);
      saveState(ctx);
      return result;
    },
  },
  {
    method: 'POST',
    pattern: /^\/inventory\/units\/(?<unitId>[\w-]+)\/release$/,
    access: requires('sales', 'unit.hold', 'operational'),
    handle: (ctx): { unitId: string; released: true } => {
      const unit = scopedUnit(ctx, ctx.params.unitId);
      const s = inventoryState(ctx);
      const replay = replayOf<{ unitId: string; released: true }>(ctx, s, 'unit.release', unit.id, {});
      if (replay) return replay;
      const hold = holdsOf(ctx)[unit.id];
      // Owner-only release (Issue #23): another person's hold, an expired, unknown or legacy hold answer alike.
      if (!mayRelease(hold, ctx.persona?.principalId, requestNow(ctx.req))) notFound(ctx);
      ctx.demo.release(unit.id);
      ctx.demo.addActivity(hold!.leadId, { id: ctx.demo.nextId('act'), at: nowIso(), actorName: ctx.persona!.displayName, messageKey: 'activity.unitReleased', params: { unit: unit.ref }, kind: 'status' });
      addEvent(ctx, s, { kind: 'unit_released', projectId: unit.projectId, unitId: unit.id, unitRef: unit.ref, leadId: hold!.leadId, leadRef: hold!.leadRef });
      const result = { unitId: unit.id, released: true as const };
      remember(ctx, s, 'unit.release', unit.id, {}, result);
      saveState(ctx);
      return result;
    },
  },
  // ----- INV-008 live availability -----
  {
    method: 'GET',
    pattern: /^\/inventory\/availability$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): AvailabilitySnapshot => {
      const qy = query(ctx);
      const projects = listedProjects(ctx);
      if (qy.project && !projects.some((p) => p.id === qy.project)) notFound(ctx);
      return buildAvailability(ctx, qy.project ? projects.filter((p) => p.id === qy.project) : projects);
    },
  },
  // ----- INV-010 storage inventory -----
  {
    method: 'GET',
    pattern: /^\/inventory\/storage$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): StorageList => {
      const qy = query(ctx);
      const projects = listedProjects(ctx);
      if (qy.project && !projects.some((p) => p.id === qy.project)) notFound(ctx);
      const ids = new Set((qy.project ? projects.filter((p) => p.id === qy.project) : projects).map((p) => p.id));
      const s = inventoryState(ctx);
      const status = oneOf(STORAGE_FILTERS, qy.status) ?? 'all';
      const needle = text(qy.q, 40).toLowerCase().replace(/[\s-]/g, '');
      const views = s.storage.filter((x) => ids.has(x.projectId)).map((x) => storageView(ctx, x));
      const searched = views.filter((v) => !needle || [v.ref, v.allocation?.unitRef ?? ''].some((f) => f.toLowerCase().replace(/[\s-]/g, '').includes(needle)));
      const counts = Object.fromEntries(STORAGE_FILTERS.map((f) => [f, f === 'all' ? searched.length : searched.filter((v) => v.state === f).length])) as Record<StorageFilter, number>;
      return {
        items: searched.filter((v) => status === 'all' || v.state === status),
        counts,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        canManage: can(ctx, 'storage.manage'),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/inventory\/storage\/(?<id>[\w-]+)\/targets$/,
    access: requires('inventory', 'storage.manage', 'operational'),
    handle: (ctx): StorageTarget[] => {
      const s = inventoryState(ctx);
      const st = scopedStorage(ctx, s, ctx.params.id);
      const needle = text(query(ctx).q, 40).toLowerCase().replace(/[\s-]/g, '');
      const allocated = new Map<string, number>();
      for (const x of s.storage) if (x.allocation) allocated.set(x.allocation.unitId, (allocated.get(x.allocation.unitId) ?? 0) + 1);
      return ctx.data.units
        .filter((u) => u.projectId === st.projectId && isSold(dimensionsOf(u.status)))
        .filter((u) => !needle || u.ref.toLowerCase().replace(/[\s-]/g, '').includes(needle))
        .slice(0, 60)
        .map((u) => ({ unitId: u.id, unitRef: u.ref, inventory: dimensionsOf(u.status).inventory, storage: allocated.get(u.id) ?? 0 }));
    },
  },
  {
    method: 'POST',
    pattern: /^\/inventory\/storage\/(?<id>[\w-]+)\/allocate$/,
    access: requires('inventory', 'storage.manage', 'operational'),
    handle: (ctx): StorageUnitView => {
      const s = inventoryState(ctx);
      const st = scopedStorage(ctx, s, ctx.params.id);
      const b = body<{ unitId: string; note: string }>(ctx);
      const input = { unitId: text(b.unitId, 60), note: text(b.note, 400) };
      const replay = replayOf<string>(ctx, s, 'storage.allocate', st.id, input);
      if (replay) return storageView(ctx, st);
      if (st.state !== 'available') problem(ctx, 409, 'storage_unavailable', 'projects:problems.storageUnavailable');
      if (!input.unitId) fieldProblem(ctx, 'unitId', 'projects:problems.unitRequired');
      const unit = ctx.data.units.find((u) => u.id === input.unitId);
      if (!unit || !inventoryVisible(ctx, unit.projectId)) fieldProblem(ctx, 'unitId', 'projects:problems.targetNotEligible');
      // Cross-project protection: storage of one project is never allocated to another project's unit.
      if (unit.projectId !== st.projectId) problem(ctx, 422, 'cross_project_forbidden', 'projects:problems.crossProject', { unitId: [{ code: 'projects:problems.sameProject' }] });
      if (!isSold(dimensionsOf(unit.status))) fieldProblem(ctx, 'unitId', 'projects:problems.notSold');
      if (input.note.length > 200) fieldProblem(ctx, 'note', 'projects:problems.noteLength');
      const at = nowIso();
      const who = ctx.persona!;
      st.state = 'allocated';
      st.allocation = { unitId: unit.id, at, byPrincipal: who.principalId, byName: who.displayName, ...(input.note ? { note: input.note } : {}) };
      st.history.push({ at, action: 'allocated', byPrincipal: who.principalId, byName: who.displayName, unitId: unit.id, ...(input.note ? { note: input.note } : {}) });
      addEvent(ctx, s, { kind: 'storage_allocated', projectId: st.projectId, unitId: unit.id, unitRef: unit.ref, storageId: st.id, storageRef: st.ref, ...(input.note ? { note: input.note } : {}) });
      remember(ctx, s, 'storage.allocate', st.id, input, st.id);
      saveState(ctx);
      return storageView(ctx, st);
    },
  },
  {
    method: 'POST',
    pattern: /^\/inventory\/storage\/(?<id>[\w-]+)\/release$/,
    access: requires('inventory', 'storage.manage', 'operational'),
    handle: (ctx): StorageUnitView => {
      const s = inventoryState(ctx);
      const st = scopedStorage(ctx, s, ctx.params.id);
      const input = { reason: text(body<{ reason: string }>(ctx).reason, 400) };
      const replay = replayOf<string>(ctx, s, 'storage.release', st.id, input);
      if (replay) return storageView(ctx, st);
      if (st.state !== 'allocated' || !st.allocation) problem(ctx, 409, 'storage_not_allocated', 'projects:problems.storageNotAllocated');
      if (input.reason.length < 5 || input.reason.length > 200) fieldProblem(ctx, 'reason', 'projects:problems.releaseReason');
      const at = nowIso();
      const who = ctx.persona!;
      const unitId = st.allocation.unitId;
      const unitRef = ctx.data.units.find((u) => u.id === unitId)?.ref ?? unitId;
      st.state = 'available';
      delete st.allocation;
      st.history.push({ at, action: 'released', byPrincipal: who.principalId, byName: who.displayName, unitId, note: input.reason });
      addEvent(ctx, s, { kind: 'storage_released', projectId: st.projectId, unitId, unitRef, storageId: st.id, storageRef: st.ref, note: input.reason });
      remember(ctx, s, 'storage.release', st.id, input, st.id);
      saveState(ctx);
      return storageView(ctx, st);
    },
  },
];
