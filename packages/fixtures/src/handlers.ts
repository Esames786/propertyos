import { ApiError, type AccessDecision, type ModuleKey, type Party, type Permission, type RecordAccess, type SearchRecord, type SearchResponse } from '@repo/contracts';
import { CRM_HANDLERS } from './crm-handlers';
import { buildDashboard } from './dashboard';
import { authorize, can, decideRecord, forbid, invoiceRecord, isScopeOnly, matches, projectRecord, requires, unitPermitted, visitor, type Handler, type HandlerContext } from './handler-types';
import { FINANCE_HANDLERS } from './finance-handlers';
import { MY_ACCESS_HANDLERS } from './my-access-handlers';
import { PLAN_HANDLERS } from './plan-handlers';
import { PORTAL_HANDLERS } from './portal-handlers';
import { COLLECTIONS_HANDLERS } from './society/collections-handlers';
import { DUES_PORTAL_HANDLERS } from './society/dues-portal-handlers';
import { SOCIETY_HANDLERS, societyRecordAccess, societySearch } from './society/handlers';
import { WORKSPACE_HANDLERS } from './workspace-handlers';
import { ADMIN_IDENTITY_HANDLERS } from './identity/admin-handlers';
import { APPEARANCE_HANDLERS } from './identity/appearance-handlers';
import { DATA_HANDLERS } from './identity/data-handlers';
import { HOUSEHOLD_HANDLERS } from './identity/household-handlers';
import { ME_HANDLERS } from './identity/me-handlers';
import { PORTAL_ACCESS_HANDLERS } from './identity/portal-access-handlers';

export type { Handler, HandlerAccess, HandlerContext } from './handler-types';

/** Notifications read in this page session, per tenant. */
const readNotifications = new Map<string, Set<string>>();
const readSet = (ctx: HandlerContext) => {
  const key = ctx.tenantId ?? '';
  if (!readNotifications.has(key)) readNotifications.set(key, new Set());
  return readNotifications.get(key)!;
};

/** Parties the persona may see: those linked to leads/invoices in permitted projects (incl. this demo session's). */
function visibleParties(ctx: HandlerContext): Party[] {
  if (!can(ctx, 'lead.view', 'operational') && !can(ctx, 'customer.view', 'operational')) return [];
  const ids = new Set<string>();
  ctx.demo.leads(ctx.data.leads).filter((l) => ctx.allowsProject(l.projectId)).forEach((l) => ids.add(l.partyId));
  ctx.data.invoices.filter((i) => ctx.allowsProject(i.projectId)).forEach((i) => ids.add(i.partyId));
  const sessionParties = ctx.demo.section<{ parties: Party[] }>('crm', () => ({ parties: [] })).parties;
  return [...sessionParties, ...ctx.data.parties].filter((p) => ids.has(p.id));
}

function partyResult(p: Party) {
  return { id: p.id, ref: p.ref, displayName: p.displayName, phone: p.phone, cnic: p.cnic, kind: p.kind };
}

/** The project a picker request names, refused when its site's inventory is not licensed. */
function inventoryProject(ctx: HandlerContext, projectId: string | undefined): void {
  if (projectId === undefined) return;
  if (!ctx.data.projects.some((p) => p.id === projectId) || !isScopeOnly(ctx, projectId)) forbid(ctx);
  authorize(ctx, 'inventory', projectRecord(ctx, projectId));
}

const OUT_OF_SCOPE: AccessDecision = { allowed: false, reason: 'out_of_scope' };

/**
 * Whether the signed-in person may open a record named in an address (`?record=…`), with the same
 * layers as the record's own endpoint: tenant (records of other organisations are simply not
 * found), site licence, permission and scope. Values that are not record ids (filters such as a
 * unit type) are not records and leave the decision to the screen's own access check.
 */
function recordAccess(ctx: HandlerContext, id: string): RecordAccess {
  const society = societyRecordAccess(ctx, id);
  if (society) return society;
  const d = ctx.data;
  const check = (module: ModuleKey, decision: AccessDecision): RecordAccess => ({ record: true, module, decision });
  const inventory = (projectId: string | undefined) => check('inventory', projectId ? decideRecord({ ...ctx, suspension: 'operational' }, 'inventory', projectRecord(ctx, projectId), 'unit.view') : OUT_OF_SCOPE);
  if (/^unt_/.test(id)) return inventory(d.units.find((u) => u.id === id)?.projectId);
  if (/^twr_/.test(id)) return inventory(d.towers.find((t) => t.id === id)?.projectId);
  if (/^blk_/.test(id)) return inventory(d.blocks.find((b) => b.id === id)?.projectId);
  if (/^flr_/.test(id)) return inventory(d.towers.find((t) => t.id === d.floors.find((f) => f.id === id)?.towerId)?.projectId);
  if (/^led_/.test(id)) {
    const lead = ctx.demo.leads(d.leads).find((l) => l.id === id);
    return check('crm', lead ? decideRecord({ ...ctx, suspension: 'operational' }, 'crm', projectRecord(ctx, lead.projectId), 'lead.view') : OUT_OF_SCOPE);
  }
  if (/^inv_/.test(id)) {
    // Financial history: readable while the organisation is suspended.
    const invoice = d.invoices.find((i) => i.id === id);
    const record = invoice ? invoiceRecord(ctx, invoice) : null;
    return check('receivables', record ? decideRecord({ ...ctx, suspension: 'history_read' }, 'receivables', record, 'invoice.view') : OUT_OF_SCOPE);
  }
  if (/^pty_/.test(id)) return check('core', visibleParties({ ...ctx, suspension: 'operational' }).some((p) => p.id === id) ? { allowed: true } : OUT_OF_SCOPE);
  if (/^prj_/.test(id)) return check('projects', d.projects.some((p) => p.id === id) ? decideRecord({ ...ctx, suspension: 'operational' }, 'projects', projectRecord(ctx, id), 'project.context.use') : OUT_OF_SCOPE);
  return { record: false };
}

