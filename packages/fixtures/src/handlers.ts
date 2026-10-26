import {
  ApiError,
  type ApiRequest,
  type Party,
  type Permission,
  type Persona,
  type SearchRecord,
  type SearchResponse,
} from '@repo/contracts';
import { FLOORS, GARDEN_BLOCKS, PROJECTS, TOWERS, UNITS } from './inventory';
import { PARTIES } from './people';
import { INVOICES, LEAD_ACTIVITY, LEADS, NOTIFICATIONS } from './records';
import type { TrainingStore } from './training-store';

export interface HandlerContext {
  persona: Persona | undefined;
  allowsProject: (projectId: string) => boolean;
  correlationId: string;
  req: ApiRequest;
  params: Record<string, string>;
  training: TrainingStore;
}

interface Handler {
  method: ApiRequest['method'];
  pattern: RegExp;
  handle: (ctx: HandlerContext) => unknown;
}

const readNotifications = new Set<string>();

function can(ctx: HandlerContext, permission: Permission): boolean {
  return ctx.persona?.permissions.includes(permission) ?? false;
}

function forbid(ctx: HandlerContext): never {
  throw new ApiError({ status: 403, code: 'forbidden', messageKey: 'errors:api.forbidden', correlationId: ctx.correlationId, changed: false });
}

const norm = (s: string) => s.toLocaleLowerCase('en').replace(/[\s\-+]/g, '');

function matches(q: string, ...fields: Array<string | undefined>): boolean {
  const needle = norm(q);
  return fields.some((f) => f !== undefined && norm(f).includes(needle));
}

/** Parties the persona may see: those linked to leads/invoices in permitted projects. */
function visibleParties(ctx: HandlerContext): Party[] {
  if (!can(ctx, 'customer.view') && !can(ctx, 'lead.view')) return [];
  const ids = new Set<string>();
  LEADS.filter((l) => ctx.allowsProject(l.projectId)).forEach((l) => ids.add(l.partyId));
  INVOICES.filter((i) => ctx.allowsProject(i.projectId)).forEach((i) => ids.add(i.partyId));
  return PARTIES.filter((p) => ids.has(p.id));
}

function partyResult(p: Party) {
  return { id: p.id, ref: p.ref, displayName: p.displayName, phone: p.phone, cnic: p.cnic, kind: p.kind };
}

