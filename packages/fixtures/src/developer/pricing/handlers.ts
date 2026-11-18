import type { PlanPreview, UnitPriceHistory, UnitPricePickerItem, UnitPricePickerResponse } from '@repo/contracts';
import { invalid, matches, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { calculatePlanPreview, InvalidPlanError } from './calculator';
import { projectVisible } from '../scope';

/**
 * INV-006: read the fictional seed's *current listed price*, not an invented
 * price-version ledger. Historical price changes are intentionally empty until
 * E.3's pricing approvals and the immutable version store have been accepted.
 *
 * The same effective inventory/site/project access is evaluated on every request.
 * Lists return only visible records/counts. Named hidden and unknown ids are 404.
 * No demo section is opened or written on these read endpoints.
 */
const NEED = { module: 'inventory', permission: 'unit.view' } as const;
const isDeveloper = (ctx: HandlerContext) => ctx.access?.tenant.type === 'developer';

function item(ctx: HandlerContext, unit: HandlerContext['data']['units'][number]): UnitPricePickerItem {
  const project = ctx.data.projects.find((p) => p.id === unit.projectId)!;
  return {
    id: unit.id,
    ref: unit.ref,
    projectId: project.id,
    projectName: project.name,
    currentListedPrice: { ...unit.price },
  };
}

function visible(ctx: HandlerContext) {
  if (!isDeveloper(ctx)) return [];
  return ctx.data.units.filter((u) => projectVisible(ctx, u.projectId, NEED));
}

export const PRICE_HISTORY_HANDLERS: readonly Handler[] = [
  {
    // A pure preview, not a business create. No sequence, audit, finance or
    // demo-state writes. Both pricing.manage and unit.view must permit the unit.
    method: 'POST',
    pattern: /^\/pricing\/plan-preview$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PlanPreview => {
      const body = ctx.req.body;
      const unitId = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).unitId
        : undefined;
      const unit = typeof unitId === 'string' ? visible(ctx).find((u) => u.id === unitId) : undefined;
      if (!unit || !projectVisible(ctx, unit.projectId, { module: 'inventory', permission: 'pricing.manage' })) notFound(ctx);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => !['unitId', 'allocations'].includes(key))) invalid(ctx, 'allocations');
      const requested = (body as Record<string, unknown>).allocations;
      let calculated: ReturnType<typeof calculatePlanPreview>;
      try {
        calculated = calculatePlanPreview(unit.price, requested);
      } catch (error) {
        if (error instanceof InvalidPlanError) invalid(ctx, 'allocations');
        throw error;
      }
      return {
        unit: item(ctx, unit),
        totalPrice: { ...unit.price },
        ...calculated,
        totalShareBps: 10000,
        previewOnly: true,
        postingAllowed: false,
        priceSource: 'fictional_seed',
        policyStatus: 'not_approved',
        hasScheduledDates: false,
      };
    },
  },

  {
    method: 'GET',
    pattern: /^\/pricing\/units$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitPricePickerResponse => {
      const q = String(ctx.req.query?.q ?? '').trim().slice(0, 100);
      const projectId = ctx.req.query?.project;
      const items = visible(ctx)
        .filter((u) => (projectId === undefined || u.projectId === String(projectId)) &&
          (!q || matches(q, u.ref, ctx.data.projects.find((p) => p.id === u.projectId)?.name)))
        .map((u) => item(ctx, u));
      // Total and pagination describe only authorized, currently-visible units.
      return { items: items.slice(0, 60), total: items.length };
    },
  },
  {
    method: 'GET',
    pattern: /^\/units\/(?<unitId>[\w-]+)\/prices$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitPriceHistory => {
      const unit = visible(ctx).find((u) => u.id === ctx.params.unitId);
      if (!unit) notFound(ctx);
      const row = item(ctx, unit);
      return {
        unit: row,
        baseline: { price: { ...unit.price }, source: 'fictional_seed', dateKnown: false },
        revisions: [],
        canEdit: false,
        recordState: 'baseline_only',
      };
    },
  },
];