/** Readers of the project structure: the header context, unit pickers and new-lead forms. */
const PROJECT_READERS: readonly Permission[] = ['project.context.use', 'unit.view', 'lead.create'];

const CORE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/projects$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx) => ctx.data.projects.filter((p) => isScopeOnly(ctx, p.id)),
  },
  {
    method: 'GET',
    pattern: /^\/projects\/(?<projectId>[\w-]+)\/towers$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx) => {
      if (!ctx.data.projects.some((p) => p.id === ctx.params.projectId) || !isScopeOnly(ctx, ctx.params.projectId!)) forbid(ctx);
      return ctx.data.towers.filter((t) => t.projectId === ctx.params.projectId);
    },
  },
  {
    method: 'GET',
    pattern: /^\/projects\/(?<projectId>[\w-]+)\/blocks$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx) => {
      if (!ctx.data.projects.some((p) => p.id === ctx.params.projectId) || !isScopeOnly(ctx, ctx.params.projectId!)) forbid(ctx);
      return ctx.data.blocks.filter((b) => b.projectId === ctx.params.projectId).map((b) => b.label);
    },
  },
  {
    method: 'GET',
    pattern: /^\/towers\/(?<towerId>[\w-]+)\/floors$/,
    access: requires('projects', PROJECT_READERS, 'operational'),
    handle: (ctx) => {
      const tower = ctx.data.towers.find((t) => t.id === ctx.params.towerId);
      if (!tower || !isScopeOnly(ctx, tower.projectId)) forbid(ctx);
      return ctx.data.floors.filter((f) => f.towerId === tower.id);
    },
  },
  {
    method: 'GET',
    pattern: /^\/units$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx) => {
      const { floorId, projectId, block, q } = ctx.req.query ?? {};
      // A picker naming one project or floor is refused outright when that site is not licensed.
      const floorProject = floorId === undefined ? undefined : ctx.data.towers.find((t) => t.id === ctx.data.floors.find((f) => f.id === floorId)?.towerId)?.projectId;
      if (floorId !== undefined && floorProject === undefined) forbid(ctx);
      inventoryProject(ctx, floorProject);
      inventoryProject(ctx, projectId === undefined ? undefined : String(projectId));
      const holds = ctx.demo.holds();
      return ctx.data.units
        .filter(
          (u) =>
            unitPermitted(ctx, u) &&
            (floorId === undefined || u.floorId === floorId) &&
            (projectId === undefined || u.projectId === projectId) &&
            (block === undefined || u.block === block) &&
            (q === undefined || matches(String(q), u.ref)),
        )
        .slice(0, 60)
        .map((u) => (holds[u.id] ? { ...u, status: 'held' as const } : u));
    },
  },
  {
    method: 'GET',
    pattern: /^\/parties$/,
    access: requires('core', ['customer.view', 'lead.view'], 'operational'),
    handle: (ctx) => {
      const q = String(ctx.req.query?.q ?? '').trim();
      const limit = Number(ctx.req.query?.limit ?? 20);
      const items = visibleParties(ctx).filter((p) => !q || matches(q, p.displayName, p.ref, p.phone, p.cnic, p.email));
      return { items: items.slice(0, limit).map(partyResult), total: items.length };
    },
  },
  {
    // Every member may search; each kind of result is filtered by its own permission, module, site
    // and suspension class (while suspended only financial history is found).
    method: 'GET',
    pattern: /^\/search$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): SearchResponse => {
      const q = String(ctx.req.query?.q ?? '').trim();
      if (q.length < 2) return { query: q, records: [] };
      const records: SearchRecord[] = [];
      const parties = visibleParties(ctx);
      for (const p of parties.filter((p) => matches(q, p.displayName, p.ref, p.phone, p.cnic)).slice(0, 5)) {
        records.push({ type: 'party', id: p.id, ref: p.ref, title: p.displayName, subtitle: p.phone, href: `/backoffice/cus/customer-360-workspace?record=${p.id}` });
      }
      if (can(ctx, 'lead.view', 'operational')) {
        for (const l of ctx.demo.leads(ctx.data.leads).filter((l) => ctx.allowsProject(l.projectId))) {
          const party = parties.find((p) => p.id === l.partyId);
          if (!party) continue;
          if (!matches(q, l.ref, party.displayName)) continue;
          records.push({ type: 'lead', id: l.id, ref: l.ref, title: party.displayName, subtitle: l.status, href: `/backoffice/crm/lead-360-workspace?record=${l.id}` });
          if (records.filter((r) => r.type === 'lead').length >= 5) break;
        }
      }
      if (can(ctx, 'unit.view', 'operational')) {
        const operational = { ...ctx, suspension: 'operational' as const };
        for (const u of ctx.data.units.filter((u) => ctx.allowsProject(u.projectId) && unitPermitted(operational, u) && matches(q, u.ref)).slice(0, 5)) {
          records.push({ type: 'unit', id: u.id, ref: u.ref, title: u.ref, subtitle: u.status, href: `/backoffice/inv/unit-360-workspace?record=${u.id}` });
        }
      }
      if (can(ctx, 'invoice.view', 'history_read')) {
        for (const i of ctx.data.invoices.filter((i) => ctx.allowsProject(i.projectId) && matches(q, i.ref)).slice(0, 5)) {
          records.push({ type: 'invoice', id: i.id, ref: i.ref, title: i.ref, subtitle: i.settlement, href: `/backoffice/fin/invoice-workspace?record=${i.id}` });
        }
      }
      records.push(...societySearch(ctx, q));
      return { query: q, records };
    },
  },
  {
    method: 'GET',
    pattern: /^\/access\/record$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): RecordAccess => recordAccess(ctx, String(ctx.req.query?.id ?? '')),
  },
  {
    method: 'GET',
    pattern: /^\/dashboard\/summary$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      if (ctx.persona?.app !== 'backoffice') forbid(ctx);
      return buildDashboard({
        data: ctx.data,
        can: (p) => can(ctx, p),
        allowsProject: ctx.allowsProject,
        inventoryOn: (projectId) => unitPermitted(ctx, { projectId }),
        constructionOn: (projectId) => decideRecord(ctx, 'construction', projectRecord(ctx, projectId)).allowed,
        range: ctx.req.query?.range,
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/notifications$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx) =>
      ctx.data.notifications.filter((n) => can(ctx, n.audience as Permission)).map((n) => ({
        ...n,
        read: n.read || readSet(ctx).has(n.id),
      })),
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/(?<id>[\w-]+)\/read$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      if (!ctx.data.notifications.some((n) => n.id === ctx.params.id && can(ctx, n.audience as Permission))) forbid(ctx);
      readSet(ctx).add(ctx.params.id!);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/read-all$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      ctx.data.notifications.filter((n) => can(ctx, n.audience as Permission)).forEach((n) => readSet(ctx).add(n.id));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/practice\/leads$/,
    access: requires('crm', 'lead.create', 'operational'),
    handle: (ctx) => {
      if (!ctx.req.training) {
        throw new ApiError({ status: 403, code: 'training_only', messageKey: 'errors:api.trainingOnly', correlationId: ctx.correlationId, changed: false });
      }
      const record = ctx.training.add('lead', (ctx.req.body ?? {}) as Record<string, unknown>);
      return { id: record.id, ref: `PRACTICE-${record.id.slice(4).padStart(3, '0')}`, training: true };
    },
  },
  {
    method: 'GET',
    pattern: /^\/practice\/records$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => ({ count: ctx.training.list().length }),
  },
  {
    method: 'POST',
    pattern: /^\/practice\/reset$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      if (!ctx.req.training) {
        throw new ApiError({ status: 403, code: 'training_only', messageKey: 'errors:api.trainingOnly', correlationId: ctx.correlationId, changed: false });
      }
      ctx.training.clear();
      return { ok: true };
    },
  },
  {
    // Prototype only: discards this browser tab's demo changes (every partition) and practice records.
    method: 'POST',
    pattern: /^\/demo\/reset$/,
    access: visitor('Resets the visitor’s own browser-session demo; reads and returns no records.'),
    handle: (ctx) => {
      ctx.resetDemo();
      return { ok: true };
    },
  },
];

/** Core endpoints first; feature modules own their routes. First match wins. */
export const HANDLERS: readonly Handler[] = [...CORE_HANDLERS, ...CRM_HANDLERS, ...FINANCE_HANDLERS, ...PORTAL_HANDLERS, ...PLAN_HANDLERS, ...MY_ACCESS_HANDLERS, ...WORKSPACE_HANDLERS, ...SOCIETY_HANDLERS, ...COLLECTIONS_HANDLERS, ...DUES_PORTAL_HANDLERS,
  // Gate D.1: identity, devices, portal access, households, data and privacy, organisation colours.
  ...ME_HANDLERS, ...ADMIN_IDENTITY_HANDLERS, ...PORTAL_ACCESS_HANDLERS, ...HOUSEHOLD_HANDLERS, ...DATA_HANDLERS, ...APPEARANCE_HANDLERS];