export const HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/projects$/,
    handle: (ctx) => PROJECTS.filter((p) => isScopeOnly(ctx, p.id)),
  },
  {
    method: 'GET',
    pattern: /^\/projects\/(?<projectId>[\w-]+)\/towers$/,
    handle: (ctx) => {
      if (!isScopeOnly(ctx, ctx.params.projectId!)) forbid(ctx);
      return TOWERS.filter((t) => t.projectId === ctx.params.projectId);
    },
  },
  {
    method: 'GET',
    pattern: /^\/projects\/(?<projectId>[\w-]+)\/blocks$/,
    handle: (ctx) => {
      if (!isScopeOnly(ctx, ctx.params.projectId!)) forbid(ctx);
      return ctx.params.projectId === 'prj_gardens' ? [...GARDEN_BLOCKS] : [];
    },
  },
  {
    method: 'GET',
    pattern: /^\/towers\/(?<towerId>[\w-]+)\/floors$/,
    handle: (ctx) => {
      const tower = TOWERS.find((t) => t.id === ctx.params.towerId);
      if (!tower || !isScopeOnly(ctx, tower.projectId)) forbid(ctx);
      return FLOORS.filter((f) => f.towerId === tower.id);
    },
  },
  {
    method: 'GET',
    pattern: /^\/units$/,
    handle: (ctx) => {
      if (!can(ctx, 'unit.view')) forbid(ctx);
      const { floorId, projectId, block, q } = ctx.req.query ?? {};
      return UNITS.filter(
        (u) =>
          isScopeOnly(ctx, u.projectId) &&
          (floorId === undefined || u.floorId === floorId) &&
          (projectId === undefined || u.projectId === projectId) &&
          (block === undefined || u.block === block) &&
          (q === undefined || matches(String(q), u.ref)),
      ).slice(0, 60);
    },
  },
  {
    method: 'GET',
    pattern: /^\/parties$/,
    handle: (ctx) => {
      const q = String(ctx.req.query?.q ?? '').trim();
      const limit = Number(ctx.req.query?.limit ?? 20);
      const items = visibleParties(ctx).filter((p) => !q || matches(q, p.displayName, p.ref, p.phone, p.cnic, p.email));
      return { items: items.slice(0, limit).map(partyResult), total: items.length };
    },
  },
  {
    method: 'GET',
    pattern: /^\/leads\/(?<leadId>[\w-]+)$/,
    handle: (ctx) => {
      const lead = LEADS.find((l) => l.id === ctx.params.leadId);
      if (!lead || !can(ctx, 'lead.view') || !ctx.allowsProject(lead.projectId)) forbid(ctx);
      return {
        lead,
        party: PARTIES.find((p) => p.id === lead.partyId),
        project: PROJECTS.find((p) => p.id === lead.projectId),
        activity: LEAD_ACTIVITY,
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/search$/,
    handle: (ctx): SearchResponse => {
      const q = String(ctx.req.query?.q ?? '').trim();
      if (q.length < 2) return { query: q, records: [] };
      const records: SearchRecord[] = [];
      for (const p of visibleParties(ctx).filter((p) => matches(q, p.displayName, p.ref, p.phone, p.cnic)).slice(0, 5)) {
        records.push({ type: 'party', id: p.id, ref: p.ref, title: p.displayName, subtitle: p.phone, href: `/backoffice/cus/customer-360-workspace?record=${p.id}` });
      }
      if (can(ctx, 'lead.view')) {
        for (const l of LEADS.filter((l) => ctx.allowsProject(l.projectId))) {
          const party = PARTIES.find((p) => p.id === l.partyId)!;
          if (!matches(q, l.ref, party.displayName)) continue;
          records.push({ type: 'lead', id: l.id, ref: l.ref, title: party.displayName, subtitle: l.status, href: `/backoffice/crm/lead-360-workspace?record=${l.id}` });
          if (records.filter((r) => r.type === 'lead').length >= 5) break;
        }
      }
      if (can(ctx, 'unit.view')) {
        for (const u of UNITS.filter((u) => ctx.allowsProject(u.projectId) && matches(q, u.ref)).slice(0, 5)) {
          records.push({ type: 'unit', id: u.id, ref: u.ref, title: u.ref, subtitle: u.status, href: `/backoffice/inv/unit-360-workspace?record=${u.id}` });
        }
      }
      if (can(ctx, 'invoice.view')) {
        for (const i of INVOICES.filter((i) => ctx.allowsProject(i.projectId) && matches(q, i.ref)).slice(0, 5)) {
          records.push({ type: 'invoice', id: i.id, ref: i.ref, title: i.ref, subtitle: i.settlement, href: `/backoffice/fin/invoice-workspace?record=${i.id}` });
        }
      }
      return { query: q, records };
    },
  },
  {
    method: 'GET',
    pattern: /^\/notifications$/,
    handle: (ctx) =>
      NOTIFICATIONS.filter((n) => can(ctx, n.audience as Permission)).map((n) => ({
        ...n,
        read: n.read || readNotifications.has(n.id),
      })),
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/(?<id>[\w-]+)\/read$/,
    handle: (ctx) => {
      readNotifications.add(ctx.params.id!);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/read-all$/,
    handle: (ctx) => {
      NOTIFICATIONS.filter((n) => can(ctx, n.audience as Permission)).forEach((n) => readNotifications.add(n.id));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/practice\/leads$/,
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
    handle: (ctx) => ({ count: ctx.training.list().length }),
  },
  {
    method: 'POST',
    pattern: /^\/practice\/reset$/,
    handle: (ctx) => {
      if (!ctx.req.training) {
        throw new ApiError({ status: 403, code: 'training_only', messageKey: 'errors:api.trainingOnly', correlationId: ctx.correlationId, changed: false });
      }
      ctx.training.clear();
      return { ok: true };
    },
  },
];

/** Project visible by persona scope, ignoring the header project filter (for pickers). */
function isScopeOnly(ctx: HandlerContext, projectId: string): boolean {
  const scope = ctx.persona?.projectScope ?? [];
  return scope === 'all' || scope.includes(projectId);
}
