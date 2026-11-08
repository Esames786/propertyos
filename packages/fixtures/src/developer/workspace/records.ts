import type { Invoice, Lead, LeasesList, LeaseSummary, ModuleKey, Party, Permission, RecordRef, RelatedGroup, SearchRecord, SuspensionClass, WorkspaceRecordType } from '@repo/contracts';
import { can, decideRecord, invoiceRecord, isScopeOnly, matches, projectRecord, unitPermitted, type HandlerContext } from '../../handler-types';
import { operationsSearch } from '../../operations';
import { HANDLERS } from '../../handlers';
import { decideEndpoint } from '../../mock-transport';
import { society, societyRecordAccess, societySearch } from '../../society/handlers';
import { directoryTenant } from '../../tenant-directory';

/**
 * Gate E.13 record registry, core part: one provider per kind of record that exists today. A
 * provider answers "may this reader open this record, and how is it shown?" with the SAME rule as
 * the record's own endpoint and `GET /access/record` (handlers.ts `recordAccess`): the tenant's own
 * data only, the module licence for the record's site, the permission, the person's data scope.
 * `resolve` returns null for an unknown id and for a hidden one alike, so nothing built on it can be
 * an id oracle; search, favourites, recent records, tasks, activity, related cards and documents all
 * go through it, so a revoked grant or a narrowed scope hides every one of them at once.
 *
 * Integration (Wave 1): the opportunity (E.1), project/unit/storage (E.2) and ledger (E.7) slices plug
 * their record kinds in by adding a `RecordProvider` to `PROVIDERS` in `registry.ts` (and the kind to
 * `WORKSPACE_RECORD_TYPES`); E.2's project and unit providers replace the two below.
 */
export interface RecordProvider {
  type: WorkspaceRecordType;
  /** The ids this provider answers for (by prefix). The first provider that owns an id decides it. */
  owns: (id: string) => boolean;
  resolve: (ctx: HandlerContext, id: string) => RecordRef | null;
  /** Whether the reader can search this kind at all (module, permission); hidden kinds are never offered. */
  searchable?: (ctx: HandlerContext) => boolean;
  /** Hits the reader may open, inside the header's project context, best first. */
  search?: (ctx: HandlerContext, q: string, limit: number) => RecordRef[];
  /** Records related to this one, each resolved for the reader. */
  related?: (ctx: HandlerContext, id: string) => RelatedGroup[];
  /** The reader may attach a document to it (the record kind's own change rule; E.0 adds write permissions). */
  attachable?: (ctx: HandlerContext, id: string) => boolean;
}

const as = (ctx: HandlerContext, suspension: SuspensionClass): HandlerContext => ({ ...ctx, suspension });

/** A project of this tenant that the person's scope covers and the shared rule allows for the module. */
export function projectAllows(ctx: HandlerContext, projectId: string | undefined, module: ModuleKey, permission?: Permission, suspension: SuspensionClass = 'operational'): boolean {
  if (!projectId || !ctx.data.projects.some((p) => p.id === projectId) || !isScopeOnly(ctx, projectId)) return false;
  return decideRecord(as(ctx, suspension), module, projectRecord(ctx, projectId), permission).allowed;
}

/** Lists follow the header's project context as well (records without a project always pass). */
export const inContext = (ctx: HandlerContext, ref: Pick<RecordRef, 'project'>) => !ref.project || !ctx.data.projects.some((p) => p.id === ref.project!.id) || ctx.allowsProject(ref.project.id);

const projectOf = (ctx: HandlerContext, projectId: string | undefined) => {
  const p = projectId ? ctx.data.projects.find((x) => x.id === projectId) : undefined;
  return p ? { id: p.id, name: p.name } : undefined;
};

/** Parties of this tenant, including the ones created in this demo session. */
function partyById(ctx: HandlerContext, id: string): Party | undefined {
  const own = ctx.data.parties.find((p) => p.id === id);
  if (own) return own;
  // Session parties (`pty_s<n>`) live in the CRM's section of the demo overlay.
  if (!/^pty_s\d+$/.test(id)) return undefined;
  return ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties.find((p) => p.id === id);
}

const leadsOf = (ctx: HandlerContext): Lead[] => ctx.demo.leads(ctx.data.leads);

// ---------------------------------------------------------------------------------------------
// Leads (CRM): `lead.view` in the lead's project (crm module), as GET /access/record decides
// ---------------------------------------------------------------------------------------------
const leadVisible = (ctx: HandlerContext, lead: Lead) => projectAllows(ctx, lead.projectId, 'crm', 'lead.view');

function leadRef(ctx: HandlerContext, lead: Lead): RecordRef {
  const party = partyById(ctx, lead.partyId);
  return {
    type: 'lead',
    id: lead.id,
    ref: lead.ref,
    title: party?.displayName ?? lead.ref,
    subtitleKey: `status:lead.${lead.status}`,
    href: `/backoffice/crm/lead-360-workspace?record=${lead.id}`,
    module: 'crm',
    ...(projectOf(ctx, lead.projectId) ? { project: projectOf(ctx, lead.projectId)! } : {}),
    favouritable: true,
  };
}

export const visibleLead = (ctx: HandlerContext, id: string): Lead | null => {
  const lead = leadsOf(ctx).find((l) => l.id === id);
  return lead && leadVisible(ctx, lead) ? lead : null;
};

// ---------------------------------------------------------------------------------------------
// Parties: seen through a lead or an invoice the reader may see (as the people directory does)
// ---------------------------------------------------------------------------------------------
function partyVisible(ctx: HandlerContext, partyId: string): boolean {
  if (!can(ctx, 'lead.view', 'operational') && !can(ctx, 'customer.view', 'operational')) return false;
  const viaLead = leadsOf(ctx).some((l) => l.partyId === partyId && projectAllows(ctx, l.projectId, 'core'));
  return viaLead || ctx.data.invoices.some((i) => i.partyId === partyId && projectAllows(ctx, i.projectId, 'core'));
}

function partyRef(ctx: HandlerContext, p: Party): RecordRef {
  const lead = leadsOf(ctx).find((l) => l.partyId === p.id && projectAllows(ctx, l.projectId, 'core'));
  const invoice = lead ? undefined : ctx.data.invoices.find((i) => i.partyId === p.id && projectAllows(ctx, i.projectId, 'core'));
  const project = projectOf(ctx, lead?.projectId ?? invoice?.projectId);
  return {
    type: 'party',
    id: p.id,
    ref: p.ref,
    title: p.displayName,
    subtitle: p.city,
    href: `/backoffice/cus/customer-360-workspace?record=${p.id}`,
    module: 'core',
    ...(project ? { project } : {}),
    favouritable: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Units (inventory, per site licence) and projects
// ---------------------------------------------------------------------------------------------
const unitVisible = (ctx: HandlerContext, unit: { projectId: string }) =>
  can(ctx, 'unit.view', 'operational') && unitPermitted(as(ctx, 'operational'), unit) && projectAllows(ctx, unit.projectId, 'inventory', 'unit.view');

function unitRef(ctx: HandlerContext, u: (typeof ctx.data.units)[number]): RecordRef {
  const held = ctx.demo.holds()[u.id];
  const tower = u.towerId ? ctx.data.towers.find((t) => t.id === u.towerId) : undefined;
  return {
    type: 'unit',
    id: u.id,
    ref: u.ref,
    title: u.ref,
    ...(tower ? { subtitle: tower.name } : u.block ? { subtitle: u.block } : {}),
    subtitleKey: `status:unit.${held ? 'held' : u.status}`,
    href: `/backoffice/inv/unit-360-workspace?record=${u.id}`,
    module: 'inventory',
    ...(projectOf(ctx, u.projectId) ? { project: projectOf(ctx, u.projectId)! } : {}),
    favouritable: true,
  };
}

const projectVisible = (ctx: HandlerContext, id: string) => projectAllows(ctx, id, 'projects', 'project.context.use');

function projectRefOf(ctx: HandlerContext, id: string): RecordRef {
  const p = ctx.data.projects.find((x) => x.id === id)!;
  return { type: 'project', id: p.id, ref: p.ref, title: p.name, subtitle: p.city, href: `/backoffice/prj/project-360-workspace?record=${p.id}`, module: 'projects', project: { id: p.id, name: p.name }, favouritable: true };
}

// ---------------------------------------------------------------------------------------------
// Developer invoices (financial history: readable while suspended)
// ---------------------------------------------------------------------------------------------
function invoiceVisible(ctx: HandlerContext, i: Invoice): boolean {
  const record = invoiceRecord(ctx, i);
  return !!record && isScopeOnly(ctx, i.projectId) && decideRecord(as(ctx, 'history_read'), 'receivables', record, 'invoice.view').allowed;
}

function invoiceRef(ctx: HandlerContext, i: Invoice): RecordRef {
  const unit = ctx.data.units.find((u) => u.id === i.unitId);
  return {
    type: 'invoice',
    id: i.id,
    ref: i.ref,
    title: i.ref,
    ...(unit ? { subtitle: unit.ref } : {}),
    href: `/backoffice/fin/invoice-workspace?record=${i.id}`,
    module: 'receivables',
    ...(projectOf(ctx, i.projectId) ? { project: projectOf(ctx, i.projectId)! } : {}),
    favouritable: true,
  };
}

const capped = <T>(items: T[], limit: number) => items.slice(0, limit);

// ---------------------------------------------------------------------------------------------
// Society records (Al-Noor): the society's own access rule (societyRecordAccess) and search
// ---------------------------------------------------------------------------------------------
const SOCIETY_ID = /^(pty_anr_|unt_anr_|cin_)/;

function societyRef(ctx: HandlerContext, id: string): RecordRef | null {
  if (!ctx.data.society || !SOCIETY_ID.test(id)) return null;
  const access = societyRecordAccess(ctx, id);
  if (!access?.record || !access.decision.allowed) return null;
  const s = society(ctx);
  const site = { id: s.siteId, name: directoryTenant(ctx.tenantId ?? '')?.sites.find((x) => x.id === s.siteId)?.name ?? s.siteId };
  if (id.startsWith('pty_anr_')) {
    const p = s.view.model.people.find((x) => x.id === id)!;
    return { type: 'party', id, ref: p.ref, title: p.displayName, subtitle: p.phone, href: `/backoffice/cus/customer-360-workspace?record=${id}`, module: 'core', project: site, favouritable: true };
  }
  if (id.startsWith('unt_anr_')) {
    const f = s.view.model.flats.find((x) => x.id === id)!;
    return { type: 'unit', id, ref: f.code, title: f.code, subtitle: s.view.model.buildings.find((b) => b.id === f.buildingId)?.name, href: `/backoffice/sites/${s.siteId}/units/${id}`, module: 'core', project: site, favouritable: true };
  }
  const i = s.view.invoices.find((x) => x.id === id)!;
  return { type: 'invoice', id, ref: i.ref, title: i.ref, subtitle: i.accountNo, href: `/backoffice/fin/invoice-workspace?record=${id}`, module: 'receivables', project: site, favouritable: true };
}

const fromSearch = (r: SearchRecord, module: ModuleKey, favouritable: boolean): RecordRef => ({
  type: r.type as WorkspaceRecordType,
  id: r.id,
  ref: r.ref,
  title: r.title,
  ...(r.subtitle ? { subtitle: r.subtitle } : {}),
  href: r.href,
  module,
  favouritable,
});

// ---------------------------------------------------------------------------------------------
// Rentals leases (S.3). Integration §5.2 keeps Rentals' records to Rentals: nothing outside its
// folder imports its state or views. Leases are therefore read through Rentals' own endpoint (its
// declared access checked first, exactly as the transport does), so Rentals alone decides which
// leases a person may see.
// ---------------------------------------------------------------------------------------------
function throughRoute<T>(ctx: HandlerContext, path: string, query: Record<string, string>): T | null {
  const handler = HANDLERS.find((h) => h.method === 'GET' && h.pattern.test(path));
  if (!handler || handler.access.kind !== 'tenant' || !ctx.access) return null;
  if (!decideEndpoint(ctx.access, handler.access, ctx.at).allowed) return null;
  try {
    return handler.handle({ ...ctx, suspension: handler.access.suspension, params: handler.pattern.exec(path)?.groups ?? {}, req: { method: 'GET', path, query } }) as T;
  } catch {
    // Rentals refused (no rentals site this person may see): like an unknown lease.
    return null;
  }
}

const leaseItem = (l: LeaseSummary): RecordRef => ({
  type: 'lease',
  id: l.id,
  ref: l.ref,
  title: `${l.unitCode} · ${l.tenantName}`,
  subtitle: l.siteName,
  href: `/backoffice/rentals/leases/${l.id}`,
  module: 'rentals',
  project: { id: l.siteId, name: l.siteName },
  favouritable: true,
});

const leases = (ctx: HandlerContext, q?: string) => throughRoute<LeasesList>(ctx, '/rentals/leases', { status: 'all', ...(q ? { q } : {}) })?.items ?? [];

function leaseRef(ctx: HandlerContext, id: string): RecordRef | null {
  if (!can(ctx, 'lease.view', 'history_read')) return null;
  const l = leases(ctx).find((x) => x.id === id);
  return l ? leaseItem(l) : null;
}

function leaseSearch(ctx: HandlerContext, q: string, limit: number): RecordRef[] {
  if (!can(ctx, 'lease.view', 'history_read')) return [];
  return capped(leases(ctx).filter((l) => matches(q, l.ref, l.tenantName, l.unitCode)).map(leaseItem), limit);
}

// ---------------------------------------------------------------------------------------------
// The providers
// ---------------------------------------------------------------------------------------------
export const CORE_PROVIDERS: readonly RecordProvider[] = [
  {
    type: 'party',
    owns: (id) => SOCIETY_ID.test(id) && id.startsWith('pty_anr_'),
    resolve: societyRef,
  },
  {
    type: 'unit',
    owns: (id) => id.startsWith('unt_anr_'),
    resolve: societyRef,
  },
  {
    type: 'invoice',
    owns: (id) => id.startsWith('cin_'),
    resolve: societyRef,
  },
  {
    type: 'lead',
    owns: (id) => id.startsWith('led_'),
    resolve: (ctx, id) => {
      const lead = visibleLead(ctx, id);
      return lead ? leadRef(ctx, lead) : null;
    },
    searchable: (ctx) => can(ctx, 'lead.view', 'operational'),
    search: (ctx, q, limit) =>
      capped(
        leadsOf(ctx)
          .filter((l) => ctx.allowsProject(l.projectId) && leadVisible(ctx, l))
          .map((l) => ({ l, party: partyById(ctx, l.partyId) }))
          .filter(({ l, party }) => matches(q, l.ref, party?.displayName, party?.phone))
          .map(({ l }) => leadRef(ctx, l)),
        limit,
      ),
    related: (ctx, id) => {
      const lead = visibleLead(ctx, id)!;
      const party = partyVisible(ctx, lead.partyId) ? partyById(ctx, lead.partyId) : undefined;
      const others = leadsOf(ctx).filter((l) => l.partyId === lead.partyId && l.id !== lead.id && leadVisible(ctx, l));
      return [
        ...(party ? [{ type: 'party' as const, relationKey: 'workspace:hub.related.rel.customer', items: [partyRef(ctx, party)], more: false }] : []),
        ...(projectVisible(ctx, lead.projectId) ? [{ type: 'project' as const, relationKey: 'workspace:hub.related.rel.project', items: [projectRefOf(ctx, lead.projectId)], more: false }] : []),
        ...(others.length ? [{ type: 'lead' as const, relationKey: 'workspace:hub.related.rel.otherLeads', items: others.slice(0, 5).map((l) => leadRef(ctx, l)), more: others.length > 5 }] : []),
      ];
    },
    // Today the CRM's own writes need `lead.view` in the lead's project (plan F-3; E.0 adds `lead.manage`).
    attachable: (ctx, id) => visibleLead(ctx, id) !== null,
  },
  {
    type: 'party',
    owns: (id) => id.startsWith('pty_'),
    resolve: (ctx, id) => {
      const p = partyById(ctx, id);
      return p && partyVisible(ctx, id) ? partyRef(ctx, p) : null;
    },
    searchable: (ctx) => can(ctx, 'lead.view', 'operational') || can(ctx, 'customer.view', 'operational'),
    search: (ctx, q, limit) => {
      const ids = new Set<string>();
      leadsOf(ctx).filter((l) => ctx.allowsProject(l.projectId)).forEach((l) => ids.add(l.partyId));
      ctx.data.invoices.filter((i) => ctx.allowsProject(i.projectId)).forEach((i) => ids.add(i.partyId));
      return capped(
        [...ids]
          .map((id) => partyById(ctx, id))
          .filter((p): p is Party => !!p && matches(q, p.displayName, p.ref, p.phone, p.cnic) && partyVisible(ctx, p.id))
          .map((p) => partyRef(ctx, p)),
        limit,
      );
    },
    related: (ctx, id) => {
      const leads = leadsOf(ctx).filter((l) => l.partyId === id && leadVisible(ctx, l));
      const invoices = ctx.data.invoices.filter((i) => i.partyId === id && invoiceVisible(ctx, i));
      return [
        ...(leads.length ? [{ type: 'lead' as const, relationKey: 'workspace:hub.related.rel.leads', items: leads.slice(0, 5).map((l) => leadRef(ctx, l)), more: leads.length > 5 }] : []),
        ...(invoices.length ? [{ type: 'invoice' as const, relationKey: 'workspace:hub.related.rel.invoices', items: invoices.slice(0, 5).map((i) => invoiceRef(ctx, i)), more: invoices.length > 5 }] : []),
      ];
    },
    attachable: (ctx, id) => partyVisible(ctx, id) && (can(ctx, 'customer.view', 'operational') || can(ctx, 'lead.view', 'operational')),
  },
  {
    type: 'unit',
    owns: (id) => id.startsWith('unt_') && !id.startsWith('unt_rb_'),
    resolve: (ctx, id) => {
      const u = ctx.data.units.find((x) => x.id === id);
      return u && unitVisible(ctx, u) ? unitRef(ctx, u) : null;
    },
    searchable: (ctx) => can(ctx, 'unit.view', 'operational'),
    search: (ctx, q, limit) => capped(ctx.data.units.filter((u) => ctx.allowsProject(u.projectId) && matches(q, u.ref) && unitVisible(ctx, u)).map((u) => unitRef(ctx, u)), limit),
    related: (ctx, id) => {
      const u = ctx.data.units.find((x) => x.id === id)!;
      const invoices = ctx.data.invoices.filter((i) => i.unitId === id && invoiceVisible(ctx, i));
      return [
        ...(projectVisible(ctx, u.projectId) ? [{ type: 'project' as const, relationKey: 'workspace:hub.related.rel.project', items: [projectRefOf(ctx, u.projectId)], more: false }] : []),
        ...(invoices.length ? [{ type: 'invoice' as const, relationKey: 'workspace:hub.related.rel.invoices', items: invoices.slice(0, 5).map((i) => invoiceRef(ctx, i)), more: invoices.length > 5 }] : []),
      ];
    },
    attachable: (ctx, id) => {
      const u = ctx.data.units.find((x) => x.id === id);
      return !!u && unitVisible(ctx, u);
    },
  },
  {
    type: 'project',
    owns: (id) => id.startsWith('prj_'),
    resolve: (ctx, id) => (projectVisible(ctx, id) ? projectRefOf(ctx, id) : null),
    searchable: (ctx) => can(ctx, 'project.context.use', 'operational'),
    search: (ctx, q, limit) => capped(ctx.data.projects.filter((p) => ctx.allowsProject(p.id) && matches(q, p.name, p.ref, p.city) && projectVisible(ctx, p.id)).map((p) => projectRefOf(ctx, p.id)), limit),
    attachable: (ctx, id) => projectVisible(ctx, id),
  },
  {
    type: 'invoice',
    owns: (id) => id.startsWith('inv_'),
    resolve: (ctx, id) => {
      const i = ctx.data.invoices.find((x) => x.id === id);
      return i && invoiceVisible(ctx, i) ? invoiceRef(ctx, i) : null;
    },
    searchable: (ctx) => can(ctx, 'invoice.view', 'history_read'),
    search: (ctx, q, limit) => capped(ctx.data.invoices.filter((i) => ctx.allowsProject(i.projectId) && matches(q, i.ref) && invoiceVisible(ctx, i)).map((i) => invoiceRef(ctx, i)), limit),
  },
  {
    type: 'lease',
    owns: (id) => id.startsWith('lse_'),
    resolve: leaseRef,
    searchable: (ctx) => can(ctx, 'lease.view', 'history_read'),
    search: leaseSearch,
  },
];

/** The first provider that owns the id decides it (null: unknown or hidden, the same answer). */
export function resolveWith(providers: readonly RecordProvider[], ctx: HandlerContext, id: string): RecordRef | null {
  if (!id || id.length > 80) return null;
  const provider = providers.find((p) => p.owns(id));
  return provider ? provider.resolve(ctx, id) : null;
}

export const resolveCore = (ctx: HandlerContext, id: string) => resolveWith(CORE_PROVIDERS, ctx, id);

/** The reader may attach a document to this (visible) record under its kind's own change rule. */
export function attachableCore(ctx: HandlerContext, id: string): boolean {
  const provider = CORE_PROVIDERS.find((p) => p.owns(id));
  return !!provider?.attachable && provider.resolve(ctx, id) !== null && provider.attachable(ctx, id);
}

/**
 * Search hits of the society and resident-operations modules, through their own search functions
 * (the same ones GLOBAL-001 uses). Society people, flats and invoices re-resolve by id; requests,
 * passes, vehicles and notices are found but not kept as favourites (no resolver yet).
 */
export function otherSearch(ctx: HandlerContext, q: string): RecordRef[] {
  const society = societySearch(ctx, q).map((r) => fromSearch(r, r.type === 'invoice' ? 'receivables' : 'core', SOCIETY_ID.test(r.id)));
  const ops = operationsSearch(ctx, q).map((r) => fromSearch(r, r.type === 'pass' ? 'visitors' : r.type === 'vehicle' ? 'parking' : r.type === 'notice' ? 'residents' : 'maintenance', false));
  return [...society, ...ops];
}
